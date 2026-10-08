#!/bin/zsh
# cal.sh — the calendar feed, read the way Apple's own Calendar widget reads it.
#
# icalBuddy (the original source, still the fallback below) can only give text: title, time,
# location, notes, url. Everything that makes Apple's widget feel like Apple's widget —
# per-calendar colour, "Needs Reply", a cancelled meeting, a birthday — lives on EKEvent and
# never reaches icalBuddy's output. So the primary path talks to EventKit directly through
# JavaScript for Automation, and icalBuddy stays as the fallback for the case where
# EventKit access is refused.
#
#   cal.sh events [HOURS]     # one tab-separated record per event
#
# Record: E <TAB> startISO endISO allday status mine attendees caltype calendar r,g,b
#                 title location url notes uid
#
#   status   EKEventStatus        0 none  1 confirmed  2 tentative  3 canceled
#   mine     EKParticipantStatus  0 unknown 1 pending 2 accepted 3 declined 4 tentative
#   caltype  EKCalendarType       0 local 1 calDAV 2 exchange 3 subscription 4 birthday
#
# Tabs, not pipes: a real meeting here is titled "xTech|Disrupt Fires", which silently ate a
# field the first time round.

HOURS=${2:-12}

emit_eventkit() {
  # The heredoc is QUOTED. Unquoted, the shell eats every backslash before osascript sees the
  # script: `replace(/\\/g, ...)` arrives as `replace(/\/g, ...)`, an unterminated regex, and
  # the whole feed dies silently and falls back to icalBuddy. HOURS is substituted afterwards
  # instead, which is also why no `$` in here needs escaping.
  local js
  js=$(cat <<'JS'
ObjC.import('EventKit');
ObjC.import('AppKit');

// An absent ObjC string is nil, and String(nil) is the literal "[id nil]" — which is exactly
// how "[id nil]" ended up printed in the card for an event that simply had no notes.
function s(v) {
  try {
    if (v === undefined || v === null) return '';
    if (typeof v.isNil === 'function' && v.isNil()) return '';
    var out = v.js === undefined ? String(v) : v.js;
    return (out === '[id nil]' || out === 'undefined' || out === 'null') ? '' : out;
  } catch (e) { return ''; }
}
// One record is one line, so newlines are escaped rather than destroyed. The first pass
// replaced them with " \u00b7 ", which smeared every invite into a single unreadable line —
// the widget needs the real line structure to strip the boilerplate back out.
function field(v) {
  return s(v).replace(/\\/g, '\\\\').replace(/\r\n?/g, '\n')
             .replace(/\n/g, '\\n').replace(/\t/g, ' ').trim();
}
function iso(d) {
  // Local wall-clock, no timezone suffix — the widget parses it with new Date(...) and must
  // not have it re-interpreted as UTC.
  var f = $.NSDateFormatter.alloc.init;
  f.dateFormat = 'yyyy-MM-dd HH:mm';
  return s(f.stringFromDate(d));
}

var store = $.EKEventStore.alloc.init;
var end = $.NSDate.dateWithTimeIntervalSinceNow(__HOURS__ * 3600);
// Reach back a day so an all-day event and a meeting already in progress both survive the
// window's left edge; the widget clips to its own window anyway.
var from = $.NSDate.dateWithTimeIntervalSinceNow(-86400);
var pred = store.predicateForEventsWithStartDateEndDateCalendars(from, end, $());
var evs = store.eventsMatchingPredicate(pred);
if (evs.isNil()) { throw new Error('denied'); }

var out = [];
for (var i = 0; i < evs.count; i++) {
  var e = evs.objectAtIndex(i);
  var c = e.calendar;
  var col = $.NSColor.colorWithCGColor(c.CGColor).colorUsingColorSpace($.NSColorSpace.sRGBColorSpace);
  var rgb = Math.round(col.redComponent * 255) + ',' +
            Math.round(col.greenComponent * 255) + ',' +
            Math.round(col.blueComponent * 255);

  var mine = 0, natt = 0, people = [];
  try {
    var at = e.attendees;
    if (!at.isNil()) {
      natt = at.count;
      for (var k = 0; k < at.count; k++) {
        var a = at.objectAtIndex(k);
        if (a.isCurrentUser) mine = a.participantStatus;
        // who is invited, for the event card: name | status | email | 1 when it is you
        var em = ''; try { em = s(a.URL.resourceSpecifier); } catch (err2) {}
        people.push([s(a.name).replace(/[|;]/g, ' '), a.participantStatus, em.replace(/[|;]/g, ''), a.isCurrentUser ? '1' : ''].join('|'));
      }
    }
  } catch (err) {}
  var org = '';
  try { if (!e.organizer.isNil()) org = s(e.organizer.name); } catch (err) {}

  var url = '';
  try { if (!e.URL.isNil()) url = s(e.URL.absoluteString); } catch (err) {}

  out.push([
    'E', iso(e.startDate), iso(e.endDate), e.allDay ? '1' : '0',
    e.status, mine, natt, c.type, field(c.title), rgb,
    field(e.title), field(e.location), field(url), field(e.notes),
    // the iCalendar UID — what gcal.py looks the event up by on Google's side
    field(e.calendarItemExternalIdentifier),
    field(people.join(';;')), field(org)
  ].join('\t'));
}
out.join('\n');
JS
)
  print -r -- "${js//__HOURS__/$HOURS}" | /usr/bin/osascript -l JavaScript 2>/dev/null
}

# Fallback: the original icalBuddy feed, padded out to the same record shape with neutral
# values, so the widget only ever has one format to parse.
emit_icalbuddy() {
  local FROM TO ICB
  FROM=$(date '+%Y-%m-%d %H:00')
  TO=$(date -v+${HOURS}H '+%Y-%m-%d %H:59')
  ICB=/opt/homebrew/bin/icalBuddy
  [ -x "$ICB" ] || ICB=/usr/local/bin/icalBuddy
  [ -x "$ICB" ] || { print -r -- "!! icalBuddy not found — brew install ical-buddy"; return; }

  "$ICB" -nc -nrd -b "" -ps "@|~|@" -nnr " · " -po "datetime,title,location,notes,url" \
    -df "%Y-%m-%d" -tf "%H:%M" -iep "datetime,title,location,notes,url" \
    eventsFrom:"$FROM" to:"$TO" 2>/dev/null \
  | /usr/bin/python3 -c '
import sys, re
for raw in sys.stdin:
    line = raw.strip()
    if not line:
        continue
    parts = [p.strip() for p in line.split("|~|")]
    when, title = (parts + ["", ""])[:2]
    loc = notes = url = ""
    for p in parts[2:]:
        m = re.match(r"^(location|notes|url):\s*([\s\S]*)$", p, re.I)
        if not m:
            continue
        k, v = m.group(1).lower(), m.group(2).strip()
        if k == "location": loc = v
        elif k == "notes":  notes = v
        else:               url = v
    if not title:
        continue
    m = re.match(r"^(\d{4}-\d{2}-\d{2}) at (\d{2}:\d{2}) - (?:(\d{4}-\d{2}-\d{2}) at )?(\d{2}:\d{2})$", when)
    if m:
        start = m.group(1) + " " + m.group(2)
        end = (m.group(3) or m.group(1)) + " " + m.group(4)
        allday = "0"
    else:
        start = end = (when or "")
        allday = "1"
    # status/mine/attendees/caltype unknown here; colour is the widget default.
    print("\t".join(["E", start, end, allday, "0", "0", "0", "1", "", "", title, loc, url, notes, ""]))
'
}

case "${1:-events}" in
events)
  OUT=$(emit_eventkit)
  if [ -z "$OUT" ]; then
    emit_icalbuddy
  else
    print -r -- "$OUT"
  fi
  ;;
esac
