import { Client, type ConnectConfig, type SFTPWrapper } from 'ssh2';
import { readFileSync } from 'fs';
import { getServer, type ServerConfig } from './config.js';

interface PooledConnection {
    client: Client;
    config: ServerConfig;
    lastUsed: number;
    connected: boolean;
    sftp: SFTPWrapper | null;  // Cached SFTP session
    sftpPending: Promise<SFTPWrapper> | null; // Dedup concurrent SFTP requests
}

const pool = new Map<string, PooledConnection>();
const pendingConnections = new Map<string, Promise<Client>>(); // Dedup concurrent connect requests

const CONNECTION_TIMEOUT = 10000;
const KEEPALIVE_INTERVAL = 15000;
const IDLE_TIMEOUT = 300000;

/**
 * Get or create an SSH connection. Deduplicates concurrent requests for the same server.
 */
export async function getConnection(serverId: string): Promise<Client> {
    const existing = pool.get(serverId);
    if (existing?.connected) {
        existing.lastUsed = Date.now();
        return existing.client;
    }

    // Dedup: if a connection is already being established, wait for it
    const pending = pendingConnections.get(serverId);
    if (pending) return pending;

    const promise = createConnection(serverId);
    pendingConnections.set(serverId, promise);
    try {
        return await promise;
    } finally {
        pendingConnections.delete(serverId);
    }
}

async function createConnection(serverId: string): Promise<Client> {
    // Cleanup old
    const old = pool.get(serverId);
    if (old) {
        old.sftp = null;
        old.sftpPending = null;
        try { old.client.end(); } catch { }
        pool.delete(serverId);
    }

    const serverConfig = getServer(serverId);
    const client = new Client();

    const connectConfig: ConnectConfig = {
        host: serverConfig.host,
        port: serverConfig.port,
        username: serverConfig.username,
        readyTimeout: CONNECTION_TIMEOUT,
        keepaliveInterval: KEEPALIVE_INTERVAL,
        keepaliveCountMax: 5,
        algorithms: {
            // Prefer fast ciphers
            cipher: ['aes128-gcm@openssh.com', 'aes256-gcm@openssh.com', 'aes128-ctr', 'aes192-ctr', 'aes256-ctr'],
            // Prefer fast key exchange
            kex: ['curve25519-sha256', 'curve25519-sha256@libssh.org', 'ecdh-sha2-nistp256', 'ecdh-sha2-nistp384', 'diffie-hellman-group14-sha256'],
        },
    };

    if (serverConfig.privateKeyPath) {
        try {
            connectConfig.privateKey = readFileSync(serverConfig.privateKeyPath);
        } catch (err: any) {
            throw new Error(`Cannot read private key "${serverConfig.privateKeyPath}": ${err.message}`);
        }
        if (serverConfig.passphrase) connectConfig.passphrase = serverConfig.passphrase;
    } else if (serverConfig.password) {
        connectConfig.password = serverConfig.password;
    } else {
        connectConfig.agent = process.env.SSH_AUTH_SOCK;
    }

    return new Promise<Client>((resolve, reject) => {
        const timeout = setTimeout(() => {
            client.end();
            reject(new Error(`Connection to "${serverId}" timed out (${CONNECTION_TIMEOUT}ms)`));
        }, CONNECTION_TIMEOUT + 2000);

        client.on('ready', () => {
            clearTimeout(timeout);
            pool.set(serverId, { client, config: serverConfig, lastUsed: Date.now(), connected: true, sftp: null, sftpPending: null });
            resolve(client);
        });

        client.on('error', (err) => {
            clearTimeout(timeout);
            const p = pool.get(serverId);
            if (p) { p.connected = false; p.sftp = null; p.sftpPending = null; }
            reject(new Error(`SSH error "${serverId}": ${err.message}`));
        });

        client.on('close', () => {
            const p = pool.get(serverId);
            if (p) { p.connected = false; p.sftp = null; p.sftpPending = null; }
        });

        client.on('end', () => {
            const p = pool.get(serverId);
            if (p) { p.connected = false; p.sftp = null; p.sftpPending = null; }
        });

        client.connect(connectConfig);
    });
}

/**
 * Get cached SFTP session or create one. Deduplicates concurrent requests.
 */
export async function getSftp(serverId: string): Promise<SFTPWrapper> {
    await getConnection(serverId); // Ensure connected
    const pooled = pool.get(serverId)!;

    // Return cached
    if (pooled.sftp) {
        pooled.lastUsed = Date.now();
        return pooled.sftp;
    }

    // Dedup concurrent SFTP requests
    if (pooled.sftpPending) return pooled.sftpPending;

    const promise = new Promise<SFTPWrapper>((resolve, reject) => {
        pooled.client.sftp((err, sftp) => {
            if (err) {
                pooled.sftpPending = null;
                reject(new Error(`SFTP failed "${serverId}": ${err.message}`));
            } else {
                pooled.sftp = sftp;
                pooled.sftpPending = null;
                pooled.lastUsed = Date.now();

                // Clear cache if SFTP session closes
                sftp.on('close', () => { pooled.sftp = null; });
                sftp.on('end', () => { pooled.sftp = null; });

                resolve(sftp);
            }
        });
    });

    pooled.sftpPending = promise;
    return promise;
}

export function closeAll(): void {
    for (const [, p] of pool) {
        try { p.client.end(); } catch { }
    }
    pool.clear();
}

export function disconnect(serverId: string): void {
    const p = pool.get(serverId);
    if (p) {
        try { p.client.end(); } catch { }
        pool.delete(serverId);
    }
}

// Idle cleanup
setInterval(() => {
    const now = Date.now();
    for (const [id, p] of pool) {
        if (now - p.lastUsed > IDLE_TIMEOUT) {
            try { p.client.end(); } catch { }
            pool.delete(id);
        }
    }
}, 60000).unref();

process.on('exit', closeAll);
process.on('SIGINT', () => { closeAll(); process.exit(0); });
process.on('SIGTERM', () => { closeAll(); process.exit(0); });
