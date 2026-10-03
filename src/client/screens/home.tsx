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

function Wardrobe({ onClose }: { onClose: () => void }) {
  const { state, act, busy } = useGame();
  if (!state) return null;
  const owned = new Set(state.inventory.map((i) => i.id));
  const eq = state.look.equipped;
  const side = (slots: Slot[]) => (
    <div className="wd-side">
      {slots.map((slot) => {
        const items = ITEMS.filter((i) => i.slot === slot && owned.has(i.id));
        return (
          <div key={slot} className="wd-slot">
            <div className="tiny muted wd-slot-name">{SLOT_NAME[slot].toUpperCase()}</div>
            <div className="wd-items">
              {items.length === 0 && <span className="tiny dim">пусто</span>}
              {items.map((i) => {
                const on = eq[slot] === i.id;
                return (
                  <button key={i.id} className={`wear-pick rar-${i.rarity} ${on ? "on" : ""}`} disabled={!!busy} title={i.name} aria-label={i.name}
                    onClick={() => act(on ? "unequip" : "equip", on ? { slot } : { itemId: i.id })}>
                    <ItemArt id={i.id} size={32} />
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
  return (
    <Modal title="Гардероб" onClose={onClose} wide>
      <div className="wd">
        {side(LEFT_SLOTS)}
        <div className="wd-center"><Character equipped={eq} size={260} /></div>
        {side(RIGHT_SLOTS)}
      </div>
      <p className="tiny muted center" style={{ margin: "10px 0 0" }}>Нажми на вещь, чтобы надеть или снять. Новая одежда — в наградах локаций и в магазине.</p>
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
