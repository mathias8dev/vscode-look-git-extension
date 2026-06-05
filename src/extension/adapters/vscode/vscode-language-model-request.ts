import * as vscode from 'vscode';

interface LanguageModelApi {
    selectChatModels(selector?: vscode.LanguageModelChatSelector): Thenable<vscode.LanguageModelChat[]>;
}

const PREFERRED_MODEL_VENDORS = ['copilot', 'github', 'codex', 'openai', 'anthropic', 'claude'];

export async function requestVscodeLanguageModel(prompt: string, justification: string, signal?: AbortSignal): Promise<string> {
    const api = getLanguageModelApi();
    const models = await api.selectChatModels();
    const model = selectPreferredModel(models);
    if (!model) {
        throw new Error('No VS Code language model is available. Install or enable a language model provider such as GitHub Copilot.');
    }

    const tokenSource = new vscode.CancellationTokenSource();
    const abort = () => tokenSource.cancel();
    if (signal?.aborted) { tokenSource.cancel(); }
    signal?.addEventListener('abort', abort, { once: true });

    try {
        const response = await model.sendRequest([
            vscode.LanguageModelChatMessage.User(prompt),
        ], { justification }, tokenSource.token);

        const chunks: string[] = [];
        for await (const chunk of response.text) {
            chunks.push(chunk);
        }
        return chunks.join('');
    } finally {
        signal?.removeEventListener('abort', abort);
        tokenSource.dispose();
    }
}

function getLanguageModelApi(): LanguageModelApi {
    const candidate: unknown = Reflect.get(vscode, 'lm');
    if (!isLanguageModelApi(candidate)) {
        throw new Error('VS Code language model API is not available in this VS Code version.');
    }
    return candidate;
}

function isLanguageModelApi(value: unknown): value is LanguageModelApi {
    return isRecord(value) && typeof value.selectChatModels === 'function';
}

function selectPreferredModel(models: readonly vscode.LanguageModelChat[]): vscode.LanguageModelChat | undefined {
    const preferred = models.find((model) => PREFERRED_MODEL_VENDORS.includes(model.vendor.toLowerCase()));
    return preferred ?? models[0];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
