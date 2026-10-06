#!/bin/zsh
# wiki.sh — the Wiki tab's live layer: every open task in ClickUp's Goals & Workstreams space,
# so each wiki page shows the work happening on it right now. Read only: it never changes ClickUp.
#
#   wiki.sh tick    # the widget's refresh beat: print "LIVE <TAB> json"; refresh in the background when stale
#   wiki.sh sync    # refresh now
#   wiki.sh status  # the tail of the log
#
# .wiki/live.json: {"updated", "tasks": [{"id", "list", "status", "who", "due", "tags", "name"}]}

SELF=${0:A}
HERE=${0:A:h}
ROOT=${HERE:h}
W="$HERE/.wiki"
LIVE="$W/live.json"
LOG="$W/log"
EVERY=${WIKI_EVERY:-7200}
MODEL=${WIKI_MODEL:-haiku}
SPACE=${WIKI_SPACE:-90114201246}

export PATH="$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
mkdir -p "$W"

log() { print -r -- "$(date '+%F %T')  wiki: $*" >> "$LOG"; }
mtime() { /usr/bin/stat -f %m "$1" 2>/dev/null || print 0; }

source "$HERE/cu_limit.zsh"
sync() {
  if cu_blocked; then touch "$LIVE"; log "sync skipped: ClickUp daily limit, waits until $(cu_until)"; return 0; fi
  if ! mkdir "$W/lock" 2>/dev/null; then
    (( $(date +%s) - $(mtime "$W/lock") < 1800 )) && return 0
    rmdir "$W/lock"; mkdir "$W/lock" || return 0
  fi
  trap 'rmdir "$W/lock" 2>/dev/null' EXIT
  {
    print -r -- "Read only and unattended: never create, change, close or comment on anything."
    print -r -- "Call mcp__claude_ai_ClickUp__clickup_filter_tasks with space_ids [\"$SPACE\"], include_closed false,"
    print -r -- "subtasks false, order_by \"updated\", page 0. While the result says has_more is true, call it again"
    print -r -- "with page set to next_page. If a result was saved to a file because it was large, open it with Read."
    print -r -- "Then print a line LIVE_START, then one line per task with these fields separated by a TAB character:"
    print -r -- "task id, list id, status, assignee usernames joined by commas (or -), due_date exactly as given in"
    print -r -- "milliseconds (or -), tag names joined by commas (or -), task name. Then a line LIVE_END. Every task,"
    print -r -- "no summary, nothing else."
  } > "$W/prompt.md"
  out=$(cd "$ROOT" && /usr/bin/perl -e 'alarm shift; exec @ARGV' 900 \
        claude -p --model "$MODEL" --permission-mode dontAsk \
        --allowedTools ToolSearch Read mcp__claude_ai_ClickUp__clickup_filter_tasks < "$W/prompt.md" 2>&1)
  cu_note "$out"
  print -r -- "$out" > "$W/output"
  res=$(/usr/bin/python3 - "$W/output" "$LIVE" <<'PY'
import datetime, json, os, re, sys
raw = open(sys.argv[1], encoding="utf-8", errors="replace").read()
m = re.search(r"^LIVE_START\s*$(.*?)^LIVE_END\s*$", raw, re.S | re.M)
if not m: print("bad"); sys.exit(0)
tasks = []
for line in m.group(1).splitlines():
    f = line.split("\t")
    if len(f) < 7 or not re.match(r"^[0-9a-z]+$", f[0].strip()): continue
    due = f[4].strip()
    try: due = datetime.datetime.fromtimestamp(int(due) / 1000).strftime("%Y-%m-%d")
    except ValueError: due = ""
    clean = lambda x: "" if x.strip() == "-" else x.strip()
    tasks.append({"id": f[0].strip(), "list": f[1].strip(), "status": f[2].strip(), "who": clean(f[3]), "due": due,
                  "tags": [t for t in clean(f[5]).split(",") if t], "name": "\t".join(f[6:]).strip()})
if not tasks: print("bad"); sys.exit(0)
# a paging run that stopped early (a rate limit, a cut off reply) returns a fraction of the space;
# keep the last full list rather than blanking most wiki pages until the next good run
try:
    prev = json.load(open(sys.argv[2]))
    had = len(prev.get("tasks") or [])
    age = datetime.datetime.now().astimezone() - datetime.datetime.fromisoformat(prev["updated"])
    if had >= 50 and len(tasks) < had * 0.6 and age.days < 3:
        print("partial: got %d tasks, had %d; kept the last full list" % (len(tasks), had)); sys.exit(0)
except Exception:
    pass
out = {"updated": datetime.datetime.now().astimezone().isoformat(), "tasks": tasks}
tmp = sys.argv[2] + ".tmp"; json.dump(out, open(tmp, "w"), separators=(",", ":")); os.replace(tmp, sys.argv[2])
print("ok %d tasks" % len(tasks))
PY
)
  case $res in
    ok*) log "${res#ok }" ;;
    partial*) touch "$LIVE"; log "sync $res" ;;
    *)   touch "$LIVE"; log "sync FAILED: $(print -r -- "$out" | tail -1 | cut -c1-160)" ;;
  esac
}

case "${1:-status}" in
tick)
  h=$(( 10#$(date +%H) ))
  if (( h >= 7 && h < 22 )) && [ ! -d "$W/lock" ] && (( $(date +%s) - $(mtime "$LIVE") >= EVERY )); then
    ( /bin/zsh "$SELF" sync ) >/dev/null 2>&1 &!
  fi
  [ -s "$LIVE" ] && print -r -- "LIVE"$'\t'"$(tr -d '\n' < "$LIVE")"
  ;;
sync)
  sync
  ;;
status)
  /usr/bin/grep 'wiki:' "$LOG" | tail -10
  ;;
esac
exit 0
