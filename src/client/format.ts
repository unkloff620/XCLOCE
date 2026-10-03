import { CURRENCY_DEFS, type Currency } from "../content/currencies.ts";

const nf = new Intl.NumberFormat("ru-RU");

/** 1 234 · 12.4K · 1.2M — for the HUD and tight places. */
export function short(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
  if (a >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (a >= 1e4) return (v / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return nf.format(Math.floor(v));
}
export function full(v: number): string {
  return nf.format(v);
}
/** Currency amount with its own precision, trailing zeros trimmed. */
export function money(c: Currency, v: number): string {
  const d = CURRENCY_DEFS[c].decimals;
  if (d === 0) return nf.format(Math.floor(v));
  const s = v.toFixed(d).replace(/0+$/, "").replace(/\.$/, "");
  const [i, f] = s.split(".");
  return nf.format(Number(i)) + (f ? "," + f : "");
}
export function moneyShort(c: Currency, v: number): string {
  if (CURRENCY_DEFS[c].decimals === 0 || v >= 1000) return short(v);
  return money(c, v);
}
export function clock(ms: number): string {
  const t = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${p(h)}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}
export function dateRu(ms: number): string {
  return new Date(ms).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}
export const pct = (a: number, b: number) => (b > 0 ? Math.max(0, Math.min(100, (a / b) * 100)) : 0);
