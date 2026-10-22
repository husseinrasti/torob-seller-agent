# Decisions & deviations from the spec

One line per deviation from `docs/01-master-build-spec.md`, with the reason.

| # | Milestone | Decision | Reason |
|---|---|---|---|
| 1 | M0 | Docker base image `node:22-alpine` instead of `node:20-alpine`; CI on Node 22. | `ai@7`, `@ai-sdk/*@4` and `@openrouter/ai-sdk-provider@3` declare `engines.node >= 22` (Node 20 is EOL). |
| 2 | M0 | Vercel AI SDK **v7** (latest stable, `ai@7.0.148`) instead of v5. `stepCountIs` is kept (v7 alias of `isStepCount`); structured output uses `generateText({ output: Output.object(...) })` instead of `generateObject`. | Kickoff asks for latest stable; `generateObject` is the legacy API in v7. |
| 3 | M0 | `postgres:16-alpine` image. | Same major version and contrib extensions (pg_trgm, unaccent), smaller image. |
| 4 | M0 | Host ports are configurable: `DB_PORT` (db), `HTTP_PORT`/`HTTPS_PORT` (Caddy), `PORT` for `pnpm dev` (default 3010). | Dev machine already uses 5432/3000/80; defaults stay 5432/80/443 on a VPS. |
| 5 | M0 | Inside the container, migrate/seed run as esbuild bundles: `node scripts/migrate.cjs`, `docker compose run --rm app node scripts/seed.cjs` (instead of `pnpm migrate` / `pnpm seed`). | The Next standalone runtime image has no pnpm/tsx/devDependencies; bundles keep the image small and non-root. |
| 6 | M0 | Empty optional env vars (e.g. `OPENAI_BASE_URL=`) are deleted at startup (`instrumentation.ts`, `scripts/load-env.ts`). | `@ai-sdk/openai` throws "baseURL must be a non-empty string" at import time when the var is an empty string. |
| 7 | M0 | `video/` (challenge recording) is git-ignored. | Not part of the code submission; large binary. |
| 8 | M0 | GitHub repo created with `gh repo create` (spec §10.1 says the owner creates it). | The owner's kickoff message explicitly asks for `gh repo create … --public` when `gh` is authenticated. |
| 9 | M0 | shadcn/ui v4 CLI (`radix-nova` preset, `--rtl`), which imports `cn` from the `cn` package. | Current shadcn generator; RTL support is built in. |
