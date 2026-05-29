import type { ExtensionToWebviewMessage } from '../protocol/messages';

type AppProps = {
    readonly message: ExtensionToWebviewMessage | null;
};

export function App({ message }: AppProps) {
    const greeting = message?.type === 'hello' ? message.message : 'Hello World';

    return (
        <main className="app-shell">
            <section className="hero" aria-labelledby="hello-title">
                <p className="eyebrow">Experimental React shell</p>
                <h1 id="hello-title">{greeting}</h1>
                <p className="description">
                    A clean baseline for rebuilding Look Git with predictable data flow.
                </p>
            </section>
        </main>
    );
}
