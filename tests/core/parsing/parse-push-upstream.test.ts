import { describe, expect, it } from 'vitest';
import { parsePushUpstream } from '@core/parsing/parse-push-upstream';

describe('parsePushUpstream', () => {
    it('handles empty upstreams and null separators', () => {
        expect(parsePushUpstream('')).toBeUndefined();
        expect(parsePushUpstream('\0\n')).toBeUndefined();
        expect(parsePushUpstream('upstream\0refs/heads/main\n')).toEqual({ remote: 'upstream', ref: 'refs/heads/main' });
    });

    it('preserves nested remote names, unicode and special ref characters', () => {
        expect(parsePushUpstream('équipe/projet\0refs/heads/fonction+é\r\n')).toEqual({ remote: 'équipe/projet', ref: 'refs/heads/fonction+é' });
    });

    it.each(['origin', '\0refs/heads/main', 'origin\0', 'origin\0refs/heads/main\0extra'])('rejects malformed records: %j', value => {
        expect(() => parsePushUpstream(value)).toThrow('Invalid Git push upstream record.');
    });
});
