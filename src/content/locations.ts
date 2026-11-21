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
  /** the short name on the list's plank (its tab fits ~11 letters) — the user's list (2026-11-20) */
  short: string;
  subtitle: string;
  /** vector scene id (client/art/scenes) */
  scene: "openspace" | "market" | "serverroom" | "basement" | "board" | "accounting" | "hr" | "party" | "offshore" | "yacht" | "moonbase" | "mars" | "orbit" | "sunfarm" | "genesis";
  tasks: TaskDef[];
  /** «Ночные движухи»: the same road at night — the same steps, its own energy (NIGHT_ENERGY) and pay, «ночной авторитет» (NIGHT_TASKS) */
  night: TaskDef[];
  /** special reward for closing all five tasks, much bigger than a task reward */
  reward: Reward;
}

// Energy per pass (all five tasks, steps × energy) — the user's table (2026-11-20): 166, 278, 364, 519, 675, 779, 969, 1082,
// 1307, 1537, 1676, 1935, 2077, 2377, 2651. Pay: папиросы per energy grow by location; ~10 XP per energy.
// Draft numbers: ~12–16 RUB and ~1 XP per energy point; higher locations pay a bit better per energy.
// Steps: 5–7 per task in the first location, then more in every next one (up to 14 in the last).
const t = (id: string, title: string, flavor: string, energy: number, steps: number, rubPerEnergy: number, done: Reward = {}): TaskDef => ({
  id, title, flavor, energy, steps,
  stepReward: { currencies: { PAP: Math.round(energy * rubPerEnergy) }, xp: energy * 10 },
  doneReward: { xp: energy * steps * 10, ...done },
});

const DAY: Omit<LocationDef, "night">[] = [
  {
    id: "openspace", order: 1, name: "Опенспейс", short: "Опенспейс", subtitle: "Здесь начинается карьера и заканчивается кофе", scene: "openspace",
    tasks: [
      t("os-standup", "Пережить планёрку", "Кивать в нужных местах — тоже навык.", 4, 5, 12),
      t("os-coffee", "Добыть кофе из автомата", "Автомат принимает только монеты 2009 года.", 5, 5, 12),
      t("os-chat", "Прочитать рабочий чат", "312 непрочитанных. 300 из них — стикеры.", 6, 6, 12),
      t("os-printer", "Починить принтер", "Он не сломан. Он просто тебя не любит.", 6, 6, 12, { items: [{ id: "keyboard", qty: 1 }] }),
      t("os-deadline", "Сдать задачу «на вчера»", "Вчера было вчера.", 7, 7, 12, { items: [{ id: "energy-drink", qty: 1 }] }),
    ],
    reward: { currencies: { PAP: 300 }, xp: 1_000, items: [{ id: "keyboard", qty: 5 }, { id: "tee-pump", qty: 1 }] },
  },
  {
    id: "market", order: 2, name: "Крипто-рынок", short: "Рынок", subtitle: "Купи на хаях, продай на лоях", scene: "market",
    tasks: [
      t("mk-enter", "Зайти на рынок", "Главное — не смотреть на график.", 6, 6, 13),
      t("mk-shill", "Послушать шиллера", "Этот токен точно сделает иксы. Наверное.", 6, 6, 13),
      t("mk-chart", "Нарисовать треугольник на графике", "Технический анализ, уровень «бог».", 8, 7, 13),
      t("mk-airdrop", "Поймать аирдроп", "Подключи кошелёк… нет, не этот.", 10, 7, 13, { items: [{ id: "keyboard", qty: 1 }] }),
      t("mk-dip", "Откупить дно", "Дно было ниже.", 10, 8, 13, { items: [{ id: "energy-drink", qty: 2 }] }),
    ],
    reward: { currencies: { PAP: 500 }, xp: 3_000, items: [{ id: "keyboard", qty: 5 }, { id: "shorts-remote", qty: 1 }, { id: "cap-moon", qty: 1 }] },
  },
  {
    id: "serverroom", order: 3, name: "Серверная", short: "Серверная", subtitle: "Тепло, шумно и всё мигает", scene: "serverroom",
    tasks: [
      t("sr-cable", "Найти нужный кабель", "Их 400, и все одинаковые.", 7, 7, 14),
      t("sr-reboot", "Перезагрузить прод в пятницу", "Что может пойти не так?", 8, 7, 14),
      t("sr-logs", "Прочитать логи", "ERROR: everything is fine.", 10, 8, 14),
      t("sr-cool", "Охладить стойку вентилятором", "Вентилятор от бабушки, надёжный.", 10, 8, 14, { items: [{ id: "keyboard", qty: 2 }] }),
      t("sr-backup", "Проверить бэкап", "Бэкап есть. Восстановления нет.", 11, 9, 14, { items: [{ id: "energy-drink", qty: 1 }] }),
    ],
    reward: { currencies: { PAP: 800 }, xp: 8_000, items: [{ id: "gpu", qty: 2 }, { id: "slippers", qty: 1 }, { id: "gold-chain", qty: 1 }] },
  },
  {
    id: "basement", order: 4, name: "Майнинг-подвал", short: "Подвал", subtitle: "Здесь греются видеокарты и надежды", scene: "basement",
    tasks: [
      t("bs-fan", "Остудить ферму вентилятором", "Восемь карт, один вентилятор, никакой надежды.", 8, 8, 15),
      t("bs-pool", "Подключиться к пулу", "Пул тебя тоже не ждал.", 10, 8, 15),
      t("bs-bill", "Спрятать счёт за свет", "Под ковёр. Ковёр уже выдернули.", 12, 9, 15),
      t("bs-rig", "Собрать риг из коробки", "Инструкция на китайском, отвёртка твоя.", 13, 9, 15, { items: [{ id: "gpu", qty: 1 }] }),
      t("bs-halving", "Пережить халвинг", "Награда меньше, а гордость та же.", 15, 10, 15, { items: [{ id: "energy-drink", qty: 1 }] }),
    ],
    reward: { currencies: { PAP: 1200 }, xp: 20_000, items: [{ id: "gpu", qty: 3 }, { id: "hoodie-hodl", qty: 1 }] },
  },
  {
    id: "board", order: 5, name: "Совет директоров", short: "Кабинет", subtitle: "Здесь решают, кому сегодня повезёт", scene: "board",
    tasks: [
      t("bd-slides", "Защитить презентацию", "47 слайдов, ни одного вывода.", 12, 9, 16),
      t("bd-chart", "Показать график вверх ногами", "Если перевернуть — это рост.", 13, 9, 16),
      t("bd-budget", "Выбить бюджет", "Бюджет есть, но не на это.", 13, 10, 16),
      t("bd-kpi", "Согласовать KPI", "KPI: согласовать KPI.", 14, 10, 16, { items: [{ id: "rug-pull-gun", qty: 1 }] }),
      t("bd-vote", "Пережить голосование", "Воздержался — тоже голос.", 15, 12, 16, { items: [{ id: "energy-drink", qty: 2 }] }),
    ],
    reward: { currencies: { PAP: 2000 }, xp: 50_000, items: [{ id: "rug-pull-gun", qty: 3 }, { id: "laser-eyes", qty: 1 }] },
  },
  {
    id: "accounting", order: 6, name: "Бухгалтерия", short: "Бухгалтерия", subtitle: "Деньги любят счёт. Бухгалтерия — тишину", scene: "accounting",
    tasks: [
      t("ac-receipt", "Сдать чеки за такси", "Чек из шаурмы — тоже командировочные.", 14, 10, 17),
      t("ac-advance", "Выпросить аванс", "Аванс будет. Когда-нибудь. Наверное.", 14, 10, 17),
      t("ac-report", "Закрыть квартальный отчёт", "Дебет с кредитом сошлись. Случайно.", 14, 11, 17),
      t("ac-crypto", "Объяснить, что такое крипта", "«А где у биткоина печать?»", 15, 11, 17, { items: [{ id: "gpu", qty: 1 }] }),
      t("ac-salary", "Найти ошибку в зарплате", "Ошибка в твою пользу. Уже исправили.", 15, 12, 17, { items: [{ id: "energy-drink", qty: 2 }] }),
    ],
    reward: { currencies: { PAP: 3000 }, xp: 100_000, items: [{ id: "gpu", qty: 4 }, { id: "lost-wallet", qty: 3 }] },
  },
  {
    id: "hr", order: 7, name: "Отдел кадров", short: "Кадры", subtitle: "Мы не команда, мы семья. Но уволить можем", scene: "hr",
    tasks: [
      t("hr-form", "Заполнить анкету на 12 страниц", "Хобби: работа. Мечта: выходной.", 16, 11, 18),
      t("hr-vacation", "Согласовать отпуск", "Есть свободная неделя. В феврале 2031-го.", 16, 11, 18),
      t("hr-teambuild", "Выжить на тимбилдинге", "Верёвочный парк. Верёвки уже на исходе.", 16, 12, 18),
      t("hr-review", "Пройти performance review", "Сильные стороны: приходишь. Зоны роста: всё остальное.", 17, 12, 18, { items: [{ id: "rug-pull-gun", qty: 1 }] }),
      t("hr-raise", "Попросить повышение", "«Давай вернёмся к этому через полгода».", 17, 13, 18, { items: [{ id: "energy-drink", qty: 2 }] }),
    ],
    reward: { currencies: { PAP: 4500 }, xp: 200_000, items: [{ id: "rug-pull-gun", qty: 4 }, { id: "energy-drink", qty: 3 }] },
  },
  {
    id: "party", order: 8, name: "Новогодний корпоратив", short: "Корпоратив", subtitle: "Оливье, тосты и фото, которые не удалить", scene: "party",
    tasks: [
      t("pt-oliv", "Добраться до оливье", "Тазик один, а желающих — весь отдел.", 14, 12, 19),
      t("pt-toast", "Сказать тост за руководство", "Главное — не перепутать имена.", 16, 12, 19),
      t("pt-karaoke", "Спеть в караоке", "Микрофон держится, голос — нет.", 17, 13, 19),
      t("pt-santa", "Отыграть Деда Мороза", "Борода чешется, мешок тяжёлый, подарки — стикеры.", 17, 13, 19, { items: [{ id: "rug-pull-gun", qty: 1 }] }),
      t("pt-photos", "Удалить фото из общего чата", "Поздно. Уже сохранили 46 человек.", 20, 14, 19, { items: [{ id: "energy-drink", qty: 3 }] }),
    ],
    reward: { currencies: { PAP: 6500 }, xp: 400_000, items: [{ id: "rug-pull-gun", qty: 5 }, { id: "santa-hat", qty: 1 }] },
  },
  {
    id: "offshore", order: 9, name: "Офшор", short: "Офшор", subtitle: "Деньги любят тишину, пальмы и ноль налогов", scene: "offshore",
    tasks: [
      t("of-account", "Открыть счёт на Кайманах", "Банкир спросил только размер обуви.", 16, 14, 20),
      t("of-shell", "Зарегистрировать фирму-пустышку", "ООО «Рога и Токены», директор — кот.", 17, 14, 20),
      t("of-wire", "Перевести деньги через три страны", "Комиссия — как билет на Луну.", 17, 15, 20),
      t("of-vault", "Спрятать слитки в ячейку", "Ключ — в кокосе. Кокос — на пальме.", 18, 15, 20, { items: [{ id: "rug-pull-gun", qty: 1 }] }),
      t("of-audit", "Пережить проверку", "«Это всё пожертвования на мемы».", 20, 16, 20, { items: [{ id: "energy-drink", qty: 3 }] }),
    ],
    reward: { currencies: { PAP: 8500 }, xp: 700_000, items: [{ id: "rug-pull-gun", qty: 6 }, { id: "energy-drink", qty: 4 }] },
  },
  {
    id: "yacht", order: 10, name: "Яхта кита", short: "Яхта кита", subtitle: "Киты не тонут — они плавают", scene: "yacht",
    tasks: [
      t("yt-board", "Попасть на борт", "Дресс-код: холодный кошелёк.", 18, 15, 21),
      t("yt-deck", "Надраить палубу", "Тик — не дерево, тик — это график.", 18, 15, 21),
      t("yt-whale", "Подружиться с китом", "Он двигает рынок одним чихом.", 20, 16, 21),
      t("yt-storm", "Пережить шторм на бирже", "Качает так, что сливаются даже чайки.", 20, 16, 21, { items: [{ id: "rug-pull-gun", qty: 1 }] }),
      t("yt-captain", "Встать за штурвал", "Курс — на хаи, полный вперёд.", 21, 17, 21, { items: [{ id: "energy-drink", qty: 3 }] }),
    ],
    reward: { currencies: { PAP: 11000 }, xp: 1_200_000, items: [{ id: "rug-pull-gun", qty: 7 }, { id: "energy-drink", qty: 5 }] },
  },
  {
    id: "moonbase", order: 11, name: "Лунная база", short: "Лунобаза", subtitle: "To the moon. Буквально", scene: "moonbase",
    tasks: [
      t("mn-launch", "Пережить запуск", "Обратный отсчёт: 3… 2… памп!", 15, 16, 22),
      t("mn-dock", "Пристыковаться к базе", "Стыковочный узел заело. Как и ордер.", 17, 16, 22),
      t("mn-rig", "Поставить риг на Луне", "Охлаждение бесплатное: минус 170.", 20, 17, 22),
      t("mn-flag", "Воткнуть флаг HODL", "Ветра нет — флаг стоит, как холдер.", 22, 17, 22, { items: [{ id: "rug-pull-gun", qty: 1 }] }),
      t("mn-earth", "Помахать Земле", "Оттуда все медведи — с горошину.", 25, 18, 22, { items: [{ id: "energy-drink", qty: 4 }] }),
    ],
    reward: { currencies: { PAP: 15000 }, xp: 2_000_000, items: [{ id: "rug-pull-gun", qty: 8 }, { id: "energy-drink", qty: 6 }] },
  },
  {
    id: "mars", order: 12, name: "Марсианская биржа", short: "Марсобиржа", subtitle: "Красная планета, зелёные свечи", scene: "mars",
    tasks: [
      t("ms-land", "Сесть в кратер", "Посадка мягкая. Депозит — нет.", 16, 17, 23),
      t("ms-dust", "Пережить пылевую бурю", "Графики не видно. И слава богу.", 20, 17, 23),
      t("ms-rover", "Угнать марсоход", "Едет 4 км/ч, зато в одну сторону — вверх.", 22, 18, 23),
      t("ms-colony", "Продать колонистам токены", "Им всё равно больше нечего покупать.", 23, 18, 23, { items: [{ id: "rug-pull-gun", qty: 1 }] }),
      t("ms-elon", "Найти, чей это ракетный завод", "Табличка на двери: «Не шортить».", 27, 19, 23, { items: [{ id: "energy-drink", qty: 4 }] }),
    ],
    reward: { currencies: { PAP: 19000 }, xp: 3_000_000, items: [{ id: "rug-pull-gun", qty: 9 }, { id: "energy-drink", qty: 7 }] },
  },
  {
    id: "orbit", order: 13, name: "Казино на орбите", short: "Казино", subtitle: "Ставки сделаны. Гравитации нет", scene: "orbit",
    tasks: [
      t("or-dock", "Пройти фейс-контроль в скафандре", "Дресс-код: шлем от Gucci.", 18, 18, 24),
      t("or-roulette", "Сыграть в невесомую рулетку", "Шарик улетел. Ставка — тоже.", 21, 18, 24),
      t("or-chips", "Поймать фишки в воздухе", "Половина уже на орбите Земли.", 22, 19, 24),
      t("or-dealer", "Перехитрить дилера-робота", "Он считает карты. И тебя.", 23, 19, 24, { items: [{ id: "rug-pull-gun", qty: 1 }] }),
      t("or-allin", "Пойти ва-банк над Землёй", "Внизу 8 миллиардов свидетелей.", 26, 20, 24, { items: [{ id: "energy-drink", qty: 4 }] }),
    ],
    reward: { currencies: { PAP: 24000 }, xp: 4_500_000, items: [{ id: "rug-pull-gun", qty: 10 }, { id: "energy-drink", qty: 8 }] },
  },
  {
    id: "sunfarm", order: 14, name: "Солнечная ферма", short: "Пекло", subtitle: "Майнинг на энергии звезды. Жарковато", scene: "sunfarm",
    tasks: [
      t("sf-shield", "Опустить теплозащиту", "Плюс 5000 за бортом. Кондиционер сдался.", 18, 19, 25),
      t("sf-panels", "Протереть солнечные панели", "Тряпка сгорела на втором метре.", 21, 19, 25),
      t("sf-rigs", "Запустить риги на полную", "Видеокарты греются. Звезда — тоже.", 23, 20, 25),
      t("sf-flare", "Пережить вспышку на Солнце", "Пробой шины. И депо.", 26, 21, 25, { items: [{ id: "rug-pull-gun", qty: 1 }] }),
      t("sf-cool", "Охладить ферму жидким азотом", "Пар до самого Меркурия.", 30, 21, 25, { items: [{ id: "energy-drink", qty: 5 }] }),
    ],
    reward: { currencies: { PAP: 30000 }, xp: 6_500_000, items: [{ id: "rug-pull-gun", qty: 11 }, { id: "energy-drink", qty: 9 }] },
  },
  {
    id: "genesis", order: 15, name: "Генезис-блок", short: "Генезис", subtitle: "Здесь всё началось. Здесь всё и закончится", scene: "genesis",
    tasks: [
      t("gn-gate", "Найти вход в первый блок", "Пароль — хэш нулевого дня.", 21, 20, 26),
      t("gn-chain", "Пройти по цепочке блоков", "Каждый шаг подтверждают шесть раз.", 24, 20, 26),
      t("gn-nonce", "Подобрать нонс", "Где-то между нулём и бесконечностью.", 26, 21, 26),
      t("gn-satoshi", "Найти записку Сатоши", "«Chancellor on brink…» — дальше не разобрать.", 27, 21, 26, { items: [{ id: "rug-pull-gun", qty: 1 }] }),
      t("gn-block", "Забрать награду за блок", "50 монет. Самых первых.", 29, 22, 26, { items: [{ id: "energy-drink", qty: 5 }] }),
    ],
    reward: { currencies: { PAP: 38000 }, xp: 9_000_000, items: [{ id: "rug-pull-gun", qty: 12 }, { id: "energy-drink", qty: 10 }] },
  },
];

/* «Ночные движухи»: every location's night tasks, one for each day task (same steps; energy — NIGHT_ENERGY) */
const NIGHT_TASKS: Record<string, [string, string][]> = {
  openspace: [
    ["Остаться после работы", "Охранник уже косо смотрит."], ["Доесть торт из холодильника", "Чей он — уже не важно."],
    ["Поиграть на рабочем компе", "Админ спит. Наверное."], ["Прокатиться на кресле по коридору", "Рекорд офиса — 14 метров."],
    ["Уснуть под столом", "Будильник — уборщица в 6:00."],
  ],
  market: [
    ["Ловить памп в 3 ночи", "Азия проснулась, ты — нет."], ["Сидеть в спейсе до утра", "Ведущий обещал альфу через час."],
    ["Шортить на эмоциях", "Ликвидация — тоже опыт."], ["Заминтить мем-токен", "Тикер $SLEEP, сапплай — бесконечность."],
    ["Пережить ночной дамп", "Свечи красные, глаза тоже."],
  ],
  serverroom: [
    ["Дежурить в ночную смену", "Алерты приходят только ночью."], ["Откатить релиз в 2:00", "git revert — лучший друг."],
    ["Слушать гудение стоек", "Белый шум и немного паники."], ["Найти, кто положил прод", "Ты. Это был ты."],
    ["Поспать на сервере", "Тепло, мягко, 40 градусов."],
  ],
  basement: [
    ["Разогнать карты ночью", "Ночью свет дешевле. Немного."], ["Потушить искры", "Огнетушитель просрочен с 2016-го."],
    ["Спрятать ферму от соседей", "Это не гул. Это холодильник."], ["Майнить на калькуляторе", "Хешрейт: 0,0001. Гордость: 100%."],
    ["Встретить рассвет у рига", "Солнце встаёт, курс — нет."],
  ],
  board: [
    ["Подслушать закрытое совещание", "Кофемашина всё слышит."], ["Переделать отчёт до утра", "Все цифры зелёные. Как ты."],
    ["Спрятать провальный квартал", "Папка «Разное/Важное/Не открывать»."], ["Посидеть в кресле директора", "Кожа, массаж и чувство власти."],
    ["Подписать себе премию", "Подпись директора тренировал год."],
  ],
  accounting: [
    ["Свести баланс к полуночи", "Не сходится на 3 рубля. Ищешь до утра."], ["Отправить черновики в шредер", "Шредер работает на пределе."],
    ["Пересчитать кассу при свечах", "Свет отключили за неуплату."], ["Спрятать чек из бара", "Представительские расходы, однозначно."],
    ["Задобрить налоговую печеньем", "Печенье приняли. Проверку — тоже."],
  ],
  hr: [
    ["Почитать личные дела коллег", "У Петрова три выговора и кот."], ["Случайно уволить себя", "Галочка не там. Отменять до утра."],
    ["Подделать пропуск", "Фото с паспорта подойдёт."], ["Устроить тайный опрос", "Анонимный. Почти."],
    ["Распечатать всем грамоты", "Лучший сотрудник месяца — принтер."],
  ],
  party: [
    ["Остаться на афтепати", "Музыку выключили, а ты нет."], ["Найти свою куртку", "Их сорок, и все чёрные."],
    ["Доесть мандарины", "Шкурки — в цветок директора."], ["Вызвать такси за счёт фирмы", "Тариф «Бизнес», конечно."],
    ["Сфоткаться с ёлкой", "Ёлка уже не стоит. Ты тоже."],
  ],
  offshore: [
    ["Купаться ночью у банка", "Охрана думает, что ты дельфин."], ["Пересчитать кэш при луне", "Сбился на третьем миллионе."],
    ["Закопать капсулу на пляже", "Карта — на салфетке из бара."], ["Уйти от катера налоговой", "Надувной фламинго развивает 40 узлов."],
    ["Встретить рассвет под пальмой", "Кокос упал. Курс — нет."],
  ],
  yacht: [
    ["Устроить вечеринку на палубе", "Соседняя яхта вызвала береговую охрану."], ["Порыбачить на монеты", "Клюёт только на мемы."],
    ["Искупаться в джакузи", "Пузыри — как в 2021-м."], ["Спрятаться от папарацци", "Дрон снимает. Улыбайся."],
    ["Уснуть в шлюпке", "Проснулся у чужого острова."],
  ],
  moonbase: [
    ["Дежурить у купола", "Метеорит — тоже волатильность."], ["Майнить в лунную ночь", "Ночь длится две недели. Удобно."],
    ["Поймать сигнал с Земли", "Сигнал один: «покупай»."], ["Прогуляться по кратерам", "Следы останутся навсегда. Как и убытки."],
    ["Смотреть, как всходит Земля", "Красиво. Особенно зелёная."],
  ],
  mars: [
    ["Смотреть на два спутника", "Фобос и Деймос — как лонг и шорт."], ["Торговать при свете базы", "Биржа не спит. Марсиане — тоже."],
    ["Слушать марсианский ветер", "Шепчет: «продавай»."], ["Копать лёд под базой", "Нашёл чей-то холодный кошелёк."],
    ["Отправить сигнал на Землю", "Ответ придёт через 20 минут. Рынок — уже нет."],
  ],
  orbit: [
    ["Играть в покер до рассвета", "Рассвет тут каждые 90 минут."], ["Пить коктейль из шарика", "Оливка улетела в вентиляцию."],
    ["Обчистить игровой автомат", "777 — в невесомости это 4 семёрки."], ["Уйти от охраны по потолку", "Пол и потолок тут договорные."],
    ["Сорвать джекпот над ночной Землёй", "Внизу огни городов. Вверху — твой баланс."],
  ],
  sunfarm: [
    ["Дежурить на теневой стороне", "Тень — единственная валюта, что не горит."], ["Майнить при свете короны", "Ночи нет. Есть смена."],
    ["Чинить риг в темноте", "Подсветка — от раскалённой карты."], ["Ловить солнечный ветер", "Паруса порвались, профит — тоже."],
    ["Смотреть, как гаснут панели", "Красиво. Жарко. Дорого."],
  ],
  genesis: [
    ["Слушать, как стучит цепочка", "Тик-так. Блок за блоком."], ["Пройти по тёмным блокам", "Подсветка — только у подтверждённых."],
    ["Найти потерянные ключи", "10 000 биткоинов за пиццу. Пиццы нет."], ["Сторожить генезис до утра", "Утро наступит в следующем блоке."],
    ["Загадать желание у первого блока", "Желание одно: «to the moon». Ты уже был там."],
  ],
};
/**
 * Night energy per step of every task (the steps are the day's): one night pass costs the user's night table (2026-11-20):
 * 223, 356, 470, 635, 848, 986, 1211, 1362, 1660, 1944, 2133, 2434, 2639, 3006, 3346. The pay follows the energy.
 */
const NIGHT_ENERGY: Record<string, number[]> = {
  openspace: [7, 7, 7, 8, 9],
  market: [7, 7, 11, 13, 13],
  serverroom: [8, 10, 12, 13, 16],
  basement: [10, 12, 15, 16, 18],
  board: [14, 16, 17, 18, 19],
  accounting: [17, 17, 19, 19, 19],
  hr: [18, 19, 20, 21, 24],
  party: [19, 21, 21, 21, 24],
  offshore: [22, 22, 22, 22, 24],
  yacht: [19, 20, 26, 26, 31],
  moonbase: [19, 22, 25, 28, 32],
  mars: [21, 26, 27, 29, 33],
  orbit: [24, 28, 28, 29, 31],
  sunfarm: [21, 26, 29, 33, 40],
  genesis: [24, 30, 32, 34, 40],
};
export const LOCATIONS: LocationDef[] = DAY.map((l) => ({
  ...l,
  night: l.tasks.map((t, i) => {
    const e = NIGHT_ENERGY[l.id]?.[i] ?? t.energy;
    const k = e / t.energy;
    return {
      ...t, id: `n-${t.id}`, energy: e,
      title: NIGHT_TASKS[l.id]?.[i]?.[0] ?? `${t.title} ночью`, flavor: NIGHT_TASKS[l.id]?.[i]?.[1] ?? t.flavor,
      // the pay grows with the energy: папиросы and XP of a step and of the finish
      stepReward: { ...t.stepReward, currencies: { PAP: Math.round((t.stepReward.currencies?.PAP ?? 0) * k) }, xp: e * 10 },
      doneReward: { ...t.doneReward, xp: e * t.steps * 10 },
    };
  }),
}));

export const locationById = (id: string) => LOCATIONS.find((l) => l.id === id);
export type LocMode = "day" | "night";
export const tasksOf = (l: LocationDef, mode: LocMode) => (mode === "night" ? l.night : l.tasks);

/**
 * Авторитет локации: every task step also adds a third of its authority (rounded) to the player's authority in that
 * location. It only piles up there — it is not spent and not added to the player's own authority. The one with the most
 * in a location is shown on its card.
 */
export const LOC_REP_DIV = 3;
export const locRep = (xp: number) => Math.round(xp / LOC_REP_DIV);

/**
 * Tasks of a location open one by one: the first is open, the next one opens when all before it are done. A task the
 * player has already started (progress from before this rule) stays open.
 */
export function taskOpen(loc: LocationDef, index: number, stepsOf: (taskId: string) => number, mode: LocMode = "day"): boolean {
  const list = tasksOf(loc, mode);
  if (index <= 0 || stepsOf(list[index].id) > 0) return true;
  return list.slice(0, index).every((t) => stepsOf(t.id) >= t.steps);
}
export const taskById = (id: string) => {
  for (const l of LOCATIONS) {
    const t = l.tasks.find((x) => x.id === id);
    if (t) return { loc: l, task: t, mode: "day" as LocMode };
    const n = l.night.find((x) => x.id === id);
    if (n) return { loc: l, task: n, mode: "night" as LocMode };
  }
  return undefined;
};
