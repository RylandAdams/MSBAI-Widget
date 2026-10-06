#!/bin/zsh
# cmd.sh — the widget's "say it" bar: one spoken or typed sentence becomes one action.
#
#   cmd.sh run B64TEXT     # -> one line of JSON the widget acts on (see below)
#   cmd.sh task B64JSON    # {"title", "due": "YYYY-MM-DD" or "", "meta", "note"} -> adds it to TASKS.md
#
# run asks a headless Claude (no tools, fast model) to sort the sentence into one action:
#   {"action":"call","kind":"zoom"|"meet","topic":"...","people":["Kriss", ...]}
#       the widget opens the call card filled in, and you press Confirm
#   {"action":"task","title":"...","due":"YYYY-MM-DD" or ""}
#       added straight to TASKS.md under ## Active
#   {"action":"claude","prompt":"..."}
#       anything else (drafts, research, questions): a new Claude thread with it pasted, not sent
# Nothing is ever sent or posted from here.

SELF=${0:A}                        # $0 inside a zsh function is the function name, so keep the path
HERE=${0:A:h}
ROOT=${HERE:h}
C="$HERE/.cmd"
LOG="$C/log"
TASKS="$ROOT/TASKS.md"

export PATH="$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
mkdir -p "$C"

log() { print -r -- "$(date '+%F %T')  $*" >> "$LOG"; }

case "${1:-}" in

run)
  text=$(print -r -- "$2" | /usr/bin/base64 -D 2>/dev/null | tr '\r\n\t' '   ')
  [ -n "${text// /}" ] || { print -r -- '{"action":"none"}'; exit 0; }
  team=$(cut -f1 "$HERE/team.tsv" 2>/dev/null | paste -sd, - | sed 's/,/, /g')
  {
    print -r -- "Sort one command from {{OWNER_FULL}}'s desktop widget into one action. Answer with one line of"
    print -r -- "JSON and nothing else. Today is $(date '+%A %Y-%m-%d, %H:%M %Z')."
    print -r -- "His teammates: $team. Fix misheard names to the closest teammate (Chris is Kriss, Aisha is"
    print -r -- "Ayesha, Araz is Aras, Alan is Allan, Dewyer is Dwyer)."
    print -r -- ""
    print -r -- "Actions:"
    print -r -- '{"action":"call","kind":"meet","topic":"short name for the call","people":["teammate names"]}'
    print -r -- '  for starting a call now (calls are always Google Meet).'
    print -r -- '{"action":"task","title":"short imperative task","due":"YYYY-MM-DD or empty"}'
    print -r -- '  for "remind me to", "add a task", "I need to", "don'"'"'t let me forget". Resolve relative dates.'
    print -r -- '{"action":"claude","prompt":"the command, cleaned up into a clear request"}'
    print -r -- "  for everything else: drafting a reply or a Slack message, research, questions."
    print -r -- ""
    print -r -- "Command: $text"
  } > "$C/prompt.md"
  out=$(cd "$ROOT" && /usr/bin/perl -e 'alarm shift; exec @ARGV' 60 \
        claude -p --model haiku --permission-mode dontAsk < "$C/prompt.md" 2>&1)
  json=$(print -r -- "$out" | /usr/bin/python3 -c '
import json, re, sys
raw = sys.stdin.read()
m = re.search(r"\{.*\}", raw, re.S)
try:
    d = json.loads(m.group(0)) if m else None
except Exception:
    d = None
if not isinstance(d, dict) or d.get("action") not in ("call", "task", "claude"):
    d = {"action": "claude", "prompt": sys.argv[1]}
print(json.dumps(d))' "$text")
  log "run: $text -> $json"
  print -r -- "$json"
  ;;

task)
  spec=$(print -r -- "$2" | /usr/bin/base64 -D 2>/dev/null)
  /usr/bin/python3 - "$TASKS" "$spec" <<'PY'
import datetime, json, re, sys
path, spec = sys.argv[1], json.loads(sys.argv[2])
title = re.sub(r"[\r\n*]+", " ", str(spec.get("title") or "")).strip()
if not title:
    print("failed: no title"); sys.exit(0)
meta = re.sub(r"[\r\n]+", " ", str(spec.get("meta") or "")).strip() or "added by voice"
meta += " " + datetime.date.today().strftime("%b %d").replace(" 0", " ")
due = str(spec.get("due") or "").strip()
try:
    meta += ", due " + datetime.date.fromisoformat(due).strftime("%a %b %d").replace(" 0", " ")
except ValueError:
    pass
line = f"- [ ] **{title}** · {meta}\n"
note = re.sub(r"[\r\n]+", " ", str(spec.get("note") or "")).strip()
if note:
    line += f"  - {note}\n"
text = open(path, encoding="utf-8").read()
m = re.search(r"^## Active[^\n]*\n", text, re.M)
if m:
    text = text[:m.end()] + line + text[m.end():]
else:
    text = "## Active\n" + line + "\n" + text
open(path, "w", encoding="utf-8").write(text)
print("ok")
PY
  ;;

*)
  print -r -- "usage: cmd.sh run B64TEXT | task B64JSON" >&2
  ;;
esac
exit 0
