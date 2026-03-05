#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadConfig, findServerByWorkspace } from './config.js';
import { executeCommand } from './tools/execute.js';
import { uploadFile } from './tools/upload.js';
import { downloadFile } from './tools/download.js';
import { closeAll } from './ssh-manager.js';

const server = new McpServer(
    { name: 'ssh-mcp-server', version: '1.0.0' },
    { capabilities: { tools: {}, resources: {} } }
);

function resolveServerId(serverId?: string, workspace?: string): string {
    if (serverId) return serverId;
    const config = loadConfig();
    if (workspace) {
        const srv = findServerByWorkspace(workspace);
        if (srv) return srv.id;
    }
    if (config.servers.length === 1) return config.servers[0].id;
    throw new Error(`Multiple servers configured. Use ssh_servers tool to see available servers, then pass server_id.`);
}

// ---- ssh_servers ----
server.tool(
    'ssh_servers',
    'List all configured SSH servers with their IDs, hosts, and workspace bindings. Call this first to discover which server_id to use with other SSH tools.',
    {},
    async () => {
        try {
            const config = loadConfig();
            const lines = config.servers.map(s => {
                const ws = s.workspaces.length > 0 ? s.workspaces.join(', ') : 'none';
                return `id=${s.id} | ${s.name} | ${s.host}:${s.port} | user=${s.username} | remote_default=${s.defaultRemoteDir} | workspaces: ${ws}`;
            });
            return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
        } catch (err: any) {
            return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }], isError: true };
        }
    }
);

// ---- ssh_execute ----
server.tool(
    'ssh_execute',
    `Run a shell command on a remote SSH server. Output is auto-cleaned (no ANSI, no binary garbage).

Sync mode (default): returns stdout, stderr, exit code.
Async mode (async=true): returns command_id immediately. Call again with command_id to poll status/output.`,
    {
        server_id: z.string().optional().describe('Server ID. Auto-detected if one server or matched by workspace.'),
        workspace: z.string().optional().describe('Local directory for auto-selecting server.'),
        command: z.string().optional().describe('Shell command. Required unless polling via command_id.'),
        cwd: z.string().optional().describe('Remote working directory.'),
        timeout_ms: z.number().optional().default(30000).describe('Timeout in ms. 0=no limit.'),
        async: z.boolean().optional().default(false).describe('Start in background, return command_id.'),
        command_id: z.string().optional().describe('Poll async command status. Other params ignored when set.'),
    },
    async (params) => {
        try {
            if (params.command_id) {
                return { content: [{ type: 'text' as const, text: await executeCommand({ serverId: '', command: '', commandId: params.command_id }) }] };
            }
            if (!params.command) {
                return { content: [{ type: 'text' as const, text: 'Error: command is required unless polling with command_id.' }], isError: true };
            }
            const serverId = resolveServerId(params.server_id, params.workspace);
            const result = await executeCommand({ serverId, command: params.command, cwd: params.cwd, timeoutMs: params.timeout_ms, async: params.async });
            return { content: [{ type: 'text' as const, text: result }] };
        } catch (err: any) {
            return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }], isError: true };
        }
    }
);

// ---- ssh_upload ----
server.tool(
    'ssh_upload',
    'Upload a local file to a remote SSH server. Handles any file type/size. Remote directories created automatically. Paths with spaces are safe.',
    {
        server_id: z.string().optional().describe('Server ID.'),
        workspace: z.string().optional().describe('Local directory for auto-selecting server.'),
        local_path: z.string().describe('Absolute local file path.'),
        remote_path: z.string().describe('Absolute remote destination path.'),
        overwrite: z.boolean().optional().default(true).describe('Overwrite if exists.'),
    },
    async (params) => {
        try {
            const serverId = resolveServerId(params.server_id, params.workspace);
            const result = await uploadFile({ serverId, localPath: params.local_path, remotePath: params.remote_path, overwrite: params.overwrite });
            return { content: [{ type: 'text' as const, text: result }], isError: result.startsWith('FAILED') || result.startsWith('Error') };
        } catch (err: any) {
            return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }], isError: true };
        }
    }
);

// ---- ssh_download ----
server.tool(
    'ssh_download',
    'Download a file from a remote SSH server to the local machine. Handles any file type/size. Local directories created automatically. Paths with spaces are safe.',
    {
        server_id: z.string().optional().describe('Server ID.'),
        workspace: z.string().optional().describe('Local directory for auto-selecting server.'),
        remote_path: z.string().describe('Absolute remote file path.'),
        local_path: z.string().describe('Absolute local destination path.'),
        overwrite: z.boolean().optional().default(true).describe('Overwrite if exists.'),
    },
    async (params) => {
        try {
            const serverId = resolveServerId(params.server_id, params.workspace);
            const result = await downloadFile({ serverId, remotePath: params.remote_path, localPath: params.local_path, overwrite: params.overwrite });
            return { content: [{ type: 'text' as const, text: result }], isError: result.startsWith('FAILED') || result.startsWith('Error') };
        } catch (err: any) {
            return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }], isError: true };
        }
    }
);

// ---- Start ----
async function main() {
    try {
        const config = loadConfig();
        console.error(`ssh-mcp: ${config.servers.length} server(s)`);
    } catch (err: any) {
        console.error(`ssh-mcp: ${err.message}`);
    }
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('ssh-mcp: ready');
}

main().catch((e) => { console.error('Fatal:', e); closeAll(); process.exit(1); });
