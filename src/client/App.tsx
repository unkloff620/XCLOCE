"use client";
import { GameProvider, useGame } from "./store.tsx";
import { BottomNav, Toasts, TopBar } from "./chrome.tsx";
import { ExchangeSheet, HomeScreen } from "./screens/Home.tsx";
import { MarketScreen, TokenScreen } from "./screens/Market.tsx";
import { BossListSheet, BossScreen, Celebration } from "./screens/Boss.tsx";
import { BagScreen, TopScreen } from "./screens/Bag.tsx";

function Shell() {
  const { status, error, tab, tokenId, retry, mode } = useGame();
  if (status === "loading") {
    return (
      <div className="splash">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/ui/logo.svg" width={84} height={84} alt="" className="splash-logo" />
        <div className="splash-title">XCLOCE</div>
        <div className="muted small">Загружаем рынок…</div>
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="splash">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/bosses/02-bagholder-hammy.svg" width={140} height={140} alt="" className="splash-err" />
        <div className="splash-title">Что-то сломалось</div>
        <div className="muted center">{error}</div>
        <button className="btn btn-primary" onClick={retry}>Попробовать снова</button>
      </div>
    );
  }
  return (
    <div className="app">
      <TopBar />
      <main className="content">
        {tokenId ? (
          <TokenScreen id={tokenId} />
        ) : tab === "home" ? (
          <HomeScreen />
        ) : tab === "market" ? (
          <MarketScreen />
        ) : tab === "boss" ? (
          <BossScreen />
        ) : tab === "bag" ? (
          <BagScreen />
        ) : (
          <TopScreen />
        )}
        {mode === "guest" && <div className="guest-note">Гостевой режим в браузере. Откройте через Telegram, чтобы сохранить прогресс в аккаунте.</div>}
      </main>
      <BottomNav />
      <ExchangeSheet />
      <BossListSheet />
      <Celebration />
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
