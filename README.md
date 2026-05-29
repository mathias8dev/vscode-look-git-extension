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

Use the Look Git icon in the Activity Bar for Changes and Commit History, or open
the Git Graph panel view.

## Architecture

- `src/core`: framework-free domain logic.
- `src/protocol`: typed messages between the extension host and webview.
- `src/extension`: VS Code integration and side effects.
- `src/webview`: React UI.
