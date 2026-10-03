"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Help } from "../help.tsx";
import { useGame } from "../store.tsx";
import { api } from "../api.ts";
import { Emblem } from "../art/emblems.tsx";
import { Avatar, Empty, Modal } from "../ui.tsx";
import { short } from "../format.ts";

interface ClanRow { id: number; name: string; tag: string; emblem: string; color: string; members: number; damage: number; leader: string; level: number; rank: number }
interface ClanPage extends Omit<ClanRow, "members"> {
  wins: number;
  max: number;
  members: { id: number; name: string; photo: string | null; level: number; role: string; damage: number }[];
}

function CreateClan({ emblems, colors, onClose }: { emblems: string[]; colors: string[]; onClose: () => void }) {
  const { act, busy } = useGame();
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [emblem, setEmblem] = useState(emblems[0]);
  const [color, setColor] = useState(colors[0]);
  const go = async () => {
    const r = await act<{ clanId: number }>("clan_create", { name, tag, emblem, color }, "Клан создан!");
    if (r) onClose();
  };
  return (
    <Modal title="Новый клан" onClose={onClose}>
      <div className="col" style={{ gap: 10 }}>
        <div className="row" style={{ justifyContent: "center" }}><Emblem emblem={emblem} color={color} size={84} /></div>
        <input className="input" placeholder="Название (3–24 символа)" maxLength={24} value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input" placeholder="Тег (2–5 букв)" maxLength={5} value={tag} onChange={(e) => setTag(e.target.value.toUpperCase())} />
        <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
          {emblems.map((e) => (
            <button key={e} className={`pick ${e === emblem ? "on" : ""}`} onClick={() => setEmblem(e)}><Emblem emblem={e} color={color} size={34} /></button>
          ))}
        </div>
        <div className="row" style={{ gap: 8 }}>
          {colors.map((c) => (
            <button key={c} className={`swatch ${c === color ? "on" : ""}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />
          ))}
        </div>
        <button className="btn green block" disabled={busy === "clan_create" || name.trim().length < 3 || tag.length < 2} onClick={go}>Создать</button>
      </div>
    </Modal>
  );
}

export function ClansScreen() {
  const { state } = useGame();
  const router = useRouter();
  const myClan = state?.clan?.id;
  // a member goes straight to the own clan; the full list stays at /clans?all=1
  useEffect(() => {
    if (myClan && !new URLSearchParams(window.location.search).has("all")) router.replace(`/clans/${myClan}`);
  }, [myClan, router]);
  const [data, setData] = useState<{ clans: ClanRow[]; emblems: string[]; colors: string[] } | null>(null);
  const [create, setCreate] = useState(false);
  const load = useCallback(() => api.get<typeof data>("/api/clans").then(setData).catch(() => undefined), []);
  useEffect(() => {
    void load();
  }, [load, state?.clan?.id]);
  return (
    <div>
      <div className="title">
        <div className="title-row">
          <h1 className="display">Кланы</h1>
          <Help topic="clans" title="Кланы">
            <p>Клан — до 30 человек. Рейтинг считается по общему урону участников по боссам.</p>
            <p>Создать клан можно бесплатно, вступить — в любой открытый. Лидер может исключать участников; если лидер уходит, роль переходит дальше.</p>
            <p>Клановые задания, боссы и войны появятся позже.</p>
          </Help>
        </div>
        {!state?.clan && data && <button className="btn sm green" onClick={() => setCreate(true)}>+ Создать</button>}
      </div>
      {state?.clan && (
        <Link href={`/clans/${state.clan.id}`} className="panel row" style={{ marginBottom: 12, display: "flex" }}>
          <Emblem emblem={state.clan.emblem} color={state.clan.color} size={48} />
          <div className="grow">
            <div className="tiny muted">МОЙ КЛАН</div>
            <b className="display">{state.clan.name} <span className="muted">[{state.clan.tag}]</span></b>
          </div>
          <span className="display" style={{ fontSize: 22 }}>›</span>
        </Link>
      )}
      {!data ? null : data.clans.length === 0 ? (
        <Empty>Кланов ещё нет. Создай первый!</Empty>
      ) : (
        <div className="col" style={{ gap: 8 }}>
          {data.clans.map((c) => (
            <Link key={c.id} href={`/clans/${c.id}`} className={`clan-row ${state?.clan?.id === c.id ? "me" : ""}`}>
              <span className="top-n display">{c.rank}</span>
              <Emblem emblem={c.emblem} color={c.color} size={40} />
              <div className="grow" style={{ minWidth: 0 }}>
                <b className="ellipsis" style={{ display: "block" }}>{c.name} <span className="muted">[{c.tag}]</span></b>
                <span className="tiny muted">ур. {c.level} · {c.members} чел. · лидер {c.leader}</span>
              </div>
              <b className="num">{short(c.damage)}</b>
            </Link>
          ))}
        </div>
      )}
      {create && data && <CreateClan emblems={data.emblems} colors={data.colors} onClose={() => setCreate(false)} />}
    </div>
  );
}

export function ClanScreen({ id }: { id: number }) {
  const { state, act, busy } = useGame();
  const [c, setC] = useState<ClanPage | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => api.get<ClanPage>(`/api/clans/${id}`).then(setC).catch((e) => setErr(e.message)), [id]);
  useEffect(() => {
    void load();
  }, [load, state?.clan?.id]);
  if (err) return <Empty>{err}</Empty>;
  if (!c) return null;
  const mine = state?.clan?.id === c.id;
  const leader = c.members.find((m) => m.role === "leader")?.id === state?.player.id;
  return (
    <div>
      <div className="title">
        <Link href="/clans?all=1" className="back">← Все кланы</Link>
        <span className="chip">#{c.rank} в рейтинге</span>
      </div>
      <div className="panel center col" style={{ alignItems: "center" }}>
        <Emblem emblem={c.emblem} color={c.color} size={92} />
        <b className="display" style={{ fontSize: 22 }}>{c.name}</b>
        <span className="chip">[{c.tag}]</span>
        <div className="stat-grid" style={{ width: "100%" }}>
          <div><b className="num">{c.level}</b><span>уровень</span></div>
          <div><b className="num">{c.members.length}/{c.max}</b><span>участников</span></div>
          <div><b className="num">{short(c.damage)}</b><span>общий урон</span></div>
          <div><b className="num">{c.wins}</b><span>побед</span></div>
        </div>
        {!state?.clan && <button className="btn green block" disabled={busy === "clan_join" || c.members.length >= c.max} onClick={() => act("clan_join", { clanId: c.id }, "Ты в клане!")}>Вступить</button>}
        {mine && <button className="btn dark block" disabled={busy === "clan_leave"} onClick={() => act("clan_leave", {}, "Ты вышел из клана")}>Выйти из клана</button>}
      </div>
      <h2 className="h display">Участники</h2>
      <div className="col" style={{ gap: 6 }}>
        {c.members.map((m) => (
          <div key={m.id} className="clan-row">
            <Avatar name={m.name} photo={m.photo} size={36} />
            <div className="grow" style={{ minWidth: 0 }}>
              <b className="ellipsis" style={{ display: "block" }}>{m.name}</b>
              <span className="tiny muted">LVL {m.level}{m.role === "leader" ? " · лидер" : ""}</span>
            </div>
            <b className="num">{short(m.damage)}</b>
            {leader && m.role !== "leader" && <button className="btn sm red" onClick={() => act("clan_kick", { playerId: m.id }, "Исключён")}>×</button>}
          </div>
        ))}
      </div>
    </div>
  );
}
