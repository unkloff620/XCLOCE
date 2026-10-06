"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useGame } from "../store.tsx";
import { api, type FightView, type Granted } from "../api.ts";
import { KEY_SHARE, bossById, rewardShare } from "../../content/bosses.ts";
import { scaleReward } from "../../content/rewards.ts";
import { ESCAPE_LINES } from "../../content/phrases.ts";
import { Modal, RewardChips } from "../ui.tsx";
import { ItemArt } from "../art/items.tsx";
import { itemById } from "../../content/items.ts";
import { BossPhoto } from "./boss-parts.tsx";
import { full, pct } from "../format.ts";
import { haptic } from "../telegram.ts";

/** Victory / defeat window for finished fights the player has not seen yet. Shows on any screen. */
export function ResultWindow() {
  const { state, act, busy } = useGame();
  const next = state?.pending[0] ?? null;
  const [active, setActive] = useState<{ fightId: number; status: string } | null>(null);
  const [view, setView] = useState<FightView | null>(null);
  const [got, setGot] = useState<Granted | null>(null);

  useEffect(() => {
    if (!active && next) setActive(next);
  }, [next, active]);

  useEffect(() => {
    setView(null);
    setGot(null);
    if (!active) return;
    let alive = true;
    api.get<{ fight: FightView }>(`/api/live?fight=${active.fightId}&since=0`).then((r) => alive && setView(r.fight)).catch(() => alive && setActive(null));
    if (active.status === "won") haptic.ok();
    return () => {
      alive = false;
    };
  }, [active]);

  if (!active || !view) return null;
  const boss = bossById(view.bossId)!;
  const won = view.status === "won";
  // the reward follows my part of the fight: full from 2% of the boss HP, the card from 1%
  const share = rewardShare(view.myDamage, view.hpMax);
  const keyOk = view.myDamage >= view.hpMax * KEY_SHARE;
  const done = () => setActive(null);
  const claim = async () => {
    const r = await act<{ status: string; reward: Granted | null }>("fight_claim", { fightId: view.fightId });
    if (r?.reward && won) setGot(r.reward);
    else done();
  };
  // the cross works like the main button: a lost fight is marked as seen (or the window comes back at once),
  // a won one takes the reward first so it is not lost
  const close = () => {
    if (got) done();
    else if (busy !== "fight_claim") claim();
  };

  return (
    <Modal onClose={close}>
      <div className="center col" style={{ alignItems: "center", gap: 10 }}>
        <div className={`display result-title ${won ? "win" : "lose"}`}>{won ? "BOSS DEFEATED" : "БОСС УШЁЛ"}</div>
        <div style={{ width: 150, height: 150 }}>
          <BossPhoto boss={boss} round defeated={won} />
        </div>
        <div className="display" style={{ fontSize: 20 }}>{boss.name}</div>
        {won ? (
          <div className="muted">
            Последний удар: <b style={{ color: "var(--ink)" }}>{view.killerIsMe ? "ты" : view.killer}</b>
          </div>
        ) : (
          <div className="muted">{ESCAPE_LINES[view.fightId % ESCAPE_LINES.length]} 8 часов прошли, пропуска нет.</div>
        )}
        <div className="panel" style={{ width: "100%", padding: 10 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="muted">Мой урон</span>
            <b className="num">{full(view.myDamage)} ({pct(view.myDamage, view.hpMax).toFixed(1)}%)</b>
          </div>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="muted">Моих ударов</span>
            <b className="num">{view.myHits}</b>
          </div>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="muted">Участников</span>
            <b className="num">{view.top.length}</b>
          </div>
        </div>
        {view.top.length > 0 && (
          <div className="panel" style={{ width: "100%", padding: 10, textAlign: "left" }}>
            <div className="small muted" style={{ marginBottom: 6 }}>ТОП ПО УРОНУ</div>
            {view.top.slice(0, 5).map((t, i) => (
              <div key={t.playerId} className="row" style={{ justifyContent: "space-between", padding: "2px 0" }}>
                <span className="ellipsis">{i + 1}. {t.name}</span>
                <b className="num">{full(t.damage)}</b>
              </div>
            ))}
          </div>
        )}
        {won && !got && (
          <>
            <div className={`share-note ${share >= 1 ? "full" : ""}`}>
              {share >= 1 ? "Полная награда — твой вклад засчитан" : share > 0 ? `Награда ${Math.round(share * 100)}%: для полной нужно ${full(Math.ceil(view.hpMax * 0.02))} урона в бою` : "Ты не нанёс урона в этом бою — награды нет"}
              {share > 0 && !keyOk && !boss.final && <div className="tiny">Пропуск — от {full(Math.ceil(view.hpMax * KEY_SHARE))} урона</div>}
            </div>
            <RewardChips r={{ ...scaleReward(boss.reward, share), items: [...(boss.final || !keyOk ? [] : [{ id: `key-${boss.id}`, qty: 1 }]), ...(share >= 1 ? boss.reward.items ?? [] : [])] }} />
            <button className="btn gold big block" disabled={busy === "fight_claim"} onClick={claim}>Забрать награду</button>
          </>
        )}
        {got && (
          <>
            <div className="small muted">Получено:</div>
            <RewardChips r={got} />
            {!!got.unlocks?.length && (
              <div className="unlock-note">
                <b className="small">Выпало! Открыто в магазине:</b>
                <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                  {got.unlocks.map((id) => <span key={id} className="chip"><ItemArt id={id} size={24} /> {itemById(id)?.name ?? id}</span>)}
                </div>
                <Link href="/shop?tab=clothing" className="btn gold sm" onClick={done}>Выкупить в магазине</Link>
              </div>
            )}
            {got.levelUp && <div className="chip violet">Новый уровень: {got.levelUp.to}!</div>}
            <div className="row" style={{ width: "100%" }}>
              <Link href={`/bosses/${boss.id}`} className="btn dark grow" onClick={done}>К боссу</Link>
              <button className="btn green grow" onClick={done}>Отлично</button>
            </div>
          </>
        )}
        {!won && <button className="btn dark block" disabled={busy === "fight_claim"} onClick={claim}>Понятно</button>}
      </div>
    </Modal>
  );
}
