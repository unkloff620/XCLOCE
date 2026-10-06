"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useGame, useNow } from "../store.tsx";
import { HomeScene } from "../art/home-scene.tsx";
import { ROOM_BACKDROP } from "../../content/home-scene.ts";
import { Icon, NavIcon } from "../art/icons.tsx";
import { NAV_TABS } from "../../content/nav.ts";
import { bossById, type BossDef } from "../../content/bosses.ts";
import { clock, full } from "../format.ts";
import { BossPhoto } from "./boss-parts.tsx";
import { DailyWindow } from "./daily.tsx";
import { QuestsWindow } from "./quests.tsx";
import { tutorialPending } from "../tutorial.tsx";
import { BonusLine, EquipmentWindow } from "./house.tsx";
import { ComputerWindow } from "./computer.tsx";
import { ROOM_DEFS } from "../../content/home.ts";
import { money } from "../format.ts";
import { Help, HelpList } from "../help.tsx";
import { CURRENCY_DEFS } from "../../content/currencies.ts";
import { Stylist, type StyleDraft } from "./stylist.tsx";

/** The login reward pops up by itself once per app start; later only from the button. */
let dailyAutoShown = false;


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
  const [styling, setStyling] = useState<StyleDraft | null>(null);
  const [daily, setDaily] = useState(false);
  const [quests, setQuests] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [equip, setEquip] = useState<string | null | false>(false);
  const [pc, setPc] = useState(false);
  // the running fight sits folded in the left column; a tap unfolds the full card
  const [fightOpen, setFightOpen] = useState(false);
  // room browser: arrows flip through rooms; an owned room is switched to at once, a locked one is shown with "unlock"
  const [viewIdx, setViewIdx] = useState<number | null>(null);
  const dailyReady = !!state?.daily.available;
  // the first-visit tour goes first; the daily reward window waits for it
  const busyWindow = (state?.pending.length ?? 0) > 0 || tutorialPending(state) || !!styling;
  useEffect(() => {
    if (dailyReady && !busyWindow && !dailyAutoShown) {
      dailyAutoShown = true;
      setDaily(true);
    }
  }, [dailyReady, busyWindow]);
  const isStyling = !!styling;
  // the editor greys out the HUD and the bottom menu too — they live outside this screen
  useEffect(() => {
    document.body.classList.toggle("styling", isStyling);
    return () => document.body.classList.remove("styling");
  }, [isStyling]);
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
  const menuAlert = state.daily.available || state.quests.claimable || state.prizes.length > 0;
  const hpPct = f ? `${Math.max(0, Math.min(100, (f.hp / Math.max(1, f.hpMax)) * 100))}%` : "0%";
  return (
    <div className={`fit-page ${f && fb && fightOpen ? "has-fight" : ""} ${styling ? "styling" : ""}`}>
      <div className="room">
        <div className={`scene-backdrop ${owned ? "" : "locked"}`} style={{ backgroundImage: `url(/assets/home/${ROOM_BACKDROP[viewRoom.id] ?? ROOM_BACKDROP.basic}.webp)` }} />
        <div className={`room-view ${owned ? "" : "locked"}`}>
          <HomeScene room={viewRoom.id} look={styling?.look ?? state.look.body} worn={styling?.worn ?? state.look.equipped} levels={state.home.levels} decor={state.home.decor} trophies={state.home.trophies} focusHero={!!styling} onPick={owned && !styling ? (id) => (id === "pc" ? setPc(true) : setEquip(id)) : undefined} />
        </div>
        {/* room switcher: one pill «‹ name ›» at the bottom, the lock offer above it */}
        <div className="room-label">
          {/* the switcher pill always stays at the bottom; a locked room's offer sits above it */}
          {!owned && (
            <div className="room-unlock">
              <span className="tiny" style={{ color: "var(--gold)" }}><BonusLine b={viewRoom.bonus} /></span>
              <button className="btn gold sm" disabled={!canPay || busy === "room_buy"} onClick={unlock}>
                <Icon name="lock" size={16} /> Разблокировать <span className="room-price"><Icon name={viewRoom.price!.currency} size={15} />{money(viewRoom.price!.currency, viewRoom.price!.amount)}</span>
              </button>
              {!canPay && <span className="tiny" style={{ color: "#ff8a9e" }}>Не хватает {viewRoom.price!.currency}</span>}
            </div>
          )}
          <div className="room-switch">
            <button className="room-step" onClick={() => flip(-1)} disabled={idx === 0 || busy === "room_set"} aria-label="Предыдущая комната">‹</button>
            <span className="room-name display">{viewRoom.name}</span>
            <button className="room-step" onClick={() => flip(1)} disabled={idx >= ROOM_DEFS.length - 1 || busy === "room_set"} aria-label="Следующая комната">›</button>
          </div>
        </div>
        <div className="room-help">
          <Help topic="home-menu" title="Твой дом">
            <p>Здесь живёт твой персонаж. На заднем плане стоит оборудование — нажми на мониторы, чтобы обставить рабочее место, или на системник в углу (его улучшения появятся позже). Стрелки по бокам листают комнаты: купленная включается сразу, закрытую можно разблокировать кнопкой снизу. Каждая купленная комната даёт бонус к урону.</p>
            <HelpList title="Меню [≡] слева" rows={[
              { key: "w", icon: <Icon name="shirt" size={44} />, name: "Гардероб", hint: "Редактор персонажа прямо в комнате: комната сереет, а ты примеряешь одежду, причёску, цвет волос и кожи. Всё сохраняется одной кнопкой." },
              { key: "b", icon: <Icon name="gift" size={44} />, name: "Бонус", hint: "Награда за ежедневный вход. Заходи каждый день подряд — награда растёт, на 7-й день редкое оружие. Пропустишь день — серия сгорит." },
              { key: "r", icon: <Icon name="trophy" size={44} />, name: "Рейтинг", hint: "Топ по урону за неделю, по авторитету и кланам. Топ-10 недели получает призы, лидеры — рамку на карточке." },
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
          {/* everything for the home sits folded in one [≡] button; its dot shows when anything inside waits */}
          <button className={`menu-toggle ${menuOpen ? "open" : ""} ${menuAlert && !menuOpen ? "glow" : ""}`} onClick={() => setMenuOpen((v) => !v)} aria-label="Меню" aria-expanded={menuOpen} title="Меню">
            <span className="menu-bars" aria-hidden="true"><i /><i /><i /></span>
            {menuAlert && !menuOpen && <i className="side-dot" />}
          </button>
          {menuOpen && (
            <div className="menu-drop" onClick={() => setMenuOpen(false)}>
              <button className="icon-btn-art" style={{ ["--c" as string]: "#b06bff" }} onClick={() => setStyling({ look: { ...state.look.body }, worn: { ...state.look.equipped } })} aria-label="Гардероб" title="Гардероб">
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
              <Link href="/rating" className={`icon-btn-art ${state.prizes.length ? "glow" : ""}`} style={{ ["--c" as string]: "#ffcc33" }} aria-label="Рейтинг" title="Рейтинг">
                <Icon name="trophy" size={54} />
                {state.prizes.length > 0 && <i className="side-dot" />}
              </Link>
            </div>
          )}
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
      {styling && <Stylist draft={styling} setDraft={setStyling} onClose={() => setStyling(null)} />}
      {daily && <DailyWindow onClose={() => setDaily(false)} />}
      {quests && <QuestsWindow onClose={() => setQuests(false)} />}
      {equip !== false && <EquipmentWindow focus={equip} onClose={() => setEquip(false)} />}
      {pc && <ComputerWindow onClose={() => setPc(false)} />}
    </div>
  );
}
