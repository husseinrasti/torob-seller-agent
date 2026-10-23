# Deploy on a fresh Ubuntu VPS

Tested stack: Ubuntu 22.04/24.04, Docker Engine + Compose v2.24+, 2 vCPU / 2 GB RAM / 10 GB disk is enough (the seed needs ~1 GB RAM for ~30 s).
Result: `https://<your-domain>` served by Caddy (automatic Let's Encrypt), the app (Next.js standalone) and PostgreSQL 16 — all with `restart: unless-stopped`.

## 0. Before you start

- A domain (or sub‑domain) with an **A record → the VPS IP**, e.g. `hamrah.example.com`. No domain? See step 5 (plain HTTP on the IP).
- The three CSVs on your laptop: `data/shops.csv`, `data/products.csv`, `data/offers.csv`.
- At least one LLM key (OpenAI, Google Gemini or OpenRouter). Without a key the app runs in offline mode (rule‑based agent).

## 1. Docker and firewall (on the VPS)

```bash
sudo apt-get update && sudo apt-get install -y ca-certificates curl git ufw
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER" && newgrp docker
docker compose version
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw --force enable
```

Iranian data centers (optional): use a Docker Hub mirror before building.

```bash
echo '{ "registry-mirrors": ["https://docker.arvancloud.ir"] }' | sudo tee /etc/docker/daemon.json
sudo systemctl restart docker
```

## 2. Code

```bash
git clone https://github.com/husseinrasti/torob-seller-agent.git
cd torob-seller-agent
```

`main` is the latest version (name sign‑in, chat history, memory, desktop layout); `git checkout v1.0` gives the first release without them.

## 3. Dataset (from your laptop)

```bash
scp data/shops.csv data/products.csv data/offers.csv <user>@<vps-ip>:~/torob-seller-agent/data/
```

Then on the VPS:

```bash
ls -lh ~/torob-seller-agent/data/*.csv
```

## 4. Configuration

```bash
cp .env.example .env
nano .env
```

Set at least:

```dotenv
APP_DOMAIN=hamrah.example.com
APP_URL=https://hamrah.example.com
POSTGRES_PASSWORD=<a-long-random-password>
LLM_PROVIDER=openai                 # or google / openrouter
LLM_MODEL=gpt-4.1-mini              # e.g. gemini-3.1-flash-lite for google, openai/gpt-4.1-mini for openrouter
OPENAI_API_KEY=sk-...               # the key matching LLM_PROVIDER
```

Keep `AUTO_SEED=true`, `DB_PORT=5432`, `HTTP_PORT=80`, `HTTPS_PORT=443`, `SIM_SALT=hamrah-40`.
Optional: `LLM_VISION_MODEL=<multimodal model>` for photo search (defaults: openai → `LLM_MODEL`, google → `gemini-3.1-flash-lite`, openrouter → `google/gemini-2.5-flash`; check with `pnpm vision-check`). Also `NPM_REGISTRY=<npm mirror URL>` if `registry.npmjs.org` is slow or blocked; `OPENAI_BASE_URL=<compatible proxy>` if OpenAI is not reachable from the server (or use OpenRouter).

> `POSTGRES_PASSWORD` is applied when the database volume is first created. To change it later run `docker compose down -v` (this deletes the database; the app re-seeds on the next start).

## 5. Start

```bash
docker compose up -d --build
docker compose logs -f app
```

Wait for `[migrate] applied migrations`, `[seed …] done: {"shops":6476,"products":225903,"offers":331506}` (~30 s after the image is built) and `✓ Ready`, then press `Ctrl+C`.

No domain yet? Put `APP_DOMAIN=:80` and `APP_URL=http://<vps-ip>` in `.env` and run `docker compose up -d` again — Caddy then serves plain HTTP on port 80.

## 6. Verify

```bash
curl -s https://hamrah.example.com/api/healthz
docker compose ps
```

Expected: `{"ok":true,"db":true,"counts":{"shops":6476,"products":225903,"offers":331506},"llm_provider":"openai"}` and all three services `Up` (`app` becomes `healthy`).

On a phone open `https://hamrah.example.com/demo-reset?demo_time=2026-10-25T16:00&name=داور` (signs in as «داور» with an empty history) and follow [DEMO.md](DEMO.md). A desktop browser gets the three‑column layout. From your laptop you can also run the scripted check against the server:

```bash
pnpm install && pnpm scenario https://hamrah.example.com
```

Restart resilience (data stays):

```bash
docker compose restart app && sleep 5 && curl -s https://hamrah.example.com/api/healthz
```

## Operations

```bash
git pull && docker compose up -d --build              # update to the latest commit
docker compose run --rm app node scripts/seed.cjs     # reload the CSVs (truncate + load)
docker compose exec db pg_dump -U app app | gzip > backup-$(date +%F).sql.gz
docker compose logs --tail 200 app caddy              # troubleshooting
```

| Symptom | Fix |
|---|---|
| `app` restarts with `missing /data/products.csv` | Copy the CSVs into `data/` (step 3) and `docker compose up -d`. |
| HTTPS certificate not issued | DNS A record must point to the server and ports 80/443 must be open; check `docker compose logs caddy`. |
| Chat says «دستیار هوشمند در دسترس نبود» | The LLM provider is unreachable or the key is wrong; the app falls back to offline answers. Fix the key / set `OPENAI_BASE_URL` / switch `LLM_PROVIDER`, then `docker compose up -d`. |
| Build fails while installing packages | Set `NPM_REGISTRY` in `.env` to a reachable npm mirror and rebuild. |
