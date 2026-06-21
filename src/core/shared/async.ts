export async function settleOptional<T>(
    operation: string,
    promise: Promise<readonly T[]>,
): Promise<{ readonly operation: string; readonly status: 'fulfilled'; readonly value: readonly T[] } | { readonly operation: string; readonly status: 'rejected'; readonly reason: unknown }> {
    try {
        return { operation, status: 'fulfilled', value: await promise };
    } catch (reason) {
        return { operation, status: 'rejected', reason };
    }
}
