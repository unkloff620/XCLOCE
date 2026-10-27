# XCLOCE 2.0

Корпоративная Telegram Mini App игра: боссы-администрация бьются только оружием, энергия тратится в локациях, двор, магазин с обменником, инвентарь, кланы, профиль.

- Проект и правила игры: документ «XCLOCE 2.0 — проект игры».
- Данные игры (оружие, предметы, боссы, локации, двор, магазин, уровни, фразы): `src/content/`.
- Сервер (всё считается здесь): `src/server/` — `systems/` по механикам, `migrations.ts` — схема.
- Клиент: `src/client/` (экраны, векторная графика `art/`, анимации атак `fx/`), маршруты — `src/app/(game)/`.
- Фото боссов: `public/bosses/<id>/portrait.webp` и `full.webp` (прозрачный фон).

Цифры баланса меняются без выкладки через таблицу `config` (ключи `boss.hp`, `fight`, `energy`, `levels`, `yard.weights`, `prices`, `exchange.rub`, `exchange.fee`, `admins`).

Проверки: `npm run check` (типы, тесты, сборка), `node scripts/walk.mjs` — обход экранов в браузере.

Предыдущая версия игры — в ветке `archive-v1`.

## Хостинг: Cloudflare Workers

Игра собирается под Cloudflare Workers через OpenNext (`wrangler.jsonc`, `open-next.config.ts`, `cloudflare/worker.mjs`). Код по-прежнему работает и на Vercel.

Подключение (один раз): Cloudflare → Workers & Pages → Create → Import a repository → этот репозиторий.
- Build command: `npm run cf:build`
- Deploy command: `npx wrangler deploy`
- Переменные (Settings → Variables and Secrets, тип Secret): `DATABASE_URL` (строка Neon, лучше pooled), `TELEGRAM_BOT_TOKEN`, `ADMIN_TELEGRAM_IDS`, по желанию `SESSION_SECRET`, `CRON_SECRET`, `APP_URL`. Те же переменные — в Build variables, плюс `NEXT_PUBLIC_BOT_USERNAME`.
- `APP_ENV=production`, `ALLOW_GUEST=false`, крон напоминаний раз в 5 минут уже заданы в `wrangler.jsonc`.

Локально в рантайме Workers: `npm run cf:preview` (переменные — в `.dev.vars`, пример в `.dev.vars.example`).
