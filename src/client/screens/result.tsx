"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useGame } from "../store.tsx";
import { api, type FightView, type Granted } from "../api.ts";
import { KEY_SHARE, bossById, rewardShare } from "../../content/bosses.ts";
import { scaleReward } from "../../content/rewards.ts";
import { ESCAPE_LINES } from "../../content/phrases.ts";
import { GainLine, Modal } from "../ui.tsx";
import { ItemArt } from "../art/items.tsx";
import { roomById } from "../../content/home.ts";
import { ROOM_BACKDROP } from "../../content/home-scene.ts";
import { itemById } from "../../content/items.ts";
import { BossPhoto } from "./boss-parts.tsx";
import { full, pct } from "../format.ts";
import { haptic } from "../telegram.ts";

/**
 * Victory / defeat window for finished fights the player has not seen yet. Shows on any screen.
 * Victory: a big picture of the beaten boss, the rewards under it (taken at once, so a dropped room can be shown),
 * a room that dropped glows, the top by damage, one «Забрать» button → back to the boss list.
 */
export function ResultWindow() {
  const { state, act, busy } = useGame();
  const router = useRouter();
  const next = state?.pending[0] ?? null;
  const [active, setActive] = useState<{ fightId: number; status: string } | null>(null);
  const [view, setView] = useState<FightView | null>(null);
  const [got, setGot] = useState<Granted | null>(null);
  const claimed = useRef<number | null>(null);

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

  // a won fight: the reward is taken as soon as the window shows — what really dropped (a room!) is shown at once
  useEffect(() => {
    if (!view || view.status !== "won" || claimed.current === view.fightId) return;
    claimed.current = view.fightId;
    void act<{ status: string; reward: Granted | null }>("fight_claim", { fightId: view.fightId }).then((r) => {
      if (r?.reward) setGot(r.reward);
      else claimed.current = null;
    });
  }, [view, act]);

  if (!active || !view) return null;
  const boss = bossById(view.bossId)!;
  const won = view.status === "won";
  const done = () => setActive(null);

  if (!won) {
    const seen = async () => {
      await act("fight_claim", { fightId: view.fightId });
      done();
    };
    return (
      <Modal onClose={() => busy !== "fight_claim" && seen()}>
        <div className="center col" style={{ alignItems: "center", gap: 10 }}>
          <div className="display result-title lose">БОСС УШЁЛ</div>
          <div style={{ width: 150, height: 150 }}>
            <BossPhoto boss={boss} round />
          </div>
          <div className="display" style={{ fontSize: 20 }}>{boss.name}</div>
          <div className="muted">{ESCAPE_LINES[view.fightId % ESCAPE_LINES.length]} 8 часов прошли, пропуска нет.</div>
          <div className="panel" style={{ width: "100%", padding: 10 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="muted">Мой урон</span>
              <b className="num">{full(view.myDamage)} ({pct(view.myDamage, view.hpMax).toFixed(1)}%)</b>
            </div>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="muted">Моих ударов</span>
              <b className="num">{view.myHits}</b>
            </div>
          </div>
          <button className="btn dark block" disabled={busy === "fight_claim"} onClick={seen}>Понятно</button>
        </div>
      </Modal>
    );
  }

  // until the claim answers: the reward this fight earns (my part of it), the same numbers
  const share = rewardShare(view.myDamage, view.hpMax);
  const keyOk = view.myDamage >= view.hpMax * KEY_SHARE;
  const preview = { ...scaleReward(boss.reward, share), items: [...(boss.final || !keyOk ? [] : [{ id: `key-${boss.id}`, qty: 1 }]), ...(share >= 1 ? boss.reward.items ?? [] : [])] };
  const unlocks = got?.unlocks ?? [];
  const rooms = unlocks.filter((id) => id.startsWith("room:")).map((id) => id.slice(5));
  const things = unlocks.filter((id) => !id.startsWith("room:"));
  const take = async () => {
    if (!got) {
      const r = await act<{ status: string; reward: Granted | null }>("fight_claim", { fightId: view.fightId });
      if (!r) return;
    }
    done();
    router.push("/bosses");
  };

  return (
    <Modal onClose={() => busy !== "fight_claim" && take()}>
      <div className="result-win">
        <div className="display result-title win">BOSS DEFEATED</div>
        <div className="result-photo">
          <BossPhoto boss={boss} round defeated />
        </div>
        <div className="display result-name">{boss.name}</div>
        <div className="muted small">Последний удар: <b style={{ color: "var(--ink)" }}>{view.killerIsMe ? "ты" : view.killer}</b></div>

        <div className="result-gains">
          <GainLine r={got ?? preview} size={16} />
          {/* a dropped room: one more reward plaque, glowing — [room picture] +комната */}
          {rooms.map((id) => (
            <span key={id} className="gain result-room" title={`Комната «${roomById(id)?.name}» — купи её дома стрелками`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/assets/home/${ROOM_BACKDROP[id] ?? `room-${id}`}.webp`} alt="" draggable={false} />+комната
            </span>
          ))}
        </div>

        {things.length > 0 && (
          <div className="result-drops">
            <b className="small">Выпало!</b>
            {things.map((id) => <span key={id} className="chip gold"><ItemArt id={id} size={24} /> {itemById(id)?.name ?? id}</span>)}
          </div>
        )}

        {view.top.length > 0 && (
          <div className="panel result-top">
            <div className="small muted" style={{ marginBottom: 6 }}>ТОП ПО УРОНУ</div>
            {view.top.slice(0, 5).map((t, i) => (
              <div key={t.playerId} className="row" style={{ justifyContent: "space-between", padding: "2px 0" }}>
                <span className="ellipsis">{i + 1}. {t.name}</span>
                <b className="num">{full(t.damage)}</b>
              </div>
            ))}
          </div>
        )}

        <button className="btn gold big result-take" disabled={busy === "fight_claim"} onClick={take}>Забрать</button>
      </div>
    </Modal>
  );
}
