"use client";
import { GameProvider, useGame } from "./store.tsx";
import { BottomNav, Toasts, TopHud } from "./hud.tsx";
import { HomeScreen } from "./screens/Home.tsx";
import { BossScreen, FightScreen, ResultModal } from "./screens/Boss.tsx";
import { YardScreen } from "./screens/Yard.tsx";
import { SkinStyles } from "./skin.tsx";
import { MarketScreen } from "./screens/Market.tsx";
import { InventoryScreen, ItemSheet } from "./screens/Inventory.tsx";
import { SocialScreen } from "./screens/Social.tsx";
import { DailySheet, EventsSheet, ExchangeSheet, MissionsSheet, ProfileSheet, RoomsSheet, ShopSheet, UpgradeSheet } from "./screens/Sheets.tsx";

function Shell() {
  const { status, error, tab, retry, mode, fight, yard } = useGame();
  if (status !== "ready") {
    return (
      <div className="splash">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={status === "error" ? "/assets/bosses/01-chill-guy.svg" : "/assets/ui/logo.svg"} width={status === "error" ? 160 : 90} height={status === "error" ? 160 : 90} alt="" className={status === "loading" ? "spin" : "rounded"} />
        <div className="comic splash-title">{status === "error" ? "ЧТО-ТО СЛОМАЛОСЬ" : "XCLOCE"}</div>
        {status === "error" ? (
          <>
            <div className="muted center">{error}</div>
            <button className="btn-green comic" onClick={retry}>ЕЩЁ РАЗ</button>
          </>
        ) : <div className="muted small">Загрузка…</div>}
      </div>
    );
  }
  return (
    <div className="app">
      <TopHud />
      <main className="content">
        {fight !== null ? <FightScreen /> : yard ? <YardScreen /> : tab === "home" ? <HomeScreen /> : tab === "boss" ? <BossScreen /> : tab === "market" ? <MarketScreen /> : tab === "inventory" ? <InventoryScreen /> : <SocialScreen />}
        {mode === "guest" && <div className="guest-note">Гостевой режим. Откройте игру в Telegram, чтобы прогресс сохранился в аккаунте.</div>}
      </main>
      <BottomNav />
      <ShopSheet />
      <ExchangeSheet />
      <RoomsSheet />
      <DailySheet />
      <MissionsSheet />
      <EventsSheet />
      <UpgradeSheet />
      <ProfileSheet />
      <ItemSheet />
      <ResultModal />
      <SkinStyles />
      <Toasts />
    </div>
  );
}

export default function App() {
  return (
    <GameProvider>
      <Shell />
    </GameProvider>
  );
}
