"use client";
import { FIGHT_MODES, MEDAL_NAMES, MEDAL_SET, medalBonus, medalStep, medalWeapon } from "../../content/medals.ts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useGame, useNow } from "../store.tsx";
import { api, type Tray } from "../api.ts";
import { BOSSES, bossesIn, bossById } from "../../content/bosses.ts";
import { Avatar, GainLine, MysteryDrop, RewardChips, bossItemsCount } from "../ui.tsx";
import { WEAPONS } from "../../content/items.ts";
import type { BossDef } from "../../content/bosses.ts";
import { Help, HelpList } from "../help.tsx";
import { weaponStats } from "../weapon-stats.ts";
import { itemById } from "../../content/items.ts";
import { Icon } from "../art/icons.tsx";
import { ItemArt } from "../art/items.tsx";
import { BossSilhouette } from "../art/scenes.tsx";
import { BossRig, hasBossRig } from "../art/boss-rig.tsx";
import { clock } from "../format.ts";

export interface BossRow {
  id: string; unlocked: boolean; keysHave: number; keysNeed: number; myKeys: number; hpMax: number;
  fightsToday: number; fightsPerDay: number; myDamage: number; myWins: number; mySoloWins?: number; fightingNow: number; totalWins: number;
  /** my medals of this boss by kind (content/medals.ts) */
  medals?: { bronze: number; silver: number; gold: number };
  lastKiller: { id: number; name: string; photo: string | null; at: number } | null;
}
export interface BossListData { resetAt: number; bosses: BossRow[]; weapons: Tray[]; now: number }

export function useBossList() {
  const [data, setData] = useState<BossListData | null>(null);
  const load = useCallback(async () => {
    // a phone on a weak network may drop the first request: try again a few times before giving up
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        setData(await api.get<BossListData>("/api/bosses"));
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }
    }
  }, []);
  useEffect(() => {
    void load();
    // back from the background (iOS keeps the Mini App frozen): the passes may have changed meanwhile
    const onShow = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [load]);
  return { data, load };
}

/** card colour by boss order: grey for the first, climbing like loot rarity, red for the last */
const CARD_TIER = ["#a3aab4", "#7fc96a", "#4fd08a", "#3fd6c4", "#3fb4e6", "#4a9dff", "#6f7dff", "#8f6bff", "#b45cff", "#e05cd6", "#ff9a2e", "#ffcc33", "#ff3b3b"];
const tierColor = (order: number) => CARD_TIER[Math.min(CARD_TIER.length, Math.max(1, order)) - 1];

export function BossesScreen() {
  const { state } = useGame();
  const router = useRouter();
  const now = useNow();
  const { data, load } = useBossList();
  useEffect(() => {
    void load();
  }, [state?.fight?.id, state?.pending.length, load]);
  return (
    <div>
      <div className="title">
        <div className="title-row">
          <h1 className="display">Боссы</h1>
          <BossRulesHelp topic="bosses" />
        </div>
        {data && <span className="small muted">Лимиты обновятся через {clock(data.resetAt - now)}</span>}
      </div>
      <div className="col" style={{ gap: 12 }}>
        {bossesIn(data?.bosses.map((x) => x.id) ?? state?.openBosses).map((b) => {
          const row = data?.bosses.find((x) => x.id === b.id);
          const prev = BOSSES.find((x) => x.order === b.order - 1);
          const mine = state?.fight?.bossId === b.id ? state.fight : null;
          // until the list has loaded nothing is locked or grey (a slow or failed request on the phone used to grey every boss)
          const locked = row ? !row.unlocked : false;
          // grey only for a boss never touched: no passes for him yet and never fought; with some passes he stays in colour
          const grey = !!row && locked && row.keysHave <= 0 && row.myDamage <= 0 && row.myWins <= 0;
          const hpMax = mine ? mine.hpMax : row?.hpMax ?? b.hp;
          const hp = mine ? mine.hp : hpMax;
          const dazed = !!mine && hp / Math.max(1, hpMax) < 0.5;
          return (
            <Link key={b.id} href={`/bosses/${b.id}`} className={`bcard ${grey ? "locked" : ""} ${b.final ? "final" : ""} ${mine ? "live" : ""} ${dazed ? "dazed" : ""}`}
              style={{ ["--i" as string]: b.order, ["--acc" as string]: tierColor(b.order) }}>
              {/* the case number over the boss: «Дело №1», «Дело №2»… (his health is a surprise — not shown in the list) */}
              <span className="bcard-n display">Дело №{b.order}</span>
              {/* the boss stands on the left and fades into the card */}
              <div className="bcard-art" aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {/* the live rig cut to the head and shoulders: the face blinks, looks around and frowns like in the fight */}
                {hasBossRig(b.id) ? <BossRig id={b.id} bust hpShare={mine ? hp / Math.max(1, hpMax) : 1} />
                  : (b.photo.card ?? b.photo.full) ? <img src={(b.photo.card ?? b.photo.full)!} alt="" draggable={false} /> : <div className="bcard-sil"><BossSilhouette accent={tierColor(b.order)} /></div>}
              </div>
              <div className="bcard-main">
                <div className="bcard-head">
                  <div className="col" style={{ gap: 1, minWidth: 0 }}>
                    <b className="bcard-name display ellipsis">{b.name}</b>
                    <span className="bcard-title ellipsis">{grey ? `Откроется пропусками «${prev?.name}»` : locked ? `Нужны пропуски «${prev?.name}»` : b.title}</span>
                  </div>
                  {mine ? (
                    <span className="bcard-pill live"><i className="live-dot" />{clock(mine.endsAt - now)}</span>
                  ) : !!row?.fightingNow && !locked ? (
                    <span className="bcard-pill" title="Сейчас бьют">⚔ {row.fightingNow}</span>
                  ) : null}
                </div>
                <div className="bcard-reward">
                  <span className="bcard-label">{b.final ? "Финал:" : "Награда:"}</span>
                  <GainLine r={{ ...b.reward, items: [...(b.final ? [] : [{ id: `key-${b.id}`, qty: 1 }]), ...(b.reward.items ?? [])] }} size={18} />
                  {(!!b.drop?.length || !!b.wear) && <MysteryDrop size={18} count={bossItemsCount(b, state) ?? undefined} />}
                </div>
                <div className="bcard-foot">
                  {locked ? (
                    <span className="bcard-meta">{prev && <ItemArt id={`key-${prev.id}`} size={22} />} {row?.keysHave ?? 0}/{row?.keysNeed ?? 3} {(row?.keysNeed ?? 3) === 1 ? "пропуск" : "пропуска"}</span>
                  ) : (
                    <span className="bcard-meta stack" title="Боёв сегодня из дневного лимита · побед над этим боссом за всё время">
                      <span>Сегодня <b className="num">{row?.fightsToday ?? 0}/{row?.fightsPerDay ?? 7}</b></span>
                      <span>Побед <b className="num">{row?.myWins ?? 0}</b></span>
                    </span>
                  )}
                  <span className="bcard-act">
                    {/* who finished this boss last: a small avatar left of the button → their profile */}
                    {row?.lastKiller && !grey && (
                      <span className="bcard-killer" role="link" tabIndex={0} title={`Последним добил: ${row.lastKiller.name}`} aria-label={`Последним добил: ${row.lastKiller.name}`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          router.push(`/profile?id=${row.lastKiller!.id}`);
                        }}>
                        <span className="bcard-killer-label">добил</span>
                        <Avatar name={row.lastKiller.name} photo={row.lastKiller.photo} size={26} />
                      </span>
                    )}
                    <span className={`bcard-cta display ${locked ? "off" : ""}`}>{!row ? <>…</> : locked ? <><Icon name="lock" size={14} /> Нет карт</> : mine ? <>Бить ›</> : <>В бой ›</>}</span>
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/** a picture for the help rows */
const helpImg = (src: string) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img src={src} alt="" width={44} height={44} style={{ objectFit: "contain", flex: "none" }} draggable={false} />
);

/**
 * The rules of boss fights behind a [?]. In the boss list — the whole guide with pictures: how to get in, what to hit
 * with, what a win gives and what for, what may drop. At a boss — what can be won from him: secret «?» things
 * (the ones already opened are shown by name).
 */
export function BossRulesHelp({ topic, bossId }: { topic: "bosses" | "boss"; bossId?: string }) {
  const { state } = useGame();
  const boss = bossId ? bossById(bossId) : null;
  return (
    <Help topic={topic} title={boss ? `Босс ${boss.name}` : "Как бить боссов"}>
      <p><b>Режимы боя:</b> {FIGHT_MODES.map((m) => `«${m.name}» — здоровье ×${m.hp}, медаль «${MEDAL_NAMES[m.medal]}»${m.things ? ", падают вещи босса" : ""}`).join("; ")}. Вещи босса (одежда, комнаты) выпадают только в «Блатном»; деньги, пропуска и расходники — в любом режиме.</p>
      <p><b>Медали:</b> каждая победа (от того же урона, что и пропуск) даёт медаль с лицом босса. Каждая медаль сразу усиливает оружие босса{boss ? ` (у ${boss.name} — «${itemById(medalWeapon(boss))?.name}»: +${medalStep(boss, "bronze")} / +${medalStep(boss, "silver")} / +${medalStep(boss, "gold")} за медаль бронзы, серебра и золота; полный набор из ${MEDAL_SET} — +${medalBonus(boss, "bronze")} / +${medalBonus(boss, "silver")} / +${medalBonus(boss, "gold")})` : ""}. Медали — в достижениях.</p>
      {boss ? (
        <>
          {boss.wear?.items.length ? (
            <HelpList title={`Вещи с босса: открыто ${bossItemsCount(boss, state)}`} rows={boss.wear.items.map((id, i) => {
              const open = !!state?.unlocks?.includes(id) || (state?.inventory.find((x) => x.id === id)?.qty ?? 0) > 0;
              return open
                ? { key: id, icon: <ItemArt id={id} size={40} />, name: itemById(id)?.name ?? id, hint: "Уже выпала — открыта в магазине одежды, там её можно выкупить." }
                : { key: `s${i}`, icon: <MysteryDrop size={36} />, name: "Секретная вещь", hint: "Какая — пока секрет. Выпадет — откроется в магазине, и её нужно будет выкупить." };
            })} />
          ) : (
            <p className="small muted">С босса {boss.name} вещи не выпадают.</p>
          )}
          {!!boss.drop?.length && (
            <HelpList title="Ещё может выпасть" rows={[{ key: "w", icon: <MysteryDrop size={36} />, name: "Оружие", hint: "Иногда после победы падает оружие — сразу в инвентарь. Какое — секрет." }]} />
          )}
          <p className="tiny muted" style={{ marginTop: 0 }}>Шанс — секрет. Вещь выпадает, если нанёс в бою хотя бы 1% здоровья босса. Не везёт {boss.wear?.pity ?? 10} побед подряд — вещь откроется точно.</p>
        </>
      ) : (
        <>
          <HelpList title="Как напасть на босса" rows={[
            { key: "door", icon: helpImg("/assets/ui/help-door.webp"), name: "Дверь", hint: "Нажми на босса в списке — откроется комната с дверью. Через окно видно босса, на двери — награда. Нажми на дверь, чтобы войти в бой." },
            { key: "pass", icon: <ItemArt id="key-datsik" size={44} />, name: "Пропуски", hint: "Каждый босс, кроме первого, закрыт. Вход в бой стоит пропусков предыдущего босса: до Гаркуши включительно — 3, а дальше, начиная с Мугонатора, — всего 1 за бой. Они тратятся при старте боя; если босс ушёл или ты сбежал — пропуски вернутся." },
            { key: "solo", icon: <Icon name="swords" size={40} />, name: "Соло", hint: "Бой в одиночку: HP босса снимают только твои удары. За соло-победы — отдельное достижение." },
            { key: "time", icon: <Icon name="clock" size={40} />, name: "8 часов и 7 побед", hint: "Бой длится 8 часов. Каждого босса можно победить 7 раз в день, проигранные бои не считаются." },
          ]} />
          <HelpList title="Чем бить" rows={WEAPONS.map((w) => ({
            key: w.id, icon: <ItemArt id={w.id} size={44} />, name: (() => { const st = weaponStats(state, w.id); return st.damage !== st.base ? `${w.name} — урон ${st.damage} (база ${st.base})` : `${w.name} — урон ${st.base}`; })(),
            hint: w.weapon!.kind === "permanent" ? `Бесплатно, раз в ${Math.round((w.weapon!.cooldownMin ?? 0) / 60)} ч. Есть у всех.` : "Тратится за удар. Магазин, двор, задания и дроп с боссов.",
          }))} />
          <HelpList title="Что даёт победа" rows={[
            { key: "pass", icon: <ItemArt id="key-kedr" size={44} />, name: "Пропуск босса", hint: "От 1% урона (у Дацкоу — за любой свой удар в выигранном бою). Вход в бой со следующим боссом. С шансом 10% выпадает сразу два." },
            { key: "cur", icon: <Icon name="RUB" size={40} />, name: "Рубли и доллары", hint: "Покупки в магазине, обменник, оборудование и комнаты дома. Чем сильнее босс, тем больше денег." },
            { key: "xp", icon: <Icon name="xp" size={40} />, name: "Авторитет", hint: "Опыт: растёт уровень, место в рейтинге и достижения." },
            { key: "statue", icon: <ItemArt id="statue-close" size={44} />, name: "Трофеи", hint: "За некоторых боссов — особые награды. Статуэтка CLOSE за Утилизатора встаёт на стол и даёт +25% к силе крита." },
          ]} />
          <p className="tiny muted" style={{ marginTop: 0 }}>Полная награда — если нанёс хотя бы 2% здоровья босса, меньше — пропорционально. Без урона награды нет.</p>
          <HelpList title="Что может выпасть" rows={[
            { key: "things", icon: <MysteryDrop size={36} />, name: "Вещи — «?» x/N", hint: "У каждого босса свои вещи, у некоторых их нет. Какие — секрет. Выпавшая вещь не приходит сразу: она открывается в магазине, и её нужно выкупить." },
            { key: "weapon", icon: <ItemArt id="keyboard" size={44} />, name: "Оружие", hint: "Иногда падает оружие — сразу в инвентарь." },
            { key: "shop", icon: <span className="locked-art"><ItemArt id="hoodie-hodl" size={44} /><span className="locked-badge"><Icon name="lock" size={14} /></span></span>, name: "Закрытые вещи в магазине", hint: "Вещи с замком ещё не выпали. Нажми на такую — увидишь, с какого босса она падает." },
          ]} />
          <HelpList title="Что дают вещи" rows={[
            { key: "wear", icon: <ItemArt id="tee-white" size={44} />, name: "Одежда", hint: "Внешний вид персонажа: видно в комнате, в профиле и другим игрокам. Надевается в гардеробе." },
            { key: "trophy", icon: <ItemArt id="statue-close" size={44} />, name: "Трофеи", hint: "Сами встают в комнату и дают бонус к бою." },
            { key: "weap", icon: <ItemArt id="gpu" size={44} />, name: "Оружие", hint: "Чем сильнее оружие, тем быстрее падает босс и тем больше твоя доля награды." },
          ]} />
        </>
      )}
      {!boss && <ul>
        <li>Бой у каждого свой и длится 8 часов. Не успел — босс уходит, бой проигран.</li>
        <li>Урон общий на всю игру: удары всех игроков по любому боссу снимают HP и в твоём бою. В режиме «Соло» считается только твой урон.</li>
        <li>Кнопка «Соло» — бой в одиночку: HP босса снимают только твои удары. Соло-победы дают отдельное достижение «Соло».</li>
        <li>Бьют только оружием. Кулак, мышь и красная свеча — бесплатно, раз в 5 часов; в каждом новом бою и когда босс ушёл они снова готовы (после побега — нет). Остальное оружие тратится.</li>
        <li>Награда за победу зависит от твоего урона в этом бою: полная — если нанёс хотя бы 2% здоровья босса, меньше — пропорционально. Без урона награды нет.</li>
        <li>Пропуск босса даётся от 1% его здоровья, а пропуск Дацкоу — за любой свой удар в выигранном бою. Пропуски открывают следующего босса: бронзовые, серебряные, золотые и платиновые — по 3 штуки, бриллиантовые (для Фокуса и Солнца) — по одному.</li>
        <li>За Утилизатора дают статуэтку CLOSE: она сама встаёт на стол в комнате и даёт +25% к силе крита.</li>
        <li>В день можно победить каждого босса 7 раз. Проигранные бои в лимит не идут.</li>
        <li>Оборудование и комнаты дома дают шанс крита и прибавку к урону.</li>
      </ul>}
    </Help>
  );
}

export function BossRewardsPanel({ bossId }: { bossId: string }) {
  const b = bossById(bossId)!;
  return (
    <div className="col">
      <div className="small muted">За каждую победу:</div>
      <RewardChips r={{ ...b.reward, items: [...(b.final ? [] : [{ id: `key-${b.id}`, qty: 1 }]), ...(b.reward.items ?? [])] }} />
      {/* what can drop is a secret: just a «?» */}
      {(!!b.drop?.length || !!b.wear) && (
        <div className="row small muted" style={{ gap: 6 }}><MysteryDrop size={20} /> и шанс выбить что-то ещё</div>
      )}
    </div>
  );
}
