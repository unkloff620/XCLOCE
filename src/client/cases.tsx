"use client";
/*
 * «Дела»: a page per boss in the profile — wins over him, the best single hit, his things (owned, opened in the shop,
 * still secret) and his set's weapon bonus. A case is closed with CASE_WINS wins and the whole set owned (server:
 * systems/collection.ts). Closed cases get the red «ЗАКРЫТО» stamp.
 */
import { useState } from "react";
import { BOSSES, CASE_WINS, bossById } from "../content/bosses.ts";
import { itemById } from "../content/items.ts";
import { ItemArt } from "./art/items.tsx";
import { Modal } from "./ui.tsx";
import { BossPhoto } from "./screens/boss-parts.tsx";
import { full } from "./format.ts";
import { haptic } from "./telegram.ts";
import { BossCoin } from "./art/boss-coin.tsx";
import { MEDAL_NAMES, MEDAL_TIERS, type MedalTier } from "../content/medals.ts";
import { BOSS_KILL_TARGETS } from "../content/achievements.ts";

export interface CaseRow {
  id: string; wins: number; damage: number; bestHit: number;
  things: { id: string; owned: boolean; opened: boolean }[];
  set: { weapon: string; damage: number; have: number; total: number } | null;
  closed: boolean;
}

function weaponName(id: string) {
  return itemById(id)?.name ?? id;
}

function CaseWindow({ c, self, onClose }: { c: CaseRow; self: boolean; onClose: () => void }) {
  const b = bossById(c.id)!;
  const setDone = !!c.set && c.set.have === c.set.total;
  return (
    <Modal title={<span>Дело №{b.order} · {b.name}</span>} onClose={onClose}>
      <div className="case-win">
        <div className="case-top">
          <div className="case-photo">
            <BossPhoto boss={b} />
          </div>
          <div className="case-facts">
            <span><small>Побед</small><b className="num">{full(c.wins)}<i>/{CASE_WINS}</i></b></span>
            <span><small>Лучший удар</small><b className="num">{c.bestHit ? full(c.bestHit) : "—"}</b></span>
            <span><small>Урон всего</small><b className="num">{full(c.damage)}</b></span>
          </div>
        </div>

        {c.things.length > 0 ? (
          <>
            <div className="case-h">Вещи босса</div>
            <div className="case-things">
              {c.things.map((t) => (
                <span key={t.id} className={`case-thing ${t.owned ? "own" : t.opened ? "open" : "secret"}`} title={t.opened ? itemById(t.id)?.name : "Ещё не выпало"}>
                  {t.opened ? <ItemArt id={t.id} size={46} /> : <b>?</b>}
                  <small>{t.owned ? "есть" : t.opened ? "в магазине" : "не выпало"}</small>
                </span>
              ))}
            </div>
          </>
        ) : <div className="tiny muted">Вещей этого босса пока нет — скоро нарисуем.</div>}

        {c.set && (
          <div className={`case-set ${setDone ? "done" : ""}`}>
            <ItemArt id={c.set.weapon} size={34} />
            <span className="grow">
              <b>Комплект: {weaponName(c.set.weapon)} +{c.set.damage} урона</b>
              <small>{setDone ? "Собран — бонус работает, даже если вещи не надеты" : `Собери все вещи: ${c.set.have}/${c.set.total}`}</small>
            </span>
          </div>
        )}

        <div className="tiny muted center">
          Медали за победы над ним: бронза — {BOSS_KILL_TARGETS[0]}, серебро — {BOSS_KILL_TARGETS[1]}, золото — {BOSS_KILL_TARGETS[2]}.
          {!self && " Это дело другого игрока."}
        </div>
      </div>
    </Modal>
  );
}

/** «Дела»: every boss is his three medals stacked — bronze, silver, gold on top; they open with wins over him:
 *  BOSS_KILL_TARGETS (10 / 50 / 100); one not reached yet is a grey see-through coin. A tap opens his case. */
export function CasesPanel({ cases, self }: { cases: CaseRow[]; self: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const cur = cases.find((c) => c.id === open) ?? null;
  return (
    <div className="case-medals">
      {BOSSES.map((b) => {
        const c = cases.find((x) => x.id === b.id);
        if (!c) return null;
        const label = MEDAL_TIERS.map((t, k) => `${MEDAL_NAMES[t]} — ${BOSS_KILL_TARGETS[k]} побед`).join(", ");
        return (
          <button key={b.id} type="button" className="case-stack" onClick={() => { haptic.tap(); setOpen(b.id); }} aria-label={`${b.name}: побед ${c.wins}. ${label}`} title={`${b.name}: побед ${c.wins}`}>
            {MEDAL_TIERS.map((t: MedalTier, k) => {
              const on = c.wins >= BOSS_KILL_TARGETS[k];
              return <span key={t} className={`case-coin c${k} ${on ? "on" : "off"}`}><BossCoin boss={b} tier={t} size={64} /></span>;
            })}
          </button>
        );
      })}
      {cur && <CaseWindow c={cur} self={self} onClose={() => setOpen(null)} />}
    </div>
  );
}
