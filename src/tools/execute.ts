import { randomUUID } from 'crypto';
import { getConnection } from '../ssh-manager.js';
import { cleanOutput, formatCommandResult } from '../utils/output-format.js';
import { escapeRemotePath } from '../utils/path-utils.js';

interface AsyncCommand {
    id: string;
    serverId: string;
    command: string;
    stdout: string;
    stderr: string;
    exitCode: number | null;
    signal: string | null;
    status: 'running' | 'done' | 'timeout' | 'error';
    startedAt: number;
    error?: string;
    stream?: any;
}

const asyncCommands = new Map<string, AsyncCommand>();

// Cleanup old finished commands after 30 min
setInterval(() => {
    const cutoff = Date.now() - 30 * 60 * 1000;
    for (const [id, cmd] of asyncCommands) {
        if (cmd.status !== 'running' && cmd.startedAt < cutoff) {
            asyncCommands.delete(id);
        }
    }
}, 60000).unref();

/**
 * Execute a command via SSH.
 * Supports sync mode (wait for completion) and async mode (return immediately).
 */
export async function executeCommand(params: {
    serverId: string;
    command: string;
    cwd?: string;
    timeoutMs?: number;
    async?: boolean;
    commandId?: string;
}): Promise<string> {
    // If commandId is provided, we're checking status of an async command
    if (params.commandId) {
        return getAsyncStatus(params.commandId);
    }

    const { serverId, command, cwd, timeoutMs = 30000, async: isAsync = false } = params;

    // Wrap command with cd if cwd specified
    let fullCommand = command;
    if (cwd) {
        fullCommand = `cd ${escapeRemotePath(cwd)} && ${command}`;
    }

    const client = await getConnection(serverId);

    if (isAsync) {
        return startAsyncCommand(serverId, fullCommand, command, timeoutMs);
    }

    return runSyncCommand(client, fullCommand, timeoutMs);
}

async function runSyncCommand(client: any, command: string, timeoutMs: number): Promise<string> {
    return new Promise<string>((resolve) => {
        const startTime = Date.now();
        let stdout = '';
        let stderr = '';
        let timedOut = false;

        const timeout = setTimeout(() => {
            timedOut = true;
            try { stream?.close(); } catch { }
        }, timeoutMs);

        let stream: any;
        client.exec(command, (err: any, s: any) => {
            if (err) {
                clearTimeout(timeout);
                resolve(formatCommandResult({
                    stdout: '',
                    stderr: err.message,
                    exitCode: -1,
                    timedOut: false,
                    duration: Date.now() - startTime,
                }));
                return;
            }

            stream = s;

            s.on('data', (data: Buffer) => {
                stdout += data.toString('utf-8');
                // Cap buffer at 5MB to prevent memory issues
                if (stdout.length > 5 * 1024 * 1024) {
                    stdout = stdout.slice(-2 * 1024 * 1024);
                }
            });

            s.stderr.on('data', (data: Buffer) => {
                stderr += data.toString('utf-8');
                if (stderr.length > 2 * 1024 * 1024) {
                    stderr = stderr.slice(-1 * 1024 * 1024);
                }
            });

            s.on('close', (code: number | null, signal: string | null) => {
                clearTimeout(timeout);
                resolve(formatCommandResult({
                    stdout,
                    stderr,
                    exitCode: code,
                    signal,
                    timedOut,
                    duration: Date.now() - startTime,
                }));
            });

            s.on('error', (streamErr: any) => {
                clearTimeout(timeout);
                resolve(formatCommandResult({
                    stdout,
                    stderr: stderr + '\n' + streamErr.message,
                    exitCode: -1,
                    timedOut: false,
                    duration: Date.now() - startTime,
                }));
            });
        });
    });
}

async function startAsyncCommand(
    serverId: string,
    fullCommand: string,
    displayCommand: string,
    timeoutMs: number
): Promise<string> {
    const id = randomUUID().slice(0, 12);
    const asyncCmd: AsyncCommand = {
        id,
        serverId,
        command: displayCommand,
        stdout: '',
        stderr: '',
        exitCode: null,
        signal: null,
        status: 'running',
        startedAt: Date.now(),
    };

    asyncCommands.set(id, asyncCmd);

    const client = await getConnection(serverId);

    client.exec(fullCommand, (err: any, stream: any) => {
        if (err) {
            asyncCmd.status = 'error';
            asyncCmd.error = err.message;
            return;
        }

        asyncCmd.stream = stream;

        // Set timeout
        if (timeoutMs > 0) {
            setTimeout(() => {
                if (asyncCmd.status === 'running') {
                    asyncCmd.status = 'timeout';
                    try { stream.close(); } catch { }
                }
            }, timeoutMs).unref();
        }

        stream.on('data', (data: Buffer) => {
            asyncCmd.stdout += data.toString('utf-8');
            // Cap buffer
            if (asyncCmd.stdout.length > 5 * 1024 * 1024) {
                asyncCmd.stdout = asyncCmd.stdout.slice(-2 * 1024 * 1024);
            }
        });

        stream.stderr.on('data', (data: Buffer) => {
            asyncCmd.stderr += data.toString('utf-8');
            if (asyncCmd.stderr.length > 2 * 1024 * 1024) {
                asyncCmd.stderr = asyncCmd.stderr.slice(-1 * 1024 * 1024);
            }
        });

        stream.on('close', (code: number | null, signal: string | null) => {
            if (asyncCmd.status === 'running') {
                asyncCmd.status = 'done';
            }
            asyncCmd.exitCode = code;
            asyncCmd.signal = signal;
        });

        stream.on('error', (streamErr: any) => {
            asyncCmd.status = 'error';
            asyncCmd.error = streamErr.message;
        });
    });

    return `Command started asynchronously.\nCommand ID: ${id}\nUse this ID with command_id parameter to check status and output later.`;
}

function getAsyncStatus(commandId: string): string {
    const cmd = asyncCommands.get(commandId);
    if (!cmd) {
        return `Command "${commandId}" not found. It may have expired (commands are cleaned up after 30 minutes).`;
    }

    const elapsed = ((Date.now() - cmd.startedAt) / 1000).toFixed(1);
    const parts: string[] = [
        `Command: ${cmd.command}`,
        `Server: ${cmd.serverId}`,
        `Status: ${cmd.status.toUpperCase()}`,
        `Running for: ${elapsed}s`,
    ];

    if (cmd.exitCode !== null) {
        parts.push(`Exit code: ${cmd.exitCode}`);
    }

    if (cmd.signal) {
        parts.push(`Signal: ${cmd.signal}`);
    }

    if (cmd.error) {
        parts.push(`Error: ${cmd.error}`);
    }

    const cleanStdout = cleanOutput(cmd.stdout);
    const cleanStderr = cleanOutput(cmd.stderr);

    if (cleanStdout) {
        parts.push(`\n--- STDOUT (latest) ---\n${cleanStdout}`);
    }

    if (cleanStderr) {
        parts.push(`\n--- STDERR ---\n${cleanStderr}`);
    }

    if (!cleanStdout && !cleanStderr && cmd.status === 'running') {
        parts.push('(no output yet)');
    }

    return parts.join('\n');
}
