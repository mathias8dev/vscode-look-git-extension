export interface DiffExplainerInput {
    readonly selectionLabel: string;
    readonly selectedItems: readonly string[];
    readonly diff: string;
    readonly diffTruncated: boolean;
}

export interface DiffExplainer {
    explainDiff(input: DiffExplainerInput, signal?: AbortSignal): Promise<string>;
}
