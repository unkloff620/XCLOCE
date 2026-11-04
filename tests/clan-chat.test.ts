import { describe, expect, test } from "vitest";
import { act, freshDb, newPlayer } from "./helpers.ts";
import { chatDelete, chatList, chatSend, chatUnread } from "../src/server/systems/clan-chat.ts";

const T0 = Date.UTC(2026, 10, 4, 12);

describe("clan chat", () => {
  test("members write, read, the unread count, news, delete", async () => {
    const db = await freshDb();
    const a = await newPlayer(db), b = await newPlayer(db), out = await newPlayer(db);
    const c = await act(db, a, "clan_create", { name: "Братва", tag: "BRT", emblem: "rocket", color: "#ff4d6d" }, T0);
    const clanId = c.result.clanId as number;
    await act(db, b, "clan_join", { clanId }, T0);
    await act(db, a, "clan_accept", { playerId: b }, T0);
    await expect(chatList(db, out)).rejects.toThrow();
    await expect(chatSend(db, out, "привет")).rejects.toThrow();
    await expect(chatSend(db, a, "   ")).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 5));
    const sent = await chatSend(db, a, "  привет,\n братва  ");
    expect(sent.msgs.at(-1)).toMatchObject({ pid: a, text: "привет,\nбратва", leader: true });
    expect(sent.msgs.some((m) => m.pid == null && m.text.includes("вступил"))).toBe(true);
    expect(await chatUnread(db, b, clanId)).toBe(1);
    expect(await chatUnread(db, a, clanId)).toBe(0);
    const seen = await chatList(db, b);
    expect(await chatUnread(db, b, clanId)).toBe(0);
    expect((await act(db, b, "equip", { item: "jeans" }, T0).catch(() => null))?.state.clanRequests.chat ?? 0).toBe(0);
    const mine = (await chatSend(db, b, "здарова")).msgs.at(-1)!;
    await expect(chatSend(db, b, "здарова")).rejects.toThrow();
    // b cannot delete the leader's message; the leader can delete b's
    await expect(chatDelete(db, b, seen.msgs.at(-1)!.id)).rejects.toThrow();
    const after = await chatDelete(db, a, mine.id);
    expect(after.msgs.find((m) => m.id === mine.id)).toBeUndefined();
    await act(db, a, "clan_kick", { playerId: b }, T0);
    expect((await chatList(db, a)).msgs.at(-1)?.text).toContain("исключён");
    await expect(chatList(db, b)).rejects.toThrow();
  });
});
