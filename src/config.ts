import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname, normalize } from 'path';

export interface ServerConfig {
    id: string;
    name: string;
    host: string;
    port: number;
    username: string;
    password?: string;
    privateKeyPath?: string;
    passphrase?: string;
    defaultRemoteDir: string;
    workspaces: string[];
}

export interface Config {
    servers: ServerConfig[];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let cachedConfig: Config | null = null;

// Parse CLI args like --host, --username, --password, --key, etc.
function parseCliServers(): ServerConfig[] {
    const args = process.argv.slice(2);
    const servers: ServerConfig[] = [];
    let current: Partial<ServerConfig> | null = null;

    function flushCurrent() {
        if (current?.host && current?.username) {
            servers.push({
                id: current.id || 'default',
                name: current.name || `${current.username}@${current.host}`,
                host: current.host,
                port: current.port || 22,
                username: current.username,
                password: current.password,
                privateKeyPath: current.privateKeyPath,
                passphrase: current.passphrase,
                defaultRemoteDir: current.defaultRemoteDir || `/home/${current.username}`,
                workspaces: current.workspaces || [],
            });
        }
    }

    function getVal(i: number): string | undefined {
        return i + 1 < args.length ? args[i + 1] : undefined;
    }

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        const val = getVal(i);

        switch (arg) {
            case '--host':
                // Each --host starts a new server block
                if (current) flushCurrent();
                current = { host: val };
                i++; break;
            case '--port':
                if (!current) current = {};
                current.port = val ? parseInt(val, 10) : 22;
                i++; break;
            case '--username': case '--user':
                if (!current) current = {};
                current.username = val;
                i++; break;
            case '--password': case '--pass':
                if (!current) current = {};
                current.password = val;
                i++; break;
            case '--key': case '--private-key':
                if (!current) current = {};
                current.privateKeyPath = val;
                i++; break;
            case '--passphrase':
                if (!current) current = {};
                current.passphrase = val;
                i++; break;
            case '--id':
                if (!current) current = {};
                current.id = val;
                i++; break;
            case '--name':
                if (!current) current = {};
                current.name = val;
                i++; break;
            case '--remote-dir':
                if (!current) current = {};
                current.defaultRemoteDir = val;
                i++; break;
            case '--workspace':
                if (!current) current = {};
                if (!current.workspaces) current.workspaces = [];
                if (val) current.workspaces.push(val);
                i++; break;
        }
    }

    flushCurrent();
    return servers;
}

// Also check env vars for single-server inline config
function parseEnvServer(): ServerConfig | null {
    const host = process.env.SSH_HOST;
    const username = process.env.SSH_USER || process.env.SSH_USERNAME;
    if (!host || !username) return null;

    return {
        id: process.env.SSH_ID || 'default',
        name: process.env.SSH_NAME || `${username}@${host}`,
        host,
        port: parseInt(process.env.SSH_PORT || '22', 10),
        username,
        password: process.env.SSH_PASSWORD || process.env.SSH_PASS,
        privateKeyPath: process.env.SSH_KEY || process.env.SSH_PRIVATE_KEY,
        passphrase: process.env.SSH_PASSPHRASE,
        defaultRemoteDir: process.env.SSH_REMOTE_DIR || `/home/${username}`,
        workspaces: process.env.SSH_WORKSPACE ? [process.env.SSH_WORKSPACE] : [],
    };
}

export function loadConfig(): Config {
    if (cachedConfig) return cachedConfig;

    const inlineServers: ServerConfig[] = [];

    // Priority 1: CLI args
    const cliServers = parseCliServers();
    inlineServers.push(...cliServers);

    // Priority 2: Env vars (single server)
    if (inlineServers.length === 0) {
        const envServer = parseEnvServer();
        if (envServer) inlineServers.push(envServer);
    }

    // If we have inline servers, use them (skip file)
    if (inlineServers.length > 0) {
        for (const srv of inlineServers) {
            srv.workspaces = (srv.workspaces || []).map(w => normalize(w).toLowerCase());
        }
        cachedConfig = { servers: inlineServers };
        return cachedConfig;
    }

    // Priority 3: Config file
    let configPath = process.env.SSH_MCP_CONFIG;

    if (!configPath) {
        const cwdConfig = resolve(process.cwd(), 'ssh-servers.json');
        try {
            if (readFileSync(cwdConfig)) configPath = cwdConfig;
        } catch { }
    }

    if (!configPath) {
        configPath = resolve(__dirname, '..', 'ssh-servers.json');
    }

    try {
        const raw = readFileSync(configPath, 'utf-8');
        const parsed = JSON.parse(raw) as Config;

        if (!parsed.servers || !Array.isArray(parsed.servers)) {
            throw new Error('Config must have a "servers" array');
        }

        for (const srv of parsed.servers) {
            if (!srv.id || !srv.host || !srv.username) {
                throw new Error(`Server "${srv.id || 'unknown'}" missing required fields (id, host, username)`);
            }
            srv.port = srv.port || 22;
            srv.defaultRemoteDir = srv.defaultRemoteDir || '/home/' + srv.username;
            srv.workspaces = (srv.workspaces || []).map(w => normalize(w).toLowerCase());
        }

        cachedConfig = parsed;
        return parsed;
    } catch (err: any) {
        if (err.code === 'ENOENT') {
            throw new Error(`No servers configured. Pass --host/--username args, set SSH_HOST/SSH_USER env vars, or create ssh-servers.json.`);
        }
        throw new Error(`Failed to load config: ${err.message}`);
    }
}

export function getServer(serverId: string): ServerConfig {
    const config = loadConfig();
    const srv = config.servers.find(s => s.id === serverId);
    if (!srv) {
        const available = config.servers.map(s => `"${s.id}" (${s.name})`).join(', ');
        throw new Error(`Server "${serverId}" not found. Available: ${available}`);
    }
    return srv;
}

export function findServerByWorkspace(localPath?: string): ServerConfig | null {
    if (!localPath) return null;
    const config = loadConfig();
    const normalizedPath = normalize(localPath).toLowerCase();

    let bestMatch: ServerConfig | null = null;
    let bestLen = 0;

    for (const srv of config.servers) {
        for (const ws of srv.workspaces) {
            if (normalizedPath.startsWith(ws) && ws.length > bestLen) {
                bestMatch = srv;
                bestLen = ws.length;
            }
        }
    }

    return bestMatch;
}

export function listServers(): Array<{ id: string; name: string; host: string; workspaces: string[] }> {
    const config = loadConfig();
    return config.servers.map(s => ({
        id: s.id,
        name: s.name,
        host: s.host,
        workspaces: s.workspaces,
    }));
}
