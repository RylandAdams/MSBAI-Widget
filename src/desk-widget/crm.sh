#!/bin/zsh
# crm.sh — the CRM tab: Ayesha's four outreach levels (contracts, leads, proposals, partners), a
# calendar of key dates and a context card per person, read from the CRM v3 space in ClickUp that
# OpenClaw's Hermes agent keeps. Read only: it never creates, changes or closes anything in ClickUp,
# and never sends mail or posts.
#
#   crm.sh tick            # print the model (CRM <TAB> json), cached cards and sync state; sync in the background when stale
#   crm.sh sync            # refresh from ClickUp now (the tab's refresh button)
#   crm.sh parse           # rebuild .crm/crm.json from the last good sync and crm-seed.tsv, no ClickUp call
#   crm.sh card B64JSON    # {"id","name","company","kind","context"} -> CARD <TAB> id <TAB> json (cached a day)
#   crm.sh draft B64JSON   # {"name","company","body" or "note","context"} -> "ok <Gmail draft url>" (never sent)
#   crm.sh tpoc B64JSON    # {"topic","title","company","opp","people"} -> one TPOC ask draft per TPOC (pre release)
#   crm.sh nudge           # unanswered outreach 5+ business days old gets a follow up draft (every 3 h, 7am to 8pm)
#   crm.sh meetings        # people named in business meetings -> .crm/mentions.tsv (every 3 h, 7am to 9pm)
#   crm.sh ask B64JSON     # {"q","co"} -> ASK <TAB> {"q","a","at"}
#   crm.sh watch           # notify mode (crm_watch.py): .crm/alerts.json and a macOS notification for new ones
#   crm.sh seen KEY        # "got it" on an alert
#   crm.sh queue B64JSON   # a write for ClickUp (close / followup / later / comment) -> .crm/outbox.jsonl, pushed at once
#   crm.sh note B64JSON    # {"name","company","text","rel"} -> the person's Rolodex page, plus a comment in ClickUp
#   crm.sh push            # write what is waiting in the outbox to ClickUp (also started by tick)
#   crm.sh pages           # rewrite rolodex/*.md from the model and the cards
#   crm.sh status          # the tail of the log
#
# Files: crm_build.py turns the sync into .crm/crm.json. crm-seed.tsv holds what ClickUp does not
# have yet (partners, GAIN, contract people, key dates). crm-exclude.txt lists names that are never
# leads (vendors, portals, tools). Teammates in team.tsv and you (me.json) are left out on their own.

SELF=${0:A}
HERE=${0:A:h}
ROOT=${HERE:h}
C="$HERE/.crm"
MODEL_JSON="$C/crm.json"
LOG="$C/log"
EVERY=${CRM_EVERY:-10800}         # seconds between ClickUp syncs (3 h; Hermes itself syncs hourly)
MODEL=${CRM_MODEL:-sonnet}        # haiku stalls on pagination (see the Collab snapshot notes)
CARD_TTL=${CRM_CARD_TTL:-86400}

export PATH="$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
mkdir -p "$C/cards"

log() { print -r -- "$(date '+%F %T')  $*" >> "$LOG"; }
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
build() {
  /usr/bin/python3 "$HERE/crm_build.py" "$C/output" "$HERE/crm-seed.tsv" "$HERE/crm-exclude.txt" \
    "$HERE/team.tsv" "$HERE/me.json" "$MODEL_JSON" "$C/mentions.tsv"
  [ -s "$MODEL_JSON" ] && /usr/bin/python3 "$HERE/crm_pages.py" "$MODEL_JSON" "$C/cards" "$HERE/rolodex" >/dev/null 2>&1
}

sync_now() {
  if cu_blocked; then log "sync skipped: ClickUp daily limit, waits until $(cu_until)"; return 0; fi
  if ! mkdir "$C/lock" 2>/dev/null; then
    (( $(date +%s) - $(mtime "$C/lock") < 2400 )) && return 0
    rmdir "$C/lock"; mkdir "$C/lock" || return 0
  fi
  trap 'rmdir "$C/lock" 2>/dev/null' EXIT
  local d21=$(date -v-21d +%F) d90=$(date -v-90d +%F)
  # Pass 1, the lists: about 20 ClickUp calls, no get_task. ClickUp allows 1,000 calls a day for
  # the whole account (this widget, OpenClaw's own jobs on your login, and any Claude chat), so the
  # sync spends as few as it can.
  {
    print -r -- "Read only and unattended: never create, change, close or comment on anything in ClickUp. Nobody will answer questions."
    print -r -- "Today is $(date '+%A %b %d %Y'). ClickUp workspace 20115771. If a tool result was saved to a file because it was large, open it with Read."
    print -r -- "Use clickup_filter_tasks only (never clickup_get_task). Every call: subtasks false, and keep calling with page = next_page while has_more is true. Dates: print the millisecond value exactly as given. Replace any TAB or newline inside a value with a space. Print - for an empty value."
    print -r -- ""
    print -r -- "1. list_ids [\"901115367058\"] (Follow-ups), include_closed false. Per task: FL<TAB>task id<TAB>date_updated<TAB>task name<TAB>status<TAB>assignee usernames joined by commas<TAB>due_date<TAB>task url"
    print -r -- "2. list_ids [\"901115485850\"] (Interested Later), include_closed false. Per task: IL<TAB>task id<TAB>date_updated<TAB>task name<TAB>status<TAB>assignees<TAB>due_date<TAB>task url"
    print -r -- "3. list_ids [\"901102025484\"] (Proposals), statuses [\"to do\",\"monitoring for release\",\"waiting for response\",\"affected by sbir reauth\",\"collecting information\",\"writing\",\"needs review\",\"missing information\",\"urgent (help needed)\",\"ready for submission\",\"submitted\"]. Per task: PL<TAB>task id<TAB>date_updated<TAB>task name<TAB>status<TAB>assignees<TAB>due_date<TAB>task url"
    print -r -- "   Then the same list with statuses [\"won\"]. Per task: W<TAB>task id<TAB>task name<TAB>task url"
    print -r -- "4. For N in 2, 3, 4, 5: list_ids [\"901115367054\"], include_closed false, custom_fields [{\"field_id\":\"cfd8f5eb-7078-4376-bb84-c38a3a9ad7c6\",\"operator\":\"=\",\"value\":\"N\"}]. Per task: O<TAB>N<TAB>task id<TAB>task name<TAB>task url"
    print -r -- "5. Groups, include_closed false. Per task: G<TAB>group<TAB>task id<TAB>task name"
    print -r -- " rel_engaged: list 901115367052, custom_fields [{\"field_id\":\"d73c6732-93b2-4dc2-8d6d-4aca606ed5a9\",\"operator\":\"=\",\"value\":\"2\"}]"
    print -r -- " rel_active: same field, value \"3\"; rel_customer: value \"4\"; rel_partner: value \"5\""
    print -r -- " rel_touch21: list 901115367052, [{\"field_id\":\"a2f76dfd-52c8-45ed-aee2-d3f8c8dab62e\",\"operator\":\">=\",\"value\":\"$d21\"}]; rel_touch90: same field, \">=\" \"$d90\""
    print -r -- " rel_cooling: list 901115367052, [{\"field_id\":\"b9494d62-b26e-4313-88b0-0c5ba96f6130\",\"operator\":\"=\",\"value\":\"1\"}]; rel_dormant: value \"2\"; rel_atrisk: value \"3\""
    print -r -- " rel_key: list 901115367052, [{\"field_id\":\"a4f4d7e4-6101-416b-accc-73f31a6f4a40\",\"operator\":\"=\",\"value\":\"0\"}]; rel_warm: value \"1\""
    print -r -- " con_tpoc: list 901115367051, [{\"field_id\":\"e5636f85-1bd7-4d36-a882-d3284bdb9c4c\",\"operator\":\"=\",\"value\":\"0\"}]"
    print -r -- " rel_all: list 901115367052, no custom_fields (every relationship; for the Rolodex)"
    print -r -- " con_all: list 901115367051, no custom_fields (every contact; for the Rolodex)"
    print -r -- "6. For each proposal from step 3 whose name starts with a topic code (letters and digits, a hyphen, letters and digits, like DAF26BX06-NV510): list_ids [\"901115367051\"], include_closed false, custom_fields [{\"field_id\":\"e7fd3448-b785-4352-9d7c-fb247f23a891\",\"operator\":\"=\",\"value\":\"<topic code>\"}]. Per task: G<TAB>pursuit:<topic code><TAB>task id<TAB>task name"
    print -r -- ""
    print -r -- "Print CRM_START on its own line, every record, then CRM_END. Use real TAB characters. Print nothing else. If ClickUp refuses calls partway (a rate limit), still print the block with everything you did get, then CRM_END."
  } > "$C/sync-prompt.md"
  out=$(claude_run 1500 "$MODEL" "$C/sync-prompt.md" ToolSearch Read mcp__claude_ai_ClickUp__clickup_filter_tasks)
  print -r -- "$out" > "$C/sync-output"
  if ! { print -r -- "$out" | /usr/bin/grep -q '^CRM_START' && print -r -- "$out" | /usr/bin/grep -q '^CRM_END'; }; then
    log "sync FAILED (list pass): $(print -r -- "$out" | /usr/bin/grep -m1 -io 'rate.limit[^.]*\|limit[^.]*reset[^.]*' || print -r -- "$out" | tail -1 | cut -c1-200)"
    touch "$C/last-sync"; return 0
  fi
  # Pass 2, the details: clickup_get_task only for what is new or changed (at most CRM_DETAIL_MAX a run).
  need=$(/usr/bin/python3 "$HERE/crm_merge.py" need "$C/sync-output" "$C/fields.json" "${CRM_DETAIL_MAX:-40}")
  : > "$C/detail-output"
  if [ -n "$need" ]; then
    {
      print -r -- "Read only and unattended: never create, change, close or comment on anything in ClickUp. Nobody will answer questions."
      print -r -- "For each ClickUp task below call clickup_get_task with include [\"custom_fields\"] once, and print one line for it. Dropdown custom fields come back as an orderindex number: turn it into the option name using that field's type_config options. Label fields: label names. Relationship fields: the linked task names. Dates: the millisecond value exactly as given. Replace TABs and newlines inside values with spaces. Print - for an empty value."
      print -r -- "Kind F (Follow-ups): F<TAB>task id<TAB>task name<TAB>assignee usernames joined by commas<TAB>due_date<TAB>Entity<TAB>Direction<TAB>Origin<TAB>Commitment State<TAB>Contact names joined by ;<TAB>Pursuit names joined by ;<TAB>Source Evidence<TAB>task url"
      print -r -- "Kind I (Interested Later): I<TAB>task id<TAB>task name<TAB>Entity<TAB>Interest<TAB>Why Later<TAB>Trigger Event<TAB>Resurface On<TAB>Interest State<TAB>Contact names joined by ;<TAB>task url"
      print -r -- "Kind P (Proposals): P<TAB>task id<TAB>task name<TAB>status<TAB>assignee usernames joined by commas<TAB>due_date<TAB>Solicitation Release State label names joined by ,<TAB>Open Date<TAB>Final Submission Date<TAB>Next Milestone Date<TAB>Proposing Company label names joined by ,<TAB>Next Step + Due Date<TAB>task url"
      print -r -- ""
      print -r -- "Tasks (kind<TAB>id):"
      print -r -- "$need"
      print -r -- ""
      print -r -- "Print DETAIL_START, the lines, DETAIL_END. Real TAB characters, nothing else. If ClickUp refuses calls partway, print what you got and still end with DETAIL_END."
    } > "$C/detail-prompt.md"
    claude_run 1200 "$MODEL" "$C/detail-prompt.md" ToolSearch Read mcp__claude_ai_ClickUp__clickup_get_task > "$C/detail-output"
  fi
  res=$(/usr/bin/python3 "$HERE/crm_merge.py" merge "$C/sync-output" "$C/fields.json" "$C/detail-output" "$C/output")
  case $res in
    ok*) b=$(build); log "sync: ${res#ok }; ${b#ok }" ;;
    *)   log "sync FAILED (merge): $res" ;;
  esac
  touch "$C/last-sync"
}

card_now() {
  local spec id name company kind ctx
  spec=$(print -r -- "$1" | /usr/bin/base64 -D 2>/dev/null)
  print -r -- "$spec" > "$C/card-spec.json"
  fields=("${(@f)$(/usr/bin/python3 -c '
import json, re, sys
d = json.load(open(sys.argv[1]))
one = lambda x: re.sub(r"\s+", " ", str(x or "")).strip() or "-"
print(re.sub(r"[^0-9A-Za-z:_-]", "", str(d.get("id") or "")) or "-")
for k in ("name", "company", "kind", "context"): print(one(d.get(k)))' "$C/card-spec.json" 2>/dev/null)}")
  id=${fields[1]}; name=${fields[2]}; company=${fields[3]}; kind=${fields[4]}; ctx=${fields[5]}
  [[ -n $id && $id != "-" ]] || { print -r -- "CARD"$'\t'"-"$'\t'"{\"error\":\"no id\"}"; return; }
  local f="$C/cards/${id//:/_}.json"
  if [ -s "$f" ] && (( $(date +%s) - $(mtime "$f") < CARD_TTL )); then
    print -r -- "CARD"$'\t'"$id"$'\t'"$(tr -d '\n' < "$f")"; return
  fi
  local who=$(/usr/bin/python3 -c 'import json,sys; m=json.load(open(sys.argv[1])); print(m.get("full") or m.get("name") or "the owner")' "$HERE/me.json" 2>/dev/null)
  {
    print -r -- "Read only and unattended: never send, draft, post, create or change anything. Nobody will answer questions."
    print -r -- "Today is $(date '+%A %b %d %Y'). You are briefing $who before they reach out. Companies: MSBAI (GURU, autonomous simulation and space AI), Tam Fortis Solutions (portable nuclear microreactors), Nexcavate (PermitPulse permitting AI), all led by Allan Grosvenor."
    print -r -- "Subject: $name ($company). Kind of row: $kind. What the CRM already knows: $ctx"
    print -r -- ""
    print -r -- "Gather, as much as helps and no more:"
    print -r -- "1. ClickUp (workspace 20115771): clickup_search for the name; read the matching Contacts, Company Relationships and Conversations tasks (clickup_get_task with custom_fields and description). The Conversations description lists each message with its Gmail link."
    print -r -- "2. Gmail: search_threads from: or to: them (or the subject), get_thread on the most recent one or two."
    print -r -- "3. Slack: slack_search_public_and_private for the name. Fireflies: fireflies_search for the name."
    print -r -- ""
    print -r -- "Then print CARD_START, one JSON object on one line, CARD_END, and nothing else. Keys (use \"\" or [] when unknown, never invent):"
    print -r -- "who (title and organization), how_met, first_touch (date), last_touch (date), gap (plain words, like \"9 months quiet\"), last_speaker (us or them), going_on (two or three short sentences), promises_ours (list), promises_theirs (list), why_stopped, linked (list of proposals, contracts or partners), cautions (list: TPOC on an open topic means no direct contact; an active partner is never cold messaged; Tam Fortis or Nexcavate lane means send from that company's mailbox), next_step (one sentence), suggested (a short message they could send, signed with the owner's first name, or \"\"), links (list of {\"t\": label, \"u\": url})."
    print -r -- "Writing: plain words, short. GURU in all caps. No em dashes, en dashes or hyphens used as connectors."
  } > "$C/card-prompt.md"
  out=$(claude_run 600 "$MODEL" "$C/card-prompt.md" ToolSearch Read \
        mcp__claude_ai_ClickUp__clickup_search mcp__claude_ai_ClickUp__clickup_get_task \
        mcp__claude_ai_Gmail__search_threads mcp__claude_ai_Gmail__get_thread \
        mcp__claude_ai_Slack__slack_search_public_and_private mcp__claude_ai_Fireflies__fireflies_search)
  print -r -- "$out" > "$C/card-output"
  js=$(print -r -- "$out" | /usr/bin/python3 -c '
import json, re, sys
raw = sys.stdin.read()
m = re.search(r"CARD_START\s*(\{.*\})\s*CARD_END", raw, re.S)
try:
    d = json.loads(m.group(1)); print(json.dumps(d, separators=(",", ":"), ensure_ascii=False))
except Exception:
    print("")')
  if [ -n "$js" ]; then
    print -r -- "$js" > "$f"; log "card: $name"; pages
    print -r -- "CARD"$'\t'"$id"$'\t'"$js"
  else
    log "card FAILED: $name: $(print -r -- "$out" | tail -1 | cut -c1-160)"
    print -r -- "CARD"$'\t'"$id"$'\t'"{\"error\":\"the card did not come back; crm.sh status has the log\"}"
  fi
}

# ── who this widget belongs to (me.json), for drafts and prompts ──
me_val() { /usr/bin/python3 -c 'import json,sys; m=json.load(open(sys.argv[1])); print(m.get(sys.argv[2]) or "")' "$HERE/me.json" "$1" 2>/dev/null; }
AYESHA=${CRM_CC:-{{CRM_CC_EMAIL}}}   # cc'd on outreach so the CRM capture logs it
RULES="Writing: short, warm, plain words, the owner's own voice. GURU in all caps. No em dashes, en dashes or hyphens used as connectors; use commas, periods or shorter sentences. No filler openers, no AI phrasing. Never invent facts, numbers, dates or commitments: anything only the owner can fill goes in [square brackets]. Plain text, no markdown."
GMAIL_TOOLS=(mcp__claude_ai_Gmail__search_threads mcp__claude_ai_Gmail__get_thread mcp__claude_ai_Gmail__create_draft mcp__claude_ai_Gmail__get_draft mcp__claude_ai_Gmail__update_draft)
spec_get() { /usr/bin/python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); v=d.get(sys.argv[2]); print(json.dumps(v) if isinstance(v,(list,dict)) else (v or ""))' "$C/$1" "$2" 2>/dev/null; }

# A Gmail draft from any CRM row: the card's suggested message (or the owner's note) to the person,
# as a reply on the latest thread with them when there is one, cc Ayesha. Never sent.
draft_now() {
  print -r -- "$1" | /usr/bin/base64 -D > "$C/draft-spec.json" 2>/dev/null
  local name=$(spec_get draft-spec.json name) company=$(spec_get draft-spec.json company)
  local body=$(spec_get draft-spec.json body) note=$(spec_get draft-spec.json note) ctx=$(spec_get draft-spec.json context)
  local me_full=$(me_val full) me_mail=$(me_val email) cc=""
  [[ ${me_mail:l} != ${AYESHA:l} ]] && cc=$AYESHA
  {
    print -r -- "Write one Gmail draft for $me_full ($me_mail), unattended; nobody will answer. Never send anything."
    print -r -- "Today is $(date '+%A %b %d %Y'). To: $name ($company). What the CRM knows: $ctx"
    print -r -- "1. Find their email address: clickup_search for the name in the CRM (Contacts list, Primary Email), or Gmail search_threads for the name. If you cannot find an address, print FAILED no address for $name and stop."
    print -r -- "2. Gmail search_threads from: or to: that address. If a thread from the last 120 days exists, reply in it (create_draft with replyToMessageId set to its latest message, subject Re: plus its subject). Otherwise a new email with a short, specific subject."
    [ -n "$cc" ] && print -r -- "3. Cc $cc so the CRM capture logs it." || print -r -- "3. No cc."
    if [ -n "$body" ]; then
      print -r -- "4. Body: exactly the text between BODY_START and BODY_END, word for word, keeping its line breaks."
    else
      print -r -- "4. Body: write it. ${note:+The owner wants it to say: $note. }$RULES Sign off with just: $(me_val name)"
    fi
    [[ $company == "Tam Fortis" || $company == "Nexcavate" ]] && print -r -- "   This is the $company lane: put this as the very first line of the body: [Send from your $company address]"
    print -r -- "5. get_draft the new draft and check the body is there; if it is empty, update_draft it."
    print -r -- "6. Print exactly one line: DRAFT <the draft's viewUrl>, or FAILED <why>."
    [ -n "$body" ] && { print -r -- ""; print -r -- "BODY_START"; print -r -- "$body"; print -r -- "BODY_END"; }
  } > "$C/draft-prompt.md"
  out=$(claude_run 420 sonnet "$C/draft-prompt.md" ToolSearch Read mcp__claude_ai_ClickUp__clickup_search mcp__claude_ai_ClickUp__clickup_get_task $GMAIL_TOOLS)
  print -r -- "$out" > "$C/draft-output"
  url=$(print -r -- "$out" | /usr/bin/sed -nE 's/^`?DRAFT (https:[^ `]+)`?$/\1/p' | head -1)
  if [ -n "$url" ]; then log "draft for $name: $url"; print -r -- "ok $url"
  else why=$(print -r -- "$out" | tail -1 | cut -c1-160); log "draft FAILED for $name: $why"; print -r -- "failed: ${why:-no answer from Gmail}"; fi
}

# The two part TPOC ask (can we meet; if not, who else should we talk to), one draft per TPOC on a
# proposal, starting from the drafts Hermes left on its Opportunity record. Pre release only.
tpoc_now() {
  print -r -- "$1" | /usr/bin/base64 -D > "$C/tpoc-spec.json" 2>/dev/null
  local title=$(spec_get tpoc-spec.json title) topic=$(spec_get tpoc-spec.json topic) opp=$(spec_get tpoc-spec.json opp)
  local ppl=$(spec_get tpoc-spec.json people) company=$(spec_get tpoc-spec.json company)
  local me_full=$(me_val full) me_mail=$(me_val email) cc=""
  [[ ${me_mail:l} != ${AYESHA:l} ]] && cc=$AYESHA
  {
    print -r -- "Write TPOC outreach drafts in Gmail for $me_full ($me_mail), unattended; nobody will answer. Never send anything."
    print -r -- "Today is $(date '+%A %b %d %Y'). Proposal: $topic, $title ($company). Its CRM Opportunity record: ${opp:-none}."
    print -r -- "TPOCs (JSON, with ClickUp contact links): $ppl"
    print -r -- "1. Read the Opportunity record with clickup_get_task (include description): it may already hold drafted outreach for these people. Read each TPOC's contact task for their Primary Email."
    print -r -- "2. For each TPOC with an email address, create_draft a new email: a specific subject naming the topic number, and a short body (under 150 words) that makes the two part ask: can we meet for 20 minutes during the pre release window about the problem behind the topic, and if not, who else in their office or an adjacent one should we talk to. Start from Hermes's draft when there is one. One point of contact per email.${cc:+ Cc $cc.}"
    print -r -- "   $RULES Sign off with just: $(me_val name)"
    print -r -- "3. get_draft each one to confirm the body is there."
    print -r -- "4. Print one line per TPOC: DRAFT<TAB>name<TAB>viewUrl, or SKIP<TAB>name<TAB>why. Nothing else."
  } > "$C/tpoc-prompt.md"
  out=$(claude_run 900 sonnet "$C/tpoc-prompt.md" ToolSearch Read mcp__claude_ai_ClickUp__clickup_get_task mcp__claude_ai_ClickUp__clickup_search $GMAIL_TOOLS)
  print -r -- "$out" > "$C/tpoc-output"
  res=$(print -r -- "$out" | /usr/bin/grep -E $'^(DRAFT|SKIP)\t')
  log "tpoc drafts for $topic: $(print -r -- "$res" | /usr/bin/grep -c '^DRAFT')"
  print -r -- "${res:-FAILED	-	$(print -r -- "$out" | tail -1 | cut -c1-160)}"
}

# Nudges: outreach the owner sent 5 or more business days ago with no answer gets a short follow up
# waiting in drafts (Ayesha's rule). At most 5 a run; a thread is nudged once (.crm/nudged).
nudge_now() {
  mkdir "$C/nlock" 2>/dev/null || { (( $(date +%s) - $(mtime "$C/nlock") < 1800 )) && return 0; }
  trap 'rmdir "$C/nlock" 2>/dev/null' EXIT
  touch "$C/nudged"
  local me_full=$(me_val full) me_mail=$(me_val email) dom=${$(me_val email)#*@}
  {
    print -r -- "Find unanswered outreach for $me_full ($me_mail) and leave a follow up draft for each, unattended; nobody will answer. Never send anything."
    print -r -- "Today is $(date '+%A %b %d %Y')."
    print -r -- "1. Gmail search_threads: in:sent newer_than:21d older_than:5d -to:$dom, pageSize 40. get_thread each likely one."
    print -r -- "2. Keep a thread only if: the last message is from $me_full, it went to someone outside $dom, it was real outreach or a question that expects an answer (not a thank you, an FYI, a receipt, a sign up or a reply to a newsletter), at least 5 business days have passed since it, and nobody replied after it. Skip these thread ids: $(tr '\n' ' ' < "$C/nudged")"
    print -r -- "3. For at most 5 kept threads, newest first: create_draft as a reply to the last message (replyToMessageId), same recipients and cc. Body: two or three short sentences that bump the earlier note, restate the one ask, and offer an easy next step. $RULES Sign off with just: $(me_val name)"
    print -r -- "4. Print one line per draft: NUDGE<TAB>thread id<TAB>recipient name<TAB>subject<TAB>draft viewUrl<TAB>date of the original message (YYYY-MM-DD). Then print NUDGE_DONE. Nothing else."
  } > "$C/nudge-prompt.md"
  out=$(claude_run 900 sonnet "$C/nudge-prompt.md" ToolSearch Read $GMAIL_TOOLS)
  print -r -- "$out" > "$C/nudge-output"
  rows=$(print -r -- "$out" | /usr/bin/grep -E $'^NUDGE\t' | /usr/bin/sed $'s/^NUDGE\t//')
  if [ -n "$rows" ]; then
    print -r -- "$rows" >> "$C/nudges.tsv"
    print -r -- "$rows" | /usr/bin/cut -f1 >> "$C/nudged"
    log "nudges: $(print -r -- "$rows" | /usr/bin/grep -c .)"
  elif print -r -- "$out" | /usr/bin/grep -q NUDGE_DONE; then log "nudges: none due"
  else log "nudge FAILED: $(print -r -- "$out" | tail -1 | cut -c1-160)"; fi
  touch "$C/last-nudge"
}

# People named in business meetings (BizDev, check ins, Tam Fortis, partner calls) become Leads rows:
# who, from where, what was said and by whom, with a link to the moment in the transcript.
meetings_now() {
  mkdir "$C/mlock" 2>/dev/null || { (( $(date +%s) - $(mtime "$C/mlock") < 1800 )) && return 0; }
  trap 'rmdir "$C/mlock" 2>/dev/null' EXIT
  touch "$C/meetings-seen"
  {
    print -r -- "Read only and unattended: never send, post, create or change anything. Nobody will answer questions."
    print -r -- "Task: keep a sales CRM current. Today is $(date '+%A %b %d %Y'). Our companies: MSBAI (simulation software), Tam Fortis Solutions (energy) and Nexcavate (permitting software). Fireflies often writes {{OWNER_FIRST}} as Ryan and Kriss as Chris."
    print -r -- "1. fireflies_get_transcripts for meetings in the last 3 days. Skip these meeting ids: $(tr '\n' ' ' < "$C/meetings-seen")"
    print -r -- "2. Keep business development meetings only: BizDev, check ins with Ayesha or Allan, Tam Fortis or Nexcavate business meetings, partner or customer calls. Skip engineering stand ups and technical working sessions."
    print -r -- "3. For each kept meeting read its summary and action items (fireflies_get_summary). Only if the summary names a person without enough context, use fireflies_search on that name to find the moment."
    print -r -- "4. List every EXTERNAL person or organization discussed as a sales lead, customer, partner or government technical point of contact (TPOC) to follow up with, for example someone Allan met at an event. Not teammates. Business facts only: who they are and the follow up."
    print -r -- "5. Print one line each: M<TAB>meeting id<TAB>meeting title<TAB>meeting date YYYY-MM-DD<TAB>person (or the organization when no person is named)<TAB>organization<TAB>company lane (MSBAI, Tam Fortis or Nexcavate)<TAB>lead, customer, partner or tpoc<TAB>what was said about them, one plain sentence<TAB>the follow up it implies, one sentence<TAB>who said it<TAB>seconds into the meeting, or -"
    print -r -- "   Then print SEEN<TAB>meeting id for every meeting you looked at (kept or skipped), then MEET_DONE. Replace TABs and newlines inside values with spaces. No dashes as connectors."
  } > "$C/meet-prompt.md"
  local tools=(ToolSearch Read mcp__claude_ai_Fireflies__fireflies_get_transcripts mcp__claude_ai_Fireflies__fireflies_get_summary mcp__claude_ai_Fireflies__fireflies_search)
  out=$(claude_run 1200 sonnet "$C/meet-prompt.md" $tools)
  if ! print -r -- "$out" | /usr/bin/grep -q MEET_DONE; then
    log "meetings: sonnet did not finish ($(print -r -- "$out" | /usr/bin/grep -o 'safeguards\|API Error\|timed out' | head -1)), trying opus"
    out=$(claude_run 1200 opus "$C/meet-prompt.md" $tools)
  fi
  print -r -- "$out" > "$C/meet-output"
  if print -r -- "$out" | /usr/bin/grep -q MEET_DONE; then
    print -r -- "$out" | /usr/bin/grep -E $'^M\t' | /usr/bin/sed $'s/^M\t//' >> "$C/mentions.tsv"
    print -r -- "$out" | /usr/bin/grep -E $'^SEEN\t' | /usr/bin/cut -f2 >> "$C/meetings-seen"
    log "meetings: $(print -r -- "$out" | /usr/bin/grep -c $'^M\t') mentions"
    build >/dev/null
  else log "meetings FAILED: $(print -r -- "$out" | tail -1 | cut -c1-160)"; fi
  touch "$C/last-meet"
}

# Ask the CRM a question in plain words; the answer comes from crm.json plus ClickUp, Gmail and Slack.
ask_now() {
  print -r -- "$1" | /usr/bin/base64 -D > "$C/ask-spec.json" 2>/dev/null
  local q=$(spec_get ask-spec.json q) co=$(spec_get ask-spec.json co)
  {
    print -r -- "Read only and unattended: never send, post, create or change anything."
    print -r -- "Today is $(date '+%A %b %d %Y'). Answer a question about our relationships for $(me_val full). Company in view: ${co:-All}."
    print -r -- "Start from the CRM model: Read desk-widget/.crm/crm.json (items, people, calendar). Then check ClickUp (clickup_search), Gmail (search_threads) and Slack (slack_search_public_and_private) only as far as the question needs."
    print -r -- "Question: $q"
    print -r -- "Answer in at most 8 short lines of plain text: names, what we know, the next step, and a link for each source you used (just the URL). If the answer is not there, say so. GURU in all caps; no dashes as connectors."
    print -r -- "Print ANSWER_START, the answer, ANSWER_END, nothing else."
  } > "$C/ask-prompt.md"
  out=$(claude_run 420 sonnet "$C/ask-prompt.md" ToolSearch Read mcp__claude_ai_ClickUp__clickup_search mcp__claude_ai_ClickUp__clickup_get_task \
        mcp__claude_ai_Gmail__search_threads mcp__claude_ai_Gmail__get_thread mcp__claude_ai_Slack__slack_search_public_and_private)
  print -r -- "$out" > "$C/ask-output"
  ans=$(print -r -- "$out" | /usr/bin/awk '/^ANSWER_END/ { on = 0 } on { print } /^ANSWER_START/ { on = 1 }')
  [ -n "$ans" ] || ans="No answer came back. crm.sh status has the log."
  /usr/bin/python3 -c 'import json,sys,time; json.dump({"q": sys.argv[1], "a": sys.argv[2], "at": int(time.time())}, open(sys.argv[3], "w"))' "$q" "$ans" "$C/ask.json"
  print -r -- "ASK"$'\t'"$(tr -d '\n' < "$C/ask.json")"
}

# Notify mode for the CRM (no model): see crm_watch.py. New alerts become one macOS notification.
watch_now() {
  new=$(/usr/bin/python3 "$HERE/crm_watch.py" "$MODEL_JSON" "$HERE/.emails.tsv" "$C/nudges.tsv" "$HERE/me.json" \
        "$C/watch-state.json" "$C/seen" "$C/alerts.json" 2>/dev/null)
  touch "$C/last-watch"
  local n=$(print -r -- "$new" | /usr/bin/python3 -c 'import json,sys; a=json.load(sys.stdin); print(len(a)); [print(x["what"]) for x in a[:3]]' 2>/dev/null)
  local h=$(( 10#$(date +%H) ))
  if [[ -n $n && ${n%%$'\n'*} != 0 ]] && (( h >= 7 && h < 20 )); then
    /usr/bin/osascript -e 'on run a' -e 'display notification (item 2 of a) with title (item 1 of a)' -e 'end run' \
      "CRM: ${n%%$'\n'*} new" "${${n#*$'\n'}//$'\n'/ · }" >/dev/null 2>&1
  fi
}

# ── Two way: the Rolodex pages and the outbox ──
# rolodex/<person>.md is the desk's merged page for each person (crm_pages.py). What you do on a card
# that ClickUp should know goes into .crm/outbox.jsonl and `crm.sh push` writes it, the same way the
# task sync pairs TASKS.md with ClickUp. Only writes Hermes reads back are made: close a Follow-up,
# create a Follow-up (Origin manual), create an Interested Later, and a comment on the person's
# Company Relationship. Never a delete, never a field Hermes computes (stage, health, touches).
ROLO="$HERE/rolodex"
pages() { /usr/bin/python3 "$HERE/crm_pages.py" "$MODEL_JSON" "$C/cards" "$ROLO" >/dev/null 2>&1; }

queue_op() {   # B64 json op -> appended to the outbox with an id and time; push starts in the background
  /usr/bin/python3 - "$C/outbox.jsonl" "$1" <<'QPY'
import base64, json, sys, time, uuid
op = json.loads(base64.b64decode(sys.argv[2]).decode())
# only these four writes exist; there is no delete, and nothing that creates or edits people records
if op.get("op") not in ("close", "followup", "later", "comment"): print("refused " + str(op.get("op"))); sys.exit(0)
key = lambda o: (o.get("op"), o.get("task", ""), (o.get("title") or o.get("interest") or o.get("text") or "").strip().lower(), o.get("name", ""))
try: queued = [json.loads(l) for l in open(sys.argv[1]) if l.strip()]
except FileNotFoundError: queued = []
if any(key(o) == key(op) for o in queued): print("duplicate, already queued"); sys.exit(0)
op["oid"] = uuid.uuid4().hex[:10]; op["at"] = int(time.time())
open(sys.argv[1], "a").write(json.dumps(op, ensure_ascii=False) + "\n")
print("queued " + op["oid"])
QPY
  ( /bin/zsh "$SELF" push ) >/dev/null 2>&1 &!
}

note_now() {   # {"name","company","text","rel","con"} -> a dated line under "From the desk", and a ClickUp comment
  /usr/bin/python3 - "$ROLO" "$1" "$(me_val name)" <<'NPY'
import base64, datetime, json, os, re, sys
d = json.loads(base64.b64decode(sys.argv[2]).decode())
norm = lambda x: re.sub(r"\s+", " ", re.sub(r"[^\w@.\s]", " ", (x or "").lower())).strip()
slug = re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", norm(d["name"]))).strip("-")[:60] or "unknown"
os.makedirs(sys.argv[1], exist_ok=True)
p = os.path.join(sys.argv[1], slug + ".md")
t = open(p, encoding="utf-8").read() if os.path.exists(p) else "# %s\n\n## From the desk\n" % d["name"]
if "## From the desk" not in t: t = t.rstrip() + "\n\n## From the desk\n"
line = "- %s %s: %s" % (datetime.date.today().isoformat(), sys.argv[3], re.sub(r"\s+", " ", d["text"]).strip())
a = t.index("## From the desk") + len("## From the desk")
nxt = re.search(r"^## ", t[a:], re.M)
end = a + nxt.start() if nxt else len(t)
t = t[:end].rstrip() + "\n" + line + "\n" + ("\n" + t[end:] if nxt else "")
open(p, "w", encoding="utf-8").write(t)
print("ok " + slug)
NPY
  local rel=$(print -r -- "$1" | /usr/bin/base64 -D | /usr/bin/python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("rel") or d.get("con") or "")')
  if [ -n "$rel" ]; then
    queue_op "$(print -r -- "$1" | /usr/bin/base64 -D | /usr/bin/python3 -c 'import json,sys,base64; d=json.load(sys.stdin); print(base64.b64encode(json.dumps({"op":"comment","task":d.get("rel") or d.get("con"),"name":d["name"],"text":d["text"]}).encode()).decode())')" >/dev/null
  fi
}

push_now() {
  cu_blocked && return 0                      # writes stay pending until ClickUp's limit resets
  mkdir "$C/plock" 2>/dev/null || { (( $(date +%s) - $(mtime "$C/plock") < 900 )) && return 0; }
  trap 'rmdir "$C/plock" 2>/dev/null' EXIT
  touch "$C/outbox.jsonl" "$C/outbox-done.jsonl"
  local pend=$(/usr/bin/python3 - "$C/outbox.jsonl" "$C/outbox-done.jsonl" <<'PPY'
import json, sys
done = {json.loads(l).get("oid") for l in open(sys.argv[2]) if l.strip()}
for l in open(sys.argv[1]):
    if l.strip() and json.loads(l).get("oid") not in done: print(l.strip())
PPY
)
  [ -n "$pend" ] || return 0
  local me_full=$(me_val full) me_cu=$(me_val clickup) me_mail=$(me_val email)
  {
    print -r -- "Write to ClickUp for $me_full, unattended; nobody will answer. Workspace 20115771. Do exactly the operations listed, nothing else: never delete, archive, merge, move or reassign anything, and never change any other task or field. OpenClaw's Hermes agent owns the CRM's people and organizations: never create or edit Contacts, Organizations or Company Relationships."
    print -r -- "Keep it clean, no duplicates: before any create, look for an open task that already covers it (below). When one exists, add a comment to that task with the desk's text instead of creating a new one, and report it as ok with that task's url."
    print -r -- "First call clickup_get_custom_fields for list 901115367058 (Follow-ups) and, only if an op needs it, list 901115485850 (Interested Later), to get the field ids and option ids."
    print -r -- "Operations, one JSON per line:"
    print -r -- "$pend"
    print -r -- ""
    print -r -- "How to do each op:"
    print -r -- "- close: clickup_get_task on \"task\" first. Only if it is in list 901115367058 (Follow-ups) and still open, clickup_update_task it with status \"complete\". Anything else: failed, not a follow up."
    print -r -- "- followup: first clickup_filter_tasks list_ids [\"901115367058\"], include_closed false, and look for an open follow up for the same person (name in the task name or Contact) about the same thing. If there is one, comment on it instead. Otherwise clickup_create_task in list 901115367058, name \"title\" plus \" — \" plus \"name\" when name is given, assignees [\"$me_cu\"], due_date from \"due\" (YYYY-MM-DD) when given, description \"From ${me_full}'s desk (CRM tab): \" plus \"note\". Custom fields: Entity = \"company\", Direction = we owe them, Origin = manual, Commitment State = open, Owner Email = $me_mail, and Contact = [\"contact\"] when a contact task id is given."
    print -r -- "- later: first clickup_filter_tasks list_ids [\"901115485850\"], include_closed false; if that person already has a waiting entry, comment on it instead. Otherwise clickup_create_task in list 901115485850, name \"name\" plus \" — \" plus \"interest\". Custom fields: Entity = \"company\", Interest = \"interest\", Why Later = \"why\", Resurface On = \"resurface\" (YYYY-MM-DD), Interest State = waiting, and Contact = [\"contact\"] when given."
    print -r -- "- comment: only on an existing task; clickup_create_task_comment on task \"task\" with the text \"From ${me_full}'s desk (CRM tab): \" plus \"text\"."
    print -r -- ""
    print -r -- "Print one line per op: RESULT<TAB>oid<TAB>ok<TAB>the task url (or the task id), or RESULT<TAB>oid<TAB>failed<TAB>why in a few words. Then PUSH_DONE. Nothing else."
  } > "$C/push-prompt.md"
  out=$(claude_run 600 sonnet "$C/push-prompt.md" ToolSearch Read mcp__claude_ai_ClickUp__clickup_get_custom_fields \
        mcp__claude_ai_ClickUp__clickup_filter_tasks mcp__claude_ai_ClickUp__clickup_get_task \
        mcp__claude_ai_ClickUp__clickup_update_task mcp__claude_ai_ClickUp__clickup_create_task mcp__claude_ai_ClickUp__clickup_create_task_comment)
  print -r -- "$out" > "$C/push-output"
  print -r -- "$out" | /usr/bin/grep -E $'^RESULT\t' | /usr/bin/python3 -c '
import json, sys, time
for l in sys.stdin:
    f = l.rstrip("\n").split("\t") + ["", "", ""]
    if f[2] == "ok" or f[2] == "failed":
        print(json.dumps({"oid": f[1], "status": f[2], "detail": f[3], "done": int(time.time())}))' >> "$C/outbox-done.jsonl"
  log "push: $(print -r -- "$out" | /usr/bin/grep -c $'\tok\t') ok, $(print -r -- "$out" | /usr/bin/grep -c $'\tfailed\t') failed"
}

case "${1:-status}" in
tick)
  [ -s "$MODEL_JSON" ] && print -r -- "CRM"$'\t'"$(tr -d '\n' < "$MODEL_JSON")"
  /usr/bin/find "$C/cards" -name '*.json' -mtime +14 -delete 2>/dev/null
  for f in "$C/cards/"*.json(N); do
    print -r -- "CARD"$'\t'"${${f:t:r}//_/:}"$'\t'"$(tr -d '\n' < "$f")"
  done
  (( $(date +%s) - $(mtime "$C/last-watch") >= 300 )) && watch_now
  [ -s "$C/alerts.json" ] && print -r -- "ALERTS"$'\t'"$(tr -d '\n' < "$C/alerts.json")"
  if [ -s "$C/nudges.tsv" ]; then   # nudges still waiting in drafts, minus the ones marked done
    [ -s "$C/nudges-done" ] || print -r -- "#" > "$C/nudges-done"   # awk's NR == FNR needs a non empty first file
    /usr/bin/awk -F'\t' 'NR == FNR { done[$1] = 1; next } !($1 in done)' "$C/nudges-done" "$C/nudges.tsv" | /usr/bin/tail -20 | /usr/bin/sed $'s/^/NUDGE\t/'
  fi
  [ -s "$C/ask.json" ] && print -r -- "ASK"$'\t'"$(tr -d '\n' < "$C/ask.json")"
  if [ -s "$C/outbox.jsonl" ]; then   # the last 30 ops with their result, for the widget
    touch "$C/outbox-done.jsonl"
    /usr/bin/python3 - "$C/outbox.jsonl" "$C/outbox-done.jsonl" <<'OPY'
import json, sys
done = {}
for l in open(sys.argv[2]):
    if l.strip(): d = json.loads(l); done[d["oid"]] = d
ops = [json.loads(l) for l in open(sys.argv[1]) if l.strip()][-30:]
for o in ops:
    o.update(done.get(o["oid"], {"status": "pending"})); print("OUTBOX\t" + json.dumps(o, ensure_ascii=False))
OPY
    if [ ! -d "$C/plock" ] && /usr/bin/python3 -c 'import json,sys; d={json.loads(l)["oid"] for l in open(sys.argv[2]) if l.strip()}; sys.exit(0 if any(json.loads(l)["oid"] not in d for l in open(sys.argv[1]) if l.strip()) else 1)' "$C/outbox.jsonl" "$C/outbox-done.jsonl"; then
      ( /bin/zsh "$SELF" push ) >/dev/null 2>&1 &!
    fi
  fi
  if [ -d "$C/lock" ]; then print -r -- "CRMSYNC"$'\t'"syncing"
  else print -r -- "CRMSYNC"$'\t'"$(tail -1 "$LOG" 2>/dev/null)"; fi
  h=$(( 10#$(date +%H) ))
  if (( h >= 6 && h < 22 )) && [ ! -d "$C/lock" ] && (( $(date +%s) - $(mtime "$C/last-sync") >= EVERY )); then
    ( /bin/zsh "$SELF" sync ) >/dev/null 2>&1 &!
  elif (( h >= 7 && h < 20 )) && [ ! -d "$C/nlock" ] && (( $(date +%s) - $(mtime "$C/last-nudge") >= ${CRM_NUDGE_EVERY:-10800} )); then
    ( /bin/zsh "$SELF" nudge ) >/dev/null 2>&1 &!
  elif (( h >= 7 && h < 21 )) && [ ! -d "$C/mlock" ] && (( $(date +%s) - $(mtime "$C/last-meet") >= ${CRM_MEET_EVERY:-10800} )); then
    ( /bin/zsh "$SELF" meetings ) >/dev/null 2>&1 &!
  fi
  ;;
sync)  sync_now ;;
parse) build ;;
card)  card_now "$2" ;;
draft) draft_now "$2" ;;
tpoc)  tpoc_now "$2" ;;
nudge) nudge_now ;;
meetings) meetings_now ;;
ask)   ask_now "$2" ;;
watch) watch_now ;;
seen)  print -r -- "$2" >> "$C/seen"; watch_now; print -r -- "ok" ;;
queue) queue_op "$2" ;;
note)  note_now "$2" ;;
push)  push_now ;;
pages) pages; print -r -- "ok" ;;
nudge-done) print -r -- "$2" >> "$C/nudges-done"; print -r -- "nudge:$2" >> "$C/seen"; watch_now; print -r -- "ok" ;;
status) tail -20 "$LOG" 2>/dev/null ;;
esac
exit 0
