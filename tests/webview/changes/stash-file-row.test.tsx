// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StashFileEntry } from '../../../src/protocol/changes/types';
import { StashFileRow } from '../../../src/webview/features/changes/StashFileRow';

describe('StashFileRow', () => {
    it('opens the stash diff when clicking the file row', () => {
        const onDiff = vi.fn<(index: number, file: StashFileEntry) => void>();
        const file = stashFile();

        render(<StashFileRow index={0} file={file} onDiff={onDiff} />);
        fireEvent.click(screen.getByTitle('src/stashed.ts'));

        expect(onDiff).toHaveBeenCalledWith(0, file);
    });

    it('opens the stash diff from keyboard activation', () => {
        const onDiff = vi.fn<(index: number, file: StashFileEntry) => void>();
        const file = stashFile();

        render(<StashFileRow index={2} file={file} onDiff={onDiff} />);
        fireEvent.keyDown(screen.getByTitle('src/stashed.ts'), { key: 'Enter' });
        fireEvent.keyDown(screen.getByTitle('src/stashed.ts'), { key: ' ' });

        expect(onDiff).toHaveBeenCalledTimes(2);
        expect(onDiff).toHaveBeenCalledWith(2, file);
    });

    it('does not double-open when clicking the explicit diff button', () => {
        const onDiff = vi.fn<(index: number, file: StashFileEntry) => void>();
        const file = stashFile();

        render(<StashFileRow index={1} file={file} onDiff={onDiff} />);
        fireEvent.click(screen.getByRole('button', { name: 'Open stash diff' }));

        expect(onDiff).toHaveBeenCalledOnce();
        expect(onDiff).toHaveBeenCalledWith(1, file);
    });
});

function stashFile(): StashFileEntry {
    return { status: 'M', filePath: 'src/stashed.ts' };
}
