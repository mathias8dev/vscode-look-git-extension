import { describe, expect, it } from 'vitest';
import { parseRemoteTagRefs } from '@core/parsing/parse-remote-tag-refs';

describe('parseRemoteTagRefs', () => {
    it('handles empty output', () => expect(parseRemoteTagRefs('')).toEqual([]));
    it('preserves unicode and special characters in full tag names', () => {
        expect(parseRemoteTagRefs('abc123\trefs/tags/releases/été-1.0+build\r\ndef456\trefs/tags/v2\n')).toEqual([
            { name: 'releases/été-1.0+build', objectHash: 'abc123' }, { name: 'v2', objectHash: 'def456' },
        ]);
    });
    it.each(['abc123\0refs/tags/v1', 'abc123\trefs/heads/main', 'abc123\trefs/tags/v1^{}', 'invalid'])('rejects invalid remote output %j', output => {
        expect(() => parseRemoteTagRefs(output)).toThrow('Invalid remote tag reference');
    });
});
