# Contributing to Knowit

Thanks for contributing.

## Development

Requirements:

- Node.js 20+
- npm

Setup:

```bash
npm ci
npm test
```

## Release Checks

Before opening a pull request or cutting a release, run:

```bash
npm test
npm run pack:smoke
```

This repository intentionally tracks `.mcp.json` so Knowit can use itself during development. Do not remove it unless the development workflow changes and the README is updated at the same time.

## Pull Requests

- Keep changes focused and explain the user-facing impact.
- Add or update tests when behavior changes.
- Update documentation when setup, configuration, or public behavior changes.
- Do not commit secrets or local environment files.

## Issues

Bug reports are most useful when they include:

- what you ran
- what you expected
- what happened instead
- your Node.js version
- any relevant logs or reproduction steps
