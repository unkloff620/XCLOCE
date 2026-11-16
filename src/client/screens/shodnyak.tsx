"use client";
import { useCallback, useEffect, useState } from "react";
import { useGame } from "../store.tsx";
import { api } from "../api.ts";
import { Coin, DropKind, Empty, RewardChips } from "../ui.tsx";
import { Icon } from "../art/icons.tsx";
import { ItemArt } from "../art/items.tsx";
import { Emblem } from "../art/emblems.tsx";
import { BossPhoto } from "./boss-parts.tsx";
import { ClanSubPage } from "./clans.tsx";
import { bossById } from "../../content/bosses.ts";
import { itemById } from "../../content/items.ts";
import { full, short } from "../format.ts";
import type { Reward } from "../../content/rewards.ts";

interface Task { id: string; kind: "damage" | "kill"; goal: number; boss?: string; points: number }
interface ShodView {
  week: string;
  endsAt: number;
  tasks: Task[];
  mine: { id: string; progress: number; done: boolean }[];
  slots: number;
  maxSlots: number;
  slotPrices: number[];
  clan: { id: number; points: number; place: number | null } | null;
  table: { clan_id: number; name: string; tag: string; emblem: string; color: string; points: number }[];
  prizes: Reward[];
  tattoos: number[];
  boost: { weapon: string | null; until: number | null } | null;
  boostWeapons: string[];
  boostPct: number;
}

const taskName = (t: Task) => (t.kind === "damage" ? `Нанести ${short(t.goal)} урона боссам` : `Победить: ${bossById(t.boss!)?.name ?? t.boss}`);

function TaskPic({ t }: { t: Task }) {
  const b = t.kind === "kill" ? bossById(t.boss!) : null;
  return <span className="shod-pic">{b ? <BossPhoto boss={b} round /> : <Icon name="ach-damage" size={40} />}</span>;
}

const left = (ms: number) => {
  const h = Math.max(0, Math.floor(ms / 3600_000));
  return h >= 24 ? `${Math.floor(h / 24)} д ${h % 24} ч` : `${h} ч`;
};

/** «Сходняк»: tasks for the week, their points go to the clan; the clans' table and the prizes of the places */
function Shodnyak({ id }: { id: number }) {
  const { state, act, busy } = useGame();
  const [v, setV] = useState<ShodView | null>(null);
  const load = useCallback(() => api.get<ShodView>(`/api/clans/${id}/shodnyak`).then(setV).catch(() => {}), [id]);
  useEffect(() => { void load(); }, [load]);
  if (!v) return null;
  const run = async (type: string, body: Record<string, unknown>, ok: string) => {
    const r = await act<ShodView>(type, body, ok);
    if (r) setV(r);
  };
  const byId = new Map(v.tasks.map((t) => [t.id, t]));
  const taken = new Set(v.mine.map((m) => m.id));
  const free = v.slots - v.mine.length;
  const nextPrice = v.slotPrices[v.slots - 3];
  const sol = state?.wallet.SOL ?? 0;
  const myPoints = v.mine.filter((m) => m.done).reduce((s, m) => s + (byId.get(m.id)?.points ?? 0), 0);
  return (
    <div className="cev shod">
      <div className="cev-board">
        <b className="cev-h display">Сходняк недели</b>
        <ul className="cev-inf shod-sum">
          <li><span>Очки клана</span><b className="num">{full(v.clan?.points ?? 0)}</b></li>
          <li><span>Место клана</span><b className="num">{v.clan?.place ? `#${v.clan.place}` : "—"}</b></li>
          <li><span>Мои очки</span><b className="num">{full(myPoints)}</b></li>
          <li><span>Итоги через</span><b className="num">{left(v.endsAt - Date.now())}</b></li>
        </ul>
      </div>

      {v.boost && (
        <div className="panel shod-boost">
          {v.boost.weapon === null ? (
            <>
              <b>Клан взял 1 место! Выбери усиление на неделю: +{v.boostPct}% урона</b>
              <div className="shod-boost-pick">
                {v.boostWeapons.map((w) => (
                  <button key={w} type="button" className="btn gold" disabled={!!busy} onClick={() => run("shod_boost", { weapon: w }, `${itemById(w)?.name}: +${v.boostPct}% урона на неделю`)}>
                    <ItemArt id={w} size={34} /> {itemById(w)?.name}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <span className="row"><ItemArt id={v.boost.weapon} size={34} /> <b>{itemById(v.boost.weapon)?.name}: +{v.boostPct}% урона</b> <span className="muted tiny">ещё {left((v.boost.until ?? 0) - Date.now())}</span></span>
          )}
        </div>
      )}

      <b className="cev-h2 display">Мои задания · {v.mine.length}/{v.slots}</b>
      <div className="shod-slots">
        {v.mine.map((m) => {
          const t = byId.get(m.id);
          if (!t) return null;
          return (
            <div key={m.id} className={`shod-task mine ${m.done ? "done" : ""}`}>
              <TaskPic t={t} />
              <div className="grow" style={{ minWidth: 0 }}>
                <b className="shod-name">{taskName(t)}</b>
                {m.done ? <span className="shod-ok">Выполнено</span>
                  : <span className="shod-bar"><i style={{ width: `${Math.min(100, (m.progress / t.goal) * 100)}%` }} /><em>{t.kind === "damage" ? `${short(m.progress)} / ${short(t.goal)}` : "0 / 1"}</em></span>}
              </div>
              <b className="shod-pts num">+{t.points}</b>
            </div>
          );
        })}
        {Array.from({ length: free }, (_, i) => <div key={`f${i}`} className="shod-task empty">Свободная ячейка — возьми задание ниже</div>)}
        {v.slots < v.maxSlots && nextPrice !== undefined && (
          <button type="button" className="btn gold shod-buy" disabled={!!busy || sol < nextPrice} onClick={() => run("shod_slot", {}, "Ячейка открыта до конца недели")}>
            <Icon name="lock" size={18} /> {sol < nextPrice ? "Не хватает" : `Ещё ячейка · ${nextPrice}`} <Coin c="SOL" v={nextPrice} size={16} />
          </button>
        )}
      </div>
      <p className="tiny muted center">Взятое задание не сбросить. Новые задания и ячейки — с понедельника.</p>

      <b className="cev-h2 display">Задания</b>
      <div className="shod-list">
        {v.tasks.map((t) => {
          const mine = taken.has(t.id);
          return (
            <div key={t.id} className={`shod-task ${mine ? "taken" : ""}`}>
              <TaskPic t={t} />
              <b className="shod-name grow">{taskName(t)}</b>
              <b className="shod-pts num">+{t.points}</b>
              <button type="button" className="btn gold sm" disabled={!!busy || mine || free < 1} onClick={() => run("shod_take", { id: t.id }, "Задание взято")}>
                {mine ? "Взято" : "Взять"}
              </button>
            </div>
          );
        })}
      </div>

      <b className="cev-h2 display">Кланы недели</b>
      {!v.table.length ? <Empty>Пока ни одного выполненного задания</Empty> : (
        <ol className="shod-table">
          {v.table.map((c, i) => (
            <li key={c.clan_id} className={c.clan_id === id ? "me" : ""}>
              <b className="num">{i + 1}</b>
              <Emblem emblem={c.emblem} color={c.color} size={28} />
              <span className="ellipsis grow">{c.name} <span className="muted">[{c.tag}]</span></span>
              <b className="num">{full(c.points)}</b>
            </li>
          ))}
        </ol>
      )}

      <b className="cev-h2 display">Награды каждому в клане</b>
      <div className="shod-prizes">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="shod-prize">
            <b className="shod-place display">{i < 3 ? `${i + 1} место` : "4–10 место"}</b>
            <RewardChips r={v.prizes[i]} size={18} extra={<>
              {v.tattoos[i] ? <DropKind kind="tattoo" size={20} count={`×${v.tattoos[i]}`} /> : null}
              {i === 0 && v.boostWeapons.map((w) => <span key={w} className="shod-bw" title={`${itemById(w)?.name}: +${v.boostPct}% урона на неделю`}><ItemArt id={w} size={22} /></span>)}
            </>} />
          </div>
        ))}
        <span className="tiny muted center">1 место выбирает усиление на неделю: Rug Pull Gun или Видеокарта, +{v.boostPct}% урона</span>
      </div>
    </div>
  );
}

export function ClanShodScreen({ id }: { id: number }) {
  return <ClanSubPage id={id}><Shodnyak id={id} /></ClanSubPage>;
}
