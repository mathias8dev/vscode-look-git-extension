import * as vscode from 'vscode';
import { createGreeting } from '../core/hello';
import { openHelloWorldPanel } from './helloWorldPanel';
import { HelloWorldViewProvider } from './helloWorldViewProvider';

export function activate(context: vscode.ExtensionContext): void {
    const greeting = createGreeting('Look Git');
    const viewProvider = new HelloWorldViewProvider({
        extensionUri: context.extensionUri,
        greeting,
    });
    const viewRegistration = vscode.window.registerWebviewViewProvider(
        HelloWorldViewProvider.viewType,
        viewProvider,
    );
    const commandRegistration = vscode.commands.registerCommand('lookGit.helloWorld', () => {
        return openHelloWorldPanel({
            extensionUri: context.extensionUri,
            greeting,
        });
    });

    context.subscriptions.push(viewRegistration, commandRegistration);
}

export function deactivate(): void {
    // VS Code disposes registered commands through extension subscriptions.
}
