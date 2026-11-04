export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { authedRoute, num } from "../../../server/http.ts";
import { chatDelete, chatList, chatSend } from "../../../server/systems/clan-chat.ts";

/** GET: my clan's last messages (and marks them seen); POST { text } — write, { delete: id } — remove one */
export const GET = authedRoute("clan-chat", async ({ db, playerId }) => chatList(db, playerId));
export const POST = authedRoute("clan-chat.post", async ({ db, body, playerId }) => {
  if (body.delete !== undefined) return chatDelete(db, playerId, num(body.delete, "delete"));
  return chatSend(db, playerId, typeof body.text === "string" ? body.text.slice(0, 2000) : "");
});
