import type { ChangeEvent, MouseEventHandler } from 'react';

export interface DropdownOption<TValue extends string> {
    readonly value: TValue;
    readonly label: string;
    readonly disabled?: boolean;
}

interface DropdownProps<TValue extends string> {
    readonly value: TValue;
    readonly options: readonly DropdownOption<TValue>[];
    readonly ariaLabel: string;
    readonly disabled?: boolean;
    readonly className?: string;
    readonly onChange: (value: TValue) => void;
    readonly onClick?: MouseEventHandler<HTMLSelectElement>;
}

export function Dropdown<TValue extends string>({
    value,
    options,
    ariaLabel,
    disabled = false,
    className,
    onChange,
    onClick,
}: DropdownProps<TValue>) {
    const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
        onChange(event.target.value as TValue);
    };

    return (
        <select
            className={className}
            value={value}
            aria-label={ariaLabel}
            disabled={disabled}
            onClick={onClick}
            onChange={handleChange}
        >
            {options.map((option) => (
                <option key={option.value} value={option.value} disabled={option.disabled}>
                    {option.label}
                </option>
            ))}
        </select>
    );
}
