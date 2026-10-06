#!/bin/zsh
# team.sh — keeps team.tsv (the Meet card's teammates) in step with Slack. Read only on Slack.
#
#   team.sh tick       # the widget's refresh beat: print the team and its notes; refresh once a day
#   team.sh sync       # check Slack now, then print the same as tick
#   team.sh drop <id>  # take someone off the card (they are not added back)
#   team.sh status     # the tail of the log
#
# Who counts: active, non bot members of #general whose Slack email is on your own domain
# (the domain of the email in me.json, so @microsurgeonbot.com here). Guests, bots, deactivated
# accounts and people on other domains never get added.
#
# It only ever adds. A new teammate goes at the end of team.tsv with their first name; your order
# and names stay as you wrote them. Someone on the card who is no longer active in Slack gets a
# note on the card, and you decide whether to drop them.
#
# .team/seen holds every Slack id already considered. The first sync records everyone already in
# Slack without adding them, so only people who join after that are added on their own.

SELF=${0:A}
HERE=${0:A:h}
ROOT=${HERE:h}
T="$HERE/.team"
TEAM="$HERE/team.tsv"
LOG="$T/log"
EVERY=${TEAM_EVERY:-86400}
MODEL=${TEAM_MODEL:-haiku}
CHANNEL=${TEAM_CHANNEL:-CBGKWT5M3}   # #general, which everyone in the workspace is in

export PATH="$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
mkdir -p "$T"

log() { print -r -- "$(date '+%F %T')  team: $*" >> "$LOG"; }
mtime() { /usr/bin/stat -f %m "$1" 2>/dev/null || print 0; }

show() {
  [ -s "$TEAM" ] && cat "$TEAM"
  [ -s "$T/notes" ] && /usr/bin/awk -F'\t' -v now="$(date +%s)" \
    '$1 == "gone" || ($1 == "added" && now - $4 < 7 * 86400) { print "NOTE\t" $1 "\t" $2 "\t" $3 }' "$T/notes"
  [ -f "$T/synced" ] && print -r -- "SYNCED"$'\t'"$(mtime "$T/synced")"
  return 0
}

sync() {
  if ! mkdir "$T/lock" 2>/dev/null; then
    (( $(date +%s) - $(mtime "$T/lock") < 900 )) && return 0
    rmdir "$T/lock"; mkdir "$T/lock" || return 0
  fi
  trap 'rmdir "$T/lock" 2>/dev/null' EXIT
  {
    print -r -- "Read only and unattended: never send, post, change or create anything."
    print -r -- "Call mcp__claude_ai_Slack__slack_list_channel_members with channel_id \"$CHANNEL\", limit 30,"
    print -r -- "response_format \"detailed\". While the result gives a cursor for more members, call it again with"
    print -r -- "that cursor. If a result was saved to a file because it was large, open it with Read."
    print -r -- "Then print a line MEM_START, then one line per member with these fields separated by a TAB"
    print -r -- "character: User ID, Email, Display Name, Real Name. Use - for an empty field. Then a line MEM_END."
    print -r -- "Every member, exactly as given, no summary, nothing else."
  } > "$T/prompt.md"
  out=$(cd "$ROOT" && /usr/bin/perl -e 'alarm shift; exec @ARGV' 600 \
        claude -p --model "$MODEL" --permission-mode dontAsk \
        --allowedTools ToolSearch Read mcp__claude_ai_Slack__slack_list_channel_members < "$T/prompt.md" 2>&1)
  print -r -- "$out" > "$T/output"
  res=$(/usr/bin/python3 - "$T/output" "$TEAM" "$T" "$HERE/me.json" <<'PY'
import json, os, re, sys, time
raw, team_path, tdir, me_path = sys.argv[1:5]
text = open(raw, encoding="utf-8", errors="replace").read()
m = re.search(r"^MEM_START\s*$(.*?)^MEM_END\s*$", text, re.S | re.M)
if not m: print("bad no member list"); sys.exit(0)
members = {}
for line in m.group(1).splitlines():
    f = [x.strip() for x in line.split("\t")]
    if len(f) < 4 or not re.match(r"^[UW][A-Z0-9]{6,}$", f[0]): continue
    members[f[0]] = {"email": "" if f[1] == "-" else f[1].lower(), "display": "" if f[2] == "-" else f[2],
                     "real": "" if f[3] == "-" else f[3]}
try: me = json.load(open(me_path))
except Exception: me = {}
my_email = (me.get("email") or "").lower()
domain = my_email.split("@")[-1] if "@" in my_email else ""
if not domain: print("bad no email in me.json"); sys.exit(0)

rows = []
if os.path.exists(team_path):
    for l in open(team_path, encoding="utf-8").read().splitlines():
        f = l.split("\t")
        if len(f) >= 2 and f[1].strip(): rows.append(f)
on_card = {f[1].strip() for f in rows}
# A short or partial answer from Slack must never read as "everyone left".
if len(members) < 5 or (on_card and len(on_card & set(members)) < 0.6 * len(on_card)):
    print("bad only %d members came back" % len(members)); sys.exit(0)

ours = {i: p for i, p in members.items() if p["email"].endswith("@" + domain) and p["email"] != my_email}
seen_path = os.path.join(tdir, "seen")
first = not os.path.exists(seen_path)
seen = set(open(seen_path).read().split()) if not first else set()
notes_path = os.path.join(tdir, "notes")
notes = [l.split("\t") for l in open(notes_path, encoding="utf-8").read().splitlines()] if os.path.exists(notes_path) else []
notes = [n for n in notes if len(n) >= 4 and n[0] == "added"]   # "gone" is worked out fresh each time

def first_name(p):
    n = re.sub(r"\(.*?\)", "", p["display"] or p["real"] or p["email"].split("@")[0]).strip()
    return n.split()[0] if n else p["email"].split("@")[0]

added = []
if first:
    seen = set(ours) | on_card
else:
    names = {f[0].strip().lower() for f in rows}
    for i, p in ours.items():
        if i in seen or i in on_card: continue
        name = first_name(p)
        if name.lower() in names:
            full = re.sub(r"\(.*?\)", "", p["real"] or p["display"]).split()
            name = (name + " " + full[1][0]) if len(full) > 1 else name + " " + i[-3:]
        names.add(name.lower())
        rows.append([name, i, p["email"]])
        added.append(name)
        notes.append(["added", i, name, str(int(time.time()))])
    seen |= set(ours)
gone = [["gone", f[1].strip(), f[0].strip(), str(int(time.time()))] for f in rows if f[1].strip() not in members]

if added:
    tmp = team_path + ".tmp"
    open(tmp, "w", encoding="utf-8").write("".join("\t".join(x.strip() for x in f[:3]) + "\n" for f in rows))
    os.replace(tmp, team_path)
open(seen_path, "w").write("\n".join(sorted(seen)) + "\n")
open(notes_path, "w", encoding="utf-8").write("".join("\t".join(n[:4]) + "\n" for n in notes + gone))
print("ok %d in Slack on %s%s%s%s" % (len(ours), domain, " (first run, everyone already there recorded)" if first else "",
      ", added " + ", ".join(added) if added else "", ", not active: " + ", ".join(g[2] for g in gone) if gone else ""))
PY
)
  case $res in
    ok*) touch "$T/synced"; log "${res#ok }" ;;
    *)   touch "$T/synced"; log "sync FAILED: ${res#bad } $(print -r -- "$out" | tail -1 | cut -c1-120)" ;;
  esac
}

case "${1:-status}" in
tick)
  h=$(( 10#$(date +%H) ))
  if (( h >= 7 && h < 22 )) && [ ! -d "$T/lock" ] && (( $(date +%s) - $(mtime "$T/synced") >= EVERY )); then
    ( /bin/zsh "$SELF" sync >/dev/null ) >/dev/null 2>&1 &!
  fi
  show
  ;;
sync)
  sync
  show
  ;;
drop)
  id=$2
  [[ $id =~ '^[UW][A-Z0-9]{6,}$' ]] || { print "bad id"; exit 0; }
  cp "$TEAM" "$T/team.tsv.bak" 2>/dev/null
  /usr/bin/awk -F'\t' -v id="$id" '$2 != id' "$T/team.tsv.bak" > "$TEAM.tmp" && mv "$TEAM.tmp" "$TEAM"
  [ -f "$T/notes" ] && /usr/bin/awk -F'\t' -v id="$id" '$2 != id' "$T/notes" > "$T/notes.tmp" && mv "$T/notes.tmp" "$T/notes"
  grep -qx "$id" "$T/seen" 2>/dev/null || print -r -- "$id" >> "$T/seen"
  log "dropped $id"
  show
  ;;
status)
  /usr/bin/grep 'team:' "$LOG" | tail -10
  ;;
esac
exit 0
