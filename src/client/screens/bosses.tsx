"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useGame, useNow } from "../store.tsx";
import { api, type Tray } from "../api.ts";
import { BOSSES, bossById } from "../../content/bosses.ts";
import { BossPhoto } from "./boss-parts.tsx";
import { Avatar, Bar, RewardChips } from "../ui.tsx";
import type { BossDef } from "../../content/bosses.ts";
import { Help } from "../help.tsx";
import { Icon } from "../art/icons.tsx";
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
function hpLabel(hp: number, max: number): string {
  const f = max >= 100_000 ? short : full;
  return `${f(hp)}/${f(max)}`;
}

export function BossesScreen() {
  const { state } = useGame();
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
      <div className="col" style={{ gap: 10 }}>
        {BOSSES.map((b) => {
          const row = data?.bosses.find((x) => x.id === b.id);
          const prev = BOSSES.find((x) => x.order === b.order - 1);
          const mine = state?.fight?.bossId === b.id ? state.fight : null;
          const locked = row ? !row.unlocked : b.order > 1;
          return (
            <Link key={b.id} href={`/bosses/${b.id}`} className={`boss-row ${locked ? "locked" : ""} ${b.final ? "final" : ""} ${mine ? "live" : ""}`} style={{ ["--acc" as string]: b.theme.accent }}>
              <div className="boss-left">
                <div className="boss-row-photo">
                  <BossPhoto boss={b} round locked={locked} />
                  <span className="boss-n display">{b.order}</span>
                </div>
                <Bar value={mine ? mine.hp : 1} max={mine ? mine.hpMax : 1} tone="red" height={18}
                  label={hpLabel(mine ? mine.hp : row?.hpMax ?? b.hp, mine ? mine.hpMax : row?.hpMax ?? b.hp)} />
              </div>
              <div className="grow col" style={{ gap: 5, minWidth: 0 }}>
                <div className="row" style={{ justifyContent: "space-between", gap: 6 }}>
                  <b className="display boss-name ellipsis">{b.name}</b>
                  {b.final && <span className="chip gold">ФИНАЛ</span>}
                </div>
                <div className="small muted ellipsis">{b.title}</div>
                {mine ? (
                  <div className="row small" style={{ flexWrap: "wrap", gap: 6 }}><span className="chip gold"><Icon name="clock" size={14} />{clock(mine.endsAt - now)}</span><span className="muted">идёт бой</span></div>
                ) : locked ? (
                  <div className="row small" style={{ flexWrap: "wrap", gap: 6 }}>
                    <span className="chip"><Icon name="key" size={14} />{row?.keysHave ?? 0}/{row?.keysNeed ?? 3}</span>
                    <span className="muted">{(row?.keysNeed ?? 3) === 1 ? "ключ" : "ключа"} «{prev?.name}»</span>
                  </div>
                ) : (
                  <div className="row small" style={{ flexWrap: "wrap", gap: 6 }}>
                    <span className="chip">Победы {row?.fightsToday ?? 0}/{row?.fightsPerDay ?? 7}</span>
                    {!!row?.myWins && <span className="chip green"><Icon name="trophy" size={14} />{row.myWins}</span>}
                    {!!row?.fightingNow && <span className="chip red">бьют: {row.fightingNow}</span>}
                  </div>
                )}
                <BossRewardLine boss={b} />
                {row?.lastKiller && (
                  <span className="last-killer tiny" title="Последним добил">
                    <Avatar name={row.lastKiller.name} photo={row.lastKiller.photo} size={16} />
                    <span className="ellipsis">добил {row.lastKiller.name}</span>
                  </span>
                )}
              </div>
              <span className="boss-go display">›</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/** The rules of boss fights behind a [?]. */
export function BossRulesHelp({ topic }: { topic: "bosses" | "boss" }) {
  return (
    <Help topic={topic} title="Как бить боссов">
      <ul>
        <li>Бой у каждого свой и длится 8 часов. Не успел — босс уходит, бой проигран.</li>
        <li>Урон общий: удары всех, кто сейчас бьёт этого босса, снимают HP и в твоём бою.</li>
        <li>Бьют только оружием. Мышь — бесплатно раз в час, остальное оружие тратится.</li>
        <li>Победа даёт награду и ключ. Ключи открывают следующего босса (для Фокуса и Солнца хватает одного).</li>
        <li>В день можно победить каждого босса 7 раз. Проигранные бои в лимит не идут.</li>
        <li>Оборудование и комнаты дома дают шанс крита и прибавку к урону.</li>
      </ul>
    </Help>
  );
}

/** Compact reward line on the boss card. */
function BossRewardLine({ boss }: { boss: BossDef }) {
  return (
    <div className="boss-reward">
      <RewardChips r={{ ...boss.reward, items: [...(boss.final ? [] : [{ id: `key-${boss.id}`, qty: 1 }]), ...(boss.reward.items ?? [])] }} size={13} />
    </div>
  );
}

export function BossRewardsPanel({ bossId }: { bossId: string }) {
  const b = bossById(bossId)!;
  return (
    <div className="col">
      <div className="small muted">За каждую победу:</div>
      <RewardChips r={{ ...b.reward, items: [...(b.final ? [] : [{ id: `key-${b.id}`, qty: 1 }]), ...(b.reward.items ?? [])] }} />
      {!!b.drop?.length && (
        <>
          <div className="small muted">Возможный дроп:</div>
          <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
            {b.drop.map((d) => (
              <span key={d.id} className="chip">
                <RewardChips r={{ items: [{ id: d.id, qty: d.qty }] }} size={16} /> {Math.round(d.chance * 100)}%
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
