"use client";
/*
 * The talent window (the system unit in the room opens it): talents are earned by boss damage of all time and spent
 * on weapon branches — every weapon, the fist too, has its own «Урон» and «Сила крита» branch.
 */
import { useGame } from "../store.tsx";
import { Modal } from "../ui.tsx";
import { Icon } from "../art/icons.tsx";
import { ItemArt } from "../art/items.tsx";
import { Help } from "../help.tsx";
import { haptic } from "../telegram.ts";
import { full } from "../format.ts";
import { itemById } from "../../content/items.ts";
import { BASE_CRIT_MULT } from "../../content/home.ts";
import { TALENT_BRANCHES, TALENT_WEAPONS, talentCost, talentThreshold, talentsForDamage, weaponTalentBonus, type TalentBranch } from "../../content/talents.ts";

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;

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
  return (
    <Help topic="talents" title="Таланты">
      <p>Таланты дают за урон по боссам за всё время: счётчик не сгорает — каждый бой продолжает его с того места, где остановился прошлый.</p>
      <p className="small">1-й талант — за {full(talentThreshold(1))} урона, 2-й — за {full(talentThreshold(2))}, 3-й — за {full(talentThreshold(3))}, 10-й — за {full(talentThreshold(10))}, 50-й — за {full(talentThreshold(50))}, 100-й — за {full(talentThreshold(100))}.</p>
      <p>У каждого оружия, даже у кулака, свои две ветки:</p>
      <ul className="small">
        <li><b>Урон</b> — +{pct(TALENT_BRANCHES[0].perLevel)} к урону этого оружия за уровень, до {TALENT_BRANCHES[0].maxLevel} уровня.</li>
        <li><b>Сила крита</b> — +{pct(TALENT_BRANCHES[1].perLevel)} к силе крита этого оружия за уровень. Шанс крита дают комната и оборудование.</li>
      </ul>
      <p className="small muted">Уровни 1–3 стоят 1 талант, 4–6 — 2, 7–9 — 3, 10-й — 4.</p>
    </Help>
  );
}

export function TalentWindow({ onClose }: { onClose: () => void }) {
  const { state, act, busy } = useGame();
  if (!state) return null;
  const talents = state.player.talents ?? 0;
  const wt = state.weaponTalents ?? {};
  const critChance = state.home.bonus.critChance;
  const up = async (weapon: string, branch: TalentBranch) => {
    const name = itemById(weapon)?.name ?? weapon;
    const br = TALENT_BRANCHES.find((b) => b.id === branch)!;
    const r = await act<{ level: number }>("talent_up", { weapon, branch }, (x) => `${name}: ${br.name.toLowerCase()} — уровень ${x.level}`);
    if (r) haptic.ok();
  };
  return (
    <Modal title="Таланты" onClose={onClose}>
      <div className="pc-top">
        <TalentChip n={talents} />
        <span className="chip" title="Шанс крита от комнаты и оборудования">крит {pct(critChance)}</span>
        <span className="grow" />
        <TalentHelp />
      </div>
      <TalentNext dmg={state.player.talentDamage ?? 0} />
      <div className="col" style={{ gap: 8, marginTop: 10 }}>
        {TALENT_WEAPONS.map((id) => {
          const def = itemById(id);
          if (!def?.weapon) return null;
          const b = weaponTalentBonus(wt, id);
          const dmg = Math.round(def.weapon.damage * (1 + state.home.bonus.damage + b.damage));
          return (
            <div key={id} className={`tal-weapon rar-${def.rarity}`}>
              <div className="tal-head">
                <span className="tal-art"><ItemArt id={id} size={44} /></span>
                <span className="grow col" style={{ gap: 1, minWidth: 0 }}>
                  <b className="ellipsis">{def.name}</b>
                  <span className="tiny muted">урон <b className="num" style={{ color: "var(--ink)" }}>{full(dmg)}</b> · крит ×{(BASE_CRIT_MULT + state.home.bonus.critDamage + b.critDamage).toFixed(2)}</span>
                </span>
              </div>
              <div className="tal-branches">
                {TALENT_BRANCHES.map((br) => {
                  const lv = Math.min(wt[id]?.[br.id] ?? 0, br.maxLevel);
                  const max = lv >= br.maxLevel;
                  const cost = talentCost(lv + 1);
                  return (
                    <div key={br.id} className={`tal-branch ${br.id}`}>
                      <span className="tal-name">{br.name}</span>
                      <span className="tal-pips" aria-label={`${lv} из ${br.maxLevel}`}>
                        {Array.from({ length: br.maxLevel }, (_, i) => <i key={i} className={i < lv ? "on" : ""} />)}
                      </span>
                      <b className="tal-val num">+{pct(lv * br.perLevel)}</b>
                      {max ? (
                        <span className="tal-max">MAX</span>
                      ) : (
                        <button className="btn gold sm tal-up" disabled={talents < cost || busy === "talent_up"} onClick={() => up(id, br.id)} aria-label={`${br.name}: улучшить за ${cost}`}>
                          +<Icon name="talent" size={14} />{cost}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
