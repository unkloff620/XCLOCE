# XCLOCE — Game Design

All formulas live in code in [`src/shared/economy.ts`](src/shared/economy.ts) (single source of truth) and the market model in [`src/server/marketSim.ts`](src/server/marketSim.ts). This document explains them. Regenerate the tables with `npm run economy` and `npm run market:check`.

## Core principle: PERSONAL BOSSES + GLOBAL DAMAGE

- Every player has **their own** boss chain (#1, #2, #3 …). Players are on different bosses.
- Every damage event created by **any** player is applied to **every** player's **current** boss.
- Overkill flows into the player's next boss (no damage is lost).
- The source of damage is always recorded (personal contribution) even though the effect is global.

## Game loop

work (RUB) → exchange RUB→USD→SOL → buy a meme token → watch the market → sell → **sale value becomes damage** → global damage hits every player's boss → rewards (USD, XP, Dump Tools) → better workplace / tools → bigger trades → higher bosses.

## Currencies

| Currency | Role | Unlock |
|---|---|---|
| RUB | start money (10,000), work income, passive income, first workplace upgrade | LVL 1 |
| USD | boss rewards, Dump Tools, workplace tiers 3+, bridge to crypto | LVL 1 |
| SOL | meme-token trading currency (buy and sell) | LVL 1 |
| BTC | prestige store of value | LVL 5 |

Exchange pairs: RUB↔USD, USD↔SOL, USD↔BTC. Rates are a **deterministic function of time** (smooth multi-period wobble around RUB 90/USD, SOL $150, BTC $60,000; ±3% / ±8% / ±5%). No stored state → cannot drift or be manipulated. Every exchange pays a **1% spread**.

## Damage

**BASE DAMAGE = SALE VALUE (USD)** of the sold tokens (gross, before the 1% fee). Decided up front: volume, not profit — so losing trades still fight bosses, and the cost of damage is the fee + slippage the player pays.

```
damage = saleUsd × tool.mult × (crit ? tool.critMult : 1) × comboMult × (1 + workplace.damageBonus)
```

- Crit roll is server-side (`crypto.randomInt`).
- Combo: sales ≥ $5, at least 3 s apart, within 10 min of the previous sale. 2 → ×1.05, 5 → ×1.10, 10+ → ×1.25 (cap). Faster sells do not grow the combo (anti-spam).
- Selling costs energy = tool.energyCost (1–3). Energy regenerates 1 per 30 s; max 50–120 by workplace. Work costs 1 energy. Buying is free, so energy never fully blocks play.
- Max theoretical multiplier ≈ 2.5 × 1.36 (avg crit) × 1.25 × 1.3 ≈ 5.5× — bounded, no exponent.

**Cost of damage.** A buy→sell round trip burns ~2% of volume in fees (+ slippage), so $1 of fees ≈ $50 of damage at ×1. This is the central balancing lever.

## Bosses

`marketCap(n) = niceRound(1000 × n^1.5 × 1.25^(n−1))` — polynomial × mild exponential (not ×10).

Reward: `USD = marketCap × rate(n) × contributionFactor`, `rate(n) = max(1.5%, 3% − 0.05%·(n−1))`, XP = `50·n^1.3`.

**Contribution factor** (anti-inflation, tunable): a boss killed purely by other players' global damage pays 25% of the reward; the full reward is paid once the player personally dealt ≥ 10% of that boss's market cap. Personal damage is attributed first within an event, so the split is deterministic.

Tool drops on first defeat: #3 Sell Button, #7 Dump Bot, #20 Black Swan Generator (mythic, drop-only).

12 hand-designed bosses; after #12 the designs repeat as harder remixes (II, III, …) with a hue shift.

### Progression table (first 30 bosses)

Assumptions: solo player, sells cost 2% of volume in fees, gear = best affordable at that point. "Fees to kill solo" is the money a lone player spends; with other active players bosses fall proportionally faster.

| Boss | Market Cap | Reward rate | Reward USD (full) | XP | Fees to kill solo (2% of mcap / mult) | Suggested gear |
|---:|---:|---:|---:|---:|---:|---|
| 1 | $1,000 | 3.00% | $30 | 50 | $16 | Sell Button + Офисный ПК (x1.22) |
| 2 | $3,500 | 2.95% | $103 | 123 | $56 | Sell Button + Игровой ПК (x1.26) |
| 3 | $8,100 | 2.90% | $235 | 209 | $107 | Dump Bot + Трейдерский сетап (x1.52) |
| 4 | $16,000 | 2.85% | $456 | 303 | $211 | Dump Bot + Трейдерский сетап (x1.52) |
| 5 | $27,000 | 2.80% | $756 | 405 | $313 | Whale Wallet + Трейдерский сетап (x1.72) |
| 6 | $45,000 | 2.75% | $1,238 | 514 | $500 | Whale Wallet + Крипто-станция (x1.80) |
| 7 | $71,000 | 2.70% | $1,917 | 627 | $788 | Whale Wallet + Крипто-станция (x1.80) |
| 8 | $110,000 | 2.65% | $2,915 | 746 | $1,063 | Market Maker Terminal + Крипто-станция (x2.07) |
| 9 | $160,000 | 2.60% | $4,160 | 870 | $1,481 | Market Maker Terminal + Серверная стойка (x2.16) |
| 10 | $240,000 | 2.55% | $6,120 | 998 | $2,222 | Market Maker Terminal + Серверная стойка (x2.16) |
| 11 | $340,000 | 2.50% | $8,500 | 1129 | $2,668 | Liquidity Nuker + Серверная стойка (x2.55) |
| 12 | $480,000 | 2.45% | $11,760 | 1264 | $3,766 | Liquidity Nuker + Серверная стойка (x2.55) |
| 13 | $680,000 | 2.40% | $16,320 | 1403 | $4,925 | Liquidity Nuker + Whale Command Center (x2.76) |
| 14 | $950,000 | 2.35% | $22,325 | 1545 | $6,881 | Liquidity Nuker + Whale Command Center (x2.76) |
| 15 | $1,300,000 | 2.30% | $29,900 | 1690 | $8,032 | Rug Cannon + Whale Command Center (x3.24) |
| 16 | $1,800,000 | 2.25% | $40,500 | 1838 | $11,121 | Rug Cannon + Whale Command Center (x3.24) |
| 17 | $2,500,000 | 2.20% | $55,000 | 1989 | $15,446 | Rug Cannon + Whale Command Center (x3.24) |
| 18 | $3,400,000 | 2.15% | $73,100 | 2142 | $21,007 | Rug Cannon + Whale Command Center (x3.24) |
| 19 | $4,600,000 | 2.10% | $96,600 | 2298 | $23,828 | Mega Dump Machine + Whale Command Center (x3.86) |
| 20 | $6,200,000 | 2.05% | $127,100 | 2456 | $32,116 | Mega Dump Machine + Whale Command Center (x3.86) |
| 21 | $8,300,000 | 2.00% | $166,000 | 2617 | $42,994 | Mega Dump Machine + Whale Command Center (x3.86) |
| 22 | $11,000,000 | 1.95% | $214,500 | 2780 | $56,980 | Mega Dump Machine + Whale Command Center (x3.86) |
| 23 | $15,000,000 | 1.90% | $285,000 | 2946 | $77,700 | Mega Dump Machine + Whale Command Center (x3.86) |
| 24 | $20,000,000 | 1.85% | $370,000 | 3113 | $103,600 | Mega Dump Machine + Whale Command Center (x3.86) |
| 25 | $26,000,000 | 1.80% | $468,000 | 3283 | $134,680 | Mega Dump Machine + Whale Command Center (x3.86) |
| 26 | $35,000,000 | 1.75% | $612,500 | 3455 | $181,300 | Mega Dump Machine + Whale Command Center (x3.86) |
| 27 | $46,000,000 | 1.70% | $782,000 | 3629 | $238,280 | Mega Dump Machine + Whale Command Center (x3.86) |
| 28 | $61,000,000 | 1.65% | $1,006,500 | 3804 | $315,980 | Mega Dump Machine + Whale Command Center (x3.86) |
| 29 | $81,000,000 | 1.60% | $1,296,000 | 3982 | $419,580 | Mega Dump Machine + Whale Command Center (x3.86) |
| 30 | $110,000,000 | 1.55% | $1,705,000 | 4161 | $569,801 | Mega Dump Machine + Whale Command Center (x3.86) |

Cumulative market cap of bosses 1-30: $436,231,600

| Level | XP to next |
|---:|---:|
| 1 | 100 |
| 2 | 283 |
| 3 | 520 |
| 5 | 1118 |
| 8 | 2263 |
| 10 | 3162 |
| 15 | 5809 |
| 20 | 8944 |
| 30 | 16432 |

## Workplace (equipment tiers)

| Tier | Name | Price | LVL | Work ₽/tap | Passive ₽/h | Max energy | Damage bonus |
|---|---|---|---|---|---|---|---|
| 1 | Старый ноутбук | free | 1 | 50 | 300 | 50 | 0% |
| 2 | Офисный ПК | 30,000 ₽ | 2 | 80 | 900 | 60 | +3% |
| 3 | Игровой ПК | $1,000 | 3 | 130 | 2,500 | 70 | +6% |
| 4 | Трейдерский сетап | $4,000 | 5 | 200 | 6,000 | 80 | +10% |
| 5 | Крипто-станция | $15,000 | 8 | 320 | 15,000 | 90 | +15% |
| 6 | Серверная стойка | $60,000 | 11 | 500 | 40,000 | 100 | +20% |
| 7 | Whale Command Center | $250,000 | 15 | 800 | 100,000 | 120 | +30% |

Passive income accrues while offline but is **capped at 4 hours** per absence.

## Dump Tools

| Tool | Rarity | Mult | Crit | Crit × | Energy | Price | LVL |
|---|---|---|---|---|---|---|---|
| Paper Hands | common | 1.00 | 2% | 1.5 | 1 | start | 1 |
| Sell Button | common | 1.15 | 4% | 1.75 | 1 | $250 | 2 |
| Dump Bot | rare | 1.30 | 6% | 2.0 | 1 | $1,500 | 4 |
| Whale Wallet | rare | 1.45 | 8% | 2.0 | 2 | $6,000 | 6 |
| Market Maker Terminal | epic | 1.60 | 10% | 2.25 | 2 | $25,000 | 9 |
| Liquidity Nuker | epic | 1.80 | 12% | 2.5 | 2 | $90,000 | 12 |
| Rug Cannon | legendary | 2.00 | 14% | 2.75 | 3 | $350,000 | 15 |
| Mega Dump Machine | legendary | 2.25 | 16% | 3.0 | 3 | $1,200,000 | 19 |
| Black Swan Generator | mythic | 2.50 | 18% | 3.0 | 3 | boss #20 drop | — |

## Player level

XP to next level = `100 × level^1.5`. XP: work +1, exchange +1, buy +2, sell +4 + floor(√saleUsd) (cap 60), boss `50·n^1.3`, workplace upgrade 20×tier.

## Meme-token market

One tick = 10 s. Deterministic per (token, tick) seed, so all server instances agree; the market is advanced lazily (whoever requests first, under a try-lock) and catches up at most 1 hour.

Per tick: `ln p += −0.02·(ln p − ln fair) + regimeDrift + vol·N(0,1)`. Fair value random-walks and slowly bleeds (meme coins decay without hype); part of every pump/dump sticks to fair value.

Regimes: **normal**, **pump** (6–18 ticks, +2…4.5%/tick; reasons: influencer post, whale buy, viral meme, listing rumour, fake leak, community raid), **dump** (4–12 ticks, −1.5…3.5%/tick; whale sell, bad news, unlock, panic, exploit rumour), **prerug** → **rugged** → **recovering**.

### Rugpull fairness

`risk = 0.30·(1−devRep) + 0.25·whales + 0.20·lowLiquidity + 0.10·fewHolders + 0.10·young + 0.05·volatility` (shown to players as factor bars).
Rug chance per tick = `0.0006 × risk²` (×cooldown after a relaunch). A rug is always preceded by a **visible pre-rug phase** (6–12 ticks = 1–2 min): liquidity drains 12%/tick, holders leave, whale share grows, and a "⚠️ dev wallet moved funds" news item appears. Then 88–96% of the price burns. After 5 min the community relaunches it (CTO) with partially restored fair value. A token that falls below 0.3% of its launch price is rebranded into a fresh meme (positions in the dead token are dust and are cleared).

Monte Carlo (20 simulated days, `scripts/market-sim-check.ts`): low-risk tokens ≈ 0–0.15 rugs/day, high-risk ≈ 0.9–1.3 rugs/day, ~25 pumps and ~25–35 dumps per token per day.

Trades move the price: impact = `min(25%, usd / liquidity × 0.5)`.

## Tutorial (through real actions)

0 work → 1 buy USD → 2 buy SOL → 3 buy a meme token → 4 sell it → 5 open the boss screen → 6 done. Steps advance on the server when the real action succeeds.

## Open design questions (owner decisions)

- Contribution factor (25% min / full at 10%) — protects the economy when many players are online; tune after first tests.
- Boss scaling with player count: currently none. With thousands of players global damage will clear early bosses very fast; consider scaling the curve or per-boss global damage caps.
- Character customization / cosmetics (owner request: dress up the character) — planned for the next stage.
