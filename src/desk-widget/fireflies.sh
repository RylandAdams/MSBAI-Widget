#!/bin/zsh
# fireflies.sh — recent meetings, and one transcript at a time.
#
# The point of this script is what it does NOT do: it never bulk-downloads. The widget only
# ever holds a list of titles and dates (a few hundred bytes, cached); a full transcript is
# fetched only when you click one, and once fetched it is never fetched again.
#
#   fireflies.sh list            # id<TAB>epoch_ms<TAB>minutes<TAB>title — from cache
#   fireflies.sh refresh         # force the list to re-fetch, then print it
#   fireflies.sh copy ID         # full verbatim transcript onto the clipboard  <- the widget
#   fireflies.sh fetch ID        # same, but just write it and print the path
#   fireflies.sh get ID          # same, and open it in an editor
#   fireflies.sh path ID         # where it would land (no network)
#   fireflies.sh web ID          # open the meeting on fireflies.ai instead
#
# The API key lives in .fireflies-key beside this script, chmod 600, and is never printed.
# Get one at fireflies.ai > Settings > Developer Settings.

CMD=${1:-list}
shift

HERE=${0:A:h}
KEYFILE="$HERE/.fireflies-key"
CACHE="$HERE/.meetings"
OUT="${HERE:h}/transcripts"        # ~/AI Tools/transcripts
API="https://api.fireflies.ai/graphql"
LIMIT=15
TTL=900                            # seconds before the cached list is considered stale

# Marker lines the widget renders as panel state, rather than silently showing nothing.
NOKEY="!!nokey"
NONET="!!offline"

key() {
  [ -f "$KEYFILE" ] || return 1
  local k
  k=$(tr -d ' \t\r\n' < "$KEYFILE")
  [ -n "$k" ] || return 1
  print -r -- "$k"
}

# One POST. $1 = JSON body. Prints the raw response, or nothing on a transport failure.
api() {
  local k
  k=$(key) || return 1
  /usr/bin/curl -sS --max-time 45 -X POST "$API" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $k" \
    -d "$1" 2>/dev/null
}

fetch_list() {
  local body resp
  body='{"query":"query { transcripts(limit: '"$LIMIT"') { id title date duration } }"}'
  resp=$(api "$body") || { print -r -- "$NOKEY"; return 1; }
  [ -n "$resp" ] || { print -r -- "$NONET"; return 1; }
  print -r -- "$resp" | /usr/bin/python3 -c '
import sys, json
try:
    d = json.load(sys.stdin)
except Exception:
    print("!!offline"); sys.exit(0)
if d.get("errors"):
    # An expired or mistyped key comes back as a GraphQL error, not an HTTP one.
    msg = (d["errors"][0].get("message") or "").lower()
    print("!!nokey" if "auth" in msg or "key" in msg or "token" in msg else "!!offline")
    sys.exit(0)
rows = ((d.get("data") or {}).get("transcripts")) or []
for t in rows:
    title = " ".join(str(t.get("title") or "untitled").split())
    mins = int(round(float(t.get("duration") or 0)))
    print("\t".join([str(t.get("id") or ""), str(int(t.get("date") or 0)), str(mins), title]))
'
}

# A cached list is what keeps the widget from calling the API on every 120s refresh.
cached_list() {
  local age=999999
  if [ -f "$CACHE" ]; then
    age=$(( $(date +%s) - $(/usr/bin/stat -f %m "$CACHE") ))
  fi
  if [ "$age" -gt "$TTL" ]; then
    local fresh
    fresh=$(fetch_list)
    # Only overwrite a good cache with a good result — a dropped network should leave the
    # last known list on screen rather than blanking the panel.
    case "$fresh" in
      "$NOKEY"|"$NONET"|"")
        if [ -s "$CACHE" ]; then cat "$CACHE"; else print -r -- "${fresh:-$NONET}"; fi
        return 0
        ;;
    esac
    print -r -- "$fresh" > "$CACHE"
  fi
  cat "$CACHE" 2>/dev/null
}

slug() {
  print -r -- "$1" | /usr/bin/python3 -c '
import sys, re
s = sys.stdin.read().strip().lower()
s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
print(s[:60] or "meeting")
'
}

# Where a transcript lands. Deterministic, so `get` can tell an already-fetched meeting
# from a new one without asking the API.
target() {
  local id=$1 line date_ms title
  line=$(cached_list | /usr/bin/grep -F "$id	" | head -1)
  if [ -n "$line" ]; then
    date_ms=$(print -r -- "$line" | cut -f2)
    title=$(print -r -- "$line" | cut -f4)
  fi
  local day
  if [ -n "$date_ms" ] && [ "$date_ms" != "0" ]; then
    day=$(date -r $(( date_ms / 1000 )) '+%Y-%m-%d')
  else
    day="undated"
  fi
  print -r -- "$OUT/${day}-$(slug "${title:-$id}").md"
}

# Fetch if we do not already have it, and print the path either way. This is the only thing
# that touches the network, and it does so once per meeting, ever.
ensure() {
  local ID=$1 FILE BODY RESP
  [ -n "$ID" ] || return 1
  FILE=$(target "$ID")
  if [ -s "$FILE" ]; then
    print -r -- "$FILE"
    return 0
  fi
  mkdir -p "$OUT"
  BODY=$(/usr/bin/python3 -c '
import json, sys
q = ("query G($id: String!) { transcript(id: $id) { id title date duration "
     "organizer_email meeting_link participants "
     "sentences { speaker_name raw_text start_time } } }")
print(json.dumps({"query": q, "variables": {"id": sys.argv[1]}}))
' "$ID")
  RESP=$(api "$BODY") || { print -r -- "$NOKEY" >&2; return 1; }
  [ -n "$RESP" ] || { print -r -- "$NONET" >&2; return 1; }
  print -r -- "$RESP" | /usr/bin/python3 -c '
import sys, json, datetime

dest = sys.argv[1]
try:
    d = json.load(sys.stdin)
except Exception:
    print("!!offline", file=sys.stderr); sys.exit(1)
if d.get("errors"):
    print("!!" + (d["errors"][0].get("message") or "error")[:60], file=sys.stderr); sys.exit(1)
t = (d.get("data") or {}).get("transcript")
if not t:
    print("!!not found", file=sys.stderr); sys.exit(1)

def clock(sec):
    sec = int(sec or 0)
    h, m, s = sec // 3600, (sec % 3600) // 60, sec % 60
    return (f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}")

when = ""
if t.get("date"):
    when = datetime.datetime.fromtimestamp(int(t["date"]) / 1000).strftime("%A %d %B %Y, %H:%M")

L = ["# " + (t.get("title") or "Untitled"), ""]
if when: L.append("**When**  " + when)
if t.get("duration"): L.append("**Length**  %d min" % round(float(t["duration"])))
if t.get("organizer_email"): L.append("**Organizer**  " + t["organizer_email"])
p = t.get("participants") or []
if p: L.append("**Participants**  " + ", ".join(p))
if t.get("meeting_link"): L.append("**Meeting**  " + t["meeting_link"])
L.append("**Fireflies**  https://app.fireflies.ai/view/" + (t.get("id") or ""))
L += ["", "---", ""]

# Consecutive lines from one speaker are one paragraph. Fireflies splits on sentence
# boundaries, so verbatim without this is one short line per sentence and unreadable.
last, buf, t0 = None, [], 0
def flush():
    if buf:
        L.append(f"**{last}**  ·  `{clock(t0)}`")
        L.append(" ".join(buf))
        L.append("")
for s in (t.get("sentences") or []):
    who = s.get("speaker_name") or "Unknown"
    txt = (s.get("raw_text") or "").strip()
    if not txt:
        continue
    if who != last:
        flush()
        last, buf, t0 = who, [], s.get("start_time") or 0
    buf.append(txt)
flush()

open(dest, "w").write("\n".join(L).rstrip() + "\n")
' "$FILE" || return 1
  [ -s "$FILE" ] || return 1
  print -r -- "$FILE"
}

case "$CMD" in

list)
  cached_list
  ;;

refresh)
  rm -f "$CACHE"
  cached_list
  ;;

path)
  target "$1"
  ;;

web)
  [ -n "$1" ] && /usr/bin/open "https://app.fireflies.ai/view/$1"
  ;;

fetch)
  ensure "$1"
  ;;

copy)
  # What the widget calls. Put the whole transcript on the clipboard and say how much, so
  # the panel can confirm something actually happened.
  FILE=$(ensure "$1") || { print -r -- "!!failed"; exit 1; }
  /usr/bin/pbcopy < "$FILE"
  print -r -- "copied $(/usr/bin/wc -c < "$FILE" | tr -d ' ') bytes"
  ;;

get)
  FILE=$(ensure "$1") || exit 1
  /usr/bin/open "$FILE"
  print -r -- "$FILE"
  ;;

esac
