// VS Code API mock for unit tests — mirrors the real API surface used by this extension

export const TreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 } as const;
export const ProgressLocation = { Notification: 15 } as const;

export class TreeItem {
    public description: unknown;
    public tooltip: unknown;
    public contextValue: unknown;
    public iconPath: unknown;
    public resourceUri: unknown;
    public command: unknown;
    constructor(public label: unknown, public collapsibleState?: unknown) {}
}

export class EventEmitter<T = unknown> {
    private listeners: Array<(event: T) => unknown> = [];
    public event = (listener: (event: T) => unknown) => {
        this.listeners.push(listener);
        return { dispose: () => { this.listeners = this.listeners.filter((l) => l !== listener); } };
    };
    public fire(event?: T): void { for (const l of this.listeners) { l(event as T); } }
    public dispose(): void { this.listeners = []; }
}

export class ThemeIcon {
    public static File = new ThemeIcon('file');
    public static Folder = new ThemeIcon('folder');
    constructor(public id: string, public color?: unknown) {}
}

export class ThemeColor {
    constructor(public id: string) {}
}

export class MarkdownString {
    constructor(public value: string) {}
}

class TestUri {
    constructor(
        public scheme: string,
        public path: string,
        public fsPath: string,
        public query = '',
    ) {}

    with(update: { scheme?: string; path?: string; query?: string }): TestUri {
        const scheme = update.scheme ?? this.scheme;
        const pathValue = update.path ?? this.path;
        const query = update.query ?? this.query;
        const fsPath = scheme === 'file' ? pathValue : this.fsPath;
        return new TestUri(scheme, pathValue, fsPath, query);
    }

    toString(): string {
        const q = this.query ? `?${this.query}` : '';
        return `${this.scheme}:${this.path}${q}`;
    }
}

export const Uri = {
    file(fsPath: string) {
        const normalizedPath = fsPath.replace(/\\/g, '/');
        return new TestUri('file', normalizedPath, fsPath);
    },
    parse(value: string) {
        const match = value.match(/^([^:]+):(.*)$/);
        if (!match) { throw new Error(`Invalid URI: ${value}`); }
        const scheme = match[1];
        const rest = match[2];
        if (!scheme || rest === undefined) { throw new Error(`Invalid URI: ${value}`); }
        const qi = rest.indexOf('?');
        const pathValue = qi === -1 ? rest : rest.substring(0, qi);
        const query = qi === -1 ? '' : rest.substring(qi + 1);
        return new TestUri(scheme, pathValue, value, query);
    },
    joinPath(base: TestUri, ...segments: string[]) {
        const joined = [base.path, ...segments].join('/').replace(/\/+/g, '/');
        return new TestUri(base.scheme, joined, joined, base.query);
    },
};

export const commands = {
    calls: [] as Array<{ command: string; args: unknown[] }>,
    failures: new Map<string, Error>(),
    executeCommand(command: string, ...args: unknown[]) {
        this.calls.push({ command, args });
        const failure = this.failures.get(command);
        return failure ? Promise.reject(failure) : Promise.resolve(undefined);
    },
    failCommand(command: string, error: Error) { this.failures.set(command, error); },
    reset() { this.calls = []; this.failures = new Map(); },
};

export type CommandCall = typeof commands.calls[number];

export const window = {
    errorMessages: [] as string[],
    infoMessages: [] as string[],
    warningMessages: [] as Array<{ message: string; items: string[] }>,
    inputBoxValue: undefined as string | undefined,
    quickPickValue: undefined as string | undefined,
    saveDialogValue: undefined as TestUri | undefined,
    saveDialogOptions: [] as unknown[],
    warningChoice: undefined as string | undefined,
    showErrorMessage(message: string) { this.errorMessages.push(message); return Promise.resolve(undefined); },
    showInformationMessage(message: string) { this.infoMessages.push(message); return Promise.resolve(undefined); },
    showWarningMessage(message: string, _opts?: unknown, ...items: string[]) {
        this.warningMessages.push({ message, items });
        return Promise.resolve(this.warningChoice);
    },
    showInputBox() { return Promise.resolve(this.inputBoxValue); },
    showQuickPick() { return Promise.resolve(this.quickPickValue); },
    showSaveDialog(options: unknown) { this.saveDialogOptions.push(options); return Promise.resolve(this.saveDialogValue); },
    withProgress(_opts: unknown, task: () => unknown) { return Promise.resolve(task()); },
    reset() {
        this.errorMessages = [];
        this.infoMessages = [];
        this.warningMessages = [];
        this.inputBoxValue = undefined;
        this.quickPickValue = undefined;
        this.saveDialogValue = undefined;
        this.saveDialogOptions = [];
        this.warningChoice = undefined;
    },
};

export type WarningMessage = typeof window.warningMessages[number];

export function resetMockVscode(): void {
    commands.reset();
    window.reset();
    workspace.reset();
}

export function setWarningChoice(choice: string | undefined): void {
    window.warningChoice = choice;
}

export function getWarningMessages(): readonly WarningMessage[] {
    return window.warningMessages;
}

export function getCommandCalls(): readonly CommandCall[] {
    return commands.calls;
}

export const workspace = {
    values: new Map<string, unknown>(),
    fs: {
        writes: [] as Array<{ uri: unknown; content: Uint8Array }>,
        writeFile(uri: unknown, content: Uint8Array) { this.writes.push({ uri, content }); return Promise.resolve(); },
        reset() { this.writes = []; },
    },
    getConfiguration(section?: string) {
        return {
            get: (key: string, defaultValue?: unknown) => {
                const k = section ? `${section}.${key}` : key;
                return this.values.has(k) ? this.values.get(k) : defaultValue;
            },
            update: (key: string, value: unknown) => {
                const k = section ? `${section}.${key}` : key;
                this.values.set(k, value);
                return Promise.resolve();
            },
        };
    },
    reset() { this.values = new Map(); this.fs.reset(); },
};
