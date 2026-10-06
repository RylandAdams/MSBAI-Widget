#!/bin/zsh
# clickup-sync.sh — keeps ClickUp in step with TASKS.md, which stays the source of truth.
#
# launchd runs it right after tasks-sync.sh, every 5 minutes. Four jobs:
#   close  Every ClickUp task paired under a desk task that has been ticked into ## Done is marked
#          complete. Pairing lines are `- [ClickUp: name](https://app.clickup.com/t/<id>) · synced`.
#          Runs whenever there is one to close, any hour, on a small model with one write tool.
#   pair   Active desk tasks with no `· synced` line get matched to {{OWNER_FIRST}}'s ClickUp tasks (the
#          ones Atlas files from the same meetings), or a ClickUp task is created for them. Every
#          paired or created task lands on {{OWNER_FIRST}}'s Focus Board (assigned to him + tag focus-now).
#          Content is merged both ways (desk notes and links into ClickUp, Atlas's into TASKS.md).
#          Follows clickup-sync.md. Runs when the set of unpaired tasks changes, else every 30 min.
#   reconcile  Every 2 h, already-synced Active tasks are checked for duplicates Atlas filed later
#          (folded into one survivor, the rest marked complete) and for new content on either side.
#   snapshot  Every 30 min, {{OWNER_FIRST}}'s open ClickUp tasks that are shared with someone else are written
#          to .clickup-collab.tsv for the widget's Collab tab. A task that is new or changed since
#          the last look gets its drop-down rebuilt (context + links, from ClickUp, Slack, Drive and
#          Gmail) into .clickup-collab-notes.tsv.
#
#   clickup-sync.sh           # a scheduled run
#   clickup-sync.sh now       # pair regardless of the hour or the last run
#   clickup-sync.sh reconcile # reconcile now
#   clickup-sync.sh snapshot  # refresh the widget's Collab snapshot now
#   clickup-sync.sh status    # pending closes, unpaired tasks, the tail of the log

HERE=${0:A:h}
ROOT=${HERE:h}
TASKS="$ROOT/TASKS.md"
S="$HERE/.tasks-sync"
LOG="$S/log"
CLOSED="$S/clickup-closed"            # ClickUp ids already marked complete, one per line
PAIRLAST="$S/clickup-pair-last"       # epoch <TAB> signature of the unpaired set at the last pair run
RECLAST="$S/clickup-reconcile-last"   # epoch of the last reconcile run
SNAPLAST="$S/clickup-snap-last"       # epoch of the last Collab snapshot
FOCUS="$HERE/.clickup-collab.tsv"     # the snapshot the widget's Collab tab reads
CNOTES="$HERE/.clickup-collab-notes.tsv"  # id <TAB> one drop-down line, several lines per task
CSEEN="$S/clickup-collab-seen"        # id <TAB> date_updated each task's notes were built from
LIMIT=1200
PAIR_EVERY=1800
REC_EVERY=7200
SNAP_EVERY=1800                       # Collab snapshot every 30 minutes (was 10; {{OWNER_FIRST}}, Oct 6)

export PATH="$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
mkdir -p "$S"; touch "$CLOSED"

log() { print -r -- "$(date '+%F %T')  clickup: $*" >> "$LOG"; }

# One python pass over TASKS.md: "C <id>" for each synced id under ## Done, "U <title>" for each
# open Active task with no synced line, "P <title>" for each open Active task that has one.
scan() {
  /usr/bin/python3 - "$TASKS" <<'PY'
import re, sys
sec, task, synced = None, None, False
out = []
def flush():
    if sec == "Active" and task: out.append(("P " if synced else "U ") + task)
for line in open(sys.argv[1], encoding="utf-8"):
    line = line.rstrip("\n")
    h = re.match(r"^## (\w+)", line)
    if h:
        flush(); sec, task, synced = h.group(1), None, False; continue
    t = re.match(r"^- \[( |x|X)\] \*\*(.+?)\*\*", line)
    if t:
        flush(); task, synced = (t.group(2) if t.group(1) == " " else None), False; continue
    for cid in re.findall(r"\]\(https://app\.clickup\.com/t/([0-9a-z]+)\)\s*·\s*synced", line):
        synced = True
        if sec == "Done": out.append("C " + cid)
flush()
print("\n".join(out))
PY
}

lines=$(scan)
pending=() unpaired=() paired=()
for l in ${(f)lines}; do
  case $l in
    C\ *) /usr/bin/grep -qxF "${l#C }" "$CLOSED" || pending+=("${l#C }") ;;
    U\ *) unpaired+=("${l#U }") ;;
    P\ *) paired+=("${l#P }") ;;
  esac
done
pending=(${(u)pending})

if [[ ${1:-run} == status ]]; then
  print -r -- "to close in ClickUp: ${#pending}  ${pending[*]}"
  print -r -- "unpaired desk tasks: ${#unpaired}"; for u in $unpaired; do print -r -- "  - $u"; done
  print -r -- "synced desk tasks: ${#paired}"
  [ -f "$FOCUS" ] && print -r -- "collab snapshot: $(/usr/bin/grep -c . "$FOCUS") task(s), $(date -r "$FOCUS" '+%H:%M')"
  /usr/bin/grep 'clickup:' "$LOG" | tail -10
  exit 0
fi

if ! mkdir "$S/cu-lock" 2>/dev/null; then
  age=$(( $(date +%s) - $(/usr/bin/stat -f %m "$S/cu-lock") ))
  (( age < 2 * LIMIT + 60 )) && exit 0
  rmdir "$S/cu-lock"; mkdir "$S/cu-lock" || exit 0
fi
trap 'rmdir "$S/cu-lock" 2>/dev/null' EXIT

source "$HERE/cu_limit.zsh"
run_claude() {   # model, prompt file, tools... (nothing runs while ClickUp's daily limit is spent)
  local model=$1 prompt=$2; shift 2
  if cu_blocked; then print -r -- "SKIPPED: ClickUp daily limit reached, waiting until $(cu_until)"; return 0; fi
  local out
  out=$(cd "$ROOT" && /usr/bin/perl -e 'alarm shift; exec @ARGV' $LIMIT \
    claude -p --model "$model" --permission-mode dontAsk --allowedTools "$@" < "$prompt" 2>&1)
  cu_note "$out"
  print -r -- "$out"
}

# --- close ------------------------------------------------------------------------------
if (( ${#pending} )); then
  {
    print -r -- "Mark each of these ClickUp tasks complete, unattended; nobody will answer."
    print -r -- "For each id: call clickup_update_task with status \"complete\". If that status is"
    print -r -- "refused, call clickup_get_task with expand_statuses true and use the status whose"
    print -r -- "type is \"closed\". A task that is already closed counts as done. Change nothing else."
    print -r -- "Then print one line per id and nothing else: \`CLOSED <id>\` or \`FAILED <id> <why>\`."
    print -r -- ""
    for id in $pending; do print -r -- "- $id"; done
  } > "$S/clickup-close-prompt.md"
  out=$(run_claude haiku "$S/clickup-close-prompt.md" ToolSearch \
        mcp__claude_ai_ClickUp__clickup_update_task mcp__claude_ai_ClickUp__clickup_get_task)
  print -r -- "$out" > "$S/clickup-close-output"
  done_ids=(${(f)"$(print -r -- "$out" | /usr/bin/sed -nE 's/^`?CLOSED ([0-9a-z]+)`?$/\1/p')"})
  for id in $done_ids; do
    (( ${pending[(Ie)$id]} )) && print -r -- "$id" >> "$CLOSED"
  done
  log "closed ${#done_ids}/${#pending}: ${done_ids[*]}$( (( ${#done_ids} < ${#pending} )) && print -r -- " — see clickup-close-output")"
fi

# --- snapshot ---------------------------------------------------------------------------
# The widget's Collab tab lists {{OWNER_FIRST}}'s open tasks that someone else is also assigned to. A small
# model reads them and prints one TSV line per task; this script writes the file, so the model needs
# no write tool.
h=$(( 10#$(date +%H) ))
now=$(date +%s)
snap_last=$(cat "$SNAPLAST" 2>/dev/null)
if [[ ${1:-run} == snapshot ]] || { [[ ${1:-run} == run ]] && (( h >= 6 && h < 22 )) && (( now - ${snap_last:-0} >= SNAP_EVERY )); }; then
  {
    print -r -- "List {{OWNER_FIRST}}'s shared ClickUp tasks, unattended; nobody will answer."
    print -r -- "Call clickup_filter_tasks with assignees [\"{{OWNER_CLICKUP_ID}}\"], include_closed false, every page"
    print -r -- "until has_more is false. Keep only tasks with at least one assignee besides {{OWNER_FULL}}"
    print -r -- "(id {{OWNER_CLICKUP_ID}}), and skip tasks whose status is complete, done or cancelled. Print one line per"
    print -r -- "kept task and nothing else, fields separated by a single TAB character:"
    print -r -- "CU<TAB>id<TAB>status<TAB>due date as YYYY-MM-DD in America/Los_Angeles, or -<TAB>list name<TAB>the other assignees' first names, comma-separated<TAB>date_updated exactly as returned<TAB>task name"
    print -r -- "Replace any TAB or newline inside a field with a space. No code fences, no other text."
    print -r -- "If no task qualifies, print exactly CU_NONE. If the call fails, print FAILED <why>."
    print -r -- ""
    print -r -- "You already have every tool this needs. Never ask for Bash, a script or any other tool, never"
    print -r -- "offer options, never explain. Read each page's JSON yourself and print the lines. If a tool"
    print -r -- "result says it was too large and was saved to a file, open that file with Read and carry on."
  } > "$S/clickup-snap-prompt.md"
  snaptools=(ToolSearch Read mcp__claude_ai_ClickUp__clickup_filter_tasks)
  out=$(run_claude haiku "$S/clickup-snap-prompt.md" $snaptools)
  rows=$(print -r -- "$out" | /usr/bin/grep -E $'^CU\t[0-9a-z]+\t')
  # Haiku now and then stalls on the pagination and asks for a shell instead of answering (13 times
  # Oct 2 to 4). One retry on Sonnet, which follows the format reliably, before counting a failure.
  if [ -z "$rows" ] && ! print -r -- "$out" | /usr/bin/grep -q 'CU_NONE'; then
    first=$(print -r -- "$out" | tail -1 | cut -c1-120)
    out=$(run_claude sonnet "$S/clickup-snap-prompt.md" $snaptools)
    rows=$(print -r -- "$out" | /usr/bin/grep -E $'^CU\t[0-9a-z]+\t')
    { [ -n "$rows" ] || print -r -- "$out" | /usr/bin/grep -q 'CU_NONE'; } && log "snapshot: haiku missed ($first), sonnet retry ok"
  fi
  if [ -n "$rows" ]; then
    print -r -- "$rows" | /usr/bin/sed $'s/^CU\t//' > "$FOCUS.tmp" && mv "$FOCUS.tmp" "$FOCUS"
    print -r -- "$now" > "$SNAPLAST"
  elif print -r -- "$out" | /usr/bin/grep -q 'CU_NONE'; then
    : > "$FOCUS"; print -r -- "$now" > "$SNAPLAST"     # nothing shared
  else
    print -r -- "$out" > "$S/clickup-snap-output"
    log "snapshot FAILED after retry: $(print -r -- "$out" | tail -1 | cut -c1-200)"
  fi
fi

# --- collab details -----------------------------------------------------------------------
# Notes are rebuilt only for shared tasks that are new or changed in ClickUp (date_updated moved),
# at most 4 a run, so the slow part runs rarely. Notes for tasks no longer shared are dropped.
if [ -s "$FOCUS" ] && { [[ ${1:-run} == snapshot ]] || { [[ ${1:-run} == run ]] && (( h >= 6 && h < 22 )); }; }; then
  touch "$CSEEN" "$CNOTES"
  stale=()
  while IFS=$'\t' read -r cid _st _due _list _who cupd _name; do
    [[ -z $cid ]] && continue
    /usr/bin/grep -qxF "$cid"$'\t'"$cupd" "$CSEEN" || stale+=("$cid"$'\t'"$cupd"$'\t'"$_name")
  done < "$FOCUS"
  live=$(cut -f1 "$FOCUS")
  /usr/bin/awk -F'\t' 'NR==FNR {k[$1]=1; next} k[$1]' <(print -r -- "$live") "$CNOTES" > "$CNOTES.tmp" && mv "$CNOTES.tmp" "$CNOTES"
  if (( ${#stale} )); then
    stale=(${stale[1,4]})
    {
      print -r -- "Build the detail notes for some of {{OWNER_FULL}}'s shared ClickUp tasks, unattended; nobody"
      print -r -- "will answer. {{OWNER_FIRST}} is an operations / BD contractor at MSBAI, Tam Fortis and Nexcavate."
      print -r -- "These notes show when he opens the task in his desk widget, so write them for him."
      print -r -- ""
      print -r -- "For each task: clickup_get_task with include [\"description\"]. Then write, in order:"
      print -r -- "1. Two to four plain-language sentences: what the task is, who asked for what, the current"
      print -r -- "   state, any decision or deadline, and what {{OWNER_FIRST}}'s part is. Expand acronyms. No filler."
      print -r -- "2. Every link in the description, one per line, as [Kind: short label](url), Kind being"
      print -r -- "   Slack, Drive, Gmail, Transcript, ClickUp or Web."
      print -r -- "3. Up to 3 more relevant links you find: search Slack (slack_search_public_and_private),"
      print -r -- "   Google Drive (search_files) and Gmail (search_threads) with the task's distinctive terms."
      print -r -- "   Only link a thread, document or email that is clearly about this task, and only URLs a"
      print -r -- "   tool returned. A Gmail thread links as https://mail.google.com/mail/u/0/#all/<threadId>."
      print -r -- "4. Last: [ClickUp: open task](https://app.clickup.com/t/<id>)"
      print -r -- ""
      print -r -- "Output only lines of the form N<TAB>task id<TAB>one note line, a separate line for the"
      print -r -- "summary and for each link (a TAB character, not spaces; no bullets, no code fences, no"
      print -r -- "markdown other than links). Nothing else."
      print -r -- ""
      print -r -- "Tasks (id, name):"
      for x in $stale; do print -r -- "- ${x%%$'\t'*}  ${x##*$'\t'}"; done
    } > "$S/clickup-collab-prompt.md"
    ctools=(ToolSearch
      mcp__claude_ai_ClickUp__clickup_get_task mcp__claude_ai_ClickUp__clickup_search
      mcp__claude_ai_Slack__slack_search_public_and_private mcp__claude_ai_Slack__slack_read_thread
      mcp__claude_ai_Google_Drive__search_files mcp__claude_ai_Google_Drive__get_file_metadata
      mcp__claude_ai_Gmail__search_threads)
    out=$(run_claude ${CLICKUP_SYNC_MODEL:-sonnet} "$S/clickup-collab-prompt.md" $ctools)
    print -r -- "$out" > "$S/clickup-collab-output"
    built=0
    for x in $stale; do
      cid=${x%%$'\t'*}; rest=${x#*$'\t'}; cupd=${rest%%$'\t'*}
      new=$(print -r -- "$out" | /usr/bin/python3 -c '
import re, sys
cid = sys.argv[1]; lines = []
for raw in sys.stdin.read().splitlines():
    f = raw.split("\t")
    if cid not in f[:3]: continue
    text = " ".join(f[f.index(cid) + 1:]).strip()
    links = re.findall(r"\[[^\]]+\]\(https?://[^)\s]+\)", text)
    prose = re.sub(r"\[[^\]]+\]\(https?://[^)\s]+\)", "", text).strip(" -•")
    if prose: lines.append(re.sub(r"\s+", " ", prose))
    lines += links
seen = set()
for l in lines:
    if l not in seen: seen.add(l); print(cid + "\t" + l)
' "$cid")
      [ -n "$new" ] || continue
      /usr/bin/awk -F'\t' -v id="$cid" '$1!=id' "$CNOTES" > "$CNOTES.tmp"
      print -r -- "$new" >> "$CNOTES.tmp" && mv "$CNOTES.tmp" "$CNOTES"
      /usr/bin/awk -F'\t' -v id="$cid" '$1!=id' "$CSEEN" > "$CSEEN.tmp"
      print -r -- "$cid"$'\t'"$cupd" >> "$CSEEN.tmp" && mv "$CSEEN.tmp" "$CSEEN"
      (( built++ ))
    done
    log "collab notes: built $built/${#stale}"
  fi
fi

# --- pair / reconcile -----------------------------------------------------------------------
mode=""
if (( ${#unpaired} )); then
  sig=$(print -r -- "${(j:\n:)unpaired}" | /sbin/md5 -q)
  IFS=$'\t' read -r plast psig < "$PAIRLAST" 2>/dev/null
  if [[ ${1:-run} == now ]]; then mode=pair
  elif [[ ${1:-run} == run ]] && (( h >= 4 && h < 22 )); then
    # a new or changed unpaired set goes now; the same set waits out PAIR_EVERY (Atlas may be late)
    if ! { [[ $sig == $psig ]] && (( now - ${plast:-0} < PAIR_EVERY )); } && (( now - ${plast:-0} >= 300 )); then
      mode=pair
    fi
  fi
fi
if [ -z "$mode" ] && (( ${#paired} )); then
  rlast=$(cat "$RECLAST" 2>/dev/null)
  if [[ ${1:-run} == reconcile ]]; then mode=reconcile
  elif [[ ${1:-run} == run ]] && (( h >= 6 && h < 22 )) && (( now - ${rlast:-0} >= REC_EVERY )); then
    mode=reconcile
  fi
fi
[ -n "$mode" ] || exit 0

{
  cat "$HERE/clickup-sync.md"
  print -r -- ""
  print -r -- "## This run"
  print -r -- ""
  print -r -- "Now: $(date '+%A %b %d %Y, %H:%M %Z')."
  print -r -- "Mode: $mode."
  if [[ $mode == pair ]]; then
    print -r -- "Unpaired Active desk tasks:"
    for u in $unpaired; do print -r -- "- $u"; done
  else
    print -r -- "Synced Active desk tasks to reconcile:"
    for u in $paired; do print -r -- "- $u"; done
  fi
} > "$S/clickup-pair-prompt.md"

tools=(
  Read Grep ToolSearch
  "Edit(/{{HOME}}/AI Tools/TASKS.md)"
  "Edit(/{{HOME}}/Library/Mobile Documents/com~apple~CloudDocs/AI Tools/TASKS.md)"
  mcp__claude_ai_ClickUp__clickup_filter_tasks
  mcp__claude_ai_ClickUp__clickup_search
  mcp__claude_ai_ClickUp__clickup_get_task
  mcp__claude_ai_ClickUp__clickup_get_workspace_hierarchy
  mcp__claude_ai_ClickUp__clickup_get_list
  mcp__claude_ai_ClickUp__clickup_create_task
  mcp__claude_ai_ClickUp__clickup_update_task
  mcp__claude_ai_ClickUp__clickup_add_tag_to_task
)
if [[ $mode == pair ]]; then log "pair: ${#unpaired} unpaired desk task(s)"; else log "reconcile: ${#paired} synced desk task(s)"; fi
out=$(run_claude ${CLICKUP_SYNC_MODEL:-sonnet} "$S/clickup-pair-prompt.md" $tools)
rc=$?
print -r -- "$out" > "$S/clickup-$mode-output"
if [[ $mode == pair ]]; then print -r -- "$now"$'\t'"$sig" > "$PAIRLAST"; fi
print -r -- "$now" > "$RECLAST"        # a pair run reconciles the tasks it touched, too
result=$(print -r -- "$out" | /usr/bin/grep -E '^PAIRED [0-9]+' | tail -1)
if (( rc != 0 )) || [ -z "$result" ]; then
  log "$mode FAILED (exit $rc): $(print -r -- "$out" | tail -1 | cut -c1-200)"
  exit 1
fi
log "$mode: $result"
