# Kickoff prompt — single autonomous run

Paste the block below into Claude Code, opened at the repo root (`torob-seller-agent/`). Prerequisites: `data/` contains the three CSVs; `.env` has at least one LLM key; Docker is running.

```
You are the sole engineer on a hackathon project. Build the ENTIRE project autonomously, end to end, without waiting for me between steps. I will not write any code.

## Read first
1. docs/01-master-build-spec.md — the source of truth. Every architectural and product decision is already made there; do not re-litigate them.
2. docs/02-claude-code-run-plan.md — the milestone breakdown (M0→M6) with acceptance checks and the exact scope of each milestone.
3. docs/00-strategy-and-ideas.md — Persian background (skim only).
4. data/README.txt and the headers of data/*.csv.

## What to build (one sentence)
A mobile-first Persian (RTL) web app, "همراه خرید", where an AI agent guides a shopper in Tehran through: (1) figuring out which product to buy and comparing candidates, (2) finding sellers near a chosen location with radius/budget/condition filters, (3) comparing sellers transparently (listed price, price-change date and confirmed availability are three separate fields; unknowns shown as unknown; shops that list the product distinguished from businesses that merely match a category), and (4) simulated seller follow-up (message/call) with automatic alternatives and a visit plan with mall/floor/unit navigation.

## How to work
- Execute milestones M0, M1, M2, M3, M4, M5, M6 strictly in order. At the end of each milestone, run that milestone's acceptance checks yourself (commands, SQL checks, golden script, screenshots at 390px via Playwright/headless Chrome) and do not proceed until they pass. If a check cannot pass after two focused attempts, record the gap in docs/PROGRESS.md and continue — do not stall.
- Keep a task list for the milestones and tick them off. Update docs/PROGRESS.md at the end of every milestone (done / next / known issues) and docs/DECISIONS.md whenever you deviate from the spec (one line + reason).
- Commit at the end of each milestone (conventional commits). Create .gitignore so data/*.csv, .env and node_modules are never committed.
- Stack is fixed: Next.js 15 App Router + TypeScript + pnpm, Tailwind + shadcn/ui (RTL) + self-hosted Vazirmatn, Vercel AI SDK (latest stable; do NOT build a custom agent loop), providers @ai-sdk/openai, @ai-sdk/google, @openrouter/ai-sdk-provider selected by LLM_PROVIDER/LLM_MODEL env with zero code changes, PostgreSQL 16 + pg_trgm (+unaccent) via Drizzle, MapLibre GL + OSM tiles, Docker Compose (db, app, caddy). Vitest for pure functions. No embeddings/pgvector in v1.
- Simplicity over cleverness: smallest implementation that satisfies the spec and the demo scenario (spec §13). No extra features unless they cost < 10 minutes.
- All user-facing text in Persian with Persian digits and «٬» thousands separators; code, comments, commits in English.
- Never fabricate data: every price, distance, hour or availability shown in the UI must come from a database row or a simulator result tied to an offer_id. The LLM never states numbers from memory.
- The app must remain usable when the LLM provider fails: ContextBar controls and /api/sellers work without the chat route; chat shows a graceful Persian error.
- Build everything in the spec. Only if something is genuinely blocked (a library that will not work, a provider that is down) apply the cut order in spec §11 (dark mode → map panel → checklist) and never cut: three-field transparency on seller cards, ContextBar re-filtering without LLM, follow-up board with simulated outcomes, automatic alternatives, deployment.
- Seller simulation is deterministic from sha256(SIM_SALT + offer_id) per spec §7; tune SIM_SALT so the top-3 sellers of product_d24b597176bdf2a82035dcc2 at the default location (35.6957, 51.4105, radius 1000, balanced intent) yield mixed outcomes (at least one confirmed and one out_of_stock), and record the salt.
- For M6: produce a complete Dockerfile, docker-compose.yml (with AUTO_SEED), Caddyfile, README (Persian + English pitch, architecture mermaid, quick start, env table, honesty note about simulated contact, judging-criteria map) and docs/DEPLOY.md with the exact ordered commands for a fresh Ubuntu VPS. Verify `docker compose up -d` works locally end to end (fresh volumes → auto-seed → healthz → scenario). I will run the server deployment myself from docs/DEPLOY.md unless I give you SSH access.

## Git & GitHub
- This repo will be published on GitHub as the hackathon submission. At M0: `git init` on branch `main` (skip if the folder is already a git repo), add `.gitignore` (node_modules, .next, .env, .env.*.local, data/*.csv, data/*.zip, coverage, *.log, playwright-report, docs/screenshots/tmp), a MIT `LICENSE`, and make the first commit. Never commit secrets or the CSVs (products.csv is 196 MB, over GitHub's file limit); the README must link to the official dataset download and explain where to place the files.
- Conventional commits, small and meaningful (`feat(data): mall parser`, `feat(agent): contact_seller tool`), at least one commit per milestone; tag `v1.0` at the end.
- Remote: if `origin` already exists, use it. Otherwise, if `gh auth status` succeeds, create the repository yourself with `gh repo create torob-seller-agent --public --source=. --remote=origin --push`. If neither works, do not stop: keep committing locally and note once in docs/PROGRESS.md that I should run `git remote add origin <url> && git push -u origin main --tags`. Push `main` and tags after every milestone whenever a remote exists.
- Add `.github/workflows/ci.yml` running `pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test` on push and pull request. Keep it green.
- Commit the scenario screenshots to `docs/screenshots/` and reference them in the README; add `docs/DEMO.md` with the demo script (spec §13) so the submission is self-explanatory.
- README must be judge-ready on GitHub: title + one-line pitch (fa + en), screenshots at the top, live demo URL, architecture diagram, features mapped to the judging criteria, quick start, env table, honesty note on simulated seller contact, dataset notes.

## Definition of done
- `pnpm typecheck && pnpm lint && pnpm test && pnpm golden` all green.
- Demo scenario in spec §13 (steps 1–7) works on a 390px viewport in under 2 minutes of interaction, with `?demo_time=2026-10-25T16:00` support and a hidden /demo-reset route that clears my session.
- All three LLM providers verified with scripts/llm-check.ts (skip gracefully if a key is missing and tell me which).
- docs/PROGRESS.md, docs/DECISIONS.md, docs/DEPLOY.md, docs/DEMO.md, README.md complete; CI green; everything pushed to GitHub and tagged v1.0.

## When you finish
Give me: (1) a short summary of what works and what was cut, (2) the exact commands to deploy from docs/DEPLOY.md, (3) the list of screenshots you produced for each scenario step, (4) any env values I must set. Then stop.

Start now with M0. Do not ask me questions unless a credential or server access is missing.
```
