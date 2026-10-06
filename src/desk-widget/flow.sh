#!/bin/zsh
# flow.sh — the Priorities tab: the team's workstreams as a top-to-bottom flow, one node per
# meeting that moved them, newest at the bottom. A meeting that splits work starts new streams
# branching off it; each node carries the summary, what got done, what's next, who said what,
# and the transcript, Slack and Drive links behind it.
#
#   flow.sh tick          # the widget's refresh beat: queue new meetings, keep the worker going,
#                         # print "STATUS <TAB> text" and then flow.json on one line
#   flow.sh init DAYS     # first build: queue every meeting from the last DAYS days, oldest first
#   flow.sh worker        # process the queue, one meeting at a time (tick starts it)
#   flow.sh status        # queue length and the tail of the log
#
# Stream names come from ClickUp's Goals & Workstreams lists (streams.tsv beside this script),
# so the flow and ClickUp speak the same language; a stream ClickUp does not have yet can still
# appear, marked as not in ClickUp. A headless Claude reads one transcript plus the current flow,
# and answers with a small JSON patch that this script applies. It reads Slack and Drive for
# links and never writes or sends anything.
#
# State in .flow/: flow.json (streams, nodes, focus), queue (id <TAB> ms <TAB> mins <TAB> title),
# seen (meeting ids done), log, and the last prompt and reply.

SELF=${0:A}                        # $0 inside a zsh function is the function name, so keep the path
HERE=${0:A:h}
ROOT=${HERE:h}
F="$HERE/.flow"
FLOW="$F/flow.json"
QUEUE="$F/queue"
SEEN="$F/seen"
LOG="$F/log"
STREAMS="$HERE/streams.tsv"
MODEL=${FLOW_MODEL:-sonnet}
MIN_MINUTES=8                      # shorter calls are not worth a node

export PATH="$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
mkdir -p "$F"; touch "$QUEUE" "$SEEN"

log() { print -r -- "$(date '+%F %T')  $*" >> "$LOG"; }
claude_run() {   # seconds, model, prompt file, tools...
  local secs=$1 model=$2 prompt=$3; shift 3
  (cd "$ROOT" && /usr/bin/perl -e 'alarm shift; exec @ARGV' $secs \
    claude -p --model "$model" --permission-mode dontAsk --allowedTools "$@" < "$prompt" 2>&1)
}
mtime() { /usr/bin/stat -f %m "$1" 2>/dev/null || print 0; }

# queue a meeting list (id <TAB> ms <TAB> mins <TAB> title on stdin) that is new, long enough,
# at or after the flow's start, and at least an hour old (so Fireflies has the transcript)
enqueue() {
  # the list goes through a file: the python below arrives on stdin, so stdin cannot carry both
  cat > "$F/enqueue.in"
  /usr/bin/python3 - "$QUEUE" "$SEEN" "$F/start" $MIN_MINUTES "$F/enqueue.in" <<'PY'
import sys, time
qpath, spath, startpath, minmins, inpath = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), sys.argv[5]
try: start = float(open(startpath).read().strip())
except Exception: sys.exit(0)            # no init yet: nothing is queued
seen = set(open(spath).read().split())
try: seen |= set(open(spath.rsplit("/", 1)[0] + "/current").read().split())   # being read right now
except Exception: pass
queued = {l.split("\t")[0] for l in open(qpath) if l.strip()}
now = time.time(); add = []
for line in open(inpath, encoding="utf-8", errors="replace"):
    f = line.rstrip("\n").split("\t")
    if len(f) < 4 or not f[0] or f[0].startswith("!!"): continue
    try: ms, mins = int(f[1]), int(f[2])
    except ValueError: continue
    if f[0] in seen or f[0] in queued or mins < minmins: continue
    if ms / 1000 < start or now - ms / 1000 < 3600: continue
    add.append((ms, line.rstrip("\n")))
if add:
    rows = [l.rstrip("\n") for l in open(qpath) if l.strip()] + [l for _, l in sorted(add)]
    rows.sort(key=lambda l: int(l.split("\t")[1]))
    open(qpath, "w").write("\n".join(rows) + "\n")
PY
}

start_worker() {
  [ -d "$F/rlock" ] && (( $(date +%s) - $(mtime "$F/rlock") < 1800 )) && return 0   # a review is writing flow.json
  if [ -s "$QUEUE" ] && { [ ! -d "$F/lock" ] || (( $(date +%s) - $(mtime "$F/lock") > 3600 )); }; then
    ( /bin/zsh "$SELF" worker ) >> "$F/worker.out" 2>&1 &!
  fi
}

# the whole board review (flow_review.py): after new meetings land, and at least once a day,
# 6am to 10pm, never while the worker is writing
start_review() {
  local h=$(date +%H)
  (( 10#$h >= 6 && 10#$h < 22 )) || return 0
  [ -f "$FLOW" ] && [ ! -s "$QUEUE" ] && [ ! -d "$F/lock" ] || return 0
  [ -d "$F/rlock" ] && (( $(date +%s) - $(mtime "$F/rlock") < 1800 )) && return 0
  local age=$(( $(date +%s) - $(mtime "$F/review.out") ))
  # after new meetings land (so a stream Allan pushed up moves within the half hour), and at least once a day
  if { [ -f "$F/review-due" ] && (( age > ${FLOW_REVIEW_GAP:-1800} )); } || (( age > ${FLOW_REVIEW_EVERY:-86400} )); then
    ( /bin/zsh "$SELF" review ) >> "$F/worker.out" 2>&1 &!
  fi
}

case "${1:-status}" in

review)
  if ! mkdir "$F/rlock" 2>/dev/null; then
    (( $(date +%s) - $(mtime "$F/rlock") > 1800 )) || exit 0
    rmdir "$F/rlock"; mkdir "$F/rlock" || exit 0
  fi
  trap 'rmdir "$F/rlock" 2>/dev/null' EXIT
  rm -f "$F/review-due"
  # the next two weeks of the calendar, date and title only, so targets line up with real events
  "$HERE/cal.sh" events 336 2>/dev/null | /usr/bin/python3 -c '
import sys
for l in sys.stdin:
    f = l.rstrip("\n").split("\t")
    if len(f) > 10 and f[0] == "E" and f[4] != "3" and f[5] != "3": print(f[1][:16].replace("T", " ") + " | " + f[10])' > "$F/review-cal.txt"
  /usr/bin/python3 "$HERE/flow_review.py" prompt "$FLOW" "$F/review-cal.txt" "$STREAMS" > "$F/review-prompt.md"
  tools=(ToolSearch Read mcp__claude_ai_Slack__slack_search_public_and_private mcp__claude_ai_Slack__slack_read_thread)
  out=$(claude_run 900 "$MODEL" "$F/review-prompt.md" $tools)
  if ! print -r -- "$out" | /usr/bin/grep -q '^REVIEW_END'; then
    log "review: sonnet did not finish ($(print -r -- "$out" | /usr/bin/grep -o 'safeguards\|API Error\|timed out' | head -1)), trying opus"
    out=$(claude_run 1200 opus "$F/review-prompt.md" $tools)
  fi
  print -r -- "$out" > "$F/review.out"
  : > "$F/review-moves.txt"
  res=$(/usr/bin/python3 "$HERE/flow_review.py" apply "$F/review.out" "$FLOW" "$STREAMS" 2>&1 | tail -1)
  log "review: ${res:0:400}"
  # a stream moving into the top two (or out of first) is worth a notification, 7am to 9pm
  h=$(( 10#$(date +%H) ))
  if [[ $res == ok* ]] && [ -s "$F/review-moves.txt" ] && (( h >= 7 && h < 21 )); then
    msg=$(head -3 "$F/review-moves.txt" | tr '\n' ';' | sed 's/;$//; s/;/; /g' | tr -d '"\\')
    /usr/bin/osascript -e "display notification \"$msg\" with title \"Workstreams re-ranked\"" >/dev/null 2>&1
  fi
  [[ $res == ok* ]] && ( /bin/zsh "$SELF" cupush ) >> "$F/worker.out" 2>&1 &!
  ;;

cupush)   # the board doc, each stream's list description, and lists for ranked streams that have none
  source "$HERE/cu_limit.zsh"
  if cu_blocked; then log "cupush: waiting for ClickUp's daily limit (until $(cu_until))"; touch "$F/cupush-due"; exit 0; fi
  mkdir "$F/culock" 2>/dev/null || { (( $(date +%s) - $(mtime "$F/culock") < 1800 )) && exit 0; rmdir "$F/culock"; mkdir "$F/culock" || exit 0; }
  trap 'rmdir "$F/culock" 2>/dev/null' EXIT
  rm -f "$F/cupush-due"
  mkdir -p "$F/cu"
  /usr/bin/python3 "$HERE/flow_review.py" cuplan "$FLOW" "$STREAMS" "$F/cu-pushed.json" "$F/cu" > "$F/cu/prompt.md"
  if [[ $(head -1 "$F/cu/prompt.md") == nothing ]]; then log "cupush: ClickUp already matches"; exit 0; fi
  out=$(claude_run 900 "$MODEL" "$F/cu/prompt.md" ToolSearch Read \
        mcp__claude_ai_ClickUp__clickup_search mcp__claude_ai_ClickUp__clickup_get_list mcp__claude_ai_ClickUp__clickup_update_list \
        mcp__claude_ai_ClickUp__clickup_get_folder mcp__claude_ai_ClickUp__clickup_create_list_in_folder \
        mcp__claude_ai_ClickUp__clickup_create_document mcp__claude_ai_ClickUp__clickup_list_document_pages \
        mcp__claude_ai_ClickUp__clickup_update_document_page)
  cu_note "$out"
  print -r -- "$out" > "$F/cu/output"
  res=$(/usr/bin/python3 "$HERE/flow_review.py" cuapply "$F/cu/output" "$FLOW" "$STREAMS" "$F/cu-pushed.json" "$F/cu" 2>&1 | tail -1)
  log "cupush: ${res:0:300}"
  ;;

tick)
  # the first beat starts the 3 week build on its own ({{OWNER_FIRST}} chose 3 weeks of history)
  if [ ! -f "$F/start" ]; then ( /bin/zsh "$SELF" init 21 ) >/dev/null 2>&1 &!; fi
  # new meetings come from fireflies.sh's own cached list, which tasks-sync keeps fresh
  [ -f "$HERE/.meetings" ] && enqueue < "$HERE/.meetings"
  start_worker
  start_review
  if [ -f "$F/cupush-due" ] && [ ! -d "$F/culock" ]; then
    source "$HERE/cu_limit.zsh"; cu_blocked || ( /bin/zsh "$SELF" cupush ) >> "$F/worker.out" 2>&1 &!
  fi
  n=$(/usr/bin/grep -c . "$QUEUE" 2>/dev/null)
  if [ -d "$F/lock" ] && (( n > 0 )); then
    print -r -- "STATUS"$'\t'"adding $n meeting$( (( n > 1 )) && print s)"
  elif [ ! -f "$F/start" ]; then
    print -r -- "STATUS"$'\t'"not started"
  elif [ -s "$F/failed" ]; then
    print -r -- "STATUS"$'\t'"$(/usr/bin/grep -c . "$F/failed") meeting(s) could not be read"
  else
    print -r -- "STATUS"$'\t'"up to date"
  fi
  [ -f "$FLOW" ] && /usr/bin/python3 -c 'import json,sys; print(json.dumps(json.load(open(sys.argv[1])), separators=(",", ":")))' "$FLOW" 2>/dev/null
  ;;

init)
  days=${2:-21}
  print -r -- $(( $(date +%s) - days * 86400 )) > "$F/start"
  k=$(tr -d ' \t\r\n' < "$HERE/.fireflies-key" 2>/dev/null)
  [ -n "$k" ] || { print -r -- "no Fireflies key"; exit 0; }
  resp=$(/usr/bin/curl -sS --max-time 45 -X POST "https://api.fireflies.ai/graphql" \
    -H "Content-Type: application/json" -H "Authorization: Bearer $k" \
    -d '{"query":"query { transcripts(limit: 50) { id title date duration } }"}' 2>/dev/null)
  print -r -- "$resp" > "$F/init-response.json"     # kept to see what Fireflies answered
  print -r -- "$resp" | /usr/bin/python3 -c '
import json, sys
try: rows = (json.load(sys.stdin).get("data") or {}).get("transcripts") or []
except Exception: rows = []
for t in rows:
    print("\t".join([str(t.get("id") or ""), str(int(t.get("date") or 0)),
                     str(int(round(float(t.get("duration") or 0)))), " ".join(str(t.get("title") or "untitled").split())]))' | enqueue
  log "init: $days days, $(/usr/bin/grep -c . "$QUEUE") meeting(s) queued"
  start_worker
  print -r -- "queued $(/usr/bin/grep -c . "$QUEUE")"
  ;;

worker)
  if ! mkdir "$F/lock" 2>/dev/null; then
    (( $(date +%s) - $(mtime "$F/lock") > 3600 )) || exit 0
    rmdir "$F/lock"; mkdir "$F/lock" || exit 0
  fi
  trap 'rmdir "$F/lock" 2>/dev/null; : > "$F/current"' EXIT
  log "worker: $(/usr/bin/grep -c . "$QUEUE") meeting(s) to read"
  while [ -s "$QUEUE" ]; do
    touch "$F/lock"                                   # still alive
    IFS=$'\t' read -r id ms mins title < "$QUEUE"
    print -r -- "$id" > "$F/current"                   # so a tick does not queue it again meanwhile
    /usr/bin/sed -i '' '1d' "$QUEUE"
    [ -n "$id" ] || continue
    file=$("$HERE/fireflies.sh" fetch "$id" 2>/dev/null)
    if [ -z "$file" ] || ! /usr/bin/grep -q '^\*\*.*\*\*  ·  `' "$file" 2>/dev/null; then
      log "skip $id ($title): no transcript yet"; continue
    fi
    when=$(date -r $(( ms / 1000 )) '+%A %b %d %Y, %H:%M')
    state=$(/usr/bin/python3 - "$FLOW" <<'PY'
import json, sys
try: d = json.load(open(sys.argv[1]))
except Exception: d = {"streams": [], "nodes": []}
nodes = {n["id"]: n for n in d.get("nodes", [])}
if d.get("focus"): print("Current focus: " + d["focus"])
if not d.get("streams"): print("No streams yet: this is the first meeting.")
for s in d.get("streams", []):
    mine = [n for n in d.get("nodes", []) if s["id"] in n.get("streams", [])][-2:]
    hist = "; ".join(f'{n["date"][:10]} {n["title"]}' for n in mine)
    tgt = (s.get("target", "") + (" by " + s["target_date"] if s.get("target_date") else "")).strip()
    print(f'- id {s["id"]} | {s["name"]} | {s.get("company","")} | {s.get("status","active")} | target: {tgt} | now: {s.get("now","")} | next: {s.get("next","")} | last: {hist}')
PY
)
    {
      print -r -- "Place one meeting into the team's priorities flow, unattended; nobody will answer."
      print -r -- "The team works across MSBAI (GURU, OrbitGuard, HPCMP CFD, NASA, BD), Tam Fortis Solutions"
      print -r -- "(microreactors) and Nexcavate (PermitPulse), all led by Allan Grosvenor. At any time 3 or 4"
      print -r -- "streams of work are active, sometimes one big focus for the week."
      print -r -- ""
      print -r -- "Meeting: \"$title\", $when, $mins min. Transcript: $file"
      print -r -- "Read the transcript in full with Read. Fix names Fireflies mangles: Alan/Allen is Allan"
      print -r -- "Grosvenor, Chris is Kriss Gardner, Aisha is Ayesha Dewan, Araz is Aras Dogan, Ryan Wilson is"
      print -r -- "Ryland Adams, Dewyer is Dwyer Deighan."
      print -r -- ""
      print -r -- "The flow so far:"
      print -r -- "$state"
      print -r -- ""
      print -r -- "ClickUp's workstream lists, as program <TAB> list name. When a stream matches one, use that"
      print -r -- "list name as the stream name and in \"clickup\"; only invent a name for work ClickUp has no list for:"
      cut -f2,3 "$STREAMS"
      print -r -- ""
      print -r -- "Then, for links only: search Slack (slack_search_public_and_private) and Drive (search_files)"
      print -r -- "for the threads and documents this meeting named, within a few days of it. Only URLs a tool"
      print -r -- "returned."
      print -r -- ""
      print -r -- "Answer with one JSON object between a line FLOW_START and a line FLOW_END, nothing else:"
      print -r -- '{"skip": false,'
      print -r -- ' "node": {"title": "short name for what this meeting was about",'
      print -r -- '          "summary": "two or three plain sentences: what happened",'
      print -r -- '          "done": ["what got done or decided"],'
      print -r -- '          "next": [{"what": "what happens next", "who": "first name"}],'
      print -r -- '          "said": [{"who": "Allan", "what": "the point he made, in plain words"}],'
      print -r -- '          "links": [{"kind": "Slack|Drive|ClickUp|Web", "label": "short label", "url": "..."}]},'
      print -r -- ' "streams": ["ids of existing streams this meeting moved"],'
      print -r -- ' "new_streams": [{"name": "...", "clickup": "the ClickUp list name it matches, or empty",'
      print -r -- '                  "company": "MSBAI|Tam Fortis|Nexcavate", "now": "where it stands",'
      print -r -- '                  "next": "the next step", "branch_from": "id of the stream it split off, or empty",'
      print -r -- '                  "target": "the event, deadline or result it is building toward", "target_date": "YYYY-MM-DD or empty"}],'
      print -r -- ' "stream_updates": [{"id": "...", "status": "active|paused|done|merged", "now": "...", "next": "...",'
      print -r -- '                     "into": "for merged: the id of the stream it folded into", "why": "for any status change: why, in one line",'
      print -r -- '                     "target": "only if it changed", "target_date": "only if it changed"}],'
      print -r -- ' "focus": "one line, only if this meeting set the team'"'"'s big focus for the week, else empty"}'
      print -r -- ""
      print -r -- "Rules: keep the flow readable. The team drives 3 or 4 main streams at a time, so keep about 6"
      print -r -- "active streams at most in the whole flow. A meeting usually moves 1 to 3 of them: list only"
      print -r -- "the streams where something was decided, finished or handed off, and fold side topics into the"
      print -r -- "summary instead. Most streams build toward something (a customer meeting, a submission, a demo, a"
      print -r -- "result Allan asked for): record it as target and target_date. When this meeting shows the target"
      print -r -- "happened (the meeting was held, the proposal went in, the result was shown), mark the stream done"
      print -r -- "with why, even if more work will follow later; follow on work becomes a new stream or reopens it."
      print -r -- "When the team says the work is on hold or the focus moved away, mark it paused. A paused stream"
      print -r -- "that comes back is set active again. Use a broad ClickUp list (for example BizDev & Proposal Research Pipeline)"
      print -r -- "rather than splitting every pursuit into its own stream; but a pursuit that has its own deadline and"
      print -r -- "people (for example the Supersonics challenge, a NASA phase, an Army proposal) gets its own stream,"
      print -r -- "and named technical efforts Allan tracks (for example the hypersonic dive convergence work, which is"
      print -r -- "the SU2 Validation & Hypersonic Cases list) get their own stream rather than folding into another. When a stream goes quiet or"
      print -r -- "is absorbed, mark it paused, done or merged. A new stream only for real work that will run"
      print -r -- "on its own for days or weeks; prefer an existing stream. Keep \"said\" to the few points that steer the work,"
      print -r -- "Allan's first. Plain language a high schooler could follow. No em dashes, en dashes or"
      print -r -- "connector hyphens. Write GURU in all caps. Never invent anything. If the meeting moved no"
      print -r -- "work (social, a test call, a demo for someone else with no follow up), answer {\"skip\": true}."
      print -r -- "If a tool result was saved to a file because it was large, open it with Read."
    } > "$F/prompt.md"
    out=$(claude_run 900 "$MODEL" "$F/prompt.md" ToolSearch Read \
          mcp__claude_ai_Slack__slack_search_public_and_private mcp__claude_ai_Slack__slack_read_thread \
          mcp__claude_ai_Google_Drive__search_files)
    # defense topics (interceptors, hypersonics) sometimes trip Sonnet's safeguards and the reply
    # comes back as an API error; Opus reads those meetings fine, so try it before giving up
    if ! print -r -- "$out" | /usr/bin/grep -q '^FLOW_END'; then
      log "sonnet did not finish $title ($(print -r -- "$out" | /usr/bin/grep -o 'safeguards\|API Error\|Message ID\|timed out' | head -1)), trying opus"
      out=$(claude_run 1200 opus "$F/prompt.md" ToolSearch Read \
            mcp__claude_ai_Slack__slack_search_public_and_private mcp__claude_ai_Slack__slack_read_thread \
            mcp__claude_ai_Google_Drive__search_files)
    fi
    print -r -- "$out" > "$F/output"
    # the reply goes in by file: a pipe and this heredoc would both feed python's stdin
    res=$(/usr/bin/python3 - "$F/output" "$FLOW" "$id" "$ms" "$title" "$file" "$ROOT" <<'PY'
import json, os, re, sys, datetime
out_path, flow_path, mid, ms, title, tfile, root = sys.argv[1:8]
raw = open(out_path, encoding="utf-8", errors="replace").read()
m = re.search(r"^FLOW_START\s*$(.*?)^FLOW_END\s*$", raw, re.S | re.M)
body = m.group(1) if m else raw
p = None
for k in [i for i, ch in enumerate(body) if ch == "{"][:20]:     # first object that parses, newlines in strings allowed
    try: p, _ = json.JSONDecoder(strict=False).raw_decode(body[k:]); break
    except Exception: continue
if not isinstance(p, dict): print("bad"); sys.exit(0)
if p.get("skip"): print("skip"); sys.exit(0)
try: d = json.load(open(flow_path))
except Exception: d = {"streams": [], "nodes": [], "focus": ""}
PALETTE = ["#0A84FF", "#FF9F0A", "#30D158", "#BF5AF2", "#FF375F", "#64D2FF", "#FFD60A", "#AC8E68", "#5E5CE6", "#66D4CF"]
ids = {s["id"] for s in d["streams"]}
def slug(n):
    b = re.sub(r"[^a-z0-9]+", "-", n.lower()).strip("-")[:40].strip("-") or "stream"
    s, k = b, 2
    while s in ids: s, k = f"{b}-{k}", k + 1
    return s
when = datetime.datetime.fromtimestamp(int(ms) / 1000).astimezone().isoformat()
nid = "n" + ms
node = p.get("node") or {}
touched = [s for s in (p.get("streams") or []) if s in ids]
born = []
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(flow_path))))
try: from flow_review import same_work
except Exception: same_work = lambda a, b: False
for ns in p.get("new_streams") or []:
    name = str(ns.get("name") or "").strip()
    if not name: continue
    twin = next((s for s in d["streams"] if s["name"].lower() == name.lower() or (s.get("status") != "done" and same_work(name, s["name"]))), None)
    if twin:                                  # already a stream under this or a close name: this meeting moved it
        if twin["id"] not in touched: touched.append(twin["id"])
        continue
    sid = slug(name); ids.add(sid)
    used = {s.get("color") for s in d["streams"] if s.get("status") != "done"}
    color = next((c for c in PALETTE if c not in used), PALETTE[len(d["streams"]) % len(PALETTE)])
    parent = ns.get("branch_from") if ns.get("branch_from") in ids else ""
    d["streams"].append({"id": sid, "name": name, "clickup": ns.get("clickup") or "",
                         "company": ns.get("company") or "", "color": color, "status": "active",
                         "bornFrom": nid, "parent": parent, "now": ns.get("now") or "", "next": ns.get("next") or "",
                         "target": ns.get("target") or "", "target_date": ns.get("target_date") or "",
                         "history": [{"date": when, "from": "", "to": "active", "why": "started", "by": "meeting", "node": nid}]})
    born.append(sid)
ts = lambda x: datetime.datetime.fromisoformat(x).timestamp() if x else 0
def latest(sid):
    return max([ts(n["date"]) for n in d["nodes"] if sid in n.get("streams", []) and n["id"] != nid] or [0])
for u in p.get("stream_updates") or []:
    for s in d["streams"]:
        if s["id"] == u.get("id"):
            if latest(s["id"]) > ts(when):          # a late read of an older meeting: link it, change nothing
                if u.get("id") not in touched: touched.append(u["id"])
                continue
            for k in ("target", "target_date"):
                if u.get(k): s[k] = u[k]
            prev = s.get("status", "active")
            for k in ("now", "next"):
                if u.get(k): s[k] = u[k]
            st = u.get("status")
            if st == "merged":
                s["status"] = "done"; s["endNode"] = nid; s["ended"] = "merged"
                if u.get("into") in ids:
                    s["mergedInto"] = u["into"]
                    if u["into"] not in touched: touched.append(u["into"])
                if u.get("why"): s["why"] = u["why"]
            elif st in ("active", "paused", "done"):
                s["status"] = st
                if st != "done" and prev == "done":       # reopened: it runs on from here
                    for k in ("endNode", "ended", "mergedInto"): s.pop(k, None)
                if st == "done":
                    s["endNode"] = nid; s["ended"] = "done"
                    if u.get("why"): s["why"] = u["why"]
            if s.get("status") != prev:
                s.setdefault("history", []).append({"date": when, "from": prev, "to": s["status"], "why": u.get("why") or "", "by": "meeting", "node": nid})
            if u.get("id") not in touched and u.get("id") not in born: touched.append(u["id"])
links = [l for l in (node.get("links") or []) if isinstance(l, dict) and str(l.get("url", "")).startswith("http")]
links.insert(0, {"kind": "Transcript", "label": title, "url": "https://app.fireflies.ai/view/" + mid})
d["nodes"] = [n for n in d["nodes"] if n["id"] != nid]
d["nodes"].append({"id": nid, "meeting": mid, "date": when, "title": node.get("title") or title,
                   "meetingTitle": title, "streams": touched + born, "spawns": born,
                   "summary": node.get("summary") or "", "done": node.get("done") or [],
                   "next": node.get("next") or [], "said": node.get("said") or [], "links": links,
                   "transcript": os.path.relpath(tfile, root) if tfile.startswith(root) else tfile})
d["nodes"].sort(key=lambda n: n["date"])
if p.get("focus"): d["focus"] = p["focus"]; d["focusSet"] = when
d["updated"] = datetime.datetime.now().astimezone().isoformat()
tmp = flow_path + ".tmp"
json.dump(d, open(tmp, "w"), indent=1); os.replace(tmp, flow_path)
print("ok " + ",".join(touched + born))
PY
)
    case $res in
      ok*)  print -r -- "$id" >> "$SEEN"; log "added: $title -> ${res#ok }"; touch "$F/review-due" ;;
      skip) print -r -- "$id" >> "$SEEN"; log "skipped (no work moved): $title" ;;
      *)    # a failed read (an API hiccup, a cut off reply) goes to the back of the queue once
            tries=$(/usr/bin/grep -cx "$id" "$F/attempts" 2>/dev/null); print -r -- "$id" >> "$F/attempts"
            if (( ${tries:-0} < 1 )); then
              print -r -- "$id"$'\t'"$ms"$'\t'"$mins"$'\t'"$title" >> "$QUEUE"; log "retry later: $title"
            else   # kept in .flow/failed (shown in the header) so it is never silently lost; `flow.sh retry` re-reads it
              print -r -- "$id" >> "$SEEN"; log "FAILED: $title: $(print -r -- "$out" | tail -1 | cut -c1-160)"
              print -r -- "$id"$'\t'"$ms"$'\t'"$mins"$'\t'"$title"$'\t'"$(print -r -- "$out" | tail -1 | tr '\t' ' ' | cut -c1-120)" >> "$F/failed"
            fi ;;
    esac
  done
  ;;

retry)   # read the meetings that failed again (they are listed in .flow/failed)
  [ -s "$F/failed" ] || { print -r -- "nothing failed"; exit 0; }
  /usr/bin/python3 - "$F/failed" "$SEEN" "$QUEUE" "$F/attempts" <<'PY'
import sys
fp, sp, qp, ap = sys.argv[1:5]
rows = [l.rstrip("\n").split("\t") for l in open(fp) if l.strip()]
ids = {r[0] for r in rows}
keep = [l for l in open(sp) if l.strip() not in ids]       # read first: opening for write empties the file
open(sp, "w").write("".join(keep))
try:
    keep = [l for l in open(ap) if l.strip() not in ids]
    open(ap, "w").write("".join(keep))
except Exception: pass
q = [l.rstrip("\n") for l in open(qp) if l.strip()]
have = {l.split("\t")[0] for l in q}
q += ["\t".join(r[:4]) for r in rows if r[0] not in have]
q.sort(key=lambda l: int(l.split("\t")[1]))
open(qp, "w").write("\n".join(q) + "\n"); open(fp, "w").write("")
print("requeued %d" % len(ids))
PY
  start_worker
  ;;

status)
  print -r -- "queued: $(/usr/bin/grep -c . "$QUEUE" 2>/dev/null)"
  [ -s "$F/failed" ] && print -r -- "failed: $(/usr/bin/grep -c . "$F/failed")"
  tail -20 "$LOG" 2>/dev/null
  ;;
esac
exit 0
