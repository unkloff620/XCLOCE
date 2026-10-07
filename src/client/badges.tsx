"use client";
import { useState } from "react";
import { ACH_CATEGORIES, ACHIEVEMENTS, BOSS_KILL_ACHIEVEMENTS, BOSS_KILL_TARGETS, SOLO_BOSS_ACHIEVEMENTS, TIER_COLORS, TIER_NAMES, achievementById, type AchCategory, type AchTier } from "../content/achievements.ts";
import { Icon, type IconName } from "./art/icons.tsx";
import { Modal, RewardChips } from "./ui.tsx";
import { useGame } from "./store.tsx";
import { haptic } from "./telegram.ts";
import { full, short } from "./format.ts";
import { BOSSES } from "../content/bosses.ts";
import { STASH_LOCATION_NAMES, STASH_SETS_ORDERED } from "../content/stashes.ts";
import { itemById } from "../content/items.ts";
import { BossPhoto } from "./screens/boss-parts.tsx";

export interface AchRow { id: string; progress: number; target: number; done: boolean; claimed: boolean; at: number | null }

/** A hexagonal medal in its tier colour (bronze → diamond); grey until earned. */
export function BadgeMedal({ icon, tier, earned, size = 54 }: { icon: string; tier: AchTier | 0; earned: boolean; size?: number }) {
  // drawn achievement pictures sit inside the same medal as the simple icons, at the same size
  const art = icon.startsWith("ach-");
  return (
    <span className={`badge-wrap ${art ? "art" : ""} ${earned ? "" : "locked"}`} style={{ width: size, height: size * 1.1 }}>
      <span className={`badge-medal tier-${tier} ${earned ? "" : "locked"}`} style={{ width: size, height: size * 1.1 }}>
        {!art && <Icon name={icon as IconName} size={size * 0.6} />}
      </span>
      {art && <span className="badge-art"><Icon name={icon as IconName} size={size * 0.74} /></span>}
    </span>
  );
}

const TIERS: AchTier[] = [1, 2, 3, 4, 5];

function catState(c: AchCategory, rows: Map<string, AchRow>, self: boolean) {
  const tiers = TIERS.map((t) => rows.get(`${c.id}-${t}`));
  // a tier counts as earned once collected (others' profiles: once reached)
  const earned = tiers.filter((r) => r && (r.claimed || (!self && r.done))).length as AchTier | 0;
  const reached = tiers.filter((r) => r?.done).length;
  const ready = self ? tiers.find((r) => r?.done && !r.claimed) ?? null : null;
  const progress = tiers[0]?.progress ?? 0;
  const next = c.targets[Math.min(4, reached)];
  return { tiers, earned, reached, ready, progress, next };
}

/** Profile block: one row per category with five coloured steps; on your own profile reached steps are collected. */
export function BadgesPanel({ rows, self, onClaimed }: { rows: AchRow[]; self: boolean; onClaimed?: () => void }) {
  const { act, busy } = useGame();
  const [open, setOpen] = useState<string | null>(null);
  const [soloOpen, setSoloOpen] = useState(false);
  const [killOpen, setKillOpen] = useState(false);
  const [stashOpen, setStashOpen] = useState(false);
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
  const claim = async (id: string) => {
    const r = await act("achievement_claim", { id }, "Награда за достижение получена");
    if (r) {
      haptic.big();
      onClaimed?.();
    }
  };
  const cat = open ? ACH_CATEGORIES.find((c) => c.id === open) : null;
  const cs = cat ? catState(cat, byId, self) : null;
  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <span className="small muted">ДОСТИЖЕНИЯ</span>
        <span className="tiny muted num">{total}/{ACHIEVEMENTS.length}</span>
      </div>
      <div className="col" style={{ gap: 8 }}>
        {ACH_CATEGORIES.map((c) => {
          const s = catState(c, byId, self);
          const maxed = s.reached >= 5;
          const pct = maxed ? 100 : Math.min(100, Math.round((s.progress / s.next) * 100));
          return (
            <div key={c.id} role="button" tabIndex={0} className={`ach-row ${s.ready ? "ready" : ""}`} onClick={() => setOpen(c.id)} onKeyDown={(e) => e.key === "Enter" && setOpen(c.id)}>
              <BadgeMedal icon={c.icon} tier={s.earned} earned={s.earned > 0} size={44} />
              <span className="ach-main">
                <span className="row" style={{ justifyContent: "space-between", gap: 6 }}>
                  <b className="ach-name">{c.name}</b>
                  <span className="ach-steps" aria-label={`${s.earned} из 5`}>
                    {TIERS.map((t, i) => {
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
        {(() => {
          const sr = SOLO_BOSS_ACHIEVEMENTS.map((a) => byId.get(a.id));
          const got = sr.filter((r) => r && (r.claimed || (!self && r.done))).length;
          const ready = self ? SOLO_BOSS_ACHIEVEMENTS.find((a) => { const r = byId.get(a.id); return r?.done && !r.claimed; }) ?? null : null;
          const n = SOLO_BOSS_ACHIEVEMENTS.length;
          const top = Math.max(0, ...SOLO_BOSS_ACHIEVEMENTS.filter((a) => { const r = byId.get(a.id); return r && (r.claimed || (!self && r.done)); }).map((a) => a.tier)) as AchTier | 0;
          return (
            <div role="button" tabIndex={0} className={`ach-row ${ready ? "ready" : ""}`} onClick={() => setSoloOpen(true)} onKeyDown={(e) => e.key === "Enter" && setSoloOpen(true)}>
              <BadgeMedal icon="swords" tier={top} earned={got > 0} size={44} />
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
        {(() => {
          const got = BOSS_KILL_ACHIEVEMENTS.filter((a) => { const r = byId.get(a.id); return r && (r.claimed || (!self && r.done)); });
          const ready = self ? BOSS_KILL_ACHIEVEMENTS.find((a) => { const r = byId.get(a.id); return r?.done && !r.claimed; }) ?? null : null;
          const n = BOSS_KILL_ACHIEVEMENTS.length;
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
        {/* «Нычки»: sets of four, collected again and again; medals for 10 / 50 / 100 sets of each */}
        {(() => {
          const medals = STASH_SETS_ORDERED.flatMap((st) => ([1, 2, 3] as AchTier[]).map((t) => ({ st, t, r: byId.get(`stashset-${st.n}-${t}`) })));
          const got = medals.filter((x) => x.r && (x.r.claimed || (!self && x.r.done))).length;
          const ready = self ? medals.find((x) => x.r?.done && !x.r.claimed) ?? null : null;
          const collectable = self && STASH_SETS_ORDERED.some((st) => st.items.every((it) => (stashQty.get(it.id) ?? 0) > 0));
          const total = STASH_SETS_ORDERED.reduce((n, st) => n + (self ? state?.stashSets?.[st.n] ?? 0 : byId.get(`stashset-${st.n}-3`)?.progress ?? 0), 0);
          return (
            <div role="button" tabIndex={0} className={`ach-row ${ready || collectable ? "ready" : ""}`} onClick={() => setStashOpen(true)} onKeyDown={(e) => e.key === "Enter" && setStashOpen(true)}>
              <span className={`stash-medal ${total || stashQty.size ? "" : "off"}`}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/assets/stash/set-1.webp" alt="" /></span>
              <span className="ach-main">
                <span className="row" style={{ justifyContent: "space-between", gap: 6 }}>
                  <b className="ach-name">Нычки</b>
                  <span className="tiny muted num">собрано наборов: {total}</span>
                </span>
                <span className="ach-bar sm" style={{ ["--p" as string]: `${Math.round((got / medals.length) * 100)}%`, ["--c" as string]: "#ffcc33" }}>
                  <i /><span className="num">{got} / {medals.length} медалей</span>
                </span>
              </span>
              {ready && (
                <button className="btn gold sm ach-take" disabled={busy === "achievement_claim"}
                  onClick={(e) => {
                    e.stopPropagation();
                    void claim(ready.r!.id);
                  }}>Забрать</button>
              )}
            </div>
          );
        })()}
      </div>
      {stashOpen && (
        <Modal title="Нычки" onClose={() => setStashOpen(false)}>
          <div className="col" style={{ gap: 8 }}>
            <div className="small muted center">Нычки находятся за задания в локациях, а при закрытии локации одна нычка выпадает наверняка; они выпадают повторно и копятся. Есть все 4 нычки набора — нажми на картинку набора и забери награду. За 10, 50 и 100 собранных наборов — медали.</div>
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
        </Modal>
      )}
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
      {killOpen && (
        <Modal title="Убийца боссов" onClose={() => setKillOpen(false)}>
          <div className="col" style={{ gap: 6 }}>
            <div className="small muted center">Медали за победы над каждым боссом: бронза — {BOSS_KILL_TARGETS[0]}, серебро — {BOSS_KILL_TARGETS[1]}, золото — {BOSS_KILL_TARGETS[2]}. Нажми на медаль — увидишь награду.</div>
            {BOSSES.map((b) => {
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
                          <BadgeMedal icon="ach-wins" tier={t} earned={got || due} size={30} />
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
              <BadgeMedal icon={a.icon} tier={a.tier} earned={got || due} size={72} />
              <b style={{ color: TIER_COLORS[a.tier] }}>{TIER_NAMES[a.tier]}</b>
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
            {SOLO_BOSS_ACHIEVEMENTS.map((a) => {
              const r = byId.get(a.id);
              const got = !!r && (r.claimed || (!self && r.done));
              const due = self && !!r?.done && !r.claimed;
              return (
                <div key={a.id} className={`ach-tier ${got ? "got" : due ? "due" : ""}`} style={{ ["--c" as string]: TIER_COLORS[a.tier] }}>
                  <BadgeMedal icon={a.icon} tier={a.tier} earned={got || due} size={38} />
                  <span className="grow col" style={{ gap: 3, minWidth: 0 }}>
                    <b className="ellipsis" style={{ color: TIER_COLORS[a.tier] }}>{a.name.replace("Соло: ", "")}</b>
                    <RewardChips r={a.reward} size={13} />
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
            {TIERS.map((t, i) => {
              const r = cs.tiers[i];
              const def = achievementById(`${cat.id}-${t}`);
              if (!def) return null;
              const got = !!r?.claimed;
              const due = self && !!r?.done && !got;
              return (
                <div key={t} className={`ach-tier ${got ? "got" : due ? "due" : ""}`} style={{ ["--c" as string]: TIER_COLORS[t] }}>
                  <BadgeMedal icon={cat.icon} tier={t} earned={got || (!self && !!r?.done) || due} size={38} />
                  <span className="grow col" style={{ gap: 3, minWidth: 0 }}>
                    <b style={{ color: TIER_COLORS[t] }}>{TIER_NAMES[t]} · <span className="num">{full(def.target)}</span></b>
                    <span className="tiny muted">{def.hint}</span>
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
