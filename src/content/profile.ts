import type { Currency } from "./currencies.ts";

/** Смена ника в игре: платно, не чаще раза в сутки. Telegram-профиль не меняется. Переопределяется через config "rename". */
export const RENAME = { currency: "RUB" as Currency, price: 1000, cooldownH: 24, min: 3, max: 20 };
/** Allowed: letters (any alphabet), digits, space, _ - . */
export const NICK_RE = /^[\p{L}\p{N}_. -]+$/u;
