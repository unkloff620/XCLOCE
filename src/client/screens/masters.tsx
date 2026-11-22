"use client";
/*
 * «Мастера» (content/masters.ts, server/systems/masters.ts): the second tab of the locations. The list — each master on a
 * plank with his best student and «Учиться»; his page — first his workshop with his five parts on the table (bought one by
 * one, grey till bought), then the path of 7 points on his workbench, walked step by step for energy.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { usePageReady } from "../route-loader.tsx";
import { liveEnergy, useGame, useNow } from "../store.tsx";
import { api, type Granted } from "../api.ts";
import { MASTERS, MASTER_POINTS, masterById, partPrice, stepPay, energyOfStep, type MasterDef } from "../../content/masters.ts";
import { itemById } from "../../content/items.ts";
import { ItemArt } from "../art/items.tsx";
import { Icon } from "../art/icons.tsx";
import { Avatar, Modal, RewardChips } from "../ui.tsx";
import { full } from "../format.ts";
import { haptic } from "../telegram.ts";

const A = "/assets/masters";
interface MasterRow {
  id: string; open: boolean; bought: number; steps: number; runs: number; mastery: number; total: number; points: number[];
  best: { id: number; name: string; photo: string | null; clan: string | null; mastery: number } | null;
}

let last: MasterRow[] | null = null;
function useMasters() {
  const [rows, setRows] = useState<MasterRow[] | null>(last);
  const load = useCallback(async () => {
    try {
      const r = await api.get<{ masters: MasterRow[] }>("/api/masters");
      last = r.masters;
      setRows(r.masters);
    } catch { /* keep */ }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return { rows, load };
}

/** the tabs on the sheet's top edge (the same as the locations'): «Локации», «Мастера», one more later */
export function LocTabs({ on }: { on: "l" | "m" }) {
  const router = useRouter();
  const { toast } = useGame();
  return (
    <div className="lp-tabs2" role="tablist">
      {([["Локации", "l", "/locations"], ["Мастера", "m", "/masters"], ["Скоро", "r", null]] as const).map(([t, at, href]) => (
        <button key={at} type="button" role="tab" aria-selected={on === at} className={`lp-tab2 at-${at} ${on === at ? "on" : ""}`}
          onClick={() => { haptic.tap(); if (!href) toast("Скоро"); else if (on !== at) router.push(href); }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/assets/locations/page/tab-${at}.webp`} alt="" draggable={false} />
          <b className="display">{t}</b>
        </button>
      ))}
    </div>
  );
}

export function MastersScreen() {
  const { rows } = useMasters();
  usePageReady(!!rows);
  const { state } = useGame();
  return (
    <div className="loc-page paper locs-list">
      <div className="title">
        <Link href="/yard" className="back">← Двор</Link>
      </div>
      <LocTabs on="m" />
      <div className="lp-sheet col" style={{ gap: 10 }}>
        {MASTERS.map((m) => {
          const r = rows?.find((x) => x.id === m.id);
          const open = r ? r.open : m.n === 1;
          const prev = MASTERS[m.n - 2];
          return (
            <div key={m.id} className={`ms-row ${open ? "" : "locked"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="ms-face" src={`${A}/${m.id}.webp`} alt="" draggable={false} />
              <span className="ms-who">
                <b className="ms-name display">{m.name}</b>
                <span className="ms-motto">{m.motto}</span>
              </span>
              <span className="ms-best">
                <span className="ms-best-ava">{r?.best ? <Avatar name={r.best.name} photo={r.best.photo} size={44} /> : <i>?</i>}</span>
                <span className="ms-best-t">
                  <b>Лучший ученик</b>
                  <span className="ellipsis">{r?.best ? `${r.best.clan ? `${r.best.clan} | ` : ""}${r.best.id === state?.player.id ? "Ты" : r.best.name}` : "Стань первым"}</span>
                  {r?.best && <span className="num ms-bulb"><Icon name="mastery" size={14} />{full(r.best.mastery)}</span>}
                </span>
              </span>
              {open
                ? <Link href={`/masters/${m.id}`} className="btn gold sm ms-go" onClick={() => haptic.tap()}>Учиться</Link>
                : <span className="ms-lock"><Icon name="lock" size={18} /><span>после «{prev?.name}»</span></span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

type StepRes = { masterId: string; energy: number; mastery: number; reward: Granted; part: string | null; done: boolean; opened: string | null };

export function MasterScreen({ id }: { id: string }) {
  const m = masterById(id);
  const { rows, load } = useMasters();
  usePageReady(!!rows);
  const { state, act, busy, toast } = useGame();
  const now = useNow();
  const [learning, setLearning] = useState(false);
  const [drop, setDrop] = useState<{ id: string; k: number } | null>(null);
  const [done, setDone] = useState<StepRes | null>(null);
  if (!m || !state) return null;
  const r = rows?.find((x) => x.id === m.id);
  const allBought = (r?.bought ?? 0) === 0b11111;
  const buy = async (slot: number) => {
    if (!r?.open || (r.bought & (1 << slot))) return;
    const res = await act("master_buy", { master: m.id, slot });
    if (res) { haptic.ok(); void load(); }
  };
  const step = async () => {
    const res = await act<StepRes>("master_step", { master: m.id });
    if (!res) return;
    haptic.tap();
    if (res.part) { setDrop({ id: res.part, k: Date.now() }); haptic.ok(); }
    if (res.done) setDone(res);
    void load();
  };
  if (!r) return <div className="loc-page paper" />;
  if (!r.open) {
    return (
      <div className="loc-page paper">
        <div className="title"><Link href="/masters" className="back">← Мастера</Link></div>
        <p className="center muted">Сначала пройди обучение у мастера «{MASTERS[m.n - 2]?.name}».</p>
      </div>
    );
  }
  // his workshop: the five parts on the table, bought one by one; all bought — «Пройти обучение»
  if (!allBought || (!learning && r.steps === 0 && r.runs === 0)) {
    return (
      <div className="fit-page ms-room">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="ms-room-bg" src={`${A}/room.webp`} alt="" draggable={false} />
        <div className="title-row rd-title ms-title">
          <Link href="/masters" className="back-btn" aria-label="К мастерам">‹</Link>
          <b>{m.name}</b>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="ms-room-master" src={`${A}/${m.id}.webp`} alt="" draggable={false} />
        <span className="ms-cloud">{allBought ? "Ну что, учимся?" : "Начать обучение?"}</span>
        <div className="ms-table">
          {m.parts.map((p, i) => {
            const have = !!(r.bought & (1 << i));
            const price = partPrice(m, i);
            return (
              <button key={p} type="button" className={`ms-part ${have ? "have" : ""}`} disabled={have || busy === "master_buy"} onClick={() => void buy(i)}
                title={itemById(p)?.name}>
                <ItemArt id={p} size={52} />
                <span className="ms-price num">{have ? "куплено" : <><Icon name={price.cur} size={14} />{full(price.amount)}</>}</span>
              </button>
            );
          })}
        </div>
        <div className="ms-room-foot">
          {allBought
            ? <button type="button" className="btn gold big" onClick={() => { haptic.tap(); setLearning(true); }}>Пройти обучение</button>
            : <span className="ms-hint">Купи у мастера его детали</span>}
        </div>
      </div>
    );
  }
  // the path of 7 points on his workbench
  let left = r.steps, point = 0;
  while (point < MASTER_POINTS - 1 && left >= r.points[point]) { left -= r.points[point]; point++; }
  const inPoint = r.points[point];
  const e = energyOfStep(m, r.steps);
  const pay = stepPay(e);
  const energy = liveEnergy(state, now);
  return (
    <div className="loc-page paper ms-learn">
      <div className="title">
        <Link href="/masters" className="back">← Мастера</Link>
      </div>
      <div className="ms-head">
        <b className="display">{m.name}</b>
        <span>Пройдено: <b className="num">{r.runs}</b></span>
        <span className="num"><Icon name="mastery" size={18} />{full(r.mastery)}</span>
      </div>
      <div className="ms-board">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${A}/board.webp`} alt="" draggable={false} />
        <svg className="ms-path" viewBox="0 0 100 66" preserveAspectRatio="none" aria-hidden="true">
          <polyline points={PATH.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#f2c230" strokeWidth={0.9} strokeLinejoin="round" />
        </svg>
        {PATH.map((p, i) => (
          <span key={i} className={`ms-node ${i < point ? "done" : i === point ? "now" : ""}`} style={{ left: `${p.x}%`, top: `${(p.y / 66) * 100}%` }}>
            {i === point
              ? <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${A}/${m.id}.webp`} alt="" draggable={false} />
                <i className="ms-node-bar"><b style={{ width: `${(left / inPoint) * 100}%` }} /></i>
              </>
              : i < point ? <Icon name="mastery" size={22} /> : null}
          </span>
        ))}
        {drop && <span key={drop.k} className="ms-drop"><ItemArt id={drop.id} size={56} /></span>}
      </div>
      <div className="ms-steps">
        {Array.from({ length: inPoint }, (_, i) => <i key={i} className={i < left ? "on" : ""} />)}
      </div>
      <div className="ms-bottom">
        <div className="ms-reward">
          <span className="ms-reward-h">Награда</span>
          <RewardChips r={{ currencies: { PAP: pay.pap }, xp: pay.xp }} size={16} />
          <span className="chip"><Icon name="mastery" size={16} />{e}</span>
          <span className="ms-parts" title="Шанс 20% — одна из деталей мастера">{m.parts.map((p) => <ItemArt key={p} id={p} size={20} />)}</span>
        </div>
        <button type="button" className="btn gold big ms-do" disabled={busy === "master_step"} onClick={() => { if (energy.energy < e) { toast(`Не хватает энергии: нужно ${e} ⚡`, "err"); return; } void step(); }}>
          Выполнить <span className="num"><Icon name="energy" size={18} />{e}</span>
        </button>
      </div>
      {done && (
        <Modal title="Обучение пройдено" onClose={() => setDone(null)}>
          <div className="col center" style={{ gap: 10 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${A}/${m.id}.webp`} alt="" style={{ width: 140 }} draggable={false} />
            <p className="center">{m.name} научил всему, что знал. Можно пройти обучение ещё раз — детали так и падают.</p>
            {done.opened && <p className="center"><b>Открыт мастер «{masterById(done.opened)?.name}»</b></p>}
            {done.opened && <Link href={`/masters/${done.opened}`} className="btn gold" onClick={() => setDone(null)}>К нему</Link>}
          </div>
        </Modal>
      )}
    </div>
  );
}

/** the 7 points on the workbench (percent of its width; y in a 100×66 box) */
const PATH = [
  { x: 14, y: 50 }, { x: 26, y: 26 }, { x: 42, y: 30 }, { x: 42, y: 50 }, { x: 62, y: 50 }, { x: 70, y: 22 }, { x: 86, y: 40 },
];
export type { MasterDef };
