#!/bin/zsh
# dock.sh — the widget's terminal tabs.
#
# Each "tab" is a real Terminal.app window running `claude`. They are all parked
# at the same rectangle (the widget's dock slot), so only the front one shows —
# which is what a tab strip looks like from the desktop.
#
# Claude Code rewrites the window title with the thread's topic, so we can't mark
# our windows that way. .threads maps slot number -> Terminal window id instead,
# and the live title becomes the tab's label.
#
#   dock.sh list               # slot|winid|label|zorder|visible, one per live thread
#   dock.sh new   X Y W H [openclaw]   # new claude thread (or an OpenClaw terminal), parked at that rect
#   dock.sh focus ID X Y W H   # raise + re-park one thread
#   dock.sh close ID
#   dock.sh snap  X Y W H      # re-park every thread
#   dock.sh hide
#
# The Claude desktop app is the other thing the pane can host. It ships no AppleScript
# dictionary, so unlike Terminal it has to be driven through System Events, which needs
# Übersicht in System Settings > Privacy & Security > Accessibility.
#
#   dock.sh panes <App|""> [X Y W H]  # show one pane app and hide the others, in ONE pass
#   dock.sh app-show <App> X Y W H
#   dock.sh app-hide <App>
#   dock.sh app-quit <App>           # fully quit, so its Dock icon goes away
#   dock.sh app-state <App>          # running|windows|visible
#   dock.sh claude-new [send|paste] [key]  # new thread in the Claude app, paste the clipboard, send it

CMD=${1:-list}
shift

HERE=${0:A:h}
STATE="$HERE/.threads"

# Never auto-launch Terminal just to answer a question — only `new` may start it.
# (pgrep is unreliable here: Terminal's comm is the full bundle path.)
running() {
  /bin/ps ax -o comm | /usr/bin/grep -q '/Terminal\.app/Contents/MacOS/Terminal$'
}

# id|zorder|visible|left,top|title — title last, since a thread's topic may contain a pipe.
# Exits non-zero when Terminal is running but did not answer; callers must not read that as
# "no windows".
live() {
  running || return 0
  /usr/bin/osascript 2>/dev/null <<'AS'
tell application "Terminal"
  set out to ""
  repeat with w in windows
    set ttl to ""
    try
      set ttl to custom title of tab 1 of w
    end try
    set pos to ""
    try
      set bd to bounds of w
      set pos to (item 1 of bd as text) & "," & (item 2 of bd as text)
    end try
    set out to out & (id of w as text) & "|" & (index of w as text) & "|" & (visible of w as text) & "|" & pos & "|" & ttl & linefeed
  end repeat
  return out
end tell
AS
}

# The registry is read and rewritten by every widget refresh and every click, often at the same
# moment. mkdir is atomic, so it is the lock; one held past ~5s belongs to a dead process.
lock() {
  local i=0
  until /bin/mkdir "$STATE.lock" 2>/dev/null; do
    i=$((i + 1))
    if [ $i -gt 50 ]; then /bin/rm -rf "$STATE.lock"; i=0; fi
    /bin/sleep 0.1
  done
}
unlock() { /bin/rmdir "$STATE.lock" 2>/dev/null; }

# Print live threads; drop dead ones and adopt orphans as a side effect.
#
# This is where tabs used to vanish. Terminal is slow to answer while a new window is opening,
# the probe came back empty, and an empty answer pruned every thread from the registry — leaving
# the windows parked in the slot with no tab. Now a failed probe changes nothing and reprints the
# last good list, and any Terminal window sitting at the slot's corner is taken back as a thread.
threads() {
  [ -f "$STATE" ] || : > "$STATE"
  local snapshot n id hit z vis pos label ax ay px py tmp
  if ! snapshot=$(live); then
    [ -f "$STATE.last" ] && cat "$STATE.last"
    return 0
  fi
  lock
  tmp=$(/usr/bin/mktemp "$STATE.XXXXXX")
  while IFS=$'\t' read -r n id; do
    [ -z "$id" ] && continue
    print -r -- "$snapshot" | grep -q "^$id|" && printf '%s\t%s\n' "$n" "$id" >> "$tmp"
  done < "$STATE"
  [ -f "$HERE/.dockrect" ] && read -r ax ay _ < "$HERE/.dockrect"
  if [ -n "$ax" ]; then
    print -r -- "$snapshot" | while IFS='|' read -r id z vis pos label; do
      [ -z "$id" ] || [ -z "$pos" ] && continue
      grep -q $'\t'"$id"'$' "$tmp" && continue
      px=${pos%,*}; py=${pos#*,}
      (( px - ax <= 4 && ax - px <= 4 && py - ay <= 4 && ay - py <= 4 )) || continue
      n=1; while cut -f1 "$tmp" | grep -qx "$n"; do n=$((n + 1)); done
      printf '%s\t%s\n' "$n" "$id" >> "$tmp"
    done
  fi
  /bin/mv "$tmp" "$STATE"
  unlock
  tmp=$(/usr/bin/mktemp "$STATE.XXXXXX")
  while IFS=$'\t' read -r n id; do
    hit=$(print -r -- "$snapshot" | grep "^$id|" | head -1)
    IFS='|' read -r _ z vis pos label <<< "$hit"
    printf '%s|%s|%s|%s|%s\n' "$n" "$id" "${label//|/}" "$z" "$vis"
  done < "$STATE" | sort -n > "$tmp"
  /bin/mv "$tmp" "$STATE.last"
  cat "$STATE.last"
}

next_slot() {
  local n=1
  while cut -f1 "$STATE" 2>/dev/null | grep -qx "$n"; do n=$((n+1)); done
  print -r -- "$n"
}

# Every other registered thread window, as an AppleScript list body: "12, 34".
others() {
  cut -f2 "$STATE" 2>/dev/null | grep -vx "$1" | grep . | paste -sd, - | sed 's/,/, /g'
}

remember_rect() { print -r -- "$1 $2 $3 $4" > "$HERE/.dockrect"; }

# Either of the panel apps (Claude, Cursor). None of them ship an AppleScript
# dictionary, so window placement goes through System Events — which needs Übersicht in
# System Settings > Privacy & Security > Accessibility.
app_running() {
  /bin/ps ax -o comm | /usr/bin/grep -q "/$1\.app/Contents/MacOS/"
}

case "$CMD" in

list)
  threads
  ;;

new)
  X=$1; Y=$2; W=$3; H=$4; KIND=${5:-desktop}
  R=$((X + W)); B=$((Y + H))
  # A desktop thread is `claude` in ~/AI Tools. An OpenClaw thread runs the command in
  # openclaw-cmd beside this script (first line that is not a comment), titled so its tab says so.
  RUN='cd \"$HOME/AI Tools\" && claude'; TITLE=""
  if [ "$KIND" = "openclaw" ]; then
    OC=$(/usr/bin/grep -v '^[[:space:]]*#' "$HERE/openclaw-cmd" 2>/dev/null | /usr/bin/grep -m1 .)
    [ -n "$OC" ] || OC='echo "Put your OpenClaw command in ~/AI Tools/desk-widget/openclaw-cmd"'
    RUN=${OC//\\/\\\\}; RUN=${RUN//\"/\\\"}; TITLE="OpenClaw"
  fi
  remember_rect $X $Y $W $H
  threads >/dev/null
  # A cold Terminal opens a default shell window of its own on launch. Reuse it for the thread
  # rather than leaving it behind as an untracked window — that was the other source of overlap.
  FRESH=false; running || FRESH=true
  OTHERS=$(others "")
  ID=$(/usr/bin/osascript 2>/dev/null <<AS
tell application "Terminal"
  activate
  if $FRESH then
    repeat 30 times
      if (count of windows) > 0 then exit repeat
      delay 0.1
    end repeat
  end if
  if $FRESH and (count of windows) > 0 then
    set t to do script "$RUN" in window 1
  else
    set t to do script "$RUN"
  end if
  if "$TITLE" is not "" then set custom title of t to "$TITLE"
  delay 0.4
  set w to first window whose tabs contains t
  set bounds of w to {$X, $Y, $R, $B}
  try
    set frontmost of w to true
  end try
  repeat with oid in {$OTHERS}
    try
      set visible of window id oid to false
    end try
  end repeat
  return id of w as text
end tell
AS
)
  if [ -n "$ID" ]; then
    lock; printf '%s\t%s\n' "$(next_slot)" "$ID" >> "$STATE"; unlock
  fi
  threads
  ;;

focus)
  # One thread on screen at a time. The rest are hidden rather than stacked underneath, so a
  # thread can never sit half-visible behind another in the slot.
  running || exit 0
  ID=$1; X=$2; Y=$3; W=$4; H=$5
  R=$((X + W)); B=$((Y + H))
  remember_rect $X $Y $W $H
  OTHERS=$(others "$ID")
  /usr/bin/osascript 2>/dev/null <<AS
tell application "Terminal"
  activate
  set w to window id $ID
  try
    set visible of w to true
  end try
  try
    set miniaturized of w to false
  end try
  set bounds of w to {$X, $Y, $R, $B}
  try
    set frontmost of w to true
  end try
  repeat with oid in {$OTHERS}
    try
      set visible of window id oid to false
    end try
  end repeat
end tell
AS
  threads
  ;;

close)
  running || exit 0
  /usr/bin/osascript -e "tell application \"Terminal\" to close (every window whose id is $1)" >/dev/null 2>&1
  threads
  ;;

snap)
  remember_rect $1 $2 $3 $4
  running || exit 0
  X=$1; Y=$2; W=$3; H=$4
  R=$((X + W)); B=$((Y + H))
  threads | cut -d'|' -f2 | while read -r id; do
    [ -n "$id" ] && /usr/bin/osascript -e "tell application \"Terminal\" to set bounds of window id $id to {$X, $Y, $R, $B}" >/dev/null 2>&1
  done
  ;;

hide)
  running || exit 0
  threads | cut -d'|' -f2 | while read -r id; do
    [ -n "$id" ] && /usr/bin/osascript -e "tell application \"Terminal\" to set visible of window id $id to false" >/dev/null 2>&1
  done
  ;;

claude-new)
  # The task row's "work it" button. The widget has already put the task on the clipboard and
  # switched to the claude view (which starts the app if needed). This waits for a window, opens a
  # new thread with the app's own shortcut, pastes, and sends. The app has no AppleScript
  # dictionary, so it is keystrokes through System Events, like the pane placement above.
  MODE=${1:-send}; KEY=${2:-n}
  SEND=false; [ "$MODE" = "send" ] && SEND=true
  /usr/bin/osascript 2>/dev/null <<AS
tell application "System Events"
  repeat 48 times
    if exists process "Claude" then
      if (count of windows of process "Claude") > 0 then exit repeat
    end if
    delay 0.25
  end repeat
  if not (exists process "Claude") then return "Claude is not running"
  tell process "Claude"
    set frontmost to true
    delay 0.35
    keystroke "$KEY" using command down
    delay 1.2
    keystroke "v" using command down
    delay 0.5
    if $SEND then key code 36
  end tell
end tell
return "ok"
AS
  ;;

panes)
  # A view switch used to be four shells, four `ps` calls and four osascripts. It is one
  # osascript now: every pane app is hidden and the chosen one placed in a single Apple event
  # pass, with `exists process` doing the running-check for free.
  # AppleScript compiles the whole script before running any of it, so empty coordinates would
  # leave `{, }` in the placement line and kill the entire script — including the hide loop that
  # runs first. Default them.
  APP=$1; X=${2:-0}; Y=${3:-0}; W=${4:-0}; H=${5:-0}
  # Record which pane is meant to own the slot. The slow launch path below runs in the
  # background and can finish after a later switch, so it re-checks this before showing
  # anything — otherwise a quick claude -> desk would leave the app on screen.
  printf '%s' "$APP" > "$HERE/.pane"
  # Only name apps that are actually running. Touching a missing process through System Events
  # blocks for ~3 seconds each — with three apps closed that turned a switch into a 10s hang —
  # and `exists process` is just as slow, so the check has to happen out here where ps is cheap.
  LIVE=""
  for n in "Claude" "Cursor"; do
    if [ "$n" != "$APP" ] && app_running "$n"; then
      LIVE="$LIVE, \"$n\""
    fi
  done
  LIVE=${LIVE#, }
  RES=$(/usr/bin/osascript 2>/dev/null <<AS
set target to "$APP"
tell application "System Events"
  repeat with n in {$LIVE}
    try
      set visible of process (n as text) to false
    end try
  end repeat
  if target is "" then return "ok"
  if not (exists process target) then return "launch"
  tell process target
    set visible to true
    try
      set value of attribute "AXMinimized" of window 1 to false
    end try
    set frontmost to true
    if (count of windows) is 0 then return "launch"
    set position of window 1 to {$X, $Y}
    set size of window 1 to {$W, $H}
  end tell
end tell
return "ok"
AS
)
  # Slow path only when the app has to be started or given a window.
  if [ "$RES" = "launch" ] && [ -n "$APP" ]; then
    (
      "$0" app-show "$APP" "$X" "$Y" "$W" "$H" >/dev/null 2>&1
      # still the wanted pane? if not, undo it
      if [ "$(cat "$HERE/.pane" 2>/dev/null)" != "$APP" ]; then
        "$0" app-hide "$APP" >/dev/null 2>&1
      fi
    ) &
  fi
  # An app pane owns the slot, so park the terminal threads away — backgrounded, since the
  # switch should not wait on it.
  if [ -n "$APP" ]; then
    "$0" hide >/dev/null 2>&1 &
  fi
  ;;

app-state)
  APP=$1
  if app_running "$APP"; then
    /usr/bin/osascript 2>/dev/null <<AS
tell application "System Events"
  tell process "$APP"
    return "running|" & (count of windows) & "|" & (visible as text)
  end tell
end tell
AS
  else
    echo "stopped|0|false"
  fi
  ;;

app-show)
  APP=$1; X=$2; Y=$3; W=$4; H=$5
  if ! app_running "$APP"; then
    /usr/bin/open -a "$APP"
    /bin/sleep 2
  fi
  /usr/bin/open -a "$APP"          # activates, and un-minimises from the Dock
  # a closed app can be running with no window; give it a moment to make one
  for i in 1 2 3 4 5 6; do
    N=$(/usr/bin/osascript -e "tell application \"System Events\" to tell process \"$APP\" to return count of windows" 2>/dev/null)
    [ "$N" != "0" ] && [ -n "$N" ] && break
    /bin/sleep 0.5
  done
  /usr/bin/osascript 2>&1 <<AS
tell application "System Events"
  tell process "$APP"
    set visible to true
    try
      set value of attribute "AXMinimized" of window 1 to false
    end try
    set frontmost to true
    set position of window 1 to {$X, $Y}
    set size of window 1 to {$W, $H}
  end tell
end tell
AS
  ;;

app-quit)
  # Hiding leaves the Dock icon behind; only quitting removes it. Apps are asked to quit
  # normally, so anything with unsaved work still gets to put up its own dialog.
  APP=$1
  app_running "$APP" || exit 0
  /usr/bin/osascript -e "tell application \"$APP\" to quit" >/dev/null 2>&1 &
  ;;

app-hide)
  APP=$1
  app_running "$APP" || exit 0
  /usr/bin/osascript -e "tell application \"System Events\" to set visible of process \"$APP\" to false" >/dev/null 2>&1
  ;;

esac
