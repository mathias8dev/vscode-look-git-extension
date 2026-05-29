import { expect } from 'vitest';

export function expectItem<T>(items: readonly T[], index: number): T {
    expect(items.length).toBeGreaterThan(index);
    const item = items[index];
    if (item === undefined) {
        throw new Error(`Expected item at index ${index}.`);
    }
    return item;
}
