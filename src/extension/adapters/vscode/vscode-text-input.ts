import * as vscode from 'vscode';
import type { TextInputOptions, TextInputPort } from '../../../application/ports/text-input';

export class VscodeTextInput implements TextInputPort {
    showInput(options: TextInputOptions): Promise<string | undefined> {
        return Promise.resolve(vscode.window.showInputBox({
            prompt: options.prompt,
            value: options.value,
            placeHolder: options.placeHolder,
        }));
    }
}
