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

interface Task { id: string; kind: "damage" | "kill" | "authority" | "rub" | "location"; goal: number; boss?: string; mode?: "blat" | "avtor"; points: number }
interface ClanRow { clan_id: number; name: string; tag: string; emblem: string; color: string; points: number }
interface ShodView {
  week: string;
  endsAt: number;
  tasks: Task[];
  mine: { id: string; progress: number; done: boolean }[];
  slots: number;
  maxSlots: number;
  slotPrices: number[];
  clan: { id: number; points: number; place: number | null; name: string; tag: string; emblem: string; color: string } | null;
  table: ClanRow[];
  prizes: Reward[];
  tattoos: number[];
  boost: { weapon: string | null; until: number | null } | null;
  boostWeapons: string[];
  boostPct: number;
}

const MODE_NAME = { blat: "Блатной", avtor: "Авторитетный" } as const;
const KIND_NAME: Record<Task["kind"], string> = { damage: "Урон", kill: "Боссы", authority: "Авторитет", rub: "Рубли", location: "Локации" };
const taskName = (t: Task) =>
  t.kind === "damage" ? `Нанести ${short(t.goal)} урона боссам`
    : t.kind === "kill" ? `Победить: ${bossById(t.boss!)?.name ?? t.boss}${t.mode ? ` · ${MODE_NAME[t.mode]}` : ""}`
      : t.kind === "authority" ? `Получить ${short(t.goal)} авторитета`
        : t.kind === "rub" ? `Заработать ${short(t.goal)} ₽`
          : `Пройти локации ${t.goal} раз`;

function TaskPic({ t }: { t: Task }) {
  const b = t.kind === "kill" ? bossById(t.boss!) : null;
  return (
    <span className={`shod-pic ${t.mode ? `m-${t.mode}` : ""}`}>
      {b ? <BossPhoto boss={b} round /> : <Icon name={t.kind === "authority" ? "xp" : t.kind === "rub" ? "RUB" : t.kind === "location" ? "map" : "ach-damage"} size={40} />}
    </span>
  );
}

const left = (ms: number) => {
  const h = Math.max(0, Math.floor(ms / 3600_000));
  return h >= 24 ? `${Math.floor(h / 24)} д ${h % 24} ч` : `${h} ч`;
};

type Tab = "main" | "mine" | "all" | "prizes";
const TABS: [Tab, string][] = [["main", "Сходняк"], ["mine", "Мои"], ["all", "Все"], ["prizes", "Награды"]];

/** «Сходняк»: the week's info and the clans' top · my tasks · all the tasks (filters) · the prizes by place */
function Shodnyak({ id }: { id: number }) {
  const { state, act, busy } = useGame();
  const [v, setV] = useState<ShodView | null>(null);
  const [tab, setTab] = useState<Tab>("main");
  const [kind, setKind] = useState<"" | Task["kind"]>("");
  const [mode, setMode] = useState<"" | "pacan" | "blat" | "avtor">("");
  const [which, setWhich] = useState<"" | "free" | "taken">("free");
  const [sort, setSort] = useState<"down" | "up">("down");
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
  const sol = state?.wallet.GOLD ?? 0;
  const myPoints = v.mine.filter((m) => m.done).reduce((s, m) => s + (byId.get(m.id)?.points ?? 0), 0);
  const list = v.tasks
    .filter((t) => !kind || t.kind === kind)
    .filter((t) => !mode || (t.kind === "kill" && (mode === "pacan" ? !t.mode : t.mode === mode)))
    .filter((t) => !which || (which === "taken") === taken.has(t.id))
    .sort((a, b) => (sort === "down" ? b.points - a.points : a.points - b.points));
  const prizeOf = (place: number) => (place <= v.prizes.length ? place - 1 : -1);
  const PrizeLine = ({ i }: { i: number }) => (
    <RewardChips r={v.prizes[i]} size={18} extra={<>
      {v.tattoos[i] ? <DropKind kind="tattoo" size={20} count={`×${v.tattoos[i]}`} /> : null}
      {i === 0 && v.boostWeapons.map((w) => <span key={w} className="shod-bw" title={`${itemById(w)?.name}: +${v.boostPct}% урона на неделю`}><ItemArt id={w} size={22} /></span>)}
    </>} />
  );
  const ClanLine = ({ c, place }: { c: ClanRow; place: number }) => (
    <li className={`${c.clan_id === id ? "me" : ""} ${place <= 3 ? `p${place}` : ""}`}>
      <b className="shod-medal num">{place}</b>
      <Emblem emblem={c.emblem} color={c.color} size={34} />
      <span className="shod-cl">
        <b className="ellipsis">{c.name}</b>
        <span className="shod-cpts num">{full(c.points)}</span>
      </span>
      <span className="shod-cprize">{prizeOf(place) >= 0 ? <PrizeLine i={prizeOf(place)} /> : <span className="muted">Нет награды</span>}</span>
    </li>
  );
  return (
    <div className="cev shod">
      <div className="tabs shod-tabs" role="tablist">
        {TABS.map(([k, name]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            {name}{k === "mine" ? ` ${v.mine.length}/${v.slots}` : ""}
          </button>
        ))}
      </div>

      {tab === "main" && (
        <>
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
          <div className="shod-top">
            <div className="shod-top-h"><span>Топ</span><span>Клан</span><span>Награда</span></div>
            {!v.table.length ? <Empty>Пока ни одного выполненного задания</Empty> : (
              <ol className="shod-table">
                {v.table.map((c, i) => <ClanLine key={c.clan_id} c={c} place={i + 1} />)}
                {v.clan && v.clan.place && v.clan.place > v.table.length && (
                  <>
                    <li className="gap" aria-hidden="true">…</li>
                    <ClanLine c={{ clan_id: v.clan.id, name: v.clan.name, tag: v.clan.tag, emblem: v.clan.emblem, color: v.clan.color, points: v.clan.points }} place={v.clan.place} />
                  </>
                )}
              </ol>
            )}
          </div>
        </>
      )}

      {tab === "mine" && (
        <>
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
                      : <span className="shod-bar"><i style={{ width: `${Math.min(100, (m.progress / t.goal) * 100)}%` }} /><em>{t.kind === "kill" || t.kind === "location" ? `${m.progress} / ${t.goal}` : `${short(m.progress)} / ${short(t.goal)}`}</em></span>}
                  </div>
                  <b className="shod-pts num">+{t.points}</b>
                </div>
              );
            })}
            {Array.from({ length: free }, (_, i) => (
              <button key={`f${i}`} type="button" className="shod-task empty" onClick={() => setTab("all")}>Свободная ячейка — выбери задание во вкладке «Все»</button>
            ))}
            {v.slots < v.maxSlots && nextPrice !== undefined && (
              <button type="button" className="btn gold shod-buy" disabled={!!busy || sol < nextPrice} onClick={() => run("shod_slot", {}, "Ячейка открыта до конца недели")}>
                <Icon name="lock" size={18} /> {sol < nextPrice ? "Не хватает" : `Ещё ячейка · ${nextPrice}`} <Coin c="GOLD" v={nextPrice} size={16} />
              </button>
            )}
          </div>
          <p className="tiny muted center">Взятое задание не сбросить. Новые задания и ячейки — с понедельника.</p>
        </>
      )}

      {tab === "all" && (
        <>
          <div className="shod-filters">
            <label><span>Тип</span>
              <select value={kind} onChange={(e) => { const k = e.target.value as typeof kind; setKind(k); if (k && k !== "kill") setMode(""); }}>
                <option value="">Все</option>
                {(Object.keys(KIND_NAME) as Task["kind"][]).map((k) => <option key={k} value={k}>{KIND_NAME[k]}</option>)}
              </select>
            </label>
            <label><span>Режим</span>
              <select value={mode} onChange={(e) => { const m = e.target.value as typeof mode; setMode(m); if (m) setKind("kill"); }}>
                <option value="">Любой</option>
                <option value="pacan">Пацанский</option>
                <option value="blat">Блатной</option>
                <option value="avtor">Авторитетный</option>
              </select>
            </label>
            <label><span>Состояние</span>
              <select value={which} onChange={(e) => setWhich(e.target.value as typeof which)}>
                <option value="">Все</option>
                <option value="free">Свободные</option>
                <option value="taken">Взятые</option>
              </select>
            </label>
            <label><span>Очки</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
                <option value="down">Сначала больше</option>
                <option value="up">Сначала меньше</option>
              </select>
            </label>
          </div>
          <p className="tiny muted center">Ячеек свободно: {free} из {v.slots}</p>
          <div className="shod-list">
            {!list.length && <Empty>Таких заданий нет</Empty>}
            {list.map((t) => {
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
        </>
      )}

      {tab === "prizes" && (
        <div className="shod-prizes">
          <b className="cev-h2 display">Награды каждому в клане</b>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="shod-prize">
              <b className="shod-place display">{i < 3 ? `${i + 1} место` : "4–10 место"}</b>
              <PrizeLine i={i} />
            </div>
          ))}
          <span className="tiny muted center">1 место выбирает усиление на неделю: Rug Pull Gun или Пистолет, +{v.boostPct}% урона. Наколки — из сетов «Купола», «Медведь» и «Ворон».</span>
        </div>
      )}
    </div>
  );
}

export function ClanShodScreen({ id }: { id: number }) {
  return <ClanSubPage id={id}><Shodnyak id={id} /></ClanSubPage>;
}
