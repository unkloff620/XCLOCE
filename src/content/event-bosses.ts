/**
 * Event bosses: bosses that are not in the usual chain (content/bosses.ts) — the admin turns each one on or off in the
 * admin panel («Ивенты»), config key "event.bosses" ({ id: true }). Off by default: a new one stays hidden until put in.
 * While on, the home screen shows his «Ивент» button and his page (/event/<id>) lets players fight.
 */
export interface EventBossDef { id: string; name: string; title: string; hp: number; portrait: string; href: string; mentor?: boolean }
/** the mentors: always open, shown in the «Менторы» tab instead of the home screen's «Ивент» button */
export const MENTORS = (): EventBossDef[] => EVENT_BOSSES.filter((b) => b.mentor);

export const EVENT_BOSSES: EventBossDef[] = [
  // Пепе is a mentor now (the «Менторы» tab of the bosses, always on): no admin switch, not on the home screen
  { id: "pepe", name: "Пепе", title: "Ментор", hp: 100_000, portrait: "/bosses/pepe/portrait.webp", href: "/event/pepe", mentor: true },
  { id: "nitka", name: "Нитка", title: "Ментор", hp: 1_000_000, portrait: "/bosses/nitka/portrait.webp", href: "/bosses/nitka", mentor: true },
  { id: "psih", name: "Псих", title: "Ментор", hp: 100_000_000, portrait: "/bosses/psih/portrait.webp", href: "/bosses/psih", mentor: true },
];

export const eventBossById = (id: string) => EVENT_BOSSES.find((b) => b.id === id);

/** the admin's switches from the config row, only known bosses, only true/false */
export function cleanEventBosses(v: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (v && typeof v === "object" && !Array.isArray(v)) for (const b of EVENT_BOSSES.filter((x) => !x.mentor)) { const x = (v as Record<string, unknown>)[b.id]; if (typeof x === "boolean") out[b.id] = x; }
  return out;
}
