// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StashItem } from '@webview/features/changes/StashItem';

describe('StashItem', () => {
    it('uses distinct icons for apply and pop stash actions', () => {
        render(
            <StashItem
                stash={{ index: 0, message: 'On main: WIP' }}
                expanded={false}
                files={undefined}
                onToggle={vi.fn()}
                onAction={vi.fn()}
                onFileDiff={vi.fn()}
            />,
        );

        expect(iconClassFor('Apply stash (keep in list)')).toContain('codicon-git-stash-apply');
        expect(iconClassFor('Pop stash (apply and remove)')).toContain('codicon-unarchive');
        expect(iconClassFor('Apply stash (keep in list)')).not.toBe(iconClassFor('Pop stash (apply and remove)'));
    });
});

function iconClassFor(name: string): string {
    const icon = screen.getByRole('button', { name }).querySelector('.codicon');
    if (!(icon instanceof HTMLElement)) { throw new Error(`Expected codicon for ${name}.`); }
    return icon.className;
}
