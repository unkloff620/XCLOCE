"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useGame, useNow } from "../store.tsx";
import { Character } from "../art/character.tsx";
import { RoomScene } from "../art/scenes.tsx";
import { Icon } from "../art/icons.tsx";
import { ItemArt } from "../art/items.tsx";
import { Bar, Modal } from "../ui.tsx";
import { bossById } from "../../content/bosses.ts";
import { ITEMS, type Slot } from "../../content/items.ts";
import { clock, full } from "../format.ts";
import { BossPhoto } from "./boss-parts.tsx";
import { DailyWindow } from "./daily.tsx";

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

function Wardrobe({ onClose }: { onClose: () => void }) {
  const { state } = useGame();
  const [slot, setSlot] = useState<Slot | null>(null);
  if (!state) return null;
  const eq = state.look.equipped;
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
  return (
    <Modal title="Гардероб" onClose={onClose} wide>
      <div className="wd">
        <div className="wd-side">{LEFT_SLOTS.map(box)}</div>
        <div className="wd-center"><Character equipped={eq} size={260} /></div>
        <div className="wd-side">{RIGHT_SLOTS.map(box)}</div>
      </div>
      <p className="tiny muted center" style={{ margin: "10px 0 0" }}>Нажми на ячейку, чтобы выбрать вещь.</p>
      {slot && <SlotPicker slot={slot} onClose={() => setSlot(null)} />}
    </Modal>
  );
}

export function HomeScreen() {
  const { state } = useGame();
  const now = useNow();
  const [wardrobe, setWardrobe] = useState(false);
  const [daily, setDaily] = useState(false);
  const dailyReady = !!state?.daily.available;
  const busyWindow = (state?.pending.length ?? 0) > 0;
  useEffect(() => {
    if (dailyReady && !busyWindow && !dailyAutoShown) {
      dailyAutoShown = true;
      setDaily(true);
    }
  }, [dailyReady, busyWindow]);
  if (!state) return null;
  const f = state.fight;
  const fb = f ? bossById(f.bossId)! : null;
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="room">
        <RoomScene room={state.look.room} />
        <div className="room-char"><Character equipped={state.look.equipped} size={300} className="idle" /></div>
        <div className="room-right">
          <button className="side-btn" style={{ ["--c" as string]: "#b06bff" }} onClick={() => setWardrobe(true)}>
            <Icon name="shirt" size={34} />
            <span>Гардероб</span>
          </button>
          <button className={`side-btn ${state.daily.available ? "glow" : ""}`} style={{ ["--c" as string]: "#ffcc33" }} onClick={() => setDaily(true)}>
            <Icon name="gift" size={34} />
            <span>Бонус</span>
            {state.daily.available && <i className="side-dot" />}
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
    </div>
  );
}
