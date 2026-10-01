#!/usr/bin/env bash
# API smoke test against a running server: BASE=http://localhost:3000 bash scripts/smoke.sh
set -euo pipefail
BASE=${BASE:-http://localhost:3000}
j() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const o=JSON.parse(d);console.log(eval('o'+process.argv[1]))})" "$1"; }
uuid() { node -e "console.log(crypto.randomUUID())"; }
echo "health: $(curl -sf $BASE/api/health)"
TOKEN=$(curl -sf -X POST $BASE/api/auth -H 'content-type: application/json' -d "{\"guestId\":\"$(uuid)\"}" | j .token)
H=(-H "authorization: Bearer $TOKEN" -H 'content-type: application/json')
echo "me: boss=$(curl -sf "${H[@]}" $BASE/api/me | j .state.boss.index) rub=$(curl -sf "${H[@]}" $BASE/api/me | j .state.balances.RUB)"
echo "market tokens: $(curl -sf $BASE/api/market | j .tokens.length)"
echo "work: $(curl -sf -X POST "${H[@]}" $BASE/api/work -d '{}' | j .result.earned)"
sleep 0.3
echo "rub->usd: $(curl -sf -X POST "${H[@]}" $BASE/api/exchange -d "{\"from\":\"RUB\",\"to\":\"USD\",\"amount\":9000,\"idem\":\"$(uuid)\"}" | j .result.received)"
sleep 0.3
echo "usd->sol: $(curl -sf -X POST "${H[@]}" $BASE/api/exchange -d "{\"from\":\"USD\",\"to\":\"SOL\",\"amount\":90,\"idem\":\"$(uuid)\"}" | j .result.received)"
sleep 0.4
echo "buy: $(curl -sf -X POST "${H[@]}" $BASE/api/trade -d "{\"side\":\"buy\",\"tokenId\":\"dking\",\"sol\":0.5,\"idem\":\"$(uuid)\"}" | j .result.amount)"
sleep 0.4
SELL=$(curl -sf -X POST "${H[@]}" $BASE/api/trade -d "{\"side\":\"sell\",\"tokenId\":\"dking\",\"fraction\":1,\"idem\":\"$(uuid)\"}")
echo "sell damage: $(echo "$SELL" | j .result.damage.amount) boss remaining: $(echo "$SELL" | j .state.boss.remaining) global: $(echo "$SELL" | j .state.globalTotal)"
echo "bad sell: $(curl -s -X POST "${H[@]}" $BASE/api/trade -d "{\"side\":\"sell\",\"tokenId\":\"dking\",\"fraction\":1,\"idem\":\"$(uuid)\"}")"
echo "no auth: $(curl -s $BASE/api/me)"
echo "leaderboard rows: $(curl -sf "$BASE/api/leaderboard?type=damage_all" | j .rows.length)"
echo "feed: $(curl -sf $BASE/api/feed | j .items.length)"
echo "stream: $(timeout 4 curl -sN $BASE/api/stream | head -c 300 || true)"
echo "daily: $(curl -sf -X POST "${H[@]}" $BASE/api/retention -d '{"action":"daily"}' | j .result.day)"
sleep 0.3
echo "wear cap: $(curl -sf -X POST "${H[@]}" $BASE/api/retention -d '{"action":"wear","cosmeticId":"hat-cap"}' | j .state.player.outfit.hat)"
echo "quests: $(curl -sf "${H[@]}" $BASE/api/me | j '.state.quests.map(q=>q.id+":"+q.progress).join(",")')"
