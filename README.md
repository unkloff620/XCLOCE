# XCLOCE — Meme Fighter

Telegram Mini App: dress and arm your shiba, complete Market tasks for currency, beat meme bosses (7 attacks per boss per day,
3 keys unlock the next boss), and build a clan.

```bash
npm install
npm run dev     # http://localhost:3000 — guest mode + in-process PGlite, no setup needed
npm test        # game rules (bosses, keys, tasks, shop, clans)
npm run check   # typecheck + tests + build
```

Deploy: Vercel project with Neon Postgres (`DATABASE_URL`) and `TELEGRAM_BOT_TOKEN`; push to `main`.
In @BotFather set the Mini App URL to the production domain.

Docs: [PROJECT_STATE.md](PROJECT_STATE.md) · [GAME_DESIGN.md](GAME_DESIGN.md) · [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)
