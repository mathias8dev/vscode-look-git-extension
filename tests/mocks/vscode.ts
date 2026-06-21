// VS Code API mock for unit tests — mirrors the real API surface used by this extension

import { readFileSync } from 'node:fs';
import { resetErrorOutputChannel } from '@extension/messaging/error-output-channel';

export const TreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 } as const;
export const ProgressLocation = { Notification: 15 } as const;
export const InputBoxValidationSeverity = { Info: 1, Warning: 2, Error: 3 } as const;
export const ViewColumn = { Active: -1, Beside: -2, One: 1 } as const;

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

export class Position {
    constructor(public line: number, public character: number) {}
}

export class Selection {
    constructor(public anchor: Position, public active: Position) {}
}

export class TabInputText {
    constructor(public uri: TestUri) {}
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
    from(components: { scheme: string; path?: string; query?: string }) {
        const pathValue = components.path ?? '';
        const query = components.query ?? '';
        const fsPath = components.scheme === 'file' ? pathValue.replace(/\//g, '\\') : pathValue;
        return new TestUri(components.scheme, pathValue, fsPath, query);
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

type MockTextDocument = {
    content: string;
    language?: string;
    languageId?: string;
    readonly uri: TestUri;
    isDirty: boolean;
    saveCount: number;
    getText(): string;
    positionAt(offset: number): Position;
    save(): Promise<boolean>;
};

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
    activeTextEditor: undefined as { readonly document: MockTextDocument; selection?: Selection } | undefined,
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
    tabGroups: {
        all: [] as Array<{ tabs: Array<{ input: TabInputText }> }>,
        closedTabs: [] as unknown[],
        close(tabs: unknown[] | unknown, _preserveFocus?: boolean) {
            const values = Array.isArray(tabs) ? tabs : [tabs];
            this.closedTabs.push(...values);
            for (const value of values) {
                for (const group of this.all) {
                    group.tabs = group.tabs.filter((tab) => tab !== value);
                }
                if (isTabWithTextInput(value)) {
                    const document = workspace.textDocuments.find((candidate) => candidate.uri.toString() === value.input.uri.toString());
                    if (document) { workspace.fireDidCloseTextDocument(document); }
                }
            }
            return Promise.resolve(true);
        },
        reset() {
            this.all = [];
            this.closedTabs = [];
        },
    },
    terminals: [] as Array<{
        name: string;
        cwd: string | undefined;
        hideFromUser: boolean | undefined;
        isTransient: boolean | undefined;
        texts: string[];
        visible: boolean;
    }>,
    webviewPanels: [] as Array<{
        viewType: string;
        title: string;
        showOptions: unknown;
        options: unknown;
        disposed: boolean;
        reveal(column?: unknown): void;
        onDidDispose(listener: () => unknown): { readonly dispose: () => void };
        webview: {
            options: Record<string, unknown>;
            html: string;
            cspSource: string;
            messages: unknown[];
            messageHandler: ((message: unknown) => void) | undefined;
            postMessage(message: unknown): Promise<boolean>;
            onDidReceiveMessage(listener: (message: unknown) => unknown): { readonly dispose: () => void };
            asWebviewUri(uri: TestUri): TestUri;
        };
        dispose(): void;
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
    showTextDocument(document: MockTextDocument) {
        this.shownDocuments.push(document);
        const editor = { document, selection: undefined as Selection | undefined };
        this.activeTextEditor = editor;
        const tab = { input: new TabInputText(document.uri) };
        if (this.tabGroups.all.length === 0) {
            this.tabGroups.all.push({ tabs: [] });
        }
        this.tabGroups.all[0]?.tabs.push(tab);
        return Promise.resolve(editor);
    },
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
    createWebviewPanel(viewType: string, title: string, showOptions: unknown, options: unknown) {
        const disposeEmitter = new EventEmitter<void>();
        const panel = {
            viewType,
            title,
            showOptions,
            options,
            disposed: false,
            reveal(_column?: unknown) {},
            onDidDispose(listener: () => unknown) { return disposeEmitter.event(listener); },
            webview: {
                options: {},
                html: '',
                cspSource: 'vscode-webview:',
                messages: [] as unknown[],
                messageHandler: undefined as ((message: unknown) => void) | undefined,
                postMessage(message: unknown): Promise<boolean> {
                    this.messages.push(message);
                    return Promise.resolve(true);
                },
                onDidReceiveMessage(listener: (message: unknown) => unknown) {
                    this.messageHandler = (message: unknown) => { listener(message); };
                    return { dispose() {} };
                },
                asWebviewUri(uri: TestUri): TestUri { return uri; },
            },
            dispose() {
                if (this.disposed) { return; }
                this.disposed = true;
                disposeEmitter.fire();
            },
        };
        this.webviewPanels.push(panel);
        return panel;
    },
    withProgress(_opts: unknown, task: (progress: MockProgress, token: MockCancellationToken) => unknown) {
        const token: MockCancellationToken = {
            isCancellationRequested: false,
            onCancellationRequested: () => ({ dispose() {} }),
        };
        return Promise.resolve(task({ report() {} }, token));
    },
    reset() {
        this.activeTextEditor = undefined;
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
        this.tabGroups.reset();
        this.outputChannels = [];
        this.terminals = [];
        this.webviewPanels = [];
    },
};

export const languages = {
    setTextDocumentLanguage(document: MockTextDocument, languageId: string) {
        document.language = languageId;
        document.languageId = languageId;
        return Promise.resolve(document);
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
    resetErrorOutputChannel();
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

type MockConfigurationChangeEvent = {
    affectsConfiguration(section: string): boolean;
};

export const workspace = {
    values: new Map<string, unknown>(),
    documents: [] as MockTextDocument[],
    contentProviders: new Map<string, TextDocumentContentProvider>(),
    configurationEmitter: new EventEmitter<MockConfigurationChangeEvent>(),
    closeEmitter: new EventEmitter<MockTextDocument>(),
    get textDocuments(): readonly MockTextDocument[] {
        return this.documents;
    },
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
    onDidCloseTextDocument(listener: (document: MockTextDocument) => unknown) {
        return this.closeEmitter.event(listener);
    },
    fireDidCloseTextDocument(document: MockTextDocument): void {
        this.closeEmitter.fire(document);
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
            const document = createMockTextDocument({
                uri: input,
                content: provider?.provideTextDocumentContent(input) ?? readFileContent(input),
                language: languageForPath(input.path),
            });
            this.documents.push(document);
            return Promise.resolve(document);
        }
        const document = createMockTextDocument({ content: input.content, language: input.language });
        this.documents.push(document);
        return Promise.resolve(document);
    },
    reset() {
        this.values = new Map();
        this.documents = [];
        this.contentProviders = new Map();
        this.configurationEmitter.dispose();
        this.configurationEmitter = new EventEmitter<MockConfigurationChangeEvent>();
        this.closeEmitter.dispose();
        this.closeEmitter = new EventEmitter<MockTextDocument>();
        this.fs.reset();
    },
};

function createMockTextDocument(input: {
    readonly content: string;
    readonly language?: string;
    readonly uri?: TestUri;
}): MockTextDocument {
    return {
        content: input.content,
        language: input.language,
        languageId: input.language,
        uri: input.uri ?? Uri.parse(`untitled:${workspace.documents.length}`),
        isDirty: false,
        saveCount: 0,
        getText() { return this.content; },
        positionAt(offset: number) {
            const safeOffset = Math.max(0, Math.min(offset, this.content.length));
            const before = this.content.slice(0, safeOffset);
            const lines = before.split(/\r?\n/);
            return new Position(lines.length - 1, lines.at(-1)?.length ?? 0);
        },
        save() {
            this.saveCount += 1;
            this.isDirty = false;
            return Promise.resolve(true);
        },
    };
}

function readFileContent(uri: TestUri): string {
    if (uri.scheme !== 'file') { return ''; }
    try {
        return readFileSync(uri.fsPath, 'utf8');
    } catch {
        return '';
    }
}

function isTabWithTextInput(value: unknown): value is { readonly input: TabInputText } {
    return typeof value === 'object'
        && value !== null
        && 'input' in value
        && value.input instanceof TabInputText;
}

function languageForPath(path: string): string | undefined {
    if (path.endsWith('.diff')) { return 'diff'; }
    if (path.endsWith('.md')) { return 'markdown'; }
    return undefined;
}
