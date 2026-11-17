# SPFx Sample Upgrade Console

SPFx Sample Upgrade Console is a local web app for browsing the samples in a local clone of a fork of [`pnp/sp-dev-fx-webparts`](https://github.com/pnp/sp-dev-fx-webparts), checking their SPFx versions and upgrade status, and eventually launching upgrades through GitHub. See the [specification](docs/SPEC.md) for the full scope and design.

## Prerequisites

- Node.js 22

## Setup

```sh
npm ci
cp config.example.json config.json
cp .env.example .env
```

Edit `config.json` for your local fork clone and set `GITHUB_TOKEN` in `.env` when needed.

## Commands

```sh
npm run dev
npm test
npm run lint
npm run typecheck
npm run build
npm start
```
