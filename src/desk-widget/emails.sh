#!/bin/zsh
# emails.sh — the widget's emails tab: threads in {{OWNER_FIRST}}'s inbox that are waiting on him, and a
# reply draft for any of them, written into Gmail drafts (never sent from here).
#
#   emails.sh tick            # print the cached list; start a background sync if it is stale
#   emails.sh sync            # refresh the list now (the tab's refresh button runs this)
#   emails.sh suggest         # write suggested replies for threads that have none yet (tick runs it)
#   emails.sh draft B64JSON   # {"thread", "message", "body" or "note"} -> "ok <draft url>"
#   emails.sh done THREAD     # hide a thread from the tab (it comes back if a new message arrives)
#   emails.sh status          # the tail of the log
#
# There is no Gmail login here: a headless Claude reads Gmail and writes drafts through the
# claude.ai Gmail connector. The list is rebuilt every EVERY seconds, 6am to 10pm, by the widget's
# own refresh beat calling `tick`.
#
# .emails.tsv, one thread per line, newest first:
#   thread <TAB> last message id <TAB> date ISO <TAB> from name <TAB> from email <TAB> company
#   <TAB> subject <TAB> what they need from {{OWNER_FIRST}} <TAB> Gmail link
# tick adds two fields from .emails/sugg/<thread>.txt when a suggested reply exists for that
# thread's latest message: base64 of the reply, base64 of a line on what it drew on.
#
# .emails/practice.tsv holds old threads {{OWNER_FIRST}} already answered, in the same 9 fields plus base64
# of what he actually sent. They show after the real ones, marked practice (fields 12 and 13: P and
# the real reply), so a suggested reply can be compared with what he wrote. Their suggestions only
# read the thread up to that message, as if it had just arrived. Delete the file to remove them.
#
# Suggested replies use context, not just the email: earlier threads with the same person or
# company, what the team said about them in Slack, the CRM in ClickUp, and Drive, so a reply to
# "can you send the deck?" carries the deck's link, and a polite "not for Phase I" gets a warm
# keep-the-door-open answer. They are only text until you press "use it", which puts them in
# Gmail drafts. Nothing is ever sent from here.

SELF=${0:A}                        # $0 inside a zsh function is the function name, so keep the path
HERE=${0:A:h}
ROOT=${HERE:h}
E="$HERE/.emails"
LIST="$HERE/.emails.tsv"
HIDDEN="$E/hidden"                 # thread <TAB> last message id when it was hidden
PRACTICE="$E/practice.tsv"         # old threads you already answered, shown as if waiting (practice)
LOG="$E/log"
EVERY=${EMAILS_EVERY:-900}
MODEL=${EMAILS_MODEL:-sonnet}
SIGNER=${EMAILS_SIGNER:-$(/usr/bin/python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("name") or "{{OWNER_FIRST}}")' "$HERE/me.json" 2>/dev/null || print {{OWNER_FIRST}})}
SUGG="$E/sugg"
# whose inbox this is (me.json), so a teammate's copy writes as them, not as {{OWNER_FIRST}}
ME_FULL=$(/usr/bin/python3 -c 'import json,sys; m=json.load(open(sys.argv[1])); print(m.get("full") or m.get("name") or "")' "$HERE/me.json" 2>/dev/null)
ME_EMAIL=$(/usr/bin/python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("email",""))' "$HERE/me.json" 2>/dev/null)
ME_ROLE=$(/usr/bin/python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("role") or "operations, BD and technical coordination")' "$HERE/me.json" 2>/dev/null)
: ${ME_FULL:={{OWNER_FULL}}} ${ME_EMAIL:={{OWNER_EMAIL}}}
# one line on the sender from the CRM tab's model (.crm/crm.json), if crm.sh has built it
crm_note() {
  /usr/bin/python3 - "$HERE/.crm/crm.json" "$1" "$2" <<'CRMPY' 2>/dev/null
import json, re, sys
try: d = json.load(open(sys.argv[1]))
except Exception: sys.exit(0)
norm = lambda x: re.sub(r"\s+", " ", re.sub(r"[^\w@.\s]", " ", (x or "").lower())).strip()
p = d.get("people", {}).get(norm(sys.argv[2])) or next((v for v in d.get("people", {}).values() if v.get("email") and v["email"].lower() == sys.argv[3].lower()), None)
if not p: sys.exit(0)
lv = {1: "an active contract", 2: "a lead", 3: "an active proposal", 4: "a partner"}
bits = [lv.get(min(p.get("levels") or [9]), "")]
if p.get("pursuits"): bits.append("on " + ", ".join(p["pursuits"]))
if p.get("roles"): bits.append("role " + ", ".join(p["roles"]))
if p.get("companies"): bits.append("company lane " + ", ".join(c for c in p["companies"] if c))
if p.get("heat"): bits.append(p["heat"])
if "partner" in (p.get("roles") or []): bits.append("an active partner: warm tone, never a cold pitch")
if "tpoc" in (p.get("roles") or []): bits.append("a TPOC: only reply to what they asked; no new outreach while the topic is open")
print("; ".join(b for b in bits if b))
CRMPY
}
SUGGEST_MAX=${EMAILS_SUGGEST_MAX:-6}     # replies written per pass

export PATH="$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
mkdir -p "$E" "$SUGG"; touch "$HIDDEN"

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

# The cached list, minus threads hidden since their last message, plus any suggested reply.
show() {
  [ -f "$LIST" ] || [ -f "$PRACTICE" ] || return 0
  /usr/bin/python3 - "$LIST" "$HIDDEN" "$SUGG" "$PRACTICE" <<'SHOWPY'
import base64, os, sys
lst, hidden, sugg, practice = sys.argv[1:5]
h = {tuple(l.rstrip("\n").split("\t")[:2]) for l in open(hidden) if l.strip()}
rows, seen = [], set()
if os.path.exists(lst):
    for line in open(lst, encoding="utf-8", errors="replace"):
        f = line.rstrip("\n").split("\t")
        if len(f) >= 9: rows.append((f, [])); seen.add(f[0])
if os.path.exists(practice):
    for line in open(practice, encoding="utf-8", errors="replace"):
        f = line.rstrip("\n").split("\t")
        if len(f) >= 9 and f[0] not in seen: rows.append((f[:9], ["P", f[9] if len(f) > 9 else ""]))
for f, extra in rows:
    if tuple(f[:2]) in h: continue
    body = why = ""
    p = os.path.join(sugg, f[0] + ".txt")
    if os.path.exists(p):
        parts = open(p, encoding="utf-8", errors="replace").read().split("\n", 2)
        if len(parts) == 3 and parts[0] == f[1]:
            why, body = parts[1], parts[2].strip()
    b = lambda x: base64.b64encode(x.encode()).decode()
    tried = "-" if (os.path.exists(p) and not body and open(p).read().split("\n", 1)[0] == f[1]) else ""
    print("\t".join(f[:9] + [b(body) if body else tried, b(why) if body else ""] + extra))
SHOWPY
}

# Suggested replies for threads whose latest message has none yet, newest first.
suggest_now() {
  if ! mkdir "$E/slock" 2>/dev/null; then
    (( $(date +%s) - $(mtime "$E/slock") < 1800 )) && return 0
    rmdir "$E/slock"; mkdir "$E/slock" || return 0
  fi
  trap 'rmdir "$E/slock" 2>/dev/null' EXIT
  local n=0 rows
  # empty fields become ~ so read does not collapse neighbouring tabs and shift the columns
  rows=$(show | /usr/bin/awk -F'\t' -v OFS='\t' '$10 == "" { for (i = 1; i <= NF; i++) if ($i == "") $i = "~"; print }')
  [ -n "$rows" ] || return 0
  while IFS=$'\t' read -r thread message when from email company subject need url body why kind sent; do
    [ -n "$thread" ] || continue
    (( n++ >= SUGGEST_MAX )) && break
    touch "$E/slock"
    {
      print -r -- "Write the reply $ME_FULL would send to this email, unattended; nobody will answer."
      print -r -- "Read only: never send, draft, post or change anything. Today is $(date '+%A %b %d %Y')."
      print -r -- "$SIGNER does $ME_ROLE for MSBAI (GURU, OrbitGuard, HPC CFD),"
      print -r -- "Tam Fortis Solutions (portable microreactors) and Nexcavate (PermitPulse), led by Allan Grosvenor."
      print -r -- ""
      print -r -- "The email: thread $thread, from $from <$email> ($company), subject \"$subject\"."
      print -r -- "What they need: $need"
      crmn=$(crm_note "$from" "$email"); [ -n "$crmn" ] && print -r -- "In the CRM: $crmn"
      print -r -- ""
      if [[ $kind == P ]]; then
        print -r -- "PRACTICE RUN: this is an old thread $SIGNER already answered. Pretend it is ${when%%T*} and"
        print -r -- "message $message has just arrived. Read the thread only up to and including that message and"
        print -r -- "ignore everything after it, above all ${SIGNER}'s own reply. In every context search, ignore"
        print -r -- "anything dated after ${when%%T*}."
        print -r -- ""
      fi
      print -r -- "1. get_thread $thread and read it all."
      print -r -- "2. Context, as much as helps and no more:"
      print -r -- "   - earlier email with this person or their organization (search_threads, from: or to: them)"
      print -r -- "   - what the team said about them or this topic in Slack (slack_search_public_and_private)"
      print -r -- "   - the CRM: clickup_search for their name or organization"
      print -r -- "   - if they ask for a document, deck, one pager, paper or link: find it on Drive"
      print -r -- "     (search_files) and put its link in the reply. If you cannot find it, leave [link]."
      print -r -- "3. Write the reply body."
      print -r -- ""
      print -r -- "How it should read: short, warm, professional, in ${SIGNER}'s plain voice. Answer what they asked."
      print -r -- "When they decline or say not now (for example not for Phase I), thank them, keep the door"
      print -r -- "open for later (Phase II, the next round), and offer one easy next step. When they want a"
      print -r -- "meeting, offer to set one up and ask what times work, without inventing times. Never invent"
      print -r -- "facts, numbers, dates, prices or commitments: anything only $SIGNER can fill goes in [square"
      print -r -- "brackets]. No em dashes, en dashes or connector hyphens; use commas, periods or shorter"
      print -r -- "sentences. Write GURU in all caps. No filler openers, no AI phrasing. Plain text, no markdown."
      print -r -- "Sign off with just: $SIGNER"
      print -r -- ""
      print -r -- "Print exactly this and nothing else:"
      print -r -- "WHY: one short line on what you drew on (for example: earlier thread Sep 12, Kriss in #bizdev, deck on Drive)"
      print -r -- "REPLY_START"
      print -r -- "the reply body"
      print -r -- "REPLY_END"
      print -r -- "If a tool result was saved to a file because it was large, open it with Read."
    } > "$E/suggest-prompt.md"
    out=$(claude_run 600 "$MODEL" "$E/suggest-prompt.md" ToolSearch Read \
          mcp__claude_ai_Gmail__get_thread mcp__claude_ai_Gmail__search_threads \
          mcp__claude_ai_Slack__slack_search_public_and_private mcp__claude_ai_Slack__slack_read_thread \
          mcp__claude_ai_ClickUp__clickup_search mcp__claude_ai_Google_Drive__search_files)
    print -r -- "$out" > "$E/suggest-output"
    reply=$(print -r -- "$out" | /usr/bin/awk '/^REPLY_END/ { on = 0 } on { print } /^REPLY_START/ { on = 1 }')
    why=$(print -r -- "$out" | /usr/bin/sed -nE 's/^WHY: *(.*)$/\1/p' | head -1 | tr '\t' ' ')
    if [ -n "$reply" ]; then
      { print -r -- "$message"; print -r -- "${why:-from the thread}"; print -r -- "$reply"; } > "$SUGG/$thread.txt"
      log "suggested: $subject"
    else
      log "suggest FAILED: $subject: $(print -r -- "$out" | tail -1 | cut -c1-160)"
      { print -r -- "$message"; print -r -- "x"; print -r -- ""; } > "$SUGG/$thread.txt"   # not retried for this message
    fi
  done <<< "$rows"
}

sync_now() {
  if ! mkdir "$E/lock" 2>/dev/null; then
    (( $(date +%s) - $(mtime "$E/lock") < 900 )) && return 0
    rmdir "$E/lock"; mkdir "$E/lock" || return 0
  fi
  trap 'rmdir "$E/lock" 2>/dev/null' EXIT
  {
    print -r -- "Find the email threads waiting on $ME_FULL, unattended; nobody will answer."
    print -r -- "$ME_FULL is $ME_EMAIL, doing $ME_ROLE for"
    print -r -- "MSBAI, Tam Fortis Solutions and Nexcavate (all led by Allan Grosvenor). Today is $(date '+%A %b %d %Y, %H:%M %Z')."
    print -r -- ""
    print -r -- "1. search_threads with query: in:inbox newer_than:10d -from:me -category:promotions"
    print -r -- "   -category:social -category:updates -category:forums, pageSize 40."
    print -r -- "2. For each thread that could be from a real person, get_thread to read it in full (search"
    print -r -- "   previews miss the newest messages)."
    print -r -- "3. Keep a thread only if its LAST message is not from $SIGNER, a real person wrote it (not a"
    print -r -- "   newsletter, receipt, notification, calendar invite or automated alert), and it asks $SIGNER"
    print -r -- "   something, asks him to do something, or plainly expects his reply. Drop threads where"
    print -r -- "   someone else already answered for them, and pure FYIs."
    print -r -- "4. Print at most 15 kept threads, newest first, one line each, fields separated by a single TAB:"
    print -r -- "E<TAB>thread id<TAB>id of the last message<TAB>its date as ISO 8601<TAB>sender name<TAB>sender email<TAB>company: MSBAI, Tam Fortis, Nexcavate, Personal or Other<TAB>subject<TAB>one plain sentence: what they need from $SIGNER<TAB>the thread's viewUrl"
    print -r -- "Replace any TAB or newline inside a field with a space. No code fences, no other text."
    print -r -- "If nothing qualifies, print exactly E_NONE. Never ask for other tools or offer options. If a"
    print -r -- "tool result was saved to a file because it was large, open it with Read and carry on."
  } > "$E/sync-prompt.md"
  out=$(claude_run 900 "$MODEL" "$E/sync-prompt.md" ToolSearch Read \
        mcp__claude_ai_Gmail__search_threads mcp__claude_ai_Gmail__get_thread)
  print -r -- "$out" > "$E/sync-output"
  rows=$(print -r -- "$out" | /usr/bin/grep -E $'^E\t[0-9a-zA-Z]+\t' | /usr/bin/sed $'s/^E\t//')
  if [ -n "$rows" ]; then
    print -r -- "$rows" > "$LIST.tmp" && mv "$LIST.tmp" "$LIST"
    log "sync: $(print -r -- "$rows" | /usr/bin/grep -c .) waiting"
  elif print -r -- "$out" | /usr/bin/grep -q 'E_NONE'; then
    : > "$LIST"; log "sync: none waiting"
  else
    touch "$LIST"            # count the attempt, so a bad run is not retried every two minutes
    log "sync FAILED: $(print -r -- "$out" | tail -1 | cut -c1-200)"
  fi
}

case "${1:-status}" in

tick)
  show
  h=$(( 10#$(date +%H) ))
  if (( h >= 6 && h < 22 )) && (( $(date +%s) - $(mtime "$LIST") >= EVERY )); then
    ( /bin/zsh "$SELF" sync ) >/dev/null 2>&1 &!
  elif [ ! -d "$E/slock" ] && [ ! -d "$E/lock" ] && show | /usr/bin/awk -F'\t' '$10 == "" { found = 1 } END { exit !found }'; then
    ( /bin/zsh "$SELF" suggest ) >/dev/null 2>&1 &!
  fi
  ;;

sync)
  sync_now
  [[ -t 1 ]] || show
  ( /bin/zsh "$SELF" suggest ) >/dev/null 2>&1 &!
  ;;

suggest)
  suggest_now
  ;;

done)
  id=$2
  last=$(/usr/bin/awk -F'\t' -v t="$id" '$1==t { print $2; exit }' "$LIST" "$PRACTICE" 2>/dev/null)
  [ -n "$id" ] && print -r -- "$id"$'\t'"$last" >> "$HIDDEN"
  print -r -- "ok"
  ;;

draft)
  spec=$(print -r -- "$2" | /usr/bin/base64 -D 2>/dev/null)
  print -r -- "$spec" > "$E/draft-spec.json"
  fields=("${(@f)$(/usr/bin/python3 -c '
import json, re, sys
d = json.load(open(sys.argv[1]))
ok = lambda x: re.sub(r"[^0-9A-Za-z]", "", str(x or ""))
print(ok(d.get("thread"))); print(ok(d.get("message")) or "-")
print(re.sub(r"\s+", " ", str(d.get("note") or "")).strip() or "-")' "$E/draft-spec.json" 2>/dev/null)}")
  thread=${fields[1]}; message=${fields[2]}; note=${fields[3]}; [[ $note == "-" ]] && note=""
  [ -n "$thread" ] || { print -r -- "failed: no thread"; exit 0; }
  /usr/bin/python3 -c 'import json,sys; print((json.load(open(sys.argv[1])).get("body") or "").strip())' \
    "$E/draft-spec.json" > "$E/draft-body.txt" 2>/dev/null
  if [ -s "$E/draft-body.txt" ] && [ -z "$note" ]; then
    # the suggested (or edited) reply, word for word: the model only files it
    {
      print -r -- "File a reply draft in Gmail for $ME_FULL, unattended; nobody will answer. Do not send it."
      print -r -- "1. get_thread for thread $thread and find message $message (the one to answer): its sender,"
      print -r -- "   who was cc'd on it, and its subject."
      print -r -- "2. create_draft with replyToMessageId set to $message, to its sender, cc the same"
      print -r -- "   people, subject \"Re: \" plus the subject unless it already starts with Re:, and body set"
      print -r -- "   to exactly the text between the lines BODY_START and BODY_END at the end of this message,"
      print -r -- "   word for word, keeping its line breaks. The body must never be empty."
      print -r -- "3. get_draft the new draft and check its body begins with: $(head -1 "$E/draft-body.txt")"
      print -r -- "   If it does not, update_draft that draft with the body, then check again."
      print -r -- "4. Print exactly one line: DRAFT <the draft's viewUrl>, or FAILED <why>."
      print -r -- ""
      print -r -- "BODY_START"
      cat "$E/draft-body.txt"
      print -r -- "BODY_END"
    } > "$E/draft-prompt.md"
    # the body goes in the prompt itself (a quick model once skipped reading it from a file and
    # filed an empty draft), and the draft is read back before it counts
    out=$(claude_run 300 sonnet "$E/draft-prompt.md" ToolSearch \
          mcp__claude_ai_Gmail__get_thread mcp__claude_ai_Gmail__create_draft \
          mcp__claude_ai_Gmail__get_draft mcp__claude_ai_Gmail__update_draft)
  else
    sug=$(sed -n '3,$p' "$SUGG/$thread.txt" 2>/dev/null)
    {
      print -r -- "Write a reply draft for $ME_FULL in Gmail, unattended; nobody will answer. Do not send it."
      print -r -- "1. get_thread for thread $thread and read it all."
      print -r -- "2. create_draft as a reply to message $message (replyToMessageId: $message), to its sender,"
      print -r -- "   cc whoever was cc'd on that message, subject"
      print -r -- "   \"Re: \" plus the thread's subject unless it already starts with Re:."
      [ -n "$note" ] && print -r -- "   $SIGNER wants the reply to say: $note"
      [ -n "$sug" ] && { print -r -- "   Start from this suggested reply and change what his note asks:"; print -r -- "$sug"; }
      print -r -- "   If it should carry a document's link, find it on Drive (search_files)."
      print -r -- "How $SIGNER writes: short, direct, plain language, warm but not gushing. Answer what was asked."
      print -r -- "Never use em dashes, en dashes or hyphens as connectors; use commas, periods or shorter"
      print -r -- "sentences. Write GURU in all caps. No filler openers or AI phrasing. Never invent facts,"
      print -r -- "numbers, dates or commitments: where they must fill something in, leave it in [square brackets]."
      print -r -- "Plain text body, no markdown. Sign off with just: $SIGNER"
      print -r -- "3. get_draft the new draft and confirm its body holds the reply. If it is empty, update_draft it."
      print -r -- "4. Print exactly one line and nothing else: DRAFT <the draft's viewUrl>, or FAILED <why>."
    } > "$E/draft-prompt.md"
    out=$(claude_run 300 sonnet "$E/draft-prompt.md" ToolSearch \
          mcp__claude_ai_Gmail__get_thread mcp__claude_ai_Gmail__create_draft mcp__claude_ai_Google_Drive__search_files \
          mcp__claude_ai_Gmail__get_draft mcp__claude_ai_Gmail__update_draft)
  fi
  print -r -- "$out" > "$E/draft-output"
  url=$(print -r -- "$out" | /usr/bin/sed -nE 's/^`?DRAFT (https:[^ `]+)`?$/\1/p' | head -1)
  if [ -n "$url" ]; then
    log "draft for $thread: $url"; print -r -- "ok $url"
  else
    why=$(print -r -- "$out" | tail -1 | cut -c1-160)
    log "draft FAILED for $thread: $why"; print -r -- "failed: ${why:-no answer from the Gmail connector}"
  fi
  ;;

status)
  tail -20 "$LOG" 2>/dev/null
  ;;
esac
exit 0
