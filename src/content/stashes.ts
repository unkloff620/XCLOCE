/*
 * Нычки: наборы по 4 нычки, у каждой локации свои наборы (в первых трёх — по 3, в подвале и совете директоров — по 4).
 * Нычки находятся за трату энергии в заданиях: шанс шага — STASH_PER_ENERGY за каждую потраченную единицу энергии
 * (шаг за 3 ⚡ — 3%, за 20 ⚡ — 20%). Невезение копится: потратил STASH_PITY энергии без находки — следующий шаг
 * находит нычку наверняка (счётчик обнуляется при любой находке). Чаще выпадают нычки, которых у игрока ещё нет.
 * Закрытие локации нычку не даёт. Нычки выпадают повторно и копятся. Есть все 4 нычки набора — нажимаешь на картинку набора в «Нычках»:
 * по одной нычке каждого вида уходит, приходит награда набора, счётчик собранных наборов растёт. За 10, 50 и 100
 * собранных наборов — бронзовая, серебряная и золотая медаль (как у боссов).
 */
import type { Reward } from "./rewards.ts";

export interface StashDef { id: string; name: string; description: string }
export interface StashSet { id: string; n: number; name: string; location: string; items: StashDef[]; reward: Reward }

/** chance per energy point spent on a task step that the step finds a stash (a 3-energy step: 3%) */
export const STASH_PER_ENERGY = 0.01;
/** energy spent in tasks without a find, after which the next step finds a stash for sure */
export const STASH_PITY = 150;
/** a stash the player does not have yet is this many times likelier than one he has */
export const STASH_MISSING_WEIGHT = 3;
/** the chance of a step that costs `energy` */
export const stashChance = (energy: number) => Math.min(1, energy * STASH_PER_ENERGY);

const LOC_REWARD: Record<string, Reward> = {
  openspace: { currencies: { RUB: 100 }, xp: 1_000 },
  market: { currencies: { RUB: 300 }, xp: 2_000 },
  serverroom: { currencies: { RUB: 500 }, xp: 3_000 },
  basement: { currencies: { RUB: 750 }, xp: 4_000 },
  board: { currencies: { RUB: 1000 }, xp: 5_000 },
};
/** the order of the locations (rarity and medal of their sets grow with it) */
export const STASH_LOCATIONS = ["openspace", "market", "serverroom", "basement", "board"] as const;
export const STASH_LOCATION_NAMES: Record<string, string> = { openspace: "Опенспейс", market: "Крипто-рынок", serverroom: "Серверная", basement: "Майнинг-подвал", board: "Совет директоров" };

export const STASH_SETS: StashSet[] = [
  {
    id: "stash-set-1", n: 1, name: "Нычки опенспейса", location: "openspace",
    reward: LOC_REWARD.openspace,
    items: [
      { id: "stash-sneaker", name: "Кроссовок с двойным дном", description: "Под стелькой — пачка налички и монета TON. Stay broke, stay dangerous." },
      { id: "stash-cigs", name: "Пачка сигарет", description: "Вместо сигарет — Пепе, зажигалка и котлета долларов." },
      { id: "stash-noodles", name: "Лапша BONK", description: "Prison degen diet: лапша, монета BONK и холодный кошелёк." },
      { id: "stash-can", name: "Мятая банка", description: "Внутри флешка с ключами и записка «To the moon»." },
    ],
  },
  {
    id: "stash-set-2", n: 2, name: "Нычки крипто-рынка", location: "market",
    reward: LOC_REWARD.market,
    items: [
      { id: "stash-bread", name: "Хлебный тайник", description: "Буханка, а в мякише — биткоины, завёрнутые в фольгу." },
      { id: "stash-soap", name: "Мыло с секретом", description: "Не урони. Внутри — флешка и монета Solana." },
      { id: "stash-mattress", name: "Матрас-сейф", description: "Классика: эфир, ключ и зажигалка под обивкой." },
      { id: "stash-radio", name: "Радио «Cell Block 0420»", description: "Ловит только Doge FM. Seed-фраза — на крышке." },
    ],
  },
  {
    id: "stash-set-3", n: 3, name: "Нычки серверной", location: "serverroom",
    reward: LOC_REWARD.serverroom,
    items: [
      { id: "stash-beanie", name: "Шапка-заначка", description: "Полосатая шапка, а в отвороте — TON и доллары." },
      { id: "stash-coffee", name: "Банка кофе", description: "Растворимый кофе, Solana и аппаратный кошелёк." },
      { id: "stash-sardines", name: "Шпроты с эфиром", description: "В масле — золотые монеты Ethereum." },
      { id: "stash-thermos", name: "Термос", description: "Горячее содержимое: монета-ракета и флешка." },
    ],
  },
  {
    id: "stash-set-4", n: 4, name: "Нычки майнинг-подвала", location: "basement",
    reward: LOC_REWARD.basement,
    items: [
      { id: "stash-slipper", name: "Тапок", description: "Подошва с секретом: Doge, доллары и пакетик." },
      { id: "stash-deo", name: "Дезодорант", description: "Пахнет деньгами: BONK, флешка и рулон долларов." },
      { id: "stash-book", name: "Книга-тайник", description: "Страницы вырезаны. Внутри — Пепе и записка «Keep going»." },
      { id: "stash-paste", name: "Тюбик пасты", description: "Hold, freedom soon: XRP и ключ в тюбике." },
    ],
  },
  {
    id: "stash-set-5", n: 5, name: "Пепе на зоне", location: "openspace", reward: LOC_REWARD.openspace,
    items: [
      { id: "stash-pepe-head", name: "Пепе в шапке", description: "Держит биткоин в зубах — так надёжнее." },
      { id: "stash-pepe-paper", name: "Рулон с Пепе", description: "Самая твёрдая валюта на зоне." },
      { id: "stash-pepe-shiv", name: "Заточка", description: "Изолента, железка и немного фантазии." },
      { id: "stash-pepe-mug", name: "Кружка чифиря", description: "Крепкий, как холд на дне рынка." },
    ],
  },
  {
    id: "stash-set-6", n: 6, name: "Набор WIF", location: "market", reward: LOC_REWARD.market,
    items: [
      { id: "stash-wif-beanie", name: "Розовая шапка WIF", description: "Dog wif hat. Без собаки." },
      { id: "stash-wif-dog", name: "Пёс в шапке", description: "Тот самый. В очках и при шапке." },
      { id: "stash-wif-can", name: "Банка WIF", description: "Энергетик для тех, кто холдит до утра." },
      { id: "stash-wif-tag", name: "Жетон WIF", description: "Розовый жетон с лапкой — пропуск в стаю." },
    ],
  },
  {
    id: "stash-set-7", n: 7, name: "Будка Доге", location: "serverroom", reward: LOC_REWARD.serverroom,
    items: [
      { id: "stash-doge-helmet", name: "Шлем WOW", description: "Скафандр для полёта на Луну." },
      { id: "stash-doge-tag", name: "Жетон DOGE", description: "Золотая косточка с короной." },
      { id: "stash-doge-rocket", name: "Ракета Доге", description: "Заправлена мемами под завязку." },
      { id: "stash-doge-bowl", name: "Миска с монетами", description: "Доге ест только DOGE." },
    ],
  },
  {
    id: "stash-set-8", n: 8, name: "Сундук биткоинера", location: "basement", reward: LOC_REWARD.basement,
    items: [
      { id: "stash-btc-coin", name: "Биткоин", description: "Цифровое золото, отлитое в настоящем." },
      { id: "stash-btc-bull", name: "Бронзовый бык", description: "С горящими глазами — рынок растёт." },
      { id: "stash-btc-cash", name: "Котлета долларов", description: "Перетянута лентой с биткоином." },
      { id: "stash-btc-lighter", name: "Зажигалка BTC", description: "Сжигать шорты." },
    ],
  },
  {
    id: "stash-set-12", n: 12, name: "Быки против медведей", location: "basement", reward: LOC_REWARD.basement,
    items: [
      { id: "stash-bb-bear", name: "Медведь", description: "Красный, злой и всегда не вовремя." },
      { id: "stash-bb-bull", name: "Бык", description: "Зелёный и рвётся вверх." },
      { id: "stash-bb-candles", name: "Свечи графика", description: "Красные, зелёные — главное, чтобы было что продать." },
      { id: "stash-bb-eth", name: "Кристалл Эфира", description: "Трещит от напряжения сети." },
    ],
  },
  {
    id: "stash-set-9", n: 9, name: "Король Доге", location: "board", reward: LOC_REWARD.board,
    items: [
      { id: "stash-king-coin", name: "Монета Доге", description: "Much coin. Very gold. Wow." },
      { id: "stash-king-crown", name: "Корона", description: "Для того, кто дошёл до Луны." },
      { id: "stash-king-rocket", name: "Золотая ракета", description: "Билет в один конец — наверх." },
      { id: "stash-king-moon", name: "Луна", description: "Куда же ещё." },
    ],
  },
  {
    id: "stash-set-10", n: 10, name: "Пепе-трейдер", location: "board", reward: LOC_REWARD.board,
    items: [
      { id: "stash-trader-pepe", name: "Пепе", description: "Спокоен. Позиция открыта." },
      { id: "stash-trader-laptop", name: "Ноутбук с графиком", description: "Только зелёные свечи." },
      { id: "stash-trader-cash", name: "Пачка пепе-долларов", description: "Напечатано на прибыль." },
      { id: "stash-trader-chart", name: "Зелёный график", description: "Number go up." },
    ],
  },
  {
    id: "stash-set-11", n: 11, name: "Биткоин-миллионер", location: "board", reward: LOC_REWARD.board,
    items: [
      { id: "stash-rich-coin", name: "Золотой биткоин", description: "Тот самый, купленный по 100." },
      { id: "stash-rich-lambo", name: "Чёрная ламба", description: "Wen lambo? Now." },
      { id: "stash-rich-watch", name: "Часы с бриллиантами", description: "Показывают только время покупать." },
      { id: "stash-rich-bar", name: "Слиток BTC", description: "Тяжёлый, как бычий рынок." },
    ],
  },
  {
    id: "stash-set-15", n: 15, name: "Мемная заначка", location: "openspace", reward: LOC_REWARD.openspace,
    items: [
      { id: "stash-meme-mug", name: "Кружка «Hold bro»", description: "Пять палочек — пять лет холда. Внутри Пепе и котлета." },
      { id: "stash-meme-noodles", name: "Стакан лапши BONK", description: "Лапша, BONK, пакетик и холодный кошелёк. Ужин чемпиона." },
      { id: "stash-meme-can", name: "Банка «To the moon»", description: "Монета-ракета, флешка и записка: курс только вверх." },
      { id: "stash-meme-cigs", name: "Пачка с Пепе в очках", description: "Вместо сигарет — Пепе в очках, зажигалка и доллары." },
    ],
  },
  {
    id: "stash-set-14", n: 14, name: "Холдер XRP", location: "market", reward: LOC_REWARD.market,
    items: [
      { id: "stash-xrp-paste", name: "Тюбик «Hold the line»", description: "XRP, рулон долларов и записка: «Hold the line, bro»." },
      { id: "stash-xrp-deo", name: "Дезодорант с секретом", description: "Пахнет морем и холодным кошельком. Внутри XRP." },
      { id: "stash-xrp-slipper", name: "Тапок-сейф", description: "Под стелькой — XRP, пачка долларов и пакетик." },
      { id: "stash-xrp-beanie", name: "Шапка холдера", description: "В отвороте — XRP, доллары и зажигалка." },
    ],
  },
  {
    id: "stash-set-13", n: 13, name: "Заначка на Солане", location: "serverroom", reward: LOC_REWARD.serverroom,
    items: [
      { id: "stash-sol-canister", name: "Армейский тубус", description: "Ржавый снаружи, Solana и флешка с ключами внутри." },
      { id: "stash-sol-pillow", name: "Подушка-сейф", description: "Вата, Solana и пачка налички. Спится спокойно." },
      { id: "stash-sol-radio", name: "Приёмник с тайником", description: "Ловит только пампы. За панелью — Solana и кошелёк." },
      { id: "stash-sol-paste", name: "Тюбик с Соланой", description: "Выдавил — а там монета, доллары и ключ." },
    ],
  },
  {
    id: "stash-set-16", n: 16, name: "Эфирный тайник", location: "board", reward: LOC_REWARD.board,
    items: [
      { id: "stash-eth-soap", name: "Мыло с эфиром", description: "Внутри — монеты Ethereum и аппаратный кошелёк. Не урони." },
      { id: "stash-eth-sardines", name: "Шпроты-сейф", description: "Вместо рыбы — эфир и рулоны долларов." },
      { id: "stash-eth-book", name: "Книга с вырезом", description: "Обложка с ромбом эфира, внутри монета и зажигалка." },
      { id: "stash-eth-coffee", name: "Банка кофе с ETH", description: "Растворимый, бодрящий и с монетой эфира на дне." },
    ],
  },
];
/** sets collected for the bronze, silver and gold medal of a set */
export const STASH_MEDAL_TARGETS = [10, 50, 100] as const;
export const STASH_IDS = STASH_SETS.flatMap((s) => s.items.map((i) => i.id));
export const stashSetOf = (itemId: string) => STASH_SETS.find((s) => s.items.some((i) => i.id === itemId));
export const stashSetsByLocation = (locationId: string) => STASH_SETS.filter((s) => s.location === locationId);
/** 1 for the first location … 5 for the last */
export const stashLevel = (s: StashSet) => STASH_LOCATIONS.indexOf(s.location as (typeof STASH_LOCATIONS)[number]) + 1;
/** the sets in the order of the locations */
export const STASH_SETS_ORDERED = [...STASH_SETS].sort((a, b) => stashLevel(a) - stashLevel(b) || a.n - b.n);
