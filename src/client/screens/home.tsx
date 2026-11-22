"use client";
import { ObshakWindow } from "../obshak.tsx";
import { ART_VER } from "../preload.ts";
import { NewbieButton } from "./newbie.tsx";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { haptic } from "../telegram.ts";
import { useGame, useNow } from "../store.tsx";
import type { RigEdit } from "../art/rig.tsx";
import { HomeScene } from "../art/home-scene.tsx";
import { ROOM_BACKDROP } from "../../content/home-scene.ts";
import { Icon, NavIcon } from "../art/icons.tsx";
import { NAV_TABS } from "../../content/nav.ts";
import { bossById, thingsFrom, type BossDef } from "../../content/bosses.ts";
import { clock, full } from "../format.ts";
import { BossPhoto } from "./boss-parts.tsx";
import { QuestsWindow } from "./quests.tsx";
import { MonthlyWindow } from "./monthly.tsx";
import { tutorialPending } from "../tutorial.tsx";
import { RoomEditor, previewPieces, roomDraftOf, type RoomDraft, type RoomTab } from "./decorator.tsx";
import { ROOM_DEFS } from "../../content/home.ts";
import { money } from "../format.ts";
import { Help, HelpList } from "../help.tsx";
import { CURRENCY_DEFS } from "../../content/currencies.ts";
import { BARE_HIDES, Stylist, type StyleDraft } from "./stylist.tsx";
import { RatingBoard } from "./rating.tsx";
import { MessagesWindow, messagesWaiting, StashWishWindow } from "./stash-swap.tsx";
import { ItemArt } from "../art/items.tsx";
import { ExchangeNotice } from "../exchange-notice.tsx";
import { UpdatesNotice, UpdatesWindow } from "../updates-notice.tsx";
import { usedUrl } from "../preload.ts";
import { EVENT_BOSSES, eventBossById } from "../../content/event-bosses.ts";
import { todayUpdates } from "../../content/updates.ts";
import { tosyaLookById } from "../../content/tosya.ts";
import { heistReady } from "./heist.tsx";

const MENU_KEY = "xc2_home_menu";

/** The login reward pops up by itself once per app start; later only from the button. */


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
  const [newsOpen, setNewsOpen] = useState(false);
  const todayNews = todayUpdates(now);
  // the notes already opened on this device: the badge counts only the unread ones
  const [newsRead, setNewsRead] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem("xc-news-read") ?? "[]"); } catch { return []; } });
  const newsUnread = todayNews.filter((u) => !newsRead.includes(u.id)).length;
  const openNews = () => {
    setNewsOpen(true);
    const ids = todayNews.map((u) => u.id);
    setNewsRead(ids);
    try { localStorage.setItem("xc-news-read", JSON.stringify(ids)); } catch { /* storage blocked */ }
  };
  const [styling, setStyling] = useState<StyleDraft | null>(null);
  // which part of the hero the editor outlines brightest
  const [editFocus, setEditFocus] = useState<RigEdit>({ mode: "items", part: "SHIRT" });
  // a tap on the hero in the editor picks that part (rig.tsx hit-tests the pictures)
  const pickPart = useCallback((part: string) => {
    haptic.tap();
    setEditFocus((f) => ({ ...f, part }));
  }, []);
  // «Рейтинг»: a sheet of paper over the hero (old /rating links come here as /?top=1)
  const [top, setTop] = useState(false);
  const [obshak, setObshak] = useState(false);
  useEffect(() => {
    if (!new URLSearchParams(location.search).has("top")) return;
    setTop(true);
    history.replaceState(history.state, "", location.pathname);
  }, []);
  const [updOpen, setUpdOpen] = useState(false);
  const [wish, setWish] = useState(false);
  const [messages, setMessages] = useState(false);
  const [quests, setQuests] = useState(false);
  // the [≡] menu remembers whether it was left open or closed (per device)
  const [menuOpen, setMenuOpenRaw] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(MENU_KEY) === "1") setMenuOpenRaw(true);
    } catch {
      /* storage can be blocked */
    }
  }, []);
  const setMenuOpen = (next: boolean | ((v: boolean) => boolean)) =>
    setMenuOpenRaw((v) => {
      const open = typeof next === "function" ? next(v) : next;
      try {
        localStorage.setItem(MENU_KEY, open ? "1" : "0");
      } catch {
        /* storage can be blocked */
      }
      return open;
    });
  // the room editor: what would stand in the room (preview until saved) and the picked thing
  const [decorating, setDecorating] = useState<RoomDraft | null>(null);
  const [roomTab, setRoomTab] = useState<RoomTab>("chair");
  const [styledBefore, setStyledBefore] = useState<StyleDraft | null>(null);
  // the running fight sits folded in the left column; a tap unfolds the full card
  const [fightOpen, setFightOpen] = useState(false);
  // room browser: arrows flip through rooms as a preview; a bar on top confirms the choice (✓) or goes back (✕)
  const [viewIdx, setViewIdx] = useState<number | null>(null);
  // (the daily login bonus is gone from the game — the month calendar stays)
  const busyWindow = (state?.pending.length ?? 0) > 0 || top || tutorialPending(state) || !!styling || !!decorating;
  const isStyling = !!styling || !!decorating;
  // the editor greys out the HUD and the bottom menu too — they live outside this screen
  useEffect(() => {
    document.body.classList.toggle("styling", isStyling);
    return () => document.body.classList.remove("styling");
  }, [isStyling]);
  if (!state) return null;
  // an event boss's room shows only while his event is on (or once it is mine)
  // the rooms that are not for a boss come first, then the bosses' rooms by how hard the boss is
  const rooms = ROOM_DEFS.filter((r) => !r.drop || !eventBossById(r.drop.boss) || eventBossById(r.drop.boss)?.mentor || state.eventBosses?.includes(r.drop.boss) || state.home.rooms.includes(r.id))
    .map((r, i) => ({ r, i, k: r.drop ? (bossById(r.drop.boss)?.order ?? (eventBossById(r.drop.boss) ? 99 : 50)) : -1 }))
    .sort((a, b) => a.k - b.k || a.i - b.i).map((x) => x.r);
  const curIdx = Math.max(0, rooms.findIndex((r) => r.id === state.look.room));
  const idx = viewIdx ?? curIdx;
  const viewRoom = rooms[idx];
  const owned = state.home.rooms.includes(viewRoom.id);
  const canPay = !viewRoom.price || (state.wallet[viewRoom.price.currency] ?? 0) >= viewRoom.price.amount;
  // a room that drops from a boss is bought only after it dropped
  const dropped = !viewRoom.drop || (state.unlocks ?? []).includes(`room:${viewRoom.id}`);
  const flip = (dir: number) => {
    // round and round: after the last room comes the first again (and before the first — the last)
    const ni = (idx + dir + rooms.length) % rooms.length;
    // back on the current room: nothing to confirm
    setViewIdx(ni === curIdx ? null : ni);
  };
  const choose = async () => {
    const r = await act("room_set", { id: viewRoom.id }, `Комната «${viewRoom.name}»`);
    if (r) setViewIdx(null);
  };
  const previewing = viewIdx !== null && viewIdx !== curIdx;
  const unlock = async () => {
    const r = await act("room_buy", { id: viewRoom.id }, `Открыта комната «${viewRoom.name}»`);
    if (r) setViewIdx(null);
  };
  const f = state.fight;
  const fb = f ? bossById(f.bossId)! : null;
  const mon = state.monthly;
  const questsAlert = mon ? mon.claimable : state.quests.claimable;
  const menuAlert = questsAlert || state.prizes.length > 0;
  const openWardrobe = () => {
    setDecorating(null);
    setStyling({ look: { ...state.look.body }, worn: { ...state.look.equipped } });
  };
  const openRoomEditor = (tab: RoomTab) => {
    // from the hero editor: «назад» in the room editor brings the hero editor back as it was
    setStyledBefore(styling);
    setStyling(null);
    setRoomTab(tab);
    setDecorating(roomDraftOf(state.home.pieces ?? {}, state.home.decor));
  };
  const editing = !!styling || !!decorating;
  const hpPct = f ? `${Math.max(0, Math.min(100, (f.hp / Math.max(1, f.hpMax)) * 100))}%` : "0%";
  return (
    <div className={`fit-page ${f && fb && fightOpen ? "has-fight" : ""} ${editing ? "styling" : ""} ${decorating ? "decorating" : ""} ${top ? "topping" : ""}`}>
      <div className="room">
        <div className={`scene-backdrop ${owned ? "" : "locked"}`} style={{ backgroundImage: `url(/assets/home/${ROOM_BACKDROP[viewRoom.id] ?? ROOM_BACKDROP.basic}.webp)` }} />
        <div className={`room-view ${owned ? "" : "locked"}`}>
          <HomeScene room={viewRoom.id} look={styling?.look ?? state.look.body} worn={styling ? (styling.bare && editFocus.mode === "ink" ? Object.fromEntries(Object.entries(styling.worn).filter(([k]) => !BARE_HIDES.includes(k))) : styling.worn) : state.look.equipped}
            pieces={decorating ? previewPieces(state.home.pieces ?? {}, decorating) : state.home.pieces} decor={decorating ?? state.home.decor} trophies={state.home.trophies}
            focusHero={!!styling} hideHero={!!decorating} edit={styling ? { ...editFocus, onPick: pickPart } : undefined}
            onHero={owned && !editing ? openWardrobe : undefined} />
        </div>
        {/* looking at another room: confirm it (✓) or go back to the current one (✕) */}
        {previewing && !editing && (
          <div className="room-confirm">
            <button className="room-confirm-x" onClick={() => setViewIdx(null)} aria-label="Закрыть и вернуться в свою комнату">✕</button>
            <span className="room-confirm-name">{owned ? "Выбрать комнату?" : "Комната закрыта"}<b className="display">{viewRoom.name}</b></span>
            {owned ? (
              <button className="room-confirm-ok" disabled={busy === "room_set"} onClick={choose} aria-label="Выбрать комнату">✓</button>
            ) : <span className="room-confirm-lock"><Icon name="lock" size={18} /></span>}
          </div>
        )}
        {/* room switcher: one pill «‹ name ›» at the top, the lock offer under it */}
        <div className="room-label">
          {/* the switcher pill stays on top (screens.css: order), a locked room's offer sits under it */}
          {!owned && (
            <div className="room-unlock">
              {dropped ? (
                <>
                  <button className="btn gold sm" disabled={!canPay || busy === "room_buy"} onClick={unlock}>
                    <Icon name="lock" size={16} /> Разблокировать <span className="room-price"><Icon name={viewRoom.price!.currency} size={15} />{money(viewRoom.price!.currency, viewRoom.price!.amount)}</span>
                  </button>
                  {!canPay && <span className="tiny" style={{ color: "#ff8a9e" }}>Не хватает {viewRoom.price!.currency}</span>}
                </>
              ) : (
                <span className="chip"><Icon name="lock" size={16} /> {bossById(viewRoom.drop!.boss) ? `${thingsFrom(bossById(viewRoom.drop!.boss)!)} · ${Math.round(viewRoom.drop!.chance * 100)}%` : "Выпадет с ивента «Пепе»"}</span>
              )}
            </div>
          )}
          <div className={`room-switch ${previewing ? "" : "idle"}`}>
            <button className="room-step" onClick={() => flip(-1)} disabled={busy === "room_set"} aria-label="Предыдущая комната">‹</button>
            <span className="room-name display">{viewRoom.name}</span>
            <button className="room-step" onClick={() => flip(1)} disabled={busy === "room_set"} aria-label="Следующая комната">›</button>
          </div>
        </div>
        <div className="room-help">
          <Help topic="home-menu" title="Твой дом">
            <p>Здесь живёт твой персонаж. Нажми на него — откроется гардероб: одежда, причёска, наколки. Оттуда же, кнопками слева, — кресло и трофеи комнаты. Стрелки внизу листают твои комнаты.</p>
            <HelpList title="Меню [≡] слева (остаётся открытым или закрытым, как ты его оставил)" rows={[
              { key: "r", icon: <Icon name="trophy" size={44} />, name: "Рейтинг", hint: "Топ по урону за неделю, по авторитету и кланам. Топ-10 недели получает призы, лидеры — рамку на карточке." },
              { key: "q", icon: <Icon name="map" size={44} />, name: "Задания дня", hint: "Три задания на сутки: бой, энергия, покупки. Выполнишь все — открой сундук. Там же включаются напоминания в Telegram." },
            ]} />
            <HelpList title="Меню внизу" rows={NAV_TABS.map((t) => ({ key: t.id, icon: <NavIcon id={t.id} size={44} />, name: t.label, hint: t.hint }))} />
            <HelpList title="Валюта (вверху)" rows={[
              { key: "PAP", icon: <Icon name="PAP" size={40} />, name: CURRENCY_DEFS.PAP.name, hint: "Главная валюта: падают с боссов и с заданий в локациях. Комнаты, бизнес и многое другое." },
              { key: "TOOTH", icon: <Icon name="TOOTH" size={40} />, name: CURRENCY_DEFS.TOOTH.name, hint: "Падают с боссов. Для событий («Взлом») и обмена." },
              { key: "RUB", icon: <Icon name="RUB" size={40} />, name: CURRENCY_DEFS.RUB.name, hint: "Оружие в магазине, блэкджек, зонк, дуэли, автомат 777, колесо удачи." },
              { key: "TOKEN", icon: <Icon name="TOKEN" size={40} />, name: CURRENCY_DEFS.TOKEN.name, hint: "Детали для крафта и «Ударить сейчас» без перезарядки." },
              { key: "GOLD", icon: <Icon name="GOLD" size={40} />, name: CURRENCY_DEFS.GOLD.name, hint: "Редкая валюта: покер, Тося, выкуп дня в календаре, ячейки сходняка." },
              { key: "xp", icon: <Icon name="xp" size={40} />, name: "Авторитет", hint: "Опыт за задания, боссов и бонусы. Полоса вверху — прогресс до следующего уровня." },
              { key: "en", icon: <Icon name="energy" size={40} />, name: "Энергия", hint: "Тратится на задания в локациях и сама восстанавливается. Нажми на неё, чтобы докупить." },
            ]} />
            <p className="small muted">Нажми на любую валюту вверху — откроется обменник. Валюта игровая и ничего не стоит в реальном мире.</p>
          </Help>
        </div>
        {/* the right side: the [≡] menu and the messages */}
        <div className="room-right">
          {/* everything for the home sits folded in one [≡] button; its dot shows when anything inside waits */}
          <button className={`menu-toggle ${menuOpen ? "open" : ""} ${menuAlert && !menuOpen ? "glow" : ""}`} onClick={() => setMenuOpen((v) => !v)} aria-label="Меню" aria-expanded={menuOpen} title="Меню">
            <span className="menu-bars" aria-hidden="true"><i /><i /><i /></span>
            {menuAlert && !menuOpen && <i className="side-dot" />}
          </button>
          {/* «Сообщения»: stashes sent by other players wait here to be accepted */}
          <button className={`menu-toggle msg-toggle ${messagesWaiting(state) > 0 ? "glow" : ""}`} onClick={() => setMessages(true)} aria-label="Сообщения" title="Сообщения">
            <Icon name="mail" size={36} />
            {messagesWaiting(state) > 0 && <span className="msg-count num">{messagesWaiting(state)}</span>}
          </button>
          {/* «Новичок»: Баба Зина's tasks for the first 3 days */}
          <NewbieButton />
          {/* «Тося» is here: his pies (screens/tosya.tsx); every pie bought (next: null) — the button goes away */}
          {state.tosya && state.tosya.next !== null && (
            <Link href="/event/tosya" className="menu-toggle event-toggle" aria-label="Ивент: Тося" title={tosyaLookById(state.tosya.look).w.brought}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/assets/tosya/portrait${tosyaLookById(state.tosya.look).art}.webp?v=2`} alt="" draggable={false} />
              <span className="event-tag">ТОСЯ</span>
            </Link>
          )}
          {/* «Взлом» (screens/heist.tsx): while the event is on, or boxes are still in the cells */}
          {state.heist && (
            <Link href="/event/heist" className="menu-toggle event-toggle" aria-label="Ивент: Взлом" title="Ивент «Взлом»: ящики с замками">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/heist/chest-gold.webp" alt="" draggable={false} style={{ objectFit: "contain" }} />
              <span className="event-tag">ВЗЛОМ</span>
              {heistReady(state.heist, Date.now()) > 0 && <span className="msg-count num">{heistReady(state.heist, Date.now())}</span>}
            </Link>
          )}
          {/* the event bosses the admin has put in the game (admin panel «Ивенты») */}
          {EVENT_BOSSES.filter((b) => state.eventBosses?.includes(b.id)).map((b) => (
            <Link key={b.id} href={b.href} className="menu-toggle event-toggle" aria-label={`Ивент: ${b.name}`} title={`Ивент: ${b.name}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={usedUrl(b.portrait)} alt="" draggable={false} />
              <span className="event-tag">ИВЕНТ</span>
            </Link>
          ))}
          {menuOpen && (
            <div className="menu-drop">
              <button className="icon-btn-art" style={{ ["--c" as string]: "#b98bff" }} onClick={() => setWish(true)} aria-label="Попросить нычки и детали" title="Попросить нычки и детали">
                <ItemArt id="stash-cigs" size={54} />
                {(state.stashWish?.length ?? 0) > 0 && <span className="side-count num">{state.stashWish!.length}/6</span>}
              </button>
              <button onClick={() => setTop(true)} className={`icon-btn-art ${state.prizes.length ? "glow" : ""}`} style={{ ["--c" as string]: "#ffcc33" }} aria-label="Рейтинг" title="Рейтинг">
                <Icon name="trophy" size={54} />
                {state.prizes.length > 0 && <i className="side-dot" />}
              </button>
            </div>
          )}
        </div>
        {/* the left side: events and the running boss fight */}
        <div className="room-left">
          {/* «Что нового»: today's notes (Moscow day), the feed starts over at 0:00 МСК */}
          <button className={`menu-toggle news-toggle ${newsUnread ? "glow" : ""}`} onClick={openNews} aria-label="Что нового" title="Что нового">
            <Icon name="news" size={40} />
            {newsUnread > 0 && <span className="msg-count num">{newsUnread}</span>}
          </button>
          {/* the month's tasks («Делюги») / the day's tasks: a tear-off calendar under the news */}
          <button className={`menu-toggle news-toggle cal-toggle ${questsAlert ? "glow" : ""}`} onClick={() => setQuests(true)} aria-label={mon ? "Делюги" : "Задания дня"} title={mon ? "Делюги «Календарь»" : "Задания дня"}>
            <Icon name="calendar" size={40} />
            {(questsAlert || (mon?.todayOpen ?? false)) && <i className="side-dot" />}
            <span className="side-count num">{mon ? `${mon.closedN}/${mon.days}` : `${state.quests.list.filter((x) => x.claimed).length}/${state.quests.list.length}`}</span>
          </button>
          {/* «Зарубы» (screens/zarub.tsx) */}
          <Link href="/zarub" className="menu-toggle event-toggle zr-toggle" aria-label="Зарубы" title="Зарубы">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/assets/zarub/icon.webp?v=${ART_VER.items}`} alt="" draggable={false} style={{ objectFit: "contain" }} />
            <span className="event-tag">ЗАРУБЫ</span>
          </Link>
          {/* «Общак» (client/obshak.tsx): the subscription; glows when today's collecting waits */}
          <button type="button" className={`menu-toggle event-toggle ob-toggle ${state.obshak?.ready ? "glow" : ""}`} onClick={() => setObshak(true)} aria-label="Общак" title="Общак">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/obshak/icon.webp" alt="" draggable={false} style={{ objectFit: "contain" }} />
            <span className="event-tag">ОБЩАК</span>
            {state.obshak?.ready && <i className="side-dot" />}
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
      {styling && <Stylist draft={styling} setDraft={setStyling} onClose={() => setStyling(null)} focus={editFocus} setFocus={setEditFocus} onRoom={openRoomEditor} />}
      {top && <RatingBoard onClose={() => setTop(false)} />}
      {obshak && <ObshakWindow onClose={() => setObshak(false)} />}
      <UpdatesNotice wait={busyWindow} onOpen={setUpdOpen} />
      <ExchangeNotice wait={busyWindow || updOpen} />
      {newsOpen && <UpdatesWindow list={todayNews} onClose={() => setNewsOpen(false)} />}
      {wish && <StashWishWindow onClose={() => setWish(false)} />}
      {messages && <MessagesWindow onClose={() => setMessages(false)} />}
      {quests && (mon ? <MonthlyWindow onClose={() => setQuests(false)} /> : <QuestsWindow onClose={() => setQuests(false)} />)}
      {decorating && <RoomEditor draft={decorating} setDraft={setDecorating} tab={roomTab} setTab={setRoomTab}
        onClose={() => { setDecorating(null); setStyledBefore(null); }}
        onBack={() => { setDecorating(null); if (styledBefore) setStyling(styledBefore); setStyledBefore(null); }} />}
    </div>
  );
}
