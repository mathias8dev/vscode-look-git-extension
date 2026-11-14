export function comparisonRefName(ref: string): string {
    return ref.replace(/^refs\/(heads|remotes)\//, '');
}
