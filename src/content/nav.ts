/** Bottom menu: icons only; names and hints are shown in the home help window [?]. */
export const NAV_TABS = [
  { id: "yard", href: "/yard", label: "Двор", hint: "Находки каждые 5 минут, автомат 777, магазин, обменник и локации." },
  { id: "bosses", href: "/bosses", label: "Боссы", hint: "Список боссов и текущий бой. Бей оружием, забирай награды и пропуски." },
  { id: "home", href: "/", label: "Дом", hint: "Твой персонаж и комната: гардероб, ежедневный бонус, техника для крита." },
  { id: "inventory", href: "/inventory", label: "Инвентарь", hint: "Всё, что у тебя есть: оружие, одежда, предметы. Находки со двора можно продать." },
  { id: "clans", href: "/clans", label: "Кланы", hint: "Вступи в клан или создай свой и бейте боссов вместе." },
] as const;
