import type { Reward } from "./rewards.ts";

export interface TaskDef {
  id: string;
  title: string;
  flavor: string;
  /** energy per step */
  energy: number;
  /** how many steps to finish the task */
  steps: number;
  /** reward for every step */
  stepReward: Reward;
  /** extra reward for finishing the task */
  doneReward: Reward;
}
export interface LocationDef {
  id: string;
  order: number;
  name: string;
  subtitle: string;
  /** vector scene id (client/art/scenes) */
  scene: "openspace" | "market" | "serverroom" | "basement" | "board";
  tasks: TaskDef[];
  /** special reward for closing all five tasks, much bigger than a task reward */
  reward: Reward;
}

// Draft numbers: ~12–16 RUB and ~1 XP per energy point; higher locations pay a bit better per energy.
const t = (id: string, title: string, flavor: string, energy: number, steps: number, rubPerEnergy: number, done: Reward = {}): TaskDef => ({
  id, title, flavor, energy, steps,
  stepReward: { currencies: { RUB: Math.round(energy * rubPerEnergy) }, xp: energy },
  doneReward: { xp: energy * steps, ...done },
});

export const LOCATIONS: LocationDef[] = [
  {
    id: "openspace", order: 1, name: "Опенспейс", subtitle: "Здесь начинается карьера и заканчивается кофе", scene: "openspace",
    tasks: [
      t("os-standup", "Пережить планёрку", "Кивать в нужных местах — тоже навык.", 3, 2, 12),
      t("os-coffee", "Добыть кофе из автомата", "Автомат принимает только монеты 2009 года.", 3, 3, 12),
      t("os-chat", "Прочитать рабочий чат", "312 непрочитанных. 300 из них — стикеры.", 4, 2, 12),
      t("os-printer", "Починить принтер", "Он не сломан. Он просто тебя не любит.", 4, 3, 12, { items: [{ id: "red-candle", qty: 2 }] }),
      t("os-deadline", "Сдать задачу «на вчера»", "Вчера было вчера.", 5, 3, 12, { items: [{ id: "energy-drink", qty: 1 }] }),
    ],
    reward: { currencies: { USD: 5, RUB: 300 }, xp: 120, items: [{ id: "red-candle", qty: 10 }, { id: "tee-pump", qty: 1 }] },
  },
  {
    id: "market", order: 2, name: "Крипто-рынок", subtitle: "Купи на хаях, продай на лоях", scene: "market",
    tasks: [
      t("mk-enter", "Зайти на рынок", "Главное — не смотреть на график.", 5, 3, 13),
      t("mk-shill", "Послушать шиллера", "Этот токен точно сделает иксы. Наверное.", 5, 3, 13),
      t("mk-chart", "Нарисовать треугольник на графике", "Технический анализ, уровень «бог».", 6, 3, 13),
      t("mk-airdrop", "Поймать аирдроп", "Подключи кошелёк… нет, не этот.", 7, 2, 13, { items: [{ id: "keyboard", qty: 1 }] }),
      t("mk-dip", "Откупить дно", "Дно было ниже.", 8, 3, 13, { items: [{ id: "energy-drink", qty: 2 }] }),
    ],
    reward: { currencies: { USD: 8, RUB: 500 }, xp: 220, items: [{ id: "keyboard", qty: 5 }, { id: "shorts-remote", qty: 1 }, { id: "cap-moon", qty: 1 }] },
  },
  {
    id: "serverroom", order: 3, name: "Серверная", subtitle: "Тепло, шумно и всё мигает", scene: "serverroom",
    tasks: [
      t("sr-cable", "Найти нужный кабель", "Их 400, и все одинаковые.", 8, 3, 14),
      t("sr-reboot", "Перезагрузить прод в пятницу", "Что может пойти не так?", 9, 3, 14),
      t("sr-logs", "Прочитать логи", "ERROR: everything is fine.", 10, 2, 14),
      t("sr-cool", "Охладить стойку вентилятором", "Вентилятор от бабушки, надёжный.", 11, 3, 14, { items: [{ id: "keyboard", qty: 2 }] }),
      t("sr-backup", "Проверить бэкап", "Бэкап есть. Восстановления нет.", 12, 3, 14, { items: [{ id: "energy-pack", qty: 1 }] }),
    ],
    reward: { currencies: { USD: 12, RUB: 800 }, xp: 380, items: [{ id: "gpu", qty: 2 }, { id: "slippers", qty: 1 }, { id: "gold-chain", qty: 1 }] },
  },
  {
    id: "basement", order: 4, name: "Майнинг-подвал", subtitle: "Здесь греются видеокарты и надежды", scene: "basement",
    tasks: [
      t("bs-fan", "Остудить ферму вентилятором", "Восемь карт, один вентилятор, никакой надежды.", 12, 3, 15),
      t("bs-pool", "Подключиться к пулу", "Пул тебя тоже не ждал.", 13, 3, 15),
      t("bs-bill", "Спрятать счёт за свет", "Под ковёр. Ковёр уже выдернули.", 14, 2, 15),
      t("bs-rig", "Собрать риг из коробки", "Инструкция на китайском, отвёртка твоя.", 15, 3, 15, { items: [{ id: "gpu", qty: 1 }] }),
      t("bs-halving", "Пережить халвинг", "Награда меньше, а гордость та же.", 16, 3, 15, { items: [{ id: "energy-pack", qty: 1 }] }),
    ],
    reward: { currencies: { USD: 18, RUB: 1200 }, xp: 600, items: [{ id: "gpu", qty: 3 }, { id: "hoodie-hodl", qty: 1 }] },
  },
  {
    id: "board", order: 5, name: "Совет директоров", subtitle: "Последний кабинет перед Солнцем", scene: "board",
    tasks: [
      t("bd-slides", "Защитить презентацию", "47 слайдов, ни одного вывода.", 16, 3, 16),
      t("bd-chart", "Показать график вверх ногами", "Если перевернуть — это рост.", 17, 3, 16),
      t("bd-budget", "Выбить бюджет", "Бюджет есть, но не на это.", 18, 2, 16),
      t("bd-kpi", "Согласовать KPI", "KPI: согласовать KPI.", 19, 3, 16, { items: [{ id: "rug-pull-gun", qty: 1 }] }),
      t("bd-vote", "Пережить голосование", "Воздержался — тоже голос.", 20, 3, 16, { items: [{ id: "energy-pack", qty: 2 }] }),
    ],
    reward: { currencies: { USD: 25, RUB: 2000 }, xp: 900, items: [{ id: "rug-pull-gun", qty: 3 }, { id: "laser-eyes", qty: 1 }] },
  },
];

export const locationById = (id: string) => LOCATIONS.find((l) => l.id === id);
export const taskById = (id: string) => {
  for (const l of LOCATIONS) {
    const t = l.tasks.find((x) => x.id === id);
    if (t) return { loc: l, task: t };
  }
  return undefined;
};
