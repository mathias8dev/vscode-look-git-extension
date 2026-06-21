// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CommitMessageEditor } from '@webview/commit-message/commit-message-editor';

describe('CommitMessageEditor', () => {
    it('renders generation errors below the action bar', () => {
        render(
            <CommitMessageEditor
                title="Reword commit abc1234"
                message="fix(graph): old message"
                canGenerate
                generating={false}
                generationError="You've reached your monthly credit limit."
                focusToken={0}
                onMessageChange={() => undefined}
                onGenerate={() => undefined}
                onApply={() => undefined}
                onCancel={() => undefined}
            />,
        );

        const alert = screen.getByRole('alert');
        const footer = screen.getByRole('contentinfo');

        expect(alert).toHaveTextContent("You've reached your monthly credit limit.");
        expect(footer).toContainElement(screen.getByRole('button', { name: 'Generate commit message' }));
        expect(footer).toContainElement(screen.getByRole('button', { name: 'Commit' }));
        expect(footer).not.toContainElement(alert);
        expect(Boolean(footer.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    });

    it('routes editor actions through callbacks', () => {
        const onMessageChange = vi.fn<(message: string) => void>();
        const onGenerate = vi.fn();
        const onApply = vi.fn();
        const onCancel = vi.fn();

        render(
            <CommitMessageEditor
                title="Reword commit abc1234"
                message="fix(graph): old message"
                canGenerate
                generating={false}
                generationError={undefined}
                focusToken={0}
                onMessageChange={onMessageChange}
                onGenerate={onGenerate}
                onApply={onApply}
                onCancel={onCancel}
            />,
        );

        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'fix(graph): new message' } });
        fireEvent.click(screen.getByRole('button', { name: 'Generate commit message' }));
        fireEvent.click(screen.getByRole('button', { name: 'Commit' }));
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(onMessageChange).toHaveBeenCalledWith('fix(graph): new message');
        expect(onGenerate).toHaveBeenCalledTimes(1);
        expect(onApply).toHaveBeenCalledTimes(1);
        expect(onCancel).toHaveBeenCalledTimes(1);
    });
});
