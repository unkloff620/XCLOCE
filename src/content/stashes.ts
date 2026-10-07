/*
 * Нычки: 4 набора по 4 нычки, у каждого набора своя локация (1-й набор — в 1-й локации и т. д.).
 * Нычка может найтись за шаг задания в этой локации (шанс мал); выпадают только те, которых ещё нет.
 * Собрал все 4 — набор закрыт, в достижениях «Нычки» забирается награда за него.
 */
import type { Reward } from "./rewards.ts";

export interface StashDef { id: string; name: string; description: string }
export interface StashSet { id: string; n: number; name: string; location: string; items: StashDef[]; reward: Reward }

/** chance that a task step in the set's location finds one of the missing stashes */
export const STASH_CHANCE = 0.03;

export const STASH_SETS: StashSet[] = [
  {
    id: "stash-set-1", n: 1, name: "Нычки опенспейса", location: "openspace",
    reward: { currencies: { RUB: 3000 }, xp: 5_000, items: [{ id: "keyboard", qty: 5 }] },
    items: [
      { id: "stash-sneaker", name: "Кроссовок с двойным дном", description: "Под стелькой — пачка налички и монета TON. Stay broke, stay dangerous." },
      { id: "stash-cigs", name: "Пачка сигарет", description: "Вместо сигарет — Пепе, зажигалка и котлета долларов." },
      { id: "stash-noodles", name: "Лапша BONK", description: "Prison degen diet: лапша, монета BONK и холодный кошелёк." },
      { id: "stash-can", name: "Мятая банка", description: "Внутри флешка с ключами и записка «To the moon»." },
    ],
  },
  {
    id: "stash-set-2", n: 2, name: "Нычки крипто-рынка", location: "market",
    reward: { currencies: { USD: 25 }, xp: 15_000, items: [{ id: "gpu", qty: 2 }] },
    items: [
      { id: "stash-bread", name: "Хлебный тайник", description: "Буханка, а в мякише — биткоины, завёрнутые в фольгу." },
      { id: "stash-soap", name: "Мыло с секретом", description: "Не урони. Внутри — флешка и монета Solana." },
      { id: "stash-mattress", name: "Матрас-сейф", description: "Классика: эфир, ключ и зажигалка под обивкой." },
      { id: "stash-radio", name: "Радио «Cell Block 0420»", description: "Ловит только Doge FM. Seed-фраза — на крышке." },
    ],
  },
  {
    id: "stash-set-3", n: 3, name: "Нычки серверной", location: "serverroom",
    reward: { currencies: { SOL: 0.05 }, xp: 40_000, items: [{ id: "gpu", qty: 5 }] },
    items: [
      { id: "stash-beanie", name: "Шапка-заначка", description: "Полосатая шапка, а в отвороте — TON и доллары." },
      { id: "stash-coffee", name: "Банка кофе", description: "Растворимый кофе, Solana и аппаратный кошелёк." },
      { id: "stash-sardines", name: "Шпроты с эфиром", description: "В масле — золотые монеты Ethereum." },
      { id: "stash-thermos", name: "Термос", description: "Горячее содержимое: монета-ракета и флешка." },
    ],
  },
  {
    id: "stash-set-4", n: 4, name: "Нычки майнинг-подвала", location: "basement",
    reward: { currencies: { SOL: 0.15 }, xp: 100_000, items: [{ id: "rug-pull-gun", qty: 1 }] },
    items: [
      { id: "stash-slipper", name: "Тапок", description: "Подошва с секретом: Doge, доллары и пакетик." },
      { id: "stash-deo", name: "Дезодорант", description: "Пахнет деньгами: BONK, флешка и рулон долларов." },
      { id: "stash-book", name: "Книга-тайник", description: "Страницы вырезаны. Внутри — Пепе и записка «Keep going»." },
      { id: "stash-paste", name: "Тюбик пасты", description: "Hold, freedom soon: XRP и ключ в тюбике." },
    ],
  },
];

export const STASH_IDS = STASH_SETS.flatMap((s) => s.items.map((i) => i.id));
export const stashSetOf = (itemId: string) => STASH_SETS.find((s) => s.items.some((i) => i.id === itemId));
export const stashSetByLocation = (locationId: string) => STASH_SETS.find((s) => s.location === locationId);
