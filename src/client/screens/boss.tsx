"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGame, useNow } from "../store.tsx";
import { api, type FightView, type Hit, type Tray } from "../api.ts";
import { BOSSES, arenaOf, bossById, type BossDef, FULL_SHARE, KEY_SHARE, rewardShare } from "../../content/bosses.ts";
import { WEAPONS, weaponById } from "../../content/items.ts";
import { HIT_PHRASES } from "../../content/phrases.ts";
import { ArenaBackdrop, BossSilhouette } from "../art/scenes.tsx";
import { ItemArt } from "../art/items.tsx";
import { Icon } from "../art/icons.tsx";
import { Bar, Empty, GainLine, MysteryDrop, bossItemsCount } from "../ui.tsx";
import { useFx, type Fx } from "../fx/attack.tsx";
import { BossRulesHelp, useBossList } from "./bosses.tsx";
import { WeaponShopWindow } from "./shop.tsx";
import { clock, full, pct, short } from "../format.ts";
import { setMusicTrack, sfx, weaponSfx } from "../sound.ts";
import { haptic } from "../telegram.ts";
import { DriftingSky } from "../art/sky.tsx";
import { BossRig, hasBossRig } from "../art/boss-rig.tsx";
import { Modal } from "../ui.tsx";
import { talentThreshold, talentsForDamage } from "../../content/talents.ts";
import { TalentWindow } from "./talents.tsx";
import { weaponStats } from "../weapon-stats.ts";
import { StrikeFx, useBossStrike } from "../fx/boss-strike.tsx";

const POLL_MS = 1500;
/** a hit stays in the arena feed this long */
const FEED_MS = 5000;
/** the hit phrase bubble stays this long */
const PHRASE_MS = 2200;

function Arena({ boss, hp, hpMax, endsAt, fx, hit, ouch, rug, feed, full: fullScreen, strike }: { boss: BossDef; hp: number | null; hpMax: number; endsAt: number | null; fx: React.ReactNode; hit: boolean; ouch?: boolean; rug: boolean; feed: Hit[]; full?: boolean; strike?: "l" | "r" | null }) {
  const now = useNow();
  const phase = boss.phases && hp !== null ? [...boss.phases].reverse().find((p) => pct(hp, hpMax) <= p.from) ?? boss.phases[0] : null;
  const hurt = hp !== null && pct(hp, hpMax) < 25;
  return (
    <div className={`arena ${boss.final ? "final" : ""} ${fullScreen ? "full" : ""}`} style={{ ["--acc" as string]: boss.theme.accent }}>
      {!fullScreen && <ArenaBackdrop theme={boss.theme} final={boss.final} />}
      <div className={`arena-photo ${hit ? "hit" : ""} ${ouch ? "ouch" : ""} ${rug ? "rug" : ""} ${hurt ? "hurt" : ""} ${strike ? `strike strike-${strike}` : ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {hasBossRig(boss.id) ? <BossRig id={boss.id} hpShare={hp === null ? 1 : hp / Math.max(1, hpMax)} /> : boss.photo.full ? <img src={boss.photo.full} alt={boss.name} draggable={false} /> : <div className="arena-sil"><BossSilhouette accent={boss.theme.accent} /><span className="small muted">фото скоро</span></div>}
        <div className="arena-flash" />
        {hurt && !hasBossRig(boss.id) && <div className="arena-plasters" />}
      </div>
      <div className="arena-top">
        {hp !== null ? <Bar value={hp} max={hpMax} tone="red" height={24} label={`${full(hp)} / ${full(hpMax)}`} /> : <Bar value={hpMax} max={hpMax} tone="red" height={24} label={`${full(hpMax)} HP`} />}
        <div className="arena-sub">
          <div className="col" style={{ gap: 4, alignItems: "flex-start" }}>
            {endsAt && <span className="chip gold"><Icon name="clock" size={14} />{clock(endsAt - now)}</span>}
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
type Mult = (typeof MULTS)[number];
/** how many of this weapon one tap uses now */
const batchOf = (kind: string, qty: number, mult: Mult) => (kind === "consumable" ? Math.max(1, Math.min(mult, qty)) : 1);

function MultPicker({ mult, setMult }: { mult: Mult; setMult: (m: Mult) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`mult-pick ${open ? "open" : ""}`}>
      <button className={`btn sm ${mult > 1 ? "gold" : "dark"} mult-btn`} onClick={() => setOpen((o) => !o)} aria-expanded={open} title="Сколько оружия тратить за одно нажатие">
        ×{mult}
      </button>
      {open && MULTS.map((m) => (
        <button key={m} className={`btn sm ${m === mult ? "gold" : "dark"}`} onClick={() => { setMult(m); setOpen(false); }}>×{m}</button>
      ))}
      {open && <span className="tiny muted mult-note">кулак, мышь и свеча — всегда ×1</span>}
    </div>
  );
}

function WeaponTray({ tray, onHit, onCooldown, onBuy, disabled, mult }: { tray: Tray[]; onHit: (id: string) => void; onCooldown: (name: string, leftMs: number) => void; onBuy: () => void; disabled: boolean; mult: Mult }) {
  const { state } = useGame();
  const now = useNow();
  return (
    <div className="tray" style={{ gridTemplateColumns: `repeat(${WEAPONS.length}, minmax(0, 1fr))` }}>
      {WEAPONS.map((w) => {
        const t = tray.find((x) => x.id === w.id);
        const qty = t?.qty ?? 0;
        const cd = t?.readyAt && t.readyAt > now ? t.readyAt - now : 0;
        const total = (w.weapon!.cooldownMin ?? 0) * 60_000;
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
            onClick={() => (cd ? onCooldown(w.name, cd) : empty ? onBuy() : onHit(w.id))}
            title={`${w.name}: ${w.weapon!.action}`}
          >
            <ItemArt id={w.id} size={40} />
            <span className="w-dmg display">−{short(weaponStats(state, w.id).damage * batchOf(w.weapon!.kind, qty, mult))}</span>
            {!perm && mult > 1 && qty > 1 && <span className="w-mult">×{Math.min(mult, qty)}</span>}
            {!perm && <span className="w-qty num">{qty}</span>}
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
  const [phrase, setPhrase] = useState<{ text: string; id: number; crit?: boolean } | null>(null);
  const [talentPop, setTalentPop] = useState(0);
  // the talent counter after my last hit (the state catches up on the next refresh)
  const [talentDmg, setTalentDmg] = useState<number | null>(null);
  const [talentsOpen, setTalentsOpen] = useState(false);
  // the phrase bubble goes away by itself
  useEffect(() => {
    if (!phrase) return;
    const t = setTimeout(() => setPhrase(null), PHRASE_MS);
    return () => clearTimeout(t);
  }, [phrase]);
  const [tab, setTab] = useState<"top" | "mine" | null>(null);
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
      if (fresh.length) setHits((old) => [...fresh, ...old].sort((a, b) => b.seq - a.seq).slice(0, 30));
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

  // my hits are shown only during a fight (only hits of this fight)
  useEffect(() => {
    if (!fightId || tab !== "mine") return;
    api.get<typeof details>(`/api/bosses/${id}`).then(setDetails).catch(() => undefined);
  }, [tab, id, fightId, view?.myHits]); // eslint-disable-line react-hooks/exhaustive-deps

  const row = list?.bosses.find((b) => b.id === id);
  const hpShown = view ? Math.max(0, view.hp - pendingDmg) : state?.fight?.bossId === id ? state.fight.hp : null;
  // the boss punches at the screen now and then while the fight is on (show only, no damage)
  const strikeFx = useBossStrike(fighting && (hpShown ?? 1) > 0);

  const [mult, setMult] = useState<Mult>(1);
  const attack = async (weapon: string) => {
    const w = weaponById(weapon)!;
    const have = tray.find((x) => x.id === weapon)?.qty ?? 0;
    const n = batchOf(w.weapon.kind, have, mult);
    const est = weaponStats(state, w.id).damage * n;
    haptic.hit();
    // heavier weapons sound heavier: 10 dmg → 0, 500+ → 1
    weaponSfx(w.id, Math.min(1, Math.log10(Math.max(10, w.weapon.damage) / 10) / Math.log10(50)));
    play(weapon, est, w.weapon.action, true);
    setPendingDmg((d) => d + est);
    setTray((t) => t.map((x) => (x.id === weapon && w.weapon.kind === "consumable" ? { ...x, qty: Math.max(0, x.qty - n) } : x)));
    try {
      const r = await api.action<{ damage: number; crit: boolean; crits: number; count: number; phrase: string; hp: number; status: string; left: number | null; readyAt: number | null; fightDamage: number; talentDamage: number; talentsGained: number }>("attack", { weapon, count: n, idem: crypto.randomUUID() });
      const batch = (r.result.count ?? 1) > 1;
      const text = batch
        ? `×${r.result.count} · −${full(r.result.damage)}${r.result.crits ? ` · критов: ${r.result.crits}` : ""}`
        : r.result.crit ? `КРИТ! −${r.result.damage} · ${r.result.phrase || w.weapon.action}` : r.result.phrase || w.weapon.action;
      setPhrase({ text, id: Date.now(), crit: r.result.crit });
      if (r.result.crit) {
        haptic.heavy();
        sfx("crit");
      }
      setView((v) => (v ? { ...v, hp: Math.min(v.hp, r.result.hp), myDamage: v.myDamage + r.result.damage, myHits: v.myHits + (r.result.count ?? 1) } : v));
      setTray((t) => t.map((x) => (x.id === weapon ? { ...x, qty: r.result.left ?? x.qty, readyAt: r.result.readyAt ?? x.readyAt } : x)));
      setTalentDmg(r.result.talentDamage);
      if (r.result.status === "won") {
        haptic.big();
        sfx("win");
      }
      if (r.result.talentsGained > 0) {
        haptic.ok();
        sfx("coin");
        toast(<span className="gain-line"><span className="gain"><Icon name="talent" size={26} />+{r.result.talentsGained}</span></span>, "ok");
        setTalentPop(Date.now());
      }
      if (r.result.status !== "active" || r.result.talentsGained > 0) void refresh();
    } catch (e) {
      haptic.err();
      sfx("error");
      toast(e instanceof Error ? e.message : "Не получилось", "err");
      void poll(true);
    } finally {
      setPendingDmg((d) => Math.max(0, d - est));
    }
  };

  // «Соло»: the same fight, but only my own hits take the boss's HP — wins count for the «Соло» badge
  const start = async (solo = false) => {
    const r = await act<{ fightId: number }>("fight_start", { boss: id, solo }, solo ? `Соло-бой с боссом ${boss?.name}: бьёшь только ты. 8 часов` : `Бой с боссом ${boss?.name} начался! 8 часов`);
    if (r) void loadList();
    return !!r;
  };
  // the door in front of the boss: closed → open (swings on its hinges) → enter (we step in, the fight starts)
  const [door, setDoor] = useState<"closed" | "rattle" | "open" | "enter">("closed");
  useEffect(() => {
    if (!fightId) setDoor("closed"); // back from a fight: the door is shut again
  }, [fightId]);
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
  const myHits = useMemo(() => (details?.myHits ?? []).filter((h) => view && h.at >= view.startedAt), [details, view]);

  if (!boss) return <Empty>Такого босса нет</Empty>;
  const otherFight = state?.fight && state.fight.bossId !== id ? state.fight : null;
  const limitLeft = row ? row.fightsPerDay - row.fightsToday : 1;

  const hpMax = view?.hpMax ?? row?.hpMax ?? boss.hp;
  // the fight takes the whole screen: the boss's own room (the garage for the others) + drifting sky behind, the boss in the middle, weapons at the bottom
  if (fightId) {
    return (
      <div className={`fit-page fight-page ${strikeFx.impact ? "struck" : ""}`} style={{ ["--acc" as string]: boss.theme.accent }}>
        <div className="fight-bg" aria-hidden="true">
          <DriftingSky className="fight-sky" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={arenaOf(boss.id)} alt="" draggable={false} />
        </div>
        <div className="fight-head">
          <div className="grow" style={{ minWidth: 0 }}>
            <b className="display boss-name ellipsis">{boss.name}</b>
          </div>
          {(view?.solo ?? state?.fight?.solo) ? <span className="chip violet">соло</span> : view && <span className="chip red">бьют: {view.fightingNow}</span>}
          <BossRulesHelp topic="boss" />
        </div>
        <Arena full boss={boss} hp={hpShown} hpMax={hpMax} endsAt={state!.fight!.endsAt} fx={layer} hit={hitAnim} ouch={ouch} rug={rug} feed={hits} strike={strikeFx.side} />
        <StrikeFx impact={strikeFx.impact} />
        <div className="fight-bottom">
          {phrase && <div key={phrase.id} className={`phrase-bubble ${phrase.crit ? "crit" : ""}`}>{phrase.text}</div>}
          <MultPicker mult={mult} setMult={setMult} />
          <div className="row fight-bar">
            <TalentProgress dmg={talentDmg ?? state?.player.talentDamage ?? 0} pop={talentPop} share={myShare} onOpen={() => setTalentsOpen(true)} />
            {view && <ShareChip dmg={view.myDamage} hpMax={view.hpMax} />}
            <span className="grow" />
            <button className="btn sm dark" onClick={() => setTab("top")}>Топ</button>
            <button className="btn sm dark" onClick={() => setTab("mine")}>Мои</button>
            <button className={`btn sm ${fleeAsk ? "red" : "dark"}`} onClick={flee} disabled={busy === "fight_flee"}>{fleeAsk ? "Точно?" : "Сдаться"}</button>
          </div>
          <WeaponTray tray={tray} onHit={attack} onBuy={() => setShopOpen(true)} onCooldown={(name, left) => { haptic.err(); toast(`${name} перезаряжается: ещё ${clock(left)}`, "err"); }} disabled={view?.status !== undefined && view.status !== "active"} mult={mult} />
        </div>
        {shopOpen && <WeaponShopWindow onClose={closeShop} />}
      {talentsOpen && <TalentWindow onClose={() => setTalentsOpen(false)} />}
        {tab !== null && (
          <Modal title={tab === "top" ? "Топ боя" : "Мои удары"} onClose={() => setTab(null)}>
            {tab === "top" ? (
              topRows.length ? (
                <div className="col" style={{ gap: 4 }}>
                  {topRows.map((t, i) => (
                    <Link key={t.playerId} href={`/profile?id=${t.playerId}`} className={`top-row ${t.playerId === me ? "me" : ""}`}>
                      <span className="top-n display">{i + 1}</span>
                      <span className="grow ellipsis">{t.name}</span>
                      <b className="num">{short(t.damage)}</b>
                    </Link>
                  ))}
                </div>
              ) : <div className="muted small center">В этом бою ещё никто не бил. Будь первым.</div>
            ) : myHits.length ? (
              <div className="col" style={{ gap: 4 }}>
                {myHits.map((h, i) => (
                  <div key={i} className="row small">
                    <ItemArt id={h.weapon} size={22} />
                    <span className="grow ellipsis muted">{HIT_PHRASES[h.weapon]?.[h.phrase] ?? ""}</span>
                    {(h.count ?? 1) > 1 && <span className="tiny muted">×{h.count}</span>}
                    <b className="num" style={{ color: "var(--red)" }}>−{full(h.damage)}</b>
                  </div>
                ))}
              </div>
            ) : <div className="muted small center">В этом бою ты ещё не бил.</div>}
          </Modal>
        )}
      </div>
    );
  }

  // before the fight: a room with a door, the boss waits behind it (seen through the window); the rewards are on the door,
  // the pass that opens him hangs on the left wall. A tap on the door opens it and starts the fight (Соло — the same, alone)
  const locked = !!row && !row.unlocked;
  // already fought → keeps its colour behind the door, grey only for a never opened boss
  const grey = locked && !(row.myDamage > 0 || row.myWins > 0);
  const prev = boss.order > 1 ? BOSSES.find((x) => x.order === boss.order - 1) : null;
  const blocked = locked ? `Нужно пропусков «${prev?.name}»: ${row!.keysNeed}. У тебя ${row!.keysHave}` : otherFight ? `Сначала закончи бой с боссом ${bossById(otherFight.bossId)?.name}` : limitLeft <= 0 ? "Лимит побед на сегодня — новые после полуночи по Москве" : null;
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
  const doorReward = { ...boss.reward, items: [...(boss.final ? [] : [{ id: `key-${boss.id}`, qty: 1 }]), ...(boss.reward.items ?? [])] };
  return (
    <div className="fit-page door-page" style={{ ["--acc" as string]: boss.theme.accent }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="door-backdrop" src="/assets/door/room.webp" alt="" aria-hidden="true" draggable={false} />
      <div className="door-help"><BossRulesHelp topic="boss" bossId={boss.id} /></div>
      <div className={`door-scene ${door}`}>
        {/* behind the door: the boss's own background and the boss himself */}
        <div className="door-behind">
          <DriftingSky className="fight-sky" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="door-behind-bg" src={arenaOf(boss.id)} alt="" draggable={false} />
          {/* a boss that is not open yet stands there too, but grey */}
          <div className={`door-boss${grey ? " locked" : ""}`}>
            {hasBossRig(boss.id) ? (
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
        <img className="door-room" src="/assets/door/room.webp" alt="" draggable={false} />
        {/* the pass that opens this boss, on the left wall */}
        <div className={`door-pass ${locked ? "short" : ""}`}>
          {prev ? (
            <>
              <ItemArt id={`key-${prev.id}`} size={34} />
              <b className="num">{row?.keysHave ?? 0}/{row?.keysNeed ?? 3}</b>
            </>
          ) : (
            <span className="tiny">вход<br />свободный</span>
          )}
        </div>
        {/* «Соло» under the passes: a fight alone; the star turns gold once the player beat this boss solo */}
        {!otherFight && !locked && limitLeft > 0 && (
          <button className="door-solo" disabled={busy === "fight_start" || door !== "closed"} onClick={() => openDoor(true)}
            title="Соло: урон других игроков не засчитывается, только твой" aria-label={`Соло — бой в одиночку${(row?.mySoloWins ?? 0) > 0 ? ", уже побеждён соло" : ""}`}>
            <svg className={`door-solo-star ${(row?.mySoloWins ?? 0) > 0 ? "on" : ""}`} viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2.6l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" />
            </svg>
            <span className="display">Соло</span>
          </button>
        )}
        <button className="door-leaf" onClick={() => openDoor(false)} aria-label={blocked ? `${locked ? "Нет карт" : "Закрыто"}: ${blocked}` : `Открыть дверь и начать бой с боссом ${boss.name}`} disabled={door === "open" || door === "enter"}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/door/door.webp" alt="" draggable={false} />
          <span className="door-hit" />
          {/* the name above the window, the title under it, the rewards down the lower half — all on the door */}
          <b className="door-name display">{boss.name}</b>
          <span className="door-title">{boss.final ? `ФИНАЛ · ${boss.title}` : boss.title}</span>
          <span className="door-plate">
            <b className="door-plate-title">{boss.final ? "ФИНАЛ" : "НАГРАДА"}</b>
            <GainLine r={doorReward} size={14} />
            {(!!boss.drop?.length || !!boss.wear) && <MysteryDrop size={14} count={bossItemsCount(boss, state) ?? undefined} />}
          </span>
          {blocked && locked && <span className="door-lock"><Icon name="lock" size={30} /></span>}
        </button>
        {!blocked && door === "closed" && <span className="door-hint">Нажми на дверь</span>}
        <div className="door-flash" />
      </div>
      <div className="fight-bottom prefight-panel">
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

/** How much of the win reward this fight already earns: full from FULL_SHARE of the boss HP. */
function ShareChip({ dmg, hpMax }: { dmg: number; hpMax: number }) {
  const k = rewardShare(dmg, hpMax);
  const need = Math.ceil(hpMax * FULL_SHARE);
  return (
    <span className={`chip share-chip ${k >= 1 ? "full" : ""}`} title={`Награда за победу зависит от твоего урона: полная — от ${full(need)} (2% здоровья босса), ключ — от ${full(Math.ceil(hpMax * KEY_SHARE))}`}>
      <i className="fill" style={{ width: `${k * 100}%` }} />
      <Icon name="chest" size={16} />
      <b className="num">{Math.round(k * 100)}%</b>
    </span>
  );
}

/** Boss damage of all time towards the next talent (the counter carries over from fight to fight). */
function TalentProgress({ dmg, pop, share, onOpen }: { dmg: number; pop: number; share: number; onOpen: () => void }) {
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
