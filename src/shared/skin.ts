/**
 * Skin slots: every replaceable picture of the UI, its size and where the game puts text over it.
 * Drop a file named `<key>.png` (or .webp/.jpg) into `public/skin/` and the game uses it instead of the drawn art.
 * `npm run skin` (also runs before dev/build) refreshes `skin-files.ts`, the list of files that exist.
 *
 * Kinds:
 *  - "nine"  — 9-slice frame for blocks with text of any width (panels, buttons). The corners (`slice` px of the image)
 *              never stretch, the edges and middle stretch. Text sits inside `pad` (CSS px).
 *  - "image" — a fixed picture (icon, nav button); scaled to `css` size, never stretched (contain).
 *  - "cover" — a background that fills its box; edges may be cropped, keep important things inside `safe`.
 * Sizes are given for 3× screens (1 CSS px = 3 image px).
 */
import { ITEMS } from "./items.ts";
import { BOSSES, bossImage, type BossDef } from "./content.ts";
import { SKIN_FILES } from "./skin-files.ts";

export type SkinKind = "nine" | "image" | "cover";
export interface SkinZone { name: string; x: number; y: number; w: number; h: number } // percent of the image
export interface SkinSlot {
  key: string;
  group: string;
  title: string;
  kind: SkinKind;
  /** image size in px */
  w: number;
  h: number;
  /** size on screen in CSS px (approx. for stretchable blocks) */
  css: { w: number; h: number };
  /** nine: corner size in image px */
  slice?: number;
  /** nine: text padding in CSS px [top, right, bottom, left] */
  pad?: [number, number, number, number];
  /** CSS selector the slot skins (nine / cover backgrounds) */
  selector?: string;
  /** cover / image: zones the game draws over the picture */
  zones?: SkinZone[];
  /** transparent background required */
  alpha: boolean;
  note: string;
}

const nine = (key: string, group: string, title: string, w: number, h: number, slice: number, pad: SkinSlot["pad"], selector: string, note: string): SkinSlot =>
  ({ key, group, title, kind: "nine", w, h, css: { w: Math.round(w / 3), h: Math.round(h / 3) }, slice, pad, selector, alpha: true, note });
const image = (key: string, group: string, title: string, w: number, h: number, note: string, zones?: SkinZone[]): SkinSlot =>
  ({ key, group, title, kind: "image", w, h, css: { w: Math.round(w / 3), h: Math.round(h / 3) }, alpha: true, note, zones });
const cover = (key: string, group: string, title: string, w: number, h: number, selector: string | undefined, note: string, zones: SkinZone[] = []): SkinSlot =>
  ({ key, group, title, kind: "cover", w, h, css: { w: Math.round(w / 3), h: Math.round(h / 3) }, selector, alpha: false, note, zones });

export const SKIN_SLOTS: SkinSlot[] = [
  // ---- top HUD ----
  nine("hud-profile", "Верхний HUD", "Панель профиля", 408, 174, 42, [6, 8, 6, 8], ".hud .hud-profile", "Аватар слева, ник, уровень и полоска опыта — справа от него. Растягивается по ширине."),
  nine("hud-power", "Верхний HUD", "Панель силы", 288, 174, 42, [6, 8, 6, 8], ".hud .hud-power", "Иконка мечей + POWER + число, под ним полоска энергии."),
  nine("hud-money", "Верхний HUD", "Панель денег", 336, 174, 42, [5, 5, 5, 5], ".hud .hud-money", "Две строки валют одна под другой (по умолчанию RUB и USD). Нажатие на строку открывает список валют."),
  nine("hud-cell", "Верхний HUD", "Плашка валюты", 300, 72, 24, [2, 5, 2, 5], ".hud .money", "Иконка валюты + сумма + стрелка ▾. Две такие в панели и они же — строки выпадающего списка."),
  nine("hud-money-list", "Верхний HUD", "Выпадающий список валют", 510, 600, 48, [6, 6, 6, 6], ".hud .money-list", "Фон списка под панелью денег: 4 строки валют."),
  nine("bar-energy", "Верхний HUD", "Рамка полоски энергии", 276, 39, 18, [0, 0, 0, 0], ".energy-mini", "Текст «⚡87/100» по центру. Заливку рисует игра (зелёная) или файл bar-energy-fill."),
  nine("bar-energy-fill", "Верхний HUD", "Заливка энергии", 276, 39, 18, [0, 0, 0, 0], ".energy-fill", "Обрезается по проценту энергии."),
  // ---- bottom menu (no text) ----
  image("nav-boss", "Нижнее меню", "Кнопка Boss", 216, 180, "Без текста. Вариант nav-boss-on — для активной вкладки (необязательно, иначе игра подсветит сама)."),
  image("nav-market", "Нижнее меню", "Кнопка Market", 216, 180, "Без текста. Есть вариант -on."),
  image("nav-home", "Нижнее меню", "Кнопка Home (центр, больше)", 240, 240, "Без текста, круглая/квадратная, выступает над меню. Есть вариант -on."),
  image("nav-inventory", "Нижнее меню", "Кнопка Inventory", 216, 180, "Без текста. Есть вариант -on."),
  image("nav-social", "Нижнее меню", "Кнопка Social", 216, 180, "Без текста. Есть вариант -on."),
  // ---- home ----
  image("side-yard", "Главный экран", "Кнопка «Двор»", 168, 168, "Только картинка — подпись игра пишет снизу (зона 25% снизу оставь спокойной).", [{ name: "подпись", x: 0, y: 75, w: 100, h: 25 }]),
  image("side-missions", "Главный экран", "Кнопка «Задания»", 168, 168, "Как side-yard.", [{ name: "подпись", x: 0, y: 75, w: 100, h: 25 }]),
  image("side-events", "Главный экран", "Кнопка «Ивенты»", 168, 168, "Как side-yard.", [{ name: "подпись", x: 0, y: 75, w: 100, h: 25 }]),
  image("side-shop", "Главный экран", "Кнопка «Магазин»", 168, 168, "Как side-yard.", [{ name: "подпись", x: 0, y: 75, w: 100, h: 25 }]),
  image("side-exchange", "Главный экран", "Кнопка «Exchange» (обменник)", 168, 168, "Как side-yard. Единственный вход в обмен валют.", [{ name: "подпись", x: 0, y: 75, w: 100, h: 25 }]),
  cover("banner-boss", "Главный экран", "Баннер боя с боссом", 1122, 288, ".boss-banner", "Фон баннера. Картинку босса, имя, время, HP и кнопку игра кладёт сверху.", [
    { name: "имя, время", x: 2, y: 6, w: 44, h: 88 },
    { name: "босс", x: 34, y: 0, w: 38, h: 100 },
    { name: "HP, кнопка", x: 60, y: 6, w: 38, h: 88 },
  ]),
  // ---- common ----
  nine("btn-green", "Кнопки и окна", "Зелёная кнопка", 360, 132, 42, [0, 14, 0, 14], ".btn-green", "Главные действия: ЗАБРАТЬ, СОХРАНИТЬ. Текст по центру."),
  nine("btn-yellow", "Кнопки и окна", "Жёлтая кнопка", 360, 114, 36, [0, 12, 0, 12], ".btn-yellow", "Вторичные действия."),
  nine("btn-red", "Кнопки и окна", "Красная кнопка ATTACK", 222, 126, 36, [0, 8, 0, 8], ".btn-attack", "Кнопка нападения в списке боссов."),
  nine("btn-dark", "Кнопки и окна", "Тёмная кнопка", 360, 138, 42, [0, 14, 0, 14], ".btn-dark", "СБЕЖАТЬ, ЗАКРЫТЬ."),
  nine("panel", "Кнопки и окна", "Карточка/панель", 360, 360, 48, [10, 10, 10, 10], ".panel", "Все карточки на экранах. Тянется в любую сторону."),
  nine("window", "Кнопки и окна", "Окно (магазин, профиль, награды)", 480, 480, 60, [12, 12, 12, 12], ".sheet, .victory", "Центральные окна. Заголовок и крестик игра рисует сверху внутри отступа."),
  // ---- backgrounds ----
  cover("bg-app", "Фоны", "Общий фон игры", 1170, 2532, ".app", "Под всеми экранами. Тёмный и спокойный — поверх много текста."),
  cover("bg-yard", "Фоны", "Двор", 1200, 1500, undefined, "Предметы появляются в нижней половине (асфальт).", [{ name: "таймер", x: 25, y: 0, w: 50, h: 8 }, { name: "здесь лежат предметы", x: 5, y: 48, w: 90, h: 44 }]),
  // ---- yard items ----
  image("yard-beer", "Предметы двора", "Бутылка пива", 168, 168, "Прозрачный фон."),
  image("yard-energy", "Предметы двора", "Энергетик", 168, 168, "Прозрачный фон."),
  image("yard-coins", "Предметы двора", "Мелочь", 168, 168, "Прозрачный фон."),
  image("fists", "Предметы двора", "Кулак (оружие по умолчанию)", 256, 256, "Иконка кулака в бою."),
  // ---- items & bosses ----
  ...ITEMS.map((i) => image(`items/${i.id}`, "Предметы", i.name, 256, 256, "Иконка предмета, прозрачный фон. В инвентаре — квадрат 5 в ряд.")),
  image("frames/default", "Рамки боссов", "Общая рамка (для всех боссов без своей)", 360, 360, "Квадрат с прозрачным центром. Портрет босса встаёт в окно с отступом 12% от каждого края, рамка рисуется поверх.", [{ name: "портрет босса", x: 12, y: 12, w: 76, h: 76 }]),
  ...BOSSES.map((b) => image(`frames/${b.slug}`, "Рамки боссов", `Рамка #${b.index} ${b.name}`, 360, 360, "Своя рамка этого босса. Окно под портрет — 12% от краёв, центр прозрачный. В списке ≈74 pt, в бою ≈260 pt.", [{ name: "портрет", x: 12, y: 12, w: 76, h: 76 }])),
  ...BOSSES.map((b) => ({ ...image(`bosses/${b.slug}`, "Боссы", `#${b.index} ${b.name}`, 768, 768, "Квадрат. В списке — маленькая аватарка, в бою — крупно. Без надписей."), alpha: false })),
];


/** URL of the uploaded picture for a slot, or null when the drawn default is used. */
export function skinUrl(key: string): string | null {
  const f = SKIN_FILES[key];
  return f ? `/skin/${f}` : null;
}
export function slotByKey(key: string) {
  return SKIN_SLOTS.find((s) => s.key === key);
}

/** Boss picture: uploaded skin if present, otherwise the generated SVG. */
export function bossArt(b: Pick<BossDef, "index" | "slug">): string {
  return skinUrl(`bosses/${b.slug}`) ?? bossImage(b);
}
