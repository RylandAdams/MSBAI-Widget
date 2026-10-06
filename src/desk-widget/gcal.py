#!/usr/bin/env python3
# gcal.py — the calendar, written to. cal.sh reads; this answers invitations and creates events.
#
# Two paths, chosen by what is set up:
#
#   Google Calendar API (full)   accept / decline / maybe, create with attendees and a Google Meet
#                                link, quick-add from a sentence. Needs a one-time login:
#                                put an OAuth "Desktop app" client JSON at .gcal-client.json and
#                                run `gcal.sh auth`. Standard library only — no pip.
#   EventKit (fallback)          create an event on the account's calendar through Calendar.app's
#                                sync. No attendees (EventKit's attendee list is read-only), and
#                                invitations cannot be answered this way at all — Apple ships no
#                                API for it. Used only when the Google login is absent.
#
#   gcal.py status                         ok | noauth | noclient
#   gcal.py auth                           browser login; stores .gcal-token.json (chmod 600)
#   gcal.py respond UID accepted|declined|tentative
#   gcal.py create B64JSON [--dry]         {title,date,start,minutes,allday,attendees,meet,location,notes}
#   gcal.py quick "text" | quick --b64 B64   Google's quickAdd: "Lunch with Kriss tomorrow 12pm"
#   gcal.py link UID [DAY] | open UID [DAY] the event on calendar.google.com (DAY = fallback page)
#   gcal.py calapp EPOCH                   Calendar.app, day view, at that moment — reply there
#
# UID is EventKit's calendarItemExternalIdentifier — the iCalendar UID — which cal.sh now emits
# and Google's API can look up directly (events.list?iCalUID=). Events Google itself created have
# UID "<id>@google.com", which is how the no-auth `link` still works for those.
#
# GCAL_ACCOUNT (env) is the Google account's email; the widget passes its CFG.account.

import sys, os, json, time, base64, secrets, uuid, subprocess, datetime, socket
import urllib.request, urllib.parse, urllib.error
import http.server

HERE = os.path.dirname(os.path.abspath(__file__))
CLIENT = os.path.join(HERE, ".gcal-client.json")
TOKEN = os.path.join(HERE, ".gcal-token.json")
SCOPE = "https://www.googleapis.com/auth/calendar"
API = "https://www.googleapis.com/calendar/v3"
ACCOUNT = os.environ.get("GCAL_ACCOUNT", "").strip()


def die(msg, code=1):
    print(msg)
    sys.exit(code)


def tzname():
    try:
        p = os.readlink("/etc/localtime")
        return p.split("zoneinfo/", 1)[1]
    except Exception:
        return "UTC"


def load_json(p):
    try:
        with open(p) as f:
            return json.load(f)
    except Exception:
        return None


def load_client():
    d = load_json(CLIENT) or {}
    return d.get("installed") or d.get("web")


def save_token(t):
    with open(TOKEN, "w") as f:
        json.dump(t, f)
    os.chmod(TOKEN, 0o600)


# ── auth ──────────────────────────────────────────────────────────────────────────────────────
def token_post(fields):
    data = urllib.parse.urlencode(fields).encode()
    req = urllib.request.Request("https://oauth2.googleapis.com/token", data=data, method="POST")
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode())


def auth():
    c = load_client() or die("noclient — save the OAuth Desktop client JSON as desk-widget/.gcal-client.json")
    # a free loopback port; Google allows any port on http://127.0.0.1 for Desktop clients
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
    redirect = f"http://127.0.0.1:{port}"
    state = secrets.token_urlsafe(16)
    q = urllib.parse.urlencode({
        "client_id": c["client_id"], "redirect_uri": redirect, "response_type": "code",
        "scope": SCOPE, "access_type": "offline", "prompt": "consent", "state": state,
        **({"login_hint": ACCOUNT} if ACCOUNT else {}),
    })
    url = "https://accounts.google.com/o/oauth2/v2/auth?" + q
    got = {}

    class H(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            if qs.get("state", [""])[0] == state and "code" in qs:
                got["code"] = qs["code"][0]
                msg = "Signed in. You can close this tab and go back to the desk."
            else:
                msg = "That didn't work: " + ", ".join(qs.get("error", ["no code"]))
            self.send_response(200); self.send_header("Content-Type", "text/html"); self.end_headers()
            self.wfile.write(f"<body style='font:16px -apple-system;padding:40px'>{msg}</body>".encode())
        def log_message(self, *a): pass

    srv = http.server.HTTPServer(("127.0.0.1", port), H)
    subprocess.run(["open", url], check=False)
    print("Waiting for the browser…", file=sys.stderr)
    srv.timeout = 300
    while "code" not in got:
        srv.handle_request()
    t = token_post({"code": got["code"], "client_id": c["client_id"], "client_secret": c.get("client_secret", ""),
                    "redirect_uri": redirect, "grant_type": "authorization_code"})
    if "refresh_token" not in t:
        die("Google returned no refresh token — revoke the app at myaccount.google.com/permissions and run auth again")
    t["expires_at"] = time.time() + int(t.get("expires_in", 3600))
    save_token(t)
    me = call("GET", "/calendars/primary")
    t["account"] = me.get("id", ""); save_token(t)
    print("ok", t["account"])


def access_token():
    t = load_json(TOKEN) or die("noauth")
    if t.get("expires_at", 0) - 60 < time.time():
        c = load_client() or die("noclient")
        n = token_post({"refresh_token": t["refresh_token"], "client_id": c["client_id"],
                        "client_secret": c.get("client_secret", ""), "grant_type": "refresh_token"})
        t["access_token"] = n["access_token"]; t["expires_at"] = time.time() + int(n.get("expires_in", 3600))
        save_token(t)
    return t["access_token"]


def call(method, path, params=None, body=None):
    url = API + path + ("?" + urllib.parse.urlencode(params) if params else "")
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", "Bearer " + access_token())
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            raw = r.read().decode()
            return json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")
        try:
            detail = json.loads(detail)["error"]["message"]
        except Exception:
            pass
        die(f"api {e.code}: {detail[:200]}")


def status():
    if not load_client():
        print("noclient")
    elif not load_json(TOKEN):
        print("noauth")
    else:
        print("ok")


# ── events ────────────────────────────────────────────────────────────────────────────────────
def find_by_uid(uid):
    r = call("GET", "/calendars/primary/events", {"iCalUID": uid, "maxResults": 10})
    items = [i for i in r.get("items", []) if i.get("status") != "cancelled"]
    if items:
        return items[0]
    if uid.endswith("@google.com"):
        try:
            return call("GET", f"/calendars/primary/events/{uid[:-len('@google.com')]}")
        except SystemExit:
            return None
    return None


def respond(uid, answer):
    if answer not in ("accepted", "declined", "tentative"):
        die("answer must be accepted, declined or tentative")
    ev = find_by_uid(uid) or die("notfound — this event is not on the Google calendar")
    atts = ev.get("attendees") or die("noattendees — nothing to answer on this event")
    me = [a for a in atts if a.get("self")]
    if not me:
        die("notinvited — you are not on this event's attendee list")
    for a in me:
        a["responseStatus"] = answer
    call("PATCH", f"/calendars/primary/events/{ev['id']}", {"sendUpdates": "all"}, {"attendees": atts})
    print("ok", answer)


def derived_link(uid):
    if uid.endswith("@google.com") and ACCOUNT:
        eid = base64.urlsafe_b64encode(f"{uid[:-len('@google.com')]} {ACCOUNT}".encode()).decode().rstrip("=")
        return f"https://calendar.google.com/calendar/event?eid={eid}"
    return ""


def link(uid, day=""):
    if load_json(TOKEN):
        ev = find_by_uid(uid)
        if ev and ev.get("htmlLink"):
            return ev["htmlLink"]
    d = derived_link(uid)
    if d:
        return d
    # not a Google-born event (a Zoom or Outlook invite): the day it is on is the next best page
    if day:
        y, m, dd = day.split("-")
        return f"https://calendar.google.com/calendar/u/0/r/day/{int(y)}/{int(m)}/{int(dd)}"
    return ""


def calapp(epoch):
    # Calendar.app at that day, in day view. Its event popover has Accept / Maybe / Decline — the
    # reply path that needs no Google login, because Apple ships no API for replying.
    js = ("var c = Application('Calendar'); c.activate(); "
          "try { c.switchView({to: 'day view'}); } catch (e) {} "
          "c.viewCalendar({at: new Date(%d)}); 'ok'") % (int(float(epoch)) * 1000)
    r = subprocess.run(["/usr/bin/osascript", "-l", "JavaScript", "-e", js], capture_output=True, text=True)
    print((r.stdout or "").strip() or "fail " + (r.stderr or "").strip()[:200])


def quick(text):
    ev = call("POST", "/calendars/primary/events/quickAdd", {"text": text, "sendUpdates": "all"})
    print("ok", ev.get("htmlLink", ""))


def parse_spec(b64):
    spec = json.loads(base64.b64decode(b64).decode())
    title = (spec.get("title") or "").strip() or die("a title is required")
    date = spec.get("date") or datetime.date.today().isoformat()
    y, m, d = [int(x) for x in date.split("-")]
    if spec.get("allday"):
        start = datetime.datetime(y, m, d); end = start + datetime.timedelta(days=1)
    else:
        hh, mm = [int(x) for x in (spec.get("start") or "09:00").split(":")]
        start = datetime.datetime(y, m, d, hh, mm)
        end = start + datetime.timedelta(minutes=int(spec.get("minutes") or 30))
    att = [a.strip() for a in (spec.get("attendees") or "").replace(";", ",").split(",") if a.strip()]
    return {"title": title, "start": start, "end": end, "allday": bool(spec.get("allday")),
            "attendees": att, "meet": bool(spec.get("meet")),
            "location": (spec.get("location") or "").strip(), "notes": (spec.get("notes") or "").strip()}


def create(b64, dry=False):
    sp = parse_spec(b64)
    tz = tzname()
    if sp["allday"]:
        when = {"start": {"date": sp["start"].date().isoformat()}, "end": {"date": sp["end"].date().isoformat()}}
    else:
        when = {"start": {"dateTime": sp["start"].isoformat(), "timeZone": tz},
                "end": {"dateTime": sp["end"].isoformat(), "timeZone": tz}}
    body = {"summary": sp["title"], **when}
    if sp["location"]: body["location"] = sp["location"]
    if sp["notes"]: body["description"] = sp["notes"]
    if sp["attendees"]: body["attendees"] = [{"email": a} for a in sp["attendees"]]
    if sp["meet"]:
        body["conferenceData"] = {"createRequest": {"requestId": str(uuid.uuid4()),
                                                    "conferenceSolutionKey": {"type": "hangoutsMeet"}}}
    if dry:
        print(json.dumps({"path": "google" if load_json(TOKEN) else "eventkit", "body": body}, indent=1, default=str))
        return
    if load_json(TOKEN):
        ev = call("POST", "/calendars/primary/events", {"conferenceDataVersion": 1, "sendUpdates": "all"}, body)
        print("ok", ev.get("htmlLink", ""))
        return
    # EventKit fallback: what Calendar.app can do without Google. Attendees are dropped — say so.
    note = " (attendees and Meet link need Google login: gcal.sh auth)" if (sp["attendees"] or sp["meet"]) else ""
    js = r"""
ObjC.import('EventKit');
var A = %s;
var store = $.EKEventStore.alloc.init;
var cals = store.calendarsForEntityType(0), cal = null;
for (var i = 0; i < cals.count; i++) { var c = cals.objectAtIndex(i);
  if (c.title.js === A.account && c.allowsContentModifications) cal = c; }
if (!cal) cal = store.defaultCalendarForNewEvents;
var e = $.EKEvent.eventWithEventStore(store);
e.title = $(A.title); e.calendar = cal; e.allDay = A.allday;
e.startDate = $.NSDate.dateWithTimeIntervalSince1970(A.start);
e.endDate = $.NSDate.dateWithTimeIntervalSince1970(A.end);
if (A.location) e.location = $(A.location);
if (A.notes) e.notes = $(A.notes);
var err = Ref();
var ok = store.saveEventSpanCommitError(e, 0, true, err);
ok ? 'ok' : ('fail ' + (err[0] && !err[0].isNil() ? err[0].localizedDescription.js : 'unknown'));
""" % json.dumps({"account": ACCOUNT, "title": sp["title"], "allday": sp["allday"],
                  "start": sp["start"].timestamp(), "end": sp["end"].timestamp(),
                  "location": sp["location"], "notes": sp["notes"]})
    r = subprocess.run(["/usr/bin/osascript", "-l", "JavaScript", "-e", js], capture_output=True, text=True)
    out = (r.stdout or "").strip() or ("fail " + (r.stderr or "").strip()[:200])
    print(out + (" via Calendar.app" + note if out == "ok" else ""))


def main(a):
    if not a or a[0] in ("-h", "--help"):
        die(__doc__ or "gcal.py status|auth|respond|create|quick|link|open")
    cmd = a[0]
    if cmd == "status": status()
    elif cmd == "auth": auth()
    elif cmd == "respond": respond(a[1], a[2])
    elif cmd == "create": create(a[1], dry="--dry" in a[2:])
    elif cmd == "quick":
        # --b64 keeps a sentence with $ or quotes intact through the widget's shell call
        quick(base64.b64decode(a[2]).decode() if len(a) > 2 and a[1] == "--b64" else " ".join(a[1:]))
    elif cmd == "link": print(link(a[1], a[2] if len(a) > 2 else ""))
    elif cmd == "open":
        u = link(a[1], a[2] if len(a) > 2 else "") or die("nolink — this event has no Google Calendar page I can find")
        subprocess.run(["open", u], check=False); print("ok")
    elif cmd == "calapp": calapp(a[1])
    else: die("unknown command " + cmd)


if __name__ == "__main__":
    main(sys.argv[1:])
