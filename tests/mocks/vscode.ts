export const TreeItemCollapsibleState = {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
} as const;

export class TreeItem {
    public description: unknown;
    public tooltip: unknown;
    public contextValue: unknown;
    public iconPath: unknown;
    public resourceUri: unknown;
    public command: unknown;

    constructor(public label: unknown, public collapsibleState?: unknown) {}
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
        const query = this.query ? `?${this.query}` : '';
        return `${this.scheme}:${this.path}${query}`;
    }
}

export const Uri = {
    file(fsPath: string) {
        return new TestUri('file', fsPath, fsPath);
    },
    parse(value: string) {
        const match = value.match(/^([^:]+):(.*)$/);
        if (!match) {
            throw new Error(`Invalid URI: ${value}`);
        }
        const [, scheme, rest] = match;
        const queryIndex = rest.indexOf('?');
        const pathValue = queryIndex === -1 ? rest : rest.substring(0, queryIndex);
        const query = queryIndex === -1 ? '' : rest.substring(queryIndex + 1);
        return new TestUri(scheme, pathValue, value, query);
    },
    joinPath(base: TestUri, ...segments: string[]) {
        const joined = [base.path, ...segments]
            .join('/')
            .replace(/\/+/g, '/');
        return new TestUri(base.scheme, joined, joined, base.query);
    },
};

export const commands = {
    calls: [] as Array<{ command: string; args: unknown[] }>,
    failures: new Map<string, Error>(),
    executeCommand(command: string, ...args: unknown[]) {
        this.calls.push({ command, args });
        const failure = this.failures.get(command);
        if (failure) {
            return Promise.reject(failure);
        }
        return Promise.resolve(undefined);
    },
    failCommand(command: string, error: Error) {
        this.failures.set(command, error);
    },
    reset() {
        this.calls = [];
        this.failures = new Map<string, Error>();
    },
};

export const window = {
    errorMessages: [] as string[],
    infoMessages: [] as string[],
    warningMessages: [] as Array<{ message: string; items: string[] }>,
    inputBoxValue: undefined as string | undefined,
    quickPickValue: undefined as string | undefined,
    warningChoice: undefined as string | undefined,
    showErrorMessage(message: string) {
        this.errorMessages.push(message);
        return Promise.resolve(undefined);
    },
    showInformationMessage(message: string) {
        this.infoMessages.push(message);
        return Promise.resolve(undefined);
    },
    showWarningMessage(message: string, _options?: unknown, ...items: string[]) {
        this.warningMessages.push({ message, items });
        return Promise.resolve(this.warningChoice);
    },
    showInputBox() {
        return Promise.resolve(this.inputBoxValue);
    },
    showQuickPick() {
        return Promise.resolve(this.quickPickValue);
    },
    reset() {
        this.errorMessages = [];
        this.infoMessages = [];
        this.warningMessages = [];
        this.inputBoxValue = undefined;
        this.quickPickValue = undefined;
        this.warningChoice = undefined;
    },
};
