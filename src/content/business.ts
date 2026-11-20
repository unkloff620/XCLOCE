import { LOCATIONS, type LocationDef } from "./locations.ts";

/*
 * «Бизнес» of the locations — the user's table (2026-11-20). Every location has two or three businesses; each gives one
 * kind of profit an hour: «xp» (авторитет игроку), «loc» (авторитет локации — counts for the zone's leader) or «pap»
 * (папиросы). A business has BIZ_STEPS steps; a step is BIZ_CELLS(location) cells bought one by one for папиросы
 * (BIZ_CELL_COST of the location each); every full step adds a sixth of the business's top profit. Profit piles up
 * hour by hour (whole hours), up to BUSINESS_MAX_DAYS, and is taken all at once.
 */
export const BUSINESS_MAX_DAYS = 7;
export const BUSINESS_MAX_HOURS = BUSINESS_MAX_DAYS * 24;
export const BIZ_STEPS = 6;
export type BizKind = "xp" | "loc" | "pap";
export interface BizDef {
  id: string;
  name: string;
  kind: BizKind;
  /** profit an hour at the last step */
  max: number;
}
const b = (id: string, name: string, kind: BizKind, max: number): BizDef => ({ id, name, kind, max });
export const LOCATION_BIZ: Record<string, BizDef[]> = {
  openspace: [b("os-coffee", "Кофемашина", "xp", 120), b("os-printer", "Принтер", "loc", 160)],
  market: [b("mk-exchange", "Обменник", "xp", 112), b("mk-shill", "Палатка шиллера", "loc", 80), b("mk-stall", "Ларёк с мемкоинами", "pap", 96)],
  serverroom: [b("sr-rack", "Серверная стойка", "xp", 96), b("sr-hosting", "Хостинг", "loc", 120)],
  basement: [b("bs-rig", "Майнинг-риг", "pap", 120), b("bs-gpu", "Скупка видеокарт", "xp", 120)],
  board: [b("bd-chair", "Кресло директора", "xp", 180), b("bd-safe", "Сейф", "loc", 120), b("bd-kickback", "Откаты", "pap", 170)],
  accounting: [b("ac-cash", "Чёрная касса", "xp", 112), b("ac-stamp", "Печать", "loc", 112), b("ac-cashout", "Обнал", "pap", 184)],
  hr: [b("hr-agency", "Кадровое агентство", "pap", 179), b("hr-courses", "Курсы трейдинга", "pap", 145)],
  party: [b("pt-host", "Тамада", "xp", 122), b("pt-karaoke", "Караоке", "xp", 132), b("pt-bar", "Бар", "loc", 123)],
  offshore: [b("of-shell", "Фирма-пустышка", "xp", 197), b("of-bank", "Банк на Кайманах", "loc", 167), b("of-vault", "Банковская ячейка", "pap", 284)],
  yacht: [b("yt-jacuzzi", "Джакузи", "xp", 257), b("yt-heli", "Вертолётная площадка", "loc", 153), b("yt-fishing", "Рыбалка на монеты", "pap", 224)],
  moonbase: [b("mn-rig", "Лунный риг", "xp", 157), b("mn-dock", "Ракетный док", "loc", 183), b("mn-soil", "Лунный грунт", "pap", 348)],
  mars: [b("ms-rover", "Марсоход", "pap", 348), b("ms-ice", "Ледяная шахта", "pap", 248)],
  orbit: [b("or-roulette", "Рулетка", "xp", 257), b("or-poker", "Покерный стол", "xp", 198)],
  sunfarm: [b("sf-panels", "Солнечные панели", "xp", 197), b("sf-shield", "Теплозащита", "loc", 192), b("sf-nitrogen", "Азотный охладитель", "pap", 235)],
  genesis: [b("gn-node", "Нода", "xp", 327), b("gn-block", "Первый блок", "loc", 351), b("gn-wallet", "Кошелёк Сатоши", "pap", 435)],
};
export const bizOf = (l: LocationDef) => LOCATION_BIZ[l.id] ?? [];
export const bizById = (id: string) => {
  for (const l of LOCATIONS) {
    const d = bizOf(l).find((x) => x.id === id);
    if (d) return { loc: l, biz: d };
  }
  return undefined;
};
/** cells in a step: 4 in the first locations, 8 in the last */
export const bizCells = (l: LocationDef) => Math.min(8, 4 + Math.floor((l.order - 1) / 3));
/** all cells of a business */
export const bizCellsAll = (l: LocationDef) => BIZ_STEPS * bizCells(l);
/** the price of a cell: 1 100 папирос in the first location, +150 in every next one (3 200 in the 15th) */
export const bizCellCost = (l: LocationDef) => 1100 + 150 * (l.order - 1);
/** full steps of a business with `cells` cells bought */
export const bizStep = (l: LocationDef, cells: number) => Math.min(BIZ_STEPS, Math.floor(cells / bizCells(l)));
/** profit an hour at a step: its share of the top profit (whole numbers; the last step — the top exactly) */
export const bizPerHour = (d: BizDef, step: number) => Math.round((d.max * Math.min(BIZ_STEPS, step)) / BIZ_STEPS);
