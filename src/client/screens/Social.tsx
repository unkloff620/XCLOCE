"use client";
import { useCallback, useEffect, useState } from "react";
import { useGame } from "../store.tsx";
import { api, type ClanDetails, type ClanRow, type TopRow } from "../api.ts";
import { Avatar, ConfirmButton, PriceTag, Tabs, fmtNum } from "../ui.tsx";
import { CLAN_CREATE_PRICE, CLAN_MAX_MEMBERS } from "../../shared/content.ts";

type View = "clan" | "top";

export function SocialScreen() {
  const { game } = useGame();
  const [view, setView] = useState<View>("clan");
  if (!game) return null;
  return (
    <div className="screen">
      <div className="screen-title"><h2 className="comic">SOCIAL</h2></div>
      <Tabs<View> value={view} onChange={setView} options={[{ value: "clan", label: game.clan ? `Клан [${game.clan.tag}]` : "Кланы" }, { value: "top", label: "Топ игроков" }]} />
      {view === "top" ? <TopPlayers /> : game.clan ? <MyClan clanId={game.clan.id} /> : <ClanBrowser />}
    </div>
  );
}

function MyClan({ clanId }: { clanId: number }) {
  const { game, act, busy } = useGame();
  const [clan, setClan] = useState<ClanDetails | null>(null);
  const load = useCallback(() => { api.clan(clanId).then((r) => setClan(r.clan)).catch(() => setClan(null)); }, [clanId]);
  useEffect(load, [load, game?.player.power]);
  if (!clan) return <div className="empty">Загрузка клана…</div>;
  const run = async (type: string, payload: Record<string, unknown>, ok: string) => {
    if (await act(type, payload, ok)) load();
  };
  return (
    <div className="section">
      <section className="panel clan-head">
        <div className="clan-badge comic">{clan.tag}</div>
        <div className="grow minw0">
          <div className="comic big ellipsis">{clan.name}</div>
          <div className="muted small">{clan.description || "Без описания"}</div>
        </div>
        <div className="clan-power"><small>СИЛА КЛАНА</small><b className="comic">⚔ {fmtNum(clan.power)}</b><small>{clan.members.length}/{CLAN_MAX_MEMBERS}</small></div>
      </section>

      {clan.isLeader && (
        <section className="panel">
          <h3 className="comic">Заявки ({clan.requests.length})</h3>
          {clan.requests.length === 0 && <div className="muted small">Новых заявок нет</div>}
          {clan.requests.map((r) => (
            <div key={r.id} className="member">
              <Avatar url={r.photo_url} name={r.name} size={36} />
              <div className="grow minw0"><b className="ellipsis">{r.name}</b><div className="muted small">Lv {r.level} · ⚔ {fmtNum(r.power)}</div></div>
              <button className="btn-small green comic" disabled={!!busy} onClick={() => run("clan_accept", { playerId: r.id }, "Игрок принят")}>✓</button>
              <button className="btn-small red comic" disabled={!!busy} onClick={() => run("clan_reject", { playerId: r.id }, "Заявка отклонена")}>✕</button>
            </div>
          ))}
        </section>
      )}

      <section className="panel">
        <h3 className="comic">Участники</h3>
        {clan.members.map((m) => (
          <div key={m.id} className="member">
            <Avatar url={m.photo_url} name={m.name} size={36} />
            <div className="grow minw0">
              <b className="ellipsis">{m.name} {m.role === "leader" && <span className="leader">👑 лидер</span>}</b>
              <div className="muted small">Lv {m.level} · ⚔ {fmtNum(m.power)}</div>
            </div>
            {clan.isLeader && m.role !== "leader" && (
              <ConfirmButton className="btn-small red comic" disabled={!!busy} onConfirm={() => run("clan_kick", { playerId: m.id }, "Игрок исключён")}>Кик</ConfirmButton>
            )}
          </div>
        ))}
      </section>

      {clan.isLeader ? (
        <ConfirmButton className="btn-dark comic" disabled={!!busy} confirmText="Нажми ещё раз — клан будет удалён" onConfirm={() => act("clan_disband", {}, "Клан распущен")}>РАСПУСТИТЬ КЛАН</ConfirmButton>
      ) : (
        <ConfirmButton className="btn-dark comic" disabled={!!busy} confirmText="Нажми ещё раз, чтобы выйти" onConfirm={() => act("clan_leave", {}, "Вы вышли из клана")}>ВЫЙТИ ИЗ КЛАНА</ConfirmButton>
      )}
    </div>
  );
}

function ClanBrowser() {
  const { game, act, busy } = useGame();
  const [clans, setClans] = useState<ClanRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", tag: "", description: "" });
  const load = useCallback((q: string) => { api.clans(q).then((r) => setClans(r.clans)).catch(() => setClans([])); }, []);
  useEffect(() => {
    const t = setTimeout(() => load(search), 250);
    return () => clearTimeout(t);
  }, [search, load]);
  if (!game) return null;
  const requested = new Set(game.myRequests);
  return (
    <div className="section">
      {creating ? (
        <section className="panel">
          <h3 className="comic">Новый клан</h3>
          <label className="field"><span>Название</span><input maxLength={24} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Doge Army" /></label>
          <label className="field"><span>Тег (2–5 латинских букв/цифр)</span><input maxLength={5} value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} placeholder="DOGE" /></label>
          <label className="field"><span>Описание</span><input maxLength={200} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Much wow, such power" /></label>
          <div className="row-c gap">
            <button className="btn-green comic grow" disabled={!!busy} onClick={async () => { if (await act("clan_create", form, "Клан создан!")) setCreating(false); }}>
              СОЗДАТЬ · <PriceTag price={CLAN_CREATE_PRICE} size={16} />
            </button>
            <button className="btn-dark comic" onClick={() => setCreating(false)}>Отмена</button>
          </div>
        </section>
      ) : (
        <button className="btn-green comic" onClick={() => setCreating(true)}>+ СОЗДАТЬ КЛАН</button>
      )}
      <input className="search" placeholder="Поиск клана по названию или тегу" value={search} onChange={(e) => setSearch(e.target.value)} />
      {!clans && <div className="empty">Загрузка…</div>}
      {clans?.length === 0 && <div className="empty">Кланов пока нет — создай первый!</div>}
      {clans?.map((c, i) => (
        <div key={c.id} className="clan-row">
          <span className="rank comic">{i + 1}</span>
          <div className="clan-badge comic">{c.tag}</div>
          <div className="grow minw0">
            <b className="ellipsis">{c.name}</b>
            <div className="muted small">⚔ {fmtNum(c.power)} · {c.members}/{CLAN_MAX_MEMBERS} · лидер {c.owner}</div>
          </div>
          {requested.has(c.id) ? (
            <button className="btn-small comic" disabled={!!busy} onClick={() => act("clan_cancel", { clanId: c.id }, "Заявка отозвана")}>Отозвать</button>
          ) : (
            <button className="btn-small green comic" disabled={!!busy || c.members >= CLAN_MAX_MEMBERS} onClick={() => act("clan_request", { clanId: c.id }, "Заявка отправлена")}>Вступить</button>
          )}
        </div>
      ))}
    </div>
  );
}

function TopPlayers() {
  const { game } = useGame();
  const [top, setTop] = useState<TopRow[] | null>(null);
  useEffect(() => { api.feed().then((r) => setTop(r.top)).catch(() => setTop([])); }, []);
  return (
    <div className="section">
      {!top && <div className="empty">Загрузка…</div>}
      {top?.map((p, i) => (
        <div key={p.id} className={`clan-row ${p.id === game?.player.id ? "me" : ""}`}>
          <span className="rank comic">{i + 1}</span>
          <Avatar url={p.photo_url} name={p.name} size={36} />
          <div className="grow minw0"><b className="ellipsis">{p.tag ? `[${p.tag}] ` : ""}{p.name}</b><div className="muted small">Lv {p.level}</div></div>
          <b className="comic">⚔ {fmtNum(p.power)}</b>
        </div>
      ))}
    </div>
  );
}
