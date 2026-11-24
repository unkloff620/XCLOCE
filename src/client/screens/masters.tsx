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
import { DriftingSky } from "../art/sky.tsx";
import { yardTime } from "../../content/yard.ts";
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
      <div className="lp-sheet">
        <div className="lp-list col" style={{ gap: 10 }}>
        {MASTERS.map((m) => {
          const r = rows?.find((x) => x.id === m.id);
          const open = r ? r.open : m.n === 1;
          const prev = MASTERS[m.n - 2];
          // the artist's card: the master on the left, his name and motto; the best student in the clipped frame, his
            // nick, «Мастерство» and clan on the right; the whole card is the way in
            const body = (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="ms-face" src={`${A}/${m.id}.webp?v=2`} alt="" draggable={false} />
                <span className="ms-who">
                  <b className="ms-name display">{m.name}</b>
                  <span className="ms-motto">{open ? m.motto : <><Icon name="lock" size={12} /> после «{prev?.name}»</>}</span>
                </span>
                <span className="ms-best-ava">{r?.best ? <Avatar name={r.best.name} photo={r.best.photo} size={64} /> : <i className="lc-first">Стань<br />первым</i>}</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="ms-frame" src="/assets/ui/leader-frame.webp" alt="" draggable={false} />
                <span className="ms-best-t">
                  <b className="ellipsis">{r?.best ? (r.best.id === state?.player.id ? "Ты" : r.best.name) : "Лучший ученик"}</b>
                  {r?.best && <span className="num ms-bulb"><Icon name="mastery" size={14} />{full(r.best.mastery)}</span>}
                  {r?.best?.clan && <span className="ellipsis ms-clan">{r.best.clan}</span>}
                </span>
              </>
            );
            return open
              ? <Link key={m.id} href={`/masters/${m.id}`} className="ms-row" onClick={() => haptic.tap()}>{body}</Link>
              : <div key={m.id} className="ms-row locked">{body}</div>;
        })}
        </div>
      </div>
    </div>
  );
}

type StepRes = { masterId: string; energy: number; mastery: number; reward: Granted; part: string | null; done: boolean; finish: Granted | null; opened: string | null };

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
        {/* the room, the master and the table in front of him: one 2:3 stage, cut like a cover picture */}
        <div className="ms-stage">
          {/* the yard's sky behind his window (cut out by the artist), day or night like the yard */}
          <DriftingSky className="ms-sky" src={yardTime(now) === "night" ? "/assets/yard/sky-dark.webp" : undefined} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="ms-room-bg" src={`${A}/room.webp?v=3`} alt="" draggable={false} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="ms-room-master" src={`${A}/${m.id}.webp?v=2`} alt="" draggable={false} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="ms-room-table" src={`${A}/table.webp`} alt="" draggable={false} />
        </div>
        <div className="title-row rd-title ms-title">
          <Link href="/masters" className="back-btn" aria-label="К мастерам">‹</Link>
          <b>{m.name}</b>
        </div>
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
      <div className="ms-learn-col">
        {/* the master peeks in from the top left, his numbers beside him */}
        <div className="ms-top">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="ms-peek" src={`${A}/${m.id}.webp?v=2`} alt="" draggable={false} />
          <div className="ms-top-info">
            <Link href="/masters" className="back">← Мастера</Link>
            <b className="display">{m.name}</b>
            <span>Пройдено: <b className="num">{r.runs}</b></span>
            <span className="num ms-top-m"><Icon name="mastery" size={20} />{full(r.mastery)}</span>
          </div>
        </div>
        <div className="ms-board">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${A}/board.webp`} alt="" draggable={false} />
          <svg className="ms-path" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <polyline points={PATH.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#f2c230" strokeWidth={4} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </svg>
          {PATH.map((p, i) => (
            <span key={i} className={`ms-node ${i < point ? "done" : i === point ? "now" : ""}`} style={{ left: `${p.x}%`, top: `${p.y}%` }}>
              <ItemArt id={m.parts[i % m.parts.length]} size={40} />
              {i === point && <i className="ms-node-bar"><b style={{ width: `${(left / inPoint) * 100}%` }} /></i>}
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
            <span className="ms-m num"><Icon name="mastery" size={18} />{e}</span>
            <span className="ms-parts" title="Шанс 20% — одна из деталей мастера">{m.parts.map((p) => <ItemArt key={p} id={p} size={20} />)}</span>
          </div>
          <button type="button" className="btn gold ms-do" disabled={busy === "master_step"} onClick={() => { if (energy.energy < e) { toast(`Не хватает энергии: нужно ${e} ⚡`, "err"); return; } void step(); }}>
            Выполнить <span className="num"><Icon name="energy" size={16} />{e}</span>
          </button>
        </div>
      </div>
      {done && (
        <Modal title="Обучение пройдено!" onClose={() => setDone(null)}>
          <div className="lc-done">
            <span className="lc-done-h display">Награда</span>
            <div className="lc-done-box">
              {done.finish && <RewardChips r={{ ...done.finish, items: [] }} size={30} />}
              {done.finish?.items.filter((it) => it.qty > 0).map((it) => (
                <span key={it.id} className="chip ms-done-part" title={itemById(it.id)?.name}><ItemArt id={it.id} size={40} /><span className="num rc-n">×{it.qty}</span></span>
              ))}
            </div>
            {done.opened && <p className="center ms-done-open">Открыт мастер «{masterById(done.opened)?.name}»</p>}
            {done.opened
              ? <Link href={`/masters/${done.opened}`} className="btn gold lc-done-ok" onClick={() => setDone(null)}>К нему</Link>
              : <button type="button" className="btn gold lc-done-ok" onClick={() => setDone(null)}>Ок</button>}
          </div>
        </Modal>
      )}
    </div>
  );
}

/** the 7 points on the workbench, bottom to top (percent of its width and height) */
const PATH = [
  { x: 24, y: 85 }, { x: 66, y: 77 }, { x: 78, y: 56 }, { x: 36, y: 50 }, { x: 22, y: 29 }, { x: 58, y: 22 }, { x: 80, y: 12 },
];
export type { MasterDef };
