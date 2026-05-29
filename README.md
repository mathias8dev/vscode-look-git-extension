# Look Git

Experimental VS Code extension shell built with React.

## Development

```sh
npm ci
npm run compile
npm test
npm run test:integration
npm run test:e2e
```

Run the `Look Git: Hello World` command from VS Code to open the React webview,
or use the Look Git icon in the Activity Bar.

## Architecture

- `src/core`: framework-free domain logic.
- `src/protocol`: typed messages between the extension host and webview.
- `src/extension`: VS Code integration and side effects.
- `src/webview`: React UI.
