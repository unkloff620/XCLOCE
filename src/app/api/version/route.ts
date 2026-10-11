export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { json } from "../../../server/http.ts";
import { APP_VERSION } from "../../../version.ts";

/** The running release (no database): open pages poll it to learn about an update. */
export async function GET() {
  return json({ version: APP_VERSION });
}
