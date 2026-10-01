// Thin wrapper around the Telegram Mini Apps JS API (telegram-web-app.js loaded in layout).
type Haptic = {
  impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
  notificationOccurred(type: "error" | "success" | "warning"): void;
  selectionChanged(): void;
};
export interface TgWebApp {
  initData: string;
  initDataUnsafe: { user?: { id: number; first_name?: string; username?: string; photo_url?: string }; start_param?: string };
  version: string;
  platform: string;
  colorScheme: "light" | "dark";
  ready(): void;
  expand(): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  setBottomBarColor?(color: string): void;
  disableVerticalSwipes?(): void;
  isVersionAtLeast?(v: string): boolean;
  HapticFeedback?: Haptic;
  BackButton?: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  openTelegramLink?(url: string): void;
  onEvent?(event: string, cb: () => void): void;
}

export function tg(): TgWebApp | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { Telegram?: { WebApp?: TgWebApp } };
  const app = w.Telegram?.WebApp;
  return app && app.initData ? app : null;
}

export function initTelegram() {
  const app = tg();
  if (!app) return;
  try {
    app.ready();
    app.expand();
    const supports = (v: string) => (app.isVersionAtLeast ? app.isVersionAtLeast(v) : false);
    if (supports("6.1")) {
      app.setHeaderColor?.("#07090f");
      app.setBackgroundColor?.("#07090f");
    }
    if (supports("7.10")) app.setBottomBarColor?.("#07090f");
    if (supports("7.7")) app.disableVerticalSwipes?.();
  } catch {
    /* older clients */
  }
}

export const haptic = {
  tap: () => tg()?.HapticFeedback?.impactOccurred("light"),
  hit: () => tg()?.HapticFeedback?.impactOccurred("heavy"),
  ok: () => tg()?.HapticFeedback?.notificationOccurred("success"),
  err: () => tg()?.HapticFeedback?.notificationOccurred("error"),
  select: () => tg()?.HapticFeedback?.selectionChanged(),
};
