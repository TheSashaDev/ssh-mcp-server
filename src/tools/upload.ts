import { readFileSync, createReadStream, statSync } from 'fs';
import { basename } from 'path';
import { getSftp, getConnection } from '../ssh-manager.js';
import { escapeRemotePath, normalizeRemotePath, ensureRemoteDir, remoteDir } from '../utils/path-utils.js';
import { cleanOutput } from '../utils/output-format.js';

/**
 * Upload a local file to a remote server with 5 fallback strategies.
 * 
 * Strategies (tried in order):
 * 1. SFTP fastPut — high-speed parallel transfer
 * 2. SFTP createWriteStream — streamed transfer
 * 3. SCP via exec + stdin pipe — cat > remotePath
 * 4. Base64 via exec — encode/decode
 * 5. Chunked echo via exec — small base64 chunks appended
 */
export async function uploadFile(params: {
    serverId: string;
    localPath: string;
    remotePath: string;
    overwrite?: boolean;
}): Promise<string> {
    const { serverId, localPath, remotePath: rawRemotePath, overwrite = true } = params;
    const remotePath = normalizeRemotePath(rawRemotePath);

    // Validate local file exists
    let fileSize: number;
    try {
        const stat = statSync(localPath);
        if (!stat.isFile()) {
            return `Error: "${localPath}" is not a file.`;
        }
        fileSize = stat.size;
    } catch (err: any) {
        return `Error: Cannot access local file "${localPath}": ${err.message}`;
    }

    const errors: string[] = [];
    const fileName = basename(localPath);
    const startTime = Date.now();

    // Strategy 1: SFTP fastPut
    try {
        const result = await strategy1_sftpFastPut(serverId, localPath, remotePath, overwrite);
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        return `SUCCESS: uploaded via SFTP fastPut\nfile: ${fileName} (${formatSize(fileSize)})\nremote: ${remotePath}\nduration: ${duration}s`;
    } catch (err: any) {
        errors.push(`Strategy 1 (SFTP fastPut): ${err.message}`);
    }

    // Strategy 2: SFTP stream
    try {
        const result = await strategy2_sftpStream(serverId, localPath, remotePath, overwrite);
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        return `SUCCESS: uploaded via SFTP stream\nfile: ${fileName} (${formatSize(fileSize)})\nremote: ${remotePath}\nduration: ${duration}s`;
    } catch (err: any) {
        errors.push(`Strategy 2 (SFTP stream): ${err.message}`);
    }

    // Strategy 3: SCP via stdin pipe
    try {
        await strategy3_scpPipe(serverId, localPath, remotePath);
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        return `SUCCESS: uploaded via SCP pipe\nfile: ${fileName} (${formatSize(fileSize)})\nremote: ${remotePath}\nduration: ${duration}s`;
    } catch (err: any) {
        errors.push(`Strategy 3 (SCP pipe): ${err.message}`);
    }

    // Strategy 4: Base64
    try {
        await strategy4_base64(serverId, localPath, remotePath);
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        return `SUCCESS: uploaded via base64\nfile: ${fileName} (${formatSize(fileSize)})\nremote: ${remotePath}\nduration: ${duration}s`;
    } catch (err: any) {
        errors.push(`Strategy 4 (Base64): ${err.message}`);
    }

    // Strategy 5: Chunked echo
    try {
        await strategy5_chunkedEcho(serverId, localPath, remotePath);
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        return `SUCCESS: uploaded via chunked base64\nfile: ${fileName} (${formatSize(fileSize)})\nremote: ${remotePath}\nduration: ${duration}s`;
    } catch (err: any) {
        errors.push(`Strategy 5 (chunked echo): ${err.message}`);
    }

    return `FAILED: upload failed, all 5 strategies exhausted\nlocal: ${localPath}\nremote: ${remotePath}\n\nerrors:\n${errors.map((e, i) => `  ${i + 1}. ${e}`).join('\n')}`;
}

// --- Strategy Implementations ---

async function strategy1_sftpFastPut(
    serverId: string, localPath: string, remotePath: string, overwrite: boolean
): Promise<void> {
    const sftp = await getSftp(serverId);
    await ensureRemoteDir(sftp, remoteDir(remotePath));

    if (!overwrite) {
        const exists = await new Promise<boolean>(resolve => {
            sftp.stat(remotePath, (err: any) => resolve(!err));
        });
        if (exists) throw new Error('File already exists and overwrite=false');
    }

    return new Promise<void>((resolve, reject) => {
        sftp.fastPut(localPath, remotePath, {
            concurrency: 64,
            chunkSize: 65536,
            step: (transferred: number, chunk: number, total: number) => {
                // Progress tracking available if needed
            },
        }, (err: any) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

async function strategy2_sftpStream(
    serverId: string, localPath: string, remotePath: string, overwrite: boolean
): Promise<void> {
    const sftp = await getSftp(serverId);
    await ensureRemoteDir(sftp, remoteDir(remotePath));

    if (!overwrite) {
        const exists = await new Promise<boolean>(resolve => {
            sftp.stat(remotePath, (err: any) => resolve(!err));
        });
        if (exists) throw new Error('File already exists and overwrite=false');
    }

    return new Promise<void>((resolve, reject) => {
        const readStream = createReadStream(localPath);
        const writeStream = sftp.createWriteStream(remotePath);

        writeStream.on('close', () => resolve());
        writeStream.on('error', (err: any) => reject(err));
        readStream.on('error', (err: any) => reject(err));

        readStream.pipe(writeStream);
    });
}

async function strategy3_scpPipe(
    serverId: string, localPath: string, remotePath: string
): Promise<void> {
    const client = await getConnection(serverId);
    const escaped = escapeRemotePath(remotePath);

    // Ensure parent directory exists
    const parentDir = escapeRemotePath(remoteDir(remotePath));
    await execSimple(client, `mkdir -p ${parentDir}`);

    return new Promise<void>((resolve, reject) => {
        client.exec(`cat > ${escaped}`, (err: any, stream: any) => {
            if (err) return reject(err);

            let error: Error | null = null;

            stream.on('close', () => {
                if (error) reject(error);
                else resolve();
            });

            stream.on('error', (e: any) => { error = e; });

            const readStream = createReadStream(localPath);
            readStream.on('error', (e: any) => {
                error = e;
                stream.close();
            });

            readStream.pipe(stream);
        });
    });
}

async function strategy4_base64(
    serverId: string, localPath: string, remotePath: string
): Promise<void> {
    const client = await getConnection(serverId);
    const fileData = readFileSync(localPath);
    const b64 = fileData.toString('base64');
    const escaped = escapeRemotePath(remotePath);
    const parentDir = escapeRemotePath(remoteDir(remotePath));

    // Ensure parent dir and decode base64
    const cmd = `mkdir -p ${parentDir} && echo '${b64}' | base64 -d > ${escaped}`;

    // If command is too long (>100KB), fall through to chunked
    if (cmd.length > 100000) {
        throw new Error('File too large for single base64 transfer, use chunked strategy');
    }

    await execSimple(client, cmd);
}

async function strategy5_chunkedEcho(
    serverId: string, localPath: string, remotePath: string
): Promise<void> {
    const client = await getConnection(serverId);
    const fileData = readFileSync(localPath);
    const b64 = fileData.toString('base64');
    const escaped = escapeRemotePath(remotePath);
    const parentDir = escapeRemotePath(remoteDir(remotePath));

    await execSimple(client, `mkdir -p ${parentDir}`);

    const CHUNK_SIZE = 100000; // ~100KB per chunk
    const tempFile = `${remotePath}.b64tmp`;
    const escapedTemp = escapeRemotePath(tempFile);

    // Clear temp file
    await execSimple(client, `> ${escapedTemp}`);

    // Write chunks
    for (let i = 0; i < b64.length; i += CHUNK_SIZE) {
        const chunk = b64.slice(i, i + CHUNK_SIZE);
        await execSimple(client, `printf '%s' '${chunk}' >> ${escapedTemp}`);
    }

    // Decode and move
    await execSimple(client, `base64 -d ${escapedTemp} > ${escaped} && rm -f ${escapedTemp}`);
}

// --- Helpers ---

function execSimple(client: any, command: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        client.exec(command, (err: any, stream: any) => {
            if (err) return reject(err);
            let output = '';
            let stderr = '';

            stream.on('data', (data: Buffer) => { output += data.toString(); });
            stream.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

            stream.on('close', (code: number) => {
                if (code !== 0) {
                    reject(new Error(`Command failed (exit ${code}): ${stderr || output}`));
                } else {
                    resolve(output);
                }
            });
        });
    });
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
}
