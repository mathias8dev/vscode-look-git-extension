import { describe, expect, it } from 'vitest';
import { parseNullTerminatedGitConfigValues } from '@core/parsing/parse-git-config';

describe('parseNullTerminatedGitConfigValues', () => {
    it('returns no values for empty output', () => {
        expect(parseNullTerminatedGitConfigValues('')).toEqual([]);
    });

    it('parses null-terminated key and value records', () => {
        const output = 'submodule.auth.path\nmodules/auth\0submodule.ui.path\npackages/ui\0';

        expect(parseNullTerminatedGitConfigValues(output)).toEqual(['modules/auth', 'packages/ui']);
    });

    it('preserves spaces, newlines, and unicode in values', () => {
        const output = 'submodule.docs.path\ndocs/guide notes\0submodule.localized.path\nmodules/café\nmobile\0';

        expect(parseNullTerminatedGitConfigValues(output)).toEqual(['docs/guide notes', 'modules/café\nmobile']);
    });

    it('ignores incomplete records', () => {
        expect(parseNullTerminatedGitConfigValues('submodule.invalid.path\0')).toEqual([]);
    });
});
