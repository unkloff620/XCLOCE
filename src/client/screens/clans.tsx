"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Help } from "../help.tsx";
import { useGame } from "../store.tsx";
import { api } from "../api.ts";
import { Emblem } from "../art/emblems.tsx";
import { Avatar, Empty, Modal } from "../ui.tsx";
import { full, short } from "../format.ts";
import { Icon } from "../art/icons.tsx";

interface ClanRow { id: number; name: string; tag: string; emblem: string; color: string; description: string; members: number; damage: number; leader: string; level: number; rank: number }
interface ClanPage extends Omit<ClanRow, "members"> {
  wins: number;
  max: number;
  members: { id: number; name: string; photo: string | null; level: number; xp: number; role: string; damage: number }[];
}

/** Leader's clan settings: name, emblem and colour, description. */
function ClanSettings({ c, onClose, onSaved }: { c: ClanPage; onClose: () => void; onSaved: () => void }) {
  const { act, busy } = useGame();
  const [opts, setOpts] = useState<{ emblems: string[]; colors: string[] } | null>(null);
  const [name, setName] = useState(c.name);
  const [emblem, setEmblem] = useState(c.emblem);
  const [color, setColor] = useState(c.color);
  const [desc, setDesc] = useState(c.description ?? "");
  useEffect(() => {
    api.get<{ emblems: string[]; colors: string[] }>("/api/clans").then(setOpts).catch(() => undefined);
  }, []);
  const save = async () => {
    const r = await act("clan_edit", { name, emblem, color, description: desc }, "Клан обновлён");
    if (r) {
      onSaved();
      onClose();
    }
  };
  return (
    <Modal title="Настройки клана" onClose={onClose}>
      <div className="col" style={{ gap: 10 }}>
        <div className="row" style={{ justifyContent: "center" }}><Emblem emblem={emblem} color={color} size={84} /></div>
        <label className="tiny muted">Название</label>
        <input className="input" maxLength={24} value={name} onChange={(e) => setName(e.target.value)} />
        <label className="tiny muted">Герб и цвет</label>
        <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
          {(opts?.emblems ?? [c.emblem]).map((e) => (
            <button key={e} className={`pick ${e === emblem ? "on" : ""}`} onClick={() => setEmblem(e)}><Emblem emblem={e} color={color} size={34} /></button>
          ))}
        </div>
        <div className="row" style={{ gap: 8 }}>
          {(opts?.colors ?? [c.color]).map((x) => (
            <button key={x} className={`swatch ${x === color ? "on" : ""}`} style={{ background: x }} onClick={() => setColor(x)} aria-label={x} />
          ))}
        </div>
        <label className="tiny muted">Описание <span className="num">({desc.length}/300)</span></label>
        <textarea className="input clan-desc-input" maxLength={300} rows={4} placeholder="Кто вы, кого зовёте, когда бьёте боссов…" value={desc} onChange={(e) => setDesc(e.target.value)} />
        <button className="btn green block" disabled={busy === "clan_edit" || name.trim().length < 3} onClick={save}>Сохранить</button>
      </div>
    </Modal>
  );
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
  const [query, setQuery] = useState("");
  const load = useCallback(() => api.get<typeof data>("/api/clans").then(setData).catch(() => undefined), []);
  const ql = query.trim().toLowerCase();
  const shown = data ? (ql ? data.clans.filter((c) => c.name.toLowerCase().includes(ql) || c.tag.toLowerCase().includes(ql)) : data.clans) : [];
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
      {data && data.clans.length > 0 && (
        <div className="clan-search">
          <span aria-hidden="true">🔍</span>
          <input className="input" placeholder={`Поиск по ${data.clans.length} кланам: название или тег`} value={query} onChange={(e) => setQuery(e.target.value)} />
          {query && <button className="btn dark sm" onClick={() => setQuery("")} aria-label="Очистить">×</button>}
        </div>
      )}
      {!data ? null : data.clans.length === 0 ? (
        <Empty>Кланов ещё нет. Создай первый!</Empty>
      ) : shown.length === 0 ? (
        <Empty>Ничего не нашлось по «{query}»</Empty>
      ) : (
        <div className="col" style={{ gap: 8 }}>
          {shown.map((c) => (
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
  const [editing, setEditing] = useState(false);
  const [settings, setSettings] = useState(false);
  const [kickAsk, setKickAsk] = useState<number | null>(null);
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
  // two taps: «Исключить» → «Точно?» (a slip of the finger does not kick anyone)
  const kick = async (id: number, name: string) => {
    if (kickAsk !== id) return setKickAsk(id);
    setKickAsk(null);
    const r = await act("clan_kick", { playerId: id }, `${name} исключён`);
    if (r) void load();
  };
  return (
    <div>
      <div className="title">
        <span className="chip">#{c.rank} в рейтинге</span>
        <Link href="/clans?all=1" className="btn dark sm">🔍 Все кланы</Link>
      </div>
      <div className="panel center col" style={{ alignItems: "center" }}>
        <Emblem emblem={c.emblem} color={c.color} size={92} />
        <b className="display" style={{ fontSize: 22 }}>{c.name}</b>
        <span className="chip">[{c.tag}]</span>
        {c.description && <p className="clan-desc">{c.description}</p>}
        <div className="stat-grid" style={{ width: "100%" }}>
          <div><b className="num">{c.level}</b><span>уровень</span></div>
          <div><b className="num">{c.members.length}/{c.max}</b><span>участников</span></div>
          <div><b className="num">{short(c.damage)}</b><span>общий урон</span></div>
          <div><b className="num">{c.wins}</b><span>побед</span></div>
        </div>
        {!state?.clan && <button className="btn green block" disabled={busy === "clan_join" || c.members.length >= c.max} onClick={() => act("clan_join", { clanId: c.id }, "Ты в клане!")}>Вступить</button>}
        {mine && <button className="btn dark block" disabled={busy === "clan_leave"} onClick={() => act("clan_leave", {}, "Ты вышел из клана")}>Выйти из клана</button>}
      </div>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h2 className="h display">Участники</h2>
        {leader && (
          <div className="row" style={{ gap: 6 }}>
            <button className={`btn sm ${editing ? "gold" : "dark"}`} onClick={() => { setEditing((v) => !v); setKickAsk(null); }}>{editing ? "Готово" : "✎ Редактировать"}</button>
            <button className="btn sm dark" onClick={() => setSettings(true)} aria-label="Настройки клана" title="Настройки клана">⚙</button>
          </div>
        )}
      </div>
      {editing && <div className="tiny muted" style={{ marginBottom: 6 }}>Режим редактирования: нажми «Исключить» у игрока.</div>}
      <div className="col" style={{ gap: 6 }}>
        {c.members.map((m) => (
          <div key={m.id} className="clan-row">
            <Link href={`/profile?id=${m.id}`} className="row grow" style={{ minWidth: 0, gap: 10, color: "inherit" }}>
              <Avatar name={m.name} photo={m.photo} size={36} />
              <div className="grow" style={{ minWidth: 0 }}>
                <b className="ellipsis" style={{ display: "block" }}>{m.name}</b>
                <span className="tiny muted row" style={{ gap: 3 }}><Icon name="xp" size={13} /><b className="num" style={{ color: "var(--ink)" }}>{full(m.xp)}</b>{m.role === "leader" ? " · лидер" : ""}</span>
              </div>
            </Link>
            {editing && leader && m.role !== "leader" ? (
              <button className="btn sm red" disabled={busy === "clan_kick"} onClick={() => kick(m.id, m.name)}>{kickAsk === m.id ? "Точно?" : "Исключить"}</button>
            ) : (
              <span className="col" style={{ alignItems: "flex-end", gap: 0 }}><b className="num">{short(m.damage)}</b><span className="tiny muted">урон</span></span>
            )}
          </div>
        ))}
      </div>
      {settings && <ClanSettings c={c} onClose={() => setSettings(false)} onSaved={() => void load()} />}
    </div>
  );
}
