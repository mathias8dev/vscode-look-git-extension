import * as vscode from 'vscode';
import {
    BranchNameInputValidationKind,
    branchNameInputValidation,
    normalizeValidBranchNameInput,
} from '../../core/git/normalize-branch-name';

interface BranchNameInputOptions {
    readonly prompt?: string;
    readonly placeHolder?: string;
    readonly value?: string;
}

export async function showBranchNameInput(options: BranchNameInputOptions): Promise<string | undefined> {
    const input = await vscode.window.showInputBox({
        ...options,
        validateInput(value) {
            const validation = branchNameInputValidation(value);
            if (!validation) { return undefined; }
            return {
                message: validation.message,
                severity: validation.kind === BranchNameInputValidationKind.Error
                    ? vscode.InputBoxValidationSeverity.Error
                    : vscode.InputBoxValidationSeverity.Info,
            };
        },
    });
    return normalizeValidBranchNameInput(input);
}
