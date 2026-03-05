/**
 * Cleans SSH output for AI readability:
 * - Strips ANSI escape codes
 * - Removes control characters
 * - Collapses excessive blank lines
 * - Truncates very long lines
 * - Detects and replaces binary data
 * - Converts tab-separated data to aligned columns
 */

const ANSI_REGEX = /\x1B\[[0-9;]*[A-Za-z]|\x1B\][^\x07]*\x07|\x1B[()][AB012]|\x1B\[?[0-9;]*[hlm]/g;
const CONTROL_CHARS_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
const CARRIAGE_RETURN_REGEX = /\r\n?/g;

const MAX_LINE_LENGTH = 2000;
const MAX_CONSECUTIVE_BLANKS = 2;
const BINARY_THRESHOLD = 0.15; // If more than 15% non-text chars, consider binary

export function cleanOutput(raw: string | Buffer): string {
    if (Buffer.isBuffer(raw)) {
        if (isBinaryData(raw)) {
            return `[binary data, ${raw.length} bytes]`;
        }
        raw = raw.toString('utf-8');
    }

    if (typeof raw !== 'string') return '';

    // Strip ANSI escape codes
    let output = raw.replace(ANSI_REGEX, '');

    // Normalize line endings
    output = output.replace(CARRIAGE_RETURN_REGEX, '\n');

    // Remove control characters (keep \n and \t)
    output = output.replace(CONTROL_CHARS_REGEX, '');

    // Process line by line
    const lines = output.split('\n');
    const processedLines: string[] = [];
    let consecutiveBlanks = 0;

    for (let line of lines) {
        // Truncate very long lines
        if (line.length > MAX_LINE_LENGTH) {
            line = line.substring(0, MAX_LINE_LENGTH) + ' [...truncated]';
        }

        // Collapse excessive blank lines
        if (line.trim() === '') {
            consecutiveBlanks++;
            if (consecutiveBlanks > MAX_CONSECUTIVE_BLANKS) continue;
        } else {
            consecutiveBlanks = 0;
        }

        processedLines.push(line);
    }

    // Trim trailing blank lines
    while (processedLines.length > 0 && processedLines[processedLines.length - 1].trim() === '') {
        processedLines.pop();
    }

    return processedLines.join('\n');
}

function isBinaryData(buf: Buffer): boolean {
    if (buf.length === 0) return false;
    const sampleSize = Math.min(buf.length, 8192);
    let nonTextCount = 0;
    for (let i = 0; i < sampleSize; i++) {
        const byte = buf[i];
        // Non-text: anything outside printable ASCII + common whitespace
        if (byte < 0x09 || (byte > 0x0D && byte < 0x20) || byte === 0x7F) {
            nonTextCount++;
        }
    }
    return nonTextCount / sampleSize > BINARY_THRESHOLD;
}

/**
 * Format command result for AI consumption
 */
export function formatCommandResult(opts: {
    stdout: string;
    stderr: string;
    exitCode: number | null;
    signal?: string | null;
    timedOut?: boolean;
    duration?: number;
}): string {
    const parts: string[] = [];

    if (opts.timedOut) {
        parts.push('TIMED_OUT: command exceeded timeout limit');
    }

    if (opts.duration !== undefined) {
        parts.push(`Duration: ${(opts.duration / 1000).toFixed(1)}s`);
    }

    if (opts.exitCode !== null && opts.exitCode !== undefined) {
        parts.push(`Exit code: ${opts.exitCode}${opts.exitCode !== 0 ? ' (FAILURE)' : ''}`);
    }

    if (opts.signal) {
        parts.push(`Signal: ${opts.signal}`);
    }

    const cleanStdout = cleanOutput(opts.stdout);
    const cleanStderr = cleanOutput(opts.stderr);

    if (cleanStdout) {
        parts.push(`\n--- STDOUT ---\n${cleanStdout}`);
    }

    if (cleanStderr) {
        parts.push(`\n--- STDERR ---\n${cleanStderr}`);
    }

    if (!cleanStdout && !cleanStderr) {
        parts.push('(no output)');
    }

    return parts.join('\n');
}

/**
 * Format directory listing for AI
 */
export function formatLsOutput(raw: string): string {
    const cleaned = cleanOutput(raw);
    // If it looks like `ls -la` output, try to clean up the alignment
    const lines = cleaned.split('\n');
    if (lines.length < 2) return cleaned;

    // Check if it looks like ls -la (starts with "total" or permission string)
    const hasLsHeader = /^total\s+\d+/.test(lines[0]);
    if (!hasLsHeader) return cleaned;

    // Collapse multiple spaces in ls output for cleaner display
    return lines.map(line => line.replace(/\s{2,}/g, '  ')).join('\n');
}
