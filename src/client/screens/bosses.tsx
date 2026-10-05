"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useGame, useNow } from "../store.tsx";
import { api, type Tray } from "../api.ts";
import { BOSSES, bossById } from "../../content/bosses.ts";
import { Avatar, GainLine, MysteryDrop, RewardChips } from "../ui.tsx";
import type { BossDef } from "../../content/bosses.ts";
import { Help, HelpList } from "../help.tsx";
import { itemById } from "../../content/items.ts";
import { Icon } from "../art/icons.tsx";
import { ItemArt } from "../art/items.tsx";
import { BossSilhouette } from "../art/scenes.tsx";
import { clock, full, short } from "../format.ts";

export interface BossRow {
  id: string; unlocked: boolean; keysHave: number; keysNeed: number; myKeys: number; hpMax: number;
  fightsToday: number; fightsPerDay: number; myDamage: number; myWins: number; fightingNow: number; totalWins: number;
  lastKiller: { id: number; name: string; photo: string | null; at: number } | null;
}
export interface BossListData { resetAt: number; bosses: BossRow[]; weapons: Tray[]; now: number }

export function useBossList() {
  const [data, setData] = useState<BossListData | null>(null);
  const load = useCallback(async () => {
    try {
      setData(await api.get<BossListData>("/api/bosses"));
    } catch {
      /* keep the last list */
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, load };
}

/** HP under the boss photo: full numbers while they fit, short ones for the big bosses. */
/** card colour by boss order: grey for the first, climbing like loot rarity, red for the last */
const CARD_TIER = ["#a3aab4", "#7fc96a", "#4fd08a", "#3fd6c4", "#3fb4e6", "#4a9dff", "#6f7dff", "#8f6bff", "#b45cff", "#e05cd6", "#ff9a2e", "#ffcc33", "#ff3b3b"];
const tierColor = (order: number) => CARD_TIER[Math.min(CARD_TIER.length, Math.max(1, order)) - 1];

function hpLabel(hp: number, max: number): string {
  const f = max >= 100_000 ? short : full;
  return `${f(hp)}/${f(max)}`;
}

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
        {BOSSES.map((b) => {
          const row = data?.bosses.find((x) => x.id === b.id);
          const prev = BOSSES.find((x) => x.order === b.order - 1);
          const mine = state?.fight?.bossId === b.id ? state.fight : null;
          const locked = row ? !row.unlocked : b.order > 1;
          const hpMax = mine ? mine.hpMax : row?.hpMax ?? b.hp;
          const hp = mine ? mine.hp : hpMax;
          return (
            <Link key={b.id} href={`/bosses/${b.id}`} className={`bcard ${locked ? "locked" : ""} ${b.final ? "final" : ""} ${mine ? "live" : ""}`}
              style={{ ["--i" as string]: b.order, ["--acc" as string]: tierColor(b.order), ["--hp" as string]: `${Math.round((hp / Math.max(1, hpMax)) * 100)}%` }}>
              {/* the boss stands on the left and fades into the card */}
              <div className="bcard-art" aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {(b.photo.card ?? b.photo.full) && !locked ? <img src={(b.photo.card ?? b.photo.full)!} alt="" draggable={false} /> : <div className="bcard-sil"><BossSilhouette accent={tierColor(b.order)} /></div>}
              </div>
              {/* who finished this boss last: a framed avatar at the bottom of the picture → their profile */}
              {row?.lastKiller && !locked && (
                <span className="bcard-killer" role="link" tabIndex={0} title={`Последним добил: ${row.lastKiller.name}`} aria-label={`Последним добил: ${row.lastKiller.name}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    router.push(`/profile?id=${row.lastKiller!.id}`);
                  }}>
                  <span className="bcard-killer-label">добил</span>
                  <Avatar name={row.lastKiller.name} photo={row.lastKiller.photo} size={30} />
                </span>
              )}
              <span className="bcard-n display">{b.order}</span>
              <div className="bcard-main">
                <div className="bcard-head">
                  <div className="col" style={{ gap: 1, minWidth: 0 }}>
                    <b className="bcard-name display ellipsis">{locked ? "???" : b.name}</b>
                    <span className="bcard-title ellipsis">{locked ? `Откроется пропусками «${prev?.name}»` : b.title}</span>
                  </div>
                  {mine ? (
                    <span className="bcard-pill live"><i className="live-dot" />{clock(mine.endsAt - now)}</span>
                  ) : !!row?.fightingNow && !locked ? (
                    <span className="bcard-pill" title="Сейчас бьют">⚔ {row.fightingNow}</span>
                  ) : null}
                </div>
                {!locked && (
                  <div className="bcard-hp">
                    <div className="bcard-hpbar"><i /></div>
                    <div className="bcard-hpnums num"><span>{hpLabel(hp, hpMax)} HP</span><b>{Math.round((hp / Math.max(1, hpMax)) * 100)}%</b></div>
                  </div>
                )}
                <div className="bcard-reward">
                  <span className="bcard-label">{b.final ? "Финал:" : "Награда:"}</span>
                  <GainLine r={{ ...b.reward, items: [...(b.final ? [] : [{ id: `key-${b.id}`, qty: 1 }]), ...(b.reward.items ?? [])] }} size={18} />
                  {(!!b.drop?.length || !!b.wear) && <MysteryDrop size={18} />}
                </div>
                <div className="bcard-foot">
                  {locked ? (
                    <span className="bcard-meta">{prev && <ItemArt id={`key-${prev.id}`} size={22} />} {row?.keysHave ?? 0}/{row?.keysNeed ?? 3} {(row?.keysNeed ?? 3) === 1 ? "пропуск" : "пропуска"}</span>
                  ) : (
                    <span className="bcard-meta" title="Победы сегодня"><Icon name="swords" size={14} /> Побед <b className="num">{row?.fightsToday ?? 0}/{row?.fightsPerDay ?? 7}</b></span>
                  )}
                  <span className={`bcard-cta display ${locked ? "off" : ""}`}>{locked ? <><Icon name="lock" size={14} /> Закрыт</> : mine ? <>Бить ›</> : <>В бой ›</>}</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/** Everything that can fall from a boss besides the win reward (weapons, clothes) — no chances, those are a secret. */
function dropsOf(b: BossDef): string[] {
  return [...new Set([...(b.drop ?? []).map((d) => d.id), ...(b.wear?.items ?? [])])];
}
function dropHint(id: string): string {
  const it = itemById(id);
  if (!it) return "";
  if (it.weapon) return `Оружие · урон ${it.weapon.damage}${it.weapon.kind === "consumable" ? " · тратится за удар" : ""}`;
  if (it.category === "clothing") return `Одежда · ${it.description}`;
  return it.description;
}

/** The rules of boss fights behind a [?]; on a boss's screen also what can fall from him, in the list — from every boss. */
export function BossRulesHelp({ topic, bossId }: { topic: "bosses" | "boss"; bossId?: string }) {
  const boss = bossId ? bossById(bossId) : null;
  const drops = boss ? dropsOf(boss) : [];
  return (
    <Help topic={topic} title="Как бить боссов">
      {boss && (
        drops.length ? (
          <HelpList title={`Что может выпасть с босса ${boss.name}`} rows={drops.map((id) => ({ key: id, icon: <ItemArt id={id} size={40} />, name: itemById(id)?.name ?? id, hint: dropHint(id) }))} />
        ) : (
          <p className="small muted">С босса {boss.name} вещи не падают — только награда за победу.</p>
        )
      )}
      {boss && <p className="tiny muted" style={{ marginTop: 0 }}>У каждого босса свой дроп. Шанс — секрет, на двери он спрятан за «?». Вещь может выпасть, если нанёс в бою хотя бы 1% здоровья босса.</p>}
      {!boss && (
        <HelpList title="Что падает с боссов" rows={BOSSES.map((b) => {
          const d = dropsOf(b);
          return {
            key: b.id,
            icon: <span className="help-drops">{d.length ? d.map((id) => <ItemArt key={id} id={id} size={26} />) : <span className="tiny muted">—</span>}</span>,
            name: `${b.order}. ${b.name}`,
            hint: d.length ? d.map((id) => itemById(id)?.name ?? id).join(", ") : "ничего не падает, только награда",
          };
        })} />
      )}
      <ul>
        <li>Бой у каждого свой и длится 8 часов. Не успел — босс уходит, бой проигран.</li>
        <li>Урон общий: удары всех, кто сейчас бьёт этого босса, снимают HP и в твоём бою.</li>
        <li>Кнопка «Соло» — бой в одиночку: HP босса снимают только твои удары. Соло-победы дают отдельное достижение «Соло».</li>
        <li>Бьют только оружием. Кулак — бесплатно раз в час, остальное оружие тратится.</li>
        <li>Награда за победу зависит от твоего урона в этом бою: полная — если нанёс хотя бы 2% здоровья босса, меньше — пропорционально. Без урона награды нет.</li>
        <li>Пропуск босса даётся от 1% его здоровья. Пропуски открывают следующего босса: бронзовые, серебряные, золотые и платиновые — по 3 штуки, бриллиантовые (для Фокуса и Солнца) — по одному.</li>
        <li>За Утилизатора дают статуэтку CLOSE: она сама встаёт на стол в комнате и даёт +25% к силе крита.</li>
        <li>В день можно победить каждого босса 7 раз. Проигранные бои в лимит не идут.</li>
        <li>Оборудование и комнаты дома дают шанс крита и прибавку к урону.</li>
      </ul>
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
