cd /vercel && git clone -q --depth 1 -b wip-dm https://github.com/unkloff620/XCLOCE.git XC && cd XC && npm install --silent >/dev/null 2>&1
echo TSC=skip > /tmp/r.sum
echo skip >> /tmp/r.sum
ALLOW_GUEST=true npx next build > /tmp/build.log 2>&1; echo BUILD=$? >> /tmp/r.sum; grep -iE "error" /tmp/build.log | head -5 >> /tmp/r.sum
(ALLOW_GUEST=true ADMIN_DEV_LOGIN=true ADMIN_TELEGRAM_IDS=1 nohup npx next start -p 3000 > /tmp/srv.log 2>&1 &)
mkdir -p /tmp/pw && cd /tmp/pw && npm init -y >/dev/null && npm i playwright@1.48.2 >/dev/null 2>&1 && npx playwright install chromium >/dev/null 2>&1 && sudo npx playwright install-deps chromium >/dev/null 2>&1
cp /vercel/XC/e2e-tmp/dm.js . && sleep 3 && timeout 200 node dm.js >> /tmp/r.sum 2>&1
echo ALLDONE >> /tmp/r.sum
