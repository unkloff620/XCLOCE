import { GameError, type Queryable } from "../db.ts";
import { grantReward, idempotent, itemQty, ledger, moscowDay, nextMoscowMidnight, takeItem, type Ctx, type Granted } from "../core.ts";
import { BOSSES, bossById, keyId, keysNeeded, rewardShare, type BossDef } from "../../content/bosses.ts";
import { WEAPONS, itemById, weaponById } from "../../content/items.ts";
import { HIT_PHRASES } from "../../content/phrases.ts";
import { mergeRewards, scaleReward } from "../../content/rewards.ts";
import { BASE_CRIT_MULT } from "../../content/home.ts";
import { talentsForDamage, weaponTalentBonus } from "../../content/talents.ts";
import { playerBonus, weaponTalents } from "./home.ts";
import { notifyBossLow } from "./notify.ts";

/*
 * Personal fights, shared damage.
 * Every boss has a running damage counter. A fight remembers the counter at its start:
 *   fight HP = hp_max − (counter now − counter at start)
 * so a hit by anyone on that boss lowers HP in every fight with that boss that is running.
 * Lock order everywhere: player row (FOR NO KEY UPDATE) → boss row (FOR UPDATE). Other players'
 * rows are never touched inside an attack: winners collect their reward themselves (claimFight).
 */

interface FightRow {
  id: number;
  player_id: number;
  boss_id: string;
  hp_max: number;
  start_total: number;
  start_seq: number;
  started_at: Date;
  ends_at: Date;
  day: string;
  status: "active" | "won" | "lost";
  end_total: number | null;
  end_seq: number | null;
  ended_at: Date | null;
  killer_id: number | null;
  my_damage: number;
  my_hits: number;
  /** «Соло»: only my own hits count, other players' damage does not take this fight's HP */
  solo: boolean;
  reward: Granted | null;
  seen: boolean;
}
interface BossRow {
  id: string;
  damage_total: number;
  last_seq: number;
  wins: number;
}

export async function ensureBosses(q: Queryable) {
  for (const b of BOSSES) await q.query("INSERT INTO bosses (id) VALUES ($1) ON CONFLICT DO NOTHING", [b.id]);
}

async function lockBoss(q: Queryable, id: string): Promise<BossRow> {
  let [b] = await q.query<BossRow>("SELECT * FROM bosses WHERE id=$1 FOR UPDATE", [id]);
  if (!b) {
    await q.query("INSERT INTO bosses (id) VALUES ($1) ON CONFLICT DO NOTHING", [id]);
    [b] = await q.query<BossRow>("SELECT * FROM bosses WHERE id=$1 FOR UPDATE", [id]);
  }
  return b;
}

/** Marks fights of this boss whose 8 hours are over as lost. Caller holds the boss lock. */
async function expireFights(ctx: Ctx, boss: BossRow) {
  await ctx.q.query(
    "UPDATE fights SET status='lost', ended_at=ends_at, end_total=$2, end_seq=$3 WHERE boss_id=$1 AND status='active' AND ends_at <= $4",
    [boss.id, boss.damage_total, boss.last_seq, new Date(ctx.now)],
  );
}

export function fightHp(f: Pick<FightRow, "hp_max" | "start_total" | "end_total"> & { solo?: boolean; my_damage?: number | string }, bossTotal: number): number {
  if (f.solo) return Math.max(0, f.hp_max - Number(f.my_damage ?? 0));
  return Math.max(0, f.hp_max - ((f.end_total ?? bossTotal) - f.start_total));
}

/** Boss N+1 opens after KEYS keys of boss N. */
export async function isUnlocked(q: Queryable, pid: number, boss: BossDef, defaultKeys: number): Promise<boolean> {
  if (boss.order === 1) return true;
  const prev = BOSSES.find((b) => b.order === boss.order - 1);
  if (!prev) return false;
  return (await itemQty(q, pid, keyId(prev.id))) >= keysNeeded(boss, defaultKeys);
}

/** Fights that count toward the daily limit: won ones and the running one. Lost / abandoned fights do not count. */
async function fightsToday(q: Queryable, pid: number, bossId: string, day: string): Promise<number> {
  const [r] = await q.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM fights WHERE player_id=$1 AND boss_id=$2 AND day=$3 AND status <> 'lost'", [pid, bossId, day]);
  return r.n;
}

/** Resolves my running fight if its time is over. Caller holds my player lock. */
export async function settleMyFight(ctx: Ctx): Promise<void> {
  const [f] = await ctx.q.query<FightRow>("SELECT * FROM fights WHERE player_id=$1 AND status='active'", [ctx.pid]);
  if (!f || new Date(f.ends_at).getTime() > ctx.now) return;
  const boss = await lockBoss(ctx.q, f.boss_id);
  await expireFights(ctx, boss);
}

export async function startFight(ctx: Ctx, bossId: string, solo = false) {
  const def = bossById(bossId);
  if (!def) throw new GameError("bad_boss", "Такого босса нет");
  await settleMyFight(ctx);
  const [active] = await ctx.q.query<{ id: number; boss_id: string }>("SELECT id, boss_id FROM fights WHERE player_id=$1 AND status='active'", [ctx.pid]);
  if (active) throw new GameError("fight_running", `Сначала закончи бой с боссом ${bossById(active.boss_id)?.name}`);
  if (!(await isUnlocked(ctx.q, ctx.pid, def, ctx.cfg.fight.keysToUnlock))) {
    const n = keysNeeded(def, ctx.cfg.fight.keysToUnlock);
    throw new GameError("boss_locked", n === 1 ? "Нужен пропуск предыдущего босса" : `Нужно ${n} пропуска предыдущего босса`);
  }
  const day = moscowDay(ctx.now);
  if ((await fightsToday(ctx.q, ctx.pid, def.id, day)) >= ctx.cfg.fight.perDay) {
    throw new GameError("fight_limit", `Лимит боёв с боссом ${def.name} на сегодня исчерпан (${ctx.cfg.fight.perDay}). Новые — после полуночи по Москве`);
  }
  const boss = await lockBoss(ctx.q, def.id);
  await expireFights(ctx, boss);
  const hpMax = ctx.cfg.bossHp[def.id] ?? def.hp;
  const [f] = await ctx.q.query<{ id: number }>(
    "INSERT INTO fights (player_id, boss_id, hp_max, start_total, start_seq, started_at, ends_at, day, solo) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
    [ctx.pid, def.id, hpMax, boss.damage_total, boss.last_seq, new Date(ctx.now), new Date(ctx.now + ctx.cfg.fight.hours * 3600_000), day, solo],
  );
  // the free weapons (fist, mouse, candle) keep their 5-hour rest across fights: a new fight does not reset it
  return { fightId: f.id, bossId: def.id, solo };
}

export interface HitResult {
  fightId: number;
  weapon: string;
  damage: number;
  crit: boolean;
  phrase: string;
  hp: number;
  hpMax: number;
  status: "active" | "won" | "lost";
  left: number | null;
  readyAt: number | null;
  /** fights (of anyone) this hit finished */
  finished: number;
  /** damage dealt in this fight so far */
  fightDamage: number;
  /** damage dealt to bosses of all time (the talent counter) and talents this hit earned (content/talents.ts) */
  talentDamage: number;
  talentsGained: number;
}

export async function attack(ctx: Ctx, weaponId: string, idem?: string): Promise<HitResult> {
  return idempotent(ctx, idem ? `hit:${idem}` : undefined, async () => {
    const w = weaponById(weaponId);
    if (!w) throw new GameError("bad_weapon", "Этим нельзя бить босса");
    const [mine] = await ctx.q.query<FightRow>("SELECT * FROM fights WHERE player_id=$1 AND status='active'", [ctx.pid]);
    if (!mine) throw new GameError("no_fight", "Сначала начни бой с боссом");
    const boss = await lockBoss(ctx.q, mine.boss_id);
    await expireFights(ctx, boss);
    if (new Date(mine.ends_at).getTime() <= ctx.now) {
      throw new GameError("fight_over", "Время боя вышло — босс ушёл");
    }

    // pay with the weapon
    let left: number | null = null;
    let readyAt: number | null = null;
    if (w.weapon.kind === "consumable") {
      left = await takeItem(ctx, w.id, 1, `hit:${mine.boss_id}`);
    } else {
      if ((await itemQty(ctx.q, ctx.pid, w.id)) < 1) throw new GameError("no_item", `Нет оружия: ${w.name}`);
      const [cd] = await ctx.q.query<{ ready_at: Date }>("SELECT ready_at FROM cooldowns WHERE player_id=$1 AND item_id=$2", [ctx.pid, w.id]);
      if (cd && new Date(cd.ready_at).getTime() > ctx.now) throw new GameError("cooldown", `${w.name} ещё перезаряжается`);
      readyAt = ctx.now + (w.weapon.cooldownMin ?? 0) * 60_000;
      await ctx.q.query(
        "INSERT INTO cooldowns (player_id, item_id, ready_at) VALUES ($1,$2,$3) ON CONFLICT (player_id, item_id) DO UPDATE SET ready_at = EXCLUDED.ready_at",
        [ctx.pid, w.id, new Date(readyAt)],
      );
      await ledger(ctx, "use", w.id, 1, `hit:${mine.boss_id}`);
    }

    const phrases = HIT_PHRASES[w.id] ?? [""];
    const phraseIdx = Math.floor(ctx.rng() * phrases.length) % phrases.length;
    // home bonuses: +damage %, crit chance and crit power (equipment + rooms); this weapon's talents: +damage %, crit power
    const bonus = await playerBonus(ctx.q, ctx.pid);
    const wt = weaponTalentBonus(await weaponTalents(ctx.q, ctx.pid), w.id);
    // talents add flat damage to the weapon's base; the room and trophies multiply the sum
    let damage = Math.round((w.weapon.damage + wt.flat) * (1 + bonus.damage));
    const crit = bonus.critChance > 0 && ctx.rng() < bonus.critChance;
    if (crit) damage = Math.round(damage * (BASE_CRIT_MULT + bonus.critDamage + wt.critDamage));
    const seq = boss.last_seq + 1;
    const total = boss.damage_total + damage;
    await ctx.q.query("UPDATE bosses SET damage_total=$2, last_seq=$3 WHERE id=$1", [boss.id, total, seq]);
    await ctx.q.query(
      "INSERT INTO boss_hits (boss_id, seq, player_id, fight_id, weapon, damage, phrase, created_at, crit) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [boss.id, seq, ctx.pid, mine.id, w.id, damage, phraseIdx, new Date(ctx.now), crit],
    );
    await ctx.q.query("UPDATE fights SET my_damage = my_damage + $2, my_hits = my_hits + 1 WHERE id=$1", [mine.id, damage]);
    const fightDamage = mine.my_damage + damage;
    // talents for the damage of all time: the counter carries over from fight to fight
    const [st] = await ctx.q.query<{ total_damage: number }>("SELECT total_damage FROM player_stats WHERE player_id=$1", [ctx.pid]);
    const before = Number(st?.total_damage ?? 0);
    const talentDamage = before + damage;
    const talentsGained = talentsForDamage(talentDamage) - talentsForDamage(before);
    if (talentsGained > 0) {
      await ctx.q.query("UPDATE players SET talents = talents + $2 WHERE id=$1", [ctx.pid, talentsGained]);
      await ledger(ctx, "talent", "talent", talentsGained, `fight:${mine.id}`);
    }
    await ctx.q.query(
      "INSERT INTO boss_damage (boss_id, player_id, damage, hits) VALUES ($1,$2,$3,1) ON CONFLICT (boss_id, player_id) DO UPDATE SET damage = boss_damage.damage + EXCLUDED.damage, hits = boss_damage.hits + 1",
      [boss.id, ctx.pid, damage],
    );
    await ctx.q.query(
      "UPDATE player_stats SET total_damage = total_damage + $2, weapons = jsonb_set(weapons, ARRAY[$3::text], to_jsonb(COALESCE((weapons->>$3)::int, 0) + 1)) WHERE player_id=$1",
      [ctx.pid, damage, w.id],
    );

    // every running fight with this boss whose HP reached zero is won by this hit
    const won = await ctx.q.query<{ id: number }>(
      "UPDATE fights SET status='won', end_total=$2, end_seq=$3, ended_at=$4, killer_id=$5 WHERE boss_id=$1 AND status='active' AND NOT solo AND hp_max - ($2 - start_total) <= 0 RETURNING id",
      [boss.id, total, seq, new Date(ctx.now), ctx.pid],
    );
    // a solo fight is won only by my own damage
    if (mine.solo && Number(mine.my_damage) + damage >= mine.hp_max) {
      await ctx.q.query("UPDATE fights SET status='won', end_total=$2, end_seq=$3, ended_at=$4, killer_id=$5 WHERE id=$1", [mine.id, total, seq, new Date(ctx.now), ctx.pid]);
      won.push({ id: mine.id });
    }
    if (won.length) await ctx.q.query("UPDATE bosses SET wins = wins + $2 WHERE id=$1", [boss.id, won.length]);
    // others whose fight with this boss is nearly over get a "finish it!" reminder
    await notifyBossLow(ctx, boss.id, total);
    const mineWon = won.some((x) => x.id === mine.id);
    const hp = mineWon ? 0 : fightHp({ ...mine, end_total: null, my_damage: Number(mine.my_damage) + damage }, total);
    return {
      fightId: mine.id, weapon: w.id, damage, crit, phrase: phrases[phraseIdx], hp, hpMax: mine.hp_max,
      status: mineWon ? "won" : "active", left, readyAt, finished: won.length, fightDamage, talentDamage, talentsGained,
    };
  });
}

/** Collects the reward of a won fight (or acknowledges a lost one). Rewards and the key go to the inventory. */
export async function claimFight(ctx: Ctx, fightId: number) {
  const [f] = await ctx.q.query<FightRow>("SELECT * FROM fights WHERE id=$1 AND player_id=$2 FOR UPDATE", [fightId, ctx.pid]);
  if (!f) throw new GameError("no_fight", "Бой не найден", 404);
  if (f.status === "active") throw new GameError("fight_running", "Бой ещё идёт");
  if (f.status === "lost") {
    await ctx.q.query("UPDATE fights SET seen=true WHERE id=$1", [f.id]);
    return { status: "lost" as const, reward: null };
  }
  if (f.reward) {
    await ctx.q.query("UPDATE fights SET seen=true WHERE id=$1", [f.id]);
    return { status: "won" as const, reward: f.reward };
  }
  const def = bossById(f.boss_id)!;
  // the reward follows my own part of this fight (see FULL_SHARE / KEY_SHARE in content/bosses.ts)
  const myDamage = Number(f.my_damage);
  const share = rewardShare(myDamage, f.hp_max, ctx.cfg.fight.fullShare);
  const earnedKey = myDamage >= f.hp_max * ctx.cfg.fight.keyShare;
  const drops = earnedKey ? (def.drop ?? []).filter((d) => ctx.rng() < d.chance).map((d) => ({ id: d.id, qty: d.qty })) : [];
  const key = def.final || !earnedKey ? [] : [{ id: keyId(def.id), qty: 1 }];
  const unlocked = earnedKey ? await rollUnlocks(ctx, def) : [];
  // one-of-a-kind rewards (the statue) are not handed out again
  const base = scaleReward(def.reward, share);
  if (base.items?.length) base.items = await notOwnedUnique(ctx, base.items);
  const granted = await grantReward(ctx, mergeRewards(base, { items: [...key, ...drops] }), `win:${def.id}`);
  if (unlocked.length) granted.unlocks = unlocked;
  await ctx.q.query("UPDATE fights SET reward=$2, seen=true WHERE id=$1", [f.id, JSON.stringify(granted)]);
  if (myDamage > 0) {
    await ctx.q.query(
      "INSERT INTO boss_damage (boss_id, player_id, wins) VALUES ($1,$2,1) ON CONFLICT (boss_id, player_id) DO UPDATE SET wins = boss_damage.wins + 1",
      [def.id, ctx.pid],
    );
  }
  return { status: "won" as const, reward: granted, share, key: earnedKey };
}

/** Drops items with maxStack 1 the player already has. */
async function notOwnedUnique(ctx: Ctx, items: { id: string; qty: number }[]) {
  const out = [];
  for (const it of items) {
    if (itemById(it.id)?.maxStack === 1 && (await itemQty(ctx.q, ctx.pid, it.id)) > 0) continue;
    out.push(it);
  }
  return out;
}

/** Things the player may buy: owned already, or opened by a boss drop. */
export async function unlockedItems(q: Queryable, pid: number): Promise<string[]> {
  return (await q.query<{ item_id: string }>("SELECT item_id FROM player_unlocks WHERE player_id=$1", [pid])).map((r) => r.item_id);
}

/**
 * Things a boss opens in the shop (BossDef.wear): every one not opened (or owned) yet rolls its chance; after `pity`
 * wins in a row without luck one of them opens for sure. The thing itself is bought in the shop afterwards.
 * The miss counter lives in boss_pity.
 */
async function rollUnlocks(ctx: Ctx, def: BossDef): Promise<string[]> {
  if (!def.wear) return [];
  const open = new Set(await unlockedItems(ctx.q, ctx.pid));
  const missing: string[] = [];
  for (const id of def.wear.items) if (!open.has(id) && (await itemQty(ctx.q, ctx.pid, id)) === 0) missing.push(id);
  if (!missing.length) return [];
  const [row] = await ctx.q.query<{ misses: number }>("SELECT misses FROM boss_pity WHERE player_id=$1 AND boss_id=$2 FOR UPDATE", [ctx.pid, def.id]);
  const misses = row?.misses ?? 0;
  let got = missing.filter(() => ctx.rng() < def.wear!.chance);
  if (!got.length && misses + 1 >= def.wear.pity) got = [missing[Math.floor(ctx.rng() * missing.length) % missing.length]];
  await ctx.q.query(
    "INSERT INTO boss_pity (player_id, boss_id, misses) VALUES ($1,$2,$3) ON CONFLICT (player_id, boss_id) DO UPDATE SET misses = EXCLUDED.misses",
    [ctx.pid, def.id, got.length ? 0 : misses + 1],
  );
  for (const id of got) {
    await ctx.q.query("INSERT INTO player_unlocks (player_id, item_id, boss_id, at) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING", [ctx.pid, id, def.id, new Date(ctx.now)]);
  }
  return got;
}

/** Gives up the running fight (counts as a loss). */
export async function fleeFight(ctx: Ctx) {
  const [f] = await ctx.q.query<FightRow>("SELECT * FROM fights WHERE player_id=$1 AND status='active'", [ctx.pid]);
  if (!f) throw new GameError("no_fight", "Нет боя");
  const boss = await lockBoss(ctx.q, f.boss_id);
  await ctx.q.query("UPDATE fights SET status='lost', ended_at=$2, end_total=$3, end_seq=$4 WHERE id=$1", [f.id, new Date(ctx.now), boss.damage_total, boss.last_seq]);
  return { fightId: f.id };
}

// ---------------- views ----------------
interface HitView {
  seq: number;
  playerId: number;
  name: string;
  weapon: string;
  damage: number;
  phrase: number;
  at: number;
  crit: boolean;
}

async function hitsInWindow(q: Queryable, bossId: string, afterSeq: number, upToSeq: number | null, limit: number, onlyPlayer: number | null = null): Promise<HitView[]> {
  const rows = await q.query<{ seq: number; player_id: number; display_name: string; weapon: string; damage: number; phrase: number; created_at: Date; crit: boolean }>(
    `SELECT h.seq, h.player_id, p.display_name, h.weapon, h.damage, h.phrase, h.created_at, h.crit FROM boss_hits h JOIN players p ON p.id = h.player_id
     WHERE h.boss_id=$1 AND h.seq > $2 AND ($3::bigint IS NULL OR h.seq <= $3) AND ($5::int IS NULL OR h.player_id = $5) ORDER BY h.seq DESC LIMIT $4`,
    [bossId, afterSeq, upToSeq, limit, onlyPlayer],
  );
  return rows.map((r) => ({ seq: r.seq, playerId: r.player_id, name: r.display_name, weapon: r.weapon, damage: r.damage, phrase: r.phrase, at: new Date(r.created_at).getTime(), crit: !!r.crit }));
}

export async function fightView(q: Queryable, pid: number, fightId: number, sinceSeq = 0, now = Date.now()) {
  const [f] = await q.query<FightRow>("SELECT * FROM fights WHERE id=$1 AND player_id=$2", [fightId, pid]);
  if (!f) throw new GameError("no_fight", "Бой не найден", 404);
  const [b] = await q.query<BossRow>("SELECT * FROM bosses WHERE id=$1", [f.boss_id]);
  const timeUp = f.status === "active" && new Date(f.ends_at).getTime() <= now;
  const hp = fightHp(f, b.damage_total);
  const upTo = f.end_seq ?? (timeUp ? b.last_seq : null);
  // a solo fight shows only my own hits: the others' damage does not touch it
  const hits = await hitsInWindow(q, f.boss_id, Math.max(f.start_seq, sinceSeq), upTo, 20, f.solo ? pid : null);
  const top = await q.query<{ player_id: number; display_name: string; dmg: number; hits: number }>(
    `SELECT h.player_id, p.display_name, SUM(h.damage)::int AS dmg, COUNT(*)::int AS hits FROM boss_hits h JOIN players p ON p.id=h.player_id
     WHERE h.boss_id=$1 AND h.seq > $2 AND ($3::bigint IS NULL OR h.seq <= $3) AND ($4::int IS NULL OR h.player_id = $4) GROUP BY h.player_id, p.display_name ORDER BY dmg DESC LIMIT 10`,
    [f.boss_id, f.start_seq, upTo, f.solo ? pid : null],
  );
  const [killer] = f.killer_id ? await q.query<{ display_name: string }>("SELECT display_name FROM players WHERE id=$1", [f.killer_id]) : [];
  const fighting = await q.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM fights WHERE boss_id=$1 AND status='active' AND ends_at > $2", [f.boss_id, new Date(now)]);
  return {
    fightId: f.id, bossId: f.boss_id, hp, hpMax: f.hp_max, solo: !!f.solo,
    status: timeUp ? ("lost" as const) : f.status,
    startedAt: new Date(f.started_at).getTime(), endsAt: new Date(f.ends_at).getTime(),
    myDamage: f.my_damage, myHits: f.my_hits, killer: killer?.display_name ?? null, killerIsMe: f.killer_id === pid,
    reward: f.reward, claimed: !!f.reward || (f.status === "lost" && f.seen),
    lastSeq: upTo ?? b.last_seq, hits, top: top.map((t) => ({ playerId: t.player_id, name: t.display_name, damage: t.dmg, hits: t.hits })),
    fightingNow: fighting[0].n,
  };
}

/** Boss list for one player: same list for everybody, access and limits are personal. */
export async function bossList(q: Queryable, pid: number, cfg: Ctx["cfg"], now = Date.now()) {
  const day = moscowDay(now);
  const keys = await q.query<{ item_id: string; qty: number }>("SELECT item_id, qty FROM inventory WHERE player_id=$1 AND item_id LIKE 'key-%'", [pid]);
  const keyMap = new Map(keys.map((k) => [k.item_id, k.qty]));
  const today = await q.query<{ boss_id: string; n: number }>("SELECT boss_id, COUNT(*)::int AS n FROM fights WHERE player_id=$1 AND day=$2 AND status <> 'lost' GROUP BY boss_id", [pid, day]);
  const todayMap = new Map(today.map((t) => [t.boss_id, t.n]));
  const mine = await q.query<{ boss_id: string; damage: number; wins: number }>("SELECT boss_id, damage, wins FROM boss_damage WHERE player_id=$1", [pid]);
  const mineMap = new Map(mine.map((m) => [m.boss_id, m]));
  const active = await q.query<{ boss_id: string; n: number }>("SELECT boss_id, COUNT(*)::int AS n FROM fights WHERE status='active' AND ends_at > $1 GROUP BY boss_id", [new Date(now)]);
  const activeMap = new Map(active.map((a) => [a.boss_id, a.n]));
  const totals = await q.query<{ id: string; wins: number }>("SELECT id, wins FROM bosses");
  const winsMap = new Map(totals.map((t) => [t.id, t.wins]));
  const killers = await q.query<{ boss_id: string; id: number; display_name: string; photo_url: string | null; ended_at: Date }>(
    `SELECT DISTINCT ON (f.boss_id) f.boss_id, p.id, p.display_name, p.photo_url, f.ended_at FROM fights f JOIN players p ON p.id = f.killer_id
     WHERE f.status='won' AND f.killer_id IS NOT NULL ORDER BY f.boss_id, f.ended_at DESC, f.id DESC`,
  );
  const killerMap = new Map(killers.map((k) => [k.boss_id, { id: k.id, name: k.display_name, photo: k.photo_url, at: new Date(k.ended_at).getTime() }]));
  return {
    resetAt: nextMoscowMidnight(now),
    bosses: BOSSES.map((b) => {
      const prev = BOSSES.find((x) => x.order === b.order - 1);
      const keysHave = prev ? keyMap.get(keyId(prev.id)) ?? 0 : 0;
      return {
        id: b.id,
        unlocked: b.order === 1 || keysHave >= keysNeeded(b, cfg.fight.keysToUnlock),
        keysHave,
        keysNeed: keysNeeded(b, cfg.fight.keysToUnlock),
        myKeys: keyMap.get(keyId(b.id)) ?? 0,
        hpMax: cfg.bossHp[b.id] ?? b.hp,
        fightsToday: todayMap.get(b.id) ?? 0,
        fightsPerDay: cfg.fight.perDay,
        myDamage: mineMap.get(b.id)?.damage ?? 0,
        myWins: mineMap.get(b.id)?.wins ?? 0,
        fightingNow: activeMap.get(b.id) ?? 0,
        totalWins: winsMap.get(b.id) ?? 0,
        lastKiller: killerMap.get(b.id) ?? null,
      };
    }),
  };
}

/** Boss page extras: all-time top, my last hits. */
export async function bossDetails(q: Queryable, pid: number, bossId: string) {
  if (!bossById(bossId)) throw new GameError("bad_boss", "Такого босса нет", 404);
  const top = await q.query<{ player_id: number; display_name: string; damage: number; wins: number }>(
    "SELECT d.player_id, p.display_name, d.damage, d.wins FROM boss_damage d JOIN players p ON p.id=d.player_id WHERE d.boss_id=$1 AND d.damage > 0 ORDER BY d.damage DESC LIMIT 20",
    [bossId],
  );
  const mine = await q.query<{ weapon: string; damage: number; phrase: number; created_at: Date; crit: boolean }>(
    "SELECT weapon, damage, phrase, created_at, crit FROM boss_hits WHERE boss_id=$1 AND player_id=$2 ORDER BY id DESC LIMIT 30",
    [bossId, pid],
  );
  return {
    top: top.map((t) => ({ playerId: t.player_id, name: t.display_name, damage: t.damage, wins: t.wins })),
    myHits: mine.map((h) => ({ weapon: h.weapon, damage: h.damage, phrase: h.phrase, at: new Date(h.created_at).getTime(), crit: !!h.crit })),
  };
}

/** Weapons tray for the boss screen: count or cooldown per weapon. */
export async function weaponTray(q: Queryable, pid: number, now = Date.now()) {
  const inv = await q.query<{ item_id: string; qty: number }>("SELECT item_id, qty FROM inventory WHERE player_id=$1", [pid]);
  const cds = await q.query<{ item_id: string; ready_at: Date }>("SELECT item_id, ready_at FROM cooldowns WHERE player_id=$1", [pid]);
  const invMap = new Map(inv.map((i) => [i.item_id, i.qty]));
  const cdMap = new Map(cds.map((c) => [c.item_id, new Date(c.ready_at).getTime()]));
  return WEAPONS.map((w) => ({ id: w.id, qty: invMap.get(w.id) ?? 0, readyAt: (cdMap.get(w.id) ?? 0) > now ? cdMap.get(w.id)! : null }));
}

