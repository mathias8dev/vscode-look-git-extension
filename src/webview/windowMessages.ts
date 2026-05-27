type MessageHandler = (event: MessageEvent) => void;

const handlerRegistryKey = '__lookGitWebviewMessageHandlers__';

type HandlerRegistry = Record<string, MessageHandler | undefined>;

function getRegistry(): HandlerRegistry {
    const host = window as unknown as {
        [handlerRegistryKey]?: HandlerRegistry;
    };
    host[handlerRegistryKey] ??= {};
    return host[handlerRegistryKey];
}

export function replaceWindowMessageHandler(key: string, handler: MessageHandler): void {
    const registry = getRegistry();
    const previous = registry[key];
    if (previous) {
        window.removeEventListener('message', previous);
    }

    registry[key] = handler;
    window.addEventListener('message', handler);
}
