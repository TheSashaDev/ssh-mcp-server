import { createWriteStream, writeFileSync } from 'fs';
import { basename, dirname } from 'path';
import { getSftp, getConnection } from '../ssh-manager.js';
import { escapeRemotePath, normalizeRemotePath, ensureLocalDir } from '../utils/path-utils.js';

/**
 * Download a remote file to the local machine with 5 fallback strategies.
 *
 * Strategies (tried in order):
 * 1. SFTP fastGet — high-speed parallel download
 * 2. SFTP createReadStream — streamed download
 * 3. SCP via exec + stdout — cat remotePath > local
 * 4. Base64 via exec — base64 remotePath, decode locally
 * 5. Chunked read via exec — dd with offset/count
 */
export async function downloadFile(params: {
    serverId: string;
    remotePath: string;
    localPath: string;
    overwrite?: boolean;
}): Promise<string> {
    const { serverId, remotePath: rawRemotePath, localPath, overwrite = true } = params;
    const remotePath = normalizeRemotePath(rawRemotePath);

    // Check local file existence
    if (!overwrite) {
        try {
            const { statSync } = await import('fs');
            statSync(localPath);
            return `Error: Local file "${localPath}" already exists and overwrite=false.`;
        } catch { }
    }

    // Ensure local parent directory exists
    try {
        await ensureLocalDir(dirname(localPath));
    } catch (err: any) {
        return `Error: Cannot create local directory "${dirname(localPath)}": ${err.message}`;
    }

    const errors: string[] = [];
    const fileName = basename(remotePath);
    const startTime = Date.now();

    // Get remote file size for reporting
    let fileSize: number | null = null;
    try {
        const sftp = await getSftp(serverId);
        fileSize = await new Promise<number | null>((resolve) => {
            sftp.stat(remotePath, (err: any, stats: any) => {
                resolve(err ? null : stats.size);
            });
        });
    } catch { }

    // Strategy 1: SFTP fastGet
    try {
        await strategy1_sftpFastGet(serverId, remotePath, localPath);
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        return `SUCCESS: downloaded via SFTP fastGet\nfile: ${fileName}${fileSize !== null ? ` (${formatSize(fileSize)})` : ''}\nsaved_to: ${localPath}\nduration: ${duration}s`;
    } catch (err: any) {
        errors.push(`Strategy 1 (SFTP fastGet): ${err.message}`);
    }

    // Strategy 2: SFTP stream
    try {
        await strategy2_sftpStream(serverId, remotePath, localPath);
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        return `SUCCESS: downloaded via SFTP stream\nfile: ${fileName}${fileSize !== null ? ` (${formatSize(fileSize)})` : ''}\nsaved_to: ${localPath}\nduration: ${duration}s`;
    } catch (err: any) {
        errors.push(`Strategy 2 (SFTP stream): ${err.message}`);
    }

    // Strategy 3: SCP via cat
    try {
        await strategy3_scpCat(serverId, remotePath, localPath);
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        return `SUCCESS: downloaded via SCP cat\nfile: ${fileName}\nsaved_to: ${localPath}\nduration: ${duration}s`;
    } catch (err: any) {
        errors.push(`Strategy 3 (SCP cat): ${err.message}`);
    }

    // Strategy 4: Base64 decode
    try {
        await strategy4_base64(serverId, remotePath, localPath);
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        return `SUCCESS: downloaded via base64\nfile: ${fileName}\nsaved_to: ${localPath}\nduration: ${duration}s`;
    } catch (err: any) {
        errors.push(`Strategy 4 (Base64): ${err.message}`);
    }

    // Strategy 5: Chunked dd
    try {
        await strategy5_chunkedDd(serverId, remotePath, localPath);
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        return `SUCCESS: downloaded via chunked dd\nfile: ${fileName}\nsaved_to: ${localPath}\nduration: ${duration}s`;
    } catch (err: any) {
        errors.push(`Strategy 5 (chunked dd): ${err.message}`);
    }

    return `FAILED: download failed, all 5 strategies exhausted\nremote: ${remotePath}\nlocal: ${localPath}\n\nerrors:\n${errors.map((e, i) => `  ${i + 1}. ${e}`).join('\n')}`;
}

// --- Strategy Implementations ---

async function strategy1_sftpFastGet(
    serverId: string, remotePath: string, localPath: string
): Promise<void> {
    const sftp = await getSftp(serverId);
    return new Promise<void>((resolve, reject) => {
        sftp.fastGet(remotePath, localPath, {
            concurrency: 64,
            chunkSize: 65536,
        }, (err: any) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

async function strategy2_sftpStream(
    serverId: string, remotePath: string, localPath: string
): Promise<void> {
    const sftp = await getSftp(serverId);
    return new Promise<void>((resolve, reject) => {
        const readStream = sftp.createReadStream(remotePath);
        const writeStream = createWriteStream(localPath);

        readStream.on('error', (err: any) => reject(err));
        writeStream.on('error', (err: any) => reject(err));
        writeStream.on('close', () => resolve());

        readStream.pipe(writeStream);
    });
}

async function strategy3_scpCat(
    serverId: string, remotePath: string, localPath: string
): Promise<void> {
    const client = await getConnection(serverId);
    const escaped = escapeRemotePath(remotePath);

    return new Promise<void>((resolve, reject) => {
        client.exec(`cat ${escaped}`, (err: any, stream: any) => {
            if (err) return reject(err);

            const writeStream = createWriteStream(localPath);
            let stderr = '';

            stream.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

            writeStream.on('error', (e: any) => reject(e));
            writeStream.on('close', () => {
                if (stderr.trim()) {
                    reject(new Error(`cat stderr: ${stderr.trim()}`));
                } else {
                    resolve();
                }
            });

            stream.on('close', (code: number) => {
                writeStream.end();
                if (code !== 0 && code !== null) {
                    reject(new Error(`cat exited with code ${code}: ${stderr}`));
                }
            });

            stream.pipe(writeStream);
        });
    });
}

async function strategy4_base64(
    serverId: string, remotePath: string, localPath: string
): Promise<void> {
    const client = await getConnection(serverId);
    const escaped = escapeRemotePath(remotePath);

    const b64Data = await execCollect(client, `base64 ${escaped}`);
    const clean = b64Data.replace(/\s/g, '');
    const buffer = Buffer.from(clean, 'base64');
    writeFileSync(localPath, buffer);
}

async function strategy5_chunkedDd(
    serverId: string, remotePath: string, localPath: string
): Promise<void> {
    const client = await getConnection(serverId);
    const escaped = escapeRemotePath(remotePath);

    // Get file size first
    const sizeOutput = await execCollect(client, `stat -c '%s' ${escaped} 2>/dev/null || stat -f '%z' ${escaped} 2>/dev/null`);
    const fileSize = parseInt(sizeOutput.trim(), 10);
    if (isNaN(fileSize)) {
        throw new Error('Cannot determine remote file size');
    }

    const CHUNK_SIZE = 262144; // 256KB chunks
    const chunks: Buffer[] = [];

    for (let offset = 0; offset < fileSize; offset += CHUNK_SIZE) {
        const count = Math.min(CHUNK_SIZE, fileSize - offset);
        const b64Chunk = await execCollect(
            client,
            `dd if=${escaped} bs=1 skip=${offset} count=${count} 2>/dev/null | base64`
        );
        const clean = b64Chunk.replace(/\s/g, '');
        chunks.push(Buffer.from(clean, 'base64'));
    }

    writeFileSync(localPath, Buffer.concat(chunks));
}

// --- Helpers ---

function execCollect(client: any, command: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        client.exec(command, (err: any, stream: any) => {
            if (err) return reject(err);
            let output = '';
            let stderr = '';

            stream.on('data', (data: Buffer) => { output += data.toString(); });
            stream.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

            stream.on('close', (code: number) => {
                if (code !== 0 && code !== null) {
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
