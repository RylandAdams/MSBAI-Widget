#!/bin/zsh
# notes.sh — named markdown notes for the widget's bottom panel.
#
# Every note is a plain .md file in "AI Tools/notes", so anything else can read and edit them too.
# The active note's name lives in .note, which is what lets the widget's shell command know which
# file to read back.
#
#   notes.sh list            -> one name per line, active one first
#   notes.sh read            -> contents of the active note
#   notes.sh write <b64> [n] -> overwrite note n (default: the active note)
#   notes.sh use <name>      -> switch
#   notes.sh new <name>      -> create (if absent) and switch
#   notes.sh rename <name>   -> rename the active note
#   notes.sh delete          -> remove the active note, fall back to the first remaining
#   notes.sh order <a> <b>   -> store the tab order (drag-and-drop writes this)

HERE=${0:A:h}
DIR="$HOME/AI Tools/notes"
STATE="$HERE/.note"
ORDER="$HERE/.order"
CMD=${1:-list}
shift

/bin/mkdir -p "$DIR"
# One-time move of the original scratch file into the folder, so nothing is lost.
if [ -f "$HOME/AI Tools/notes.md" ] && [ ! -f "$DIR/notes.md" ]; then
  /bin/mv "$HOME/AI Tools/notes.md" "$DIR/notes.md"
fi
[ -f "$DIR/notes.md" ] || : > "$DIR/notes.md"

# Names are file names: keep them boring so nothing can escape the folder.
clean() { print -r -- "$1" | /usr/bin/tr -cd 'A-Za-z0-9 ._-' | /usr/bin/sed 's/^[ .]*//; s/[ ]*$//' }

active() {
  local a
  [ -s "$STATE" ] && a=$(cat "$STATE")
  [ -n "$a" ] && [ -f "$DIR/$a.md" ] || a=""
  if [ -z "$a" ]; then
    a=$(cd "$DIR" && /bin/ls -t *.md 2>/dev/null | head -1)
    a=${a%.md}
  fi
  [ -n "$a" ] || a="notes"
  print -r -- "$a"
}

case "$CMD" in

list)
  # Stored order first, then anything not in it, alphabetically. The active note is flagged with
  # a leading * rather than hoisted, so clicking a tab never shuffles the row.
  A=$(active)
  typeset -a names
  names=()
  if [ -s "$ORDER" ]; then
    while IFS= read -r n; do
      [ -n "$n" ] && [ -f "$DIR/$n.md" ] && names+=("$n")
    done < "$ORDER"
  fi
  for f in $(cd "$DIR" && /bin/ls *.md 2>/dev/null | LC_ALL=C sort); do
    n=${f%.md}
    [[ ${names[(Ie)$n]} -eq 0 ]] && names+=("$n")
  done
  for n in $names; do
    if [ "$n" = "$A" ]; then print -r -- "*$n"; else print -r -- "$n"; fi
  done
  ;;

order)
  : > "$ORDER"
  for n in "$@"; do
    N=$(clean "$n")
    [ -n "$N" ] && print -r -- "$N" >> "$ORDER"
  done
  ;;

read)
  A=$(active)
  [ -f "$DIR/$A.md" ] && /bin/cat "$DIR/$A.md"
  ;;

write)
  # The widget names the note it means; without a name, fall back to the active one.
  A=$(clean "$2"); [ -n "$A" ] && [ -f "$DIR/$A.md" ] || A=$(active)
  # Before a note is blanked, keep what it held in notes/.trash, so a stray clear can be undone.
  NEW=$(printf '%s' "$1" | /usr/bin/base64 -d; printf x); NEW=${NEW%x}
  if [ -z "$NEW" ] && [ -s "$DIR/$A.md" ]; then
    /bin/mkdir -p "$DIR/.trash"
    /bin/cp "$DIR/$A.md" "$DIR/.trash/$A-$(/bin/date +%Y%m%d-%H%M%S).md"
  fi
  printf '%s' "$NEW" > "$DIR/$A.md"
  ;;

use)
  N=$(clean "$1")
  [ -n "$N" ] && [ -f "$DIR/$N.md" ] && printf '%s' "$N" > "$STATE"
  ;;

new)
  N=$(clean "$1")
  [ -z "$N" ] && exit 0
  if [ ! -f "$DIR/$N.md" ]; then
    : > "$DIR/$N.md"
    print -r -- "$N" >> "$ORDER"        # new notes land at the end, not mid-row
  fi
  printf '%s' "$N" > "$STATE"
  ;;

rename)
  A=$(active); N=$(clean "$1")
  if [ -n "$N" ] && [ "$N" != "$A" ] && [ -f "$DIR/$A.md" ] && [ ! -f "$DIR/$N.md" ]; then
    /bin/mv "$DIR/$A.md" "$DIR/$N.md"
    [ -s "$ORDER" ] && /usr/bin/sed -i '' "s/^$A\$/$N/" "$ORDER"
    printf '%s' "$N" > "$STATE"
  fi
  ;;

delete)
  A=$(active)
  [ -f "$DIR/$A.md" ] && /bin/rm -f "$DIR/$A.md"
  : > "$STATE"
  (cd "$DIR" && /bin/ls *.md >/dev/null 2>&1) || : > "$DIR/notes.md"
  ;;

esac
