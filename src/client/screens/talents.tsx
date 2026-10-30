"use client";
/*
 * The talent window: talents are earned by boss damage of all time and spent along one path (content/talents.ts
 * TALENT_PATH), drawn like a location's tasks — stops one after another down a winding road, the next opens when the
 * one before is full; a tap on the glowing stop puts one talent in. The card under the road tells what the stop gives.
 * On top: the talent counter and the reset (all spent talents come back) for 5 USD.
 */
import { useEffect, useRef, useState } from "react";
import { useGame } from "../store.tsx";
import { Modal } from "../ui.tsx";
import { Icon } from "../art/icons.tsx";
import { Help } from "../help.tsx";
import { haptic } from "../telegram.ts";
import { full, short } from "../format.ts";
import { itemById } from "../../content/items.ts";
import { weaponStats } from "../weapon-stats.ts";
import {
  CRIT_CHANCE_CAP, EXTRA_NAMES, TALENT_BLOCKS, TALENT_PATH, TALENT_RESET_PRICE, autoTalentsOpen, currentStop, stopClosed, stopLevel, stopOpen, talentArt, talentThreshold, talentsForDamage, talentsSpent,
  type TalentBlock, type TalentStop,
} from "../../content/talents.ts";

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
const effect = (n: TalentStop, lv: number) =>
  n.kind === "dmg" ? `+${full(lv * n.per)} урона` : n.kind === "crit" ? `+${pct(lv * n.per)} к силе крита` : n.kind === "chance" ? `+${pct(lv * n.per)} к шансу крита`
    : n.kind === "biceps" ? `+${full(lv * n.per)} к бицухе` : n.kind === "energy" ? `+${full(lv * n.per)} к лимиту энергии` : `+${full(lv * n.per)} мин к бою с боссом`;

export function TalentChip({ n }: { n: number }) {
  return (
    <span className="chip talent-chip" title="Таланты">
      <Icon name="talent" size={18} /> <b className="num">{n}</b>
    </span>
  );
}

/** progress of the all-time damage towards the next talent */
export function TalentNext({ dmg }: { dmg: number }) {
  const k = talentsForDamage(dmg);
  const from = talentThreshold(k);
  const to = talentThreshold(k + 1);
  const p = Math.max(0, Math.min(1, (dmg - from) / Math.max(1, to - from)));
  return (
    <div className="tal-next">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="tiny muted">Следующий талант ({k + 1}-й)</span>
        <span className="tiny muted">получено всего: <b className="num" style={{ color: "var(--ink)" }}>{k}</b></span>
      </div>
      <div className="ach-bar" style={{ ["--p" as string]: `${p * 100}%` }}>
        <i /><span className="num">{full(Math.max(0, dmg - from))} / {full(to - from)} урона</span>
      </div>
    </div>
  );
}

function TalentHelp() {
  const total = TALENT_PATH.reduce((n, x) => n + x.max * x.cost, 0);
  return (
    <Help topic="talents" title="Таланты">
      <p>Таланты дают за урон по боссам за всё время: счётчик не сгорает — каждый бой продолжает его с того места, где остановился прошлый.</p>
      <p className="small">1-й талант — за {full(talentThreshold(1))} урона, 10-й — за {full(talentThreshold(10))}, 50-й — за {full(talentThreshold(50))}, 100-й — за {full(talentThreshold(100))}.</p>
      <p>Таланты вкладываются блоками сверху вниз: следующий блок открывается, когда закрыт весь предыдущий. Внутри блока ячейка открывается, когда закрыта та, от которой к ней идёт стрелка; верхние ячейки — в любом порядке.</p>
      <p className="small">Когда закрыты «Специализация в оружии» и «Основа», открывается тумблер «Автопрокачка»: новые таланты сами идут в следующую ячейку (бицуха — только до 10).</p>
      <ol className="small">
        {TALENT_BLOCKS.map((b) => <li key={b.id}><b>{b.title}</b></li>)}
      </ol>
      <p className="small">Сначала — три главных оружия: клавиатура, видеокарта и Rug Pull Gun. Потом понемногу всё остальное: бицуха, энергия, время боя, кулак, свеча и мышь.</p>
      <p className="small">Бицуха — до +170 (в «Основе» хватит 10, дальше — по желанию), лимит энергии — до +50, Часы — до +45 минут к бою с боссом, Крит — до +15% шанса крита каждому оружию. Общий шанс крита — не больше {Math.round(CRIT_CHANCE_CAP * 100)}%.</p>
      <p className="small">Вся дорожка — {full(total)} талантов.</p>
      <p className="small muted">Сброс талантов стоит {TALENT_RESET_PRICE.amount} {TALENT_RESET_PRICE.currency}: все потраченные таланты возвращаются.</p>
    </Help>
  );
}

/** the picture of a stop (public/assets/talents): a meme scene with the weapon, or the biceps / energy / clock */
function StopArt({ n, size }: { n: TalentStop; size: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="tb-art" src={`/assets/talents/${talentArt(n)}.webp`} alt="" width={size} height={size} draggable={false} />;
}
const stopTitle = (n: TalentStop) => (EXTRA_NAMES[n.target] ? n.name : `${itemById(n.target)?.name ?? n.target} · ${n.name}`);

export function TalentWindow({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Таланты" onClose={onClose} wide>
      <TalentPanel />
    </Modal>
  );
}

/** the talent path itself: in its own window, or in the «Таланты» tab of the dossier */
export function TalentPanel() {
  const { state, act, busy } = useGame();
  const [confirm, setConfirm] = useState(false);
  const [pick, setPick] = useState<number | null>(null);
  const roadRef = useRef<HTMLDivElement>(null);
  const cur = currentStop(state?.weaponTalents ?? {});
  // open on the stop being filled now
  useEffect(() => {
    const el = roadRef.current?.querySelector(".tb-tile.now");
    el?.scrollIntoView({ block: "center" });
  }, [state ? 1 : 0]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!state) return null;
  const talents = state.player.talents ?? 0;
  const wt = state.weaponTalents ?? {};
  const spent = talentsSpent(wt);
  const usd = state.wallet[TALENT_RESET_PRICE.currency] ?? 0;
  const selI = pick ?? Math.min(cur, TALENT_PATH.length - 1);
  const sel = TALENT_PATH[selI];
  const selLv = stopLevel(wt, sel);
  const selOpen = stopOpen(wt, sel);
  const autoOpen = autoTalentsOpen(wt);
  const auto = !!state.player.talentAuto;
  const toggleAuto = async () => {
    haptic.tap();
    await act<{ on: boolean; spent: number }>("talent_auto", { on: !auto }, (x) => (x.on ? `Автопрокачка включена${x.spent ? ` · вложено ${x.spent}` : ""}` : "Автопрокачка выключена"));
  };
  const up = async (n: TalentStop) => {
    const r = await act<{ level: number; max: number }>("talent_up", { weapon: n.target, branch: n.branch }, (x) => `${stopTitle(n)} — ${x.level}/${x.max}`);
    if (r) haptic.ok();
  };
  // a tap on an open stop puts a talent in (any open one: the tops of the columns go in any order); on a shut one — what it needs
  const tap = (i: number) => {
    haptic.tap();
    const n = TALENT_PATH[i];
    setPick(i);
    if (stopOpen(wt, n) && stopLevel(wt, n) < n.max && talents >= n.cost && busy !== "talent_up") void up(n);
  };
  const reset = async () => {
    const r = await act<{ returned: number }>("talent_reset", {}, (x) => `Таланты сброшены: вернулось ${x.returned}`);
    setConfirm(false);
    setPick(null);
    if (r) haptic.ok();
  };
  const k = talentsForDamage(state.player.talentDamage ?? 0);
  const from = talentThreshold(k), to = talentThreshold(k + 1);
  const dmgNow = state.player.talentDamage ?? 0;
  const nextP = Math.max(0, Math.min(1, (dmgNow - from) / Math.max(1, to - from)));
  return (
    <div className="tp-panel">
      {/* two lines that stay in place: the counters with the reset, and what the next tap does */}
      <div className="tp-head">
        <div className="tp-row1">
          <span className="tp-next" title={`До ${k + 1}-го таланта`}>
            <span className="tp-next-bar"><i style={{ width: `${nextP * 100}%` }} /></span>
            <small className="num">{short(Math.max(0, to - dmgNow))} урона</small>
          </span>
          <span className="tp-cnt" title="Получено талантов за всё время"><Icon name="talent" size={16} /><b className="num">{k}</b></span>
          <span className="tp-cnt free" title="Не вложено"><small>свободно</small><b className="num">{talents}</b></span>
          <button className="btn red sm tp-reset" disabled={spent === 0} onClick={() => setConfirm(true)} aria-label={`Сбросить таланты за ${TALENT_RESET_PRICE.amount} ${TALENT_RESET_PRICE.currency}`}>
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <Icon name="USD" size={13} /><b className="num">{TALENT_RESET_PRICE.amount}</b>
          </button>
          <TalentHelp />
        </div>
        {autoOpen && (
          <label className="tp-auto">
            <span>Автопрокачка<small>свободные таланты сами идут в следующую ячейку</small></span>
            <button type="button" role="switch" aria-checked={auto} className={`upd-toggle ${auto ? "on" : ""}`} disabled={busy === "talent_auto"} onClick={toggleAuto}><i /></button>
          </label>
        )}
        <div className="tp-row2">
          <span className="tp-row2-pic"><StopArt n={sel} size={28} /></span>
          <span className="grow tp-row2-t">
            <b>{stopTitle(sel)} · {selLv}/{sel.max}</b>
            <small>
              {selLv >= sel.max ? `Готово: ${effect(sel, selLv)}`
                : !selOpen ? "Откроется, когда закроешь блок выше и ячейку, от которой идёт стрелка"
                : <>{stopClosed(wt, sel) && sel.need < sel.max ? `Можно идти дальше (нужно было ${sel.need}). ` : sel.need < sel.max ? `Для следующей ячейки хватит ${sel.need}. ` : ""}Нажми: {effect(sel, 1)} · стоит <Icon name="talent" size={11} />{sel.cost}{selLv > 0 ? ` · сейчас ${effect(sel, selLv)}` : ""}</>}
            </small>
          </span>
          {selOpen && selLv < sel.max && (
            <button className="btn gold sm tp-go" disabled={talents < sel.cost || busy === "talent_up"} onClick={() => up(sel)}>+1</button>
          )}
        </div>
      </div>
      {confirm && (
        <Modal title="Сброс талантов" onClose={() => setConfirm(false)}>
          <div className="col" style={{ gap: 10, textAlign: "center" }}>
            <span className="small">Сбросить все таланты за <b>{TALENT_RESET_PRICE.amount} USD</b>? Вернётся <b className="num">{spent}</b>, их можно вложить заново.</span>
            {usd < TALENT_RESET_PRICE.amount && <span className="small" style={{ color: "var(--red)" }}>Не хватает USD.</span>}
            <div className="row" style={{ gap: 8 }}>
              <button className="btn dark grow" onClick={() => setConfirm(false)}>Нет</button>
              <button className="btn red grow" disabled={busy === "talent_reset" || usd < TALENT_RESET_PRICE.amount} onClick={reset}>Сбросить</button>
            </div>
          </div>
        </Modal>
      )}

      <div className="tp-road tb-road" ref={roadRef}>
        {TALENT_BLOCKS.map((b, bi) => (
          <div key={b.id} className="tb-wrap">
            {bi > 0 && <i className="tb-down" aria-hidden="true" />}
            <TalentBlockView b={b} wt={wt} cur={cur} selI={selI} poor={talents} onTap={tap} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** one block of the path: the title, the stops in their grid with arrows from one to the next, the hero on the right */
function TalentBlockView({ b, wt, cur, selI, poor, onTap }: { b: TalentBlock; wt: Record<string, Partial<Record<string, number>>>; cur: number; selI: number; poor: number; onTap: (i: number) => void }) {
  const cols = Math.max(...b.cells.map((c) => c.col)) + 1;
  const rowsN = Math.max(...b.cells.map((c) => c.row)) + 1;
  const done = b.cells.every((c) => { const n = TALENT_PATH.find((x) => x.key === c.key)!; return stopLevel(wt, n) >= n.max; });
  return (
    <section className={`tb-block skin-${b.skin} ${b.hero ? "has-hero" : ""} ${done ? "full" : ""}`}>
      <h4 className="tb-title display">{b.title}</h4>
      <div className="tb-grid" style={{ ["--cols" as string]: cols, ["--rows" as string]: rowsN }}>
        {b.cells.map((c, k) => {
          const next = b.cells[k + 1];
          // an arrow to the next stop when it is the neighbour (down, right or left)
          const dir = !next ? null : next.col === c.col && next.row === c.row + 1 ? "down" : next.row === c.row && next.col === c.col + 1 ? "right" : next.row === c.row && next.col === c.col - 1 ? "left" : null;
          return dir && <i key={`a${k}`} className={`tb-arrow ${dir}`} style={{ ["--c" as string]: c.col, ["--r" as string]: c.row }} aria-hidden="true" />;
        })}
        {b.cells.map((c) => {
          const i = TALENT_PATH.findIndex((x) => x.key === c.key);
          const n = TALENT_PATH[i];
          const lv = stopLevel(wt, n);
          const open = stopOpen(wt, n);
          const cls = lv >= n.max ? "done" : open && stopClosed(wt, n) ? "more" : open ? "open" : lv > 0 ? "part" : "shut";
          return (
            <button key={c.key} type="button" className={`tb-tile ${cls} ${i === cur ? "now" : ""} ${i === selI ? "sel" : ""} ${i === cur && poor < n.cost ? "tired" : ""}`}
              style={{ ["--c" as string]: c.col, ["--r" as string]: c.row }} onClick={() => onTap(i)} aria-label={`${stopTitle(n)}: ${lv}/${n.max}`} title={stopTitle(n)}>
              <StopArt n={n} size={64} />
              {cls === "shut" && <i className="tb-lock"><Icon name="lock" size={14} /></i>}
              <i className="tb-n num">{lv}/{n.max}</i>
              {n.need < n.max && lv < n.need && <i className="tb-need num">до {n.need}</i>}
            </button>
          );
        })}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {b.hero && <img className="tb-hero" src={`/assets/talents/${b.hero}.webp`} alt="" draggable={false} />}
    </section>
  );
}
