"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useGame, useNow } from "../store.tsx";
import { HeroRig } from "../art/rig.tsx";
import { HomeScene } from "../art/home-scene.tsx";
import { ROOM_BACKDROP } from "../../content/home-scene.ts";
import { Icon, NavIcon } from "../art/icons.tsx";
import { NAV_TABS } from "../../content/nav.ts";
import { ItemArt } from "../art/items.tsx";
import { Modal } from "../ui.tsx";
import { bossById, type BossDef } from "../../content/bosses.ts";
import { ITEMS, type Slot } from "../../content/items.ts";
import { clock, full } from "../format.ts";
import { BossPhoto } from "./boss-parts.tsx";
import { DailyWindow } from "./daily.tsx";
import { QuestsWindow } from "./quests.tsx";
import { BonusLine, EquipmentWindow } from "./house.tsx";
import { ComputerWindow } from "./computer.tsx";
import { ROOM_DEFS } from "../../content/home.ts";
import { money } from "../format.ts";
import { Help, HelpList } from "../help.tsx";
import { CURRENCY_DEFS } from "../../content/currencies.ts";
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
          <p className="tiny muted center" style={{ margin: "10px 0 0" }}>Нажми на ячейку, чтобы выбрать вещь.</p>
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

/** The boss's face in a plain circle; the ring around it is the boss's HP left (uses --hp and --acc from the parent). */
function BossRing({ boss, size }: { boss: BossDef; size: number }) {
  const src = boss.photo.portrait;
  return (
    <span className="boss-ring" style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="" draggable={false} /> : <span className="boss-ring-empty" />}
    </span>
  );
}

export function HomeScreen() {
  const { state, act, busy } = useGame();
  const now = useNow();
  const [wardrobe, setWardrobe] = useState(false);
  const [daily, setDaily] = useState(false);
  const [quests, setQuests] = useState(false);
  const [equip, setEquip] = useState<string | null | false>(false);
  const [pc, setPc] = useState(false);
  // the running fight sits folded in the left column; a tap unfolds the full card
  const [fightOpen, setFightOpen] = useState(false);
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
  const hpPct = f ? `${Math.max(0, Math.min(100, (f.hp / Math.max(1, f.hpMax)) * 100))}%` : "0%";
  return (
    <div className={`fit-page ${f && fb && fightOpen ? "has-fight" : ""}`}>
      <div className="room">
        <div className={`scene-backdrop ${owned ? "" : "locked"}`} style={{ backgroundImage: `url(/assets/home/${ROOM_BACKDROP[viewRoom.id] ?? ROOM_BACKDROP.basic}.webp)` }} />
        <div className={`room-view ${owned ? "" : "locked"}`}>
          <HomeScene room={viewRoom.id} look={state.look.body} worn={state.look.equipped} levels={state.home.levels} decor={state.home.decor} onPick={owned ? (id) => (id === "pc" ? setPc(true) : setEquip(id)) : undefined} />
        </div>
        {/* room switcher: one pill «‹ name ›» at the bottom, the lock offer under it */}
        <div className="room-label">
          <div className="room-switch">
            <button className="room-step" onClick={() => flip(-1)} disabled={idx === 0 || busy === "room_set"} aria-label="Предыдущая комната">‹</button>
            <span className="room-name display">{viewRoom.name}</span>
            <button className="room-step" onClick={() => flip(1)} disabled={idx >= ROOM_DEFS.length - 1 || busy === "room_set"} aria-label="Следующая комната">›</button>
          </div>
          {!owned && (
            <div className="room-unlock">
              <span className="tiny" style={{ color: "var(--gold)" }}><BonusLine b={viewRoom.bonus} /></span>
              <button className="btn gold sm" disabled={!canPay || busy === "room_buy"} onClick={unlock}>
                <Icon name="lock" size={16} /> Разблокировать <span className="room-price"><Icon name={viewRoom.price!.currency} size={15} />{money(viewRoom.price!.currency, viewRoom.price!.amount)}</span>
              </button>
              {!canPay && <span className="tiny" style={{ color: "#ff8a9e" }}>Не хватает {viewRoom.price!.currency}</span>}
            </div>
          )}
        </div>
        <div className="room-help">
          <Help topic="home-menu" title="Твой дом">
            <p>Здесь живёт твой персонаж. На заднем плане стоит оборудование — нажми на мониторы, чтобы обставить рабочее место, или на системник в углу — там детали компьютера, которые улучшаются за таланты. Стрелки по бокам листают комнаты: купленная включается сразу, закрытую можно разблокировать кнопкой снизу. Каждая купленная комната даёт бонус к урону.</p>
            <HelpList title="Кнопки слева" rows={[
              { key: "w", icon: <Icon name="shirt" size={44} />, name: "Гардероб", hint: "Одежда и внешность: причёска, цвет волос и кожи." },
              { key: "b", icon: <Icon name="gift" size={44} />, name: "Бонус", hint: "Награда за ежедневный вход. Заходи каждый день подряд — награда растёт, на 7-й день редкое оружие. Пропустишь день — серия сгорит." },
              { key: "q", icon: <Icon name="map" size={44} />, name: "Задания дня", hint: "Три задания на сутки: бой, энергия, покупки. Выполнишь все — открой сундук. Там же включаются напоминания в Telegram." },
              { key: "t", icon: <Icon name="bolt" size={44} />, name: "Обстановка", hint: "Всё для рабочего места: стол, мониторы, кресло, подсветка. Шанс и сила крита." },
            ]} />
            <HelpList title="Меню внизу" rows={NAV_TABS.map((t) => ({ key: t.id, icon: <NavIcon id={t.id} size={44} />, name: t.label, hint: t.hint }))} />
            <HelpList title="Валюта (вверху)" rows={[
              { key: "RUB", icon: <Icon name="RUB" size={40} />, name: CURRENCY_DEFS.RUB.name, hint: "Основная валюта: задания, двор, боссы. Оружие и мелочи в магазине." },
              { key: "USD", icon: <Icon name="USD" size={40} />, name: CURRENCY_DEFS.USD.name, hint: "Награды за боссов и локации. Видеокарты, одежда, энергия." },
              { key: "SOL", icon: <Icon name="SOL" size={40} />, name: CURRENCY_DEFS.SOL.name, hint: "Редкая валюта за сильных боссов. Rug Pull Gun и большие пакеты энергии." },
              { key: "BTC", icon: <Icon name="BTC" size={40} />, name: CURRENCY_DEFS.BTC.name, hint: "Самая ценная валюта — за последних боссов." },
              { key: "xp", icon: <Icon name="xp" size={40} />, name: "Авторитет", hint: "Опыт за задания, боссов и бонусы. Полоса вверху — прогресс до следующего уровня." },
              { key: "en", icon: <Icon name="energy" size={40} />, name: "Энергия", hint: "Тратится на задания в локациях и сама восстанавливается. Нажми на неё, чтобы докупить." },
            ]} />
            <p className="small muted">Нажми на любую валюту вверху — откроется обменник. Валюта игровая и ничего не стоит в реальном мире.</p>
          </Help>
        </div>
        <div className="room-left">
          <button className="icon-btn-art" style={{ ["--c" as string]: "#b06bff" }} onClick={() => setWardrobe(true)} aria-label="Гардероб" title="Гардероб">
            <Icon name="shirt" size={58} />
          </button>
          <button className={`icon-btn-art ${state.daily.available ? "glow" : ""}`} style={{ ["--c" as string]: "#ffcc33" }} onClick={() => setDaily(true)} aria-label="Бонус" title="Бонус">
            <Icon name="gift" size={58} />
            {state.daily.available && <i className="side-dot" />}
            {state.daily.streak > 1 && <span className="side-streak num" title={`Серия входов: ${state.daily.streak} дн.`}><Icon name="fire" size={13} />{state.daily.streak}</span>}
          </button>
          <button className={`icon-btn-art ${state.quests.claimable ? "glow" : ""}`} style={{ ["--c" as string]: "#3ddc84" }} onClick={() => setQuests(true)} aria-label="Задания дня" title="Задания дня">
            <Icon name="map" size={58} />
            {state.quests.claimable && <i className="side-dot" />}
            <span className="side-count num">{state.quests.list.filter((x) => x.claimed).length}/3</span>
          </button>
          <button className="icon-btn-art" style={{ ["--c" as string]: "#3fd2ff" }} onClick={() => setEquip(null)} aria-label="Обстановка" title="Обстановка">
            <Icon name="bolt" size={58} />
          </button>
          {f && fb && !fightOpen && (
            <button className="fight-mini" style={{ ["--acc" as string]: fb.theme.accent, ["--hp" as string]: hpPct }} onClick={() => setFightOpen(true)} aria-label={`Идёт бой: ${fb.name}`} title="Идёт бой">
              <BossRing boss={fb} size={58} />
              <i className="live-dot" />
              <span className="fight-mini-time num">{clock(f.endsAt - now)}</span>
            </button>
          )}
        </div>
      </div>

      {f && fb && fightOpen && (
        <div className="fight-card" style={{ ["--acc" as string]: fb.theme.accent, ["--hp" as string]: hpPct }}>
          <button className="fight-card-fold" onClick={() => setFightOpen(false)} aria-label="Свернуть" title="Свернуть" />
          <Link href={`/bosses/${fb.id}`} className="fight-card-body">
            <BossRing boss={fb} size={56} />
            <span className="fight-card-info">
              <span className="fight-card-top">
                <span className="fight-card-live"><i className="live-dot" />идёт бой</span>
                <span className="fight-card-time num"><Icon name="clock" size={12} />{clock(f.endsAt - now)}</span>
              </span>
              <b className="fight-card-name display ellipsis">{fb.name}</b>
              <span className="fight-card-hp"><i /></span>
              <span className="fight-card-hpnum num">{full(f.hp)} / {full(f.hpMax)} HP</span>
            </span>
            <span className="fight-card-go display" aria-hidden="true">›</span>
          </Link>
        </div>
      )}
      {wardrobe && <Wardrobe onClose={() => setWardrobe(false)} />}
      {daily && <DailyWindow onClose={() => setDaily(false)} />}
      {quests && <QuestsWindow onClose={() => setQuests(false)} />}
      {equip !== false && <EquipmentWindow focus={equip} onClose={() => setEquip(false)} />}
      {pc && <ComputerWindow onClose={() => setPc(false)} />}
    </div>
  );
}
