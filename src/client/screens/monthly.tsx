"use client";
import Link from "next/link";
import { useState } from "react";
import { useGame, useNow } from "../store.tsx";
import { Modal, RewardChips } from "../ui.tsx";
import { Icon } from "../art/icons.tsx";
import { ItemArt } from "../art/items.tsx";
import { clock } from "../format.ts";
import { haptic } from "../telegram.ts";
import { CASE_POINTS, MONTHLY_CHEST, MONTHLY_TATTOO_SET, MONTHLY_TIERS, monthTaskOf } from "../../content/monthly.ts";
import type { Granted } from "../api.ts";

/*
 * «От звонка до звонка»: the month's calendar (a «делюга» a day, the same for all), today's task under it,
 * and the rewards for the closed days on the planks.
 */

const DOW = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"];
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const MONTHS_NOM = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const fmt = (v: number) => v.toLocaleString("ru-RU");

/** a reward's picture on its plank: one big icon and «×N» */
function TierArt({ id }: { id: string }) {
  const one = (art: React.ReactNode, n: string) => <span className="mt-art">{art}<b className="num">×{n}</b></span>;
  switch (id) {
    case "t2": return one(<Icon name="USD" size={40} />, "30");
    case "t5": return one(<ItemArt id="energy-full" size={44} />, "2");
    case "t10": return one(<ItemArt id="gpu" size={44} />, "40");
    case "t20": return one(<Icon name="case" size={44} />, "4");
    default: return one(<Icon name="chest" size={46} />, "1");
  }
}

/** what the chest holds, the ranges in words */
function ChestInside() {
  const c = MONTHLY_CHEST;
  const r = (x: readonly [number, number]) => `${fmt(x[0])}–${fmt(x[1])}`;
  return (
    <div className="mt-chest-in tiny">
      <span><Icon name="USD" size={16} />{r(c.USD)}</span>
      <span><Icon name="RUB" size={16} />{r(c.RUB)}</span>
      <span><Icon name="SOL" size={16} />{r(c.SOL)}</span>
      <span><Icon name="xp" size={16} />{r(c.xp)}</span>
      <span><Icon name="case" size={16} />{r(c.cases)}</span>
      <span><ItemArt id="rug-pull-gun" size={16} />{r(c.rugPull)}</span>
      <span><Icon name="parts" size={16} />{r(c.parts)}</span>
      <span><ItemArt id="stash-cigs" size={16} />{r(c.stashes)}</span>
      <span>{MONTHLY_TATTOO_SET ? "+ наколка из сета месяца" : "+ наколка из нового сета (скоро)"}</span>
    </div>
  );
}

/** a granted reward: the cases (achievement points) shown as cases */
function Got({ g }: { g: Granted }) {
  const cases = Math.round((g.achPoints ?? 0) / CASE_POINTS);
  return (
    <span className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      <RewardChips r={{ ...g, achPoints: undefined }} size={14} />
      {cases > 0 && <span className="mt-case-chip"><Icon name="case" size={22} /><b className="num">×{cases}</b></span>}
      <span className="tiny muted">Кейсы ждут в магазине — «Ящик ништяков»</span>
    </span>
  );
}

export function MonthlyWindow({ onClose }: { onClose: () => void }) {
  const { state, act, busy } = useGame();
  const now = useNow();
  const m = state?.monthly;
  const [pick, setPick] = useState<number | null>(null);
  const [opened, setOpened] = useState<Granted | null>(null);
  if (!m) return null;
  const sel = pick ?? m.today;
  const task = monthTaskOf(sel);
  const st = m.closed[sel];
  const monthName = MONTHS[Number(m.month.slice(5, 7)) - 1];

  // the grid: the tail of the last month, this month, the head of the next (full weeks)
  const [y, mo] = [Number(m.month.slice(0, 4)), Number(m.month.slice(5, 7))];
  const prevDays = new Date(Date.UTC(y, mo - 1, 0)).getUTCDate();
  const cells: { d: number; mine: boolean }[] = [];
  for (let i = m.firstDow; i > 0; i--) cells.push({ d: prevDays - i + 1, mine: false });
  for (let d = 1; d <= m.days; d++) cells.push({ d, mine: true });
  for (let d = 1; cells.length % 7; d++) cells.push({ d, mine: false });

  const buy = async (d: number) => {
    if (!confirm(`Выкупить ${d} ${monthName} за ${m.skipPrice} SOL?`)) return;
    if (await act("month_buy", { day: d }, `День ${d} закрыт`)) haptic.ok();
  };
  const claim = async (id: string) => {
    const r = await act<{ reward: Granted; chest: boolean }>("month_claim", { id });
    if (!r) return;
    if (r.chest) { haptic.big(); setOpened(r.reward); } else haptic.ok();
  };

  return (
    <Modal title="От звонка до звонка" onClose={onClose} className="mt-modal" head={
      <div className="small muted row" style={{ justifyContent: "space-between" }}>
        <span>Делюги выполнено <b className="num">{m.closedN}/{m.days}</b></span>
        <span className="row num" style={{ gap: 4, whiteSpace: "nowrap" }}><Icon name="clock" size={14} />{clock(m.resetAt - now)}</span>
      </div>}>
      <div className="mt-wrap">
        <div className="mt-cal">
          <div className="mt-cal-h display">{MONTHS_NOM[mo - 1]} {y}</div>
          <div className="mt-grid">
            {DOW.map((x) => <span key={x} className="mt-dow">{x}</span>)}
            {cells.map((c, i) => {
              if (!c.mine) return <span key={i} className="mt-day other num">{c.d}</span>;
              const s = m.closed[c.d];
              const cls = [s ? `closed ${s}` : "", c.d === m.today ? "today" : "", c.d < m.today && !s ? "missed" : "", c.d === sel ? "sel" : ""].join(" ");
              return (
                <button key={i} className={`mt-day num ${cls}`} onClick={() => setPick(c.d)} aria-label={`${c.d} ${monthName}`}>
                  {c.d}
                  {s && <i className="mt-check" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-task">
          <div className="mt-ribbon display">{sel === m.today ? "Делюга дня" : `Делюга ${sel} ${monthName}`}</div>
          {!task ? null : st ? (
            <div className="mt-task-body">
              <b>{task.title}</b>
              <span className="mt-ok">{st === "bought" ? "Выкуплено. День закрыт." : sel === m.today ? "Чётко исполнил! Готовься к новым делюгам!" : "Исполнено. День закрыт."}</span>
            </div>
          ) : sel === m.today ? (
            <div className="mt-task-body">
              <b>{task.title}</b>
              <div className="quest-bar" style={{ ["--p" as string]: `${Math.round((m.progress / task.target) * 100)}%` }}><i /><span className="num">{fmt(m.progress)}/{fmt(task.target)}</span></div>
              {task.hint && <span className="tiny muted">{task.hint}</span>}
              {task.href && <Link href={task.href} className="btn dark sm" onClick={onClose}>Идти</Link>}
            </div>
          ) : sel < m.today ? (
            <div className="mt-task-body">
              <b className="mt-strike">{task.title}</b>
              <span className="tiny muted">День пропущен. Его можно выкупить — он засчитается в награды.</span>
              <button className="btn gold sm" disabled={busy === "month_buy"} onClick={() => buy(sel)}>
                Выкупить за <Icon name="SOL" size={16} /><b className="num">{m.skipPrice}</b>
              </button>
            </div>
          ) : (
            <div className="mt-task-body">
              <b>{task.title}</b>
              <span className="tiny muted">Откроется {sel} {monthName}</span>
            </div>
          )}
        </div>

        <div className="mt-rewards">
          <div className="mt-sign display">Награда</div>
          {m.tiers.map((t) => {
            const def = MONTHLY_TIERS.find((x) => x.id === t.id);
            const chest = !!def?.chest;
            return (
              <div key={t.id} className={`mt-plank ${t.got ? "got" : t.ready ? "ready" : ""} ${chest ? "chest" : ""}`}>
                <div className="mt-plank-row">
                  <TierArt id={t.id} />
                  {t.got ? <i className="mt-check big" aria-label="получено" />
                    : t.ready ? <button className="btn gold sm" disabled={busy === "month_claim"} onClick={() => claim(t.id)}>{chest ? "Открыть" : "Забрать"}</button>
                    : <span className="mt-need">Выполни<br /><b className="num">{t.need}</b> делюг{t.need === 2 ? "и" : ""}</span>}
                </div>
                {chest && !t.got && <ChestInside />}
                {chest && (opened ?? t.got) && <Got g={(opened ?? t.got)!} />}
              </div>
            );
          })}
          <p className="tiny muted" style={{ margin: 0 }}>Награды месяца забирай до конца месяца — 1-го числа всё начинается заново.</p>
        </div>
      </div>
    </Modal>
  );
}
