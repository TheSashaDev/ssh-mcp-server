import { posix, win32 } from 'path';

/**
 * Escape a remote path for safe use in shell commands.
 * Handles spaces, quotes, special characters.
 */
export function escapeRemotePath(remotePath: string): string {
    // Use single quotes with escaped single quotes inside
    // This is the safest way to handle paths with spaces, $, etc.
    return "'" + remotePath.replace(/'/g, "'\\''") + "'";
}

/**
 * Normalize a local path — handle Windows/Unix differences.
 */
export function normalizeLocalPath(localPath: string): string {
    // Replace forward slashes with OS-appropriate separator on Windows
    return localPath.replace(/\//g, win32.sep);
}

/**
 * Normalize a remote path — ensure Unix-style.
 */
export function normalizeRemotePath(remotePath: string): string {
    // Remote paths are always Unix-style
    return remotePath.replace(/\\/g, '/');
}

/**
 * Get parent directory of a remote path.
 */
export function remoteDir(remotePath: string): string {
    return posix.dirname(normalizeRemotePath(remotePath));
}

/**
 * Join remote path segments (Unix-style).
 */
export function remoteJoin(...segments: string[]): string {
    return posix.join(...segments.map(s => normalizeRemotePath(s)));
}

/**
 * Create remote directory recursively via SFTP.
 */
export async function ensureRemoteDir(
    sftp: any,
    dirPath: string
): Promise<void> {
    const normalized = normalizeRemotePath(dirPath);
    const parts = normalized.split('/').filter(Boolean);
    let current = normalized.startsWith('/') ? '/' : '';

    for (const part of parts) {
        current = current ? posix.join(current, part) : part;
        try {
            await new Promise<void>((resolve, reject) => {
                sftp.stat(current, (err: any) => {
                    if (err) {
                        sftp.mkdir(current, (mkErr: any) => {
                            if (mkErr && mkErr.code !== 4) { // 4 = already exists
                                reject(mkErr);
                            } else {
                                resolve();
                            }
                        });
                    } else {
                        resolve();
                    }
                });
            });
        } catch (err: any) {
            throw new Error(`Failed to create remote directory "${current}": ${err.message}`);
        }
    }
}

/**
 * Create local directory recursively.
 */
export async function ensureLocalDir(dirPath: string): Promise<void> {
    const { mkdir } = await import('fs/promises');
    await mkdir(dirPath, { recursive: true });
}

/**
 * Check if a remote path exists.
 */
export async function remoteExists(sftp: any, remotePath: string): Promise<boolean> {
    return new Promise((resolve) => {
        sftp.stat(remotePath, (err: any) => {
            resolve(!err);
        });
    });
}
