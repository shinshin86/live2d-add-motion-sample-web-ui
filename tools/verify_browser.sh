#!/usr/bin/env bash
# Render the WebUI in headless Chrome and screenshot each motion at its peak pose.
#
# Usage:
#   tools/verify_browser.sh                     # every Action motion + UI interaction test
#   tools/verify_browser.sh Action:0 1.4        # one motion, frozen at the given second
#   tools/verify_browser.sh --loop Action:1     # loop motion: both sides of the 1st-3rd seams
#                                               # + a mid-cycle shot, with simulated lip sync
# Output: tmp-verify/*.png (inspect visually for expressions / poses / artifacts)
#
# Headless-verification pitfalls (already handled by this script):
# - --virtual-time-budget does NOT advance motion time -> use real time + --timeout
# - --dump-dom does not wait for --timeout; it dumps right after load -> use screenshots
# - WebGL fails to initialize with --disable-gpu -> use --use-angle=swiftshader-webgl
# - motion playback timing varies per run -> pin the pose with the WebUI's &freeze= hook
# - Chrome shoots as soon as the window "load" event fires (~2 s), i.e. before
#   &freeze= kicks in -> &hold=N makes the page request /__verify_hold, which
#   tools/serve.py answers only after N seconds, keeping "load" pending
set -euo pipefail
cd "$(dirname "$0")/.."

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
PORT="${PORT:-8791}"
OUT=tmp-verify
mkdir -p "$OUT"
rm -f "$OUT"/*.png  # avoid mixing results from a previous run

if [ ! -x "$CHROME" ]; then
  echo "ERROR: Chrome not found: $CHROME (set the CHROME env var to override)" >&2
  exit 1
fi

# Throwaway local server (killed on exit): tools/serve.py also answers
# /__verify_hold?s=N, which delays the screenshot (see above)
python3 tools/serve.py --port "$PORT" >/dev/null 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT
sleep 1

shot() { # shot <output name> <URL query> [freeze seconds]
  local query="$2" timeout=30000
  if [ -n "${3:-}" ]; then
    # hold "load" (= the screenshot) until a few seconds after the freeze
    query="$query&freeze=$3&hold=$(python3 -c "print(round($3 + 4, 2))")"
    timeout=$(python3 -c "print(int(($3 + 20) * 1000))")
  fi
  "$CHROME" --headless --use-angle=swiftshader-webgl --enable-unsafe-swiftshader \
    --window-size=900,800 --timeout="$timeout" --autoplay-policy=no-user-gesture-required --mute-audio \
    --screenshot="$OUT/$1.png" "http://localhost:$PORT/?$query" 2>/dev/null
  echo "wrote $OUT/$1.png"
}

if [ "${1:-}" = "--loop" ]; then
  # Seam check: shots just before and after the end of cycles 1-3 should look
  # alike (no jump, still the loop's expression, not the base pose), and the
  # mid-cycle shot of cycle 3 proves the motion is still running.
  target="${2:?usage: verify_browser.sh --loop Group:index}"
  dur=$(python3 - "$target" <<'EOF'
import json, os, sys
group, index = sys.argv[1].split(":")
cfg = json.load(open("model.config.json"))
m3 = json.load(open(cfg["model3"]))
entry = m3["FileReferences"]["Motions"][group][int(index)]
d = json.load(open(os.path.join(os.path.dirname(cfg["model3"]), entry["File"])))
if not d["Meta"]["Loop"]:
    sys.exit(f"{sys.argv[1]} is not a loop motion (Meta.Loop=false)")
print(d["Meta"]["Duration"])
EOF
)
  name=$(echo "$target" | tr ':' '_')
  at() { python3 -c "print(round($1, 2))"; }  # at <expression> -> seconds
  for k in 1 2 3; do
    for side in before after; do
      if [ "$side" = before ]; then t=$(at "$k * $dur - 0.1"); else t=$(at "$k * $dur + 0.1"); fi
      shot "loop_${name}_seam${k}_${side}" "play=${target}&lipsync=1" "$t"
    done
  done
  t=$(at "2.5 * $dur")
  shot "loop_${name}_cycle3_mid" "play=${target}&lipsync=1" "$t"
elif [ $# -ge 1 ]; then
  # single shot: verify_browser.sh Group:index [freeze seconds]
  shot "$(echo "$1" | tr ':' '_')" "play=$1" "${2:-1.0}"
else
  # every Action motion, listed dynamically from model.config.json,
  # frozen at 40% of each motion's duration
  python3 - <<'EOF' | while read -r idx name freeze; do
import json, os
cfg = json.load(open("model.config.json"))
m3 = json.load(open(cfg["model3"]))
runtime = os.path.dirname(cfg["model3"])
for i, e in enumerate(m3["FileReferences"]["Motions"].get("Action", [])):
    d = json.load(open(os.path.join(runtime, e["File"])))
    stem = os.path.basename(e["File"]).replace(".motion3.json", "")
    print(i, stem, round(d["Meta"]["Duration"] * 0.4, 2))
EOF
    shot "action${idx}_${name}" "play=Action:${idx}" "${freeze}"
  done
  # synthetic drag/zoom test (the status bar shows drag:(x,y)->(x,y) zoom:a->b)
  shot uitest "uitest=1"
fi

echo "done. Inspect $OUT/*.png visually (motions applied? any artifacts or unnatural poses?)."
