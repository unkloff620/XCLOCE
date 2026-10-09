export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { adminRoute, num, oneOf } from "../../../server/http.ts";
import * as admin from "../../../server/admin.ts";

const OPS = ["me", "dashboard", "players", "player", "actions", "admin_log", "edit", "events", "event_save", "event_delete"] as const;
const optNum = (v: unknown) => (v === undefined || v === null || v === "" ? undefined : num(v, "number"));
const optStr = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 100) : undefined);

/** One endpoint for the admin panel: { op, ... }. Guarded by an admin session (see adminRoute). */
export const POST = adminRoute("admin", async ({ db, body, adminTg }) => {
  switch (oneOf(body.op, OPS, "op")) {
    case "me": return { tg: adminTg };
    case "dashboard": return admin.dashboard(db);
    case "players": return admin.players(db, { q: optStr(body.q), sort: body.sort ? oneOf(body.sort, admin.PLAYER_SORTS, "sort") : undefined, offset: optNum(body.offset), banned: body.banned === true });
    case "player": return admin.player(db, num(body.id, "id"));
    case "actions": return admin.actions(db, { playerId: optNum(body.playerId), type: optStr(body.type), failed: body.failed === true, before: optNum(body.before), sinceHours: optNum(body.sinceHours) });
    case "admin_log": return admin.adminLog(db, optNum(body.before));
    case "events": return admin.events(db);
    case "event_save": return admin.eventSave(db, adminTg, (body.event ?? {}) as admin.EventInput);
    case "event_delete": return admin.eventDelete(db, num(body.id, "id"));
    case "edit": {
      const e = body.edit as Record<string, unknown> | undefined;
      oneOf(e?.op, admin.EDIT_OPS, "edit.op");
      return admin.edit(db, adminTg, num(body.id, "id"), e as unknown as admin.Edit);
    }
  }
});
