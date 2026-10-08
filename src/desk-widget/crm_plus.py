#!/usr/bin/env python3
# crm_plus.py: the playbook layer on top of the CRM model (MSBAI Customer Outreach, Follow Up and
# CRM Playbook, Oct 7 2026). No network, no model: it reads what the sync already saved and writes
# .crm/plus.json for the CRM tab.
#
#   python3 crm_plus.py            (run by crm.sh after every sync and on the widget's beat)
#
# What it works out:
#   types      every contact as one of the playbook's customer types (buyer, user, tpoc, adjacent,
#              partner, peer), from the fields Hermes keeps in ClickUp
#   pursuits   per open proposal: the timeline (7 weeks out, 21, 14 and 7 days), who we have on the
#              customer side, who we have actually talked to, and the bid gate (3 by 14 days out)
#   debriefs   meetings that just ended with people outside the team, waiting for a debrief
#   campaigns  outreach target lists (campaigns.json), each target's stage from CRM evidence plus
#              touches logged here (LinkedIn, InMail, calls the mail capture cannot see)
#   week       the weekly scoreboard: customer conversations against 10, outreach, replies, overdue
import datetime, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
C = os.path.join(HERE, ".crm")
P = lambda *a: os.path.join(C, *a)
today = datetime.date.today()
now = datetime.datetime.now()

def load(p, d):
    try: return json.load(open(p))
    except Exception: return d
def lines(p):
    try: return [json.loads(l) for l in open(p) if l.strip()]
    except Exception: return []
norm = lambda x: re.sub(r"\s+", " ", re.sub(r"[^\w@.\s]", " ", (x or "").lower())).strip()
def toks(x): return [t for t in norm(x).replace(".", " ").split() if len(t) > 1]
def d(s):
    try: return datetime.date.fromisoformat(str(s)[:10])
    except Exception: return None
def iso(x): return x.isoformat() if x else ""

model = load(P("crm.json"), {})
cache = load(P("cu-cache.json"), [])
team_emails = set()
try:
    for l in open(os.path.join(HERE, "team.tsv")):
        f = l.rstrip("\n").split("\t")
        if len(f) >= 3 and "@" in f[2]: team_emails.add(f[2].strip().lower())
except Exception: pass
me = load(os.path.join(HERE, "me.json"), {})
if me.get("email"): team_emails.add(me["email"].lower())
OUR_DOMAINS = ("microsurgeonbot.com", "tamfortis", "nexcavate")

by_list = {}
for x in cache: by_list.setdefault(x["list"], []).append(x)
contacts = by_list.get("Contacts", [])
rels = by_list.get("Company Relationships", [])
convs = by_list.get("Conversations", [])
partner_names = {norm(i["title"]) for i in model.get("items", []) if i.get("kind") == "partner"}

# ── customer type, the playbook's six ──
def ctype(c):
    f = c["fields"]
    role = (f.get("Customer Role") or "").lower()
    kind = (f.get("Contact Type") or "").lower()
    side = (f.get("Customer Side") or "").lower() == "true"
    if norm(c["name"]) in partner_names: return "partner"
    if "tpoc" in role: return "tpoc"
    if role in ("program office", "leadership"): return "buyer"
    if role == "end user": return "user"
    if side and kind in ("government", "national lab"): return "adjacent"
    if side: return "adjacent"
    if kind in ("company", "university") or role == "researcher": return "peer"
    return "unknown"

# ── who we have talked to: a reply from them, or a meeting with them ──
meet_log = lines(P("meetings-log.jsonl"))
met = {}
for m in meet_log:
    for p in m.get("people", []):
        for k in (norm(p.get("n")), (p.get("em") or "").lower()):
            if k: met[k] = max(met.get(k, ""), m.get("date", ""))
inb, outb = {}, {}
def bump(dct, k, v):
    if k and v and v > dct.get(k, ""): dct[k] = v
for r in rels:
    who = norm(r["fields"].get("Contact"))
    bump(inb, who, r["fields"].get("Last Inbound", "")); bump(outb, who, r["fields"].get("Last Outbound", ""))
for t in convs:
    f = t["fields"]
    if f.get("Category") == "bulk": continue
    for who in (norm(f.get("Contact")), (f.get("Counterpart Email") or "").lower()):
        bump(inb, who, f.get("Last Inbound", "")); bump(outb, who, f.get("Last Outbound", ""))
touches = lines(P("touches.jsonl"))
for t in touches:
    bump(outb, norm(t.get("n")), (t.get("when") or "")[:10])
    if t.get("reply"): bump(inb, norm(t.get("n")), (t.get("when") or "")[:10])

def state_of(name, email=""):
    keys = [norm(name), (email or "").lower()]
    talked = max([inb.get(k, "") for k in keys] + [met.get(k, "") for k in keys])
    sent = max([outb.get(k, "") for k in keys])
    if talked: return "talked", talked
    if sent: return "contacted", sent
    return "none", ""

types, cinfo, by_email = {}, {}, {}
for c in contacts:
    t = ctype(c)
    em = (c["fields"].get("Primary Email") or "").lower()
    lc = c["fields"].get("Last Contacted", "")
    st, last = state_of(c["name"], em)
    if st == "none" and lc: st, last = "contacted", ""
    types[norm(c["name"])] = t
    cinfo[norm(c["name"])] = dict(n=c["name"], type=t, st=st, last=last, url=c.get("url", ""), em=em, id=c.get("id", ""),
                                  org=c["fields"].get("Organization", ""), title=c["fields"].get("Job Title", ""),
                                  restrict=c["fields"].get("Contact Restriction", ""))
    if em: by_email[em] = cinfo[norm(c["name"])]

# ── pursuits: timeline and bid gate per open proposal ──
CUST = ("buyer", "user", "tpoc", "adjacent")
pursuits = {}
for it in model.get("items", []):
    if it.get("kind") != "proposal" or it.get("state") in ("submitted",) or it.get("stale"): continue
    due = d(it.get("final") or it.get("due"))
    ppl = []
    for w in it.get("who") or []:
        ci = cinfo.get(norm(w.get("name")))
        if ci: ppl.append({**ci, "role": w.get("role", "")})
        else:
            st, last = state_of(w.get("name"))
            ppl.append(dict(n=w.get("name"), type="tpoc" if w.get("role") == "tpoc" else "unknown", st=st, last=last, url=w.get("url", ""), role=w.get("role", "")))
    talked = {k: 0 for k in CUST}
    for p in ppl:
        if p["type"] in CUST and p["st"] == "talked": talked[p["type"]] += 1
    gate_n = sum(talked.values())
    days = (due - today).days if due else None
    if days is None: gstate = "nodate"
    elif gate_n >= 3: gstate = "ok"
    elif days < 14: gstate = "late"
    elif days <= 21: gstate = "short"
    else: gstate = "building"
    peers = sum(1 for p in ppl if p["type"] in ("peer", "unknown"))
    cust = sum(1 for p in ppl if p["type"] in CUST)
    phase = None
    if days is not None:
        phase = "past" if days < 0 else "final" if days <= 7 else "gate" if days <= 14 else "draft" if days <= 21 else "outreach" if days <= 49 else "shaping"
    pursuits[it["id"]] = dict(
        due=iso(due), days=days, phase=phase, state=it.get("state", ""), open=it.get("open", ""),
        marks=dict(start=iso(due - datetime.timedelta(days=49)) if due else "", d21=iso(due - datetime.timedelta(days=21)) if due else "",
                   d14=iso(due - datetime.timedelta(days=14)) if due else "", d7=iso(due - datetime.timedelta(days=7)) if due else ""),
        people=ppl, talked=talked, gate=gate_n, gstate=gstate, peers=peers, cust=cust,
        warn=("Mostly other companies and researchers. Find buyers and end users." if ppl and peers > cust and peers >= 3 else ""))

# ── meetings: log every external meeting seen in the calendar, and the ones waiting for a debrief ──
done = set(l.strip() for l in open(P("debriefed"))) if os.path.exists(P("debriefed")) else set()
seen_mtg = {m.get("uid") + m.get("date", "") for m in meet_log}
debriefs, new_log = [], []
def unesc(v): return re.sub(r"\\(.)", lambda m: "\n" if m.group(1) == "n" else m.group(1), v or "").strip()
try:
    for l in open(os.path.join(HERE, ".cal-last"), encoding="utf-8", errors="replace"):
        f = l.rstrip("\n").split("\t")
        if len(f) < 16 or f[0] != "E" or f[3] == "1": continue
        try:
            s0 = datetime.datetime.strptime(f[1], "%Y-%m-%d %H:%M"); s1 = datetime.datetime.strptime(f[2], "%Y-%m-%d %H:%M")
        except Exception: continue
        if f[4] == "2": continue                                         # canceled
        ppl = []
        for x in unesc(f[15]).split(";;"):
            if not x: continue
            n, st, em, mine = (x.split("|") + ["", "", "", ""])[:4]
            em = em.strip().lower()
            if mine == "1" or em in team_emails or any(dm in em for dm in OUR_DOMAINS) or "fireflies" in em or "resource.calendar" in em: continue
            ci = by_email.get(em) or cinfo.get(norm(n))
            ppl.append(dict(n=(ci or {}).get("n") or (n or em.split("@")[0]).strip(), em=em,
                            type=(ci or {}).get("type") or types.get(norm(n), "unknown"), rel=(ci or {}).get("id", "")))
        if not ppl: continue
        uid = f[14].strip() or norm(f[10])
        key = uid + s0.date().isoformat()
        if s1 <= now and key not in seen_mtg:
            new_log.append(dict(uid=uid, date=s0.date().isoformat(), title=f[10], people=ppl)); seen_mtg.add(key)
        if s1 <= now and now - s1 <= datetime.timedelta(hours=30) and key not in done:
            debriefs.append(dict(key=key, uid=uid, title=f[10], start=f[1], end=f[2], people=ppl,
                                 customer=any(p["type"] in CUST for p in ppl), recurring="_R" in uid,
                                 hours=round((now - s1).total_seconds() / 3600, 1)))
except FileNotFoundError: pass
if new_log:
    with open(P("meetings-log.jsonl"), "a") as fh:
        for m in new_log: fh.write(json.dumps(m) + "\n")
    meet_log += new_log

# ── campaigns ──
# Two sources, merged: every open pursuit becomes a campaign on its own (its targets are the buyers,
# end users, TPOCs and customer side people the CRM links to it), and campaigns.json adds lists the
# CRM does not hold yet (like the FAA roster), each optionally tied to a pursuit. Stages are worked out
# fresh on every run from the evidence: captured email both ways, meetings on the calendar, and the
# LinkedIn, InMail and call touches logged on the tab.
def stage_of(t, ci, st, last, tl):
    if t.get("letter"): return "letter"
    if any(m for m in meet_log if any(norm(p["n"]) == norm(t["n"]) or (p.get("em") and p.get("em") == (ci or {}).get("em")) for p in m["people"])): return "met"
    if st == "talked": return "replied"
    if st == "contacted" or tl: return "contacted"
    return "found"
def match(n):
    ci = cinfo.get(norm(n))
    if ci: return ci
    tk = toks(n)
    for k, v in cinfo.items():                                          # last name plus a first initial is enough
        vt = toks(v["n"])
        if tk and vt and tk[-1] in vt and tk[0][0] == vt[0][0]: return v
    return None
def build_targets(ts):
    rows = []
    for t in ts:
        ci = match(t["n"])
        st, last = state_of(t["n"], (ci or {}).get("em", ""))
        if ci and ci["st"] != "none" and st == "none": st, last = ci["st"], ci["last"]
        tl = [x for x in touches if norm(x.get("n")) == norm(t["n"])]
        rows.append({**t, "stage": stage_of(t, ci, st, last, tl), "last": last or (tl[-1]["when"][:10] if tl else ""),
                     "channels": sorted({x.get("ch") for x in tl if x.get("ch")}), "url": (ci or {}).get("url", "") or t.get("url", ""),
                     "inCrm": bool(ci), "touches": len(tl), "type": t.get("type") or (ci or {}).get("type", ""),
                     "rel": (ci or {}).get("id", ""), "restrict": (ci or {}).get("restrict", "")})
    return rows
STAGES = ["letter", "met", "replied", "contacted", "found"]
manual = load(os.path.join(HERE, "campaigns.json"), {}).get("campaigns", [])
by_pursuit = {c.get("pursuit"): c for c in manual if c.get("pursuit")}
items_by_id = {i["id"]: i for i in model.get("items", [])}
camps = []
for cp in manual:
    ts = list(cp.get("targets", []))
    pu = pursuits.get(cp.get("pursuit") or "")
    if pu:                                                               # plus the customer people the CRM links to that pursuit
        have = {norm(t["n"]) for t in ts}
        ts += [dict(n=x["n"], org=x.get("org", ""), fn=x.get("title", ""), type=x["type"]) for x in pu["people"]
               if x["type"] in CUST and norm(x["n"]) not in have]
    camps.append({**{k: v for k, v in cp.items() if k != "targets"}, "auto": False, "targets": build_targets(ts),
                  "release": (pu or {}).get("state", ""), "open": (pu or {}).get("open", "")})
for pid, pu in pursuits.items():
    if pid in by_pursuit: continue
    cust = [x for x in pu["people"] if x["type"] in CUST]
    if not cust or (pu["days"] is not None and pu["days"] < 0): continue
    it = items_by_id.get(pid, {})
    camps.append(dict(key="p:" + pid, name=(it.get("title") or "") + (" · " + it["sub"].split(" — ")[0] if it.get("sub") else ""),
                      company=it.get("company", "MSBAI"), pursuit=pid, due=pu["due"], gate=pu["marks"]["d14"], auto=True,
                      release=pu.get("state", ""), open=pu.get("open", ""),
                      goal="3 conversations with buyers, end users, TPOCs or customer side people by the gate",
                      targets=build_targets([dict(n=x["n"], org=x.get("org", ""), fn=x.get("title", ""), type=x["type"]) for x in cust])))
for c in camps:
    live = [t for t in c["targets"] if not t.get("restrict")]
    c["counts"] = {k: sum(1 for t in live if t["stage"] == k) for k in STAGES}
    c["offLimits"] = len(c["targets"]) - len(live)
    c["talked"] = sum(1 for t in live if t["stage"] in ("replied", "met", "letter"))
    # TPOCs: the one group the playbook says to reach first, and only while the topic is in pre release
    tp = [t for t in c["targets"] if t.get("type") == "tpoc"]
    rel = c.get("release") or ""
    c["tpoc"] = dict(n=len(tp), fresh=sum(1 for t in tp if t["stage"] == "found" and not t.get("restrict")),
                     window="open" if rel == "prerelease" else "closed" if rel in ("open", "closing", "submitted", "closed")
                            or any("while the topic is open" in (t.get("restrict") or "") for t in tp) else "unknown")
camps.sort(key=lambda c: (c.get("auto", False), c.get("gate") or "9999"))

# ── the week ──
wk0 = today - datetime.timedelta(days=today.weekday())
wk = lambda s: (d(s) or datetime.date.min) >= wk0
cust_meet = [m for m in meet_log if wk(m.get("date")) ]
week = dict(since=iso(wk0), goal=10,
            conversations=sum(1 for m in cust_meet),
            customer=sum(1 for m in cust_meet if any(p.get("type") in CUST for p in m.get("people", []))),
            outreach=sum(1 for k, v in outb.items() if wk(v) and "@" not in k) + 0,
            replies=sum(1 for k, v in inb.items() if wk(v) and "@" not in k),
            touches=sum(1 for t in touches if wk(t.get("when"))),
            overdue=sum(1 for i in model.get("items", []) if i.get("kind") in ("followup", "result") and i.get("direction") != "they owe us"
                        and d(i.get("due")) and d(i.get("due")) < today),
            gateShort=sum(1 for p in pursuits.values() if p["gstate"] in ("short", "late")))

restrict = {k: v["restrict"] for k, v in cinfo.items() if v.get("restrict")}
out = dict(updated=now.isoformat(timespec="minutes"), types=types, pursuits=pursuits, debriefs=debriefs, campaigns=camps, week=week, restrict=restrict)
tmp = P("plus.json.tmp"); json.dump(out, open(tmp, "w"), ensure_ascii=False); os.replace(tmp, P("plus.json"))
print("ok %d pursuits, %d debriefs, %d campaigns" % (len(pursuits), len(debriefs), len(camps)))
