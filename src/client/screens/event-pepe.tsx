"use client";
/*
 * The event boss Пепе — a test fight for now: the room with the door (as with the other bosses), the door opens and
 * the fight takes the whole screen. No keys to enter, no rewards; everything is counted here on the phone: the weapons
 * are not spent, the HP is the event's own and starts over on every visit. The real event (the server fight, the rewards,
 * when it runs) comes later.
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useGame } from "../store.tsx";
import { WEAPONS } from "../../content/items.ts";
import { arenaOf } from "../../content/bosses.ts";
import { ItemArt } from "../art/items.tsx";
import { Bar } from "../ui.tsx";
import { useFx, type Fx } from "../fx/attack.tsx";
import { DriftingSky } from "../art/sky.tsx";
import { PepeRig } from "../art/pepe-rig.tsx";
import { weaponStats } from "../weapon-stats.ts";
import { full, short } from "../format.ts";
import { setMusicTrack, sfx, weaponSfx } from "../sound.ts";
import { haptic } from "../telegram.ts";

export const PEPE_EVENT = { name: "Пепе", title: "Ивент · пробный бой", hp: 250_000, accent: "#3ddc84" };
const BG = arenaOf("pepe");

export function PepeEventScreen() {
  const { state } = useGame();
  const [door, setDoor] = useState<"closed" | "open" | "enter">("closed");
  const [fighting, setFighting] = useState(false);
  const [hp, setHp] = useState(PEPE_EVENT.hp);
  const [hit, setHit] = useState(false);
  const [ouch, setOuch] = useState(false);
  const [phrase, setPhrase] = useState<{ text: string; id: number; crit: boolean } | null>(null);
  const ouchT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onImpact = useCallback((f: Fx) => {
    setHit(true);
    setTimeout(() => setHit(false), 280);
    setOuch(true);
    if (ouchT.current) clearTimeout(ouchT.current);
    ouchT.current = setTimeout(() => setOuch(false), 1300);
    setHp((h) => Math.max(0, h - f.damage));
  }, []);
  const { play, layer } = useFx(onImpact);
  useEffect(() => {
    if (!fighting) return;
    setMusicTrack("battle");
    return () => setMusicTrack("calm");
  }, [fighting]);
  useEffect(() => {
    if (!phrase) return;
    const t = setTimeout(() => setPhrase(null), 1800);
    return () => clearTimeout(t);
  }, [phrase]);
  const won = fighting && hp <= 0;
  useEffect(() => {
    if (!won) return;
    haptic.big();
    sfx("win");
  }, [won]);

  const openDoor = async () => {
    if (door !== "closed") return;
    setDoor("open");
    sfx("door");
    haptic.heavy();
    await new Promise((r) => setTimeout(r, 850));
    setDoor("enter");
    await new Promise((r) => setTimeout(r, 380));
    setHp(PEPE_EVENT.hp);
    setFighting(true);
  };
  const leave = () => { setFighting(false); setDoor("closed"); };
  const attack = (id: string) => {
    if (won) return;
    const st = weaponStats(state, id);
    const crit = Math.random() < st.critChance;
    const dmg = Math.round(st.damage * (crit ? st.crit : 1));
    haptic.hit();
    weaponSfx(id, Math.min(1, Math.log10(Math.max(10, st.base) / 10) / Math.log10(50)));
    if (crit) { haptic.heavy(); sfx("crit"); }
    play(id, dmg, "", true);
    setPhrase({ text: `${crit ? "КРИТ! " : ""}−${full(dmg)}`, id: Date.now(), crit });
  };

  // the event is on only while the admin has put Пепе in the game (admin panel «Ивенты»)
  if (state && !state.eventBosses?.includes("pepe")) {
    return (
      <div className="fit-page" style={{ display: "grid", placeItems: "center", padding: 24 }}>
        <div className="panel col center" style={{ gap: 10, maxWidth: 320 }}>
          <b className="display">Ивент сейчас не идёт</b>
          <span className="small muted">Пепе вернётся позже — следи за новостями.</span>
          <Link className="btn gold block" href="/">На главную</Link>
        </div>
      </div>
    );
  }
  if (fighting) {
    return (
      <div className="fit-page fight-page" style={{ ["--acc" as string]: PEPE_EVENT.accent }}>
        <div className="fight-bg" aria-hidden="true">
          <DriftingSky className="fight-sky" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={BG} alt="" draggable={false} />
        </div>
        <div className="fight-head">
          <div className="grow" style={{ minWidth: 0 }}><b className="display boss-name ellipsis">{PEPE_EVENT.name}</b></div>
          <span className="chip violet">ивент · тест</span>
        </div>
        <div className="arena full" style={{ ["--acc" as string]: PEPE_EVENT.accent }}>
          <div className={`arena-photo ${hit ? "hit" : ""} ${ouch ? "ouch" : ""}`}>
            <PepeRig className="boss-rig" sad={ouch} />
            <div className="arena-flash" />
          </div>
          <div className="arena-top">
            <Bar value={hp} max={PEPE_EVENT.hp} tone="red" height={24} label={`${full(hp)} / ${full(PEPE_EVENT.hp)}`} />
          </div>
          {layer}
          {won && (
            <div className="pepe-won">
              <b className="display">Пепе повержен!</b>
              <span className="small">Это пробный бой: наград пока нет.</span>
              <div className="row" style={{ gap: 8, justifyContent: "center" }}>
                <button className="btn gold" onClick={() => setHp(PEPE_EVENT.hp)}>Ещё раз</button>
                <button className="btn dark" onClick={leave}>Выйти</button>
              </div>
            </div>
          )}
        </div>
        <div className="fight-bottom">
          {phrase && <div key={phrase.id} className={`phrase-bubble side ${phrase.crit ? "crit" : ""}`}>{phrase.text}</div>}
          <div className="row fight-bar">
            <span className="tiny muted">Пробный бой: оружие не тратится, наград нет</span>
            <span className="grow" />
            <button className="btn sm dark" onClick={leave}>Выйти</button>
          </div>
          <div className="tray" style={{ gridTemplateColumns: `repeat(${WEAPONS.length}, minmax(0, 1fr))` }}>
            {WEAPONS.map((w) => (
              <button key={w.id} className={`weapon rar-${w.rarity}`} disabled={won} onClick={() => attack(w.id)} title={`${w.name}: ${w.weapon!.action}`}>
                <ItemArt id={w.id} size={40} />
                <span className="w-dmg display">−{short(weaponStats(state, w.id).damage)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // before the fight: the room with the door, Пепе waits behind it (seen through the window)
  return (
    <div className="fit-page door-page" style={{ ["--acc" as string]: PEPE_EVENT.accent }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="door-backdrop" src="/assets/door/room.webp" alt="" aria-hidden="true" draggable={false} />
      <div className={`door-scene ${door}`}>
        <div className="door-behind">
          <DriftingSky className="fight-sky" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="door-behind-bg" src={BG} alt="" draggable={false} />
          <div className="door-boss pepe-door-boss"><PepeRig view={[180, 150, 820, 1341]} /></div>
          <div className="door-light" />
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="door-room" src="/assets/door/room.webp" alt="" draggable={false} />
        <div className="door-pass"><span className="tiny">вход<br />свободный</span></div>
        <button className="door-leaf" onClick={openDoor} aria-label="Открыть дверь и начать пробный бой с Пепе" disabled={door !== "closed"}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/door/door.webp" alt="" draggable={false} />
          <span className="door-hit" />
          <b className="door-name display">{PEPE_EVENT.name}</b>
          <span className="door-title">ИВЕНТ</span>
          <span className="door-plate">
            <b className="door-plate-title">ПРОБНЫЙ БОЙ</b>
            <span className="tiny">без ключей и наград</span>
          </span>
        </button>
        {door === "closed" && <span className="door-hint">Нажми на дверь</span>}
        <div className="door-flash" />
      </div>
      <div className="fight-bottom prefight-panel">
        <div className="tiny muted center mode-hint">Ивент-босс Пепе: здоровье {full(PEPE_EVENT.hp)}. Пока это тест: вход свободный, оружие не тратится, наград нет.</div>
        <Link className="btn dark block" href="/">На главную</Link>
      </div>
    </div>
  );
}
