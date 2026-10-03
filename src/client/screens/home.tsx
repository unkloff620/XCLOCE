"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useGame, useNow } from "../store.tsx";
import { Character } from "../art/character.tsx";
import { RoomScene } from "../art/scenes.tsx";
import { Icon } from "../art/icons.tsx";
import { ItemArt } from "../art/items.tsx";
import { Bar, Modal } from "../ui.tsx";
import { bossById, BOSSES } from "../../content/bosses.ts";
import { ITEMS, WEARABLE_SLOTS, type Slot } from "../../content/items.ts";
import { clock, full } from "../format.ts";
import { BossPhoto } from "./boss-parts.tsx";
import { DailyWindow } from "./daily.tsx";

/** The login reward pops up by itself once per app start; later only from the button. */
let dailyAutoShown = false;

const SIDE = [
  { href: "/shop", icon: "shop", label: "Магазин", c: "#ff4d6d" },
  { href: "/shop?tab=exchange", icon: "exchange", label: "Обменник", c: "#3fd2ff" },
  { href: "/locations", icon: "map", label: "Локации", c: "#3ddc84" },
] as const;

const SLOT_NAME: Record<Slot, string> = { BODY: "Тело", PANTS: "Штаны", SHIRT: "Верх", SHOES: "Обувь", HEAD: "Голова", ACCESSORY: "Аксессуар", SPECIAL: "Особое" };

function Wardrobe({ onClose }: { onClose: () => void }) {
  const { state, act, busy } = useGame();
  if (!state) return null;
  const owned = new Set(state.inventory.map((i) => i.id));
  const eq = state.look.equipped;
  return (
    <Modal title="Гардероб" onClose={onClose} wide>
      <div className="wardrobe">
        <div className="wardrobe-preview"><Character equipped={eq} size={260} /></div>
        <div className="col grow" style={{ gap: 10 }}>
          {WEARABLE_SLOTS.filter((s) => s !== "SPECIAL").map((slot) => {
            const items = ITEMS.filter((i) => i.slot === slot && owned.has(i.id));
            return (
              <div key={slot}>
                <div className="tiny muted" style={{ marginBottom: 4 }}>{SLOT_NAME[slot].toUpperCase()}</div>
                <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
                  {items.length === 0 && <span className="tiny dim">пока пусто</span>}
                  {items.map((i) => {
                    const on = eq[slot] === i.id;
                    return (
                      <button key={i.id} className={`wear-pick rar-${i.rarity} ${on ? "on" : ""}`} disabled={!!busy} title={i.name}
                        onClick={() => act(on ? "unequip" : "equip", on ? { slot } : { itemId: i.id })}>
                        <ItemArt id={i.id} size={34} />
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <p className="tiny muted" style={{ margin: 0 }}>Новая одежда — в наградах локаций и в магазине. Скоро: смена комнаты и декор.</p>
        </div>
      </div>
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
      {f && fb ? (
        <Link href={`/bosses/${fb.id}`} className="fight-banner" style={{ ["--acc" as string]: fb.theme.accent }}>
          <div style={{ width: 64, height: 64, flex: "none" }}><BossPhoto boss={fb} round /></div>
          <div className="grow col" style={{ gap: 4 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <b className="display">БОЙ: {fb.name}</b>
              <span className="chip gold"><Icon name="clock" size={14} />{clock(f.endsAt - now)}</span>
            </div>
            <Bar value={f.hp} max={f.hpMax} tone="red" label={`${full(f.hp)} / ${full(f.hpMax)} HP`} />
          </div>
        </Link>
      ) : (
        <Link href="/bosses" className="fight-banner idle">
          <div style={{ width: 64, height: 64, flex: "none" }}><BossPhoto boss={BOSSES[0]} round /></div>
          <div className="grow">
            <b className="display">Боссы ждут</b>
            <div className="small muted">Начни бой — 8 часов, урон общий со всеми</div>
          </div>
          <span className="btn red sm">В бой</span>
        </Link>
      )}

      <div className="room">
        <RoomScene room={state.look.room} />
        <div className="room-char"><Character equipped={state.look.equipped} size={300} className="idle" /></div>
        <nav className="room-side" aria-label="Быстрые переходы">
          {SIDE.map((b) => (
            <Link key={b.href} href={b.href} className="side-btn" style={{ ["--c" as string]: b.c }}>
              <Icon name={b.icon} size={34} />
              <span>{b.label}</span>
            </Link>
          ))}
        </nav>
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

      {wardrobe && <Wardrobe onClose={() => setWardrobe(false)} />}
      {daily && <DailyWindow onClose={() => setDaily(false)} />}
    </div>
  );
}
