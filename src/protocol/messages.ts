export type ExtensionToWebviewMessage = {
    readonly type: 'hello';
    readonly message: string;
};

export type WebviewToExtensionMessage = {
    readonly type: 'ready';
};
