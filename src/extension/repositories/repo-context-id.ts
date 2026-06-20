import * as crypto from 'crypto';
import * as path from 'path';

export function stableRepoContextId(cwd: string): string {
    return crypto.createHash('sha256').update(path.normalize(cwd)).digest('hex').substring(0, 16);
}
