import * as vscode from 'vscode';
import { TextInputValidationSeverity, type TextInputOptions, type TextInputPort } from '../../../application/ports/text-input';

export class VscodeTextInput implements TextInputPort {
    showInput(options: TextInputOptions): Promise<string | undefined> {
        return Promise.resolve(vscode.window.showInputBox({
            prompt: options.prompt,
            value: options.value,
            placeHolder: options.placeHolder,
            validateInput: options.validateInput
                ? (value) => {
                    const validation = options.validateInput?.(value);
                    return validation ? {
                        message: validation.message,
                        severity: vscodeSeverity(validation.severity),
                    } : undefined;
                }
                : undefined,
        }));
    }
}

function vscodeSeverity(severity: TextInputValidationSeverity): vscode.InputBoxValidationSeverity {
    switch (severity) {
        case TextInputValidationSeverity.Info:
            return vscode.InputBoxValidationSeverity.Info;
        case TextInputValidationSeverity.Warning:
            return vscode.InputBoxValidationSeverity.Warning;
        case TextInputValidationSeverity.Error:
            return vscode.InputBoxValidationSeverity.Error;
    }
}
