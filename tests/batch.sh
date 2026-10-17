#!/bin/bash
# usage: batch.sh file.pptx  -> /home/claude/out/<name>/{ours,lo,cmp*.png}
f=$(realpath "$1"); n=$(basename "$f" .pptx); o=/home/claude/out/$n
mkdir -p $o/lo
cd /home/claude/prizma && xvfb-run -a -s "-screen 0 1600x1000x24" node tests/render-file.cjs "$f" $o/ours 2>&1 | grep -v "^$" | tail -12
soffice --headless --convert-to pdf --outdir $o/lo "$f" >/dev/null 2>&1 && pdftoppm -png -r 96 $o/lo/$n.pdf $o/lo/ref >/dev/null 2>&1
cnt=$(ls $o/ours | wc -l)
for s in $(seq 0 4 $((cnt-1))); do python3 tests/compare.py $o/ours $o/lo $o/cmp$s.png $s >/dev/null; done
ls $o
