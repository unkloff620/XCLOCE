"use client";
/* Thin wrapper over window.Telegram.WebApp (present only inside Telegram). */

interface TgWebApp {
  initData: string;
  initDataUnsafe?: { start_param?: string };
  ready(): void;
  expand(): void;
  disableVerticalSwipes?(): void;
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

/** The Mini App was opened with t.me/<bot>?startapp=admin: the admin panel, not the game. */
export function openedForAdmin(): boolean {
  return tg()?.initDataUnsafe?.start_param === "admin";
}

export function initTelegram() {
  const w = tg();
  if (!w) return;
  try {
    w.ready();
    w.expand();
    w.disableVerticalSwipes?.();
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
