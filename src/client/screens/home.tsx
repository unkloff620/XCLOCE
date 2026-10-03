"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useGame, useNow } from "../store.tsx";
import { HeroRig } from "../art/rig.tsx";
import { HomeScene } from "../art/home-scene.tsx";
import { ROOM_BG } from "../../content/home-scene.ts";
import { Icon } from "../art/icons.tsx";
import { ItemArt } from "../art/items.tsx";
import { Bar, Modal } from "../ui.tsx";
import { bossById } from "../../content/bosses.ts";
import { ITEMS, type Slot } from "../../content/items.ts";
import { clock, full } from "../format.ts";
import { BossPhoto } from "./boss-parts.tsx";
import { DailyWindow } from "./daily.tsx";
import { BonusLine, EquipmentWindow } from "./house.tsx";
import { ROOM_DEFS } from "../../content/home.ts";
import { money } from "../format.ts";
import { Help } from "../help.tsx";
import { HAIR_COLORS, HAIR_STYLES, SKIN_TONES, type Look } from "../../content/home.ts";

/** Hairstyle, hair colour and skin tone editor. */
const LOOK_EDITOR = true;

/** The login reward pops up by itself once per app start; later only from the button. */
let dailyAutoShown = false;


const SLOT_NAME: Record<Slot, string> = { BODY: "Тело", PANTS: "Штаны", SHIRT: "Верх", SHOES: "Обувь", HEAD: "Голова", ACCESSORY: "Аксессуар", SPECIAL: "Особое" };

const LEFT_SLOTS: Slot[] = ["HEAD", "SHIRT", "ACCESSORY"];
const RIGHT_SLOTS: Slot[] = ["PANTS", "SHOES"];

const PICK_TITLE: Record<Slot, string> = { BODY: "Тело", PANTS: "Штаны", SHIRT: "Верх", SHOES: "Обувь", HEAD: "Головные уборы", ACCESSORY: "Аксессуары", SPECIAL: "Особое" };

/** Window with the owned things for one slot. */
function SlotPicker({ slot, onClose }: { slot: Slot; onClose: () => void }) {
  const { state, act, busy } = useGame();
  if (!state) return null;
  const owned = new Set(state.inventory.map((i) => i.id));
  const items = ITEMS.filter((i) => i.slot === slot && owned.has(i.id));
  const on = state.look.equipped[slot];
  const pick = async (id: string) => {
    const r = await act(id === on ? "unequip" : "equip", id === on ? { slot } : { itemId: id });
    if (r !== null) onClose();
  };
  return (
    <Modal title={PICK_TITLE[slot]} onClose={onClose}>
      {items.length === 0 ? (
        <div className="col center" style={{ gap: 10, alignItems: "center" }}>
          <div className="muted small">Пока нечего надеть. Вещи дают за локации, боссов и продают в магазине.</div>
          <Link href="/shop?tab=clothing" className="btn gold" onClick={onClose}>В магазин</Link>
        </div>
      ) : (
        <div className="pick-grid">
          {items.map((i) => (
            <button key={i.id} className={`pick-cell rar-${i.rarity} ${on === i.id ? "on" : ""}`} disabled={!!busy} onClick={() => pick(i.id)}>
              <ItemArt id={i.id} size={56} />
              <span className="pick-name">{i.name}</span>
              <span className={`tiny ${on === i.id ? "pick-off" : "muted"}`}>{on === i.id ? "Снять" : "Надеть"}</span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

/** Hairstyle, hair colour and skin tone. Changes are previewed live and saved with one button. */
function LookEditor({ draft, patch }: { draft: Look; patch: (p: Partial<Look>) => void }) {
  const row = (label: string, children: ReactNode) => (
    <div className="look-row">
      <div className="tiny muted">{label}</div>
      <div className="look-opts">{children}</div>
    </div>
  );
  return (
    <div className="col" style={{ gap: 10 }}>
      {row("ПРИЧЁСКА", HAIR_STYLES.map((h) => (
        <button key={h.id} className={`look-chip ${draft.hair === h.id ? "on" : ""}`} onClick={() => patch({ hair: h.id })}>{h.name}</button>
      )))}
      {draft.hair !== "bald" && row("ЦВЕТ ВОЛОС", HAIR_COLORS.map((c, i) => (
        <button key={c} className={`swatch ${draft.hairColor === i ? "on" : ""}`} style={{ background: c }} onClick={() => patch({ hairColor: i })} aria-label={`цвет волос ${i + 1}`} />
      )))}
      {row("ЦВЕТ КОЖИ", SKIN_TONES.map((t, i) => (
        <button key={t.base} className={`swatch ${draft.skin === i ? "on" : ""}`} style={{ background: t.base }} onClick={() => patch({ skin: i })} aria-label={`тон кожи ${i + 1}`} />
      )))}
    </div>
  );
}

function Wardrobe({ onClose }: { onClose: () => void }) {
  const { state, act, busy } = useGame();
  const [slot, setSlot] = useState<Slot | null>(null);
  const [tab, setTab] = useState<"clothes" | "look">("clothes");
  const [draft, setDraft] = useState<Look | null>(null);
  if (!state) return null;
  const eq = state.look.equipped;
  const look = draft ?? state.look.body;
  const changed = !!draft && JSON.stringify(draft) !== JSON.stringify(state.look.body);
  const box = (s: Slot) => {
    const id = eq[s];
    const def = id ? ITEMS.find((i) => i.id === id) : null;
    return (
      <button key={s} className={`wd-box ${def ? `filled rar-${def.rarity}` : ""}`} onClick={() => setSlot(s)} aria-label={`${SLOT_NAME[s]}: ${def?.name ?? "пусто"}`}>
        <span className="wd-box-name tiny">{SLOT_NAME[s]}</span>
        {def ? <ItemArt id={def.id} size={44} /> : <span className="wd-plus" aria-hidden="true">+</span>}
      </button>
    );
  };
  const save = async () => {
    if (!draft) return;
    const r = await act("look_set", { ...draft }, "Внешность сохранена");
    if (r) setDraft(null);
  };
  return (
    <Modal title="Гардероб" onClose={onClose} wide>
      <div className="tabs" style={{ marginBottom: 10 }}>
        <button className={tab === "clothes" ? "on" : ""} onClick={() => setTab("clothes")}>Одежда</button>
        {LOOK_EDITOR && <button className={tab === "look" ? "on" : ""} onClick={() => setTab("look")}>Внешность</button>}
      </div>
      {tab === "clothes" ? (
        <>
          <div className="wd">
            <div className="wd-side">{LEFT_SLOTS.map(box)}</div>
            <div className="wd-center"><HeroRig size={220} still look={state.look.body} worn={eq} /></div>
            <div className="wd-side">{RIGHT_SLOTS.map(box)}</div>
          </div>
          <p className="tiny muted center" style={{ margin: "10px 0 0" }}>Нажми на ячейку, чтобы выбрать вещь. Вещи без рисунка пока не видны на персонаже.</p>
        </>
      ) : (
        <div className="look-edit">
          <div className="wd-center look-preview"><HeroRig size={220} still look={look} worn={eq} /></div>
          <div className="grow col" style={{ gap: 10, minWidth: 0 }}>
            <LookEditor draft={look} patch={(p) => setDraft((d) => ({ ...(d ?? state.look.body), ...p }))} />
            <button className="btn green block" disabled={!changed || busy === "look_set"} onClick={save}>Сохранить</button>
          </div>
        </div>
      )}
      {slot && <SlotPicker slot={slot} onClose={() => setSlot(null)} />}
    </Modal>
  );
}

export function HomeScreen() {
  const { state, act, busy } = useGame();
  const now = useNow();
  const [wardrobe, setWardrobe] = useState(false);
  const [daily, setDaily] = useState(false);
  const [equip, setEquip] = useState<string | null | false>(false);
  // room browser: arrows flip through rooms; an owned room is switched to at once, a locked one is shown with "unlock"
  const [viewIdx, setViewIdx] = useState<number | null>(null);
  const dailyReady = !!state?.daily.available;
  const busyWindow = (state?.pending.length ?? 0) > 0;
  useEffect(() => {
    if (dailyReady && !busyWindow && !dailyAutoShown) {
      dailyAutoShown = true;
      setDaily(true);
    }
  }, [dailyReady, busyWindow]);
  if (!state) return null;
  const curIdx = Math.max(0, ROOM_DEFS.findIndex((r) => r.id === state.look.room));
  const idx = viewIdx ?? curIdx;
  const viewRoom = ROOM_DEFS[idx];
  const owned = state.home.rooms.includes(viewRoom.id);
  const canPay = !viewRoom.price || (state.wallet[viewRoom.price.currency] ?? 0) >= viewRoom.price.amount;
  const flip = (dir: number) => {
    const ni = idx + dir;
    if (ni < 0 || ni >= ROOM_DEFS.length) return;
    const r = ROOM_DEFS[ni];
    if (state.home.rooms.includes(r.id)) {
      setViewIdx(null);
      if (r.id !== state.look.room) void act("room_set", { id: r.id });
    } else {
      setViewIdx(ni);
    }
  };
  const unlock = async () => {
    const r = await act("room_buy", { id: viewRoom.id }, `Открыта комната «${viewRoom.name}»`);
    if (r) setViewIdx(null);
  };
  const f = state.fight;
  const fb = f ? bossById(f.bossId)! : null;
  return (
    <div className={`fit-page ${f && fb ? "has-fight" : ""}`}>
      <div className="room">
        <div className={`scene-backdrop ${owned ? "" : "locked"}`} style={{ backgroundImage: `url(/assets/home/${ROOM_BG[viewRoom.id] ?? ROOM_BG.basic}.webp)` }} />
        <div className={`room-view ${owned ? "" : "locked"}`}>
          <HomeScene room={viewRoom.id} look={state.look.body} worn={state.look.equipped} onPick={owned ? (id) => setEquip(id) : undefined} />
        </div>
        {idx > 0 && (
          <button className="room-arrow left" onClick={() => flip(-1)} aria-label="Предыдущая комната" disabled={busy === "room_set"}>‹</button>
        )}
        {idx < ROOM_DEFS.length - 1 && (
          <button className="room-arrow right" onClick={() => flip(1)} aria-label="Следующая комната" disabled={busy === "room_set"}>›</button>
        )}
        <div className="room-label">
          {owned ? (
            <span className="chip">{viewRoom.name}</span>
          ) : (
            <div className="room-unlock">
              <b className="display">{viewRoom.name}</b>
              <span className="tiny" style={{ color: "var(--gold)" }}><BonusLine b={viewRoom.bonus} /></span>
              <button className="btn gold sm" disabled={!canPay || busy === "room_buy"} onClick={unlock}>
                <Icon name="lock" size={16} /> Разблокировать <span className="room-price"><Icon name={viewRoom.price!.currency} size={15} />{money(viewRoom.price!.currency, viewRoom.price!.amount)}</span>
              </button>
              {!canPay && <span className="tiny" style={{ color: "#ff8a9e" }}>Не хватает {viewRoom.price!.currency}</span>}
            </div>
          )}
        </div>
        <div className="room-help">
          <Help topic="home" title="Твой дом">
            <p>Здесь живёт твой персонаж. В «Гардеробе» — одежда и внешность: причёска, цвет глаз и кожи.</p>
            <p>На заднем плане стоит оборудование: второй монитор, кресло, системник, RGB-подсветка. Нажми на любой предмет (или «Техника»), чтобы купить или улучшить его — оно даёт шанс и силу крита и прибавку к урону по боссам.</p>
            <p>Стрелки по бокам листают комнаты: купленная включается сразу, закрытую можно разблокировать кнопкой снизу. Каждая купленная комната даёт бонус.</p>
            <p>«Бонус» — награда за ежедневный вход.</p>
          </Help>
        </div>
        <div className="room-left">
          <button className="side-btn" style={{ ["--c" as string]: "#b06bff" }} onClick={() => setWardrobe(true)}>
            <Icon name="shirt" size={34} />
            <span>Гардероб</span>
          </button>
          <button className={`side-btn ${state.daily.available ? "glow" : ""}`} style={{ ["--c" as string]: "#ffcc33" }} onClick={() => setDaily(true)}>
            <Icon name="gift" size={34} />
            <span>Бонус</span>
            {state.daily.available && <i className="side-dot" />}
          </button>
          <button className="side-btn" style={{ ["--c" as string]: "#3fd2ff" }} onClick={() => setEquip(null)}>
            <Icon name="bolt" size={30} />
            <span>Техника</span>
          </button>
        </div>
      </div>

      {f && fb && (
        <Link href={`/bosses/${fb.id}`} className="fight-now" style={{ ["--acc" as string]: fb.theme.accent }}>
          <div className="fight-now-photo"><BossPhoto boss={fb} round /></div>
          <div className="grow col" style={{ gap: 5, minWidth: 0 }}>
            <div className="row" style={{ justifyContent: "space-between", gap: 6 }}>
              <span className="fight-now-tag display"><i className="live-dot" />ИДЁТ БОЙ</span>
              <span className="chip gold"><Icon name="clock" size={14} />{clock(f.endsAt - now)}</span>
            </div>
            <b className="display ellipsis" style={{ fontSize: 17 }}>{fb.name}</b>
            <Bar value={f.hp} max={f.hpMax} tone="red" label={`${full(f.hp)} / ${full(f.hpMax)} HP`} />
          </div>
          <span className="boss-go display">›</span>
        </Link>
      )}
      {wardrobe && <Wardrobe onClose={() => setWardrobe(false)} />}
      {daily && <DailyWindow onClose={() => setDaily(false)} />}
      {equip !== false && <EquipmentWindow focus={equip} onClose={() => setEquip(false)} />}
    </div>
  );
}
