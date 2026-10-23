"use client";
/* Thin wrapper over window.Telegram.WebApp (present only inside Telegram). */

interface TgWebApp {
  initData: string;
  initDataUnsafe?: { start_param?: string };
  ready(): void;
  expand(): void;
  disableVerticalSwipes?(): void;
  /** Bot API 8.0+: the Mini App over the whole screen, Telegram's own bar hidden (its buttons float on top) */
  requestFullscreen?(): void;
  isFullscreen?: boolean;
  isVersionAtLeast?(v: string): boolean;
  platform?: string;
  setHeaderColor?(c: string): void;
  setBackgroundColor?(c: string): void;
  HapticFeedback?: { impactOccurred(s: "light" | "medium" | "heavy" | "rigid" | "soft"): void; notificationOccurred(t: "error" | "success" | "warning"): void };
  requestWriteAccess?(cb?: (granted: boolean) => void): void;
  BackButton?: { show(): void; hide(): void; onClick(f: () => void): void; offClick(f: () => void): void };
}

export function tg(): TgWebApp | null {
  if (typeof window === "undefined") return null;
  const w = (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;
  return w && w.initData ? w : null;
}

/** The Mini App was opened for the admin panel (startapp=admin) or to confirm a browser sign-in (startapp=al_<code>). */
export function openedForAdmin(): boolean {
  const p = tg()?.initDataUnsafe?.start_param ?? "";
  return p === "admin" || p.startsWith("al_");
}

export function initTelegram() {
  const w = tg();
  if (!w) return;
  try {
    w.ready();
    w.expand();
    w.disableVerticalSwipes?.();
    // on a phone the game opens over the whole screen; Telegram's close and menu buttons stay on top, and
    // telegram-web-app.js gives their height as --tg-content-safe-area-inset-top (globals.css adds it to --safe-t).
    // Not on a computer: there fullscreen would take the whole monitor.
    if ((w.platform === "ios" || w.platform === "android") && w.isVersionAtLeast?.("8.0") && !w.isFullscreen) w.requestFullscreen?.();
    w.setHeaderColor?.("#0c0e1c");
    w.setBackgroundColor?.("#0c0e1c");
  } catch {
    /* older clients */
  }
}

export const haptic = {
  tap: () => tg()?.HapticFeedback?.impactOccurred("light"),
  hit: () => tg()?.HapticFeedback?.impactOccurred("medium"),
  ok: () => tg()?.HapticFeedback?.notificationOccurred("success"),
  err: () => tg()?.HapticFeedback?.notificationOccurred("error"),
  heavy: () => tg()?.HapticFeedback?.impactOccurred("heavy"),
  /** a rolling triple thump for big moments (level up, chest) */
  big: () => {
    const h = tg()?.HapticFeedback;
    if (!h) return;
    h.notificationOccurred("success");
    setTimeout(() => h.impactOccurred("heavy"), 180);
    setTimeout(() => h.impactOccurred("medium"), 360);
  },
};

/** Shows Telegram's back button while `on`; returns a cleanup. */
export function telegramBack(on: boolean, go: () => void) {
  const b = tg()?.BackButton;
  if (!b) return () => undefined;
  if (on) {
    b.show();
    b.onClick(go);
  } else b.hide();
  return () => {
    b.offClick(go);
  };
}

/** Asks Telegram to let the bot write to the player (for reminders). Resolves false outside Telegram or on refusal. */
export function requestWriteAccess(): Promise<boolean> {
  const w = tg();
  if (!w?.requestWriteAccess) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      w.requestWriteAccess!((granted) => resolve(!!granted));
    } catch {
      resolve(false);
    }
  });
}
