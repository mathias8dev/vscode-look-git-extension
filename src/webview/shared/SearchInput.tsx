import type { Ref } from 'react';

interface SearchInputProps {
    readonly className?: string;
    readonly inputRef?: Ref<HTMLInputElement>;
    readonly value: string;
    readonly placeholder: string;
    readonly ariaLabel: string;
    readonly onChange: (value: string) => void;
}

export function SearchInput({ className, inputRef, value, placeholder, ariaLabel, onChange }: SearchInputProps) {
    return (
        <div className={['search-field', className].filter(Boolean).join(' ')}>
            <i className="codicon codicon-search search-field-icon" aria-hidden="true" />
            <input
                ref={inputRef}
                type="search"
                className="search-field-input"
                value={value}
                placeholder={placeholder}
                aria-label={ariaLabel}
                onChange={(event) => onChange(event.currentTarget.value)}
            />
        </div>
    );
}
