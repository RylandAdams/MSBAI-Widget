#!/bin/zsh
# zoom.sh — the widget's call bar: Create Zoom and Create Google Meet. One confirm: the call starts
# now with {{OWNER_FIRST}} as host, each teammate picked in the card gets their own Slack DM with the join
# link (and, for Meet, a Google Calendar invite), and Fireflies is added to that same call. The
# join link also lands on the clipboard.
#
#   zoom.sh start B64JSON   # {"kind": "zoom"|"meet", "topic": "...",
#                           #  "people": [{"name": "Kriss", "id": "U0XXXXXXXXX", "email": "..."}]}
#   zoom.sh recent          # the last sessions, for the panel (see below)
#   zoom.sh status          # the tail of the log
#
# Creating the meeting and sending the DMs go through a headless Claude with the claude.ai Zoom,
# Google Calendar and Slack connectors, so there is no app login or token to set up. A Meet is a
# 30 minute event starting now (ZOOM_MEET_MIN), with a Meet link and the picked teammates invited. The DMs go to the Slack
# user ids in team.tsv, so nobody is looked up or guessed. Fireflies is added straight through its
# API with the key fireflies.sh already keeps. Only the create step is waited on; the DMs and
# Fireflies run in the background and report into the panel and by notification.
#
# State, all in .zoom/: sessions.tsv (id, topic, join link, who was invited), s-<id>.ff and
# s-<id>.dm (how Fireflies and the DMs went), log, and the last prompt and reply for each step.

SELF=${0:A}                        # $0 inside a zsh function is the function name, so keep the path
HERE=${0:A:h}
ROOT=${HERE:h}
Z="$HERE/.zoom"
LOG="$Z/log"
SESS="$Z/sessions.tsv"
KEYFILE="$HERE/.fireflies-key"
FF_DELAY=${ZOOM_FF_DELAY:-20}        # seconds after the call opens before Fireflies is sent

export PATH="$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
mkdir -p "$Z"

log() { print -r -- "$(date '+%F %T')  $*" >> "$LOG"; }
notify() {   # title, text. Passed as arguments, so no quote in either can break the script.
  /usr/bin/osascript -e 'on run a' -e 'display notification (item 2 of a) with title (item 1 of a)' \
    -e 'end run' "$1" "$2" >/dev/null 2>&1
}
claude_run() {   # seconds, model, prompt file, tools...
  local secs=$1 model=$2 prompt=$3; shift 3
  (cd "$ROOT" && /usr/bin/perl -e 'alarm shift; exec @ARGV' $secs \
    claude -p --model "$model" --permission-mode dontAsk --allowedTools "$@" < "$prompt" 2>&1)
}

add_fireflies() {   # join url, title. Prints ok or the reason.
  [ -f "$KEYFILE" ] || { print -r -- "no Fireflies key"; return 1; }
  local k body resp
  k=$(tr -d ' \t\r\n' < "$KEYFILE")
  body=$(/usr/bin/python3 -c '
import json, sys
print(json.dumps({"query": "mutation AddToLiveMeeting($meetingLink: String!, $title: String) { addToLiveMeeting(meeting_link: $meetingLink, title: $title) { success } }",
                  "variables": {"meetingLink": sys.argv[1], "title": sys.argv[2]}}))' "$1" "$2")
  resp=$(/usr/bin/curl -sS --max-time 30 -X POST "https://api.fireflies.ai/graphql" \
    -H "Content-Type: application/json" -H "Authorization: Bearer $k" -d "$body" 2>&1)
  print -r -- "$resp" | /usr/bin/python3 -c '
import json, sys
raw = sys.stdin.read()
try:
    d = json.loads(raw)
except Exception:
    print("no answer from Fireflies: " + raw[:120]); sys.exit(1)
ok = ((d.get("data") or {}).get("addToLiveMeeting") or {}).get("success")
if ok: print("ok"); sys.exit(0)
errs = d.get("errors") or [{}]
print("Fireflies said: " + str(errs[0].get("message", raw[:120]))[:160]); sys.exit(1)'
}

case "${1:-status}" in

status)
  tail -20 "$LOG" 2>/dev/null
  ;;

# id <TAB> topic <TAB> join <TAB> names <TAB> fireflies state <TAB> dm state, newest first.
# A state is "pending" while that background step is still running.
recent)
  [ -f "$SESS" ] || exit 0
  tail -6 "$SESS" | /usr/bin/tail -r | while IFS=$'\t' read -r id topic join names; do
    [ -n "$id" ] || continue
    ff=$(cat "$Z/s-$id.ff" 2>/dev/null); dm=$(cat "$Z/s-$id.dm" 2>/dev/null)
    [ -n "$dm" ] || { [ -n "$names" ] && dm=pending || dm=none; }
    print -r -- "$id"$'\t'"$topic"$'\t'"$join"$'\t'"$names"$'\t'"${ff:-pending}"$'\t'"$dm"
  done
  ;;

start)
  spec=$(print -r -- "$2" | /usr/bin/base64 -D 2>/dev/null)
  parsed=$(print -r -- "$spec" | /usr/bin/python3 -c '
import json, re, sys
d = json.load(sys.stdin)
clean = lambda x: re.sub(r"[\t\r\n]+", " ", str(x or "")).strip()
kind = "meet" if d.get("kind") == "meet" else "zoom"
topic = clean(d.get("topic")) or "Quick sync"
people = [p for p in (d.get("people") or []) if re.fullmatch(r"[UW][A-Z0-9]{6,}", str(p.get("id", "")))]
print(kind); print(topic)
for p in people:
    email = clean(p.get("email"))
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[a-z]{2,}", email, re.I): email = ""
    print(p["id"] + "\t" + (clean(p.get("name")) or p["id"]) + "\t" + email)' 2>/dev/null)
  lines=("${(@f)parsed}")
  kind=${lines[1]:-zoom}
  topic=${lines[2]:-Quick sync}
  people=(${lines[3,-1]})
  names="" emails=()
  for p in $people; do
    rest=${p#*$'\t'}; pname=${rest%%$'\t'*}; pmail=${rest#*$'\t'}
    names="${names:+$names, }$pname"
    [ -n "$pmail" ] && [[ $pmail != $pname ]] && emails+=("$pmail")
  done
  label=Zoom; [[ $kind == meet ]] && label="Google Meet"

  # 1. Create the call. Zoom: an instant meeting, {{OWNER_FIRST}} as host. Meet: a calendar event starting
  #    now with a Meet link, the picked teammates invited (Google emails them the invite).
  if [[ $kind == meet ]]; then
    times=(${(f)"$(/usr/bin/python3 -c '
import datetime, sys
now = datetime.datetime.now().astimezone().replace(second=0, microsecond=0)
print(now.isoformat()); print((now + datetime.timedelta(minutes=int(sys.argv[1]))).isoformat())' ${ZOOM_MEET_MIN:-30})"})
    {
      print -r -- "Create a Google Calendar event right now, unattended; nobody will answer."
      print -r -- "Call create_event once on the primary calendar with:"
      print -r -- "  summary: $topic"
      print -r -- "  startTime: ${times[1]}"
      print -r -- "  endTime: ${times[2]}"
      print -r -- "  timeZone: America/Los_Angeles"
      print -r -- "  addGoogleMeetUrl: true"
      print -r -- "  notificationLevel: ALL"
      if (( ${#emails} )); then
        print -r -- "  attendees: one entry per email: ${(j:, :)emails}"
      else
        print -r -- "  no attendees"
      fi
      print -r -- "Then print exactly two lines and nothing else:"
      print -r -- "JOIN <the event's Google Meet link, https://meet.google.com/...>"
      print -r -- "START <the event's htmlLink>"
      print -r -- "If the call fails or the event has no Meet link, print one line: FAILED <why>."
    } > "$Z/create-prompt.md"
    out=$(claude_run 150 haiku "$Z/create-prompt.md" ToolSearch mcp__claude_ai_Google_Calendar__create_event)
  else
    {
      print -r -- "Create a Zoom meeting right now, unattended; nobody will answer."
      print -r -- "Call meeting_create once with userId \"me\", type 1 (an instant meeting), topic: $topic"
      print -r -- "Then print exactly two lines and nothing else:"
      print -r -- "JOIN <join_url>"
      print -r -- "START <start_url>"
      print -r -- "If the call fails, print one line: FAILED <why>. Never retry after a 429."
    } > "$Z/create-prompt.md"
    out=$(claude_run 150 haiku "$Z/create-prompt.md" ToolSearch mcp__claude_ai_Zoom_for_Claude__meeting_create)
  fi
  join=$(print -r -- "$out" | /usr/bin/sed -nE 's/^`?JOIN (https:[^ `]+)`?$/\1/p' | head -1)
  startu=$(print -r -- "$out" | /usr/bin/sed -nE 's/^`?START (https:[^ `]+)`?$/\1/p' | head -1)
  print -r -- "$out" > "$Z/create-output"
  if [ -z "$join" ]; then
    why=$(print -r -- "$out" | tail -1 | cut -c1-160)
    log "create FAILED: $why"
    print -r -- "failed: ${why:-no answer from the $label connector}"
    exit 0      # the widget shows this line; a non-zero exit would hide it behind a generic error
  fi
  id=$(date +%s)
  print -r -- "$id"$'\t'"$topic"$'\t'"$join"$'\t'"$names"$'\t'"$kind" >> "$SESS"
  log "created $label \"$topic\" ($id): $join${names:+, inviting $names}"

  # 2. Open it as host, and put the join link on the clipboard.
  if [[ $kind == meet ]]; then /usr/bin/open "$join"; else /usr/bin/open "${startu:-$join}"; fi
  print -r -n -- "$join" | /usr/bin/pbcopy

  # 3. The DMs, in the background. One message per person, to the ids from team.tsv.
  if (( ${#people} )); then
    (
      {
        print -r -- "Send Slack direct messages for {{OWNER_FULL}}, unattended; nobody will answer."
        print -r -- "For each Slack user id below, call slack_send_message once with channel_id set to that id"
        print -r -- "and exactly this message, nothing added or changed:"
        print -r -- "Here's the link to join the meeting: $join"
        print -r -- "Message only these ids, one message each. Never post in a channel, never send twice."
        print -r -- "Then print one line per id and nothing else: SENT <id> or FAILED <id> <why>."
        print -r -- ""
        for p in $people; do print -r -- "- ${p%%$'\t'*}  (${${p#*$'\t'}%%$'\t'*})"; done
      } > "$Z/dm-prompt.md"
      dm=$(claude_run 180 haiku "$Z/dm-prompt.md" ToolSearch mcp__claude_ai_Slack__slack_send_message)
      print -r -- "$dm" > "$Z/dm-output"
      sent=() missed=()
      for p in $people; do
        pid=${p%%$'\t'*}; pname=${${p#*$'\t'}%%$'\t'*}
        if print -r -- "$dm" | /usr/bin/grep -qE "^\`?SENT $pid([^A-Z0-9]|$)"; then sent+=("$pname"); else missed+=("$pname"); fi
      done
      who=${(j:, :)sent}; miss=${(j:, :)missed}
      if (( ${#missed} )); then
        print -r -- "sent to ${who:-nobody}; not sent: $miss" > "$Z/s-$id.dm"
        notify "$label: some DMs did not go out" "Not sent: $miss"
      else
        print -r -- "sent" > "$Z/s-$id.dm"
      fi
      log "dms ($id): sent ${#sent}/${#people}${miss:+, not sent: $miss}"
    ) >> "$LOG" 2>&1 &!
  fi

  # 4. Fireflies, in the background, once the call has had time to open.
  (
    sleep $FF_DELAY
    r=$(add_fireflies "$join" "$topic")
    if [[ $r != ok ]]; then           # the call may not be live yet; one more try
      sleep 45
      r=$(add_fireflies "$join" "$topic")
    fi
    if [[ $r == ok ]]; then
      print -r -- "ok" > "$Z/s-$id.ff"
      log "fireflies ($id): added"
      notify "$label" "Fireflies is on its way in. Admit it if it asks to join."
    else
      print -r -- "failed: $r" > "$Z/s-$id.ff"
      log "fireflies ($id) FAILED: $r"
      notify "$label: Fireflies not added" "$r"
    fi
  ) >> "$LOG" 2>&1 &!

  print -r -- "ok $join"
  ;;

*)
  print -r -- "usage: zoom.sh start B64JSON | recent | status" >&2
  exit 2
  ;;
esac
