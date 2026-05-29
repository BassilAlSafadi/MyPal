TARGET=491
for i in $(seq 1 400); do
  CUR=$(find node_modules -name package.json -maxdepth 3 2>/dev/null | wc -l)
  BIN=$(ls node_modules/.bin 2>/dev/null | wc -l)
  LOCK=$([ -f package-lock.json ] && echo "lock✓" || echo "lock·")
  DONE=$([ -f node_modules/.package-lock.json ] && echo "✅ COMPLETE" || echo "")
  PCT=$(( CUR * 100 / TARGET )); [ $PCT -gt 100 ] && PCT=100
  FILLED=$(( PCT / 5 )); BAR=""
  for x in $(seq 1 20); do [ $x -le $FILLED ] && BAR="${BAR}#" || BAR="${BAR}-"; done
  printf "%s [%s] %3d%%  %d/%d pkgs | .bin:%d %s %s\n" "$(date +%H:%M:%S)" "$BAR" "$PCT" "$CUR" "$TARGET" "$BIN" "$LOCK" "$DONE"
  [ -n "$DONE" ] && break
  sleep 4
done
