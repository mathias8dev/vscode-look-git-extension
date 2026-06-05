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

export class CancellationTokenSource {
    private readonly emitter = new EventEmitter<void>();
    private readonly tokenState = {
        isCancellationRequested: false,
        onCancellationRequested: (listener: () => unknown) => this.emitter.event(listener),
    };
    public readonly token: {
        readonly isCancellationRequested: boolean;
        onCancellationRequested(listener: () => unknown): { readonly dispose: () => void };
    } = this.tokenState;

    cancel(): void {
        this.tokenState.isCancellationRequested = true;
        this.emitter.fire();
    }

    dispose(): void {
        this.emitter.dispose();
    }
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
    registrations: new Map<string, (...args: unknown[]) => unknown>(),
    executeCommand(command: string, ...args: unknown[]) {
        this.calls.push({ command, args });
        const failure = this.failures.get(command);
        if (failure) { return Promise.reject(failure); }
        const registration = this.registrations.get(command);
        return Promise.resolve(registration?.(...args));
    },
    registerCommand(command: string, callback: (...args: unknown[]) => unknown) {
        this.registrations.set(command, callback);
        return { dispose: () => { this.registrations.delete(command); } };
    },
    failCommand(command: string, error: Error) { this.failures.set(command, error); },
    reset() { this.calls = []; this.failures = new Map(); this.registrations = new Map(); },
};

export type CommandCall = typeof commands.calls[number];

interface MockExtension<T> {
    readonly isActive: boolean;
    readonly exports: T;
    activate(): Promise<T>;
}

export const extensions = {
    values: new Map<string, MockExtension<unknown>>(),
    getExtension<T>(id: string): MockExtension<T> | undefined {
        const extension = this.values.get(id);
        // The mock registry stores heterogeneous extension exports keyed by extension id.
        return extension as MockExtension<T> | undefined;
    },
    setExtension<T>(id: string, exportsValue: T): void {
        this.values.set(id, {
            isActive: true,
            exports: exportsValue,
            activate: async () => exportsValue,
        });
    },
    reset(): void {
        this.values = new Map();
    },
};

export const env = {
    clipboard: {
        value: '',
        writeText(value: string) { this.value = value; return Promise.resolve(); },
        readText() { return Promise.resolve(this.value); },
        reset() { this.value = ''; },
    },
};

type MockLanguageModelRequest = {
    readonly messages: readonly unknown[];
    readonly options: unknown;
    readonly token: unknown;
};

type MockLanguageModelChat = {
    readonly vendor: string;
    sendRequest(messages: readonly unknown[], options: unknown, token: unknown): Promise<{ readonly text: AsyncIterable<string> }>;
};

export const LanguageModelChatMessage = {
    User(content: string) {
        return { role: 'user', content };
    },
};

export const lm = {
    models: [] as MockLanguageModelChat[],
    requests: [] as MockLanguageModelRequest[],
    selectChatModels() {
        return Promise.resolve(this.models);
    },
    setResponse(text: string, vendor = 'copilot'): void {
        this.models = [{
            vendor,
            sendRequest: async (messages, options, token) => {
                this.requests.push({ messages, options, token });
                return { text: textChunks(text) };
            },
        }];
    },
    reset(): void {
        this.models = [];
        this.requests = [];
    },
};

async function* textChunks(text: string): AsyncIterable<string> {
    yield text;
}

type MockCancellationToken = {
    readonly isCancellationRequested: boolean;
    onCancellationRequested(listener: () => unknown): { readonly dispose: () => void };
};

type MockProgress = {
    report(value: unknown): void;
};

export const window = {
    errorMessages: [] as string[],
    infoMessages: [] as string[],
    warningMessages: [] as Array<{ message: string; items: string[] }>,
    outputChannels: [] as Array<{ name: string; lines: string[]; shown: boolean }>,
    inputBoxOptions: [] as unknown[],
    inputBoxValue: undefined as string | undefined,
    inputBoxValues: [] as string[],
    quickPickValue: undefined as string | undefined,
    quickPickValues: [] as string[],
    openDialogValue: undefined as TestUri[] | undefined,
    openDialogOptions: [] as unknown[],
    saveDialogValue: undefined as TestUri | undefined,
    saveDialogOptions: [] as unknown[],
    errorChoice: undefined as string | undefined,
    warningChoice: undefined as string | undefined,
    warningChoices: [] as string[],
    shownDocuments: [] as unknown[],
    terminals: [] as Array<{
        name: string;
        cwd: string | undefined;
        hideFromUser: boolean | undefined;
        isTransient: boolean | undefined;
        texts: string[];
        visible: boolean;
    }>,
    showErrorMessage(message: string, ..._items: string[]) { this.errorMessages.push(message); return Promise.resolve(this.errorChoice); },
    showInformationMessage(message: string) { this.infoMessages.push(message); return Promise.resolve(undefined); },
    showWarningMessage(message: string, _opts?: unknown, ...items: string[]) {
        this.warningMessages.push({ message, items });
        return Promise.resolve(this.warningChoices.shift() ?? this.warningChoice);
    },
    showInputBox(options?: unknown) {
        this.inputBoxOptions.push(options);
        return Promise.resolve(this.inputBoxValues.shift() ?? this.inputBoxValue);
    },
    showQuickPick() { return Promise.resolve(this.quickPickValues.shift() ?? this.quickPickValue); },
    showOpenDialog(options: unknown) { this.openDialogOptions.push(options); return Promise.resolve(this.openDialogValue); },
    showSaveDialog(options: unknown) { this.saveDialogOptions.push(options); return Promise.resolve(this.saveDialogValue); },
    showTextDocument(document: unknown) { this.shownDocuments.push(document); return Promise.resolve(undefined); },
    createOutputChannel(name: string) {
        const channel = {
            name,
            lines: [] as string[],
            shown: false,
            appendLine(line: string) { this.lines.push(line); },
            clear() { this.lines = []; },
            show() { this.shown = true; },
            dispose() {},
        };
        this.outputChannels.push(channel);
        return channel;
    },
    createTerminal(options: { name: string; cwd?: string; hideFromUser?: boolean; isTransient?: boolean }) {
        const terminal = {
            name: options.name,
            cwd: options.cwd,
            hideFromUser: options.hideFromUser,
            isTransient: options.isTransient,
            texts: [] as string[],
            visible: false,
            show() { this.visible = true; },
            sendText(text: string) { this.texts.push(text); },
        };
        this.terminals.push(terminal);
        return terminal;
    },
    withProgress(_opts: unknown, task: (progress: MockProgress, token: MockCancellationToken) => unknown) {
        const token: MockCancellationToken = {
            isCancellationRequested: false,
            onCancellationRequested: () => ({ dispose() {} }),
        };
        return Promise.resolve(task({ report() {} }, token));
    },
    reset() {
        this.errorMessages = [];
        this.infoMessages = [];
        this.warningMessages = [];
        this.inputBoxOptions = [];
        this.inputBoxValue = undefined;
        this.inputBoxValues = [];
        this.quickPickValue = undefined;
        this.quickPickValues = [];
        this.openDialogValue = undefined;
        this.openDialogOptions = [];
        this.saveDialogValue = undefined;
        this.saveDialogOptions = [];
        this.errorChoice = undefined;
        this.warningChoice = undefined;
        this.warningChoices = [];
        this.shownDocuments = [];
        this.outputChannels = [];
        this.terminals = [];
    },
};

export type WarningMessage = typeof window.warningMessages[number];

export function resetMockVscode(): void {
    commands.reset();
    extensions.reset();
    env.clipboard.reset();
    lm.reset();
    window.reset();
    workspace.reset();
}

export function setWarningChoice(choice: string | undefined): void {
    window.warningChoice = choice;
}

export function setWarningChoices(choices: readonly string[]): void {
    window.warningChoices = [...choices];
}

export function setInputBoxValue(value: string | undefined): void {
    window.inputBoxValue = value;
}

export function setInputBoxValues(values: readonly string[]): void {
    window.inputBoxValues = [...values];
}

export function setQuickPickValue(value: string | undefined): void {
    window.quickPickValue = value;
}

export function setQuickPickValues(values: readonly string[]): void {
    window.quickPickValues = [...values];
}

export function setErrorChoice(choice: string | undefined): void {
    window.errorChoice = choice;
}

export function getWarningMessages(): readonly WarningMessage[] {
    return window.warningMessages;
}

export function getInputBoxOptions(): readonly unknown[] {
    return window.inputBoxOptions;
}

export function getCommandCalls(): readonly CommandCall[] {
    return commands.calls;
}

export function setBuiltInGitApi(api: unknown): void {
    const enablement = new EventEmitter<boolean>();
    extensions.setExtension('vscode.git', {
        enabled: true,
        onDidChangeEnablement: enablement.event,
        getAPI: () => api,
    });
}

type TextDocumentContentProvider = {
    provideTextDocumentContent(uri: TestUri): string;
};

type TextDocumentOptions = {
    readonly content: string;
    readonly language?: string;
};

type MockTextDocument = {
    readonly content: string;
    readonly language?: string;
    readonly uri?: TestUri;
    readonly isDirty?: boolean;
};

type MockConfigurationChangeEvent = {
    affectsConfiguration(section: string): boolean;
};

export const workspace = {
    values: new Map<string, unknown>(),
    documents: [] as MockTextDocument[],
    contentProviders: new Map<string, TextDocumentContentProvider>(),
    configurationEmitter: new EventEmitter<MockConfigurationChangeEvent>(),
    fs: {
        files: new Map<string, Uint8Array>(),
        writes: [] as Array<{ uri: unknown; content: Uint8Array }>,
        readFile(uri: unknown) {
            const key = typeof uri === 'object' && uri !== null && 'fsPath' in uri && typeof uri.fsPath === 'string'
                ? uri.fsPath
                : String(uri);
            const content = this.files.get(key);
            if (!content) { return Promise.reject(new Error(`File not found: ${key}`)); }
            return Promise.resolve(content);
        },
        writeFile(uri: unknown, content: Uint8Array) { this.writes.push({ uri, content }); return Promise.resolve(); },
        reset() { this.files = new Map(); this.writes = []; },
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
                this.fireConfigurationChanged(k);
                return Promise.resolve();
            },
        };
    },
    onDidChangeConfiguration(listener: (event: MockConfigurationChangeEvent) => unknown) {
        return this.configurationEmitter.event(listener);
    },
    fireConfigurationChanged(...sections: readonly string[]): void {
        const changedSections = new Set(sections);
        this.configurationEmitter.fire({
            affectsConfiguration(section: string): boolean {
                return changedSections.has(section);
            },
        });
    },
    registerTextDocumentContentProvider(scheme: string, provider: TextDocumentContentProvider) {
        this.contentProviders.set(scheme, provider);
        return { dispose: () => { this.contentProviders.delete(scheme); } };
    },
    openTextDocument(input: TextDocumentOptions | TestUri) {
        if (input instanceof TestUri) {
            const provider = this.contentProviders.get(input.scheme);
            const document = {
                uri: input,
                content: provider?.provideTextDocumentContent(input) ?? '',
                language: languageForPath(input.path),
                isDirty: false,
            };
            this.documents.push(document);
            return Promise.resolve(document);
        }
        this.documents.push(input);
        return Promise.resolve(input);
    },
    reset() {
        this.values = new Map();
        this.documents = [];
        this.contentProviders = new Map();
        this.configurationEmitter.dispose();
        this.configurationEmitter = new EventEmitter<MockConfigurationChangeEvent>();
        this.fs.reset();
    },
};

function languageForPath(path: string): string | undefined {
    if (path.endsWith('.diff')) { return 'diff'; }
    if (path.endsWith('.md')) { return 'markdown'; }
    return undefined;
}
