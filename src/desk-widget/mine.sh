#!/bin/zsh
# mine.sh — keeps Workstreams honest about the widget owner's own work, and keeps its focus line
# current.
#
#   mine.sh tick    # the widget's refresh beat: print "MINE <TAB> json"; recheck when stale
#   mine.sh check   # recheck now
#   mine.sh status  # the tail of the log
#
# Every next step the flow gives the owner (named in me.json) is checked against what has
# happened since: TASKS.md (ticked into Done), their ClickUp tasks (closed), their own Slack
# messages and their sent Gmail. A step with evidence it was done is marked done, with the
# evidence and a link, so the widget stops lighting it up. A step that no longer applies is
# marked dropped. In the same run, the focus line at the top of Workstreams is rewritten to the
# most urgent thing the team, Allan first, is pushing right now, from the last ten days of meetings.
# Runs from 6am to midnight. Read only everywhere: it never sends, posts, ticks or closes anything.
#
# .flow/mine.json: {"updated", "items": {"<node id>:<index>": {"status", "evidence", "url"}},
#                   "focus", "focusWhy"}

SELF=${0:A}
HERE=${0:A:h}
ROOT=${HERE:h}
F="$HERE/.flow"
FLOW="$F/flow.json"
MINE="$F/mine.json"
LOG="$F/log"
EVERY=${MINE_EVERY:-1800}
MODEL=${MINE_MODEL:-sonnet}

export PATH="$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
mkdir -p "$F"

log() { print -r -- "$(date '+%F %T')  mine: $*" >> "$LOG"; }
mtime() { /usr/bin/stat -f %m "$1" 2>/dev/null || print 0; }
source "$HERE/cu_limit.zsh"
claude_run() {   # seconds, model, prompt file, tools... (ClickUp tools drop out while its daily limit is spent)
  local secs=$1 model=$2 prompt=$3; shift 3
  local -a tools; tools=("$@")
  cu_blocked && tools=(${tools:#*ClickUp*})
  local out
  out=$(cd "$ROOT" && /usr/bin/perl -e 'alarm shift; exec @ARGV' $secs \
    claude -p --model "$model" --permission-mode dontAsk --allowedTools "${tools[@]}" < "$prompt" 2>&1)
  cu_note "$out"
  print -r -- "$out"
}

check() {
  [ -f "$FLOW" ] || return 0
  if ! mkdir "$F/mlock" 2>/dev/null; then
    (( $(date +%s) - $(mtime "$F/mlock") < 1800 )) && return 0
    rmdir "$F/mlock"; mkdir "$F/mlock" || return 0
  fi
  trap 'rmdir "$F/mlock" 2>/dev/null' EXIT
  # the owner's steps and the recent meetings, as plain lines for the prompt
  /usr/bin/python3 - "$FLOW" "$HERE/me.json" "$MINE" > "$F/mine-input.txt" <<'PY'
import datetime, json, sys
flow, me, prev = json.load(open(sys.argv[1])), json.load(open(sys.argv[2])), {}
try: prev = json.load(open(sys.argv[3])).get("items", {})
except Exception: pass
names = [x.lower() for x in [me.get("name"), me.get("full")] + me.get("aliases", []) if x]
def mine(who):
    w = str(who or "").strip().lower()
    return bool(w) and any(w == n or w.startswith(n + " ") or n.startswith(w + " ") for n in names)
now = datetime.datetime.now().astimezone()
by = {s["id"]: s for s in flow.get("streams", [])}
print("OWNER: %s (%s), Slack id %s, ClickUp id %s, email %s" % (me.get("full") or me.get("name"), me.get("name"),
      me.get("slack", ""), me.get("clickup", ""), me.get("email", "")))
print("\nSTEPS (key | meeting date | stream | step | earlier verdict):")
for n in flow.get("nodes", []):
    d = datetime.datetime.fromisoformat(n["date"])
    if (now - d).days > 21: continue
    for k, x in enumerate(n.get("next", [])):
        if not mine(x.get("who")): continue
        key = "%s:%d" % (n["id"], k)
        was = prev.get(key, {}).get("status", "")
        if was in ("done", "dropped"): continue          # settled already
        st = ", ".join(by[s]["name"] for s in n.get("streams", []) if s in by)
        print("%s | %s | %s | %s | %s" % (key, d.strftime("%Y-%m-%d"), st, x.get("what", ""), was or "new"))
print("\nLAST TEN DAYS OF MEETINGS (date | meeting | what happened | who said what):")
for n in flow.get("nodes", []):
    d = datetime.datetime.fromisoformat(n["date"])
    if (now - d).days > 10: continue
    said = "; ".join("%s: %s" % (x.get("who"), x.get("what")) for x in n.get("said", []))
    print("%s | %s | %s | %s" % (d.strftime("%a %b %d"), n.get("meetingTitle", ""), n.get("summary", ""), said))
print("\nCURRENT FOCUS LINE: " + (flow.get("focus") or "none"))
PY
  {
    print -r -- "Bring a teammate's workstreams view up to date, unattended; nobody will answer. Read only:"
    print -r -- "never send, post, tick, close or change anything. Today is $(date '+%A %b %d %Y, %H:%M %Z')."
    print -r -- ""
    cat "$F/mine-input.txt"
    print -r -- ""
    print -r -- "1. For each STEP, decide whether the owner has already done it since its meeting date. Look for"
    print -r -- "   evidence, cheapest first: Read ~/AI Tools/TASKS.md (a matching task ticked into ## Done); their"
    print -r -- "   ClickUp tasks (clickup_filter_tasks, assignees [their ClickUp id], include_closed true,"
    print -r -- "   date_closed_from the earliest step date); their own Slack messages since then"
    print -r -- "   (slack_search_public_and_private with from:<@their Slack id> and the step's key words); and"
    print -r -- "   their sent mail (search_threads, in:sent after:YYYY/MM/DD plus key words). Mark it done only on"
    print -r -- "   clear evidence (a closed task, a sent email or a message that delivers it). Mark it dropped when"
    print -r -- "   a later meeting in the list made it moot. Otherwise open."
    print -r -- "2. Group the steps still open that are really the same piece of work, even when they come from"
    print -r -- "   different meetings or streams (the same demo video asked for three times is one group). Every"
    print -r -- "   open key goes in exactly one group; a step with no twin is a group of one. Order the groups"
    print -r -- "   most urgent first."
    print -r -- "3. Write the owner's own focus line: in at most 14 words, the single most urgent thing the owner"
    print -r -- "   (named above) should do or push right now, from their open steps, what Allan asked of them and"
    print -r -- "   the most recent meetings. It is about this one person, not the whole team (the team's focus is"
    print -r -- "   written elsewhere). It replaces the current line if that one is stale."
    print -r -- ""
    print -r -- "Answer with one JSON object between a line MINE_START and a line MINE_END, nothing else:"
    print -r -- '{"items": [{"key": "...", "status": "done|open|dropped", "evidence": "one short line", "url": "a link a tool returned, or empty"}],'
    print -r -- ' "groups": [{"title": "the action, 10 words or fewer", "keys": ["..."], "waiting": "who or what is held up until it is done, one short line"}],'
    print -r -- ' "focus": "...", "focus_why": "one line: who pushed it and when"}'
    print -r -- "Plain words. No em dashes, en dashes or connector hyphens. Write GURU in all caps. Never invent"
    print -r -- "evidence. If a tool result was saved to a file because it was large, open it with Read."
  } > "$F/mine-prompt.md"
  out=$(claude_run 900 "$MODEL" "$F/mine-prompt.md" ToolSearch Read \
        mcp__claude_ai_ClickUp__clickup_filter_tasks mcp__claude_ai_ClickUp__clickup_search \
        mcp__claude_ai_Slack__slack_search_public_and_private \
        mcp__claude_ai_Gmail__search_threads mcp__claude_ai_Gmail__get_thread)
  print -r -- "$out" > "$F/mine-output"
  res=$(/usr/bin/python3 - "$F/mine-output" "$MINE" "$FLOW" <<'PY'
import datetime, json, os, re, sys
out_path, mine_path, flow_path = sys.argv[1:4]
raw = open(out_path, encoding="utf-8", errors="replace").read()
m = re.search(r"^MINE_START\s*$(.*?)^MINE_END\s*$", raw, re.S | re.M)
j = re.search(r"\{.*\}", m.group(1) if m else raw, re.S)
try: p = json.loads(j.group(0)) if j else None
except Exception: p = None
if not isinstance(p, dict): print("bad"); sys.exit(0)
try: cur = json.load(open(mine_path))
except Exception: cur = {"items": {}}
now = datetime.datetime.now().astimezone().isoformat()
n = 0
for it in p.get("items") or []:
    k = str(it.get("key") or "")
    if not k or it.get("status") not in ("done", "open", "dropped"): continue
    url = it.get("url") if str(it.get("url") or "").startswith("http") else ""
    cur["items"][k] = {"status": it["status"], "evidence": it.get("evidence") or "", "url": url, "checked": now}
    n += it["status"] != "open"
if isinstance(p.get("groups"), list):
    cur["groups"] = [{"title": str(g.get("title") or "")[:120], "keys": [str(k) for k in (g.get("keys") or [])],
                      "waiting": str(g.get("waiting") or "")[:160]} for g in p["groups"] if g.get("keys")]
if p.get("focus"):   # the owner's own focus (Workstreams, Mine); the team's focus comes from the review
    cur["myFocus"], cur["myFocusWhy"], cur["myFocusSet"] = p["focus"], p.get("focus_why") or "", now
    cur.pop("focus", None); cur.pop("focusWhy", None)
cur["updated"] = now
tmp = mine_path + ".tmp"; json.dump(cur, open(tmp, "w"), indent=1); os.replace(tmp, mine_path)
print("ok %d settled" % n)
PY
)
  case $res in
    ok*) log "${res#ok }" ;;
    *)   touch "$MINE"; log "check FAILED: $(print -r -- "$out" | tail -1 | cut -c1-160)" ;;
  esac
}

case "${1:-status}" in
tick)
  h=$(( 10#$(date +%H) ))
  if (( h >= 6 )) && [ -f "$FLOW" ] && [ ! -d "$F/lock" ] && [ ! -d "$F/mlock" ] \
     && (( $(date +%s) - $(mtime "$MINE") >= EVERY )); then
    ( /bin/zsh "$SELF" check ) >/dev/null 2>&1 &!
  fi
  [ -f "$MINE" ] && print -r -- "MINE"$'\t'"$(/usr/bin/python3 -c 'import json,sys; print(json.dumps(json.load(open(sys.argv[1])), separators=(",", ":")))' "$MINE" 2>/dev/null)"
  ;;
check)
  check
  ;;
status)
  /usr/bin/grep 'mine:' "$LOG" | tail -10
  ;;
esac
exit 0
