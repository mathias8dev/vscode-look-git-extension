interface SelectionCheckboxProps {
    readonly checked: boolean;
    readonly ariaLabel: string;
    readonly className?: string;
    readonly onToggle: () => void;
}

export function SelectionCheckbox({ checked, ariaLabel, className, onToggle }: SelectionCheckboxProps) {
    return (
        <input
            type="checkbox"
            className={`selection-checkbox${className ? ` ${className}` : ''}`}
            aria-label={ariaLabel}
            checked={checked}
            onClick={(event) => event.stopPropagation()}
            onChange={onToggle}
        />
    );
}
