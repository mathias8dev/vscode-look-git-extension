import { describe, expect, it } from 'vitest';
import { isRepositoryDiscoveryMarkerPath } from '@extension/watchers/repository-discovery-watcher';

describe('repository discovery watcher', () => {
    it('matches repository marker paths that can add or remove discovered repositories', () => {
        expect(isRepositoryDiscoveryMarkerPath('/workspace/app/.git')).toBe(true);
        expect(isRepositoryDiscoveryMarkerPath('/workspace/app/.git/config')).toBe(true);
        expect(isRepositoryDiscoveryMarkerPath('/workspace/app/.git/commondir')).toBe(true);
        expect(isRepositoryDiscoveryMarkerPath('C:\\workspace\\app\\.git\\config')).toBe(true);
    });

    it('ignores ordinary git metadata changes that should only refresh repository data', () => {
        expect(isRepositoryDiscoveryMarkerPath('/workspace/app/.git/HEAD')).toBe(false);
        expect(isRepositoryDiscoveryMarkerPath('/workspace/app/.git/index')).toBe(false);
        expect(isRepositoryDiscoveryMarkerPath('/workspace/app/.git/refs/heads/main')).toBe(false);
        expect(isRepositoryDiscoveryMarkerPath('/workspace/app/.gitignore')).toBe(false);
    });
});
