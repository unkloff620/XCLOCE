/**
 * «Что нового»: the notes of the game updates, newest first. Shown on the home screen once per new entry
 * (client/updates-notice.tsx), mostly pictures (public/assets/updates/<id>-*.webp) with a line or two each.
 * Add an entry with every release that changes something players see.
 */
export interface UpdateNote {
  id: string;
  date: string;
  title: string;
  items: { img?: string; text: string }[];
}

export const UPDATES: UpdateNote[] = [
  {
    id: "2026-10-29",
    date: "29 октября",
    title: "Личное дело, ключи и бизнес",
    items: [
      { img: "/assets/updates/2026-10-29-slots.webp", text: "Новый автомат 777 во дворе: нарисованный зал, крутящиеся барабаны, кнопка и рычаг, монеты в лоток при выигрыше и дождь монет на куше." },
      { img: "/assets/updates/2026-10-29-dossier.webp", text: "Личное дело — теперь папка: на обложке фото, номер дела (место в топе) и ник. Листай влево — страницы перелистываются со звуком бумаги." },
      { img: "/assets/updates/2026-10-29-keys.webp", text: "У каждого босса свой ключ к следующему боссу, к последним пяти — пропуска. У Востока своя карточка." },
      { img: "/assets/updates/2026-10-29-win.webp", text: "Экран победы: побитый босс шатается со звёздочками над головой. Проиграл — босс радуется, а на нём «ПОРАЖЕНИЕ!»." },
      { img: "/assets/updates/2026-10-29-vostok.webp", text: "Восток: новые руки, болтающиеся ремни, без сумки и наушников, когда избит." },
      { img: "/assets/updates/2026-10-29-night.webp", text: "Локации: дневные, ночные движухи (ночной авторитет) и бизнес." },
      { img: "/assets/updates/2026-10-29-business.webp", text: "Бизнес приносит прибыль каждый час, забирать со всех локаций сразу — на странице «Локации»." },
      { img: "/assets/updates/2026-10-29-shop.webp", text: "У торговца дорисован потолок." },
      { text: "Достижения разложены по спискам: Боевые, Экономика, Задания, Нычки и Прочее. Красная точка на вкладке — есть что забрать." },
      { text: "Топ мини-игр: в зонке — лучший счёт за игру, в покере — лучшая комбинация недели. Новые медали за 1–3 места." },
      { text: "Зонк: каждая игра теперь без подсказок. Включить подсветку костей и комбинаций — переключатель под лесенкой, 2 $ за игру." },
    ],
  },
];
