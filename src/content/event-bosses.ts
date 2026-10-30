/**
 * Event bosses: bosses that are not in the usual chain (content/bosses.ts) — the admin turns each one on or off in the
 * admin panel («Ивенты»), config key "event.bosses" ({ id: true }). Off by default: a new one stays hidden until put in.
 * While on, the home screen shows his «Ивент» button and his page (/event/<id>) lets players fight.
 */
export interface EventBossDef { id: string; name: string; title: string; hp: number; portrait: string; href: string }

export const EVENT_BOSSES: EventBossDef[] = [
  { id: "pepe", name: "Пепе", title: "Ивент · пробный бой", hp: 250_000, portrait: "/bosses/pepe/portrait.webp", href: "/event/pepe" },
];

export const eventBossById = (id: string) => EVENT_BOSSES.find((b) => b.id === id);

/** the admin's switches from the config row, only known bosses, only true/false */
export function cleanEventBosses(v: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (v && typeof v === "object" && !Array.isArray(v)) for (const b of EVENT_BOSSES) { const x = (v as Record<string, unknown>)[b.id]; if (typeof x === "boolean") out[b.id] = x; }
  return out;
}
