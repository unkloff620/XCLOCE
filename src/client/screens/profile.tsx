"use client";
import { replayTutorial } from "../tutorial.tsx";
import { getMusicVolume, getSfxVolume, onSoundChange, setMusicVolume, setSfxVolume } from "../sound.ts";
import { StashGivePanel } from "./stash-swap.tsx";
import { NotifySwitch } from "./quests.tsx";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useGame, useNow } from "../store.tsx";
import { haptic } from "../telegram.ts";
import { sfx } from "../sound.ts";
import { api } from "../api.ts";
import { bossesIn } from "../../content/bosses.ts";
import { itemById } from "../../content/items.ts";
import { CURRENCIES, CURRENCY_DEFS, type Currency } from "../../content/currencies.ts";
import { Avatar, Bar, Empty, Modal } from "../ui.tsx";
import { Emblem } from "../art/emblems.tsx";
import { ItemArt } from "../art/items.tsx";
import { Icon } from "../art/icons.tsx";
import { HeroRig } from "../art/rig.tsx";
import { HomeScene } from "../art/home-scene.tsx";
import { ROOM_BACKDROP } from "../../content/home-scene.ts";
import { BadgesPanel, type AchRow } from "../badges.tsx";
import { CasesPanel, type CaseRow } from "../cases.tsx";
import { TalentChip, TalentNext, TalentWindow } from "./talents.tsx";
import { EYE_COLORS, SKIN_TONES, type Look } from "../../content/home.ts";
import { clock, full, money, short } from "../format.ts";

interface Profile {
  id: number; self: boolean; name: string; username: string | null; photo: string | null;
  level: number; xp: number; levelXp: number; levelNeed: number;
  firstSeen: number; lastSeen: number; activeDays: number;
  wallet: Record<Currency, number> | null; energy: number | null;
  arsenal?: { id: string; qty: number }[];
  achPoints?: number;
  cases?: CaseRow[];
  stats: { totalDamage: number; weapons: Record<string, number>; taskSteps: number; tasksDone: number; locationsDone: number; locationsTotal: number; yardFound: number; rewardsGot: number; fightsWon: number; fightsLost: number };
  bosses: { id: string; damage: number; hits: number; wins: number }[];
  clan: { id: number; name: string; tag: string; emblem: string; color: string } | null;
  equipped: Record<string, string>;
  body: Look;
  frame: string | null;
  achievements: AchRow[];
  room: { id: string; levels: Record<string, number>; pieces?: Record<string, number>; decor: Record<string, number>; trophies?: string[] };
  stashWish?: string[];
  stashGive?: { left: number; have: Record<string, number> } | null;
  /** biceps and what the viewer may do to him now (systems/social.ts) */
  social?: Social;
}

/** "3 окт. 2026" — fits a narrow side column */
const shortDate = (ms: number) => new Date(ms).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" }).replace(" г.", "");

const FRAME_TITLE: Record<string, string> = { gold: "1 место прошлой недели", silver: "2 место прошлой недели", bronze: "3 место прошлой недели", top: "Топ-10 прошлой недели" };

function RenameWindow({ current, onClose, onDone }: { current: string; onClose: () => void; onDone: () => void }) {
  const { state, act, busy } = useGame();
  const now = useNow();
  const [name, setName] = useState(current);
  if (!state) return null;
  const r = state.rename;
  const clean = name.replace(/\s+/g, " ").trim();
  const can = (state.wallet[r.price.currency] ?? 0) >= r.price.amount;
  const valid = clean.length >= r.min && clean.length <= r.max && clean !== current;
  const save = async () => {
    const res = await act<{ name: string }>("rename", { name: clean }, (x) => `Теперь ты ${x.name}`);
    if (res) {
      onDone();
      onClose();
    }
  };
  return (
    <Modal title="Сменить ник" onClose={onClose}>
      <div className="col" style={{ gap: 10 }}>
        <div className="small muted">Меняется только ник в игре — имя в Telegram останется прежним. Сменить можно раз в 24 часа.</div>
        {r.nextAt ? (
          <div className="panel center small">Следующая смена через <b className="num">{clock(r.nextAt - now)}</b></div>
        ) : (
          <>
            <input className="input" value={name} maxLength={r.max} onChange={(e) => setName(e.target.value)} placeholder="Новый ник" autoFocus />
            <div className="tiny muted">От {r.min} до {r.max} символов: буквы, цифры, пробел, точка, _ и -</div>
            <button className="btn gold block" disabled={!valid || !can || busy === "rename"} onClick={save}>
              Сменить за <Icon name={r.price.currency} size={16} /> {money(r.price.currency, r.price.amount)}
            </button>
            {!can && <div className="tiny center" style={{ color: "#ff8a9e" }}>Не хватает {r.price.currency}</div>}
          </>
        )}
      </div>
    </Modal>
  );
}

/* ---------------- the buttons on the wall of the room ---------------- */

/** a dossier folder */
function FolderArt({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      <path d="M5 13a3 3 0 0 1 3-3h11l4 4h17a3 3 0 0 1 3 3v21a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3Z" fill="#c9974f" stroke="#2e1c00" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M5 19h38v19a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3Z" fill="#e8bb6c" stroke="#2e1c00" strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="12" y="24" width="15" height="4" rx="1" fill="#7a4a1c" />
      <rect x="12" y="31" width="22" height="3" rx="1" fill="#a8743a" />
      <path d="M33 22l7 0 0 6-3.5-2-3.5 2Z" fill="#d0102f" stroke="#2e1c00" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
/** a flexed arm */
function BicepsArt({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      <path d="M8 40c-2-6 0-12 4-17l6-9c2-3 6-4 9-2l2 1c2 2 1 5-1 6l-5 3 1 4c3-4 9-6 14-4 6 2 7 9 4 13-3 5-10 7-18 7H11c-1 0-2-1-3-2Z" fill="#f2b98a" stroke="#2e1c00" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M24 30c3-3 8-3 11 0" fill="none" stroke="#c98458" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M15 17l4 2" stroke="#c98458" strokeWidth="2" strokeLinecap="round" />
      <path d="M38 8l2 4M43 13l-4 1M34 6l0 4" stroke="#ffd25a" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
/** a fist coming at you */
function FistArt({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      <path d="M10 18c0-3 2-5 5-5h17c4 0 7 3 7 7v9c0 6-5 11-11 11h-8c-6 0-10-4-10-10Z" fill="#f2b98a" stroke="#2e1c00" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M17 13v9M24 13v9M31 13v9" stroke="#2e1c00" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M10 24h10c3 0 4 3 2 5l-3 2" fill="none" stroke="#2e1c00" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M41 10l4-3M43 17h4M40 4l1-3" stroke="#ff5a3d" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
/** a spit flying */
function SpitArt({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      <path d="M6 30c4-10 14-16 26-14 6 1 10 6 9 11-1 7-9 10-16 8-6-2-9-1-13 1-3 1-7-2-6-6Z" fill="#cfe9c4" stroke="#2e3b22" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="31" cy="25" r="3.2" fill="#fff" opacity="0.8" />
      <circle cx="12" cy="40" r="2.6" fill="#cfe9c4" stroke="#2e3b22" strokeWidth="1.8" />
      <circle cx="42" cy="38" r="2" fill="#cfe9c4" stroke="#2e3b22" strokeWidth="1.6" />
    </svg>
  );
}

type Social = { biceps: number; mine: number; pump: boolean | null; fight: boolean | null; spit: number | null };

/** the fist fight in the background: a dust cloud over the room, then who won */
function Brawl({ res, name, onClose }: { res: { won: boolean; mine: number; theirs: number; reward: unknown } | null; name: string; onClose: () => void }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 1400);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (shown && res) { if (res.won) { haptic.big(); sfx("win"); } else { haptic.err(); sfx("error"); } }
  }, [shown, res]);
  if (!shown || !res) {
    return (
      <div className="pr-brawl" aria-hidden="true">
        <span className="pr-dust" />
        <span className="pr-fist a"><FistArt size={70} /></span>
        <span className="pr-fist b"><FistArt size={70} /></span>
        <b className="pr-pow display">БАЦ!</b>
      </div>
    );
  }
  return (
    <Modal title={res.won ? "Ты победил!" : "Ты отхватил"} onClose={onClose}>
      <div className={`pr-brawl-res ${res.won ? "win" : "lose"}`}>
        <div className="pr-brawl-vs">
          <span><BicepsArt size={36} /><b className="num">{res.mine}</b><small>твоя бицуха</small></span>
          <b className="display">VS</b>
          <span><BicepsArt size={36} /><b className="num">{res.theirs}</b><small>у {name}</small></span>
        </div>
        <p className="small">{res.won ? <>Наехал на {name} и вышел победителем: <b>+50 ₽</b></> : <>{name} крепче — качай бицуху, и в следующий раз он не устоит.</>}</p>
        <button className="btn gold block" onClick={onClose}>Ок</button>
      </div>
    </Modal>
  );
}

/** «Личное дело»: the folder with tabs — the summary, achievements, the cases on bosses, нычки, settings */
function Dossier({ p, onClose, reload }: { p: Profile; onClose: () => void; reload: () => void }) {
  const { state } = useGame();
  const [tab, setTab] = useState<"sum" | "ach" | "cases" | "stash" | "set">("sum");
  const [renaming, setRenaming] = useState(false);
  const [talentsOpen, setTalentsOpen] = useState(false);
  const s = p.stats;
  const tabs: { id: typeof tab; label: string }[] = [
    { id: "sum", label: "Сводка" },
    { id: "ach", label: "Достижения" },
    ...(p.cases ? [{ id: "cases" as const, label: "Дела" }] : []),
    ...(!p.self && p.stashGive ? [{ id: "stash" as const, label: "Нычки" }] : []),
    ...(p.self ? [{ id: "set" as const, label: "Настройки" }] : []),
  ];
  return (
    <Modal onClose={onClose} wide>
      <div className="dos">
        <div className="dos-head">
          <Avatar name={p.name} photo={p.photo} size={44} frame={p.frame} />
          <div className="grow" style={{ minWidth: 0 }}>
            <span className="tiny dos-k">ЛИЧНОЕ ДЕЛО №{p.id}</span>
            <div className="row" style={{ gap: 6 }}>
              <b className="display ellipsis" style={{ fontSize: 19 }}>{p.name}</b>
              {p.self && (
                <button className="icon-btn" onClick={() => setRenaming(true)} aria-label="Сменить ник" title="Сменить ник">
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Z" fill="#ffcc33" stroke="#140d24" strokeWidth="2" strokeLinejoin="round" /><path d="M13 7l4 4" stroke="#140d24" strokeWidth="2" /></svg>
                </button>
              )}
            </div>
            {p.username && <a className="tg-link tiny" href={`https://t.me/${encodeURIComponent(p.username)}`} target="_blank" rel="noopener noreferrer">@{p.username}</a>}
          </div>
        </div>
        <div className="dos-tabs" role="tablist">
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`dos-tab ${tab === t.id ? "on" : ""}`} onClick={() => { haptic.tap(); setTab(t.id); }}>{t.label}</button>
          ))}
        </div>
        <div className="dos-page">
          {tab === "sum" && (
            <div className="col" style={{ gap: 10 }}>
              {p.frame && <div className="center"><span className={`chip frame-chip frame-${p.frame}`}><Icon name="trophy" size={14} />{FRAME_TITLE[p.frame]}</span></div>}
              <div className="row" style={{ gap: 8 }}>
                <span className="lvl ph-lvl">LVL {p.level}</span>
                <div className="grow"><Bar value={p.levelXp} max={p.levelNeed || 1} tone="violet" label={p.levelNeed ? `${full(p.levelXp)} / ${full(p.levelNeed)}` : "макс."} /></div>
              </div>
              <div className="dos-facts">
                <span><small>Авторитет</small><b className="num"><Icon name="xp" size={16} />{full(p.xp)}</b></span>
                <span><small>Бицуха</small><b className="num"><BicepsArt size={18} />{full(p.social?.biceps ?? 0)}</b></span>
                <span><small>В игре с</small><b>{shortDate(p.firstSeen)}</b></span>
                <span><small>Дней в игре</small><b className="num">{full(p.activeDays)}</b></span>
                <span><small>Был в игре</small><b>{shortDate(p.lastSeen)}</b></span>
                <span><small>Клан</small><b className="ellipsis">{p.clan ? `[${p.clan.tag}] ${p.clan.name}` : "нет"}</b></span>
              </div>
              {p.wallet && (
                <div className="balance-list">
                  {CURRENCIES.map((c) => (
                    <div key={c} className="balance-row">
                      <Icon name={c} size={24} />
                      <span className="balance-name">{CURRENCY_DEFS[c].name}</span>
                      <b className="balance-val num">{money(c, p.wallet![c])}</b>
                    </div>
                  ))}
                  {p.energy !== null && (
                    <div className="balance-row"><Icon name="energy" size={24} /><span className="balance-name">Энергия</span><b className="balance-val num">{full(p.energy)}</b></div>
                  )}
                </div>
              )}
              {p.self && state && (
                <div className="tal-row">
                  <TalentChip n={state.player.talents} />
                  <div className="grow"><TalentNext dmg={state.player.talentDamage} /></div>
                  <button className="btn gold sm tal-go" onClick={() => setTalentsOpen(true)}>Таланты ›</button>
                </div>
              )}
              <div className="stat-grid">
                <div><b className="num">{short(s.totalDamage)}</b><span>урона боссам</span></div>
                <div><b className="num">{s.fightsWon}</b><span>побед</span></div>
                <div><b className="num">{s.fightsLost}</b><span>поражений</span></div>
                <div><b className="num">{s.locationsDone}/{s.locationsTotal}</b><span>локаций</span></div>
                <div><b className="num">{s.tasksDone}</b><span>заданий</span></div>
                <div><b className="num">{s.yardFound}</b><span>находок</span></div>
              </div>
              {!!p.arsenal?.length && (
                <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
                  {p.arsenal.map((w) => <span key={w.id} className="chip" title={itemById(w.id)?.name}><ItemArt id={w.id} size={22} />×{full(w.qty)}</span>)}
                </div>
              )}
              <div className="col" style={{ gap: 4 }}>
                {bossesIn(p.bosses.map((x) => x.id)).map((b) => {
                  const r = p.bosses.find((x) => x.id === b.id);
                  return (
                    <div key={b.id} className="pb-row small">
                      <span className="ellipsis">{b.order}. {b.name}</span>
                      <span className="pb-wins">{!!r?.wins && <span className="chip green"><Icon name="trophy" size={14} /><b className="num">{r.wins}</b></span>}</span>
                      <b className="num pb-dmg">{full(r?.damage ?? 0)}</b>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {tab === "ach" && <BadgesPanel rows={p.achievements} self={p.self} onClaimed={reload} points={p.achPoints ?? 0} />}
          {tab === "cases" && p.cases && <CasesPanel cases={p.cases} self={p.self} />}
          {tab === "stash" && !p.self && p.stashGive && <StashGivePanel to={p.id} name={p.name} wish={p.stashWish ?? []} give={p.stashGive} onSent={reload} />}
          {tab === "set" && p.self && <SettingsPanel />}
        </div>
      </div>
      {talentsOpen && <TalentWindow onClose={() => setTalentsOpen(false)} />}
      {renaming && <RenameWindow current={p.name} onClose={() => setRenaming(false)} onDone={reload} />}
    </Modal>
  );
}

export function ProfileScreen() {
  const q = useSearchParams();
  const { state, act, busy, toast } = useGame();
  const now = useNow();
  const [p, setP] = useState<Profile | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [dossier, setDossier] = useState(false);
  const [brawl, setBrawl] = useState<{ key: number; res: { won: boolean; mine: number; theirs: number; reward: unknown } | null } | null>(null);
  const [fx, setFx] = useState<{ key: number; kind: "pump" | "spit" } | null>(null);
  const id = q.get("id");
  const [tick, setTick] = useState(0);
  const reload = () => setTick((t) => t + 1);
  useEffect(() => {
    api.get<Profile>(`/api/profile${id ? `?id=${encodeURIComponent(id)}` : ""}`).then(setP).catch((e) => setErr(e.message));
  }, [id, state?.player.xp, state?.player.name, tick]);
  if (err) return <Empty>{err}</Empty>;
  if (!p) return null;
  const so = p.social;
  const spitIn = so && typeof so.spit === "number" && so.spit > 0 ? Math.max(0, so.spit - now) : 0;
  const flash = (kind: "pump" | "spit") => {
    const key = Date.now();
    setFx({ key, kind });
    setTimeout(() => setFx((f) => (f?.key === key ? null : f)), 1300);
  };
  const pump = async () => {
    if (p.self) { haptic.tap(); toast("Бицуху качают другие — зайди к кому-нибудь и прокачай ему", "info"); return; }
    if (!so?.pump) { haptic.err(); toast("Сегодня ты ему уже качал — приходи завтра", "err"); return; }
    sfx("nishtyak");
    haptic.big();
    const r = await act<{ biceps: number }>("social_pump", { to: p.id });
    if (r) { flash("pump"); reload(); }
  };
  const fight = async () => {
    if (!so?.fight) { haptic.err(); toast("С ним ты сегодня уже махался — завтра", "err"); return; }
    haptic.tap();
    sfx("brawl");
    const key = Date.now();
    setBrawl({ key, res: null });
    const r = await act<{ won: boolean; mine: number; theirs: number; reward: unknown }>("social_fight", { to: p.id });
    if (!r) { setBrawl(null); return; }
    setBrawl({ key, res: r });
    reload();
  };
  const spit = async () => {
    if (spitIn > 0) { haptic.err(); toast(`Слюна кончилась — ещё ${clock(spitIn)}`, "err"); return; }
    if (so?.spit === -1) { haptic.err(); toast("На сегодня хватит харкать", "err"); return; }
    sfx("spit");
    haptic.tap();
    const r = await act("social_spit", { to: p.id }, `Харкнул в ${p.name}`);
    if (r) { flash("spit"); reload(); }
  };
  return (
    <div className="fit-page pr-page">
      <div className="room">
        <div className="scene-backdrop" style={{ backgroundImage: `url(/assets/home/${ROOM_BACKDROP[p.room.id] ?? ROOM_BACKDROP.basic}.webp)` }} />
        <div className="room-view">
          <HomeScene room={p.room.id} look={p.body} worn={p.equipped} pieces={p.room.pieces} decor={p.room.decor} trophies={p.room.trophies} still />
        </div>
        {/* whose room this is */}
        <div className="pr-plate">
          <Avatar name={p.name} photo={p.photo} size={34} frame={p.frame} />
          <span className="pr-plate-t">
            <b className="ellipsis">{p.name}</b>
            <small><span className="pr-lvl num">LVL {p.level}</span>{p.clan && <span className="pr-tag">[{p.clan.tag}]</span>}</small>
          </span>
        </div>
        {/* the buttons on the wall */}
        <div className="pr-rail">
          <button type="button" className="pr-btn" style={{ ["--c" as string]: "#e8bb6c" }} onClick={() => { haptic.tap(); setDossier(true); }} aria-label="Личное дело">
            <FolderArt size={40} /><small>Дело</small>
          </button>
          <button type="button" className={`pr-btn ${!p.self && so?.pump ? "glow" : ""} ${!p.self && !so?.pump ? "spent" : ""}`} style={{ ["--c" as string]: "#ff9a5c" }} disabled={busy === "social_pump"} onClick={pump} aria-label="Прокачать бицуху">
            <BicepsArt size={40} /><small className="num">{full(so?.biceps ?? 0)}</small>
            {fx?.kind === "pump" && <b key={fx.key} className="pr-pop num">+1</b>}
          </button>
          {!p.self && (
            <>
              <button type="button" className={`pr-btn ${so?.fight ? "" : "spent"}`} style={{ ["--c" as string]: "#ff5a3d" }} disabled={!!brawl || busy === "social_fight"} onClick={fight} aria-label="Наехать">
                <FistArt size={40} /><small>Наехать</small>
              </button>
              <button type="button" className={`pr-btn ${spitIn > 0 || so?.spit === -1 ? "spent" : ""}`} style={{ ["--c" as string]: "#8fd17a" }} disabled={busy === "social_spit"} onClick={spit} aria-label="Харкнуть">
                <SpitArt size={40} /><small>{spitIn > 0 ? clock(spitIn) : "Харкнуть"}</small>
              </button>
            </>
          )}
          {p.clan && (
            <Link href={`/clans/${p.clan.id}`} className="pr-btn" style={{ ["--c" as string]: p.clan.color }} aria-label={`Клан ${p.clan.name}`}>
              <Emblem emblem={p.clan.emblem} color={p.clan.color} size={38} /><small className="ellipsis">{p.clan.tag}</small>
            </Link>
          )}
        </div>
        {fx?.kind === "spit" && <span key={fx.key} className="pr-spit" aria-hidden="true"><SpitArt size={90} /></span>}
      </div>
      {brawl && <Brawl key={brawl.key} res={brawl.res} name={p.name} onClose={() => setBrawl(null)} />}
      {dossier && <Dossier p={p} onClose={() => setDossier(false)} reload={reload} />}
    </div>
  );
}

/** Own profile only: the hero's looks, Telegram reminders, the tour again (sound switches live in the HUD). */
function SettingsPanel() {
  const router = useRouter();
  const [looks, setLooks] = useState(false);
  return (
    <div className="panel col" style={{ gap: 8 }}>
      <div className="small muted">НАСТРОЙКИ</div>
      <VolumeSliders />
      <button className="btn dark block" onClick={() => setLooks(true)}>Внешность: кожа и глаза</button>
      {looks && <LooksWindow onClose={() => setLooks(false)} />}
      <NotifySwitch />
      <button className="btn dark block" onClick={() => { router.push("/"); setTimeout(replayTutorial, 400); }}>Пройти обучение заново</button>
    </div>
  );
}

/** The hero's base looks — the skin tone and the eye colour (the character editor at home keeps clothes, hair, tattoos). */
function LooksWindow({ onClose }: { onClose: () => void }) {
  const { state, act, busy } = useGame();
  const [look, setLook] = useState<Look | null>(state?.look.body ?? null);
  if (!state || !look) return null;
  const changed = JSON.stringify(look) !== JSON.stringify(state.look.body);
  const save = async () => {
    if ((await act("look_set", { ...look })) !== null) onClose();
  };
  return (
    <Modal title="Внешность" onClose={onClose}>
      <div className="col" style={{ gap: 12, alignItems: "center" }}>
        <HeroRig size={220} still look={look} worn={state.look.equipped} />
        <div className="col" style={{ gap: 6, width: "100%" }}>
          <span className="tiny muted">Кожа</span>
          <div className="sty-opts">
            {SKIN_TONES.map((t, i) => (
              <button key={t.base} className={`swatch ${look.skin === i ? "on" : ""}`} style={{ background: t.base }} onClick={() => setLook({ ...look, skin: i })} aria-label={`тон кожи ${i + 1}`} />
            ))}
          </div>
          <span className="tiny muted">Цвет глаз</span>
          <div className="sty-opts">
            {EYE_COLORS.map((c, i) => (
              <button key={c} className={`swatch eye ${look.eyes === i ? "on" : ""}`} style={{ ["--iris" as string]: c }} onClick={() => setLook({ ...look, eyes: i })} aria-label={`цвет глаз ${i + 1}`} />
            ))}
          </div>
        </div>
        <button className="btn green block" disabled={!changed || !!busy} onClick={save}>{changed ? "Сохранить" : "Без изменений"}</button>
      </div>
    </Modal>
  );
}

/** Volume of the music (and the yard's nature) and of the effects; remembered on this device. */
function VolumeSliders() {
  const music = useSyncExternalStore(onSoundChange, getMusicVolume, () => 1);
  const fx = useSyncExternalStore(onSoundChange, getSfxVolume, () => 1);
  const row = (label: string, v: number, set: (x: number) => void) => (
    <label className="vol-row">
      <span className="small">{label}</span>
      <input type="range" min={0} max={100} step={5} value={Math.round(v * 100)} onChange={(e) => set(Number(e.target.value) / 100)} aria-label={label} />
      <b className="num tiny vol-val">{Math.round(v * 100)}%</b>
    </label>
  );
  return (
    <div className="col" style={{ gap: 6 }}>
      {row("Музыка", music, setMusicVolume)}
      {row("Эффекты", fx, setSfxVolume)}
    </div>
  );
}
