import { describe, expect, it } from 'vitest';
import { parseSubmoduleStatus, parseSubmodulePaths } from '../../../src/core/parsing/parseSubmoduleStatus';
import { expectItem } from '../../helpers/assertions';

describe('parseSubmoduleStatus', () => {
    it('returns empty array for empty output', () => {
        expect(parseSubmoduleStatus('')).toEqual([]);
    });

    it('parses a clean submodule (space prefix)', () => {
        const output = ' abc123 modules/child (v1.0)';
        const result = parseSubmoduleStatus(output);
        expect(result).toHaveLength(1);
        const submodule = expectItem(result, 0);
        expect(submodule.path).toBe('modules/child');
        expect(submodule.status).toBe(' ');
    });

    it('parses a modified submodule (+ prefix)', () => {
        const output = '+abc123 modules/ui';
        const result = parseSubmoduleStatus(output);
        const submodule = expectItem(result, 0);
        expect(submodule.status).toBe('+');
        expect(submodule.path).toBe('modules/ui');
    });

    it('parses an uninitialized submodule (- prefix)', () => {
        const output = '-0000000 modules/legacy';
        const result = parseSubmoduleStatus(output);
        expect(expectItem(result, 0).status).toBe('-');
    });

    it('handles multiple submodules', () => {
        const output = [
            ' abc123 modules/a (v1.0)',
            '+def456 modules/b',
            '-000000 modules/c',
        ].join('\n');
        const result = parseSubmoduleStatus(output);
        expect(result).toHaveLength(3);
        expect(result.map((s) => s.path)).toEqual(['modules/a', 'modules/b', 'modules/c']);
    });
});

describe('parseSubmodulePaths', () => {
    it('returns a Set of paths', () => {
        const output = ' abc modules/a\n+def modules/b';
        const paths = parseSubmodulePaths(output);
        expect(paths).toEqual(new Set(['modules/a', 'modules/b']));
    });

    it('returns empty Set for empty output', () => {
        expect(parseSubmodulePaths('')).toEqual(new Set());
    });
});
