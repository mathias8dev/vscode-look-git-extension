export enum BranchNameInputValidationKind {
    Info,
    Error,
}

export interface BranchNameInputValidation {
    readonly kind: BranchNameInputValidationKind;
    readonly message: string;
}

export function normalizeBranchNameInput(input: string | undefined): string | undefined {
    const normalized = input
        ?.trim()
        .replace(/\s+/g, '-')
        .replace(/[~^:?*\[\\]+/g, '-')
        .replace(/^\/+|\/+$/g, '');
    return normalized || undefined;
}

export function normalizeValidBranchNameInput(input: string | undefined): string | undefined {
    const normalized = normalizeBranchNameInput(input);
    return normalized && !validateNormalizedBranchName(normalized) ? normalized : undefined;
}

export function branchNameInputValidation(input: string): BranchNameInputValidation | undefined {
    const normalized = normalizeBranchNameInput(input);
    if (!normalized) {
        return { kind: BranchNameInputValidationKind.Error, message: 'Branch name is required.' };
    }
    const error = validateNormalizedBranchName(normalized);
    if (error) {
        return { kind: BranchNameInputValidationKind.Error, message: error };
    }
    if (normalized !== input.trim()) {
        return { kind: BranchNameInputValidationKind.Info, message: `${input.trim()} -> ${normalized}` };
    }
    return undefined;
}

export function validateNormalizedBranchName(name: string): string | undefined {
    if (name.toUpperCase() === 'HEAD') { return 'HEAD is reserved.'; }
    if (name === '@') { return 'Branch name cannot be "@".'; }
    if (name.startsWith('-')) { return 'Branch name cannot start with "-".'; }
    if (name.includes('..')) { return 'Branch name cannot contain "..".'; }
    if (name.includes('@{')) { return 'Branch name cannot contain "@{".'; }
    if (name.includes('//')) { return 'Branch name cannot contain empty path segments.'; }
    if (/[\x00-\x1f\x7f]/.test(name)) { return 'Branch name cannot contain control characters.'; }
    if (name.endsWith('.')) { return 'Branch name cannot end with ".".'; }
    if (name.split('/').some((segment) => segment.startsWith('.'))) {
        return 'Branch path segments cannot start with ".".';
    }
    if (name.split('/').some((segment) => segment.endsWith('.lock'))) {
        return 'Branch path segments cannot end with ".lock".';
    }
    return undefined;
}
