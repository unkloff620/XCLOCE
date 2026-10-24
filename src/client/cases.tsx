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
            {c.closed && <span className="case-stamp display">ЗАКРЫТО</span>}
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
          {c.closed ? "Дело закрыто." : `Чтобы закрыть дело: ${CASE_WINS} побед${c.things.length ? " и все его вещи" : ""}.`}
          {!self && " Это дело другого игрока."}
        </div>
      </div>
    </Modal>
  );
}

export function CasesPanel({ cases, self }: { cases: CaseRow[]; self: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const closed = cases.filter((c) => c.closed).length;
  const cur = cases.find((c) => c.id === open) ?? null;
  return (
    <div className="panel col" style={{ gap: 8 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="small muted">ДЕЛА</span>
        <span className="tiny muted">закрыто <b className="num">{closed}/{cases.length}</b></span>
      </div>
      <div className="cases-grid">
        {BOSSES.map((b) => {
          const c = cases.find((x) => x.id === b.id);
          if (!c) return null;
          const touched = c.wins > 0 || c.damage > 0;
          return (
            <button key={b.id} type="button" className={`case-card ${c.closed ? "closed" : ""} ${touched ? "" : "blank"}`} onClick={() => { haptic.tap(); setOpen(b.id); }}>
              <span className="case-card-ph"><BossPhoto boss={b} locked={!touched} /></span>
              <b className="display">№{b.order}</b>
              <small className="num">{Math.min(c.wins, CASE_WINS)}/{CASE_WINS}</small>
              {c.set && <i className="case-card-set" aria-label={`вещи ${c.set.have}/${c.set.total}`}>{Array.from({ length: c.set.total }, (_, k) => <em key={k} className={k < c.set!.have ? "on" : ""} />)}</i>}
              {c.closed && <span className="case-card-stamp display">ЗАКРЫТО</span>}
            </button>
          );
        })}
      </div>
      {cur && <CaseWindow c={cur} self={self} onClose={() => setOpen(null)} />}
    </div>
  );
}
