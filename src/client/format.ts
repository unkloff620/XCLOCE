export function money(n: number, opts: { compact?: boolean; sign?: boolean } = {}): string {
  if (!Number.isFinite(n)) return "$0";
  const sign = opts.sign && n > 0 ? "+" : n < 0 ? "-" : "";
  const a = Math.abs(n);
  let body: string;
  if (opts.compact && a >= 1e9) body = (a / 1e9).toFixed(2) + "B";
  else if (opts.compact && a >= 1e6) body = (a / 1e6).toFixed(2) + "M";
  else if (opts.compact && a >= 1e4) body = (a / 1e3).toFixed(1) + "K";
  else if (a >= 100) body = Math.round(a).toLocaleString("en-US");
  else body = a.toFixed(2);
  return `${sign}$${body}`;
}

export function num(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "0";
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (a >= 1e4) return (n / 1e3).toFixed(1) + "K";
  if (a >= 100) return Math.round(n).toLocaleString("ru-RU");
  return n.toFixed(digits);
}

export function cur(n: number, c: string): string {
  if (c === "USD") return money(n);
  if (c === "RUB") return `${num(n, 0)} ₽`;
  if (c === "SOL") return `${n >= 100 ? num(n) : n.toFixed(n >= 1 ? 3 : 4)} SOL`;
  if (c === "BTC") return `${n.toFixed(6)} BTC`;
  return `${num(n)} ${c}`;
}

/** Token prices span 1e-10..10: show significant digits, with subscript-zero notation for tiny values. */
export function price(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return "$0";
  if (p >= 1) return "$" + p.toFixed(3);
  if (p >= 0.01) return "$" + p.toFixed(4);
  const s = p.toFixed(14).split(".")[1];
  const zeros = s.match(/^0*/)?.[0].length ?? 0;
  const digits = s.slice(zeros, zeros + 4);
  if (zeros >= 4) {
    const sub = String(zeros).split("").map((d) => "₀₁₂₃₄₅₆₇₈₉"[Number(d)]).join("");
    return `$0.0${sub}${digits}`;
  }
  return "$0." + "0".repeat(zeros) + digits;
}

export function pct(x: number, sign = true): string {
  if (!Number.isFinite(x)) return "0%";
  const v = x * 100;
  const s = Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1);
  return `${sign && v > 0 ? "+" : ""}${s}%`;
}

export function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}с`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}м`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}ч`;
  return `${Math.round(h / 24)}д`;
}
