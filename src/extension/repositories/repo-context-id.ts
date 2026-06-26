import * as crypto from 'crypto';
import { normalizePathForComparison } from '@extension/utils/path-compare';

export function stableRepoContextId(cwd: string): string {
    return crypto.createHash('sha256').update(normalizePathForComparison(cwd)).digest('hex').substring(0, 16);
}
