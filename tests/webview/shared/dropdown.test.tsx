// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Dropdown } from '@webview/shared/dropdown';
import userEvent from '@testing-library/user-event';

const options = [
    { value: 'pick', label: 'Pick' },
    { value: 'squash', label: 'Squash', disabled: true },
    { value: 'drop', label: 'Drop' },
] as const;

describe('Dropdown', () => {
    it('renders options and emits typed values without a native select', () => {
        const onChange = vi.fn<(value: 'pick' | 'squash' | 'drop') => void>();
        const { container } = render(<Dropdown value="pick" ariaLabel="Action" options={options} onChange={onChange} />);
        const trigger = screen.getByRole('combobox', { name: 'Action' });
        expect(container.querySelector('select')).toBeNull();
        fireEvent.click(trigger);
        expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'Pick' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('option', { name: 'Squash' })).toBeDisabled();
        fireEvent.click(screen.getByRole('option', { name: 'Drop' }));
        expect(onChange).toHaveBeenCalledExactlyOnceWith('drop');
        expect(trigger).toHaveFocus();
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    it('filters locally, skips disabled options with the keyboard, and restores focus on Escape', () => {
        const onChange = vi.fn();
        render(<Dropdown value="pick" ariaLabel="Action" options={options} searchable onChange={onChange} />);
        const trigger = screen.getByRole('combobox');
        fireEvent.keyDown(trigger, { key: 'ArrowDown' });
        const search = screen.getByRole('searchbox', { name: 'Search action' });
        expect(search).toHaveFocus();
        fireEvent.keyDown(search, { key: 'ArrowDown' });
        expect(search).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'Drop' }).id);
        fireEvent.keyDown(search, { key: 'Enter' });
        expect(onChange).toHaveBeenCalledWith('drop');
        fireEvent.click(trigger);
        fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'DRoP' } });
        expect(screen.getAllByRole('option')).toHaveLength(1);
        fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'missing' } });
        expect(screen.getByRole('status')).toHaveTextContent('No matching options.');
        fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' });
        expect(trigger).toHaveFocus();
        fireEvent.click(trigger);
        expect(screen.getByRole('searchbox')).toHaveValue('');
        fireEvent.pointerDown(document.body);
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('delegates remote search and pagination without filtering server results a second time', () => {
        const onSearch = vi.fn();
        const onLoadMore = vi.fn();
        const onOpen = vi.fn();
        const { rerender } = render(<Dropdown value="external" displayValue="Selected branch" ariaLabel="Branch" searchable options={options}
            onSearch={onSearch} onLoadMore={onLoadMore} onOpen={onOpen} onChange={() => undefined} />);
        expect(screen.getByRole('combobox')).toHaveTextContent('Selected branch');
        fireEvent.click(screen.getByRole('combobox'));
        expect(onOpen).toHaveBeenCalledOnce();
        fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'topic' } });
        expect(onSearch).toHaveBeenCalledWith('topic');
        expect(screen.getAllByRole('option')).toHaveLength(3);
        fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
        expect(onLoadMore).toHaveBeenCalledWith('topic');
        rerender(<Dropdown value="external" ariaLabel="Branch" searchable options={[]} loading onChange={() => undefined} />);
        expect(screen.getByRole('listbox')).toHaveAttribute('aria-busy', 'true');
        expect(screen.getByRole('status')).toHaveTextContent('Loading');
    });

    it('does not open a disabled dropdown', () => {
        const onOpen = vi.fn();
        render(<Dropdown value="pick" ariaLabel="Action" options={options} disabled onOpen={onOpen} onChange={() => undefined} />);
        fireEvent.click(screen.getByRole('combobox'));
        expect(onOpen).not.toHaveBeenCalled();
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('returns Tab navigation to the next control after searching', async () => {
        const user = userEvent.setup();
        render(<><Dropdown value="pick" ariaLabel="Action" searchable options={options} onChange={() => undefined} /><button>Next control</button></>);
        await user.click(screen.getByRole('combobox'));
        expect(screen.getByRole('searchbox')).toHaveFocus();
        await user.tab();
        expect(screen.getByRole('button', { name: 'Next control' })).toHaveFocus();
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
});
