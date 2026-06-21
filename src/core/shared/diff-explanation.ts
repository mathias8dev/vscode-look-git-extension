export function normalizeDiffExplanation(rawExplanation: string): string {
    const normalized = stripCodeFence(rawExplanation.trim()).trim();
    if (!normalized) {
        throw new Error('The language model returned an empty diff explanation.');
    }
    return normalized;
}

function stripCodeFence(value: string): string {
    const match = value.match(/^```(?:markdown|md|text)?\s*([\s\S]*?)\s*```$/i);
    return match?.[1]?.trim() ?? value;
}
