"use client";
import Link from "next/link";
import { useState } from "react";
import { useGame } from "../store.tsx";
import { Modal } from "../ui.tsx";
import { ItemArt } from "../art/items.tsx";
import { itemById } from "../../content/items.ts";
import { STASH_SETS } from "../../content/stashes.ts";

/*
 * Нычки between players. At home: «Попросить нычки» — pick up to WISH_MAX stashes you still need. In a player's
 * profile: the stashes he asks for, each with «Отправить» (one of your own copies goes to him), GIFTS_PER_DAY a day.
 * The numbers are checked on the server (src/server/systems/swap.ts).
 */
export const WISH_MAX = 6;
export const GIFTS_PER_DAY = 6;

const qtyOf = (inv: { id: string; qty: number }[], id: string) => inv.find((i) => i.id === id)?.qty ?? 0;

export function StashWishWindow({ onClose }: { onClose: () => void }) {
  const { state, act, busy } = useGame();
  const [pick, setPick] = useState<string[]>(state?.stashWish ?? []);
  if (!state) return null;
  const toggle = (id: string) => setPick((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= WISH_MAX ? p : [...p, id]));
  const changed = JSON.stringify([...pick].sort()) !== JSON.stringify([...(state.stashWish ?? [])].sort());
  const save = async () => {
    if ((await act("stash_wish", { items: pick }, pick.length ? "Просьба сохранена — её видно в твоём профиле" : "Просьба снята")) !== null) onClose();
  };
  const gifts = state.stashGifts ?? [];
  return (
    <Modal title="Попросить нычки" onClose={onClose}>
      <div className="col" style={{ gap: 10 }}>
        <p className="small" style={{ margin: 0 }}>
          Выбери до {WISH_MAX} нычек, которых не хватает для наборов. Их увидят в твоём профиле, и любой игрок сможет прислать тебе свою — до {GIFTS_PER_DAY} нычек в день от каждого.
        </p>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <b className="small">Выбрано: <span className="num">{pick.length}/{WISH_MAX}</span></b>
          {pick.length > 0 && <button className="btn dark sm" onClick={() => setPick([])}>Сбросить</button>}
        </div>
        <div className="col swap-sets">
          {STASH_SETS.map((set) => (
            <div key={set.id} className="swap-set">
              <span className="tiny muted">{set.name}</span>
              <div className="swap-row">
                {set.items.map((it) => {
                  const on = pick.includes(it.id);
                  const n = qtyOf(state.inventory, it.id);
                  return (
                    <button key={it.id} className={`swap-tile ${on ? "on" : ""}`} onClick={() => toggle(it.id)} disabled={!on && pick.length >= WISH_MAX} aria-pressed={on} title={it.name}>
                      <ItemArt id={it.id} size={44} />
                      <span className="swap-have num">×{n}</span>
                      {on && <span className="swap-check" aria-hidden="true">✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {gifts.length > 0 && (
          <div className="panel col" style={{ gap: 4 }}>
            <b className="small">Тебе прислали</b>
            {gifts.map((g, i) => (
              <div key={i} className="row small" style={{ gap: 6 }}>
                <ItemArt id={g.itemId} size={22} />
                <span className="ellipsis grow">{itemById(g.itemId)?.name ?? g.itemId}</span>
                <Link href={`/profile?id=${g.fromId}`} className="tiny" onClick={onClose}>от {g.from}</Link>
              </div>
            ))}
          </div>
        )}
        <button className="btn green block" disabled={!changed || !!busy} onClick={save}>{changed ? "Сохранить" : "Без изменений"}</button>
      </div>
    </Modal>
  );
}

/** In someone else's profile: what he asks for, and «Отправить» for each one I have. */
export function StashGivePanel({ to, name, wish, give, onSent }: {
  to: number; name: string; wish: string[]; give: { left: number; have: Record<string, number> }; onSent: () => void;
}) {
  const { act, busy } = useGame();
  if (!wish.length) return null;
  const send = async (id: string) => {
    const r = await act<{ left: number }>("stash_gift", { to, itemId: id }, `«${itemById(id)?.name ?? id}» отправлена — ${name} скажет спасибо`);
    if (r) onSent();
  };
  return (
    <div className="panel col" style={{ gap: 8 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="small muted">ПРОСИТ НЫЧКИ</span>
        <span className="tiny muted">можно отправить сегодня: <b className="num">{give.left}/{GIFTS_PER_DAY}</b></span>
      </div>
      <div className="swap-give">
        {wish.map((id) => {
          const have = give.have[id] ?? 0;
          return (
            <div key={id} className="swap-give-item">
              <ItemArt id={id} size={48} />
              <span className="tiny ellipsis" style={{ maxWidth: "100%" }}>{itemById(id)?.name ?? id}</span>
              <span className="tiny muted">у тебя ×{have}</span>
              <button className="btn gold sm block" disabled={have < 1 || give.left < 1 || busy === "stash_gift"} onClick={() => send(id)}>Отправить</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** «Сообщения»: the stashes other players sent — accept one or all, they go to the inventory. */
export function MessagesWindow({ onClose }: { onClose: () => void }) {
  const { state, act, busy } = useGame();
  if (!state) return null;
  const inbox = state.stashInbox ?? [];
  const accept = (id: number | null) => act("stash_accept", id === null ? {} : { id }, id === null ? "Все подарки в инвентаре" : "Нычка в инвентаре");
  const when = (t: number) => new Date(t).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <Modal title="Сообщения" onClose={onClose}>
      <div className="col" style={{ gap: 10 }}>
        {inbox.length === 0 ? (
          <p className="small muted" style={{ margin: 0, textAlign: "center" }}>Новых сообщений нет. Попроси нычки в меню дома — когда тебе их пришлют, подарки появятся здесь.</p>
        ) : (
          <>
            <div className="col" style={{ gap: 6 }}>
              {inbox.map((g) => (
                <div key={g.id} className="msg-row">
                  <ItemArt id={g.itemId} size={40} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <b className="small ellipsis" style={{ display: "block" }}>{itemById(g.itemId)?.name ?? g.itemId}</b>
                    <span className="tiny muted">от <Link href={`/profile?id=${g.fromId}`} onClick={onClose}>{g.from}</Link> · {when(g.at)}</span>
                  </div>
                  <button className="btn green sm" disabled={!!busy} onClick={() => accept(g.id)}>Принять</button>
                </div>
              ))}
            </div>
            {inbox.length > 1 && <button className="btn gold block" disabled={!!busy} onClick={() => accept(null)}>Принять всё ({inbox.length})</button>}
          </>
        )}
      </div>
    </Modal>
  );
}
