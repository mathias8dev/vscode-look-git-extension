export function sanitizeVsCodeTestEnvironment(): void {
    delete process.env.ELECTRON_RUN_AS_NODE;

    for (const key of Object.keys(process.env)) {
        if (key.startsWith('VSCODE_')) {
            delete process.env[key];
        }
    }
}
