#!/bin/bash
# Prizma's regression suite: drives the built app (npm run build) with Playwright and prints one line per test.
# Usage: tests/regression/suite.sh [logdir] [test ...]   (no test names = all of them)
# Needs Linux with an X display (DISPLAY, default :99 from Xvfb), Playwright in /opt/npm-tools,
# python3 with Pillow and numpy, java (OOXML check in val/), LibreOffice (soffice) and pdfinfo.
D=$(cd "$(dirname "$0")" && pwd)
cd "$D"
export DISPLAY=${DISPLAY:-:99}
R=${1:-$(mktemp -d)}; shift; mkdir -p "$R"
ALL="s-gal2 s-f2 s-f156 s-recover s-f7 s-f3 s-f4 s-media s-cmds s-cmd2 s-a11y s-bad s-keepmedia s-legacy s-anim s-show2 s-edit s-navprobe s-reuse s-opts s-search s-shapes s-shapes2 s-theme s-print s-big s-displays s-a11y-dlg s-audit s-photos s-review s-rotgroup s-import e2e crash"
for t in ${@:-$ALL}; do
  if [ $t = e2e ] || [ $t = crash ]; then
    timeout 900 node $t.cjs "$R/$t" > "$R/$t.log" 2>&1; echo "$t: exit $? $(grep -o 'ERRORS [0-9]*\|[0-9]* passed\|FAIL.*\|CRASH RECOVERY [A-Z]*' "$R/$t.log" | tail -2 | tr '\n' ' ')"
    continue
  fi
  timeout 900 node drive.cjs $t.cjs "$R/$t" > "$R/$t.log" 2>&1
  [ $t = s-f3 ] && python3 check-f3.py "$R/$t" >> "$R/$t.log" 2>&1
  e=$(grep -o "ERRORS [0-9]*" "$R/$t.log" | tail -1); f=$(grep -c "^FAIL\|BAD$\|^BAD: \[" "$R/$t.log")
  echo "$t: ${e:-NO RESULT} fails=$f"
done
echo "logs in $R"
