import { escapeHtml } from './graphRenderer';
import type { GraphData, GraphFilterState } from './graphTypes';

interface GraphFilterDeps {
    getData(): GraphData | null;
    getState(): GraphFilterState;
    setState(state: GraphFilterState): void;
    getSelectedBranch(): string | null;
    setSelectedBranch(branch: string | null): void;
    requestGraphData(): void;
    renderBranchPane(): void;
    renderGraphTable(): void;
}

let activeDropdown: HTMLElement | null = null;

export function createInitialGraphFilterState(): GraphFilterState {
    return {
        search: '',
        authors: [],
        dateFrom: null,
        dateTo: null,
        path: null,
    };
}

export function createGraphFilterController(deps: GraphFilterDeps): { render(): void } {
    function render(): void {
        const bar = document.getElementById('filter-bar')!;
        const state = deps.getState();
        const selectedBranch = deps.getSelectedBranch();
        let html = '';

        if (selectedBranch) {
            html += `<button type="button" class="filter-chip active" data-filter="branch">
                Branch: <strong>${escapeHtml(truncate(selectedBranch, 20))}</strong>
                <span class="filter-chip-clear" data-clear="branch">&times;</span>
            </button>`;
        } else {
            html += '<button type="button" class="filter-chip" data-filter="branch">Branch</button>';
        }

        if (state.authors.length > 0) {
            const label = state.authors.length === 1
                ? truncate(state.authors[0], 15)
                : `${state.authors.length} users`;
            html += `<button type="button" class="filter-chip active" data-filter="user">
                User: <strong>${escapeHtml(label)}</strong>
                <span class="filter-chip-clear" data-clear="user">&times;</span>
            </button>`;
        } else {
            html += '<button type="button" class="filter-chip" data-filter="user">User &#9662;</button>';
        }

        if (state.dateFrom || state.dateTo) {
            const label = formatDateRange(state.dateFrom, state.dateTo);
            html += `<button type="button" class="filter-chip active" data-filter="date">
                Date: <strong>${escapeHtml(label)}</strong>
                <span class="filter-chip-clear" data-clear="date">&times;</span>
            </button>`;
        } else {
            html += '<button type="button" class="filter-chip" data-filter="date">Date &#9662;</button>';
        }

        if (state.path) {
            html += `<button type="button" class="filter-chip active" data-filter="paths">
                Paths: <strong>${escapeHtml(truncate(state.path, 18))}</strong>
                <span class="filter-chip-clear" data-clear="paths">&times;</span>
            </button>`;
        } else {
            html += '<button type="button" class="filter-chip" data-filter="paths">Paths &#9662;</button>';
        }

        bar.innerHTML = html;
        wireFilterBarHandlers(bar, deps, render);
    }

    return { render };
}

function closeDropdown(): void {
    if (activeDropdown) {
        activeDropdown.remove();
        activeDropdown = null;
    }
}

function showUserDropdown(
    anchorEl: HTMLElement,
    authors: string[],
    deps: GraphFilterDeps,
    render: () => void,
): void {
    closeDropdown();

    const rect = anchorEl.getBoundingClientRect();
    const dropdown = document.createElement('div');
    dropdown.className = 'filter-dropdown user-dropdown';
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.top = `${rect.bottom + 2}px`;

    const currentUser = deps.getData()?.currentUser || '';
    const selected = new Set(deps.getState().authors);
    let html = '';

    if (currentUser) {
        const meChecked = selected.has(currentUser) ? ' checked' : '';
        html += `<label class="filter-dropdown-check me-option">
            <input type="checkbox" value="${escapeHtml(currentUser)}"${meChecked} />
            <span>Me</span>
            <span class="me-name">(${escapeHtml(currentUser)})</span>
        </label>`;
        html += '<div class="user-dropdown-separator"></div>';
    }

    for (const author of authors) {
        const checked = selected.has(author) ? ' checked' : '';
        html += `<label class="filter-dropdown-check">
            <input type="checkbox" value="${escapeHtml(author)}"${checked} />
            <span>${escapeHtml(author)}</span>
        </label>`;
    }

    dropdown.innerHTML = html;
    document.body.appendChild(dropdown);
    activeDropdown = dropdown;
    fitDropdown(dropdown, rect);

    dropdown.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        cb.addEventListener('change', () => {
            const checkbox = cb as HTMLInputElement;
            const next = new Set(deps.getState().authors);
            if (checkbox.checked) {
                next.add(checkbox.value);
            } else {
                next.delete(checkbox.value);
            }

            dropdown.querySelectorAll('input[type="checkbox"]').forEach((other) => {
                const otherCb = other as HTMLInputElement;
                if (otherCb !== checkbox && otherCb.value === checkbox.value) {
                    otherCb.checked = checkbox.checked;
                }
            });

            deps.setState({ ...deps.getState(), authors: [...next] });
            render();
            deps.renderGraphTable();
            deps.requestGraphData();
        });
    });

    keepDropdownOpenUntilOutsideClick(dropdown);
}

function showDateDropdown(anchorEl: HTMLElement, deps: GraphFilterDeps, render: () => void): void {
    closeDropdown();

    const state = deps.getState();
    const rect = anchorEl.getBoundingClientRect();
    const dropdown = document.createElement('div');
    dropdown.className = 'filter-dropdown date-dropdown';
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.top = `${rect.bottom + 2}px`;
    dropdown.innerHTML = `
        <div class="date-field"><label>From</label><input type="date" id="filter-date-from" value="${state.dateFrom || ''}" /></div>
        <div class="date-field"><label>To</label><input type="date" id="filter-date-to" value="${state.dateTo || ''}" /></div>
        <div class="date-actions">
            <button id="date-apply-btn">Apply</button>
            <button id="date-clear-btn">Clear</button>
        </div>
    `;

    document.body.appendChild(dropdown);
    activeDropdown = dropdown;

    dropdown.querySelector('#date-apply-btn')!.addEventListener('click', (e) => {
        e.stopPropagation();
        const from = (dropdown.querySelector('#filter-date-from') as HTMLInputElement).value;
        const to = (dropdown.querySelector('#filter-date-to') as HTMLInputElement).value;
        deps.setState({ ...deps.getState(), dateFrom: from || null, dateTo: to || null });
        closeDropdown();
        render();
        deps.renderGraphTable();
        deps.requestGraphData();
    });

    dropdown.querySelector('#date-clear-btn')!.addEventListener('click', (e) => {
        e.stopPropagation();
        deps.setState({ ...deps.getState(), dateFrom: null, dateTo: null });
        closeDropdown();
        render();
        deps.renderGraphTable();
        deps.requestGraphData();
    });

    keepDropdownOpenUntilOutsideClick(dropdown);
}

function showPathInput(anchorEl: HTMLElement, deps: GraphFilterDeps, render: () => void): void {
    closeDropdown();

    const rect = anchorEl.getBoundingClientRect();
    const dropdown = document.createElement('div');
    dropdown.className = 'filter-dropdown path-dropdown';
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.top = `${rect.bottom + 2}px`;
    dropdown.innerHTML = `
        <div class="path-field">
            <input type="text" id="filter-path-input" placeholder="e.g. src/commands" value="${escapeHtml(deps.getState().path || '')}" />
        </div>
        <div class="date-actions">
            <button id="path-apply-btn">Apply</button>
            <button id="path-clear-btn">Clear</button>
        </div>
    `;

    document.body.appendChild(dropdown);
    activeDropdown = dropdown;

    const input = dropdown.querySelector('#filter-path-input') as HTMLInputElement;
    input.focus();

    const apply = () => {
        deps.setState({ ...deps.getState(), path: input.value || null });
        closeDropdown();
        render();
        deps.requestGraphData();
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            apply();
        }
    });

    dropdown.querySelector('#path-apply-btn')!.addEventListener('click', (e) => {
        e.stopPropagation();
        apply();
    });

    dropdown.querySelector('#path-clear-btn')!.addEventListener('click', (e) => {
        e.stopPropagation();
        deps.setState({ ...deps.getState(), path: null });
        closeDropdown();
        render();
        deps.requestGraphData();
    });

    keepDropdownOpenUntilOutsideClick(dropdown);
}

function wireFilterBarHandlers(
    bar: HTMLElement,
    deps: GraphFilterDeps,
    render: () => void,
): void {
    bar.querySelectorAll('.filter-chip').forEach((el) => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const filter = (el as HTMLElement).dataset.filter!;
            switch (filter) {
                case 'user':
                    showUserDropdown(el as HTMLElement, getUniqueAuthors(deps), deps, render);
                    break;
                case 'date':
                    showDateDropdown(el as HTMLElement, deps, render);
                    break;
                case 'paths':
                    showPathInput(el as HTMLElement, deps, render);
                    break;
            }
        });
    });

    bar.querySelectorAll('.filter-chip-clear').forEach((el) => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const clear = (el as HTMLElement).dataset.clear!;
            clearFilter(clear, deps);
            render();
            deps.renderGraphTable();
        });
    });
}

function clearFilter(clear: string, deps: GraphFilterDeps): void {
    const state = deps.getState();
    switch (clear) {
        case 'branch':
            deps.setSelectedBranch(null);
            deps.requestGraphData();
            deps.renderBranchPane();
            break;
        case 'user':
            deps.setState({ ...state, authors: [] });
            deps.requestGraphData();
            break;
        case 'date':
            deps.setState({ ...state, dateFrom: null, dateTo: null });
            deps.requestGraphData();
            break;
        case 'paths':
            deps.setState({ ...state, path: null });
            deps.requestGraphData();
            break;
    }
}

function getUniqueAuthors(deps: GraphFilterDeps): string[] {
    const graphData = deps.getData();
    if (!graphData) { return []; }

    const authors = new Set<string>();
    for (const row of graphData.rows) {
        authors.add(row.commit.authorName);
    }
    return [...authors].sort((a, b) => a.localeCompare(b));
}

function fitDropdown(dropdown: HTMLElement, anchorRect: DOMRect): void {
    const dropRect = dropdown.getBoundingClientRect();
    if (dropRect.right > window.innerWidth) {
        dropdown.style.left = `${window.innerWidth - dropRect.width - 4}px`;
    }
    if (dropRect.bottom > window.innerHeight) {
        dropdown.style.maxHeight = `${window.innerHeight - anchorRect.bottom - 8}px`;
    }
}

function keepDropdownOpenUntilOutsideClick(dropdown: HTMLElement): void {
    dropdown.addEventListener('click', (e) => e.stopPropagation());
    setTimeout(() => {
        const close = () => {
            closeDropdown();
            document.removeEventListener('click', close);
        };
        document.addEventListener('click', close);
    }, 0);
}

function truncate(str: string, maxLen: number): string {
    return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
}

function formatDateRange(from: string | null, to: string | null): string {
    if (from && to) { return `${from} \u2013 ${to}`; }
    if (from) { return `from ${from}`; }
    if (to) { return `until ${to}`; }
    return '';
}
