export const DEFAULT_REPOSITORY_SCAN_MAX_DEPTH = 1;

export function normalizeRepositoryScanMaxDepth(value: unknown): number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0
        ? value
        : DEFAULT_REPOSITORY_SCAN_MAX_DEPTH;
}
