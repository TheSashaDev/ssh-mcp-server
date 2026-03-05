import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname, normalize, sep } from 'path';

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

export function loadConfig(): Config {
    if (cachedConfig) return cachedConfig;

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
            throw new Error(`Config file not found at ${configPath}. Create ssh-servers.json with your server definitions.`);
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
