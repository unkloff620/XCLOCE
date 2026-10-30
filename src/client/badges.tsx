"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

const AUTO_KEY = "xc-ach-auto";
import { MEDAL_TIERS } from "../content/medals.ts";
import { ACH_CATEGORIES, ACH_SECTIONS, TIER_COLORS, TIER_NAMES, achievementById, categoryOf, type AchCategory, type AchievementDef, type AchSection, type AchTier } from "../content/achievements.ts";
import { Icon, type IconName } from "./art/icons.tsx";
import { Modal, RewardChips } from "./ui.tsx";
import { useGame } from "./store.tsx";
import { haptic } from "./telegram.ts";
import { full, short } from "./format.ts";
import { ItemArt } from "./art/items.tsx";
import { BOSSES as OPEN_ALL } from "../content/bosses.ts";
import { STASH_LOCATION_NAMES, STASH_SETS_ORDERED } from "../content/stashes.ts";
import { itemById } from "../content/items.ts";
import { BossCoin } from "./art/boss-coin.tsx";
import { peekAchFocus, setAchFocus, takeAchFocus } from "./ach-focus.ts";
import { useRouter } from "next/navigation";

export interface AchRow { id: string; progress: number; target: number; done: boolean; claimed: boolean; at: number | null }

/** A hexagonal medal in its tier colour (bronze → diamond); grey until earned. */
/**
 * A medal that can be collected: it glows and pulses, a tap takes the reward (no separate «Забрать» button).
 * Without an id it is just the medal.
 */
function ClaimMedal({ id, onClaim, busy, children }: { id?: string; onClaim: (id: string) => unknown; busy?: boolean; children: ReactNode }) {
  if (!id) return <span className="ach-medal-slot">{children}</span>;
  return (
    <button type="button" className="ach-claim" disabled={busy} aria-label="Забрать награду" title="Забрать награду"
      onClick={(e) => { e.stopPropagation(); void onClaim(id); }}>
      {children}
    </button>
  );
}

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

/** the picture of a position: the boss's face on a coin, a нычки set, a thing, or an icon — with its number under it */
export function AchPic({ a, cat, on, size = 46 }: { a: AchievementDef; cat: AchCategory; on: boolean; size?: number }) {
  const boss = a.boss ? OPEN_ALL.find((b) => b.id === a.boss) : undefined;
  const thing = itemById(a.icon);
  return (
    <span className={`ach-pic tier-${a.tier} ${on ? "on" : "off"}`} style={{ width: size, height: size, ["--c" as string]: TIER_COLORS[a.tier] }}>
      {boss ? <BossCoin boss={boss} tier={a.category === "bosses" ? MEDAL_TIERS[Math.min(2, a.tier - 1)] : "gold"} size={size} dim={!on} />
        : cat.img ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={cat.img} alt="" draggable={false} />
        : a.icon.startsWith("/") ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={a.icon} alt="" draggable={false} style={{ width: "74%", height: "74%", objectFit: "contain" }} />
        : thing ? <ItemArt id={a.icon} size={size * 0.78} />
        : <Icon name={a.icon as IconName} size={size * 0.74} />}
      <i className="ach-pic-n num">{a.label}</i>
    </span>
  );
}

export function BadgesPanel({ rows, self, onClaimed, points = 0, unfolded = false, stashOnly = false }: { rows: AchRow[]; self: boolean; onClaimed?: () => void; points?: number; unfolded?: boolean; stashOnly?: boolean }) {
  // the list is folded (open at once in the «Личное дело» tab); the header shows the count, the points and what waits
  const [shown, setShown] = useState(unfolded);
  const { act, busy } = useGame();
  // opened from the achievement notice: straight to that achievement's list
  const [open, setOpen] = useState<string | null>(() => (stashOnly ? null : categoryOf(peekAchFocus() ?? "")?.id ?? null));
  const [section, setSection] = useState<AchSection>(() => (stashOnly ? "boss" : categoryOf(peekAchFocus() ?? "")?.section ?? "boss"));
  useEffect(() => { if (!stashOnly) takeAchFocus(); }, [stashOnly]);
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
  // «Автосбор» is kept on this device; while it is on, a reached position is collected as soon as it shows up
  const [auto, setAuto] = useState(() => { try { return localStorage.getItem(AUTO_KEY) === "1"; } catch { return false; } });
  const toggleAuto = () => {
    haptic.tap();
    setAuto((v) => { try { localStorage.setItem(AUTO_KEY, v ? "0" : "1"); } catch { /* no storage */ } return !v; });
  };
  useEffect(() => {
    if (!self || !auto || waiting < 1 || busy) return;
    const t = window.setTimeout(() => { void act("achievement_claim_all", {}).then((r) => { if (r) onClaimed?.(); }); }, 400);
    return () => window.clearTimeout(t);
  }, [self, auto, waiting, busy, act, onClaimed]);
  const claim = async (id: string) => {
    const r = await act("achievement_claim", { id }, "Награда за достижение получена");
    if (r) {
      haptic.big();
      onClaimed?.();
    }
  };
  const cat = open ? ACH_CATEGORIES.find((c) => c.id === open) ?? null : null;
  const isOn = (id: string) => { const r = byId.get(id); return !!r && (r.claimed || (!self && r.done)); };
  const isDue = (id: string) => { const r = byId.get(id); return self && !!r?.done && !r.claimed; };
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
                const m = kb ? <BossCoin boss={kb} tier={MEDAL_TIERS[a.tier - 1]} size={80} dim={!(got || due)} /> : <BadgeMedal icon={a.icon} tier={a.tier} earned={got || due} size={72} />;
                return <ClaimMedal id={due ? a.id : undefined} onClaim={async (id) => { await claim(id); setMedal(null); }} busy={busy === "achievement_claim"}>{m}</ClaimMedal>;
              })()}
              <b className="tier-name" style={{ color: TIER_COLORS[a.tier] }}>{TIER_NAMES[a.tier]}</b>
              <span className="small">{a.hint}</span>
              <span className="ach-bar" style={{ width: "100%", ["--p" as string]: `${Math.round(((r?.progress ?? 0) / a.target) * 100)}%`, ["--c" as string]: TIER_COLORS[a.tier] }}>
                <i /><span className="num">{full(r?.progress ?? 0)} / {full(a.target)}</span>
              </span>
              <RewardChips r={a.reward} size={15} />
              {got ? <span className="ach-got-label">✓ получено</span> : due ? (
                <span className="ach-claim-hint">Нажми на медаль — забери награду</span>
              ) : null}
            </div>
          </Modal>
        );
      })()}
    </>
  );
  // a list: its live positions (a boss not in the game yet has none), what is collected, the next to reach
  const lines = (c: AchCategory) => c.lines.filter((x) => byId.has(x.id));
  const sectionDue = (sec: AchSection) => self && rows.some((r) => r.done && !r.claimed && categoryOf(r.id)?.section === sec);
  return (
    <div className="panel">
      <button type="button" className={`ach-head ${waiting ? "ready" : ""}`} onClick={() => setShown((v) => !v)} aria-expanded={shown}>
        <span className="small muted">ДОСТИЖЕНИЯ</span>
        <span className="grow" />
        <span className="chip ach-pts" title="Очки достижений"><Icon name="sun" size={16} /><b className="num">{full(points)}</b></span>
        <span className="tiny muted num">{total}/{rows.length}</span>
        <span className={`ach-caret ${shown ? "open" : ""}`} aria-hidden="true">▾</span>
      </button>
      {/* everything reached, in one tap */}
      {/* «Автосбор»: on — everything reached is collected by itself; off — by a tap on the glowing picture */}
      {self && (
        <div className="ach-uncollected">
          {waiting > 0 && !auto && <span>Не собранные: <b className="num">{waiting}</b></span>}
          <span className="grow" />
          <span>Автосбор</span>
          <button type="button" role="switch" aria-checked={auto} aria-label="Автосбор достижений" className={`upd-toggle ach-auto ${auto ? "on" : ""}`} onClick={toggleAuto}><i /></button>
        </div>
      )}
      {shown && <div className="ach-groups" role="tablist">
        {ACH_SECTIONS.map((g) => (
          <button key={g.id} type="button" role="tab" aria-selected={section === g.id} className={`ach-group ${section === g.id ? "on" : ""} ${sectionDue(g.id) ? "due" : ""}`} onClick={() => { haptic.tap(); setSection(g.id); }}>{g.name}</button>
        ))}
      </div>}
      {shown && <div className="col" style={{ gap: 8, marginTop: 8 }}>
        {ACH_CATEGORIES.filter((c) => c.section === section).map((c) => {
          const ls = lines(c);
          if (!ls.length) return null;
          const got = ls.filter((x) => isOn(x.id)).length;
          const due = ls.find((x) => isDue(x.id));
          const next = ls.find((x) => !byId.get(x.id)?.done);
          const show = due ?? next ?? ls[ls.length - 1];
          const r = byId.get(show.id);
          const pct = !next ? 100 : Math.min(100, Math.round(((r?.progress ?? 0) / show.target) * 100));
          return (
            <div key={c.id} role="button" tabIndex={0} className={`ach-row ${due ? "ready" : ""}`} onClick={() => setOpen(c.id)} onKeyDown={(e) => e.key === "Enter" && setOpen(c.id)}>
              <ClaimMedal id={due?.id} onClaim={claim} busy={busy === "achievement_claim"}>
                {c.kind === "boss"
                  ? <span className={`ach-pic tier-3 on`} style={{ width: 46, height: 46 }}><Icon name={c.icon as IconName} size={34} /></span>
                  : <AchPic a={show} cat={c} on={got > 0 || !!due} />}
              </ClaimMedal>
              <span className="ach-main">
                <span className="row" style={{ justifyContent: "space-between", gap: 6 }}>
                  <b className="ach-name">{c.name}</b>
                  <span className="tiny muted num">{got}/{ls.length}</span>
                </span>
                <span className="tiny ach-hint ellipsis">{due ? `Готово: ${due.name}` : next ? next.hint : "всё собрано"}</span>
                <span className="ach-bar sm" style={{ ["--p" as string]: `${pct}%`, ["--c" as string]: TIER_COLORS[show.tier] }}>
                  <i /><span className="num">{!next ? "всё собрано" : `${short(r?.progress ?? 0)} / ${short(show.target)}`}</span>
                </span>
              </span>
            </div>
          );
        })}
      </div>}
      {/* a list window: every position — its picture with the number, what to do, the progress, the points */}
      {cat && (
        <Modal title={cat.name} onClose={() => setOpen(null)}>
          <div className="col" style={{ gap: 6 }}>
            <div className="tiny muted center">Нажми на светящуюся картинку — заберёшь очки достижений</div>
            {[...lines(cat)].sort((x, y) => Number(isDue(y.id)) - Number(isDue(x.id)) || Number(isOn(x.id)) - Number(isOn(y.id))).map((a) => {
              const r = byId.get(a.id);
              const on = isOn(a.id), due = isDue(a.id);
              const pct = Math.min(100, Math.round(((r?.progress ?? 0) / a.target) * 100));
              return (
                <div key={a.id} className={`ach-line ${on ? "got" : due ? "due" : ""}`} style={{ ["--c" as string]: TIER_COLORS[a.tier] }}>
                  <ClaimMedal id={due ? a.id : undefined} onClaim={claim} busy={busy === "achievement_claim"}>
                    <AchPic a={a} cat={cat} on={on || due} />
                  </ClaimMedal>
                  <span className="grow col" style={{ gap: 2, minWidth: 0 }}>
                    <b className="ach-line-name ellipsis">{a.name}</b>
                    <span className="tiny ach-hint">{a.hint}</span>
                    <span className="ach-bar sm" style={{ ["--p" as string]: `${on || r?.done ? 100 : pct}%`, ["--c" as string]: TIER_COLORS[a.tier] }}>
                      <i /><span className="num">{full(Math.min(a.target, r?.progress ?? 0))} / {full(a.target)}</span>
                    </span>
                  </span>
                  <span className="ach-line-pts num">{on ? "✓" : <>+{a.points}<Icon name="sun" size={16} /></>}</span>
                </div>
              );
            })}
          </div>
        </Modal>
      )}
    </div>
  );
}

/**
 * A notice at the top of the screen for every newly reached achievement: its picture, name, the full bar and the points;
 * it stays 2 seconds, a tap opens the achievement in the «Личное дело». The ones waiting at the start are not announced.
 */
export function AchToast() {
  const { state } = useGame();
  const router = useRouter();
  const seen = useRef<Set<string> | null>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const ids = state?.achievementsReadyIds;
  useEffect(() => {
    if (!ids) return;
    if (!seen.current) { seen.current = new Set(ids); return; }
    const fresh = ids.filter((id) => !seen.current!.has(id));
    if (!fresh.length) return;
    fresh.forEach((id) => seen.current!.add(id));
    setQueue((q) => [...q, ...fresh].slice(0, 8));
  }, [ids]);
  const id = queue[0];
  useEffect(() => {
    if (!id) return;
    haptic.ok();
    const t = window.setTimeout(() => setQueue((q) => q.slice(1)), 2000);
    return () => window.clearTimeout(t);
  }, [id]);
  const a = id ? achievementById(id) : undefined;
  const cat = id ? categoryOf(id) : undefined;
  if (!a || !cat) return null;
  const go = () => {
    haptic.tap();
    setAchFocus(a.id);
    setQueue([]);
    router.push("/profile");
  };
  return (
    <button key={a.id} type="button" className="ach-toast" onClick={go} aria-label={`Достижение: ${a.name}`}>
      <span className="ach-toast-pic">
        <AchPic a={a} cat={cat} on size={46} />
        <i className="ach-toast-plus">+</i>
      </span>
      <span className="ach-main">
        <b className="ach-name">{a.name}</b>
        <span className="tiny ach-hint ellipsis">{a.hint}</span>
        <span className="ach-bar sm" style={{ ["--p" as string]: "100%", ["--c" as string]: TIER_COLORS[a.tier] }}><i /><span className="num">{short(a.target)} / {short(a.target)}</span></span>
      </span>
      <span className="ach-toast-pts num">+{a.points}<Icon name="sun" size={18} /></span>
    </button>
  );
}
