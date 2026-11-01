"use client";
/*
 * «Крафт» (content/craft.ts, server/systems/craft.ts) — the tab instead of «Инвентарь».
 * On top, fixed while the cards scroll: «Заныкано» — 12 blueprint cells drawn on crumpled paper (two blocks of 3×2),
 * a tap on a full cell takes the thing back to the store; under them what the stash gives and its «крутизна».
 * Below — the cards of every part and thing (filters: все / мои / детали / ур. 1…), no buttons: press and hold a card,
 * then drag it onto an empty cell to put one in the stash; a tap on a thing that is made opens its scheme on paper
 * («Схема создания вещи»: the ingredients with have/need, the arrow, the result, «Создать»).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useGame } from "../store.tsx";
import { ItemArt } from "../art/items.tsx";
import { Icon } from "../art/icons.tsx";
import { Modal } from "../ui.tsx";
import { Help } from "../help.tsx";
import { haptic } from "../telegram.ts";
import { sfx } from "../sound.ts";
import { full } from "../format.ts";
import { itemById } from "../../content/items.ts";
import { BicepsArt } from "./profile.tsx";
import { StashWishWindow } from "./stash-swap.tsx";
import { CRAFT_ALL, CRAFT_BLOCK_BONUS, CRAFT_BOXES, CRAFT_BOX_PRICES, CRAFT_BOX_TALENTS, CRAFT_LEVEL_NAME, craftBonusOf, craftById, craftBoxesOpen, type CraftBonus, type CraftDef } from "../../content/craft.ts";
import { talentsForDamage } from "../../content/talents.ts";

type Filter = "all" | "mine" | 0 | 1 | 2 | 3;

/** a bonus as lines: an icon and «+N …»; `on` — it works now (the thing lies in the stash) */
function BonusLines({ b, on }: { b: CraftBonus; on?: boolean }) {
  const lines: { key: string; icon: React.ReactNode; text: string }[] = [];
  if (b.energy) lines.push({ key: "e", icon: <Icon name="energy" size={16} />, text: `+${b.energy} к лимиту энергии` });
  if (b.biceps) lines.push({ key: "b", icon: <BicepsArt size={16} />, text: `+${full(b.biceps)} к бицухе` });
  if (b.clock) lines.push({ key: "c", icon: <Icon name="clock" size={16} />, text: `+${b.clock} мин к бою с боссом` });
  for (const [w, v] of Object.entries(b.dmg ?? {})) if (v) lines.push({ key: w, icon: <ItemArt id={w} size={16} />, text: `+${v} урона: ${itemById(w)?.name ?? w}` });
  return (
    <span className="cf-bonus">
      {lines.map((l) => <span key={l.key} className={on ? "on" : ""}>{l.icon}<span className="grow">{l.text}</span>{on && <b className="cf-ok" aria-label="действует">✓</b>}</span>)}
    </span>
  );
}

export function CraftScreen() {
  const { state, act, busy, toast } = useGame();
  const [filter, setFilter] = useState<Filter>("all");
  const [recipe, setRecipe] = useState<CraftDef | null>(null);
  const [ask, setAsk] = useState(false);
  const boxes = state?.craftBoxes ?? Array.from({ length: CRAFT_BOXES }, () => null);
  const qty = useMemo(() => new Map((state?.inventory ?? []).map((i) => [i.id, i.qty])), [state?.inventory]);
  const inBox = new Map<string, number>();
  for (const id of boxes) if (id) inBox.set(id, (inBox.get(id) ?? 0) + 1);
  const total = craftBonusOf(boxes);
  // the cells go down the columns (slot = block·6 + column·2 + row); they become available with the talents earned
  // and are bought for roubles in order: `open` — bought, `avail` — allowed by the talents
  const open = state?.craftBoxesOpen ?? 0;
  const avail = craftBoxesOpen(talentsForDamage(state?.player.talentDamage ?? 0));
  const [shake, setShake] = useState<{ slot: number; key: number } | null>(null);
  const [buy, setBuy] = useState<number | null>(null);
  const [opening, setOpening] = useState<number | null>(null);
  const tapLock = (slot: number) => {
    if (slot === open && slot < avail) { haptic.tap(); setBuy(slot); return; }
    haptic.err();
    setShake({ slot, key: Date.now() });
    toast(slot > open ? "Сначала открой ячейки по порядку" : `Ячейка откроется, когда будет ${CRAFT_BOX_TALENTS[slot]} талантов`, "err");
  };
  const buyBox = async (slot: number) => {
    const r = await act<{ slot: number }>("craft_box_buy", {}, () => "Ячейка открыта");
    setBuy(null);
    if (!r) return;
    haptic.big(); sfx("coinsoft");
    setOpening(slot);
    setTimeout(() => setOpening((o) => (o === slot ? null : o)), 900);
  };
  const levels = [...new Set(CRAFT_ALL.map((c) => c.level))].sort();
  const list = CRAFT_ALL
    .filter((c) => filter === "all" || (filter === "mine" ? (qty.get(c.id) ?? 0) + (inBox.get(c.id) ?? 0) > 0 : c.level === filter))
    // the ones you have first, then by level
    .sort((a, b) => Number((qty.get(b.id) ?? 0) > 0) - Number((qty.get(a.id) ?? 0) > 0) || a.level - b.level);

  const put = async (id: string, slot: number) => {
    const r = await act("craft_put", { itemId: id, slot }, () => `${craftById(id)?.name} — в заныке`);
    if (r) { haptic.ok(); sfx("coinsoft"); }
  };
  const take = async (slot: number) => {
    const r = await act("craft_take", { slot }, () => "Вернул на склад");
    if (r) haptic.tap();
  };
  const make = async (d: CraftDef) => {
    const r = await act("craft_make", { itemId: d.id }, () => `Собрано: ${d.name}`);
    if (r) { haptic.big(); sfx("victory"); }
  };

  // ---- press, hold and drag a card onto an empty cell ----
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; over: number | null } | null>(null);
  const press = useRef<{ id: string; x: number; y: number; timer: number; pid: number } | null>(null);
  const dragging = useRef(false);
  const dropped = useRef(0);
  const slotAt = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest("[data-slot]") as HTMLElement | null;
    return el ? Number(el.dataset.slot) : null;
  };
  useEffect(() => {
    // while dragging the page must not scroll under the finger
    const stop = (e: TouchEvent) => { if (dragging.current) e.preventDefault(); };
    document.addEventListener("touchmove", stop, { passive: false });
    return () => document.removeEventListener("touchmove", stop);
  }, []);
  const onDown = (e: React.PointerEvent, c: CraftDef) => {
    if ((qty.get(c.id) ?? 0) < 1) return;
    const { clientX: x, clientY: y, pointerId } = e;
    // the moves and the release come to this card even when the finger is over a cell
    try { (e.currentTarget as HTMLElement).setPointerCapture(pointerId); } catch { /* not supported */ }
    const timer = window.setTimeout(() => {
      dragging.current = true;
      haptic.tap();
      setDrag({ id: c.id, x, y, over: null });
    }, 320);
    press.current = { id: c.id, x, y, timer, pid: pointerId };
  };
  const onMove = (e: React.PointerEvent) => {
    const p = press.current;
    if (!p) return;
    if (!dragging.current) {
      // moved before the hold: it is a scroll, not a drag
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) { clearTimeout(p.timer); press.current = null; }
      return;
    }
    const over = slotAt(e.clientX, e.clientY);
    setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY, over: over !== null && over < open && !boxes[over] ? over : null } : d));
  };
  const onUp = (e: React.PointerEvent) => {
    const p = press.current;
    press.current = null;
    if (p) clearTimeout(p.timer);
    if (!dragging.current) return;
    dragging.current = false;
    dropped.current = Date.now(); // the click that follows the release is not a tap
    const slot = slotAt(e.clientX, e.clientY);
    setDrag(null);
    if (slot === null) return;
    if (slot >= open) { haptic.err(); toast(`Ячейка закрыта — откроется, когда будет ${CRAFT_BOX_TALENTS[slot]} талантов`, "err"); return; }
    if (boxes[slot]) { haptic.err(); toast("Ячейка занята — перетащи в свободную", "err"); return; }
    if (p) void put(p.id, slot);
  };
  const onCancel = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
    if (dragging.current) { dragging.current = false; setDrag(null); }
  };
  const tapCard = (c: CraftDef) => {
    if (dragging.current || Date.now() - dropped.current < 400) return;
    if (c.recipe) { haptic.tap(); setRecipe(c); return; }
    toast(`${c.name}: удерживай и перетащи в свободную ячейку, чтобы заныкать`, "info");
  };

  return (
    <div className="col cf-page" style={{ gap: 10 }}>
      <div className="title" style={{ margin: 0 }}>
        <div className="title-row">
          <h2 className="display" style={{ margin: 0 }}>Крафт</h2>
          <button type="button" className="btn sm gold cf-ask" onClick={() => { haptic.tap(); setAsk(true); }}>Попросить детали</button>
          <Help topic="craft" title="Крафт">
            <ul>
              <li>Детали собираются в вещи: на вещь 1 уровня нужно 5 разных деталей по 5 штук. Из вещей потом соберутся вещи посильнее.</li>
              <li>Бонус даёт только то, что лежит в <b>заныке</b> — 12 ячеек сверху, по одной штуке в ячейку.</li>
              <li>Ячейки открываются по порядку: когда хватает талантов (первая — с 1, последняя — со 150), замок светится — нажми и открой за рубли (от 1 000 до 30 000 ₽). Заполнишь все 6 левых — ещё +15 к энергии, все 6 правых — +100 к бицухе.</li>
              <li>Вещи 3 уровня — оружие: новые удары по боссам, появляются в бою рядом с остальным оружием.</li>
              <li>Чтобы заныкать: нажми на карточку, подержи и перетащи в свободную ячейку. Нажми на ячейку — вещь вернётся на склад.</li>
              <li>Нажми на вещь, которая собирается, — откроется схема: что нужно и сколько уже есть.</li>
              <li>Детали падают почти отовсюду, понемногу и наугад: двор, задания и закрытие локаций, боссы (в «Блатном» и «Авторитетном» — больше и с фирменной очень редкой деталью босса), ящик ништяков, вход и сундук дня, мини-игры, таракан и голуби, наезды, клан-босс.</li>
              <li>Барыга в гараже каждый день продаёт несколько деталей и скупает лишние. Ненужную вещь 1–2 уровня можно разобрать — вернётся примерно 40% деталей.</li>
              <li>«Попросить детали» — просьба видна в твоём профиле, другие игроки могут прислать до 5 штук за раз.</li>
            </ul>
          </Help>
        </div>
      </div>

      {/* the stash: fixed on top; 12 blueprint cells on crumpled paper, two blocks of 3×2 */}
      <div className="cf-stash">
        <b className="display cf-h">Заныкано</b>
        <div className="cf-cells">
          {[0, 1].map((half) => {
            const filled = boxes.slice(half * 6, half * 6 + 6).filter(Boolean).length;
            const bb = CRAFT_BLOCK_BONUS[half];
            return (
              <div key={half} className="cf-blockwrap">
                <div className="cf-block">
                  {[0, 1].flatMap((row) => [0, 1, 2].map((col) => {
                    const slot = half * 6 + col * 2 + row;
                    const id = boxes[slot];
                    const locked = slot >= open;
                    const ready = locked && slot === open && slot < avail;
                    return (
                      <button key={slot} type="button" data-slot={slot} className={`cf-cell ${id ? "full" : ""} ${locked ? "locked" : ""} ${ready ? "ready" : ""} ${drag?.over === slot ? "over" : ""}`}
                        disabled={(!id && !locked) || !!busy} onClick={() => (locked ? tapLock(slot) : id && take(slot))}
                        title={ready ? `Открыть за ${full(CRAFT_BOX_PRICES[slot])} ₽` : locked ? `Откроется, когда будет ${CRAFT_BOX_TALENTS[slot]} талантов` : id ? `${craftById(id)?.name} — нажми, чтобы вытащить` : "Пусто"}
                        aria-label={ready ? "Открыть ячейку" : locked ? "Закрытая ячейка" : id ? `Вытащить: ${craftById(id)?.name}` : "Пустая ячейка"}>
                        {id ? <ItemArt id={id} size={40} /> : locked ? (
                          <span key={shake?.slot === slot ? shake.key : 0} className={`cf-lock ${shake?.slot === slot ? "shake" : ""}`}><Icon name="lock" size={18} /></span>
                        ) : opening === slot && <span className="cf-lock opening"><Icon name="lock" size={18} /></span>}
                      </button>
                    );
                  }))}
                </div>
                {/* all six full: the block's own bonus */}
                <span className={`cf-blockbonus ${filled === 6 ? "on" : ""}`}>
                  {filled === 6 ? "✓ " : `${filled}/6 · `}{bb.energy ? `+${bb.energy} к энергии` : `+${bb.biceps} к бицухе`}
                </span>
              </div>
            );
          })}
        </div>
        <div className="cf-total">
          {total.power > 0 ? <BonusLines b={total} /> : <span className="tiny cf-sub">Удерживай карточку и перетащи в ячейку — бонус заработает.</span>}
          <span className="cf-power">Крутизна: <b className="num">{full(total.power)}</b></span>
        </div>
      </div>

      {/* the filters: all, mine, then by level */}
      <div className="cf-tabs">
        {(["all", "mine", ...levels] as Filter[]).map((f) => (
          <button key={String(f)} type="button" className={`cf-tab ${filter === f ? "on" : ""}`} onClick={() => setFilter(f)}>
            {f === "all" ? "Все" : f === "mine" ? "Мои" : f === 0 ? "Детали" : `${f} ур.`}
          </button>
        ))}
      </div>

      <div className="cf-grid">
        {list.map((c) => {
          const have = qty.get(c.id) ?? 0;
          const boxed = inBox.get(c.id) ?? 0;
          return (
            <div key={c.id} className={`cf-card r-${c.rarity} ${have ? "" : "none"} ${drag?.id === c.id ? "lifted" : ""}`} role="button" tabIndex={0}
              onPointerDown={(e) => onDown(e, c)} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel} onContextMenu={(e) => e.preventDefault()}
              onClick={() => tapCard(c)}>
              <div className="cf-card-top">
                <span className="cf-pic"><ItemArt id={c.id} size={48} />{have > 0 && <i className="cf-n num">×{full(have)}</i>}</span>
                <span className="col" style={{ minWidth: 0 }}>
                  <b className="small ellipsis">{c.name}</b>
                  <span className="tiny cf-sub">{CRAFT_LEVEL_NAME[c.level]}{boxed > 0 && ` · в заныке ${boxed}`}</span>
                </span>
              </div>
              <BonusLines b={c.bonus} on={boxed > 0} />
              <span className="tiny cf-sub">Крутизна +{c.power}</span>
            </div>
          );
        })}
      </div>

      {/* the card under the finger while dragging */}
      {drag && <span className="cf-ghost" style={{ left: drag.x, top: drag.y }}><ItemArt id={drag.id} size={56} /></span>}

      {buy !== null && (
        <Modal title="Открыть ячейку" onClose={() => setBuy(null)}>
          <div className="cf-buy">
            <span className="cf-lock big"><Icon name="lock" size={40} /></span>
            <p className="small" style={{ margin: 0 }}>Новая ячейка в заныке — ещё одна вещь будет давать бонус.</p>
            <button type="button" className="btn gold block" disabled={!!busy || (state?.wallet.RUB ?? 0) < CRAFT_BOX_PRICES[buy]} onClick={() => buyBox(buy)}>
              {(state?.wallet.RUB ?? 0) < CRAFT_BOX_PRICES[buy] ? `Не хватает · ${full(CRAFT_BOX_PRICES[buy])} ₽` : `Открыть за ${full(CRAFT_BOX_PRICES[buy])} ₽`}
            </button>
          </div>
        </Modal>
      )}

      {recipe && <Scheme d={recipe} qty={qty} busy={!!busy} onMake={() => make(recipe)} onOpen={setRecipe} onClose={() => setRecipe(null)}
        onSplit={async () => { const r = await act<{ back: { id: string; qty: number }[] }>("craft_split", { itemId: recipe.id }, (x) => `Разобрано: вернулось ${x.back.reduce((t, b) => t + b.qty, 0)} шт.`); if (r) haptic.ok(); }} />}
      {ask && <StashWishWindow onClose={() => setAsk(false)} />}
    </div>
  );
}

/** «Схема создания вещи»: a sheet of paper — the ingredients (a picture, have/need; one that is made itself — «Собрать»
 * opens its own scheme), an arrow, the result and «Создать». */
function Scheme({ d, qty, busy, onMake, onOpen, onClose, onSplit }: { d: CraftDef; qty: Map<string, number>; busy: boolean; onMake: () => void; onOpen: (d: CraftDef) => void; onClose: () => void; onSplit: () => void }) {
  const [sure, setSure] = useState(false);
  const own = qty.get(d.id) ?? 0;
  const parts = d.recipe ?? [];
  const lacks = parts.some((r) => (qty.get(r.id) ?? 0) < r.qty);
  const cols = [parts.slice(0, 3), parts.slice(3)];
  return (
    <Modal onClose={onClose} className="cf-scheme-modal">
      <div className="cf-scheme">
        <div className="cf-scheme-body">
          {cols.map((col, i) => (
            <div key={i} className="cf-scheme-col">
              {col.map((r) => {
                const h = qty.get(r.id) ?? 0;
                const sub = craftById(r.id);
                return (
                  <span key={r.id} className={`cf-ing ${h >= r.qty ? "ok" : ""}`} title={sub?.name}>
                    <span className="cf-ing-pic"><ItemArt id={r.id} size={46} /></span>
                    <b className="num">{full(h)}/{r.qty}</b>
                    {sub?.recipe && <button type="button" className="cf-ing-btn" onClick={() => onOpen(sub)}>Собрать</button>}
                    <i className="cf-ing-name">{sub?.name}</i>
                  </span>
                );
              })}
            </div>
          ))}
          <span className="cf-scheme-arrow" aria-hidden="true">⟶</span>
          <span className="cf-scheme-res">
            <span className="cf-ing-pic big"><ItemArt id={d.id} size={64} /></span>
            <b className="small">{d.name}</b>
            <button type="button" className="cf-ing-btn go" disabled={busy || lacks} onClick={onMake}>Создать</button>
          </span>
        </div>
        <div className="cf-scheme-foot">
          <BonusLines b={d.bonus} />
          {/* a thing you have (level 1–2): take it apart, about 40% of the ingredients come back */}
          {own > 0 && d.level <= 2 && (
            <button type="button" className="cf-ing-btn split" disabled={busy} onClick={() => (sure ? (setSure(false), onSplit()) : setSure(true))}>
              {sure ? "Точно разобрать?" : `Разобрать (есть ${own})`}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
