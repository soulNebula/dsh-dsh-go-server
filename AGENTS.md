# Repository agent guide

This file governs the whole `dsh-remote-server` repository.

## Identity

- Package: `dsh-remote-server`
- Display name: `远程服务`
- DSH rows: `dsh-remote-server` (host) and `preset-dsh-remote-server` (conversation preset), inserted by `cordis.patch.yml`.
- RPC channel: `/remote-server`
- Data directory: `$DSH_HOME/dsh-remote-server/`
- Domain: manage the self-hosted ds-harness-remote Server that lives in
  `apps/server` of a user-chosen root directory (default `C:\dsh-remote`).

## Boundaries

- `src/core/` is pure logic shared by host, browser and tests. No `node:*`, DOM, `fetch`, `process`, or `eval`.
- `src/host/` owns IO and orchestration: process discovery, `.env` persistence, health probes, the Server HTTP API.
- Start / stop / restart wait on a health probe, so they run through `jobs.start`; the page polls with `follow()`.
- `src/agent.js` is a thin tool layer over `src/host/runtime.js`; it never reads/writes the store directly.
- `src/ui/` talks to the host only through `src/ui/api.js`.
- Generated `lib/` is produced by `pnpm run build`; do not hand-edit it.

## Security

- The account password never leaves the host: responses only carry `passwordSet: true`.
- Server sessions live in memory only; never persist or return the token.
- Device descriptors are normalised in `core` so identity keys cannot reach the browser.
- `.env` writes touch only the requested keys and are atomic (temp file + rename).
- User text never becomes a file path; ids do.

## Commands

```bash
pnpm install
pnpm test
pnpm run build
pnpm run check
```

Verify host changes with a running `dsh --profile web` in a scratch `DSH_HOME`;
the daily profile is for the final install only.

## Validation

- `pnpm test` covers core models, the RPC envelope and the packaging contract.
- A new browser endpoint must exist in the host route table.
- After a host change, restart DSH completely; refreshing the page is not enough.
