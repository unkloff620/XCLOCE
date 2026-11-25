import { describe, expect, it } from "vitest";
import { act, freshDb, newPlayer } from "./helpers.ts";

describe("friends", () => {
  it("a request from his room waits in his messages; he takes it — both see each other in the strip", async () => {
    const db = await freshDb();
    const a = await newPlayer(db), b = await newPlayer(db), c = await newPlayer(db);
    await expect(act(db, a, "friend_add", { to: a })).rejects.toMatchObject({ code: "friend_self" });
    expect((await act(db, a, "friend_add", { to: b })).result).toMatchObject({ state: "sent" });
    await expect(act(db, a, "friend_add", { to: b })).rejects.toMatchObject({ code: "friend_sent" });
    const st = await act(db, b, "notes_read", {});
    expect(st.state.friendRequests).toHaveLength(1);
    expect(st.state.friendRequests[0]).toMatchObject({ id: a, talents: 0, achievements: 0 });
    expect((await act(db, b, "friend_answer", { from: a, yes: true })).result).toMatchObject({ state: "friends" });
    const { friendsStrip, friendState } = await import("../src/server/systems/friends.ts");
    expect((await friendsStrip(db, a, Date.now())).friends.map((r) => r.id).sort()).toEqual([a, b].sort());
    expect(await friendState(db, b, a)).toBe("friends");
    // his own request to me: my [+] makes us friends at once; a turned-down one is gone
    await act(db, c, "friend_add", { to: a });
    expect((await act(db, a, "friend_add", { to: c })).result).toMatchObject({ state: "friends" });
    await act(db, a, "friend_remove", { id: c });
    expect(await friendState(db, a, c)).toBe("none");
    await act(db, c, "friend_add", { to: b });
    await act(db, b, "friend_answer", { from: c, yes: false });
    expect(await friendState(db, b, c)).toBe("none");
  });
});
