# همراه خرید — Hamrah Kharid

**دستیار هوشمند خرید حضوری در تهران:** از «نمی‌دونم چی بخرم» تا «کدوم مغازه، کدوم طبقه، الان بازه و واقعاً موجوده؟»

**An AI agent for in‑person shopping in Tehran:** pick the right product, find nearby shops that list it, compare them transparently, and (simulated) follow up with sellers before you go.

> 🚧 Work in progress — the full judge-ready README lands at milestone M6.

## Quick start (development)

```bash
cp .env.example .env            # set DB_PORT / DATABASE_URL and at least one LLM key
docker compose up -d db         # PostgreSQL 16 + pg_trgm + unaccent
pnpm install
pnpm migrate
pnpm dev                        # http://localhost:3010
```

Dataset: place `shops.csv`, `products.csv`, `offers.csv` in `data/` (not committed).

## License

MIT — see [LICENSE](LICENSE).
