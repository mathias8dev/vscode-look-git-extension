import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEventHandler } from 'react';
import { Codicon } from '@webview/shared/codicon';
import { Portal } from '@webview/shared/portal';
import { SearchInput } from '@webview/shared/search-input';

export interface DropdownOption<TValue extends string> {
    readonly value: TValue;
    readonly label: string;
    readonly description?: string;
    readonly disabled?: boolean;
}

interface DropdownProps<TValue extends string> {
    readonly value: TValue;
    readonly options: readonly DropdownOption<TValue>[];
    readonly ariaLabel: string;
    readonly disabled?: boolean;
    readonly className?: string;
    readonly searchable?: boolean;
    readonly displayValue?: string;
    readonly searchPlaceholder?: string;
    readonly loading?: boolean;
    readonly onSearch?: (query: string) => void;
    readonly onLoadMore?: (query: string) => void;
    readonly onOpen?: () => void;
    readonly onChange: (value: TValue) => void;
    readonly onClick?: MouseEventHandler<HTMLButtonElement>;
}

export function Dropdown<TValue extends string>({
    value, options, ariaLabel, disabled = false, className, searchable = false, displayValue,
    searchPlaceholder = 'Search options', loading = false, onSearch, onLoadMore, onOpen, onChange, onClick,
}: DropdownProps<TValue>) {
    const [position, setPosition] = useState<CSSProperties>();
    const [query, setQuery] = useState('');
    const [activeValue, setActiveValue] = useState<TValue>();
    const trigger = useRef<HTMLButtonElement>(null);
    const menu = useRef<HTMLDivElement>(null);
    const search = useRef<HTMLInputElement>(null);
    const id = useId();
    const open = position !== undefined && !disabled;
    const normalizedQuery = query.trim().toLowerCase();
    const visibleOptions = searchable && !onSearch
        ? options.filter(option => `${option.label} ${option.value} ${option.description ?? ''}`.toLowerCase().includes(normalizedQuery))
        : options;
    const enabledOptions = visibleOptions.filter(option => !option.disabled);
    const activeOption = enabledOptions.find(option => option.value === activeValue)
        ?? enabledOptions.find(option => option.value === value) ?? enabledOptions[0];
    const activeId = activeOption ? `${id}-option-${visibleOptions.indexOf(activeOption)}` : undefined;
    const label = options.find(option => option.value === value)?.label ?? displayValue ?? value;

    const close = (restoreFocus: boolean) => {
        setPosition(undefined);
        if (restoreFocus) { trigger.current?.focus(); }
    };
    const show = () => {
        if (disabled || !trigger.current) { return; }
        setQuery('');
        setActiveValue(value);
        setPosition(dropdownPosition(trigger.current.getBoundingClientRect()));
        onOpen?.();
    };
    const choose = (option: DropdownOption<TValue>) => {
        if (option.disabled) { return; }
        close(true);
        onChange(option.value);
    };
    const handleKey = (event: KeyboardEvent<HTMLElement>) => {
        if (event.nativeEvent.isComposing) { return; }
        if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(true); return; }
        if (event.key === 'Tab' && open) {
            const movingToLoadMore = event.target === search.current && !event.shiftKey && onLoadMore && !loading;
            const movingBackToSearch = event.target !== search.current && event.target !== trigger.current && event.shiftKey && searchable;
            if (!movingToLoadMore && !movingBackToSearch) {
                if (event.target === trigger.current) { close(false); }
                else {
                    event.preventDefault();
                    close(false);
                    focusAdjacentControl(trigger.current, menu.current, event.shiftKey);
                }
            }
            return;
        }
        if (event.target !== trigger.current && event.target !== search.current) { return; }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || (open && (event.key === 'Home' || event.key === 'End'))) {
            event.preventDefault();
            event.stopPropagation();
            if (!open) { show(); return; }
            const current = enabledOptions.findIndex(option => option.value === activeOption?.value);
            const index = event.key === 'Home' ? 0 : event.key === 'End' ? enabledOptions.length - 1
                : (current + (event.key === 'ArrowDown' ? 1 : -1) + enabledOptions.length) % enabledOptions.length;
            setActiveValue(enabledOptions[index]?.value);
        } else if (event.key === 'Enter' || (event.key === ' ' && event.target === trigger.current)) {
            event.preventDefault();
            event.stopPropagation();
            if (!open) { show(); }
            else if (activeOption) { choose(activeOption); }
        }
    };

    useEffect(() => {
        if (!open) { return; }
        if (searchable) { search.current?.focus(); }
        const outside = (event: Event) => {
            if (event.target instanceof Node && !trigger.current?.contains(event.target) && !menu.current?.contains(event.target)) {
                setPosition(undefined);
            }
        };
        const reposition = (event: Event) => {
            if (event.target instanceof Node && menu.current?.contains(event.target)) { return; }
            if (trigger.current) { setPosition(dropdownPosition(trigger.current.getBoundingClientRect())); }
        };
        document.addEventListener('pointerdown', outside);
        document.addEventListener('focusin', outside);
        window.addEventListener('resize', reposition);
        window.addEventListener('scroll', reposition, true);
        return () => {
            document.removeEventListener('pointerdown', outside);
            document.removeEventListener('focusin', outside);
            window.removeEventListener('resize', reposition);
            window.removeEventListener('scroll', reposition, true);
        };
    }, [open, searchable]);

    useEffect(() => {
        if (open && activeId) { document.getElementById(activeId)?.scrollIntoView?.({ block: 'nearest' }); }
    }, [open, activeId]);

    return <>
        <button type="button" ref={trigger} role="combobox" className={['look-git-dropdown', className].filter(Boolean).join(' ')}
            aria-label={ariaLabel} aria-expanded={open} aria-haspopup="listbox" aria-controls={open ? `${id}-list` : undefined}
            aria-activedescendant={open && !searchable ? activeId : undefined} disabled={disabled} title={label}
            onClick={event => { onClick?.(event); if (open) { close(true); } else { show(); } }} onKeyDown={handleKey}>
            <span className="look-git-dropdown-label">{label}</span><Codicon name="chevron-down" />
        </button>
        {open ? <Portal>
            <div ref={menu} className="look-git-dropdown-menu" style={position} onClick={event => event.stopPropagation()} onKeyDown={handleKey}>
                {searchable ? <div>
                    <SearchInput inputRef={search} value={query} placeholder={searchPlaceholder} ariaLabel={`Search ${ariaLabel.toLowerCase()}`}
                        ariaControls={`${id}-list`} ariaActiveDescendant={activeId}
                        onChange={query => { setQuery(query); setActiveValue(undefined); onSearch?.(query); }} />
                </div> : null}
                <div id={`${id}-list`} role="listbox" aria-label={ariaLabel} aria-busy={loading} className="look-git-dropdown-options">
                    {visibleOptions.map((option, index) => <button type="button" role="option" key={`${option.value}:${index}`} id={`${id}-option-${index}`}
                        aria-label={option.description ? `${option.label}, ${option.description}` : option.label}
                        aria-selected={option.value === value} disabled={option.disabled} tabIndex={-1}
                        className={option.value === activeOption?.value ? 'look-git-dropdown-option-active' : undefined}
                        onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActiveValue(option.value)} onClick={() => choose(option)}>
                        <span>{option.label}</span>{option.description ? <small>{option.description}</small> : null}
                        {option.value === value ? <Codicon name="check" /> : null}
                    </button>)}
                </div>
                {loading ? <div className="look-git-dropdown-status" role="status">Loading…</div>
                    : visibleOptions.length === 0 ? <div className="look-git-dropdown-status" role="status">No matching options.</div> : null}
                {onLoadMore ? <button type="button" className="look-git-dropdown-more" disabled={loading} onClick={() => onLoadMore(query)}>Load more</button> : null}
            </div>
        </Portal> : null}
    </>;
}

function dropdownPosition(rect: DOMRect): CSSProperties {
    const gap = 8;
    const below = window.innerHeight - rect.bottom - gap;
    const above = rect.top - gap;
    const opensAbove = below < 180 && above > below;
    const width = Math.min(Math.max(rect.width, 240), window.innerWidth - gap * 2);
    return {
        left: Math.max(gap, Math.min(rect.left, window.innerWidth - width - gap)),
        width,
        maxHeight: Math.min(360, Math.max(0, opensAbove ? above : below)),
        ...(opensAbove ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
    };
}

function focusAdjacentControl(trigger: HTMLButtonElement | null, menu: HTMLDivElement | null, backwards: boolean): void {
    if (!trigger) { return; }
    const controls = Array.from(document.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]'))
        .filter(element => {
            if (element.tabIndex < 0 || element.matches(':disabled') || element.closest('[hidden], [inert]') || menu?.contains(element)) { return false; }
            for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
                const style = getComputedStyle(ancestor);
                if (style.display === 'none' || style.visibility === 'hidden') { return false; }
            }
            return true;
        });
    const index = controls.indexOf(trigger);
    (controls[index + (backwards ? -1 : 1)] ?? trigger).focus();
}
