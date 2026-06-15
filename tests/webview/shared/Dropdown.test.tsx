// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Dropdown } from '../../../src/webview/shared/Dropdown';

describe('Dropdown', () => {
    it('renders options and emits typed selected values', () => {
        const onChange = vi.fn<(value: 'pick' | 'drop') => void>();

        render(
            <Dropdown
                value="pick"
                ariaLabel="Action"
                options={[
                    { value: 'pick', label: 'Pick' },
                    { value: 'drop', label: 'Drop' },
                ]}
                onChange={onChange}
            />,
        );

        fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'drop' } });

        expect(onChange).toHaveBeenCalledWith('drop');
    });
});
