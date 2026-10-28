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

## Хостинг: Render

Постоянно работающий Node-сервер (`next start`) рядом с базой, конфиг — `render.yaml` (Blueprint).

- Render → New → **Blueprint** → этот репозиторий. Регион `virginia`, тариф Starter (0.5 CPU, 512 МБ).
- При создании Render спросит секреты: `DATABASE_URL` (строка Neon, pooled), `TELEGRAM_BOT_TOKEN`, `ADMIN_TELEGRAM_IDS`, `NEXT_PUBLIC_BOT_USERNAME`.
- Продакшен определяется по `RENDER=true` (гостевой вход и тестовый вход в админку выключены).
- Напоминания в Telegram сервер рассылает сам каждые 2 минуты, ночью по Москве — нет (`src/instrumentation.ts`).
