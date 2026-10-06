#!/bin/zsh
# tasks-sync.sh — puts {{OWNER_FIRST}}'s asks from meetings and Slack into TASKS.md, unattended.
#
# launchd runs it every 5 minutes (com.msbai.tasks-sync). A run with no new meeting only checks
# Fireflies and stops, unless the Slack sweep is due (every 30 minutes). Each full run:
#   1. asks Fireflies for recent meetings, fetches any it hasn't handled into transcripts/,
#      and drops the ones {{OWNER_FIRST}} wasn't invited to
#   2. hands those transcripts plus a Slack window (since the last good run) to a headless
#      Claude, which follows tasks-sync.md and inserts tasks into TASKS.md
#   3. on success, remembers the meetings and the time, and posts a notification if it added any
#
# Claude runs in dontAsk mode with read-only tools, plus Edit on TASKS.md and nothing else: it
# cannot send a Slack message, an email, or touch any other file.
#
#   tasks-sync.sh            # a scheduled run (skips 10pm–4am)
#   tasks-sync.sh now        # run regardless of the hour
#   tasks-sync.sh init DAYS  # first install: mark older meetings handled, start Slack DAYS back
#   tasks-sync.sh status     # last run, and the tail of the log

HERE=${0:A:h}
ROOT=${HERE:h}                       # ~/AI Tools
S="$HERE/.tasks-sync"
LOG="$S/log"
LAST="$S/last"                       # epoch of the last good run; the Slack window starts here
SEEN="$S/meetings"                   # Fireflies ids already handled, one per line
MODEL=${TASKS_SYNC_MODEL:-sonnet}
LIMIT=1500                           # seconds before a run is killed
OVERLAP=900                          # Slack window reaches this far behind the last run
SLACK_EVERY=1800                     # with no new meeting, sweep Slack at most this often

export PATH="$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
mkdir -p "$S"
touch "$SEEN"

log() { print -r -- "$(date '+%F %T')  $*" >> "$LOG"; }

case "${1:-run}" in
  status)
    [ -f "$LAST" ] && print -r -- "last good run: $(date -r $(cat "$LAST") '+%a %b %d %H:%M')"
    tail -20 "$LOG" 2>/dev/null
    exit 0
    ;;
  init)
    days=${2:-1}
    since=$(( $(date +%s) - days * 86400 ))
    print -r -- $since > "$LAST"
    # Meetings before the window, and any whose transcript TASKS.md already cites, are done.
    "$HERE/fireflies.sh" refresh | while IFS=$'\t' read -r id ms mins title; do
      [[ -z $id || $id == '!!'* ]] && continue
      if (( ms / 1000 < since )) || /usr/bin/grep -qF "$id" "$ROOT/TASKS.md"; then
        /usr/bin/grep -qxF "$id" "$SEEN" || print -r -- "$id" >> "$SEEN"
      fi
    done
    log "init: window from $(date -r $since '+%F %T'), $(wc -l < "$SEEN" | tr -d ' ') meetings marked handled"
    exit 0
    ;;
  run)
    h=$(( 10#$(date +%H) ))
    (( h >= 22 || h < 4 )) && exit 0
    ;;
  now) ;;
  *) print -u2 "usage: tasks-sync.sh [now|init DAYS|status]"; exit 2 ;;
esac

# One run at a time. A lock older than the run limit is from a run that died.
if ! mkdir "$S/lock" 2>/dev/null; then
  age=$(( $(date +%s) - $(/usr/bin/stat -f %m "$S/lock") ))
  (( age < LIMIT + 60 )) && exit 0
  rmdir "$S/lock"; mkdir "$S/lock" || exit 0
fi
trap 'rmdir "$S/lock" 2>/dev/null' EXIT

now=$(date +%s)
since=$(cat "$LAST" 2>/dev/null)
[ -n "$since" ] || since=$(( now - 86400 ))
window=$(( since - OVERLAP ))

# --- meetings ---------------------------------------------------------------------------
files=() ids=()
list=$("$HERE/fireflies.sh" refresh)
case "$list" in '!!'*) log "fireflies: ${list#!!}, meetings skipped this run" ;; esac
while IFS=$'\t' read -r id ms mins title; do
  [[ -z $id || $id == '!!'* ]] && continue
  /usr/bin/grep -qxF "$id" "$SEEN" && continue
  f=$("$HERE/fireflies.sh" fetch "$id" 2>/dev/null) || continue
  # Fireflies can list a meeting before its sentences are ready. An empty transcript is
  # deleted so the next run fetches it again; after a day, give up on it.
  if ! /usr/bin/grep -q '^\*\*.*\*\*  ·  `' "$f"; then
    rm -f "$f"
    (( now - ms / 1000 > 86400 )) && print -r -- "$id" >> "$SEEN"
    continue
  fi
  # Only meetings {{OWNER_FIRST}} was on. No participant list means we can't tell, so keep it.
  if /usr/bin/grep -q '^\*\*Participants\*\*' "$f" && ! /usr/bin/grep -qi '{{owner_first}}' "$f"; then
    print -r -- "$id" >> "$SEEN"
    continue
  fi
  files+=("${f#$ROOT/}") ids+=("$id")
done <<< "$list"

# Nothing new from Fireflies: a scheduled run only goes on when the Slack sweep is due.
[[ ${1:-run} == run ]] && (( ! ${#files} && now - since < SLACK_EVERY )) && exit 0

# --- the run ----------------------------------------------------------------------------
tools=(
  Read Glob Grep ToolSearch
  "Edit(/{{HOME}}/AI Tools/TASKS.md)"
  "Edit(/{{HOME}}/Library/Mobile Documents/com~apple~CloudDocs/AI Tools/TASKS.md)"
  mcp__claude_ai_Slack__slack_search_public_and_private
  mcp__claude_ai_Slack__slack_search_public
  mcp__claude_ai_Slack__slack_read_thread
  mcp__claude_ai_Slack__slack_read_channel
  mcp__claude_ai_Slack__slack_read_user_profile
  mcp__claude_ai_Slack__slack_search_users
  mcp__claude_ai_Slack__slack_search_channels
  mcp__claude_ai_Slack__slack_read_canvas
  mcp__claude_ai_Fireflies__fireflies_get_transcript
  mcp__claude_ai_Fireflies__fireflies_get_summary
  mcp__claude_ai_Fireflies__fireflies_search
  mcp__claude_ai_Google_Drive__search_files
  mcp__claude_ai_Google_Drive__get_file_metadata
  mcp__claude_ai_Google_Drive__read_file_content
  mcp__claude_ai_Google_Drive__list_recent_files
  mcp__claude_ai_Gmail__search_threads
  mcp__claude_ai_Gmail__get_thread
  mcp__claude_ai_Gmail__get_message
  mcp__claude_ai_ClickUp__clickup_search
  mcp__claude_ai_ClickUp__clickup_get_task
  mcp__claude_ai_ClickUp__clickup_filter_tasks
)

{
  cat "$HERE/tasks-sync.md"
  print -r -- ""
  print -r -- "## This run"
  print -r -- ""
  print -r -- "Now: $(date '+%A %b %d %Y, %H:%M %Z')."
  print -r -- "Slack window starts: $window ($(date -r $window '+%a %b %d %H:%M'))."
  if (( ${#files} )); then
    print -r -- "New meeting transcripts:"
    for f in $files; do print -r -- "- $f"; done
  else
    print -r -- "New meeting transcripts: none. Slack only."
  fi
} > "$S/prompt.md"

source "$HERE/cu_limit.zsh"
cu_blocked && tools=(${tools:#*ClickUp*})    # ClickUp's daily limit is spent: run on Slack and meetings only
log "run: ${#files} meeting(s), Slack from $(date -r $window '+%a %H:%M'), model $MODEL"
out=$(cd "$ROOT" && /usr/bin/perl -e 'alarm shift; exec @ARGV' $LIMIT \
  claude -p --model "$MODEL" --permission-mode dontAsk --allowedTools $tools \
  < "$S/prompt.md" 2>&1)
rc=$?
cu_note "$out"
print -r -- "$out" > "$S/last-output"
result=$(print -r -- "$out" | /usr/bin/grep -E '^ADDED [0-9]+' | tail -1)

if (( rc != 0 )) || [ -z "$result" ]; then
  log "FAILED (exit $rc): $(print -r -- "$out" | tail -1 | cut -c1-200)"
  exit 1
fi

print -r -- $now > "$LAST"
for id in $ids; do print -r -- "$id" >> "$SEEN"; done
log "$result"

n=$(print -r -- "$result" | /usr/bin/sed -E 's/^ADDED ([0-9]+).*/\1/')
if (( n > 0 )); then
  msg=$(print -r -- "${result#*: }" | cut -c1-180 | /usr/bin/sed 's/["\\]//g')
  /usr/bin/osascript -e "display notification \"$msg\" with title \"$n new task$( (( n > 1 )) && print s)\"" 2>/dev/null
fi
