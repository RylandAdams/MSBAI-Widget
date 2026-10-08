#!/bin/zsh
# watch.sh — notify mode for desk tasks. Every EVERY seconds (30 min by default, 4:30am to 11:30pm, started by the widget's
# refresh beat), a headless Claude looks for anything NEW in Gmail, Slack, Fireflies, Drive and
# ClickUp that moves one of the Active tasks in TASKS.md forward: a reply on a linked thread, an
# email a "Watch:" line asks for, a meeting where it came up. Each hit becomes an alert on that
# task: what happened, the link, and a suggested next step. The widget makes the task's title glow
# until you press "got it". Read only: nothing is ever sent, posted or changed from here.
#
#   watch.sh tick            # print alerts as one JSON line; start a background sync if stale
#   watch.sh sync            # look now (in the background from tick)
#   watch.sh now             # same as sync, in the foreground, then print
#   watch.sh dismiss B64     # mark every current alert on that task title as seen
#   watch.sh status          # the tail of the log
#
# A task can say exactly what to watch for with a bullet that starts "Watch:", and what to do
# when it lands with one that starts "When ...". Tasks without them are still checked against
# their linked Slack, Gmail, Drive, Fireflies and ClickUp sources.
#
# .watch/alerts.json  {title: [{id, src, url, when, what, next, found}]}
# .watch/seen         alert ids you dismissed, one per line
# .watch/last         epoch of the last good run; the next run looks back to 15 min before it

SELF=${0:A}
HERE=${0:A:h}
ROOT=${HERE:h}
W="$HERE/.watch"
ALERTS="$W/alerts.json"
SEEN="$W/seen"
LAST="$W/last"
LOG="$W/log"
EVERY=${WATCH_EVERY:-1800}
START_MIN=${WATCH_START_MIN:-270}       # 4:30 am
END_MIN=${WATCH_END_MIN:-1410}         # 11:30 pm
MODEL=${WATCH_MODEL:-sonnet}
TASKS="$ROOT/TASKS.md"

export PATH="$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
mkdir -p "$W"; touch "$SEEN"

log() { print -r -- "$(date '+%F %T')  $*" >> "$LOG"; }
notify() {
  /usr/bin/osascript -e 'on run a' -e 'display notification (item 2 of a) with title (item 1 of a)' \
    -e 'end run' "$1" "$2" >/dev/null 2>&1
}
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
mtime() { /usr/bin/stat -f %m "$1" 2>/dev/null || print 0; }

# Unseen alerts for tasks that are still Active, as one JSON line.
show() {
  /usr/bin/python3 - "$ALERTS" "$SEEN" "$TASKS" <<'SHOWPY'
import json, os, re, sys
alerts, seen, tasks = sys.argv[1:4]
try: a = json.load(open(alerts))
except Exception: a = {}
s = {l.strip() for l in open(seen) if l.strip()} if os.path.exists(seen) else set()
active, sec = set(), None
if os.path.exists(tasks):
    for line in open(tasks, encoding="utf-8", errors="replace"):
        if line.startswith("## "): sec = line[3:].strip(); continue
        m = re.match(r"^- \[ \] \*\*(.+?)\*\*", line)
        if m and sec == "Active": active.add(m.group(1))
out = {}
for t, lst in a.items():
    if t not in active: continue
    keep = [x for x in lst if x.get("id") not in s]
    if keep: out[t] = keep
print(json.dumps(out, ensure_ascii=False))
SHOWPY
}

sync_now() {
  if ! mkdir "$W/lock" 2>/dev/null; then
    (( $(date +%s) - $(mtime "$W/lock") < 1500 )) && return 0
    rmdir "$W/lock"; mkdir "$W/lock" || return 0
  fi
  trap 'rmdir "$W/lock" 2>/dev/null' EXIT
  local now since
  now=$(date +%s)
  since=$(cat "$LAST" 2>/dev/null)
  [[ $since == <-> ]] && since=$(( since - 900 )) || since=$(( now - 172800 ))   # first run: 48 h
  /usr/bin/python3 - "$TASKS" "$W/tasks.txt" <<'TASKPY'
import re, sys
src, dst = sys.argv[1:3]
out, sec, n = [], None, 0
for line in open(src, encoding="utf-8", errors="replace"):
    if line.startswith("## "): sec = line[3:].strip(); continue
    if sec != "Active": continue
    m = re.match(r"^- \[ \] \*\*(.+?)\*\*(.*)$", line)
    if m:
        n += 1; out.append(f"\nTASK {n}: {m.group(1)}\n  meta: {m.group(2).lstrip(' -').strip()}"); continue
    sub = re.match(r"^(?:\s{2,}|\t)-\s+(.*\S)\s*$", line)
    if sub and n: out.append("  - " + sub.group(1))
open(dst, "w", encoding="utf-8").write("\n".join(out).strip() + "\n")
print(n)
TASKPY
  [ -s "$W/tasks.txt" ] || { log "no active tasks"; print -r -- "$now" > "$LAST"; return 0; }
  local sinceh=$(/usr/bin/python3 -c 'import sys,datetime; print(datetime.datetime.fromtimestamp(int(sys.argv[1])).strftime("%a %b %d %Y %H:%M %Z (local)"))' "$since")
  local sinced=$(date -r "$since" '+%Y/%m/%d')
  local sinceiso=$(date -r "$since" '+%Y-%m-%d')
  {
    print -r -- "You watch {{OWNER_FULL}}'s open tasks for news, unattended; nobody will answer."
    print -r -- "Read only: never send, draft, post, edit or change anything. Today is $(date '+%A %b %d %Y, %H:%M %Z')."
    print -r -- "He is {{OWNER_EMAIL}} (Slack user {{OWNER_SLACK_ID}}), doing operations, BD and technical"
    print -r -- "coordination for MSBAI (GURU, OrbitGuard, HPC CFD), Tam Fortis Solutions and Nexcavate (PermitPulse)."
    print -r -- ""
    print -r -- "Find anything NEW since $sinceh that moves one of the tasks below forward: a reply on a"
    print -r -- "linked email or Slack thread, an email or message a 'Watch:' line asks for, an answer to an"
    print -r -- "open question in the task, a deadline or owner change, a meeting where it was discussed, a new"
    print -r -- "comment on its ClickUp task, or a doc it waits on being shared. Ignore {{OWNER_FIRST}}'s own messages"
    print -r -- "unless someone answered them. Ignore anything older than that time, and anything the task's"
    print -r -- "notes already say."
    print -r -- ""
    print -r -- "How to look, cheapest first:"
    print -r -- "1. Gmail: search_threads 'after:$sinced -from:me -category:promotions -category:social', pageSize 30."
    print -r -- "   get_thread on anything that could match a task (search previews miss new messages)."
    print -r -- "2. Slack, linked threads FIRST and ALWAYS: call slack_read_thread on EVERY thread in the 'Linked Slack"
    print -r -- "   threads' list at the bottom (channel_id and message_ts are given). Keep every reply newer than the"
    print -r -- "   cutoff from anyone other than {{OWNER_FIRST}}, even if it does not mention him: teammates often reply to each"
    print -r -- "   other on his tasks (setting up a call, taking an item, answering a question) and that is news."
    print -r -- "   Next, slack_read_channel on each channel in the 'Slack channels to scan' list with oldest=$since,"
    print -r -- "   and keep new top level posts that are about one of the tasks (same topic, same people), even if"
    print -r -- "   they are not in the linked thread. Read the thread of any such post that has replies."
    print -r -- "   Next, for each person in the 'People on these tasks' list, slack_search_public_and_private with"
    print -r -- "   query 'from:<@ID> after:$sinceiso' and keep messages that move one of their tasks forward, even"
    print -r -- "   in a new thread, another channel or a group DM {{OWNER_FIRST}} is in."
    print -r -- "   Then slack_search_public_and_private with filters 'after:$sinceiso' for messages to, from"
    print -r -- "   or mentioning {{OWNER_FIRST}} (to:<@{{OWNER_SLACK_ID}}>, with:<@{{OWNER_SLACK_ID}}>, and keywords from the tasks)."
    print -r -- "3. Fireflies: fireflies_search 'from:$sinceiso' for meetings since then; read the summary only"
    print -r -- "   when a title or summary touches a task."
    print -r -- "4. ClickUp: clickup_get_task on a task's synced ClickUp link only if steps 1 to 3 hint at news."
    print -r -- "Apart from the linked Slack threads, do not chase every link on every task. One alert per real event."
    print -r -- ""
    print -r -- "For each hit print one line, fields separated by a single TAB, nothing else on the line:"
    print -r -- "A<TAB>task number<TAB>source: Gmail, Slack, Fireflies, Drive or ClickUp<TAB>direct link to the email,"
    print -r -- "message or meeting (the viewUrl or permalink)<TAB>when it happened, ISO 8601<TAB>what happened, one"
    print -r -- "plain sentence naming who<TAB>the next step that would help {{OWNER_FIRST}} finish the task, one or two"
    print -r -- "plain sentences; if the task has a 'When ...' line, follow it"
    print -r -- "Replace any TAB or newline inside a field with a space. Plain language, no em dashes, en dashes or"
    print -r -- "connector hyphens, GURU in all caps. Then end with exactly: WATCH_DONE <number of A lines>"
    print -r -- "If nothing new, print only: WATCH_DONE 0. Never ask for other tools or offer options. If a tool"
    print -r -- "result was saved to a file because it was large, open it with Read and carry on."
    print -r -- ""
    print -r -- "The open tasks:"
    cat "$W/tasks.txt"
    print -r -- ""
    /usr/bin/python3 - "$W/tasks.txt" "$HERE/team.tsv" <<'LINKPY'
import os, re, sys
tasks, team = sys.argv[1:3]
people = []
if os.path.exists(team):
    for l in open(team, encoding="utf-8"):
        f = l.rstrip("\n").split("\t")
        if len(f) >= 2 and f[1].startswith("U"): people.append((f[0], f[1]))
n, threads, chans, who = None, [], {}, {}
for line in open(tasks, encoding="utf-8"):
    m = re.match(r"^TASK (\d+):", line)
    if m: n = m.group(1)
    if not n: continue
    for name, uid in people:
        if re.search(r"\b" + re.escape(name) + r"\b", line): who.setdefault((name, uid), set()).add(n)
    for u in re.findall(r"https://[\w.-]*slack\.com/archives/[^\s)]+", line):
        c = re.search(r"/archives/([A-Z0-9]+)/p(\d{10})(\d{6})", u)
        if not c: continue
        t = re.search(r"thread_ts=([\d.]+)", u)
        ts = t.group(1) if t else f"{c.group(2)}.{c.group(3)}"
        if (c.group(1), ts) not in [(x[1], x[2]) for x in threads]: threads.append((n, c.group(1), ts))
        chans.setdefault(c.group(1), set()).add(n)
k = lambda v: ", ".join(sorted(v, key=int))
print("Linked Slack threads (read every one with slack_read_thread):")
for n, ch, ts in threads: print(f"TASK {n}: channel_id {ch}, message_ts {ts}")
if not threads: print("(none)")
print("\nSlack channels to scan (slack_read_channel, new top level posts only):")
for ch, v in chans.items(): print(f"channel_id {ch} (tasks {k(v)})")
if not chans: print("(none)")
print("\nPeople on these tasks (search their new messages):")
for (name, uid), v in who.items(): print(f"{name} <@{uid}> (tasks {k(v)})")
if not who: print("(none)")
LINKPY
  } > "$W/prompt.md"
  log "sync: looking back to $sinceh"
  out=$(claude_run 1200 "$MODEL" "$W/prompt.md" ToolSearch Read \
        mcp__claude_ai_Gmail__search_threads mcp__claude_ai_Gmail__get_thread mcp__claude_ai_Gmail__get_message \
        mcp__claude_ai_Slack__slack_search_public_and_private mcp__claude_ai_Slack__slack_search_public \
        mcp__claude_ai_Slack__slack_read_thread mcp__claude_ai_Slack__slack_read_channel \
        mcp__claude_ai_Fireflies__fireflies_search mcp__claude_ai_Fireflies__fireflies_get_summary \
        mcp__claude_ai_Fireflies__fireflies_get_transcript \
        mcp__claude_ai_Google_Drive__search_files mcp__claude_ai_Google_Drive__get_file_metadata \
        mcp__claude_ai_ClickUp__clickup_get_task mcp__claude_ai_ClickUp__clickup_get_task_comments \
        mcp__claude_ai_ClickUp__clickup_search)
  print -r -- "$out" > "$W/output"
  if ! print -r -- "$out" | /usr/bin/grep -qE '^WATCH_DONE [0-9]+'; then
    log "sync FAILED: $(print -r -- "$out" | tail -1 | cut -c1-200)"
    touch "$ALERTS"          # count the attempt, so a bad run is not retried every beat
    return 1
  fi
  print -r -- "$now" > "$LAST"
  new=$(/usr/bin/python3 - "$W/tasks.txt" "$ALERTS" "$W/output" <<'MERGEPY'
import datetime, hashlib, json, re, sys
tasks_txt, alerts, output = sys.argv[1:4]
titles = {}
for line in open(tasks_txt, encoding="utf-8"):
    m = re.match(r"^TASK (\d+): (.*)$", line.rstrip("\n"))
    if m: titles[m.group(1)] = m.group(2)
try: a = json.load(open(alerts))
except Exception: a = {}
a = {t: v for t, v in a.items() if t in titles.values()}   # tasks that left Active take their alerts along
now = datetime.datetime.now().isoformat(timespec="minutes")
fresh = []
for line in open(output, encoding="utf-8", errors="replace"):
    f = line.rstrip("\n").split("\t")
    if len(f) < 7 or f[0] != "A" or f[1].strip() not in titles: continue
    t = titles[f[1].strip()]
    src, url, when, what, nxt = (x.strip() for x in f[2:7])
    aid = hashlib.sha1(f"{t}|{url or what}".encode()).hexdigest()[:12]
    lst = a.setdefault(t, [])
    if any(x["id"] == aid for x in lst): continue
    lst.insert(0, {"id": aid, "src": src, "url": url, "when": when, "what": what, "next": nxt, "found": now})
    del lst[4:]
    fresh.append(f"{t}\t{what}")
json.dump(a, open(alerts, "w"), ensure_ascii=False, indent=1)
print("\n".join(fresh))
MERGEPY
)
  [ -n "$new" ] && /usr/bin/python3 "$HERE/watch_notes.py" "$TASKS" "$W/tasks.txt" "$W/output" >> "$LOG" 2>&1
  if [ -n "$new" ]; then
    log "sync: $(print -r -- "$new" | /usr/bin/grep -c .) new"
    print -r -- "$new" | while IFS=$'\t' read -r t what; do notify "Task update: $t" "$what"; done
  else
    log "sync: nothing new"
  fi
}

case "${1:-status}" in
tick)
  show 2>"$W/tick-err" | tee "$W/tick-last"
  mins=$(( 10#$(date +%H) * 60 + 10#$(date +%M) ))      # minutes since midnight, local time
  last=$(cat "$LAST" 2>/dev/null); [[ $last == <-> ]] || last=0
  if (( mins >= START_MIN && mins < END_MIN )) && (( $(date +%s) - last >= EVERY )) && (( $(date +%s) - $(mtime "$ALERTS") >= 600 )); then
    ( /bin/zsh "$SELF" sync ) >/dev/null 2>&1 &!
  fi
  ;;
sync) sync_now ;;
now)  sync_now; show ;;
dismiss)
  t=$(print -r -- "$2" | /usr/bin/base64 -D 2>/dev/null)
  /usr/bin/python3 - "$ALERTS" "$t" >> "$SEEN" <<'DISPY'
import json, sys
try: a = json.load(open(sys.argv[1]))
except Exception: a = {}
for x in a.get(sys.argv[2], []): print(x["id"])
DISPY
  log "dismissed: $t"
  print -r -- "ok"
  ;;
status) tail -20 "$LOG" 2>/dev/null ;;
*) print -r -- "usage: watch.sh tick|sync|now|dismiss B64TITLE|status" ;;
esac
