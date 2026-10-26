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
import { ItemArt } from "../art/items.tsx";
import { Help } from "../help.tsx";
import { haptic } from "../telegram.ts";
import { full, short } from "../format.ts";
import { itemById } from "../../content/items.ts";
import { weaponStats } from "../weapon-stats.ts";
import { BicepsArt } from "./profile.tsx";
import {
  CRIT_CHANCE_CAP, EXTRA_NAMES, TALENT_PATH, TALENT_RESET_PRICE, currentStop, stopLevel, talentThreshold, talentsForDamage, talentsSpent,
  type TalentStop,
} from "../../content/talents.ts";

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
const effect = (n: TalentStop, lv: number) =>
  n.kind === "dmg" ? `+${full(lv * n.per)} урона` : n.kind === "crit" ? `+${pct(lv * n.per)} к силе крита` : n.kind === "chance" ? `+${pct(lv * n.per)} к шансу крита`
    : n.kind === "biceps" ? `+${full(lv * n.per)} к бицухе` : n.kind === "energy" ? `+${full(lv * n.per)} к лимиту энергии` : `+${full(lv * n.per)} мин к бою с боссом`;
const KIND_TAG: Record<TalentStop["kind"], string> = { dmg: "⚔", crit: "✦", chance: "%", biceps: "", energy: "", clock: "" };

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
      <p>Таланты вкладываются по дорожке, как задания в локации: следующая остановка открывается, когда предыдущая прокачана до конца. Так прокачивается всё понемногу:</p>
      <ol className="small">
        <li><b>Начало</b> — Бицуха, Лимит энергии, Часы.</li>
        <li><b>Урон</b> у каждого оружия, потом <b>Крит</b> (шанс), потом <b>Сила крита</b>.</li>
        <li><b>Середина</b> — ещё Бицуха, Энергия, Часы и Крит II, потом <b>Урон II</b>.</li>
        <li><b>Конец</b> — Бицуха, Энергия, Часы, Крит III и <b>Сила крита II</b>; последняя — у Rug Pull Gun.</li>
      </ol>
      <p className="small">Бицуха — до +100, лимит энергии — до +50, Часы — до +45 минут к бою с боссом, Крит — до +15% шанса крита каждому оружию. Общий шанс крита — не больше {Math.round(CRIT_CHANCE_CAP * 100)}%.</p>
      <p className="small">Вся дорожка — {full(total)} талантов.</p>
      <p className="small muted">Сброс талантов стоит {TALENT_RESET_PRICE.amount} {TALENT_RESET_PRICE.currency}: все потраченные таланты возвращаются.</p>
    </Help>
  );
}

/** the picture of a stop: the weapon, or the biceps / energy can / clock */
function StopArt({ n, size }: { n: TalentStop; size: number }) {
  if (n.kind === "biceps") return <BicepsArt size={size} />;
  if (n.kind === "energy") return <Icon name="energy" size={size} />;
  if (n.kind === "clock") return <Icon name="clock" size={size} />;
  return <ItemArt id={n.target} size={size} />;
}
const stopTitle = (n: TalentStop) => (EXTRA_NAMES[n.target] ? n.name : `${itemById(n.target)?.name ?? n.target} · ${n.name}`);

/** the stops' places on the road: rows of three, the next row goes back the other way (a snake), top to bottom */
const COLS = [18, 50, 82];
const ROW_H = 112;
/** the road's own width in its units (the SVG scales evenly with the map, so the gold fill is exact) */
const ROAD_W = 360;
const placeOf = (i: number) => {
  const row = Math.floor(i / 3), k = i % 3;
  return { x: COLS[row % 2 ? 2 - k : k], y: ROW_H / 2 + row * ROW_H };
};

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
    const el = roadRef.current?.querySelector(".tp-stop.now");
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
  const up = async (n: TalentStop) => {
    const r = await act<{ level: number; max: number }>("talent_up", { weapon: n.target, branch: n.branch }, (x) => `${stopTitle(n)} — ${x.level}/${x.max}`);
    if (r) haptic.ok();
  };
  const tap = (i: number) => {
    haptic.tap();
    setPick(i === cur ? null : i);
    if (i === cur && talents >= TALENT_PATH[i].cost && busy !== "talent_up") void up(TALENT_PATH[i]);
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
  const H = placeOf(TALENT_PATH.length - 1).y + ROW_H / 2;
  const pts = TALENT_PATH.map((_, i) => placeOf(i));
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
        <div className="tp-row2">
          <span className="tp-row2-pic"><StopArt n={sel} size={28} /></span>
          <span className="grow tp-row2-t">
            <b>{stopTitle(sel)} · {selLv}/{sel.max}</b>
            <small>
              {selLv >= sel.max ? `Готово: ${effect(sel, selLv)}`
                : selI > cur ? "Откроется, когда прокачаешь всё, что раньше на дорожке"
                : <>Нажми: {effect(sel, 1)} · стоит <Icon name="talent" size={11} />{sel.cost}{selLv > 0 ? ` · сейчас ${effect(sel, selLv)}` : ""}</>}
            </small>
          </span>
          {selI === cur && selLv < sel.max && (
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

      <div className="tp-road" ref={roadRef}>
        <div className="lp-map tp-map" style={{ aspectRatio: `${ROAD_W} / ${H}` }}>
          <svg className="lp-path" viewBox={`0 0 ${ROAD_W} ${H}`} aria-hidden="true">
            {pts.slice(1).map((b, k) => {
              const a = pts[k];
              const from = TALENT_PATH[k];
              const lv = stopLevel(wt, from);
              const fill = lv >= from.max ? 1 : k === cur ? lv / from.max : 0;
              const d = `M${(a.x / 100) * ROAD_W} ${a.y} L${(b.x / 100) * ROAD_W} ${b.y}`;
              return (
                <g key={k}>
                  <path d={d} className="lp-edge" />
                  <path d={d} className="lp-grey" />
                  <path d={d} className="lp-gold" pathLength={1} strokeDasharray={`${fill} 1`} />
                </g>
              );
            })}
          </svg>
          {TALENT_PATH.map((n, i) => {
            const lv = stopLevel(wt, n);
            const done = lv >= n.max;
            const cls = done ? "done" : i === cur ? "open" : "shut";
            const p = pts[i];
            return (
              <button key={n.key} type="button" className={`lp-stop tp-stop ${cls} ${i === cur ? "now" : ""} ${i === selI ? "sel" : ""} ${i === cur && talents < n.cost ? "tired" : ""}`}
                style={{ left: `${p.x}%`, top: `${(p.y / H) * 100}%` }} onClick={() => tap(i)} aria-label={`${stopTitle(n)}: ${lv}/${n.max}`}>
                <span className="lp-disc"><StopArt n={n} size={34} /></span>
                {KIND_TAG[n.kind] && <i className={`tp-kind ${n.kind}`}>{KIND_TAG[n.kind]}</i>}
                {done ? <i className="lp-tag ok">✓</i>
                  : i === cur ? <i className="lp-tag num">{lv}/{n.max}</i>
                  : <i className="lp-tag lock"><Icon name="lock" size={12} /></i>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
