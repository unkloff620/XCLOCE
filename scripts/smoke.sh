#!/usr/bin/env bash
# API smoke test against a running server: BASE=http://localhost:3000 bash scripts/smoke.sh
set -euo pipefail
BASE=${BASE:-http://localhost:3000}
j() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const o=JSON.parse(d);console.log(eval('o'+process.argv[1]))})" "$1"; }
uuid() { node -e "console.log(crypto.randomUUID())"; }
act() { curl -s -X POST "${H[@]}" $BASE/api/action -d "$1"; sleep 0.45; }
echo "health: $(curl -sf $BASE/api/health)"
TOKEN=$(curl -sf -X POST $BASE/api/auth -H 'content-type: application/json' -d "{\"guestId\":\"$(uuid)\"}" | j .token)
H=(-H "authorization: Bearer $TOKEN" -H 'content-type: application/json')
ME=$(curl -sf "${H[@]}" $BASE/api/me)
echo "me: power=$(echo "$ME" | j .state.player.power) energy=$(echo "$ME" | j .state.player.energy) bosses=$(echo "$ME" | j .state.bosses.length)"
echo "task: $(act '{"type":"task","taskId":"t-chat"}' | j .result.reward.amount)"
echo "hit: $(act '{"type":"hit","boss":1,"weapon":"fists"}' | j '.result.dmg+" hp="+o.result.hp+" left="+o.result.attemptsLeft')"
echo "locked hit: $(act '{"type":"hit","boss":2}' | j .error.code)"
echo "fight view: $(curl -s "$BASE/api/boss?index=1" -H "authorization: Bearer $TOKEN" | j '.fight.hp+"/"+o.fight.hpMax+" players="+o.fight.damage.length')"
echo "buy fan: $(act '{"type":"buy","itemId":"w-paper-fan"}' | j .result.itemId)"
echo "equip: $(act '{"type":"equip","itemId":"w-paper-fan"}' | j .result.power)"
echo "daily: $(act '{"type":"daily"}' | j .result.label)"
echo "mission: $(act '{"type":"mission","missionId":"m-login"}' | j .result.missionId)"
echo "idle: $(act '{"type":"idle"}' | j '.error ? o.error.code : o.result.amount')"
echo "exchange: $(act '{"type":"exchange","from":"RUB","to":"USD","amount":1000}' | j .result.received)"
echo "clan: $(act '{"type":"clan_create","name":"Smoke Squad","tag":"SMK"}' | j '.error ? o.error.code : o.result.clanId')"
echo "clans: $(curl -sf "${H[@]}" "$BASE/api/clans" | j .clans.length)"
echo "no auth: $(curl -s $BASE/api/me | j .error.code)"
