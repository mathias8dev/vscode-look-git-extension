import * as vscode from 'vscode';
import type { API, GitExtension } from '../types/git';

export async function getBuiltInGitApi(): Promise<API | undefined> {
    const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git');

    if (!gitExtension) {
        return undefined;
    }

    if (!gitExtension.isActive) {
        await gitExtension.activate();
    }

    const git = gitExtension.exports;

    if (!git.enabled) {
        return new Promise<API | undefined>((resolve) => {
            const disposable = git.onDidChangeEnablement((enabled) => {
                if (enabled) {
                    disposable.dispose();
                    resolve(git.getAPI(1));
                }
            });
            setTimeout(() => {
                disposable.dispose();
                resolve(undefined);
            }, 10000);
        });
    }

    return git.getAPI(1);
}
