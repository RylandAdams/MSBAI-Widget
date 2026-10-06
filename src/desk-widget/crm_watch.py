#!/usr/bin/env python3
# crm_watch.py: the CRM tab's notify mode, run by crm.sh on the widget's beat (no model, no network).
# It looks at .crm/crm.json, the Inbox (.emails.tsv) and the nudges, finds what just became urgent,
# keeps it in .crm/alerts.json for the rows to glow, and returns the new ones for a notification.
#
#   python3 crm_watch.py CRMJSON EMAILS NUDGES ME STATE SEEN ALERTS
#
# Watched: a reply waiting on us, a follow up we owe that just went past due, a TPOC window that
# closes within 2 days, an interested later item whose date came, an email from someone in the CRM,
# a new person named in a meeting, a nudge waiting in drafts. Scope is the widget owner's items, or
# everything when me.json says "crmWatch": "all".
import datetime, json, os, re, sys

crm_p, emails_p, nudges_p, me_p, state_p, seen_p, alerts_p = sys.argv[1:8]
today = datetime.date.today().isoformat()
soon = (datetime.date.today() + datetime.timedelta(days=2)).isoformat()
norm = lambda x: re.sub(r"\s+", " ", re.sub(r"[^\w@.\s]", " ", (x or "").lower())).strip()
try: d = json.load(open(crm_p))
except Exception: print("[]"); sys.exit(0)
try: me = json.load(open(me_p))
except Exception: me = {}
scope_all = str(me.get("crmWatch", "")).lower() == "all"
mine = lambda it: scope_all or any(n and n.lower() in (it.get("owner") or "").lower() for n in (me.get("full"), me.get("name")))
people = d.get("people", {})
first = lambda it: ((it.get("who") or [{}])[0].get("name") or it.get("title", ""))

cur = {}
for it in d.get("items", []):
    k, due = it["kind"], it.get("due") or ""
    if k == "reply" and mine(it):
        cur["reply:" + it["id"]] = dict(item=it["id"], what="Reply waiting: " + it["title"], next="Open the card for a suggested reply, then draft it", company=it["company"])
    elif k in ("followup", "result") and mine(it) and due and due < today and it.get("direction") != "they owe us":
        cur["late:" + it["id"]] = dict(item=it["id"], what="Past due: " + it["title"], next="Do it or move the date in ClickUp", company=it["company"])
    elif k == "proposal" and it.get("state") == "prerelease" and it.get("tpocs") and it.get("open") and today <= it["open"] <= soon:
        cur["tpoc:" + it["id"]] = dict(item=it["id"], what="TPOC window closes %s: %s" % (it["open"], it["title"]), next="Draft the TPOC asks today", company=it["company"])
    elif k == "interest" and it.get("resurface") and it["resurface"] <= today:
        cur["later:" + it["id"]] = dict(item=it["id"], what="Time to resurface: " + it["title"], next=it.get("trigger") or "Reach back out", company=it["company"])
    elif k == "mention" and not it.get("known") and it.get("date", "") >= (datetime.date.today() - datetime.timedelta(days=2)).isoformat():
        cur["ment:" + it["id"]] = dict(item=it["id"], what="New from %s: %s" % (it.get("meeting", "a meeting"), it["title"]), next=it.get("next") or "Add them to the CRM", company=it["company"])

if os.path.exists(emails_p):
    for l in open(emails_p, encoding="utf-8", errors="replace"):
        f = l.rstrip("\n").split("\t")
        if len(f) < 9: continue
        p = people.get(norm(f[3]))
        if p:
            cur["mail:" + f[0]] = dict(item="mail:" + f[0], what="%s wrote: %s" % (f[3], f[6]), next="Inbox has a suggested reply", company=f[5])
if os.path.exists(nudges_p):
    for l in open(nudges_p, encoding="utf-8", errors="replace"):
        f = l.rstrip("\n").split("\t")
        if len(f) >= 5 and f[4].startswith("http"):
            cur["nudge:" + f[0]] = dict(item="nudge:" + f[0], what="Nudge ready for %s: %s" % (f[1], f[2]), next="Review the draft in Gmail and send", company="", url=f[4])

seen = set(l.strip() for l in open(seen_p)) if os.path.exists(seen_p) else set()
try: prev = set(json.load(open(state_p)))
except Exception: prev = None
now = datetime.datetime.now().isoformat(timespec="minutes")
alerts = {}
try: old = json.load(open(alerts_p))
except Exception: old = {}
for k, v in cur.items():
    if k in seen: continue
    v["when"] = (old.get(k) or {}).get("when") or now
    v["key"] = k
    alerts[k] = v
new = [] if prev is None else [alerts[k] for k in alerts if k not in prev]   # first run: no flood
json.dump(sorted(cur), open(state_p, "w"))
json.dump(alerts, open(alerts_p, "w"), ensure_ascii=False)
print(json.dumps(new[:5], ensure_ascii=False))
