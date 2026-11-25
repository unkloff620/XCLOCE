"use client";
import { hitGapOk } from "../hit-gap.ts";
import { boostReward } from "../../content/rewards.ts";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGame, useNow } from "../store.tsx";
import { api, type FightView, type Hit, type Tray } from "../api.ts";
import { BOSSES, arenaOf, bossById, type BossDef, FIGHT_HOURS, rewardShare } from "../../content/bosses.ts";
import { BAT, WEAPONS, itemById, rushPrice, weaponById } from "../../content/items.ts";
import { CRAFT_WEAPONS } from "../../content/craft.ts";
import { HIT_PHRASES, bossLines } from "../../content/phrases.ts";
import { BossSilhouette } from "../art/scenes.tsx";
import { NEEDLE_ID } from "../../content/obshak.ts";
import { ItemArt } from "../art/items.tsx";
import { Icon } from "../art/icons.tsx";
import { Bar, DropKind, Empty, GainLine, bossItemsCount, bossTattooCount } from "../ui.tsx";
import { ROOM_DEFS, roomUnlockId } from "../../content/home.ts";
import { useFx, type Fx } from "../fx/attack.tsx";
import { BossRulesHelp, useBossList } from "./bosses.tsx";
import { WeaponShopWindow } from "./shop.tsx";
import { clock, full, pct, short } from "../format.ts";
import { setMusicTrack, sfx, weaponSfx } from "../sound.ts";
import { haptic } from "../telegram.ts";
import { DriftingSky } from "../art/sky.tsx";
import { BEATEN_BELOW, BossRig, hasBossRig } from "../art/boss-rig.tsx";
import { ArenaBg, UtilizatorFront } from "../art/arena-bg.tsx";
import { PepeRig } from "../art/pepe-rig.tsx";
import { CritBurn, preloadCritBanner } from "../art/crit-burn.tsx";
import { Modal } from "../ui.tsx";
import { reloadMin, talentThreshold, talentsForDamage, weaponTalentBonus } from "../../content/talents.ts";
import { TalentWindow } from "./talents.tsx";
import { weaponStats } from "../weapon-stats.ts";
import { BOXERS, useBossStrike } from "../fx/boss-strike.tsx";
import { FIGHT_MODES, fightMode, type FightMode } from "../../content/medals.ts";
import { usePageReady } from "../route-loader.tsx";
import { tattooSetsOfBoss } from "../../content/tattoos.ts";
import { BossBoxButton, BossBoxWindow } from "./boss-box.tsx";
import { bossBonus } from "../../content/boss-bonus.ts";
import { ComboButton, ComboDone, ComboPanel, ComboPick } from "./combo.tsx";
import { hasCombo, type ComboMode } from "../../content/combo.ts";
import { BoostIcons, FightTray, HitLog, SidePanel, TopList, WeaponPanel, slotsOf } from "./fight-kit.tsx";

/**
 * Each fight mode is its own page of the room before the fight (swipe left/right): «Пацанский» — the old basement as it
 * is, «Блатной» — the same after a cheap Soviet repair, «Авторитетный» — after a good one (public/assets/door/room-<mode>,
 * door-<mode>: the same layout, so the door and the boss behind it stay in place).
 */
const MODE_ART: Record<FightMode, string> = { pacan: "", blat: "-blat", avtor: "-avtor" };
const MODE_ORDER: FightMode[] = ["pacan", "blat", "avtor"];

const POLL_MS = 1500;
/** a hit stays in the arena feed this long */
const FEED_MS = 5000;
/**
 * The boss talks in a fight: a line by his head every 7–13 s for a moment — cocky above half HP, scared below it
 * (crossing half HP makes him blurt a scared line at once).
 */
function useBossTalk(bossId: string, on: boolean, scared: boolean) {
  const [line, setLine] = useState<{ text: string; id: number } | null>(null);
  const last = useRef("");
  const say = useCallback(() => {
    const pool = bossLines(bossId, scared).filter((x) => x !== last.current);
    const text = pool[Math.floor(Math.random() * pool.length)];
    last.current = text;
    setLine({ text, id: Date.now() });
  }, [bossId, scared]);
  // a scared line right when he drops below half (not on the first look at an already beaten boss)
  const was = useRef<boolean | null>(null);
  useEffect(() => {
    if (!on) return;
    if (was.current === false && scared) say();
    was.current = scared;
  }, [on, scared, say]);
  useEffect(() => {
    if (!on) return;
    let t: ReturnType<typeof setTimeout>;
    const next = (first: boolean) => {
      t = setTimeout(() => {
        if (!document.hidden) say();
        next(false);
      }, first ? 2500 : 7000 + Math.random() * 6000);
    };
    next(true);
    return () => clearTimeout(t);
  }, [on, say]);
  useEffect(() => {
    if (!line) return;
    const t = setTimeout(() => setLine(null), 2800);
    return () => clearTimeout(t);
  }, [line]);
  return line;
}


function Arena({ boss, hp, hpMax, endsAt, fx, hit, ouch, rug, feed, full: fullScreen, strike, corner }: { boss: BossDef; hp: number | null; hpMax: number; endsAt: number | null; fx: React.ReactNode; hit: boolean; ouch?: boolean; rug: boolean; feed: Hit[]; full?: boolean; strike?: "l" | "r" | null; corner?: React.ReactNode }) {
  const now = useNow();
  const phase = boss.phases && hp !== null ? [...boss.phases].reverse().find((p) => pct(hp, hpMax) <= p.from) ?? boss.phases[0] : null;
  const hurt = hp !== null && pct(hp, hpMax) < 25;
  // below half HP the boss is dazed: slow, swaying from side to side (the rig slows its own motions, see useDazed)
  const dazed = hp !== null && hp / Math.max(1, hpMax) < BEATEN_BELOW;
  const talk = useBossTalk(boss.id, !!fullScreen && hp !== null && hp > 0, dazed);
  return (
    <div className={`arena ${boss.final ? "final" : ""} ${fullScreen ? "full" : ""}`} style={{ ["--acc" as string]: boss.theme.accent }}>
      <div className={`arena-photo ${hit ? "hit" : ""} ${ouch ? "ouch" : ""} ${rug ? "rug" : ""} ${hurt ? "hurt" : ""} ${dazed ? "dazed" : ""} ${strike ? `strike strike-${strike}` : ""} ${talk ? "talking" : ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {boss.id === "pepe" ? <PepeRig className="boss-rig" sad={!!ouch} beaten={hp !== null && hp / Math.max(1, hpMax) < 0.5} /> : hasBossRig(boss.id) ? <BossRig id={boss.id} hpShare={hp === null ? 1 : hp / Math.max(1, hpMax)} /> : boss.photo.full ? <img src={boss.photo.full} alt={boss.name} draggable={false} /> : <div className="arena-sil"><BossSilhouette accent={boss.theme.accent} /><span className="small muted">фото скоро</span></div>}
        <div className="arena-flash" />
        {hurt && !hasBossRig(boss.id) && boss.id !== "pepe" && <div className="arena-plasters" />}
      </div>
      {/* the boss talks from the upper left corner, off his body (it does not shake with him) */}
      {talk && <div key={talk.id} className={`boss-say ${dazed ? "scared" : ""}`}>{talk.text}</div>}
      <div className="arena-top">
        {corner && <div className="arena-corner">{corner}</div>}
        {/* the HP and the time: short bars in the upper left (the user 2026-11-25); a big max is written short — «1 000 000 / 1M» */}
        <div className="arena-bars">
        <div className="arena-barw">
          {hp !== null ? <Bar value={hp} max={hpMax} tone="health" height={22} label={`${full(hp)} / ${hpMax >= 1e6 ? short(hpMax) : full(hpMax)}`} /> : <Bar value={hpMax} max={hpMax} tone="health" height={22} label={`${hpMax >= 1e6 ? short(hpMax) : full(hpMax)} HP`} />}
          {/* a black heart on the right end */}
          <svg className="arena-bar-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.8 8.2 3 4.5 6.6 4.5c2.2 0 3.7 1.2 5.4 3.1 1.7-1.9 3.2-3.1 5.4-3.1 3.6 0 5.8 3.7 4.2 7.3C19.5 16.4 12 21 12 21z" /></svg>
        </div>
        {/* the fight's time runs down like the HP: the bar shortens as the 8 hours pass */}
        {endsAt && (
          <div className="arena-time arena-barw">
            <Bar value={Math.max(0, endsAt - now)} max={FIGHT_HOURS * 3600_000} tone="health" height={22} label={clock(Math.max(0, endsAt - now))} />
            {/* a black clock on the right end */}
            <svg className="arena-bar-ic" viewBox="0 0 24 24" aria-hidden="true"><path fillRule="evenodd" d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm-1.3 2h2.4v4.6l3.2 2-1.2 2-4.4-2.7z" /></svg>
          </div>
        )}
        </div>
        <div className="arena-sub">
          <div className="col" style={{ gap: 4, alignItems: "flex-start" }}>
            {phase && <span className="chip" style={{ background: "rgba(0,0,0,0.55)" }}>{phase.name}</span>}
          </div>
          {/* who hit and how hard: the last few hits, each line fades away after a few seconds */}
          <div className="arena-feed">
            {feed.filter((h) => now - h.at < FEED_MS).slice(0, 3).map((h) => (
              <div key={h.seq} className="feed-line">
                <b className="ellipsis">{h.name}</b> <ItemArt id={h.weapon} size={18} /> {(h.count ?? 1) > 1 && <b className="feed-x">×{h.count}</b>} <b className="dmg">−{full(h.damage)}</b>{h.crit && <b className="crit-tag"> КРИТ</b>}
              </div>
            ))}
          </div>
        </div>
      </div>
      {fx}
    </div>
  );
}

/** consumables used per tap: ×1, ×10, ×100, ×1000 (the free weapons always hit once) */
const MULTS = [1, 10, 100, 1000] as const;
export type Mult = (typeof MULTS)[number];
/** how many of this weapon one tap uses now */
const batchOf = (kind: string, qty: number, mult: Mult) => (kind === "consumable" ? Math.max(1, Math.min(mult, qty)) : 1);

export function MultPicker({ mult, setMult }: { mult: Mult; setMult: (m: Mult) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`mult-pick ${open ? "open" : ""}`}>
      <button className={`btn sm ${mult > 1 ? "gold" : "dark"} mult-btn`} onClick={() => setOpen((o) => !o)} aria-expanded={open} title="Сколько оружия тратить за одно нажатие">
        ×{mult}
      </button>
      {open && MULTS.map((m) => (
        <button key={m} className={`btn sm ${m === mult ? "gold" : "dark"}`} onClick={() => { setMult(m); setOpen(false); }}>×{m}</button>
      ))}
      {open && <span className="tiny muted mult-note">кулак, тычок и пинок — всегда ×1</span>}
    </div>
  );
}

export function WeaponTray({ tray, onHit, onCooldown, onBuy, disabled, mult }: { tray: Tray[]; onHit: (id: string) => void; onCooldown: (name: string, leftMs: number, id: string) => void; onBuy: () => void; disabled: boolean; mult: Mult }) {
  const { state } = useGame();
  const now = useNow();
  return (
    <div className="tray" style={{ gridTemplateColumns: `repeat(${WEAPONS.length}, minmax(0, 1fr))` }}>
      {/* the six weapons, then the craft weapons (вещи 3 ур.) you have — on a second row */}
      {[...WEAPONS, ...((tray.find((x) => x.id === BAT.id)?.qty ?? 0) > 0 ? [BAT] : []), ...CRAFT_WEAPONS.filter((c) => (tray.find((x) => x.id === c.id)?.qty ?? 0) > 0).map((c) => itemById(c.id)!)].map((w) => {
        const t = tray.find((x) => x.id === w.id);
        const qty = t?.qty ?? 0;
        const cd = t?.readyAt && t.readyAt > now ? t.readyAt - now : 0;
        const total = reloadMin(w.weapon!.cooldownMin ?? 0, weaponTalentBonus(state?.weaponTalents ?? {}, w.id).cooldownMin) * 60_000;
        const perm = w.weapon!.kind === "permanent";
        const empty = !perm && qty <= 0;
        // the cooldown "clock": the grey part shrinks clockwise until the weapon is in colour again
        const done = cd && total ? Math.max(0, Math.min(1, 1 - cd / total)) : 1;
        return (
          <button
            key={w.id}
            className={`weapon rar-${w.rarity} ${empty ? "empty" : ""} ${cd ? "cd" : ""}`}
            disabled={disabled}
            aria-disabled={!!cd}
            onClick={() => (cd ? onCooldown(w.name, cd, w.id) : empty ? onBuy() : onHit(w.id))}
            title={`${w.name}: ${w.weapon!.action}`}
          >
            <ItemArt id={w.id} size={40} />
            <span className="w-dmg display">−{short(weaponStats(state, w.id).damage * batchOf(w.weapon!.kind, qty, mult))}</span>
            {!perm && <span className="w-qty num">×{qty}</span>}
            {cd > 0 && <span className="w-cd" style={{ ["--p" as string]: `${done * 360}deg` }} />}
          </button>
        );
      })}
    </div>
  );
}


export function BossScreen({ id }: { id: string }) {
  const boss = bossById(id);
  const { state, act, busy, refresh, toast } = useGame();
  const { data: list, load: loadList } = useBossList();
  usePageReady(!!list);
  const now = useNow();
  const [view, setView] = useState<FightView | null>(null);
  const [tray, setTray] = useState<Tray[]>([]);
  const [hits, setHits] = useState<Hit[]>([]);
  const [hitAnim, setHitAnim] = useState(false);
  // the boss's face stays hurt a little longer than the shake (sad brows, closed mouth)
  const [ouch, setOuch] = useState(false);
  const ouchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [rug, setRug] = useState(false);
  const [pendingDmg, setPendingDmg] = useState(0);
  // «Критический урон ×2» catches fire above the weapons and burns away (a new key restarts it)
  const [critPop, setCritPop] = useState(0);
  useEffect(() => preloadCritBanner(), []);
  const [talentPop, setTalentPop] = useState(0);
  // the talent counter after my last hit (the state catches up on the next refresh)
  const [talentDmg, setTalentDmg] = useState<number | null>(null);
  const [talentsOpen, setTalentsOpen] = useState(false);
  const [tab, setTab] = useState<"top" | "info" | null>(null);
  const [panel, setPanel] = useState(false);
  const [details, setDetails] = useState<{ top: { playerId: number; name: string; damage: number; wins: number }[]; myHits: { weapon: string; damage: number; phrase: number; at: number; count?: number }[] } | null>(null);
  const lastSeq = useRef(0);
  const seen = useRef<Set<number>>(new Set());
  const fightId = state?.fight?.bossId === id ? state.fight.id : null;
  const me = state?.player.id;
  // battle music while a fight with this boss is on; the calm loop comes back on leaving or when it ends
  const fighting = !!fightId && (view ? view.status === "active" : true);
  useEffect(() => {
    if (!fighting) return;
    setMusicTrack("battle");
    return () => setMusicTrack("calm");
  }, [fighting]);

  const onImpact = useCallback((f: Fx) => {
    setHitAnim(true);
    setTimeout(() => setHitAnim(false), 280);
    setOuch(true);
    if (ouchTimer.current) clearTimeout(ouchTimer.current);
    ouchTimer.current = setTimeout(() => setOuch(false), 1300);
    if (f.weapon === "rug-pull-gun") {
      setRug(true);
      setTimeout(() => setRug(false), 700);
    }
  }, []);
  const { play, layer } = useFx(onImpact);

  // live polling of my fight
  const poll = useCallback(async (first = false) => {
    if (!fightId) return;
    try {
      const r = await api.get<{ fight: FightView; weapons: Tray[] }>(`/api/live?fight=${fightId}&since=${first ? 0 : lastSeq.current}`);
      setView(r.fight);
      setTray(r.weapons);
      const fresh = r.fight.hits.filter((h) => !seen.current.has(h.seq));
      for (const h of fresh) seen.current.add(h.seq);
      if (!first) {
        // other players' hits: a small animation each (own hits are animated on the tap)
        fresh.filter((h) => h.playerId !== me).slice(0, 4).forEach((h, i) => setTimeout(() => play(h.weapon, h.damage, "", false), i * 180));
      }
      if (fresh.length) setHits((old) => [...fresh, ...old].sort((a, b) => b.seq - a.seq).slice(0, 150));
      lastSeq.current = Math.max(lastSeq.current, r.fight.lastSeq);
      if (r.fight.status !== "active") void refresh();
    } catch {
      /* next poll */
    }
  }, [fightId, me, play, refresh]);

  useEffect(() => {
    lastSeq.current = 0;
    seen.current = new Set();
    setHits([]);
    setView(null);
    if (!fightId) {
      api.get<{ weapons: Tray[] }>("/api/bosses").then((r) => setTray(r.weapons)).catch(() => undefined);
      return;
    }
    void poll(true);
    const t = setInterval(() => document.visibilityState === "visible" && void poll(), POLL_MS);
    return () => clearInterval(t);
  }, [fightId, poll]);

  const row = list?.bosses.find((b) => b.id === id) ?? list?.events?.find((b) => b.id === id) ?? list?.mentors?.find((b) => b.id === id);
  const hpShown = view ? Math.max(0, view.hp - pendingDmg) : state?.fight?.bossId === id ? state.fight.hp : null;
  // the boss punches at the screen now and then while the fight is on (show only, no damage)
  // a dazed boss (below half HP) is scared: no more punches at the screen, he only waves his arms limply (screens.css)
  const strikeFx = useBossStrike(boss?.id ?? "", fighting && (hpShown ?? 1) > 0 && !BOXERS.has(boss?.id ?? "") && (hpShown === null || hpShown / Math.max(1, view?.hpMax ?? row?.hpMax ?? boss?.hp ?? 1) >= BEATEN_BELOW));

  // a free weapon still reloading: «ударить сейчас» for RUSH_PRICE (a window asks first), then it reloads again
  const [rushAsk, setRushAsk] = useState<{ id: string; name: string; left: number } | null>(null);
  // «Комбо»: its panel and the window when it is guessed
  const [comboOpen, setComboOpen] = useState(false);
  const [comboWin, setComboWin] = useState(false);
  // «Дополнительная награда»: the boss's box window
  const [boxOpen, setBoxOpen] = useState(false);
  const attack = async (weapon: string, rush = false, pack = 1) => {
    if (!hitGapOk()) return;
    const w = weaponById(weapon)!;
    const have = tray.find((x) => x.id === weapon)?.qty ?? 0;
    const n = w.weapon.kind === "consumable" ? Math.max(1, Math.min(pack, have)) : 1;
    const est = weaponStats(state, w.id).damage * n;
    haptic.hit();
    // heavier weapons sound heavier: 10 dmg → 0, 500+ → 1
    weaponSfx(w.id, Math.min(1, Math.log10(Math.max(10, w.weapon.damage) / 10) / Math.log10(50)));
    play(weapon, est, w.weapon.action, true);
    setPendingDmg((d) => d + est);
    setTray((t) => t.map((x) => (x.id === weapon && w.weapon.kind === "consumable" ? { ...x, qty: Math.max(0, x.qty - n) } : x)));
    try {
      const r = await api.action<{ damage: number; crit: boolean; crits: number; count: number; phrase: string; hp: number; status: string; left: number | null; readyAt: number | null; fightDamage: number; talentDamage: number; talentsGained: number; combo?: FightView["combo"] }>("attack", { weapon, count: n, idem: crypto.randomUUID(), ...(rush ? { rush: true } : {}) });
      if (r.result.crit) {
        setCritPop(Date.now());
        haptic.heavy(); // no crit sound: only the weapon's own
      }
      setView((v) => (v ? { ...v, hp: Math.min(v.hp, r.result.hp), myDamage: v.myDamage + r.result.damage, myHits: v.myHits + (r.result.count ?? 1), ...(r.result.combo ? { combo: r.result.combo } : {}) } : v));
      // «Комбо»: right — a little buzz; the last step — «КОМБО РАЗГАДАНО!»
      const cb = r.result.combo;
      if (cb && cb.last === "right") {
        if (cb.done) { haptic.big(); sfx("victory"); setComboWin(true); } else haptic.ok();
      }
      setTray((t) => t.map((x) => (x.id === weapon ? { ...x, qty: r.result.left ?? x.qty, readyAt: r.result.readyAt ?? x.readyAt } : x)));
      setTalentDmg(r.result.talentDamage);
      if (r.result.status === "won") {
        haptic.big();
        sfx("victory");
      }
      if (r.result.talentsGained > 0) {
        haptic.ok();
        sfx("coin");
        toast(<span className="gain-line"><span className="gain"><Icon name="talent" size={26} />+{r.result.talentsGained}</span></span>, "ok");
        setTalentPop(Date.now());
      }
      if (r.result.status !== "active" || r.result.talentsGained > 0) void refresh();
    } catch (e) {
      if ((e as { code?: string }).code === "too_fast") return;
      haptic.err();
      sfx("error");
      toast(e instanceof Error ? e.message : "Не получилось", "err");
      void poll(true);
    } finally {
      setPendingDmg((d) => Math.max(0, d - est));
    }
  };

  // «Урон от Иглы» (content/obshak.ts): today's stock of «Общак» in one blow, as much as the boss can still take
  const [needleAsk, setNeedleAsk] = useState(false);
  const needle = async () => {
    if (!hitGapOk()) return;
    const pool = state?.obshak?.pool ?? 0;
    if (pool <= 0) return;
    haptic.heavy();
    weaponSfx("keyboard", 1);
    try {
      const r = await api.action<{ damage: number; hp: number; status: string; left: number | null; talentDamage: number; talentsGained: number }>("attack", { weapon: NEEDLE_ID, idem: crypto.randomUUID() });
      play("keyboard", r.result.damage, "", true);
      setView((v) => (v ? { ...v, hp: Math.min(v.hp, r.result.hp), myDamage: v.myDamage + r.result.damage, myHits: v.myHits + 1 } : v));
      setTalentDmg(r.result.talentDamage);
      if (r.result.status === "won") { haptic.big(); sfx("victory"); }
      void refresh();
    } catch (e) {
      if ((e as { code?: string }).code === "too_fast") return;
      haptic.err();
      toast(e instanceof Error ? e.message : "Не получилось", "err");
    }
  };

  // «Соло»: the same fight, but only my own hits take the boss's HP — wins count for the «Соло» badge
  // the fight mode: «Пацанский» ×1 HP, «Блатной» ×3, «Авторитетный» ×6 (content/medals.ts); remembered per boss
  // four ways, one at a time: three modes or «Соло» (a fight alone at normal HP); remembered per boss
  const [pick, setPickRaw] = useState<FightMode | "solo">("pacan");
  useEffect(() => {
    try { const m = localStorage.getItem(`xc-mode-${id}`); if (m === "pacan" || m === "blat" || m === "avtor" || m === "solo") setPickRaw(m); } catch { /* storage blocked */ }
  }, [id]);
  // «Комбо»: picked after the fight mode, remembered per boss
  const [combo, setComboRaw] = useState<ComboMode>("pacan");
  useEffect(() => {
    try { const c = localStorage.getItem(`xc-combo-${id}`); if (c === "pacan" || c === "blat" || c === "avtor") setComboRaw(c); } catch { /* storage blocked */ }
  }, [id]);
  const setCombo = (c: ComboMode) => { setComboRaw(c); try { localStorage.setItem(`xc-combo-${id}`, c); } catch { /* storage blocked */ } };
  const setPick = (m: FightMode | "solo") => { setPickRaw(m); try { localStorage.setItem(`xc-mode-${id}`, m); } catch { /* storage blocked */ } };
  // an event boss (Пепе) is fought only in «Пацанский», never «Соло»
  // Нитка (boss.modes): a mentor fought in every mode, no «Соло»
  const ev = !!boss?.event && !boss.modes;
  const soloPick = !boss?.event && pick === "solo";
  const mode: FightMode = ev || pick === "solo" ? "pacan" : pick;
  // the mode pages: a swipe or the arrows go to the next / previous one (the slide comes from that side)
  const [slide, setSlide] = useState<"l" | "r" | null>(null);
  const goMode = (dir: 1 | -1) => {
    const i = MODE_ORDER.indexOf(mode) + dir;
    if (ev || i < 0 || i >= MODE_ORDER.length) return;
    haptic.tap();
    setSlide(dir > 0 ? "r" : "l");
    setPick(MODE_ORDER[i]);
  };
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { const t = e.touches[0]; swipe.current = { x: t.clientX, y: t.clientY }; };
  const onTouchEnd = (e: React.TouchEvent) => {
    const st = swipe.current, t = e.changedTouches[0];
    swipe.current = null;
    if (!st) return;
    const dx = t.clientX - st.x, dy = t.clientY - st.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) goMode(dx < 0 ? 1 : -1);
  };
  const start = async (solo = false) => {
    const md = fightMode(mode);
    const r = await act<{ fightId: number }>("fight_start", { boss: id, solo, mode, combo: hasCombo(id) ? combo : null }, `${solo ? "Соло-бой" : "Бой"} с боссом ${boss?.name} · ${md.name}${md.hp > 1 ? ` (здоровье ×${md.hp}, награда ×${md.reward})` : ""}. 8 часов`);
    if (r) void loadList();
    return !!r;
  };
  // the door in front of the boss: closed → open (swings on its hinges) → enter (we step in, the fight starts)
  const [door, setDoor] = useState<"closed" | "rattle" | "open" | "enter">("closed");
  useEffect(() => {
    if (!fightId) setDoor("closed"); // back from a fight: the door is shut again
    if (!fightId) void loadList(); // and today's fights count again (the daily limit on the door)
  }, [fightId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [fleeAsk, setFleeAsk] = useState(false);
  // a missing weapon opens the weapons shelf right here; closing it leaves you in the fight
  const [shopOpen, setShopOpen] = useState(false);
  const closeShop = () => {
    setShopOpen(false);
    api.get<{ weapons: Tray[] }>("/api/bosses").then((r) => setTray(r.weapons)).catch(() => undefined);
  };
  const flee = async () => {
    if (!fleeAsk) {
      setFleeAsk(true);
      setTimeout(() => setFleeAsk(false), 3000);
      return;
    }
    setFleeAsk(false);
    await act("fight_flee");
    void loadList();
  };

  const myShare = view ? pct(view.myDamage, view.hpMax) : 0;
  const topRows = useMemo(() => view?.top ?? [], [view]);

  if (!boss) return <Empty>Такого босса нет</Empty>;
  // an event boss is there only while the admin has the event on (a fight already started may still be finished)
  if (ev && state && !fightId && !boss.mentor && !state.eventBosses?.includes(boss.id)) {
    return (
      <div className="fit-page" style={{ display: "grid", placeItems: "center", padding: 24 }}>
        <div className="panel col center" style={{ gap: 10, maxWidth: 320 }}>
          <b className="display">Ивент сейчас не идёт</b>
          <span className="small muted">{boss.name} вернётся позже — следи за новостями.</span>
          <Link className="btn gold block" href="/">На главную</Link>
        </div>
      </div>
    );
  }
  const otherFight = state?.fight && state.fight.bossId !== id ? state.fight : null;
  const limitLeft = row ? row.fightsPerDay - row.fightsToday : 1;

  const hpMax = view?.hpMax ?? row?.hpMax ?? boss.hp;
  // the fight takes the whole screen: the boss's own room (the garage for the others) + drifting sky behind, the boss in the middle, weapons at the bottom
  if (fightId) {
    return (
      <div className="fit-page fight-page" style={{ ["--acc" as string]: boss.theme.accent }}>
        <div className="fight-bg" aria-hidden="true">
          <DriftingSky className="fight-sky" />
          <ArenaBg bossId={boss.id} />
        </div>
        <div className="fight-head">
          <div className="grow" style={{ minWidth: 0 }}>
            <b className="display boss-name ellipsis">{boss.name}</b>
          </div>
          {(view?.mode ?? state?.fight?.mode) && (view?.mode ?? state?.fight?.mode) !== "pacan" && <span className={`chip mode-chip ${view?.mode ?? state?.fight?.mode}`}>{fightMode(view?.mode ?? state?.fight?.mode).name}</span>}
          {(view?.solo ?? state?.fight?.solo) ? <span className="chip violet">соло</span> : view && <span className="chip red">бьют: {view.fightingNow}</span>}
          <BossRulesHelp topic="boss" />
        </div>
        {boss.id === "utilizator" && <UtilizatorFront />}
        <Arena full boss={boss} hp={hpShown} hpMax={hpMax} endsAt={state!.fight!.endsAt} fx={layer} hit={hitAnim} ouch={ouch} rug={rug} feed={[]} strike={strikeFx.side}
          corner={view && bossBonus(boss.id).length ? <BossBoxButton bossId={boss.id} fightId={view.fightId} damage={view.myDamage} onOpen={() => setBoxOpen(true)} /> : null} />
        {boxOpen && view && <BossBoxWindow bossId={boss.id} fightId={view.fightId} damage={view.myDamage} onClose={() => setBoxOpen(false)} />}
        {/* the side tabs: «Топ» on the left edge, «Инфо» (the hits) on the right — each slides its panel in */}
        <BoostIcons />
        <button type="button" className="fside l" onClick={() => { haptic.tap(); setTab("top"); }}><span>Топ</span></button>
        <button type="button" className="fside r" onClick={() => { haptic.tap(); setTab("info"); }}><span>Инфо</span></button>
        <div className="fight-bottom">
          {critPop > 0 && <CritBurn key={critPop} className="crit-burn" onDone={() => setCritPop(0)} />}
          <div className="row fight-bar">
            <TalentProgress dmg={talentDmg ?? state?.player.talentDamage ?? 0} pop={talentPop} share={myShare} onOpen={() => setTalentsOpen(true)} />
            <button type="button" className="btn sm gold fbtn-arms" onClick={() => { haptic.tap(); setPanel(true); }} aria-label="Оружие" title="Оружие в бою">
              <ItemArt id="rug-pull-gun" size={22} />
            </button>
            {(state?.obshak?.pool ?? 0) > 0 && (
              <button type="button" className="btn sm violet fbtn-needle" onClick={() => { haptic.tap(); setNeedleAsk(true); }} aria-label="Урон от Иглы" title="Урон от Иглы — запас из общака">
                <ItemArt id={NEEDLE_ID} size={22} /><span className="num">{short(state!.obshak!.pool)}</span>
              </button>
            )}
            {view?.combo && <ComboButton c={view.combo} onOpen={() => setComboOpen((o) => !o)} />}
            {needleAsk && (
              // a guard against a stray tap: today's stock of «Общак» goes in one blow
              <Modal title="Урон от Иглы" onClose={() => setNeedleAsk(false)}>
                <div className="col center ob-ask">
                  <span className="muted">Доступно сегодня:</span>
                  <b className="num ob-ask-n">{full(state?.obshak?.pool ?? 0)}</b>
                  <button type="button" className="btn gold" onClick={() => { setNeedleAsk(false); void needle(); }}>Втащить</button>
                </div>
              </Modal>
            )}
            <span className="grow" />
            <button type="button" className={`btn sm red fbtn-flee ${fleeAsk ? "ask" : ""}`} onClick={flee} disabled={busy === "fight_flee"} aria-label={fleeAsk ? "Точно сдаться?" : "Сдаться"} title="Сдаться">
              {fleeAsk ? <b>?</b> : <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13" /><path d="M13 6l6 6-6 6" /></svg>}
            </button>
          </div>
          {comboOpen && view?.combo && <ComboPanel c={view.combo} bossId={boss.id} onClose={() => setComboOpen(false)} onClaimed={() => setView((v) => (v?.combo ? { ...v, combo: { ...v.combo, claimed: true } } : v))} />}
          <FightTray slots={slotsOf(state)} tray={tray} onHit={(id, n) => attack(id, false, n)} onBuy={() => setShopOpen(true)} onCooldown={(name, left, id) => { haptic.tap(); setRushAsk({ id, name, left }); }} disabled={view?.status !== undefined && view.status !== "active"} />
        </div>
        {panel && <WeaponPanel tray={tray} onClose={() => setPanel(false)} />}
        {comboWin && view?.combo?.done && <ComboDone c={view.combo} bossId={boss.id} onClose={() => { setComboWin(false); void poll(true); }} />}
        {shopOpen && <WeaponShopWindow onClose={closeShop} />}
        {rushAsk && (
          <Modal title={`${rushAsk.name} перезаряжается`} onClose={() => setRushAsk(null)}>
            <div className="col center" style={{ gap: 12, alignItems: "center" }}>
              <ItemArt id={rushAsk.id} size={72} />
              <span className="small center rush-q">Ещё {clock(rushAsk.left)}. Ударить сейчас за <span className="nowrap-ic"><Icon name={rushPrice(rushAsk.id).currency} size={14} /><b>{rushPrice(rushAsk.id).amount}</b>?</span> После удара — снова перезарядка.</span>
              <div className="row" style={{ gap: 8, width: "100%" }}>
                <button className="btn dark grow" onClick={() => setRushAsk(null)}>Отмена</button>
                <button className="btn gold grow" disabled={(state?.wallet[rushPrice(rushAsk.id).currency] ?? 0) < rushPrice(rushAsk.id).amount}
                  onClick={() => { const id = rushAsk.id; setRushAsk(null); void attack(id, true); }}>
                  Ударить за <Icon name={rushPrice(rushAsk.id).currency} size={16} />{rushPrice(rushAsk.id).amount}
                </button>
              </div>
              {(state?.wallet[rushPrice(rushAsk.id).currency] ?? 0) < rushPrice(rushAsk.id).amount && <span className="tiny" style={{ color: "#ff8a9e" }}>Не хватает жетонов</span>}
            </div>
          </Modal>
        )}
      {talentsOpen && <TalentWindow onClose={() => setTalentsOpen(false)} />}
        {tab === "top" && <SidePanel side="l" title="Топ по урону" onClose={() => setTab(null)}><TopList rows={topRows} me={me} /></SidePanel>}
        {tab === "info" && <SidePanel side="r" title="Удары" onClose={() => setTab(null)}><HitLog hits={hits} /></SidePanel>}
      </div>
    );
  }

  // before the fight: a room with a door, the boss waits behind it (seen through the window); the rewards are on the door,
  // the pass that opens him hangs on the left wall. A tap on the door opens it and starts the fight (Соло — the same, alone)
  const locked = !!row && !row.unlocked;
  // already fought → keeps its colour behind the door, grey only for a never opened boss
  const grey = locked && !(row.myDamage > 0 || row.myWins > 0);
  const prev = boss.order > 1 && !boss.event ? BOSSES.find((x) => x.order === boss.order - 1) : null;
  const roadLeft = !!row?.road && row.road.done < row.road.times;
  const blocked = locked && roadLeft && row?.road ? `Сначала пройди локацию «${row.road.name}»${row.road.times > 1 ? ` ${row.road.times} раза — пройдено ${row.road.done}` : ""}` : locked ? `Нужно пропусков «${prev?.name}»: ${row!.keysNeed}. У тебя ${row!.keysHave}` : otherFight ? `Сначала закончи бой с боссом ${bossById(otherFight.bossId)?.name}` : limitLeft <= 0 ? "Лимит побед на сегодня — новые после полуночи по Москве" : null;
  const openDoor = async (solo: boolean) => {
    if (door !== "closed" || busy === "fight_start") return;
    if (blocked) {
      setDoor("rattle");
      sfx("locked");
      haptic.err();
      toast(blocked, "err");
      setTimeout(() => setDoor("closed"), 450);
      return;
    }
    setDoor("open");
    sfx("door");
    haptic.heavy();
    await new Promise((r) => setTimeout(r, 850));
    setDoor("enter");
    await new Promise((r) => setTimeout(r, 380));
    const ok = await start(solo);
    if (!ok) setDoor("closed");
  };
  const doorReward = { ...boostReward(boss.reward, fightMode(mode).reward), items: [...(boss.final || boss.event ? [] : [{ id: `key-${boss.id}`, qty: 1 }]), ...(boss.reward.items ?? [])] };
  return (
    <div className="fit-page door-page" style={{ ["--acc" as string]: boss.theme.accent }} onTouchStart={door === "closed" ? onTouchStart : undefined} onTouchEnd={door === "closed" ? onTouchEnd : undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="door-backdrop" src={`/assets/door/room${MODE_ART[mode]}.webp`} alt="" aria-hidden="true" draggable={false} />
      <div className="door-help"><BossRulesHelp topic="boss" bossId={boss.id} /></div>
      <div key={mode} className={`door-scene mode-${mode} ${door} ${slide ? `slide-${slide}` : ""}`}>
        {/* behind the door: the boss's own background and the boss himself */}
        <div className="door-behind">
          <DriftingSky className="fight-sky" />
          <ArenaBg bossId={boss.id} className="door-behind-bg" focus="middle" />
          {/* a boss that is not open yet stands there too, but grey */}
          <div className={`door-boss${grey ? " locked" : ""}`}>
            {boss.id === "pepe" ? (
              <div className="pepe-door-boss"><PepeRig view={[180, 150, 820, 1341]} /></div>
            ) : hasBossRig(boss.id) ? (
              <BossRig id={boss.id} />
            ) : boss.photo.full ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={boss.photo.full} alt={boss.name} draggable={false} />
            ) : (
              <div className="arena-sil"><BossSilhouette accent={boss.theme.accent} /></div>
            )}
          </div>
          <div className="door-light" />
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="door-room" src={`/assets/door/room${MODE_ART[mode]}.webp`} alt="" draggable={false} />
        {/* the pass that opens this boss, on the left wall */}
        <div className={`door-pass ${locked ? "short" : ""}`}>
          {roadLeft && row?.road ? (
            <>
              <Icon name="lock" size={28} />
              <b className="num">{row.road.done}/{row.road.times}</b>
            </>
          ) : prev && row?.ring ? (
            <>
              <ItemArt id="keys-bundle" size={34} />
              <span className="tiny">связка</span>
            </>
          ) : prev ? (
            <>
              <ItemArt id={`key-${prev.id}`} size={34} />
              <b className="num">{row?.keysHave ?? 0}/{row?.keysNeed ?? 3}</b>
            </>
          ) : (
            <span className="tiny">вход<br />свободный</span>
          )}
        </div>
        {/* «Соло» (a fight alone) is only on the «Пацанский» page: a switch on the wall */}
        {!locked && !boss.event && mode === "pacan" && (
          <div className="door-side">
            <button type="button" aria-pressed={soloPick} className={`door-word solo ${soloPick ? "on" : ""}`} disabled={door !== "closed"}
              onClick={() => { haptic.tap(); setPick(soloPick ? "pacan" : "solo"); }}
              aria-label={`Соло — бой в одиночку, урон других не засчитывается${(row?.mySoloWins ?? 0) > 0 ? ", уже побеждён соло" : ""}`}>
              Соло
              <svg className={`door-solo-star ${(row?.mySoloWins ?? 0) > 0 ? "on" : ""}`} viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 2.6l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" />
              </svg>
            </button>
          </div>
        )}
        {/* the mode pages: their names on top, arrows at the sides (a swipe does the same) */}
        {!locked && !ev && door === "closed" && (
          <>
            <div className="mode-pager" role="tablist" aria-label="Режим боя">
              {FIGHT_MODES.map((m, i) => (
                <button key={m.id} type="button" role="tab" aria-selected={mode === m.id} className={`mode-tab ${m.id} ${mode === m.id ? "on" : ""}`}
                  onClick={() => { if (m.id === mode) return; haptic.tap(); setSlide(i > MODE_ORDER.indexOf(mode) ? "r" : "l"); setPick(m.id); }}
                  aria-label={`${m.name}: здоровье ×${m.hp}, награда ×${m.reward}${m.things ? ", падают вещи" : ""}`}>
                  {m.name}
                </button>
              ))}
            </div>
          </>
        )}
        <button className="door-leaf" onClick={() => openDoor(soloPick)} aria-label={blocked ? `${locked ? "Нет карт" : "Закрыто"}: ${blocked}` : `Открыть дверь и начать ${soloPick ? "соло-бой" : "бой"} с боссом ${boss.name} · ${fightMode(mode).name}`} disabled={door === "open" || door === "enter"}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/assets/door/door${MODE_ART[mode]}.webp`} alt="" draggable={false} />
          <span className="door-hit" />
          {/* the name above the window, the rewards down the lower half — all on the door */}
          <b className="door-name display">{boss.name}</b>
          {ev && <span className="door-event">ИВЕНТ</span>}
          {boss.mentor && boss.modes && <span className="door-event">МЕНТОР</span>}
          <span className="door-plate">
            <b className="door-plate-title">{boss.final ? "ФИНАЛ" : "НАГРАДА"}</b>
            <GainLine r={doorReward} size={14} />
            {!!boss.wear && (boss.thingsMode ? mode === boss.thingsMode : fightMode(mode).things) && <DropKind kind="wear" size={14} count={bossItemsCount(boss, state) ?? undefined} />}
            {/* his room for the home: in the mode his things drop in (an event boss — his only mode), until it is the player's */}
            {(boss.thingsMode ? mode === boss.thingsMode : ev || fightMode(mode).things) && ROOM_DEFS.some((r) => r.drop?.boss === boss.id && !state?.home.rooms.includes(r.id) && !state?.unlocks?.includes(roomUnlockId(r.id))) && <DropKind kind="room" size={14} count="шанс" />}
            {!!bossTattooCount(boss.id, state, mode) && <DropKind kind="tattoo" size={14} count={bossTattooCount(boss.id, state, mode)!} />}
          </span>
          {blocked && locked && <span className="door-lock"><Icon name="lock" size={30} /></span>}
        </button>
        {!blocked && door === "closed" && <span className="door-hint">Нажми на дверь</span>}
        <div className="door-flash" />
      </div>
      {!locked && !ev && door === "closed" && mode !== "pacan" && <button type="button" className="mode-arrow l" onClick={() => goMode(-1)} aria-label="Предыдущий режим">‹</button>}
      {!locked && !ev && door === "closed" && mode !== "avtor" && <button type="button" className="mode-arrow r" onClick={() => goMode(1)} aria-label="Следующий режим">›</button>}
      <div className="fight-bottom prefight-panel">
        {!locked && hasCombo(boss.id) && <ComboPick value={combo} onChange={setCombo} done={(m) => !!list?.combos?.[`${boss.id}:${m}`]?.done} />}
        <div className="tiny muted center mode-hint">
          {soloPick ? "Соло (бьёшь один): здоровье" : `${fightMode(mode).name}: здоровье`} {full(Math.round((row?.hpMax ?? boss.hp) * fightMode(mode).hp))}{(boss.thingsMode ? mode === boss.thingsMode : fightMode(mode).things) ? " · падают вещи босса" : ""}{tattooSetsOfBoss(boss.id).some((t) => t.mode === mode) ? " · падают наколки" : ""}.
        </div>
        <div className="row small" style={{ justifyContent: "space-between", gap: 6 }}>
          <span className="chip gold"><Icon name="clock" size={14} />8 часов</span>
          <span className="chip" title="Боёв сегодня из дневного лимита · побед над этим боссом за всё время">Сегодня {row?.fightsToday ?? 0}/{row?.fightsPerDay ?? 7} · всего {row?.myWins ?? 0}</span>
        </div>
        {otherFight && (
          <Link className="btn violet block" href={`/bosses/${otherFight.bossId}`}>Идёт бой с {bossById(otherFight.bossId)?.name} — к нему</Link>
        )}
      </div>
    </div>
  );
}

/** Boss damage of all time towards the next talent (the counter carries over from fight to fight). */
export function TalentProgress({ dmg, pop, share, onOpen }: { dmg: number; pop: number; share: number; onOpen: () => void }) {
  const k = talentsForDamage(dmg);
  const from = talentThreshold(k);
  const to = talentThreshold(k + 1);
  const p = Math.max(0, Math.min(1, (dmg - from) / (to - from)));
  return (
    <button type="button" key={pop} onClick={onOpen} aria-label="Открыть таланты" className={`chip talent-prog ${pop ? "talent-pop" : ""}`} title={`Урон по боссам за всё время: ${full(dmg)} (в этом бою — ${share.toFixed(1)}% HP). До следующего таланта — ${full(Math.max(0, to - dmg))}`}>
      <i className="fill" style={{ width: `${p * 100}%` }} />
      <Icon name="talent" size={16} />
      <b className="num">{full(Math.max(0, dmg - from))}</b><span className="muted">/{full(to - from)}</span>
    </button>
  );
}
