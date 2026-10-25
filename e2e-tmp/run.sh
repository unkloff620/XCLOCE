cd /vercel && git clone -q --depth 1 -b wip-tal https://github.com/unkloff620/XCLOCE.git XC && cd XC && npm install --silent >/dev/null 2>&1
npx tsc --noEmit -p . > /tmp/tsc.log 2>&1; echo TSC=$? > /tmp/r.sum; head -c 900 /tmp/tsc.log >> /tmp/r.sum
npx vitest run 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E 'Tests |FAIL|AssertionError|Error:' | head -10 >> /tmp/r.sum
echo nobuild >> /tmp/r.sum
echo ALLDONE >> /tmp/r.sum
echo ALLDONE >> /tmp/r.sum
