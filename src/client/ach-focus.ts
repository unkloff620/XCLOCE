/** An achievement to show when the «Личное дело» opens (a tap on the achievement notice): set, then taken by the list. */
let pending: string | null = null;
export const setAchFocus = (id: string) => { pending = id; };
export const peekAchFocus = () => pending;
export const takeAchFocus = () => { const p = pending; pending = null; return p; };
