"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invQty, useGame, useNow } from "../store.tsx";
import { api, type FightView, type Hit, type Tray } from "../api.ts";
import { bossById, type BossDef, FULL_SHARE, KEY_SHARE, rewardShare } from "../../content/bosses.ts";
import { WEAPONS, weaponById } from "../../content/items.ts";
import { HIT_PHRASES } from "../../content/phrases.ts";
import { ArenaBackdrop, BossSilhouette } from "../art/scenes.tsx";
import { ItemArt } from "../art/items.tsx";
import { Icon } from "../art/icons.tsx";
import { Bar, Empty } from "../ui.tsx";
import { useFx, type Fx } from "../fx/attack.tsx";
import { BossRewardsPanel, BossRulesHelp, useBossList } from "./bosses.tsx";
import { WeaponShopWindow } from "./shop.tsx";
import { clock, full, pct, short } from "../format.ts";
import { sfx } from "../sound.ts";
import { haptic } from "../telegram.ts";
import { DriftingSky } from "../art/sky.tsx";
import { BossRig, hasBossRig } from "../art/boss-rig.tsx";
import { Modal } from "../ui.tsx";
import { talentThreshold, talentsForDamage } from "../../content/home.ts";

const POLL_MS = 1500;
/** a hit stays in the arena feed this long */
const FEED_MS = 5000;
/** the hit phrase bubble stays this long */
const PHRASE_MS = 2200;

function Arena({ boss, hp, hpMax, endsAt, fx, hit, rug, feed, full: fullScreen }: { boss: BossDef; hp: number | null; hpMax: number; endsAt: number | null; fx: React.ReactNode; hit: boolean; rug: boolean; feed: Hit[]; full?: boolean }) {
  const now = useNow();
  const phase = boss.phases && hp !== null ? [...boss.phases].reverse().find((p) => pct(hp, hpMax) <= p.from) ?? boss.phases[0] : null;
  const hurt = hp !== null && pct(hp, hpMax) < 25;
  return (
    <div className={`arena ${boss.final ? "final" : ""} ${fullScreen ? "full" : ""}`} style={{ ["--acc" as string]: boss.theme.accent }}>
      {!fullScreen && <ArenaBackdrop theme={boss.theme} final={boss.final} />}
      <div className={`arena-photo ${hit ? "hit" : ""} ${rug ? "rug" : ""} ${hurt ? "hurt" : ""}`}>
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
                <b className="ellipsis">{h.name}</b> <ItemArt id={h.weapon} size={18} /> <b className="dmg">−{h.damage}</b>{h.crit && <b className="crit-tag"> КРИТ</b>}
              </div>
            ))}
          </div>
        </div>
      </div>
      {fx}
    </div>
  );
}

function WeaponTray({ tray, onHit, onCooldown, onBuy, disabled, bonus }: { tray: Tray[]; onHit: (id: string) => void; onCooldown: (name: string, leftMs: number) => void; onBuy: () => void; disabled: boolean; bonus: number }) {
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
            <span className="w-dmg display">−{weaponDamage(w.weapon!.damage, bonus)}</span>
            {!perm && <span className="w-qty num">{qty}</span>}
            {cd > 0 && <span className="w-cd" style={{ ["--p" as string]: `${done * 360}deg` }} />}
          </button>
        );
      })}
    </div>
  );
}

/** weapon damage with the home bonus (equipment, rooms, computer), as the server counts it (without crits) */
const weaponDamage = (base: number, bonus: number) => Math.round(base * (1 + bonus));

export function BossScreen({ id }: { id: string }) {
  const boss = bossById(id);
  const { state, act, busy, refresh, toast } = useGame();
  const { data: list, load: loadList } = useBossList();
  const now = useNow();
  const [view, setView] = useState<FightView | null>(null);
  const [tray, setTray] = useState<Tray[]>([]);
  const [hits, setHits] = useState<Hit[]>([]);
  const [hitAnim, setHitAnim] = useState(false);
  const [rug, setRug] = useState(false);
  const [pendingDmg, setPendingDmg] = useState(0);
  const [phrase, setPhrase] = useState<{ text: string; id: number; crit?: boolean } | null>(null);
  const [talentPop, setTalentPop] = useState(0);
  const dmgBonus = state?.home.bonus.damage ?? 0;
  // the phrase bubble goes away by itself
  useEffect(() => {
    if (!phrase) return;
    const t = setTimeout(() => setPhrase(null), PHRASE_MS);
    return () => clearTimeout(t);
  }, [phrase]);
  const [tab, setTab] = useState<"top" | "mine" | null>(null);
  const [details, setDetails] = useState<{ top: { playerId: number; name: string; damage: number; wins: number }[]; myHits: { weapon: string; damage: number; phrase: number; at: number }[] } | null>(null);
  const lastSeq = useRef(0);
  const seen = useRef<Set<number>>(new Set());
  const fightId = state?.fight?.bossId === id ? state.fight.id : null;
  const me = state?.player.id;

  const onImpact = useCallback((f: Fx) => {
    setHitAnim(true);
    setTimeout(() => setHitAnim(false), 280);
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

  const attack = async (weapon: string) => {
    const w = weaponById(weapon)!;
    const est = weaponDamage(w.weapon.damage, dmgBonus);
    haptic.hit();
    // heavier weapons sound heavier: 10 dmg → 0, 500+ → 1
    sfx("hit", Math.min(1, Math.log10(Math.max(10, w.weapon.damage) / 10) / Math.log10(50)));
    play(weapon, est, w.weapon.action, true);
    setPendingDmg((d) => d + est);
    setTray((t) => t.map((x) => (x.id === weapon && w.weapon.kind === "consumable" ? { ...x, qty: Math.max(0, x.qty - 1) } : x)));
    try {
      const r = await api.action<{ damage: number; crit: boolean; phrase: string; hp: number; status: string; left: number | null; readyAt: number | null; fightDamage: number; talentsGained: number }>("attack", { weapon, idem: crypto.randomUUID() });
      setPhrase({ text: r.result.crit ? `КРИТ! −${r.result.damage} · ${r.result.phrase || w.weapon.action}` : r.result.phrase || w.weapon.action, id: Date.now(), crit: r.result.crit });
      if (r.result.crit) {
        haptic.heavy();
        sfx("crit");
      }
      setView((v) => (v ? { ...v, hp: Math.min(v.hp, r.result.hp), myDamage: v.myDamage + r.result.damage, myHits: v.myHits + 1 } : v));
      setTray((t) => t.map((x) => (x.id === weapon ? { ...x, qty: r.result.left ?? x.qty, readyAt: r.result.readyAt ?? x.readyAt } : x)));
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

  const start = async () => {
    const r = await act<{ fightId: number }>("fight_start", { boss: id }, `Бой с боссом ${boss?.name} начался! 8 часов`);
    if (r) void loadList();
  };
  const [fleeAsk, setFleeAsk] = useState(false);
  // a missing weapon opens the weapons shelf right here; closing it leaves you in the fight
  const [shopOpen, setShopOpen] = useState(false);
  const closeShop = () => {
    setShopOpen(false);
    api.get<{ weapons: Tray[] }>("/api/bosses").then((r) => setTray(r.weapons)).catch(() => undefined);
  };
  const [info, setInfo] = useState(false);
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
  // the fight takes the whole screen: garage + drifting sky behind, the boss in the middle, weapons at the bottom
  if (fightId) {
    return (
      <div className="fit-page fight-page" style={{ ["--acc" as string]: boss.theme.accent }}>
        <div className="fight-bg" aria-hidden="true">
          <DriftingSky className="fight-sky" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/arena/garage.webp" alt="" draggable={false} />
        </div>
        <div className="fight-head">
          <div className="grow" style={{ minWidth: 0 }}>
            <b className="display boss-name ellipsis">{boss.name}</b>
          </div>
          {view && <span className="chip red">бьют: {view.fightingNow}</span>}
          <BossRulesHelp topic="boss" />
        </div>
        <Arena full boss={boss} hp={hpShown} hpMax={hpMax} endsAt={state!.fight!.endsAt} fx={layer} hit={hitAnim} rug={rug} feed={hits} />
        <div className="fight-bottom">
          {phrase && <div key={phrase.id} className={`phrase-bubble ${phrase.crit ? "crit" : ""}`}>{phrase.text}</div>}
          <div className="row fight-bar">
            <TalentProgress dmg={view?.myDamage ?? state?.fight?.myDamage ?? 0} pop={talentPop} share={myShare} />
            {view && <ShareChip dmg={view.myDamage} hpMax={view.hpMax} />}
            <span className="grow" />
            <button className="btn sm dark" onClick={() => setTab("top")}>Топ</button>
            <button className="btn sm dark" onClick={() => setTab("mine")}>Мои</button>
            <button className={`btn sm ${fleeAsk ? "red" : "dark"}`} onClick={flee} disabled={busy === "fight_flee"}>{fleeAsk ? "Точно?" : "Сдаться"}</button>
          </div>
          <WeaponTray tray={tray} onHit={attack} onBuy={() => setShopOpen(true)} onCooldown={(name, left) => { haptic.err(); toast(`${name} перезаряжается: ещё ${clock(left)}`, "err"); }} bonus={dmgBonus} disabled={view?.status !== undefined && view.status !== "active"} />
        </div>
        {shopOpen && <WeaponShopWindow onClose={closeShop} />}
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
                    <b className="num" style={{ color: "var(--red)" }}>−{h.damage}</b>
                  </div>
                ))}
              </div>
            ) : <div className="muted small center">В этом бою ты ещё не бил.</div>}
          </Modal>
        )}
      </div>
    );
  }

  // before the fight: the same garage scene, the boss idles in the middle, rules and rewards in windows
  const locked = !!row && !row.unlocked;
  return (
    <div className="fit-page fight-page" style={{ ["--acc" as string]: boss.theme.accent }}>
      <div className="fight-bg" aria-hidden="true">
        <DriftingSky className="fight-sky" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/arena/garage.webp" alt="" draggable={false} />
      </div>
      <div className="fight-head">
        <div className="grow" style={{ minWidth: 0 }}>
          <b className="display boss-name ellipsis">{boss.name}</b>
          <div className="tiny muted ellipsis">{boss.title}</div>
        </div>
        {boss.final && <span className="chip gold">ФИНАЛ</span>}
        <BossRulesHelp topic="boss" />
      </div>
      <div className={`arena full prefight ${locked ? "locked" : ""}`}>
        <div className="arena-photo">
          {locked ? (
            <div className="arena-sil"><BossSilhouette accent={boss.theme.accent} /></div>
          ) : hasBossRig(boss.id) ? (
            <BossRig id={boss.id} />
          ) : boss.photo.full ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={boss.photo.full} alt={boss.name} draggable={false} />
          ) : (
            <div className="arena-sil"><BossSilhouette accent={boss.theme.accent} /><span className="small muted">фото скоро</span></div>
          )}
        </div>
      </div>
      <div className="prefight-hp"><Bar value={hpMax} max={hpMax} tone="red" height={22} label={`${full(hpMax)} HP`} /></div>
      <div className="fight-bottom prefight-panel">
        <div className="row small" style={{ justifyContent: "space-between", gap: 6 }}>
          <span className="chip gold"><Icon name="clock" size={14} />8 часов</span>
          <span className="chip" title="Победы сегодня">Победы {row?.fightsToday ?? 0}/{row?.fightsPerDay ?? 7}</span>
          <button className="btn sm dark" onClick={() => setInfo(true)}>Награды</button>
        </div>
        {locked ? (
          <div className="panel row small" style={{ gap: 8 }}>
            <Icon name="lock" size={30} />
            <span className="grow">Нужно карточек предыдущего босса: <b>{row!.keysNeed}</b>. У тебя {row!.keysHave}.</span>
          </div>
        ) : otherFight ? (
          <Link className="btn violet block" href={`/bosses/${otherFight.bossId}`}>Идёт бой с {bossById(otherFight.bossId)?.name} — к нему</Link>
        ) : (
          <button className="btn red big block" disabled={busy === "fight_start" || limitLeft <= 0} onClick={start}>
            {limitLeft <= 0 ? "Лимит побед на сегодня" : "В бой"}
          </button>
        )}
      </div>
      {info && (
        <Modal title={boss.name} onClose={() => setInfo(false)}>
          <div className="col" style={{ gap: 10 }}>
            <p className="boss-story" style={{ margin: 0 }}>{boss.story}</p>
            {boss.phases && <div className="small muted">Фазы: {boss.phases.map((p) => p.name).join(" → ")}</div>}
            <b className="small">Награда за победу</b>
            <BossRewardsPanel bossId={id} />
            {!boss.final && <div className="tiny muted row" style={{ gap: 6 }}><ItemArt id={`key-${boss.id}`} size={22} /> Твоих карточек: {row?.myKeys ?? 0}</div>}
            {invQty(state, "fist") === 0 && <p className="small muted">Кулак потерялся? Напиши организаторам.</p>}
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Damage of this fight towards the next talent (the counter burns when the fight ends). */
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

function TalentProgress({ dmg, pop, share }: { dmg: number; pop: number; share: number }) {
  const k = talentsForDamage(dmg);
  const from = k > 0 ? talentThreshold(k) : 0;
  const to = talentThreshold(k + 1);
  const p = Math.max(0, Math.min(1, (dmg - from) / (to - from)));
  return (
    <span key={pop} className={`chip talent-prog ${pop ? "talent-pop" : ""}`} title={`Урон в этом бою: ${full(dmg)} (${share.toFixed(1)}% HP). Следующий талант — на ${full(to)}`}>
      <i className="fill" style={{ width: `${p * 100}%` }} />
      <Icon name="talent" size={16} />
      <b className="num">{full(dmg)}</b><span className="muted">/{full(to)}</span>
    </span>
  );
}
