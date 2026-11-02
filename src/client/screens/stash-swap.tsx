"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useGame } from "../store.tsx";
import { Modal } from "../ui.tsx";
import { ItemArt } from "../art/items.tsx";
import { itemById } from "../../content/items.ts";
import { STASH_SETS } from "../../content/stashes.ts";
import { CRAFT_PARTS } from "../../content/craft.ts";

const isPart = (id: string) => id.startsWith("part-");
/** one gift of a part may carry up to this many (server: swap.ts PART_GIFT_MAX) */
const PART_GIFT_MAX = 5;
const RARITY_GROUPS = [{ r: "common", name: "Обычные детали" }, { r: "rare", name: "Редкие детали" }, { r: "epic", name: "Очень редкие детали" }] as const;

/*
 * Нычки and craft parts between players. At home: «Попросить нычки и детали» — pick up to WISH_MAX stashes or parts you
 * need. In a player's profile: what he asks for, each with «Отправить» (a stash — one copy; a part — ×1 or ×5),
 * GIFTS_PER_DAY gifts a day.
 * The numbers are checked on the server (src/server/systems/swap.ts).
 */
export const WISH_MAX = 6;
export const GIFTS_PER_DAY = 6;

const qtyOf = (inv: { id: string; qty: number }[], id: string) => inv.find((i) => i.id === id)?.qty ?? 0;

export function StashWishWindow({ onClose }: { onClose: () => void }) {
  const { state, act, busy } = useGame();
  const [pick, setPick] = useState<string[]>(state?.stashWish ?? []);
  const [tab, setTab] = useState<"stash" | "parts">("stash");
  if (!state) return null;
  const toggle = (id: string) => setPick((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= WISH_MAX ? p : [...p, id]));
  const pickedStash = pick.filter((id) => !isPart(id)).length;
  const changed = JSON.stringify([...pick].sort()) !== JSON.stringify([...(state.stashWish ?? [])].sort());
  const save = async () => {
    if ((await act("stash_wish", { items: pick }, pick.length ? "Просьба сохранена — её видно в твоём профиле" : "Просьба снята")) !== null) onClose();
  };
  const gifts = state.stashGifts ?? [];
  return (
    <Modal title="Попросить нычки и детали" onClose={onClose}>
      <div className="col" style={{ gap: 10 }}>
        <p className="small" style={{ margin: 0 }}>
          Выбери до {WISH_MAX} нычек или деталей, которых не хватает. Их увидят в твоём профиле, и любой игрок сможет прислать тебе свои — до {GIFTS_PER_DAY} подарков в день от каждого (деталей — до {PART_GIFT_MAX} штук за раз).
        </p>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <b className="small">Выбрано: <span className="num">{pick.length}/{WISH_MAX}</span></b>
          {pick.length > 0 && <button className="btn dark sm" onClick={() => setPick([])}>Сбросить</button>}
        </div>
        {/* everything asked for, from both tabs: a tap takes it off (the limit is shared by the stashes and the parts) */}
        {pick.length > 0 && (
          <div className="swap-picked">
            {pick.map((id) => (
              <button key={id} type="button" className="swap-tile on sm" onClick={() => toggle(id)} title={`${itemById(id)?.name ?? id} — убрать`} aria-label={`Убрать: ${itemById(id)?.name ?? id}`}>
                <ItemArt id={id} size={30} />
                <span className="swap-x" aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        )}
        <div className="cf-tabs">
          <button type="button" className={`cf-tab ${tab === "stash" ? "on" : ""}`} onClick={() => setTab("stash")}>Нычки{pickedStash > 0 && <b className="swap-tab-n num">{pickedStash}</b>}</button>
          <button type="button" className={`cf-tab ${tab === "parts" ? "on" : ""}`} onClick={() => setTab("parts")}>Детали{pick.length - pickedStash > 0 && <b className="swap-tab-n num">{pick.length - pickedStash}</b>}</button>
        </div>
        {pick.length >= WISH_MAX && <p className="tiny muted" style={{ margin: 0 }}>Выбрано {WISH_MAX} из {WISH_MAX} — чтобы попросить другое, убери что-то из выбранного выше.</p>}
        <div className="col swap-sets">
          {tab === "parts" && RARITY_GROUPS.map((g) => (
            <div key={g.r} className="swap-set">
              <span className="tiny muted">{g.name}</span>
              <div className="swap-row">
                {CRAFT_PARTS.filter((p) => p.rarity === g.r).map((it) => {
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
          {tab === "stash" && STASH_SETS.map((set) => (
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
                <span className="ellipsis grow">{itemById(g.itemId)?.name ?? g.itemId}{(g.qty ?? 1) > 1 && ` ×${g.qty}`}</span>
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
  const send = async (id: string, qty = 1) => {
    const r = await act<{ left: number }>("stash_gift", { to, itemId: id, qty }, `«${itemById(id)?.name ?? id}»${qty > 1 ? ` ×${qty}` : ""} — отправлено, ${name} скажет спасибо`);
    if (r) onSent();
  };
  return (
    <div className="panel col" style={{ gap: 8 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="small muted">ПРОСИТ НЫЧКИ И ДЕТАЛИ</span>
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
              {isPart(id) ? (
                <span className="row" style={{ gap: 4, width: "100%" }}>
                  <button className="btn gold sm grow" disabled={have < 1 || give.left < 1 || busy === "stash_gift"} onClick={() => send(id, 1)}>×1</button>
                  <button className="btn gold sm grow" disabled={have < PART_GIFT_MAX || give.left < 1 || busy === "stash_gift"} onClick={() => send(id, PART_GIFT_MAX)}>×{PART_GIFT_MAX}</button>
                </span>
              ) : <button className="btn gold sm block" disabled={have < 1 || give.left < 1 || busy === "stash_gift"} onClick={() => send(id)}>Отправить</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** «Сообщения»: the stashes other players sent — accept one or all, they go to the inventory. */
/** what a message from another player says */
function noteText(n: { kind: string; from: string; meta: Record<string, unknown> }) {
  if (n.kind === "spit") return <>В тебя харкнул <b>{n.from}</b></>;
  if (n.kind === "fight") {
    const won = n.meta.won === true;
    return won
      ? <><b>{n.from}</b> наехал на тебя и победил — бицуха {String(n.meta.mine ?? 0)} против твоей {String(n.meta.theirs ?? 0)}</>
      : <><b>{n.from}</b> наехал на тебя, но ты отбился — бицуха {String(n.meta.mine ?? 0)} против твоей {String(n.meta.theirs ?? 0)}</>;
  }
  return <>Сообщение от <b>{n.from}</b></>;
}

/** how many messages wait: gifts to accept and unread notes */
export function messagesWaiting(state: { stashInbox?: unknown[]; notes?: { unread: boolean }[] } | null) {
  return (state?.stashInbox?.length ?? 0) + (state?.notes?.filter((n) => n.unread).length ?? 0);
}

export function MessagesWindow({ onClose }: { onClose: () => void }) {
  const { state, act, busy, refresh } = useGame();
  // what was sent a moment ago shows up right away, not on the next poll
  useEffect(() => { void refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const unread = state?.notes?.some((n) => n.unread) ?? false;
  // opening the window reads the notes
  useEffect(() => {
    if (unread) void act("notes_read", {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!state) return null;
  const notes = state.notes ?? [];
  const inbox = state.stashInbox ?? [];
  const accept = (id: number | null) => act("stash_accept", id === null ? {} : { id }, id === null ? "Все подарки на складе" : "Подарок на складе");
  const when = (t: number) => new Date(t).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  // one feed, the newest on top: the gifts to accept and the notes (spits, fights)
  const feed = [
    ...inbox.map((g) => ({ t: g.at, key: `g${g.id}`, gift: g, note: null as null | (typeof notes)[number] })),
    ...notes.map((n) => ({ t: n.at, key: `n${n.id}`, gift: null as null | (typeof inbox)[number], note: n })),
  ].sort((x, y) => y.t - x.t);
  return (
    <Modal title="Сообщения" onClose={onClose}>
      <div className="col" style={{ gap: 10 }}>
        {inbox.length > 1 && <button className="btn gold sm" style={{ alignSelf: "flex-end" }} disabled={!!busy} onClick={() => accept(null)}>Принять все подарки ({inbox.length})</button>}
        {feed.length === 0 && <p className="small muted" style={{ margin: 0, textAlign: "center" }}>Новых сообщений нет. Попроси нычки в меню дома — когда тебе их пришлют, подарки появятся здесь.</p>}
        <div className="col" style={{ gap: 6 }}>
          {feed.map(({ key, gift: g, note: n }) => g ? (
            <div key={key} className="msg-row gift new">
              <ItemArt id={g.itemId} size={40} />
              <div className="grow" style={{ minWidth: 0 }}>
                <b className="small ellipsis" style={{ display: "block" }}>{itemById(g.itemId)?.name ?? g.itemId}{(g.qty ?? 1) > 1 && ` ×${g.qty}`}</b>
                <span className="tiny muted">подарок от <Link href={`/profile?id=${g.fromId}`} onClick={onClose}>{g.from}</Link> · {when(g.at)}</span>
              </div>
              <button className="btn green sm" disabled={!!busy} onClick={() => accept(g.id)}>Принять</button>
            </div>
          ) : n && (
            <div key={key} className={`msg-row note ${n.kind} ${n.unread ? "new" : ""}`}>
              <span className="msg-ico" aria-hidden="true">{n.kind === "spit" ? "💦" : n.kind === "fight" ? "👊" : "✉️"}</span>
              <div className="grow" style={{ minWidth: 0 }}>
                <span className="small">{n.fromId ? <Link href={`/profile?id=${n.fromId}`} onClick={onClose} className="msg-who">{noteText(n)}</Link> : noteText(n)}</span>
                <span className="tiny muted" style={{ display: "block" }}>{when(n.at)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
