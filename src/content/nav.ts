/** Bottom menu: icons only; names and hints are shown in the home help window [?]. */
export const NAV_TABS = [
  { id: "yard", href: "/yard", label: "Двор", hint: "Находки каждые 5 минут, автомат 777, апгрейдер, блэкджек и зонк, обменник и локации." },
  { id: "shop", href: "/shop", label: "Магаз", hint: "Оружие, энергия, одежда и разное за игровую валюту." },
  { id: "bosses", href: "/bosses", label: "Забив", hint: "Список боссов и текущий бой. Бей оружием, забирай награды и пропуски." },
  { id: "home", href: "/", label: "Хата", hint: "Твой персонаж и комната: гардероб, ежедневный бонус, обстановка." },
  { id: "craft", href: "/craft", label: "Гараж", hint: "Собирай вещи из деталей и клади их в заначку — каждая даёт свой бонус." },
  { id: "clans", href: "/clans", label: "Банда", hint: "Вступи в клан или создай свой и бейте боссов вместе." },
] as const;
