"use client";
/*
 * «Крафт» (content/craft.ts, server/systems/craft.ts) — the tab instead of «Инвентарь».
 * On top «Заныкано»: 12 cells (two blocks of 3×2); a tap on a full cell takes the thing back to the store. Under them —
 * what the stash gives in all and its «крутизна». Below — the cards of every part and thing, sorted by level (filters:
 * все / мои / детали / ур. 1…): the count, what one gives, «Заныкать» (into the first empty cell) and, for the things
 * that are made, «Собрать» — the recipe window: five ingredients, have/need, the result.
 */
import { useMemo, useState } from "react";
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
import { CRAFT_ALL, CRAFT_BOXES, CRAFT_LEVEL_NAME, craftBonusOf, craftById, type CraftBonus, type CraftDef } from "../../content/craft.ts";

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
  const { state, act, busy } = useGame();
  const [filter, setFilter] = useState<Filter>("all");
  const [recipe, setRecipe] = useState<CraftDef | null>(null);
  const boxes = state?.craftBoxes ?? Array.from({ length: CRAFT_BOXES }, () => null);
  const qty = useMemo(() => new Map((state?.inventory ?? []).map((i) => [i.id, i.qty])), [state?.inventory]);
  const inBox = new Map<string, number>();
  for (const id of boxes) if (id) inBox.set(id, (inBox.get(id) ?? 0) + 1);
  const total = craftBonusOf(boxes);
  const free = boxes.some((b) => !b);
  const levels = [...new Set(CRAFT_ALL.map((c) => c.level))].sort();
  const list = CRAFT_ALL
    .filter((c) => filter === "all" || (filter === "mine" ? (qty.get(c.id) ?? 0) + (inBox.get(c.id) ?? 0) > 0 : c.level === filter))
    // the ones you have first, then by level and rarity
    .sort((a, b) => Number((qty.get(b.id) ?? 0) > 0) - Number((qty.get(a.id) ?? 0) > 0) || a.level - b.level);

  const put = async (id: string) => {
    const r = await act("craft_put", { itemId: id }, () => `${craftById(id)?.name} — в заныке`);
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

  return (
    <div className="col cf-page" style={{ gap: 10 }}>
      <div className="title" style={{ margin: 0 }}>
        <div className="title-row">
          <h2 className="display" style={{ margin: 0 }}>Крафт</h2>
          <Help topic="craft" title="Крафт">
            <ul>
              <li>Детали собираются в вещи: на вещь 1 уровня нужно 5 разных деталей по 5 штук. Из вещей потом соберутся вещи посильнее.</li>
              <li>Бонус даёт только то, что лежит в <b>заныке</b> — 12 ячеек сверху, по одной штуке в ячейку. Нажми на ячейку — вещь вернётся на склад.</li>
              <li>«Заныкать» на карточке кладёт одну штуку в первую свободную ячейку. Зелёная галочка — бонус уже действует.</li>
              <li>Откуда падают детали — скоро.</li>
            </ul>
          </Help>
        </div>
      </div>

      {/* the stash: 12 cells in two blocks of 3×2 */}
      <div className="panel cf-stash">
        <b className="display cf-h">Заныкано</b>
        <div className="cf-cells">
          {[0, 1].map((half) => (
            <div key={half} className="cf-block">
              {boxes.slice(half * 6, half * 6 + 6).map((id, k) => {
                const slot = half * 6 + k;
                return (
                  <button key={slot} type="button" className={`cf-cell ${id ? "full" : ""}`} disabled={!id || !!busy} onClick={() => id && take(slot)}
                    title={id ? `${craftById(id)?.name} — нажми, чтобы вытащить` : "Пусто"} aria-label={id ? `Вытащить: ${craftById(id)?.name}` : "Пустая ячейка"}>
                    {id && <ItemArt id={id} size={40} />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="cf-total">
          <span className="small"><b>Заныканное усиливает:</b></span>
          {total.power > 0 ? <BonusLines b={total} /> : <span className="tiny cf-sub">Пока ничего — положи детали или вещи в ячейки.</span>}
          <span className="cf-power">Общая крутизна: <b className="num">{full(total.power)}</b></span>
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
            <div key={c.id} className={`cf-card r-${c.rarity} ${have ? "" : "none"}`}>
              <div className="cf-card-top">
                <span className="cf-pic"><ItemArt id={c.id} size={48} />{have > 0 && <i className="cf-n num">×{full(have)}</i>}</span>
                <span className="col" style={{ minWidth: 0 }}>
                  <b className="small ellipsis">{c.name}</b>
                  <span className="tiny cf-sub">{CRAFT_LEVEL_NAME[c.level]}{boxed > 0 && ` · в заныке ${boxed}`}</span>
                </span>
              </div>
              <BonusLines b={c.bonus} on={boxed > 0} />
              <span className="tiny cf-sub">Крутизна +{c.power}</span>
              <div className="cf-btns">
                {c.recipe && <button type="button" className="btn sm green" onClick={() => { haptic.tap(); setRecipe(c); }}>Собрать</button>}
                <button type="button" className="btn sm gold" disabled={!have || !free || !!busy} onClick={() => put(c.id)} title={!free ? "Все ячейки заняты" : ""}>Заныкать</button>
              </div>
            </div>
          );
        })}
      </div>

      {recipe && (
        <Modal title="Схема сборки" onClose={() => setRecipe(null)}>
          <div className="cf-recipe">
            <div className="cf-parts">
              {recipe.recipe!.map((r) => {
                const h = qty.get(r.id) ?? 0;
                return (
                  <span key={r.id} className={`cf-part ${h >= r.qty ? "ok" : ""}`}>
                    <ItemArt id={r.id} size={44} />
                    <b className="tiny ellipsis">{craftById(r.id)?.name}</b>
                    <span className="num small">{full(h)}/{r.qty}</span>
                  </span>
                );
              })}
            </div>
            <span className="cf-arrow" aria-hidden="true">➜</span>
            <span className="cf-result"><ItemArt id={recipe.id} size={64} /><b className="small">{recipe.name}</b></span>
          </div>
          <BonusLines b={recipe.bonus} />
          <button type="button" className="btn green block" style={{ marginTop: 10 }}
            disabled={!!busy || recipe.recipe!.some((r) => (qty.get(r.id) ?? 0) < r.qty)} onClick={() => make(recipe)}>
            {recipe.recipe!.some((r) => (qty.get(r.id) ?? 0) < r.qty) ? "Не хватает деталей" : "Собрать"}
          </button>
        </Modal>
      )}
    </div>
  );
}
