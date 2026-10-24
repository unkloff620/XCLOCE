/** Funny lines instead of "you dealt 100 damage". The server picks one per hit and stores its index. */
export const HIT_PHRASES: Record<string, string[]> = {
  fist: ["Двоечка по лицу.", "Бинты не помогли боссу.", "Костяшки помнят.", "Рука отдохнёт час и снова в бой."],
  mouse: ["Двойной клик по лицу.", "Провод не выдержал.", "Курсор попал куда надо.", "Скотч не удержал."],
  "red-candle": ["Рынок сказал нет.", "Кто-то продал на хаях.", "Капа упала, босс тоже.", "Минус 50 MC."],
  keyboard: ["Клава пережила не всё.", "Ctrl+Z не поможет.", "Клавиша Escape улетела первой.", "Синие свичи — громкий аргумент."],
  gpu: ["Видеокарту всё равно пора было менять.", "Майнинг всё.", "RTX ON.", "Три кулера в лицо."],
  "rug-pull-gun": ["Ликвидность покинула чат.", "Дев ушёл с деньгами.", "Пол исчез. Босс тоже немного.", "Ковёр выдернут."],
};

/** Feed line verbs: "UNKLOFF втащил кулаком — 10". */
export const FEED_VERB: Record<string, string> = {
  fist: "втащил кулаком",
  mouse: "кинул мышку",
  "red-candle": "уронил капу",
  keyboard: "пизданул клавой",
  gpu: "кинул видюху",
  "rug-pull-gun": "выдернул ковёр",
};

export const ESCAPE_LINES = ["Босс ушёл на созвон и не вернулся.", "Время вышло. Босс ушёл обедать.", "Босс сбежал в отпуск."];

/*
 * What the boss himself says in a fight (a speech bubble by his head, every few seconds): cocky while he has more than
 * half of his HP, scared below it. A boss's own lines are mixed into the common ones.
 */
export const BOSS_TALK: { brave: string[]; scared: string[] } = {
  brave: [
    "Ну давай, удиви меня.", "Это всё, что ты можешь?", "Щекотно.", "У меня созвон через пять минут, давай быстрее.",
    "Я тебя по логам вычислю.", "Ты вообще в теме, кто тут главный?", "Слабовато для пампа.", "Я и не таких ликвидировал.",
  ],
  scared: [
    "Э, давай договоримся…", "Может, обсудим это на созвоне?", "Я всё верну, честно!", "Только не по лицу!",
    "Ладно-ладно, ты главный!", "Я просто выполнял указания…", "Можно я выйду из чата?", "Стоп-лосс! Где мой стоп-лосс?!",
  ],
};
export const BOSS_TALK_OWN: Record<string, { brave?: string[]; scared?: string[] }> = {
  datsik: { brave: ["Бабафей меня разморозит!"], scared: ["Я же просто подчинённый!", "Заморозьте меня обратно!"] },
  kedr: { brave: ["Сайт лежит, а ты тут развлекаешься?"], scared: ["Сейчас всё починю, только отстань!"] },
  bebyakyan: { brave: ["Я тут командую!", "Равняйсь! Смирно!"], scared: ["Ладно, командуй ты…"] },
  garkusha: { brave: ["Князь всё подпишет, а ты нет."], scared: ["Я ничего не подписывал!"] },
  mugo: { brave: ["Плыви сюда, рыбка."], scared: ["Акулы тоже плачут…"] },
  babafey: { brave: ["Я админ. Ты — нет."], scared: ["Бан! Бан! Почему бан не работает?!"] },
};
export function bossLines(bossId: string, scared: boolean): string[] {
  const own = BOSS_TALK_OWN[bossId]?.[scared ? "scared" : "brave"] ?? [];
  return [...own, ...own, ...BOSS_TALK[scared ? "scared" : "brave"]];
}
