/*
 * Нычки: наборы по 4 нычки, у каждой локации свои 4 набора.
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
  accounting: { currencies: { RUB: 1250 }, xp: 6_000 },
  hr: { currencies: { RUB: 1500 }, xp: 7_000 },
  party: { currencies: { RUB: 1750 }, xp: 8_000 },
  offshore: { currencies: { RUB: 2000 }, xp: 9_000 },
  yacht: { currencies: { RUB: 2500 }, xp: 10_000 },
  moonbase: { currencies: { RUB: 3000 }, xp: 12_000 },
};
/** the order of the locations (rarity and medal of their sets grow with it) */
export const STASH_LOCATIONS = ["openspace", "market", "serverroom", "basement", "board", "accounting", "hr", "party", "offshore", "yacht", "moonbase"] as const;
export const STASH_LOCATION_NAMES: Record<string, string> = { openspace: "Опенспейс", market: "Крипто-рынок", serverroom: "Серверная", basement: "Майнинг-подвал", board: "Совет директоров", accounting: "Бухгалтерия", hr: "Отдел кадров", party: "Новогодний корпоратив", offshore: "Офшор", yacht: "Яхта кита", moonbase: "Лунная база" };

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
  {
    id: "stash-set-17", n: 17, name: "Офисная заначка", location: "openspace", reward: LOC_REWARD.openspace,
    items: [
      { id: "stash-off-stapler", name: "Степлер-сейф", description: "Скрепки кончились, зато внутри — рулон долларов." },
      { id: "stash-off-mug", name: "Кружка «Лучший сотрудник»", description: "Чай давно остыл. Под пакетиком — монета TON." },
      { id: "stash-off-folder", name: "Папка «Отчёты»", description: "Отчётов нет. Есть сид-фраза и наличка." },
      { id: "stash-off-mouse", name: "Мышка с секретом", description: "Не кликает, но хранит флешку с ключами." },
    ],
  },
  {
    id: "stash-set-18", n: 18, name: "Набор SHIB", location: "market", reward: LOC_REWARD.market,
    items: [
      { id: "stash-shib-plush", name: "Плюшевый Шиба", description: "Мягкий снаружи, жёсткий холдер внутри." },
      { id: "stash-shib-coin", name: "Монета SHIB", description: "Тысяча нулей после запятой — и всё твои." },
      { id: "stash-shib-bandana", name: "Бандана SHIB", description: "Красная бандана с лапками. В узле — доллары." },
      { id: "stash-shib-bone", name: "Косточка-флешка", description: "Грызть нельзя: там холодный кошелёк." },
    ],
  },
  {
    id: "stash-set-19", n: 19, name: "Тайник админа", location: "serverroom", reward: LOC_REWARD.serverroom,
    items: [
      { id: "stash-adm-hdd", name: "Жёсткий диск", description: "Крышка снята, вместо блинов — монеты." },
      { id: "stash-adm-cable", name: "Моток кабеля", description: "Внутри мотка — пачка налички. Никто не распутает." },
      { id: "stash-adm-router", name: "Роутер", description: "Мигает всеми лампочками. Под крышкой — биткоин." },
      { id: "stash-adm-floppy", name: "Дискета с сид-фразой", description: "Надпись маркером: «НЕ ФОРМАТИРОВАТЬ»." },
    ],
  },
  {
    id: "stash-set-20", n: 20, name: "Заначка майнера", location: "basement", reward: LOC_REWARD.basement,
    items: [
      { id: "stash-rig-fan", name: "Кулер с монетами", description: "Крутится медленно — мешают монеты." },
      { id: "stash-rig-psu", name: "Блок питания", description: "1200 ватт и котлета долларов вместо платы." },
      { id: "stash-rig-strip", name: "Удлинитель-тройник", description: "Восемь розеток, восемь ригов, одна заначка." },
      { id: "stash-rig-bill", name: "Счёт за свет", description: "Сумма страшнее любого дампа. На обороте — сид." },
    ],
  },
  {
    id: "stash-set-21", n: 21, name: "Чёрная касса", location: "accounting", reward: LOC_REWARD.accounting,
    items: [
      { id: "stash-acc-calc", name: "Калькулятор-тайник", description: "Считает только прибыль. Под батарейкой — монета." },
      { id: "stash-acc-ledger", name: "Гроссбух", description: "Две бухгалтерии: одна для налоговой, другая — для тебя." },
      { id: "stash-acc-stamp", name: "Печать «ОПЛАЧЕНО»", description: "Ставит «оплачено» на всё, даже на ламбу." },
      { id: "stash-acc-envelope", name: "Конверт с премией", description: "Премия в конверте — классика жанра." },
    ],
  },
  {
    id: "stash-set-22", n: 22, name: "Сейф главбуха", location: "accounting", reward: LOC_REWARD.accounting,
    items: [
      { id: "stash-cfo-safe", name: "Мини-сейф", description: "Код — дата рождения главбуха. Все знают." },
      { id: "stash-cfo-glasses", name: "Очки главбуха", description: "С цепочкой. В футляре — флешка." },
      { id: "stash-cfo-abacus", name: "Счёты", description: "Костяшки — это монетки. Биткоины, если точнее." },
      { id: "stash-cfo-receipts", name: "Пачка чеков", description: "Все чеки — «представительские расходы»." },
    ],
  },
  {
    id: "stash-set-23", n: 23, name: "Налоговый вычет", location: "accounting", reward: LOC_REWARD.accounting,
    items: [
      { id: "stash-tax-form", name: "Декларация", description: "Доход: ноль. Кошелёк: секрет." },
      { id: "stash-tax-usdt", name: "Монета USDT", description: "Стабильная, как зарплата бухгалтера." },
      { id: "stash-tax-shredder", name: "Шредер", description: "Документы режет, деньги — бережёт." },
      { id: "stash-tax-cookie", name: "Печенье для инспектора", description: "Коробка печенья, а под печеньем — пачка долларов." },
    ],
  },
  {
    id: "stash-set-24", n: 24, name: "Пепе-бухгалтер", location: "accounting", reward: LOC_REWARD.accounting,
    items: [
      { id: "stash-pacc-pepe", name: "Пепе в нарукавниках", description: "Сводит дебет с кредитом и пампом." },
      { id: "stash-pacc-chart", name: "Отчёт в плюсе", description: "Квартал закрыт в зелёную." },
      { id: "stash-pacc-pen", name: "Котлеты налички", description: "Свёрнуты аккуратно, как годовой отчёт." },
      { id: "stash-pacc-binder", name: "Скоросшиватель", description: "Внутри — не бумаги, а купюры." },
    ],
  },
  {
    id: "stash-set-25", n: 25, name: "Личное дело", location: "hr", reward: LOC_REWARD.hr,
    items: [
      { id: "stash-hr-file", name: "Папка с делом", description: "«Хранить вечно». Особенно то, что внутри." },
      { id: "stash-hr-badge", name: "Пропуск", description: "Открывает все двери. И сейф." },
      { id: "stash-hr-stamp", name: "Штамп «УВОЛЕН»", description: "Самая страшная печать офиса." },
      { id: "stash-hr-photo", name: "Фото на пропуск", description: "Неудачное. Зато за ним — наличка." },
    ],
  },
  {
    id: "stash-set-26", n: 26, name: "Тимбилдинг", location: "hr", reward: LOC_REWARD.hr,
    items: [
      { id: "stash-tb-rope", name: "Верёвка", description: "Для доверия и для побега." },
      { id: "stash-tb-helmet", name: "Каска", description: "Верёвочный парк — дело серьёзное." },
      { id: "stash-tb-medal", name: "Медаль «Командный игрок»", description: "Дали всем. Но у тебя — с монетой внутри." },
      { id: "stash-tb-whistle", name: "Свисток тренера", description: "Свистит — и все бегут закупаться." },
    ],
  },
  {
    id: "stash-set-27", n: 27, name: "Мы — семья", location: "hr", reward: LOC_REWARD.hr,
    items: [
      { id: "stash-fam-mug", name: "Кружка «Мы — семья»", description: "С логотипом. Внутри — твоя доля." },
      { id: "stash-fam-tee", name: "Футболка с логотипом", description: "Размер один на всех. В кармане — доллары." },
      { id: "stash-fam-cake", name: "Торт на день рождения", description: "Общий на весь отдел. Внутри — флешка." },
      { id: "stash-fam-plant", name: "Офисный фикус", description: "Его поливают раз в год. А в горшке — монеты." },
    ],
  },
  {
    id: "stash-set-28", n: 28, name: "Попкот", location: "hr", reward: LOC_REWARD.hr,
    items: [
      { id: "stash-pop-cat", name: "Попкот", description: "Открывает рот — и курс растёт." },
      { id: "stash-pop-coin", name: "Монета POPCAT", description: "Круглая, как рот того кота." },
      { id: "stash-pop-bowl", name: "Миска корма", description: "Корм дорогой, зато миска полна монет." },
      { id: "stash-pop-yarn", name: "Клубок", description: "Распутаешь — найдёшь ключ." },
    ],
  },
  {
    id: "stash-set-29", n: 29, name: "Новогодний стол", location: "party", reward: LOC_REWARD.party,
    items: [
      { id: "stash-ny-olivie", name: "Тазик оливье", description: "На дне тазика — монеты. Ищи ложкой." },
      { id: "stash-ny-champ", name: "Шампанское", description: "Пробка вылетела, а в бутылке — свёрток." },
      { id: "stash-ny-tangerine", name: "Мандарины", description: "Пахнут Новым годом и прибылью." },
      { id: "stash-ny-herring", name: "Селёдка под шубой", description: "Под шубой — не только селёдка." },
    ],
  },
  {
    id: "stash-set-30", n: 30, name: "Мешок Деда Мороза", location: "party", reward: LOC_REWARD.party,
    items: [
      { id: "stash-santa-bag", name: "Мешок с подарками", description: "Тяжёлый. Потому что монеты." },
      { id: "stash-santa-beard", name: "Борода", description: "Чешется. В ней спрятан кошелёк." },
      { id: "stash-santa-staff", name: "Посох", description: "Стукнешь — и рынок растёт." },
      { id: "stash-santa-gift", name: "Подарок с биткоином", description: "Под бантом — то, чего ты ждал весь год." },
    ],
  },
  {
    id: "stash-set-31", n: 31, name: "Ёлочные игрушки", location: "party", reward: LOC_REWARD.party,
    items: [
      { id: "stash-tree-ball", name: "Шар с биткоином", description: "Стеклянный шар, внутри — монета." },
      { id: "stash-tree-star", name: "Звезда на макушку", description: "Светится, как зелёная свеча." },
      { id: "stash-tree-garland", name: "Гирлянда", description: "Мигает в такт графику." },
      { id: "stash-tree-cone", name: "Шишка-флешка", description: "Висит на ёлке, хранит ключи." },
    ],
  },
  {
    id: "stash-set-32", n: 32, name: "Караоке-ночь", location: "party", reward: LOC_REWARD.party,
    items: [
      { id: "stash-kar-mic", name: "Микрофон", description: "Поёт фальшиво, хранит честно." },
      { id: "stash-kar-disco", name: "Диско-шар", description: "Блестит, как портфель на хаях." },
      { id: "stash-kar-glasses", name: "Очки-звёзды", description: "Без них на корпоратив не пускают." },
      { id: "stash-kar-tie", name: "Галстук на голову", description: "Классика конца вечера. В узле — доллары." },
    ],
  },
  {
    id: "stash-set-33", n: 33, name: "Кайманский сейф", location: "offshore", reward: LOC_REWARD.offshore,
    items: [
      { id: "stash-cay-box", name: "Банковская ячейка", description: "Номер ячейки знаешь только ты. И налоговая." },
      { id: "stash-cay-palm", name: "Пальма в горшке", description: "Офшорная классика. В кадке — слитки." },
      { id: "stash-cay-gold", name: "Слиток золота", description: "999 проба, 0 налогов." },
      { id: "stash-cay-key", name: "Ключ от ячейки", description: "Маленький ключ от большой тайны." },
    ],
  },
  {
    id: "stash-set-34", n: 34, name: "Чемодан наличных", location: "offshore", reward: LOC_REWARD.offshore,
    items: [
      { id: "stash-case-case", name: "Кейс с кодом", description: "Код: 0000. Никто не догадается." },
      { id: "stash-case-euro", name: "Пачка евро", description: "Евро тоже деньги. Для разнообразия." },
      { id: "stash-case-cuff", name: "Наручник для кейса", description: "Чтобы кейс не ушёл без тебя." },
      { id: "stash-case-cigar", name: "Сигара", description: "Курить вредно. Холдить — нет." },
    ],
  },
  {
    id: "stash-set-35", n: 35, name: "Холодный кошелёк", location: "offshore", reward: LOC_REWARD.offshore,
    items: [
      { id: "stash-cold-wallet", name: "Аппаратный кошелёк", description: "В холоде, в тишине, в офшоре." },
      { id: "stash-cold-steel", name: "Сид на стали", description: "24 слова, выбитые молотком." },
      { id: "stash-cold-ice", name: "Кубик льда с монетой", description: "Самое холодное хранение." },
      { id: "stash-cold-tube", name: "Капсула-тайник", description: "Закопана на пляже. Карта — у тебя." },
    ],
  },
  {
    id: "stash-set-36", n: 36, name: "Пингвин в офшоре", location: "offshore", reward: LOC_REWARD.offshore,
    items: [
      { id: "stash-peng-plush", name: "Пингвин", description: "Толстый, довольный, при деньгах." },
      { id: "stash-peng-coin", name: "Монета PENGU", description: "Холодная, как его лапки." },
      { id: "stash-peng-ice", name: "Льдина", description: "Плавучий сейф. Тает медленно." },
      { id: "stash-peng-scarf", name: "Шарфик", description: "В шарфе — пачка долларов. Чтоб не мёрзли." },
    ],
  },
  {
    id: "stash-set-37", n: 37, name: "Палуба кита", location: "yacht", reward: LOC_REWARD.yacht,
    items: [
      { id: "stash-y-wheel", name: "Штурвал", description: "Курс — на хаи." },
      { id: "stash-y-anchor", name: "Якорь", description: "Держит позицию в любой шторм." },
      { id: "stash-y-buoy", name: "Спасательный круг", description: "Спасает от ликвидации." },
      { id: "stash-y-binoc", name: "Бинокль", description: "Видно китов на горизонте." },
    ],
  },
  {
    id: "stash-set-38", n: 38, name: "Улов кита", location: "yacht", reward: LOC_REWARD.yacht,
    items: [
      { id: "stash-whale-plush", name: "Кит", description: "Большой кит — большие движения рынка." },
      { id: "stash-whale-net", name: "Сеть с монетами", description: "Хороший улов: биткоины и эфир." },
      { id: "stash-whale-pearl", name: "Жемчужина", description: "Нашлась в раковине. Стоит как ламба." },
      { id: "stash-whale-chest", name: "Сундук со дна", description: "Ракушки снаружи, сокровища внутри." },
    ],
  },
  {
    id: "stash-set-39", n: 39, name: "Вечеринка на яхте", location: "yacht", reward: LOC_REWARD.yacht,
    items: [
      { id: "stash-yp-cocktail", name: "Коктейль", description: "С зонтиком. И с монетой на дне." },
      { id: "stash-yp-shades", name: "Очки кита", description: "Солнце светит — портфель растёт." },
      { id: "stash-yp-bucket", name: "Ведёрко с шампанским", description: "Во льду — бутылка, под льдом — доллары." },
      { id: "stash-yp-jetski", name: "Гидроцикл", description: "Игрушечный, но с тайником." },
    ],
  },
  {
    id: "stash-set-40", n: 40, name: "Пепе-капитан", location: "yacht", reward: LOC_REWARD.yacht,
    items: [
      { id: "stash-cap-pepe", name: "Пепе в фуражке", description: "Капитан, который всегда покупает дно." },
      { id: "stash-cap-hat", name: "Капитанская фуражка", description: "Под козырьком — сид-фраза." },
      { id: "stash-cap-map", name: "Карта сокровищ", description: "Крестик стоит прямо на Луне." },
      { id: "stash-cap-compass", name: "Компас «To the moon»", description: "Стрелка показывает только вверх." },
    ],
  },
  {
    id: "stash-set-41", n: 41, name: "Лунный модуль", location: "moonbase", reward: LOC_REWARD.moonbase,
    items: [
      { id: "stash-moon-helmet", name: "Шлем скафандра", description: "В стекле отражаются зелёные свечи." },
      { id: "stash-moon-flag", name: "Флаг HODL", description: "Воткнут в Луну навсегда." },
      { id: "stash-moon-rock", name: "Лунный камень", description: "Внутри — кристалл биткоина." },
      { id: "stash-moon-boot", name: "Лунный ботинок", description: "Под стелькой — монеты на обратный путь." },
    ],
  },
  {
    id: "stash-set-42", n: 42, name: "Пришелец-холдер", location: "moonbase", reward: LOC_REWARD.moonbase,
    items: [
      { id: "stash-alien-head", name: "Пришелец", description: "Прилетел купить на дне." },
      { id: "stash-alien-ufo", name: "Летающая тарелка", description: "Похищает монеты у медведей." },
      { id: "stash-alien-ray", name: "Бластер", description: "Стреляет зелёными свечами." },
      { id: "stash-alien-coin", name: "Межгалактическая монета", description: "Принимается на всех планетах." },
    ],
  },
  {
    id: "stash-set-43", n: 43, name: "Лунная ферма", location: "moonbase", reward: LOC_REWARD.moonbase,
    items: [
      { id: "stash-lf-rig", name: "Риг на Луне", description: "Охлаждение бесплатное: минус 170." },
      { id: "stash-lf-panel", name: "Солнечная панель", description: "Свет бесплатный, прибыль — тоже." },
      { id: "stash-lf-dish", name: "Антенна", description: "Ловит сигналы пампа с Земли." },
      { id: "stash-lf-crater", name: "Кратер с монетами", description: "Упал метеорит — а там монеты." },
    ],
  },
  {
    id: "stash-set-44", n: 44, name: "Ракета на Луну", location: "moonbase", reward: LOC_REWARD.moonbase,
    items: [
      { id: "stash-rk-rocket", name: "Ракета", description: "Заправлена надеждами по самые дюзы." },
      { id: "stash-rk-fuel", name: "Канистра топлива", description: "Ракетное топливо — чистый хайп." },
      { id: "stash-rk-button", name: "Пульт запуска", description: "Одна кнопка: «ПАМП»." },
      { id: "stash-rk-ticket", name: "Билет в один конец", description: "Земля → Луна. Обратно не нужно." },
    ],
  },
];
/** sets collected for the bronze, silver and gold medal of a set */
export const STASH_MEDAL_TARGETS = [10, 50, 100] as const;
export const STASH_IDS = STASH_SETS.flatMap((s) => s.items.map((i) => i.id));
export const stashSetOf = (itemId: string) => STASH_SETS.find((s) => s.items.some((i) => i.id === itemId));
export const stashSetsByLocation = (locationId: string) => STASH_SETS.filter((s) => s.location === locationId);
/** 1 for the first location … 11 for the last */
export const stashLevel = (s: StashSet) => STASH_LOCATIONS.indexOf(s.location as (typeof STASH_LOCATIONS)[number]) + 1;
/** the sets in the order of the locations */
export const STASH_SETS_ORDERED = [...STASH_SETS].sort((a, b) => stashLevel(a) - stashLevel(b) || a.n - b.n);
