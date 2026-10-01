import { describe, expect, it } from "vitest";
import { issueSession, signInitData, validateInitData, verifySession } from "../src/server/auth.ts";

const BOT = "123456:TEST-token";
const now = Math.floor(Date.now() / 1000);
const user = JSON.stringify({ id: 42, first_name: "Alex", username: "alex" });

describe("Telegram initData", () => {
  it("accepts a correctly signed payload", () => {
    const init = signInitData({ auth_date: String(now), user, query_id: "AAA" }, BOT);
    expect(validateInitData(init, BOT).user).toMatchObject({ id: 42, username: "alex" });
  });
  it("rejects tampered data", () => {
    const init = signInitData({ auth_date: String(now), user }, BOT).replace("alex", "admin");
    expect(() => validateInitData(init, BOT)).toThrow(/подпись/i);
  });
  it("rejects a different bot token", () => {
    const init = signInitData({ auth_date: String(now), user }, BOT);
    expect(() => validateInitData(init, "999:other")).toThrow();
  });
  it("rejects stale auth_date", () => {
    const init = signInitData({ auth_date: String(now - 3 * 86400), user }, BOT);
    expect(() => validateInitData(init, BOT)).toThrow(/устарела/);
  });
});

describe("session tokens", () => {
  it("round-trips and rejects forgery / expiry", () => {
    const t = issueSession(7);
    expect(verifySession(t)).toBe(7);
    const [payload] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ pid: 1, exp: now + 999 })).toString("base64url") + "." + t.split(".")[1];
    expect(() => verifySession(forged)).toThrow();
    expect(() => verifySession(payload + ".x")).toThrow();
    expect(() => verifySession(issueSession(7, now - 30 * 86400))).toThrow();
  });
});
