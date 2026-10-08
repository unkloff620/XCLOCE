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
  scene: "openspace" | "market" | "serverroom" | "basement" | "board" | "accounting" | "hr" | "party";
  tasks: TaskDef[];
  /** special reward for closing all five tasks, much bigger than a task reward */
  reward: Reward;
}

// Draft numbers: ~12–16 RUB and ~1 XP per energy point; higher locations pay a bit better per energy.
// Steps: 5–7 per task in the first location, then more in every next one (up to 14 in the last).
const t = (id: string, title: string, flavor: string, energy: number, steps: number, rubPerEnergy: number, done: Reward = {}): TaskDef => ({
  id, title, flavor, energy, steps,
  stepReward: { currencies: { RUB: Math.round(energy * rubPerEnergy) }, xp: energy * 10 },
  doneReward: { xp: energy * steps * 10, ...done },
});

export const LOCATIONS: LocationDef[] = [
  {
    id: "openspace", order: 1, name: "Опенспейс", subtitle: "Здесь начинается карьера и заканчивается кофе", scene: "openspace",
    tasks: [
      t("os-standup", "Пережить планёрку", "Кивать в нужных местах — тоже навык.", 3, 5, 12),
      t("os-coffee", "Добыть кофе из автомата", "Автомат принимает только монеты 2009 года.", 3, 5, 12),
      t("os-chat", "Прочитать рабочий чат", "312 непрочитанных. 300 из них — стикеры.", 4, 6, 12),
      t("os-printer", "Починить принтер", "Он не сломан. Он просто тебя не любит.", 4, 6, 12, { items: [{ id: "keyboard", qty: 1 }] }),
      t("os-deadline", "Сдать задачу «на вчера»", "Вчера было вчера.", 5, 7, 12, { items: [{ id: "energy-drink", qty: 1 }] }),
    ],
    reward: { currencies: { USD: 5, RUB: 300 }, xp: 1_000, items: [{ id: "keyboard", qty: 5 }, { id: "tee-pump", qty: 1 }] },
  },
  {
    id: "market", order: 2, name: "Крипто-рынок", subtitle: "Купи на хаях, продай на лоях", scene: "market",
    tasks: [
      t("mk-enter", "Зайти на рынок", "Главное — не смотреть на график.", 5, 6, 13),
      t("mk-shill", "Послушать шиллера", "Этот токен точно сделает иксы. Наверное.", 5, 6, 13),
      t("mk-chart", "Нарисовать треугольник на графике", "Технический анализ, уровень «бог».", 6, 7, 13),
      t("mk-airdrop", "Поймать аирдроп", "Подключи кошелёк… нет, не этот.", 7, 7, 13, { items: [{ id: "keyboard", qty: 1 }] }),
      t("mk-dip", "Откупить дно", "Дно было ниже.", 8, 8, 13, { items: [{ id: "energy-drink", qty: 2 }] }),
    ],
    reward: { currencies: { USD: 8, RUB: 500 }, xp: 3_000, items: [{ id: "keyboard", qty: 5 }, { id: "shorts-remote", qty: 1 }, { id: "cap-moon", qty: 1 }] },
  },
  {
    id: "serverroom", order: 3, name: "Серверная", subtitle: "Тепло, шумно и всё мигает", scene: "serverroom",
    tasks: [
      t("sr-cable", "Найти нужный кабель", "Их 400, и все одинаковые.", 8, 7, 14),
      t("sr-reboot", "Перезагрузить прод в пятницу", "Что может пойти не так?", 9, 7, 14),
      t("sr-logs", "Прочитать логи", "ERROR: everything is fine.", 10, 8, 14),
      t("sr-cool", "Охладить стойку вентилятором", "Вентилятор от бабушки, надёжный.", 11, 8, 14, { items: [{ id: "keyboard", qty: 2 }] }),
      t("sr-backup", "Проверить бэкап", "Бэкап есть. Восстановления нет.", 12, 9, 14, { items: [{ id: "energy-pack", qty: 1 }] }),
    ],
    reward: { currencies: { USD: 12, RUB: 800 }, xp: 8_000, items: [{ id: "gpu", qty: 2 }, { id: "slippers", qty: 1 }, { id: "gold-chain", qty: 1 }] },
  },
  {
    id: "basement", order: 4, name: "Майнинг-подвал", subtitle: "Здесь греются видеокарты и надежды", scene: "basement",
    tasks: [
      t("bs-fan", "Остудить ферму вентилятором", "Восемь карт, один вентилятор, никакой надежды.", 12, 8, 15),
      t("bs-pool", "Подключиться к пулу", "Пул тебя тоже не ждал.", 13, 8, 15),
      t("bs-bill", "Спрятать счёт за свет", "Под ковёр. Ковёр уже выдернули.", 14, 9, 15),
      t("bs-rig", "Собрать риг из коробки", "Инструкция на китайском, отвёртка твоя.", 15, 9, 15, { items: [{ id: "gpu", qty: 1 }] }),
      t("bs-halving", "Пережить халвинг", "Награда меньше, а гордость та же.", 16, 10, 15, { items: [{ id: "energy-pack", qty: 1 }] }),
    ],
    reward: { currencies: { USD: 18, RUB: 1200 }, xp: 20_000, items: [{ id: "gpu", qty: 3 }, { id: "hoodie-hodl", qty: 1 }] },
  },
  {
    id: "board", order: 5, name: "Совет директоров", subtitle: "Здесь решают, кому сегодня повезёт", scene: "board",
    tasks: [
      t("bd-slides", "Защитить презентацию", "47 слайдов, ни одного вывода.", 16, 9, 16),
      t("bd-chart", "Показать график вверх ногами", "Если перевернуть — это рост.", 17, 9, 16),
      t("bd-budget", "Выбить бюджет", "Бюджет есть, но не на это.", 18, 10, 16),
      t("bd-kpi", "Согласовать KPI", "KPI: согласовать KPI.", 19, 10, 16, { items: [{ id: "rug-pull-gun", qty: 1 }] }),
      t("bd-vote", "Пережить голосование", "Воздержался — тоже голос.", 20, 12, 16, { items: [{ id: "energy-pack", qty: 2 }] }),
    ],
    reward: { currencies: { USD: 25, RUB: 2000 }, xp: 50_000, items: [{ id: "rug-pull-gun", qty: 3 }, { id: "laser-eyes", qty: 1 }] },
  },
  {
    id: "accounting", order: 6, name: "Бухгалтерия", subtitle: "Деньги любят счёт. Бухгалтерия — тишину", scene: "accounting",
    tasks: [
      t("ac-receipt", "Сдать чеки за такси", "Чек из шаурмы — тоже командировочные.", 20, 10, 17),
      t("ac-advance", "Выпросить аванс", "Аванс будет. Когда-нибудь. Наверное.", 21, 10, 17),
      t("ac-report", "Закрыть квартальный отчёт", "Дебет с кредитом сошлись. Случайно.", 22, 11, 17),
      t("ac-crypto", "Объяснить, что такое крипта", "«А где у биткоина печать?»", 23, 11, 17, { items: [{ id: "gpu", qty: 1 }] }),
      t("ac-salary", "Найти ошибку в зарплате", "Ошибка в твою пользу. Уже исправили.", 24, 12, 17, { items: [{ id: "energy-pack", qty: 2 }] }),
    ],
    reward: { currencies: { USD: 35, RUB: 3000 }, xp: 100_000, items: [{ id: "gpu", qty: 4 }, { id: "lost-wallet", qty: 3 }] },
  },
  {
    id: "hr", order: 7, name: "Отдел кадров", subtitle: "Мы не команда, мы семья. Но уволить можем", scene: "hr",
    tasks: [
      t("hr-form", "Заполнить анкету на 12 страниц", "Хобби: работа. Мечта: выходной.", 24, 11, 18),
      t("hr-vacation", "Согласовать отпуск", "Есть свободная неделя. В феврале 2031-го.", 25, 11, 18),
      t("hr-teambuild", "Выжить на тимбилдинге", "Верёвочный парк. Верёвки уже на исходе.", 26, 12, 18),
      t("hr-review", "Пройти performance review", "Сильные стороны: приходишь. Зоны роста: всё остальное.", 27, 12, 18, { items: [{ id: "rug-pull-gun", qty: 1 }] }),
      t("hr-raise", "Попросить повышение", "«Давай вернёмся к этому через полгода».", 28, 13, 18, { items: [{ id: "energy-pack", qty: 2 }] }),
    ],
    reward: { currencies: { USD: 50, RUB: 4500 }, xp: 200_000, items: [{ id: "rug-pull-gun", qty: 4 }, { id: "energy-pack", qty: 3 }] },
  },
  {
    id: "party", order: 8, name: "Новогодний корпоратив", subtitle: "Последний рубеж перед Солнцем", scene: "party",
    tasks: [
      t("pt-oliv", "Добраться до оливье", "Тазик один, а желающих — весь отдел.", 28, 12, 19),
      t("pt-toast", "Сказать тост за руководство", "Главное — не перепутать имена.", 29, 12, 19),
      t("pt-karaoke", "Спеть в караоке", "Микрофон держится, голос — нет.", 30, 13, 19),
      t("pt-santa", "Отыграть Деда Мороза", "Борода чешется, мешок тяжёлый, подарки — стикеры.", 31, 13, 19, { items: [{ id: "rug-pull-gun", qty: 1 }] }),
      t("pt-photos", "Удалить фото из общего чата", "Поздно. Уже сохранили 46 человек.", 32, 14, 19, { items: [{ id: "energy-pack", qty: 3 }] }),
    ],
    reward: { currencies: { USD: 70, RUB: 6500 }, xp: 400_000, items: [{ id: "rug-pull-gun", qty: 5 }, { id: "santa-hat", qty: 1 }] },
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
