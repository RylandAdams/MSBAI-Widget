#!/bin/zsh
# prep.sh — a short prep card for every call, ready before it starts.
#
#   prep.sh tick            # the widget's refresh beat: build preps for calls starting soon,
#                           # notify 10 minutes out, print the ready ones (uid <TAB> base64 md)
#   prep.sh build B64JSON   # build one prep now (tick starts these in the background)
#   prep.sh status          # the tail of the log
#
# tick reads .cal-last, the calendar feed the widget's own command just wrote, so the calendar is
# read once per beat and EventKit permission stays with Übersicht. A call qualifies when it is
# timed (not all day), not cancelled or declined, and has at least one other attendee. Its prep is
# built once, BUILD_AHEAD seconds before it starts, by a headless Claude that reads the Google
# Calendar, Fireflies, Slack and Drive connectors and TASKS.md. It never writes or sends anything.

SELF=${0:A}                        # $0 inside a zsh function is the function name, so keep the path
HERE=${0:A:h}
ROOT=${HERE:h}
P="$HERE/.prep"
LOG="$P/log"
CALFEED="$HERE/.cal-last"
BUILD_AHEAD=${PREP_AHEAD:-1500}       # 25 min: start building this far ahead
NOTIFY_AHEAD=${PREP_NOTIFY:-600}      # 10 min: the card shows and a notification goes out
MODEL=${PREP_MODEL:-sonnet}

export PATH="$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
mkdir -p "$P"

log() { print -r -- "$(date '+%F %T')  $*" >> "$LOG"; }
notify() {
  /usr/bin/osascript -e 'on run a' -e 'display notification (item 2 of a) with title (item 1 of a)' \
    -e 'end run' "$1" "$2" >/dev/null 2>&1
}
claude_run() {   # seconds, model, prompt file, tools...
  local secs=$1 model=$2 prompt=$3; shift 3
  (cd "$ROOT" && /usr/bin/perl -e 'alarm shift; exec @ARGV' $secs \
    claude -p --model "$model" --permission-mode dontAsk --allowedTools "$@" < "$prompt" 2>&1)
}

case "${1:-status}" in

tick)
  [ -f "$CALFEED" ] || exit 0
  /usr/bin/python3 - "$CALFEED" "$P" $BUILD_AHEAD $NOTIFY_AHEAD <<'PY' | while IFS=$'\t' read -r kind a b c; do
import base64, datetime, hashlib, json, os, sys
feed, pdir, ahead, nahead = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
now = datetime.datetime.now().astimezone()
def when(s):
    try: return datetime.datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone()
    except Exception: return None
for line in open(feed, encoding="utf-8", errors="replace"):
    f = line.rstrip("\n").split("\t")
    if len(f) < 15 or f[0] != "E": continue
    start, end, allday, status, mine, natt = when(f[1]), when(f[2]), f[3], f[4], f[5], f[6]
    title, url, notes, uid = f[10], f[12], f[13], f[14]
    if not start or not uid or allday == "1" or status == "3" or mine == "3": continue
    try: natt = int(natt)
    except ValueError: natt = 0
    if natt < 2: continue
    key = hashlib.md5(uid.encode()).hexdigest()
    md = os.path.join(pdir, key + ".md")
    lead = (start - now).total_seconds()
    if os.path.exists(md):
        if -3600 <= lead <= 3 * 3600:
            print("READY\t" + uid + "\t" + base64.b64encode(open(md, "rb").read()).decode())
        if 0 <= lead <= nahead and not os.path.exists(os.path.join(pdir, key + ".notified")):
            print("NOTIFY\t" + key + "\t" + str(max(1, round(lead / 60))) + "\t" + title)
    elif 0 <= lead <= ahead and not os.path.exists(os.path.join(pdir, key + ".building")):
        spec = {"uid": uid, "key": key, "title": title, "start": f[1], "end": f[2],
                "url": url, "notes": notes[:600]}
        print("BUILD\t" + base64.b64encode(json.dumps(spec).encode()).decode() + "\t" + key + "\t-")
PY
    case $kind in
      READY)  print -r -- "$a"$'\t'"$b" ;;
      NOTIFY) : > "$P/$a.notified"; notify "In $b min: $c" "Your prep card is on the desk." ;;
      BUILD)  : > "$P/$b.building"; ( /bin/zsh "$SELF" build "$a" ) >/dev/null 2>&1 &! ;;
    esac
  done
  # tidy: preps and markers older than two days
  /usr/bin/find "$P" -type f \( -name '*.md' -o -name '*.notified' -o -name '*.building' \) -mtime +2 -delete 2>/dev/null
  ;;

build)
  spec=$(print -r -- "$2" | /usr/bin/base64 -D 2>/dev/null)
  fields=("${(@f)$(print -r -- "$spec" | /usr/bin/python3 -c '
import json, re, sys
d = json.load(sys.stdin)
for k in ("key", "title", "start", "end", "url", "notes", "uid"):
    print(re.sub(r"[\r\n\t]+", " ", str(d.get(k) or "")).strip())' 2>/dev/null)}")
  key=${fields[1]}; title=${fields[2]}; start=${fields[3]}; end=${fields[4]}
  url=${fields[5]}; notes=${fields[6]}; uid=${fields[7]}
  [[ $key =~ '^[0-9a-f]+$' ]] || exit 0
  {
    print -r -- "Build a short prep card for a call {{OWNER_FULL}} has coming up, unattended; nobody will answer."
    print -r -- "{{OWNER_FIRST}} does operations, BD and technical coordination for MSBAI, Tam Fortis Solutions and"
    print -r -- "Nexcavate. Read only: never send, post, create or change anything."
    print -r -- ""
    print -r -- "The call: \"$title\", $start to $end (America/Los_Angeles). Calendar UID: $uid"
    [ -n "$url$notes" ] && print -r -- "From the invite: $url $notes"
    print -r -- ""
    print -r -- "1. Find who is on it: list_events (or search_events) on Google Calendar around that start"
    print -r -- "   time, match the event, read its attendees."
    print -r -- "2. Last time: fireflies_search for earlier meetings with this title or these people in the"
    print -r -- "   last 45 days; read the most recent one or two (fireflies_get_summary) for what was decided"
    print -r -- "   and what was left open."
    print -r -- "3. Open with them: Read ~/AI Tools/TASKS.md (the ## Active part) for {{OWNER_FIRST}}'s tasks that"
    print -r -- "   involve these people or this topic."
    print -r -- "4. Recent Slack: slack_search_public_and_private for the last 14 days of messages with these"
    print -r -- "   people about this topic; read a thread only if it clearly matters to this call."
    print -r -- "5. Docs: search_files on Drive for documents named in steps 2 to 4."
    print -r -- ""
    print -r -- "Write the card in plain language a high schooler could follow, at most 14 lines, in this shape:"
    print -r -- "Who: names, comma separated"
    print -r -- "**Last time**"
    print -r -- "- two or three bullets: decisions and open items, with who said what"
    print -r -- "**Open with them**"
    print -r -- "- {{OWNER_FIRST}}'s tasks or asks that involve them"
    print -r -- "**Recent Slack**"
    print -r -- "- one or two bullets"
    print -r -- "**Bring up**"
    print -r -- "- the one to three things worth raising"
    print -r -- "Links, one per line as [Kind: short label](url), Kind being Transcript, Slack, Drive or Web."
    print -r -- "Leave out any section with nothing real in it. Never invent anything; only URLs a tool"
    print -r -- "returned. No em dashes, en dashes or connector hyphens. Write GURU in all caps."
    print -r -- "Print the card between a line PREP_START and a line PREP_END, and nothing else."
    print -r -- "If a tool result was saved to a file because it was large, open it with Read."
  } > "$P/$key.prompt.md"
  tools=(ToolSearch Read
    mcp__claude_ai_Google_Calendar__list_events mcp__claude_ai_Google_Calendar__search_events
    mcp__claude_ai_Google_Calendar__get_event
    mcp__claude_ai_Fireflies__fireflies_search mcp__claude_ai_Fireflies__fireflies_get_summary
    mcp__claude_ai_Fireflies__fireflies_get_transcripts
    mcp__claude_ai_Slack__slack_search_public_and_private mcp__claude_ai_Slack__slack_read_thread
    mcp__claude_ai_Slack__slack_search_users
    mcp__claude_ai_Google_Drive__search_files)
  out=$(claude_run 600 "$MODEL" "$P/$key.prompt.md" $tools)
  print -r -- "$out" > "$P/$key.output"
  card=$(print -r -- "$out" | /usr/bin/awk '/^PREP_END/ { on = 0 } on { print } /^PREP_START/ { on = 1 }')
  if [ -n "$card" ]; then
    print -r -- "$card" > "$P/$key.md"
    rm -f "$P/$key.building"
    log "built: $title"
  else
    # the .building marker stays, so a failed prep is not retried on every beat
    log "build FAILED: $title: $(print -r -- "$out" | tail -1 | cut -c1-160)"
  fi
  ;;

status)
  tail -20 "$LOG" 2>/dev/null
  ;;
esac
exit 0
