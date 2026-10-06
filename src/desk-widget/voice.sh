#!/bin/zsh
# voice.sh — the waveform pill: click, talk, and the words become a Say it command.
#
#   voice.sh start    # build the listener if needed, start listening -> "ok" or "failed: why"
#   voice.sh poll     # "listening <TAB> words so far" | "done <TAB> final words" | "error <TAB> why" | "starting"
#   voice.sh stop     # stop listening now (the words so far are kept)
#   voice.sh build    # (re)build "MSBAI Listen.app" from listen.swift
#
# Übersicht cannot use the microphone itself, so listening happens in a tiny app built here from
# listen.swift, with its own microphone and speech recognition permissions (macOS asks once).
# Recognition is Apple's own, on device where the Mac supports it; no audio leaves the Mac then.

SELF=${0:A}                        # $0 inside a zsh function is the function name, so keep the path
HERE=${0:A:h}
V="$HERE/.voice"
APP="$HERE/MSBAI Listen.app"
BIN="$APP/Contents/MacOS/listen"
SRC="$HERE/listen.swift"

export PATH="/usr/bin:/bin:/usr/sbin:/sbin"
mkdir -p "$V"

build() {
  mkdir -p "$APP/Contents/MacOS"
  cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>com.msbai.listen</string>
  <key>CFBundleName</key><string>MSBAI Listen</string>
  <key>CFBundleExecutable</key><string>listen</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSUIElement</key><true/>
  <key>NSMicrophoneUsageDescription</key><string>Your desk widget listens when you click the waveform pill, to turn what you say into a command.</string>
  <key>NSSpeechRecognitionUsageDescription</key><string>Your desk widget turns what you say into text for the Say it box.</string>
</dict></plist>
PLIST
  /usr/bin/swiftc -O "$SRC" -o "$BIN" 2> "$V/build.log" || return 1
  /usr/bin/codesign --force --deep -s - "$APP" >> "$V/build.log" 2>&1
  return 0
}

case "${1:-}" in

build)
  build && print -r -- "ok" || print -r -- "failed: $(tail -3 "$V/build.log" | tr '\n' ' ' | cut -c1-200)"
  ;;

start)
  if [ ! -x "$BIN" ] || [ "$SRC" -nt "$BIN" ]; then
    build || { print -r -- "failed: could not build the listener: $(tail -2 "$V/build.log" | tr '\n' ' ' | cut -c1-160)"; exit 0; }
  fi
  /usr/bin/pkill -f "MSBAI Listen.app/Contents/MacOS/listen" 2>/dev/null
  rm -f "$V/partial" "$V/final" "$V/error" "$V/stop" "$V/listening"
  /usr/bin/open -n -g "$APP" --args "$V" || { print -r -- "failed: the listener did not open"; exit 0; }
  print -r -- "ok"
  ;;

poll)
  if [ -f "$V/error" ] && [ ! -s "$V/final" ]; then
    print -r -- "error"$'\t'"$(head -c 300 "$V/error")"
  elif [ -f "$V/final" ]; then
    print -r -- "done"$'\t'"$(tr '\n' ' ' < "$V/final")"
  elif [ -f "$V/listening" ]; then
    print -r -- "listening"$'\t'"$(tr '\n' ' ' < "$V/partial" 2>/dev/null)"
  else
    print -r -- "starting"
  fi
  ;;

stop)
  : > "$V/stop"
  print -r -- "ok"
  ;;

*)
  print -r -- "usage: voice.sh start | poll | stop | build" >&2
  ;;
esac
exit 0
