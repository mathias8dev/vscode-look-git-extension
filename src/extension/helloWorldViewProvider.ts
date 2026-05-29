import * as vscode from 'vscode';
import { bindHelloWorldMessages, configureHelloWorldWebview } from './helloWorldWebview';

type HelloWorldViewProviderOptions = {
    readonly extensionUri: vscode.Uri;
    readonly greeting: string;
};

export class HelloWorldViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'lookGit.helloView';

    private readonly extensionUri: vscode.Uri;
    private readonly greeting: string;

    public constructor(options: HelloWorldViewProviderOptions) {
        this.extensionUri = options.extensionUri;
        this.greeting = options.greeting;
    }

    public resolveWebviewView(webviewView: vscode.WebviewView): void {
        configureHelloWorldWebview(webviewView.webview, this.extensionUri);
        const messageSubscription = bindHelloWorldMessages(webviewView.webview, this.greeting);
        webviewView.onDidDispose(() => messageSubscription.dispose());
    }
}
