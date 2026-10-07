import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Db } from "../src/server/db.ts";
import { act, always, freshDb, give, H, M, newPlayer, qty, wallet } from "./helpers.ts";
import { moscowDay, nextMoscowMidnight } from "../src/server/core.ts";
import { QUEST_GROUPS, questsForDay } from "../src/content/quests.ts";
import { taskById } from "../src/content/locations.ts";
import { dispatchNotifications } from "../src/server/notify-send.ts";

let db: Db;
let T0: number;
beforeEach(async () => {
  db = await freshDb();
  T0 = nextMoscowMidnight(Date.now()) + 12 * H;
});

async function setProgress(pid: number, now: number, progress: Record<string, number>) {
  await db.query(
    "INSERT INTO daily_quests (player_id, day, progress) VALUES ($1,$2,$3) ON CONFLICT (player_id, day) DO UPDATE SET progress=EXCLUDED.progress",
    [pid, moscowDay(now), JSON.stringify(progress)],
  );
}
const notes = (pid: number) => db.query<{ kind: string; due_at: Date; sent_at: Date | null; meta: Record<string, unknown> }>("SELECT kind, due_at, sent_at, meta FROM notifications WHERE player_id=$1 ORDER BY kind", [pid]);

describe("daily quests", () => {
  it("three quests a day, one from each group, the same all day, another set possible tomorrow", () => {
    const day = moscowDay(T0);
    const a = questsForDay(7, day);
    expect(a).toHaveLength(3);
    a.forEach((q, i) => expect(QUEST_GROUPS[i]).toContain(q));
    expect(questsForDay(7, day)).toEqual(a);
  });

  it("a hit counts toward today's combat quest", async () => {
    const p = await newPlayer(db);
    await act(db, p, "fight_start", { boss: "datsik" }, T0);
    const r = await act(db, p, "attack", { weapon: "red-candle" }, T0, always(0.99));
    const q0 = r.state.quests.list[0];
    expect(q0.progress).toBe(q0.id === "q-damage" ? 30 : 1);
  });

  it("a location step counts toward steps / energy quests", async () => {
    const p = await newPlayer(db);
    const r = await act(db, p, "task", { taskId: "os-standup" }, T0);
    const q1 = r.state.quests.list[1];
    const expected = q1.id === "q-steps" ? 1 : q1.id === "q-energy" ? taskById("os-standup")!.task.energy : 0;
    expect(q1.progress).toBe(expected);
  });

  it("claim only when done, once; the chest opens after all three and only once", async () => {
    const p = await newPlayer(db);
    const set = questsForDay(p, moscowDay(T0));
    await expect(act(db, p, "quest_claim", { id: set[0].id }, T0)).rejects.toMatchObject({ code: "quest_not_done" });
    await setProgress(p, T0, Object.fromEntries(set.map((q) => [q.id, q.target])));
    const rub0 = await wallet(db, p, "RUB");
    const r = await act(db, p, "quest_claim", { id: set[0].id }, T0);
    expect(await wallet(db, p, "RUB")).toBe(rub0 + (set[0].reward.currencies?.RUB ?? 0));
    await expect(act(db, p, "quest_claim", { id: set[0].id }, T0)).rejects.toMatchObject({ code: "quest_taken" });
    expect(r.state.quests.claimable).toBe(true);
    await expect(act(db, p, "quest_chest", {}, T0)).rejects.toMatchObject({ code: "chest_locked" });
    await act(db, p, "quest_claim", { id: set[1].id }, T0);
    const s = await act(db, p, "quest_claim", { id: set[2].id }, T0);
    expect(s.state.quests.chest.ready).toBe(true);
    const keyboards = await qty(db, p, "keyboard");
    // rng 0.6 → the second loot entry (keyboard)
    const c = await act(db, p, "quest_chest", {}, T0, always(0.6));
    expect(await qty(db, p, "keyboard")).toBe(keyboards + 1);
    expect(c.state.quests).toMatchObject({ claimable: false, chest: { opened: true } });
    await expect(act(db, p, "quest_chest", {}, T0)).rejects.toMatchObject({ code: "chest_taken" });
  });

  it("a quest not in today's set cannot be claimed; the set resets at midnight", async () => {
    const p = await newPlayer(db);
    const today = questsForDay(p, moscowDay(T0)).map((q) => q.id);
    const other = QUEST_GROUPS.flat().find((q) => !today.includes(q.id))!;
    await expect(act(db, p, "quest_claim", { id: other.id }, T0)).rejects.toMatchObject({ code: "bad_quest" });
    await setProgress(p, T0, Object.fromEntries(today.map((id) => [id, 999])));
    const next = await act(db, p, "equip", { itemId: "jeans" }, T0 + 13 * H);
    expect(next.state.quests.list.every((q: { progress: number }) => q.progress === 0)).toBe(true);
  });
});

describe("Telegram reminders", () => {
  it("energy: armed for the moment regeneration fills up, dropped when full", async () => {
    const p = await newPlayer(db);
    await db.query("UPDATE players SET energy=50, energy_at=$2 WHERE id=$1", [p, new Date(T0)]);
    const cost = taskById("os-standup")!.task.energy;
    await act(db, p, "task", { taskId: "os-standup" }, T0);
    const [n] = await notes(p);
    expect(n.kind).toBe("energy_full");
    expect(new Date(n.due_at).getTime()).toBe(T0 + cost * 5 * M);
    await db.query("UPDATE players SET energy=60 WHERE id=$1", [p]);
    await act(db, p, "equip", { itemId: "jeans" }, T0 + M);
    expect(await notes(p)).toHaveLength(0);
  });

  it("the fist: armed for when it is ready; boss almost dead: the others in that fight are told once", async () => {
    await db.query("INSERT INTO config (key, value) VALUES ('boss.hp', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [JSON.stringify({ datsik: 200 })]);
    const { resetConfigCache } = await import("../src/server/config.ts");
    resetConfigCache();
    const a = await newPlayer(db);
    const b = await newPlayer(db);
    await act(db, a, "fight_start", { boss: "datsik" }, T0);
    await act(db, b, "fight_start", { boss: "datsik" }, T0);
    await act(db, a, "attack", { weapon: "fist" }, T0, always(0.99));
    expect((await notes(a)).find((x) => x.kind === "fist_ready")?.due_at).toEqual(new Date(T0 + 300 * M));
    await give(db, a, "gpu", 10);
    for (let i = 0; i < 2; i++) await act(db, a, "attack", { weapon: "gpu" }, T0 + M, always(0.99));
    // 12 + 120 = 132 of 200 → 34% left; one more GPU → 192, 4% left
    expect((await notes(b)).some((x) => x.kind === "boss_low")).toBe(false);
    await act(db, a, "attack", { weapon: "gpu" }, T0 + M, always(0.99));
    const low = (await notes(b)).filter((x) => x.kind === "boss_low");
    expect(low).toHaveLength(1);
    expect(low[0].meta).toMatchObject({ bossId: "datsik" });
    expect((await notes(a)).some((x) => x.kind === "boss_low")).toBe(false);
  });

  describe("sending", () => {
    const sent: { chat_id: number; text: string }[] = [];
    beforeEach(() => {
      sent.length = 0;
      vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token");
      vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
        const body = JSON.parse(init.body);
        sent.push(body);
        return new Response(JSON.stringify({ ok: body.chat_id !== 666 }), { status: body.chat_id === 666 ? 403 : 200 });
      }));
    });
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    });

    async function tgPlayer(tgId: number, seenAt: number) {
      const p = await newPlayer(db);
      await db.query("UPDATE players SET telegram_id=$2, last_seen_at=$3 WHERE id=$1", [p, tgId, new Date(seenAt)]);
      return p;
    }

    it("sends due reminders whose reason still holds, once; marks a player who blocked the bot; quiet at night", async () => {
      const p = await tgPlayer(111, T0 - H);
      const q = await tgPlayer(666, T0 - H);
      const r = await tgPlayer(222, T0 - H);
      // p and q: full energy now; r: energy not full yet → its reminder is stale and goes quiet
      for (const id of [p, q]) await db.query("UPDATE players SET energy=50, energy_at=$2 WHERE id=$1", [id, new Date(T0 - H)]);
      await db.query("UPDATE players SET energy=10, energy_at=$2 WHERE id=$1", [r, new Date(T0 - M)]);
      for (const id of [p, q, r]) await db.query("INSERT INTO notifications (player_id, kind, due_at) VALUES ($1,'energy_full',$2)", [id, new Date(T0 - 10 * H)]);

      // 03:00 MSK: due, but nothing goes out at night
      const night = T0 - 9 * H;
      expect(await dispatchNotifications(db, night)).toEqual({ sent: 0, skipped: 0 });

      const out = await dispatchNotifications(db, T0);
      expect(out.sent).toBe(1);
      expect(sent.map((s) => s.chat_id).sort()).toEqual([111, 666]);
      expect(sent.find((s) => s.chat_id === 111)!.text).toContain("Энергия полная");
      const [qb] = await db.query<{ pm_blocked: boolean }>("SELECT pm_blocked FROM players WHERE id=$1", [q]);
      expect(qb.pm_blocked).toBe(true);
      // throttled for 20 s, then nothing is due any more
      expect(await dispatchNotifications(db, T0 + 1000)).toEqual({ sent: 0, skipped: 0 });
      expect((await dispatchNotifications(db, T0 + M)).sent).toBe(0);
      expect(sent).toHaveLength(2);
    });

    it("a player who is in the game right now is not disturbed; the switch turns reminders off", async () => {
      const q0 = await newPlayer(db);
      await act(db, q0, "notify_set", { on: false }, T0 - 2 * M);
      const p = await tgPlayer(111, T0 - 30_000);
      const q = q0;
      await db.query("UPDATE players SET telegram_id=333, last_seen_at=$2 WHERE id=$1", [q, new Date(T0 - H)]);
      for (const id of [p, q]) {
        await db.query("UPDATE players SET energy=50, energy_at=$2 WHERE id=$1", [id, new Date(T0 - H)]);
        await db.query("INSERT INTO notifications (player_id, kind, due_at) VALUES ($1,'energy_full',$2)", [id, new Date(T0 - M)]);
      }
      expect(await dispatchNotifications(db, T0)).toMatchObject({ sent: 0 });
      expect(sent).toHaveLength(0);
    });
  });
});
