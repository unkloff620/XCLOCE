"use client";
import { useState } from "react";
import { MEDAL_ACHIEVEMENTS } from "../content/achievements.ts";
import { MEDAL_NAMES, MEDAL_SET, MEDAL_TIERS, FIGHT_MODES, medalBonus, medalStep, medalWeapon } from "../content/medals.ts";
import { BlastIcon } from "./art/blast.tsx";
import { ACH_CATEGORIES, BOSS_KILL_ACHIEVEMENTS, BOSS_KILL_TARGETS, SOLO_BOSS_ACHIEVEMENTS, TIER_COLORS, TIER_NAMES, achievementById, type AchCategory, type AchTier } from "../content/achievements.ts";
import { Icon, type IconName } from "./art/icons.tsx";
import { Modal, RewardChips } from "./ui.tsx";
import { useGame } from "./store.tsx";
import { haptic } from "./telegram.ts";
import { full, short } from "./format.ts";
import { BOSSES as OPEN_ALL } from "../content/bosses.ts";
import { STASH_LOCATION_NAMES, STASH_SETS_ORDERED } from "../content/stashes.ts";
import { itemById } from "../content/items.ts";
import { BossPhoto } from "./screens/boss-parts.tsx";
import { BossCoin } from "./art/boss-coin.tsx";

export interface AchRow { id: string; progress: number; target: number; done: boolean; claimed: boolean; at: number | null }

/** A hexagonal medal in its tier colour (bronze → diamond); grey until earned. */
export function BadgeMedal({ icon, tier, earned, size = 54 }: { icon: string; tier: AchTier | 0; earned: boolean; size?: number }) {
  // drawn achievement pictures sit inside the same medal as the simple icons, at the same size
  const art = icon.startsWith("ach-");
  return (
    <span className={`badge-wrap ${art ? "art" : ""} ${earned ? "" : "locked"}`} style={{ width: size, height: size }}>
      <span className={`badge-medal tier-${tier} ${earned ? "" : "locked"}`} style={{ width: size, height: size }}>
        {!art && <Icon name={icon as IconName} size={size * 0.6} />}
      </span>
      {art && <span className="badge-art"><Icon name={icon as IconName} size={size * 0.74} /></span>}
    </span>
  );
}

const TIERS: AchTier[] = [1, 2, 3, 4, 5];
/** a category's own tiers (most have five; a one-off like «Лидер» has fewer) */
const tiersOf = (c: AchCategory): AchTier[] => c.targets.map((_, i) => (i + 1) as AchTier);

/** the lists of the achievements: everything about bosses, the money side, the locations, нычки and the rest */
type AchGroup = "boss" | "eco" | "tasks" | "stash" | "games" | "misc";
const ACH_GROUPS: { id: AchGroup; name: string }[] = [
  { id: "boss", name: "Боевые" }, { id: "eco", name: "Экономика" }, { id: "tasks", name: "Задания" }, { id: "stash", name: "Нычки" }, { id: "games", name: "Мини-игры" }, { id: "misc", name: "Прочее" },
];
const GROUP_OF: Record<string, AchGroup> = {
  damage: "boss", hits: "boss", wins: "boss", solo: "boss", kills: "boss", weekly: "boss", "wins-blat": "boss", "wins-avtor": "boss", "all-bosses": "boss",
  authority: "eco", yard: "eco", chests: "eco", exchanger: "eco", "spent-rub": "eco", "spent-usd": "eco",
  "save-rub": "eco", "save-usd": "eco", "save-sol": "eco", "save-btc": "eco",
  locations: "tasks", tasks: "tasks",
  "slots-spins": "games", "slots-777": "games", "slots-level": "games", "upg-wins": "games", "upg-low": "games", "upg-streak": "games",
  "zonk-games": "games", "zonk-best": "games", "zonk-duels": "games", "poker-hands": "games", "poker-level": "games", "bj-blackjacks": "games", "bj-wins": "games",
};
const groupOf = (id: string): AchGroup => GROUP_OF[id] ?? "misc";

function catState(c: AchCategory, rows: Map<string, AchRow>, self: boolean) {
  const tiers = tiersOf(c).map((t) => rows.get(`${c.id}-${t}`));
  // a tier counts as earned once collected (others' profiles: once reached)
  const earned = tiers.filter((r) => r && (r.claimed || (!self && r.done))).length as AchTier | 0;
  const reached = tiers.filter((r) => r?.done).length;
  const ready = self ? tiers.find((r) => r?.done && !r.claimed) ?? null : null;
  const progress = tiers[0]?.progress ?? 0;
  const next = c.targets[Math.min(c.targets.length - 1, reached)];
  return { tiers, earned, reached, ready, progress, next };
}

/** Profile block: one row per category with five coloured steps; on your own profile reached steps are collected. */
export function BadgesPanel({ rows, self, onClaimed, points = 0, unfolded = false, stashOnly = false }: { rows: AchRow[]; self: boolean; onClaimed?: () => void; points?: number; unfolded?: boolean; stashOnly?: boolean }) {
  // the list is folded (open at once in the «Личное дело» tab); the header shows the count, the points and what waits
  const [shown, setShown] = useState(unfolded);
  const { act, busy } = useGame();
  const [open, setOpen] = useState<string | null>(null);
  const [soloOpen, setSoloOpen] = useState(false);
  const [killOpen, setKillOpen] = useState(false);
  const [coinOpen, setCoinOpen] = useState(false);
  const [group, setGroup] = useState<AchGroup>("boss");
  const [stashItem, setStashItem] = useState<string | null>(null);
  const { state } = useGame();
  const stashQty = new Map(self ? (state?.inventory ?? []).filter((i) => i.qty > 0 && i.id.startsWith("stash-")).map((i) => [i.id, i.qty] as const) : []);
  const ownedStash = new Set(stashQty.keys());
  const collect = async (setId: string, name: string) => {
    const r = await act<{ count: number }>("stash_collect", { set: setId }, (x) => `Набор «${name}» собран (${x.count})`);
    if (r) {
      haptic.big();
      onClaimed?.();
    }
  };
  const [medal, setMedal] = useState<string | null>(null);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const total = rows.filter((r) => r.claimed || (!self && r.done)).length;
  const waiting = self ? rows.filter((r) => r.done && !r.claimed).length : 0;
  const claim = async (id: string) => {
    const r = await act("achievement_claim", { id }, "Награда за достижение получена");
    if (r) {
      haptic.big();
      onClaimed?.();
    }
  };
  const cat = open ? ACH_CATEGORIES.find((c) => c.id === open) : null;
  const cs = cat ? catState(cat, byId, self) : null;
  // the нычки list: in its own window from the achievements, or right in the «Нычки» tab of the dossier
  const stashBody = (
          <div className="col" style={{ gap: 8 }}>
            <div className="small muted center">Нычки выпадают за задания в локациях.</div>
            {STASH_SETS_ORDERED.map((st, k, arr) => {
              const count = self ? state?.stashSets?.[st.n] ?? 0 : byId.get(`stashset-${st.n}-3`)?.progress ?? 0;
              const ready = self && st.items.every((it) => (stashQty.get(it.id) ?? 0) > 0);
              return (
                <div key={st.id} className="col" style={{ gap: 6 }}>
                {(k === 0 || arr[k - 1].location !== st.location) && <b className="tiny muted stash-loc">{STASH_LOCATION_NAMES[st.location]?.toUpperCase()}</b>}
                <div className={`stash-set ${ready ? "done" : ""}`}>
                  <div className="row" style={{ justifyContent: "space-between", gap: 6 }}>
                    <span className="col" style={{ gap: 0, minWidth: 0 }}>
                      <b className="ellipsis">{st.name}</b>
                      <span className="tiny muted">собрано: <b className="num" style={{ color: "var(--ink)" }}>{count}</b></span>
                    </span>
                    <span className="bk-medals">
                      {([1, 2, 3] as AchTier[]).map((t) => {
                        const id = `stashset-${st.n}-${t}`;
                        const r = byId.get(id);
                        const gotM = !!r && (r.claimed || (!self && r.done));
                        const due = self && !!r?.done && !r.claimed;
                        return (
                          <button key={t} className={`bk-medal ${due ? "due" : ""}`} onClick={() => setMedal(id)} aria-label={achievementById(id)?.name}>
                            <BadgeMedal icon="chest" tier={t} earned={gotM || due} size={28} />
                          </button>
                        );
                      })}
                    </span>
                  </div>
                  <div className="stash-row">
                    <button className={`stash-cell full ${ready ? "ready" : count ? "" : "off"}`} disabled={!ready || busy === "stash_collect"} onClick={() => collect(st.id, st.name)} title={ready ? "Собрать набор и забрать награду" : "Полный набор"}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/assets/stash/set-${st.n}.webp`} alt="Полный набор" />
                      {ready && <i className="stash-take">Забрать</i>}
                    </button>
                    {st.items.map((it) => {
                      const q = stashQty.get(it.id) ?? 0;
                      return (
                        <button key={it.id} className={`stash-cell ${q > 0 || (!self && count > 0) ? "" : "off"}`} onClick={() => setStashItem(it.id)} aria-label={it.name}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/assets/items/${it.id}.webp`} alt="" />
                          {self && <i className={`stash-n num ${q > 0 ? "has" : ""}`}>{q}</i>}
                        </button>
                      );
                    })}
                  </div>
                  <RewardChips r={st.reward} size={13} />
                </div>
                </div>
              );
            })}
          </div>
  );
  if (stashOnly) return (
    <>
      {stashBody}
      {stashItem && (() => {
        const d = itemById(stashItem);
        const has = ownedStash.has(stashItem);
        return (
          <Modal title={d?.name ?? "Нычка"} onClose={() => setStashItem(null)}>
            <div className="col" style={{ gap: 8, alignItems: "center", textAlign: "center" }}>
              <span className={`stash-cell big ${has || !self ? "" : "off"}`}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={`/assets/items/${stashItem}.webp`} alt="" /></span>
              <span className="small">{d?.description}</span>
              <span className="tiny muted">{self ? (has ? "Найдена" : "Ещё не найдена — ищи в заданиях локации") : ""}</span>
            </div>
          </Modal>
        );
      })()}
      {medal && (() => {
        const a = achievementById(medal);
        const r = byId.get(medal);
        if (!a) return null;
        const got = !!r && (r.claimed || (!self && r.done));
        const due = self && !!r?.done && !r?.claimed;
        return (
          <Modal title={a.name} onClose={() => setMedal(null)}>
            <div className="col" style={{ gap: 10, alignItems: "center", textAlign: "center" }}>
              {(() => {
                // a «Убийца боссов» medal is the boss's face on the coin of its tier
                const kb = medal.startsWith("bosskill-") ? OPEN_ALL.find((b) => medal === `bosskill-${b.id}-${a.tier}`) : undefined;
                return kb ? <BossCoin boss={kb} tier={MEDAL_TIERS[a.tier - 1]} size={80} dim={!(got || due)} /> : <BadgeMedal icon={a.icon} tier={a.tier} earned={got || due} size={72} />;
              })()}
              <b className="tier-name" style={{ color: TIER_COLORS[a.tier] }}>{TIER_NAMES[a.tier]}</b>
              <span className="small">{a.hint}</span>
              <span className="ach-bar" style={{ width: "100%", ["--p" as string]: `${Math.round(((r?.progress ?? 0) / a.target) * 100)}%`, ["--c" as string]: TIER_COLORS[a.tier] }}>
                <i /><span className="num">{full(r?.progress ?? 0)} / {full(a.target)}</span>
              </span>
              <RewardChips r={a.reward} size={15} />
              {got ? <span className="quest-ok display">✓ получено</span> : due ? (
                <button className="btn gold block" disabled={busy === "achievement_claim"} onClick={async () => { await claim(a.id); setMedal(null); }}>Забрать</button>
              ) : null}
            </div>
          </Modal>
        );
      })()}
    </>
  );
  return (
    <div className="panel">
      <button type="button" className={`ach-head ${waiting ? "ready" : ""}`} onClick={() => setShown((v) => !v)} aria-expanded={shown}>
        <span className="small muted">ДОСТИЖЕНИЯ</span>
        {waiting > 0 && <span className="chip gold ach-wait">забрать: {waiting}</span>}
        <span className="grow" />
        <span className="chip ach-pts" title="Очки достижений"><Icon name="sun" size={16} /><b className="num">{full(points)}</b></span>
        <span className="tiny muted num">{total}/{rows.length}</span>
        <span className={`ach-caret ${shown ? "open" : ""}`} aria-hidden="true">▾</span>
      </button>
      {shown && <div className="ach-groups" role="tablist">
        {ACH_GROUPS.map((g) => {
          const due = self && rows.some((r) => r.done && !r.claimed && (g.id === "boss" ? /^(soloboss|bosskill|medal)-/.test(r.id) || groupOf(r.id.replace(/-\d$/, "")) === "boss" : g.id === "stash" ? r.id.startsWith("stashset-") : !/^(soloboss|bosskill|medal|stashset)-/.test(r.id) && groupOf(r.id.replace(/-\d$/, "")) === g.id));
          const setReady = g.id === "stash" && self && STASH_SETS_ORDERED.some((st) => st.items.every((it) => (stashQty.get(it.id) ?? 0) > 0));
          return <button key={g.id} type="button" role="tab" aria-selected={group === g.id} className={`ach-group ${group === g.id ? "on" : ""} ${due || setReady ? "due" : ""}`} onClick={() => { haptic.tap(); setGroup(g.id); }}>{g.name}</button>;
        })}
      </div>}
      {shown && group === "stash" && <div style={{ marginTop: 8 }}>{stashBody}</div>}
      {shown && group !== "stash" && <div className="col" style={{ gap: 8, marginTop: 8 }}>
        {ACH_CATEGORIES.filter((c) => groupOf(c.id) === group).map((c) => {
          const s = catState(c, byId, self);
          const maxed = s.reached >= c.targets.length;
          const pct = maxed ? 100 : Math.min(100, Math.round((s.progress / s.next) * 100));
          return (
            <div key={c.id} role="button" tabIndex={0} className={`ach-row ${s.ready ? "ready" : ""}`} onClick={() => setOpen(c.id)} onKeyDown={(e) => e.key === "Enter" && setOpen(c.id)}>
              <BadgeMedal icon={c.icon} tier={s.earned} earned={s.earned > 0} size={44} />
              <span className="ach-main">
                <span className="row" style={{ justifyContent: "space-between", gap: 6 }}>
                  <b className="ach-name">{c.name}</b>
                  <span className="ach-steps" aria-label={`${s.earned} из ${c.targets.length}`}>
                    {tiersOf(c).map((t, i) => {
                      const r = s.tiers[i];
                      const on = !!r && (r.claimed || (!self && r.done));
                      return <i key={t} className={`${on ? "on" : r?.done ? "due" : ""}`} style={{ ["--c" as string]: TIER_COLORS[t] }} title={`${TIER_NAMES[t]}: ${full(c.targets[i])}`} />;
                    })}
                  </span>
                </span>
                <span className="ach-bar sm" style={{ ["--p" as string]: `${pct}%`, ["--c" as string]: TIER_COLORS[Math.min(5, s.reached + 1) as AchTier] }}>
                  <i /><span className="num">{maxed ? "всё собрано" : `${short(s.progress)} / ${short(s.next)}`}</span>
                </span>
              </span>
              {/* collected right here, one after another; the row itself opens the details */}
              {s.ready && (
                <button className="btn gold sm ach-take" disabled={busy === "achievement_claim"}
                  onClick={(e) => {
                    e.stopPropagation();
                    void claim(s.ready!.id);
                  }}>Забрать</button>
              )}
            </div>
          );
        })}
        {/* one cell for the per-boss solo badges; the window lists every boss and its reward */}
        {group === "boss" && (() => {
          const soloList = SOLO_BOSS_ACHIEVEMENTS.filter((a) => byId.has(a.id));
          const sr = soloList.map((a) => byId.get(a.id));
          const got = sr.filter((r) => r && (r.claimed || (!self && r.done))).length;
          const ready = self ? soloList.find((a) => { const r = byId.get(a.id); return r?.done && !r.claimed; }) ?? null : null;
          const n = soloList.length;
          const top = Math.max(0, ...soloList.filter((a) => { const r = byId.get(a.id); return r && (r.claimed || (!self && r.done)); }).map((a) => a.tier)) as AchTier | 0;
          return (
            <div role="button" tabIndex={0} className={`ach-row ${ready ? "ready" : ""}`} onClick={() => setSoloOpen(true)} onKeyDown={(e) => e.key === "Enter" && setSoloOpen(true)}>
              <BadgeMedal icon="ach-solo" tier={top} earned={got > 0} size={44} />
              <span className="ach-main">
                <span className="row" style={{ justifyContent: "space-between", gap: 6 }}>
                  <b className="ach-name">Соло-убийства</b>
                  <span className="tiny muted num">{got}/{n}</span>
                </span>
                <span className="ach-bar sm" style={{ ["--p" as string]: `${Math.round((got / n) * 100)}%`, ["--c" as string]: "#ffcc33" }}>
                  <i /><span className="num">{got >= n ? "всё собрано" : `${got} / ${n} боссов`}</span>
                </span>
              </span>
              {ready && (
                <button className="btn gold sm ach-take" disabled={busy === "achievement_claim"}
                  onClick={(e) => {
                    e.stopPropagation();
                    void claim(ready.id);
                  }}>Забрать</button>
              )}
            </div>
          );
        })()}
        {/* «Убийца боссов»: every boss with three medals — 10, 50 and 100 wins */}
        {group === "boss" && (() => {
          const killList = BOSS_KILL_ACHIEVEMENTS.filter((a) => byId.has(a.id));
          const got = killList.filter((a) => { const r = byId.get(a.id); return r && (r.claimed || (!self && r.done)); });
          const ready = self ? killList.find((a) => { const r = byId.get(a.id); return r?.done && !r.claimed; }) ?? null : null;
          const n = killList.length;
          const top = Math.max(0, ...got.map((a) => a.tier)) as AchTier | 0;
          return (
            <div role="button" tabIndex={0} className={`ach-row ${ready ? "ready" : ""}`} onClick={() => setKillOpen(true)} onKeyDown={(e) => e.key === "Enter" && setKillOpen(true)}>
              <BadgeMedal icon="ach-wins" tier={top} earned={got.length > 0} size={44} />
              <span className="ach-main">
                <span className="row" style={{ justifyContent: "space-between", gap: 6 }}>
                  <b className="ach-name">Убийца боссов</b>
                  <span className="tiny muted num">{got.length}/{n}</span>
                </span>
                <span className="ach-bar sm" style={{ ["--p" as string]: `${Math.round((got.length / n) * 100)}%`, ["--c" as string]: "#ffcc33" }}>
                  <i /><span className="num">{got.length >= n ? "всё собрано" : `${got.length} / ${n} медалей`}</span>
                </span>
              </span>
              {ready && (
                <button className="btn gold sm ach-take" disabled={busy === "achievement_claim"}
                  onClick={(e) => {
                    e.stopPropagation();
                    void claim(ready.id);
                  }}>Забрать</button>
              )}
            </div>
          );
        })()}
        {/* «Медали боссов»: the face on a coin — bronze, silver, gold; MEDAL_SET of a kind is a full set */}
        {group === "boss" && (() => {
          const list = MEDAL_ACHIEVEMENTS.filter((a) => byId.has(a.id));
          const got = list.filter((a) => { const r = byId.get(a.id); return r && (r.claimed || (!self && r.done)); });
          const ready = self ? list.find((a) => { const r = byId.get(a.id); return r?.done && !r.claimed; }) ?? null : null;
          const coins = list.reduce((n, a) => n + Math.min(MEDAL_SET, byId.get(a.id)?.progress ?? 0), 0);
          const n = list.length;
          return (
            <div role="button" tabIndex={0} className={`ach-row ${ready ? "ready" : ""}`} onClick={() => setCoinOpen(true)} onKeyDown={(e) => e.key === "Enter" && setCoinOpen(true)}>
              <span className="ach-coin"><BlastIcon tier={got.some((a) => a.tier === 3) ? "gold" : got.some((a) => a.tier === 2) ? "silver" : "bronze"} size={44} dim={coins === 0} /></span>
              <span className="ach-main">
                <span className="row" style={{ justifyContent: "space-between", gap: 6 }}>
                  <b className="ach-name">Взрывы боссов</b>
                  <span className="tiny muted num">{got.length}/{n} сетов</span>
                </span>
                <span className="ach-bar sm" style={{ ["--p" as string]: `${Math.round((coins / Math.max(1, n * MEDAL_SET)) * 100)}%`, ["--c" as string]: "#ffcc33" }}>
                  <i /><span className="num">{full(coins)} / {full(n * MEDAL_SET)} взрывов</span>
                </span>
              </span>
              {ready && (
                <button className="btn gold sm ach-take" disabled={busy === "achievement_claim"}
                  onClick={(e) => {
                    e.stopPropagation();
                    void claim(ready.id);
                  }}>Забрать</button>
              )}
            </div>
          );
        })()}
      </div>}
      {stashItem && (() => {
        const d = itemById(stashItem);
        const has = ownedStash.has(stashItem);
        return (
          <Modal title={d?.name ?? "Нычка"} onClose={() => setStashItem(null)}>
            <div className="col" style={{ gap: 8, alignItems: "center", textAlign: "center" }}>
              <span className={`stash-cell big ${has || !self ? "" : "off"}`}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={`/assets/items/${stashItem}.webp`} alt="" /></span>
              <span className="small">{d?.description}</span>
              <span className="tiny muted">{self ? (has ? "Найдена" : "Ещё не найдена — ищи в заданиях локации") : ""}</span>
            </div>
          </Modal>
        );
      })()}
      {coinOpen && (
        <Modal title="Взрывы боссов" onClose={() => setCoinOpen(false)}>
          <div className="col" style={{ gap: 6 }}>
            <div className="small muted center">
              Каждая победа даёт взрыв: {FIGHT_MODES.map((m) => `«${m.name}» — ${MEDAL_NAMES[m.medal].toLowerCase()}`).join(", ")}.
              {" "}Каждый взрыв сразу добавляет урон оружию босса, {MEDAL_SET} взрывов одного вида — полный набор. Нажми на взрыв — увидишь награду за набор.
            </div>
            {OPEN_ALL.filter((b) => byId.has(`medal-${b.id}-bronze`)).map((b) => (
              <div key={b.id} className="bk-row">
                <span className="bk-photo"><BossPhoto boss={b} round /></span>
                <span className="grow col" style={{ gap: 1, minWidth: 0 }}>
                  <b className="ellipsis">{b.name}</b>
                  <span className="tiny muted">за взрыв: +{medalStep(b, "bronze")}/+{medalStep(b, "silver")}/+{medalStep(b, "gold")} · {itemById(medalWeapon(b))?.name}</span>
                </span>
                <span className="bk-medals">
                  {MEDAL_TIERS.map((t) => {
                    const id = `medal-${b.id}-${t}`;
                    const r = byId.get(id);
                    const have = Math.min(MEDAL_SET, r?.progress ?? 0);
                    const due = self && !!r?.done && !r.claimed;
                    return (
                      <button key={t} className={`bk-medal coin ${due ? "due" : ""}`} onClick={() => setMedal(id)} aria-label={achievementById(id)?.name}>
                        <BlastIcon tier={t} size={30} dim={have === 0} />
                        <small className="num">{have}/{MEDAL_SET}</small>
                      </button>
                    );
                  })}
                </span>
              </div>
            ))}
          </div>
        </Modal>
      )}
      {killOpen && (
        <Modal title="Убийца боссов" onClose={() => setKillOpen(false)}>
          <div className="col" style={{ gap: 6 }}>
            <div className="small muted center">Медали за победы над каждым боссом: бронза — {BOSS_KILL_TARGETS[0]}, серебро — {BOSS_KILL_TARGETS[1]}, золото — {BOSS_KILL_TARGETS[2]}. Нажми на медаль — увидишь награду.</div>
            {OPEN_ALL.filter((b) => byId.has(`bosskill-${b.id}-1`)).map((b) => {
              const tiers = ([1, 2, 3] as AchTier[]).map((t) => ({ t, a: achievementById(`bosskill-${b.id}-${t}`)!, r: byId.get(`bosskill-${b.id}-${t}`) }));
              const wins = tiers[2].r?.progress ?? 0;
              return (
                <div key={b.id} className="bk-row">
                  <span className="bk-photo"><BossPhoto boss={b} round /></span>
                  <span className="grow col" style={{ gap: 1, minWidth: 0 }}>
                    <b className="ellipsis">{b.name}</b>
                    <span className="tiny muted">побед: <b className="num" style={{ color: "var(--ink)" }}>{full(wins)}{wins >= 100 ? "+" : ""}</b></span>
                  </span>
                  <span className="bk-medals">
                    {tiers.map(({ t, a, r }) => {
                      const got = !!r && (r.claimed || (!self && r.done));
                      const due = self && !!r?.done && !r.claimed;
                      return (
                        <button key={t} className={`bk-medal ${due ? "due" : ""}`} onClick={() => setMedal(a.id)} aria-label={a.name}>
                          <BossCoin boss={b} tier={MEDAL_TIERS[t - 1]} size={34} dim={!(got || due)} />
                        </button>
                      );
                    })}
                  </span>
                </div>
              );
            })}
          </div>
        </Modal>
      )}
      {medal && (() => {
        const a = achievementById(medal);
        const r = byId.get(medal);
        if (!a) return null;
        const got = !!r && (r.claimed || (!self && r.done));
        const due = self && !!r?.done && !r?.claimed;
        return (
          <Modal title={a.name} onClose={() => setMedal(null)}>
            <div className="col" style={{ gap: 10, alignItems: "center", textAlign: "center" }}>
              {(() => {
                // a «Убийца боссов» medal is the boss's face on the coin of its tier
                const kb = medal.startsWith("bosskill-") ? OPEN_ALL.find((b) => medal === `bosskill-${b.id}-${a.tier}`) : undefined;
                return kb ? <BossCoin boss={kb} tier={MEDAL_TIERS[a.tier - 1]} size={80} dim={!(got || due)} /> : <BadgeMedal icon={a.icon} tier={a.tier} earned={got || due} size={72} />;
              })()}
              <b className="tier-name" style={{ color: TIER_COLORS[a.tier] }}>{TIER_NAMES[a.tier]}</b>
              <span className="small">{a.hint}</span>
              <span className="ach-bar" style={{ width: "100%", ["--p" as string]: `${Math.round(((r?.progress ?? 0) / a.target) * 100)}%`, ["--c" as string]: TIER_COLORS[a.tier] }}>
                <i /><span className="num">{full(r?.progress ?? 0)} / {full(a.target)}</span>
              </span>
              <RewardChips r={a.reward} size={15} />
              {got ? <span className="quest-ok display">✓ получено</span> : due ? (
                <button className="btn gold block" disabled={busy === "achievement_claim"} onClick={async () => { await claim(a.id); setMedal(null); }}>Забрать</button>
              ) : null}
            </div>
          </Modal>
        );
      })()}
      {soloOpen && (
        <Modal title="Соло-убийства" onClose={() => setSoloOpen(false)}>
          <div className="col" style={{ gap: 8 }}>
            <div className="small muted center">Победи босса в бою «Соло» — HP снимают только твои удары. За каждого босса своя награда.</div>
            {SOLO_BOSS_ACHIEVEMENTS.filter((a) => byId.has(a.id)).map((a) => {
              const r = byId.get(a.id);
              const got = !!r && (r.claimed || (!self && r.done));
              const due = self && !!r?.done && !r.claimed;
              return (
                <div key={a.id} className={`ach-tier ${got ? "got" : due ? "due" : ""}`} style={{ ["--c" as string]: TIER_COLORS[a.tier] }}>
                  <BadgeMedal icon={a.icon} tier={a.tier} earned={got || due} size={38} />
                  <span className="grow col" style={{ gap: 3, minWidth: 0 }}>
                    <b className="ellipsis tier-name" style={{ color: TIER_COLORS[a.tier] }}>{a.name.replace("Соло: ", "")}</b>
                    <RewardChips r={achievementById(a.id)?.reward ?? a.reward} size={13} />
                  </span>
                  {got ? <span className="quest-ok display">✓</span> : due ? (
                    <button className="btn gold sm" disabled={busy === "achievement_claim"} onClick={() => claim(a.id)}>Забрать</button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Modal>
      )}
      {cat && cs && (
        <Modal title={cat.name} onClose={() => setOpen(null)}>
          <div className="col" style={{ gap: 8 }}>
            <div className="small muted center">Прогресс: <b className="num" style={{ color: "var(--ink)" }}>{full(cs.progress)}</b></div>
            {tiersOf(cat).map((t, i) => {
              const r = cs.tiers[i];
              const def = achievementById(`${cat.id}-${t}`);
              if (!def) return null;
              const got = !!r?.claimed;
              const due = self && !!r?.done && !got;
              return (
                <div key={t} className={`ach-tier ${got ? "got" : due ? "due" : ""}`} style={{ ["--c" as string]: TIER_COLORS[t] }}>
                  <BadgeMedal icon={cat.icon} tier={t} earned={got || (!self && !!r?.done) || due} size={38} />
                  <span className="grow col" style={{ gap: 3, minWidth: 0 }}>
                    <b className="tier-name" style={{ color: TIER_COLORS[t] }}>{TIER_NAMES[t]} · <span className="num">{full(def.target)}</span></b>
                    <span className="ach-hint">{def.hint}</span>
                    <RewardChips r={def.reward} size={13} />
                  </span>
                  {got ? <span className="quest-ok display">✓</span> : due ? (
                    <button className="btn gold sm" disabled={busy === "achievement_claim"} onClick={() => claim(def.id)}>Забрать</button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Modal>
      )}
    </div>
  );
}
