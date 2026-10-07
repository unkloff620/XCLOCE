"use client";
/*
 * The talent window (the system unit in the room opens it): talents are earned by boss damage of all time and spent
 * on the weapon trees — every weapon, the fist too, has its own column of four upgrades, one under another; the next
 * one opens when the one above is full. On top: the talent counter and the reset (all spent talents come back) for 5 USD.
 */
import { useState } from "react";
import { useGame } from "../store.tsx";
import { Modal } from "../ui.tsx";
import { Icon } from "../art/icons.tsx";
import { ItemArt } from "../art/items.tsx";
import { Help } from "../help.tsx";
import { haptic } from "../telegram.ts";
import { full } from "../format.ts";
import { itemById } from "../../content/items.ts";
import { weaponStats } from "../weapon-stats.ts";
import {
  TALENT_RESET_PRICE, TALENT_WEAPONS, nodeOpen, talentThreshold, talentTree, talentsForDamage, talentsSpent,
  type TalentBranch, type TalentNode,
} from "../../content/talents.ts";

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
const effect = (n: TalentNode, lv: number) => (n.kind === "dmg" ? `+${full(lv * n.per)} урона` : `+${pct(lv * n.per)} крит`);
const perLevel = (n: TalentNode) => (n.kind === "dmg" ? `+${full(n.per)} урона` : `+${pct(n.per)} к силе крита`);

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
        <i /><span className="num">{full(dmg)} / {full(to)} урона</span>
      </div>
    </div>
  );
}

function TalentHelp() {
  const tree = talentTree("fist");
  return (
    <Help topic="talents" title="Таланты">
      <p>Таланты дают за урон по боссам за всё время: счётчик не сгорает — каждый бой продолжает его с того места, где остановился прошлый.</p>
      <p className="small">1-й талант — за {full(talentThreshold(1))} урона, 2-й — за {full(talentThreshold(2))}, 10-й — за {full(talentThreshold(10))}, 50-й — за {full(talentThreshold(50))}, 100-й — за {full(talentThreshold(100))}.</p>
      <p>У каждого оружия, даже у кулака, своя ветка из четырёх улучшений. Следующее открывается, когда предыдущее прокачано до конца:</p>
      <ol className="small">
        {tree.map((n) => (
          <li key={n.id}><b>{n.name}</b> — {n.kind === "dmg" ? "+урон к оружию (у каждого свой шаг)" : `${perLevel(n)}`} за уровень, {n.max} уровней, по {n.cost} {n.cost === 1 ? "таланту" : "таланта"}.</li>
        ))}
      </ol>
      <p className="small">Полная ветка стоит {tree.reduce((s, n) => s + n.max * n.cost, 0)} талантов и даёт +200% к силе крита. Шанс крита дают комната и оборудование.</p>
      <p className="small muted">Сброс талантов стоит {TALENT_RESET_PRICE.amount} {TALENT_RESET_PRICE.currency}: все потраченные таланты возвращаются, и их можно распределить заново.</p>
    </Help>
  );
}

export function TalentWindow({ onClose }: { onClose: () => void }) {
  const { state, act, busy } = useGame();
  const [confirm, setConfirm] = useState(false);
  if (!state) return null;
  const talents = state.player.talents ?? 0;
  const wt = state.weaponTalents ?? {};
  const spent = talentsSpent(wt);
  const usd = state.wallet[TALENT_RESET_PRICE.currency] ?? 0;
  const up = async (weapon: string, node: TalentNode) => {
    const name = itemById(weapon)?.name ?? weapon;
    const r = await act<{ level: number; max: number }>("talent_up", { weapon, branch: node.id }, (x) => `${name}: ${node.name.toLowerCase()} — ${x.level}/${x.max}`);
    if (r) haptic.ok();
  };
  const reset = async () => {
    const r = await act<{ returned: number }>("talent_reset", {}, (x) => `Таланты сброшены: вернулось ${x.returned}`);
    setConfirm(false);
    if (r) haptic.ok();
  };
  return (
    <Modal title="Таланты" onClose={onClose} wide>
      <div className="pc-top">
        <TalentChip n={talents} />
        <span className="chip" title="Шанс крита от комнаты и оборудования">крит {pct(state.home.bonus.critChance)}</span>
        <span className="grow" />
        {!confirm ? (
          <button className="btn dark sm tal-reset" disabled={spent === 0} onClick={() => setConfirm(true)} title="Вернуть все потраченные таланты">
            Сброс · <Icon name="USD" size={14} /> {TALENT_RESET_PRICE.amount}
          </button>
        ) : null}
        <TalentHelp />
      </div>
      {confirm && (
        <div className="tal-confirm">
          <span className="small">Сбросить все таланты за <b>{TALENT_RESET_PRICE.amount} USD</b>? Вернётся <b className="num">{spent}</b>.{usd < TALENT_RESET_PRICE.amount && <span style={{ color: "var(--red)" }}> Не хватает USD.</span>}</span>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn dark sm" onClick={() => setConfirm(false)}>Нет</button>
            <button className="btn red sm" disabled={busy === "talent_reset" || usd < TALENT_RESET_PRICE.amount} onClick={reset}>Сбросить</button>
          </div>
        </div>
      )}
      <TalentNext dmg={state.player.talentDamage ?? 0} />
      <div className="tal-tree">
        {TALENT_WEAPONS.map((id) => {
          const def = itemById(id);
          if (!def?.weapon) return null;
          const st = weaponStats(state, id);
          const lv = wt[id] ?? {};
          return (
            <div key={id} className={`tal-col rar-${def.rarity}`}>
              <div className="tal-top">
                <span className="tal-art"><ItemArt id={id} size={44} /></span>
                <b className="tal-wname">{def.name}</b>
                <span className="tiny muted num">⚔ {full(st.damage)} · ×{st.crit.toFixed(2)}</span>
              </div>
              {talentTree(id).map((n) => {
                const l = Math.min(lv[n.id as TalentBranch] ?? 0, n.max);
                const open = nodeOpen(lv, id, n.id);
                const max = l >= n.max;
                const can = open && !max && talents >= n.cost && busy !== "talent_up";
                return (
                  <button
                    key={n.id}
                    className={`tal-node ${n.kind}${open ? "" : " locked"}${max ? " max" : ""}`}
                    disabled={!can}
                    onClick={() => up(id, n)}
                    title={open ? `${n.name}: ${perLevel(n)} за уровень, стоит ${n.cost}` : "Откроется, когда выше прокачано до конца"}
                  >
                    <span className="tal-nname">{open ? n.name : <><Icon name="lock" size={11} /> {n.name}</>}</span>
                    <b className="tal-lv num">{l}/{n.max}</b>
                    <span className="tal-bar"><i style={{ width: `${(l / n.max) * 100}%` }} /></span>
                    <span className="tal-eff">{effect(n, l)}</span>
                    <span className="tal-cost">{max ? "MAX" : <>+<Icon name="talent" size={12} />{n.cost}</>}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
