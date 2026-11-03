/*
 * «Новичок» — the newcomer's event for his first NEWBIE_DAYS days (from the moment he came): one chain of tasks,
 * Баба Зина gives them one by one. A task is done when the player has made its actions that many times since he came
 * (the action log); its reward is claimed, then the next task opens. All of them — the final chest.
 * The rewards lift a newcomer a few levels a day (authority), with roubles, dollars and weapons.
 * (Newcomer tattoos and the dealer's newcomer boxes come later.)
 */
import type { Reward } from "./rewards.ts";

export const NEWBIE_DAYS = 3;
export const NEWBIE_MS = NEWBIE_DAYS * 24 * 3600_000;

export interface NewbieTask {
  id: string;
  /** what to do, short */
  title: string;
  /** Баба Зина's words for it */
  say: string;
  /** the actions that count, and how many */
  types: string[];
  n: number;
  /** where it is done (a link from the task) */
  href: string;
  reward: Reward;
}

const W = (keyboard: number, gpu = 0, rpg = 0) => [
  ...(keyboard ? [{ id: "keyboard", qty: keyboard }] : []),
  ...(gpu ? [{ id: "gpu", qty: gpu }] : []),
  ...(rpg ? [{ id: "rug-pull-gun", qty: rpg }] : []),
];

export const NEWBIE_TASKS: NewbieTask[] = [
  { id: "yard3", title: "Подбери 3 находки во дворе", say: "Во дворе вечно что-то валяется. Кошельки, крышки… Не стесняйся — подбирай, пока дворник не смёл.", types: ["yard_pick"], n: 3, href: "/yard", reward: { xp: 900, currencies: { RUB: 500 } } },
  { id: "task3", title: "Выполни 3 задания в локациях", say: "Работа не волк, но в лес не убежит. Сходи в подъезд, помоги людям — люди запомнят.", types: ["task"], n: 3, href: "/locations", reward: { xp: 1_200, currencies: { RUB: 700 }, items: W(5) } },
  { id: "hit5", title: "Ударь босса 5 раз", say: "Дацкоу опять в холодильнике заперся. Иди врежь ему — пять раз, для профилактики.", types: ["attack"], n: 5, href: "/bosses/datsik", reward: { xp: 1_500, currencies: { USD: 5 }, items: W(5, 2) } },
  { id: "win1", title: "Победи Дацкоу и забери награду", say: "Добей и забери, что положено. Пропуска не выбрасывай — дальше пригодятся, к Кедру.", types: ["fight_claim"], n: 1, href: "/bosses/datsik", reward: { xp: 2_000, currencies: { RUB: 1_000, USD: 5 } } },
  { id: "zonk1", title: "Сыграй партию в зонк", say: "Кости во дворе — дело святое. Я в молодости весь подъезд обыгрывала. Ну, почти весь.", types: ["game_start"], n: 1, href: "/yard", reward: { xp: 1_500, currencies: { RUB: 800 }, items: W(0, 2) } },
  { id: "buy1", title: "Купи что-нибудь в магазине", say: "Деньги должны работать, а не в носке лежать. Хотя в носке надёжнее… Сходи в магазин.", types: ["buy"], n: 1, href: "/shop", reward: { xp: 2_000, currencies: { USD: 8 } } },
  { id: "equip1", title: "Надень вещь", say: "Что ты как оборванец? Оденься по-человечески — дома, в гардеробе.", types: ["equip"], n: 1, href: "/", reward: { xp: 2_500, currencies: { RUB: 1_500 }, items: W(0, 0, 2) } },
  { id: "daily1", title: "Забери бонус за вход", say: "Каждый день заходи — я тебе каждый день что-нибудь припасу. Бонус в меню дома.", types: ["daily_claim"], n: 1, href: "/", reward: { xp: 2_500, currencies: { USD: 10 } } },
  { id: "slots3", title: "Крутани 777 три раза", say: "Автомат во дворе — сосед Петрович на нём квартиру выиграл. Потом проиграл. Но выиграл же!", types: ["slots_spin"], n: 3, href: "/yard", reward: { xp: 3_000, currencies: { RUB: 2_000 }, items: W(10) } },
  { id: "quest2", title: "Сдай 2 задания дня", say: "Задания дня — в меню дома. Делаешь, сдаёшь, получаешь. Как пенсия, только быстрее.", types: ["quest_claim"], n: 2, href: "/", reward: { xp: 3_500, currencies: { USD: 10 }, items: W(0, 4) } },
  { id: "talent1", title: "Вложи талант", say: "Таланты — в личном деле. Вложи хоть один, не жадничай. Я вот в вязание вложилась — и не жалею.", types: ["talent_up", "talent_auto"], n: 1, href: "/profile", reward: { xp: 4_000, currencies: { RUB: 3_000 } } },
  { id: "pump1", title: "Зайди к соседу и прокачай ему бицуху", say: "Соседям помогать надо. Найди кого-нибудь в рейтинге, зайди в гости и качни ему бицуху.", types: ["social_pump"], n: 1, href: "/rating", reward: { xp: 4_000, currencies: { USD: 12 }, items: W(0, 0, 3) } },
  { id: "task15", title: "Выполни ещё 15 заданий", say: "Ну ты разогрелся. Теперь по-взрослому — пятнадцать заданий. Энергию береги, она не бесконечная.", types: ["task"], n: 15, href: "/locations", reward: { xp: 6_000, currencies: { RUB: 5_000 }, items: W(15, 5) } },
  { id: "win5", title: "Победи боссов 5 раз", say: "Пять побед — и про тебя во дворе заговорят. Я лично всем расскажу.", types: ["fight_claim"], n: 5, href: "/bosses", reward: { xp: 8_000, currencies: { USD: 20 }, items: W(0, 6, 3) } },
  { id: "zonk5", title: "Сыграй 5 партий в зонк", say: "Последнее. Пять партий в зонк — и ты наш, дворовый. Насовсем.", types: ["game_start"], n: 5, href: "/yard", reward: { xp: 10_000, currencies: { RUB: 8_000, USD: 20 } } },
];

/** all the tasks done: Баба Зина's chest */
export const NEWBIE_CHEST: Reward = { xp: 15_000, currencies: { RUB: 15_000, USD: 50 }, items: W(30, 15, 10) };

export const newbieTask = (id: string) => NEWBIE_TASKS.find((t) => t.id === id);
