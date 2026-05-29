import { escapeHtml } from './graphRenderer';
import type { BranchInfo, GraphData, GraphFilterState } from './graphTypes';

interface GraphFilterDeps {
    getData(): GraphData | null;
    getState(): GraphFilterState;
    setState(state: GraphFilterState): void;
    getSelectedBranches(): string[];
    setSelectedBranches(branches: string[]): void;
    requestGraphData(): void;
    scheduleGraphDataRequest(): void;
    renderBranchPane(): void;
    renderGraphTable(): void;
}

let activeDropdown: HTMLElement | null = null;
let activeDropdownFilter: string | null = null;
let outsideClickCleanup: (() => void) | null = null;
let outsideClickTimer: number | undefined;

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
        const selectedBranches = deps.getSelectedBranches();
        let html = '';

        if (selectedBranches.length > 0) {
            const label = selectedBranches.length === 1
                ? truncate(selectedBranches[0], 20)
                : `${selectedBranches.length} branches`;
            html += `<button type="button" class="filter-chip active" data-filter="branch">
                Branch: <strong>${escapeHtml(label)}</strong>
                <span class="filter-chip-clear" data-clear="branch">&times;</span>
            </button>`;
        } else {
            html += '<button type="button" class="filter-chip" data-filter="branch">Branch &#9662;</button>';
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
    if (outsideClickTimer !== undefined) {
        clearTimeout(outsideClickTimer);
        outsideClickTimer = undefined;
    }
    if (outsideClickCleanup) {
        outsideClickCleanup();
        outsideClickCleanup = null;
    }
    if (activeDropdown) {
        activeDropdown.remove();
        activeDropdown = null;
    }
    activeDropdownFilter = null;
}

function isDropdownOpenForFilter(filter: string): boolean {
    return activeDropdown !== null && activeDropdownFilter === filter;
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
    activeDropdownFilter = 'user';
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
            deps.scheduleGraphDataRequest();
        });
    });

    keepDropdownOpenUntilOutsideClick(dropdown);
}

function showBranchDropdown(
    anchorEl: HTMLElement,
    deps: GraphFilterDeps,
    render: () => void,
): void {
    closeDropdown();

    const graphData = deps.getData();
    const branches = graphData?.branches ?? [];
    const local = branches.filter((branch) => !branch.isRemote);
    const remote = branches.filter((branch) => branch.isRemote);
    const selected = new Set(deps.getSelectedBranches());
    const rect = anchorEl.getBoundingClientRect();
    const dropdown = document.createElement('div');
    dropdown.className = 'filter-dropdown branch-dropdown';
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.top = `${rect.bottom + 2}px`;

    let html = `<label class="filter-dropdown-check all-option">
        <input type="checkbox" data-branch-filter="__all__" value="__all__"${selected.size === 0 ? ' checked' : ''} />
        <span>All</span>
    </label>`;

    html += renderBranchDropdownSection('Local', local, selected);
    html += renderBranchDropdownSection('Remote', remote, selected);

    dropdown.innerHTML = html;
    document.body.appendChild(dropdown);
    activeDropdown = dropdown;
    activeDropdownFilter = 'branch';
    fitDropdown(dropdown, rect);

    dropdown.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        cb.addEventListener('change', () => {
            const checkbox = cb as HTMLInputElement;
            if (checkbox.dataset.branchFilter === '__all__') {
                applySelectedBranches([], branches, dropdown, deps, render);
                return;
            }

            const next = new Set(deps.getSelectedBranches());
            if (checkbox.checked) {
                next.add(checkbox.value);
            } else {
                next.delete(checkbox.value);
            }
            applySelectedBranches([...next], branches, dropdown, deps, render);
        });
    });

    keepDropdownOpenUntilOutsideClick(dropdown);
}

function renderBranchDropdownSection(label: string, branches: BranchInfo[], selected: Set<string>): string {
    if (branches.length === 0) {
        return '';
    }

    let html = `<div class="filter-dropdown-section">${escapeHtml(label)}</div>`;
    for (const branch of branches) {
        const checked = selected.has(branch.name) ? ' checked' : '';
        html += `<label class="filter-dropdown-check">
            <input type="checkbox" data-branch-filter="branch" value="${escapeHtml(branch.name)}"${checked} />
            <span>${escapeHtml(branch.name)}</span>
        </label>`;
    }
    return html;
}

function applySelectedBranches(
    nextBranches: string[],
    availableBranches: BranchInfo[],
    dropdown: HTMLElement,
    deps: GraphFilterDeps,
    render: () => void,
): void {
    const nextSet = new Set(nextBranches);
    const ordered = availableBranches
        .map((branch) => branch.name)
        .filter((branch) => nextSet.has(branch));

    deps.setSelectedBranches(ordered);
    syncBranchDropdownChecks(dropdown, ordered);
    syncBranchPaneSelection(ordered);
    render();
    deps.scheduleGraphDataRequest();
}

function syncBranchDropdownChecks(dropdown: HTMLElement, selectedBranches: string[]): void {
    const selected = new Set(selectedBranches);
    dropdown.querySelectorAll<HTMLInputElement>('input[data-branch-filter]').forEach((checkbox) => {
        checkbox.checked = checkbox.dataset.branchFilter === '__all__'
            ? selected.size === 0
            : selected.has(checkbox.value);
    });
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
    activeDropdownFilter = 'date';

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
    activeDropdownFilter = 'paths';

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
            if (isDropdownOpenForFilter(filter)) {
                closeDropdown();
                return;
            }

            switch (filter) {
                case 'branch':
                    showBranchDropdown(el as HTMLElement, deps, render);
                    break;
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
            deps.setSelectedBranches([]);
            deps.requestGraphData();
            syncBranchPaneSelection([]);
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

function syncBranchPaneSelection(selectedBranches: string[]): void {
    const selected = new Set(selectedBranches);
    document.querySelectorAll<HTMLElement>('#branch-pane .branch-item[data-branch]').forEach((item) => {
        const branch = item.dataset.branch;
        item.classList.toggle('active', branch === '__all__' ? selected.size === 0 : Boolean(branch && selected.has(branch)));
    });
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
    outsideClickTimer = window.setTimeout(() => {
        outsideClickTimer = undefined;
        const close = () => {
            closeDropdown();
        };
        document.addEventListener('click', close);
        outsideClickCleanup = () => document.removeEventListener('click', close);
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
