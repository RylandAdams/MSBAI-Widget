# cu_limit.zsh: one shared view of ClickUp's daily call limit for every desk job. Sourced after HERE is set.
#
# ClickUp allows about 1,000 connector calls a day for the whole account (these jobs, OpenClaw on
# {{OWNER_FIRST}}'s login, any Claude chat). When a job's reply says the limit is spent, cu_note writes the
# time it resets into .clickup-blocked. Until then, jobs that only exist to read or write ClickUp
# skip their run (and keep their last good data), and jobs that use ClickUp alongside Slack, Gmail
# and Fireflies run without the ClickUp tools, so they stop spending the limit on refused calls.
CU_BLOCK="$HERE/.clickup-blocked"
cu_blocked() {
  [ -s "$CU_BLOCK" ] && (( $(date +%s) < $(head -1 "$CU_BLOCK" 2>/dev/null || print 0) ))
}
cu_until() { date -r "$(head -1 "$CU_BLOCK" 2>/dev/null || print 0)" '+%H:%M' 2>/dev/null; }
cu_note() {   # $1 = a job's reply
  print -r -- "$1" | /usr/bin/grep -qiE 'clickup[^.]{0,80}(daily|rate) limit|1,000/1,000|limit[^.]{0,40}clickup' || return 0
  local secs=$(print -r -- "$1" | /usr/bin/python3 -c '
import re, sys
s = sys.stdin.read()
m = re.search(r"(\d+)\s*h(?:ours?)?\s*(\d+)\s*m", s) or re.search(r"(\d+)\s*h(?:ours?)?\b", s)
print(int(m.group(1)) * 3600 + (int(m.group(2)) * 60 if m.lastindex and m.lastindex > 1 else 0) + 300 if m else 4 * 3600)' 2>/dev/null)
  print -r -- $(( $(date +%s) + ${secs:-14400} )) > "$CU_BLOCK"
  print -r -- "$(date '+%F %T')  ClickUp daily limit reached; ClickUp jobs wait until $(cu_until)" >> "$HERE/.clickup-limit.log"
}
