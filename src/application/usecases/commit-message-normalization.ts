import { isRecord } from '@core/shared/type-guards';

export function normalizeGeneratedCommitMessage(rawMessage: string): string {
    const withoutFence = stripCodeFence(rawMessage.trim());
    const fromJson = commitMessageFromJson(withoutFence);
    const normalized = normalizeCommitLines(fromJson ?? withoutFence);
    const conventionalStart = findConventionalCommitStart(normalized);
    const candidate = conventionalStart >= 0
        ? normalizeCommitLines(normalized.split('\n').slice(conventionalStart).join('\n'))
        : normalized;
    if (!candidate) {
        throw new Error('The language model returned an empty commit message.');
    }
    return candidate;
}

function stripCodeFence(value: string): string {
    const match = value.match(/^```(?:json|text)?\s*([\s\S]*?)\s*```$/i);
    return match?.[1]?.trim() ?? value;
}

function commitMessageFromJson(value: string): string | undefined {
    try {
        const parsed: unknown = JSON.parse(value);
        if (typeof parsed === 'string') { return parsed; }
        if (!isRecord(parsed)) { return undefined; }
        if (typeof parsed.message === 'string') { return parsed.message; }
        if (typeof parsed.subject === 'string') {
            const body = typeof parsed.body === 'string' ? parsed.body : '';
            return body.trim() ? `${parsed.subject}\n\n${body}` : parsed.subject;
        }
        return undefined;
    } catch {
        return undefined;
    }
}

function normalizeCommitLines(value: string): string {
    const lines = value
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((line) => line.trimEnd());
    while (lines[0]?.trim() === '') { lines.shift(); }
    while (lines[lines.length - 1]?.trim() === '') { lines.pop(); }
    return lines.join('\n').trim();
}

function findConventionalCommitStart(value: string): number {
    const lines = value.split('\n');
    return lines.findIndex((line) => /^(feat|fix|refactor|test|docs|build|chore)(\([^)]+\))?!?:\s+\S/.test(line.trim()));
}
