# XCLOCE v2 — Game Design (Meme Fighter)

All numbers live in code: [`src/shared/economy.ts`](src/shared/economy.ts) (currencies, power, battle math, workplace),
[`src/shared/items.ts`](src/shared/items.ts) (items), [`src/shared/content.ts`](src/shared/content.ts) (bosses, tasks, rewards, missions, events, clans).
Version 1 (meme-token trading + global damage) is archived in the `v1-trading` branch.

## Core loop

Market tasks (spend ⚡ energy) → currency, XP, permanent power, item drops → buy gear in the Shop / upgrade the workplace →
higher POWER → beat bosses (7 attacks per boss per day) → boss keys → unlock the next boss → bigger rewards. Clans sum their members' power.

## Screens

| Tab | What it does |
|---|---|
| **Boss** (left) | List of 10 bosses: picture, name, HP, reward, wins, win chance, attempts left. Locked bosses are grey with "?". |
| **Market** | Energy tasks that pay currency, XP, power and sometimes items. Weekend ×2. |
| **Home** (centre) | The dressable shiba hero in a room (theme from the shop, workplace grows with upgrades), FIGHT NOW, side buttons (login reward, daily missions, events, shop), Idle Rewards / Upgrade / Equip cards. |
| **Inventory** | 5-column grid of items (scrolls), 5 equipment slots with live hero preview. Tap an item to equip / use / open. |
| **Social** | Clans: create (10,000 ₽), request to join, accept/reject requests, kick, leave, disband. Clan power = sum of members' power. Top players by power. |

## Currencies

RUB (start 5,000), USD (start 20), SOL, BTC. Spent on gear, workplace and themes. Exchange in the shop: deterministic time-based rates
(₽90/$, SOL $150, BTC $60,000 with small wobble), 2% spread.

## Power

`power = 100 + 20·(level−1) + Σ equipped gear power + workplace bonus + permanent bonus`
Permanent bonus grows from Market tasks (+1…+6), boss victories (+3·boss index) and daily missions.

## Battles

- Each attack = 10 hits, each hit = power × U(0.8, 1.2), 10% crit ×1.6; win if total damage ≥ boss HP.
  Expected damage ≈ 10.6 × power. The boss list shows the server-calculated win chance.
- **7 attacks per boss per UTC day** (configurable `ATTACKS_PER_DAY`). A loss uses an attempt and gives 25% XP.
- **Boss #1 is always open.** Every win drops the boss's key; **3 keys of boss N unlock boss N+1** (keys are consumed).
- First-win drops: #2 cap, #4 neon glasses, #6 BAN Hammer, #10 Diamond Fist (mythic). Chest chance 5–16% per win.

| # | Boss | HP | Power for ~50% | Reward | Power per win |
|---|---|---:|---:|---|---:|
| 1 | BAGHOLDER | 900 | 85 | 900 ₽ | +3 |
| 2 | COPIUM HAMSTER | 2,000 | 190 | 2,000 ₽ | +6 |
| 3 | WEN LAMBO | 3,800 | 360 | $12 | +9 |
| 4 | PAPER HANDS CAT | 6,500 | 615 | $22 | +12 |
| 5 | LASER APE | 10,000 | 945 | $40 | +15 |
| 6 | BEAR BARON | 14,500 | 1,370 | 0.4 SOL | +18 |
| 7 | RUG WIZARD | 19,000 | 1,790 | 0.7 SOL | +21 |
| 8 | GAS GOBLIN | 28,000 | 2,640 | 1.1 SOL | +24 |
| 9 | TROLL WHALE | 40,000 | 3,770 | 0.004 BTC | +27 |
| 10 | MEME KING | 55,000 | 5,190 | 0.008 BTC | +30 |

Boss names and HP are placeholders (owner will adjust).

## Energy & Market

Max 100 (+10…60 from workplace), regenerates +1 per minute; energy drinks add 30/100 (may overfill up to 2× max).
Tasks: chat post (5⚡ → 350 ₽), shilling (10⚡ → 800 ₽), scalping (15⚡ → $9), meme drawing (20⚡ → $14), arbitrage (25⚡ → 0.12 SOL),
airdrop farming (30⚡ → 0.18 SOL), mining (40⚡ → 0.0012 BTC), whale hunting (50⚡ → 0.002 BTC). Level gates 1–14.

## Home

- Workplace tiers 1–6: idle income 400 → 26,000 ₽/h, +0…900 power, +0…60 max energy. Idle income accumulates up to 8 h, claimed with CLAIM.
- Room themes (shop): default, neon city, moon base, whale penthouse.
- Login reward: 7-day streak (₽, energy drink, $, chest, SOL, mega drink); claim every 20 h, streak resets after 48 h.
- Daily missions (6): login, 5 tasks, spend 100⚡, 3 boss attacks, 5 wins, 1 purchase.
- Events: Weekend Pump ×2 (Sat/Sun UTC), key hunt info; server feed (first boss kills, new clans).

## Items

Gear slots: weapon, hat, glasses, jacket, chain. Rarities common → mythic. 7 weapons (+20 … +1,500), 3 hats, 3 glasses,
4 jackets, 3 chains, 2 energy drinks, meme chest (random loot), 4 room themes, boss keys 1–10 (stackable).
