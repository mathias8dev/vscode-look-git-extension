import { describe, expect, it } from 'vitest';
import {
    BranchNameInputValidationKind,
    branchNameInputValidation,
    normalizeBranchNameInput,
    normalizeValidBranchNameInput,
} from '@core/git/normalize-branch-name';

describe('normalizeBranchNameInput', () => {
    it('trims branch names and replaces whitespace with dashes', () => {
        expect(normalizeBranchNameInput('  feature my branch  ')).toBe('feature-my-branch');
        expect(normalizeBranchNameInput('feature/my branch')).toBe('feature/my-branch');
        expect(normalizeBranchNameInput('feature\twith\nspacing')).toBe('feature-with-spacing');
    });

    it('strips leading and trailing slashes', () => {
        expect(normalizeBranchNameInput('/feature/topic/')).toBe('feature/topic');
        expect(normalizeBranchNameInput('///feature/topic')).toBe('feature/topic');
        expect(normalizeBranchNameInput('feature/topic///')).toBe('feature/topic');
    });

    it('replaces git-forbidden branch characters with dashes', () => {
        expect(normalizeBranchNameInput('feature~topic')).toBe('feature-topic');
        expect(normalizeBranchNameInput('feature^topic:fix?one*two[three\\four')).toBe('feature-topic-fix-one-two-three-four');
        expect(normalizeBranchNameInput('/feature bad:name/')).toBe('feature-bad-name');
    });

    it('returns undefined for cancelled or empty input', () => {
        expect(normalizeBranchNameInput(undefined)).toBeUndefined();
        expect(normalizeBranchNameInput('   ')).toBeUndefined();
        expect(normalizeBranchNameInput('////')).toBeUndefined();
    });

    it('returns a preview info message when the accepted branch name will be normalized', () => {
        expect(branchNameInputValidation('feature bad:name')).toEqual({
            kind: BranchNameInputValidationKind.Info,
            message: 'feature bad:name -> feature-bad-name',
        });
    });

    it('blocks dangerous git ref names after normalization', () => {
        expect(branchNameInputValidation('HEAD')).toEqual({
            kind: BranchNameInputValidationKind.Error,
            message: 'HEAD is reserved.',
        });
        expect(branchNameInputValidation('feature..topic')?.kind).toBe(BranchNameInputValidationKind.Error);
        expect(branchNameInputValidation('feature.lock')?.kind).toBe(BranchNameInputValidationKind.Error);
        expect(branchNameInputValidation('feature@{topic')?.kind).toBe(BranchNameInputValidationKind.Error);
        expect(branchNameInputValidation('feature//topic')?.kind).toBe(BranchNameInputValidationKind.Error);
        expect(branchNameInputValidation('feature/.topic')?.kind).toBe(BranchNameInputValidationKind.Error);
        expect(branchNameInputValidation('feature/topic.')?.kind).toBe(BranchNameInputValidationKind.Error);
        expect(branchNameInputValidation('@')?.kind).toBe(BranchNameInputValidationKind.Error);
        expect(branchNameInputValidation('-feature')?.kind).toBe(BranchNameInputValidationKind.Error);
        expect(branchNameInputValidation('feature\u0001topic')?.kind).toBe(BranchNameInputValidationKind.Error);
    });

    it('only returns normalized names that pass validation', () => {
        expect(normalizeValidBranchNameInput('feature bad:name')).toBe('feature-bad-name');
        expect(normalizeValidBranchNameInput('HEAD')).toBeUndefined();
        expect(normalizeValidBranchNameInput('feature..topic')).toBeUndefined();
    });
});
