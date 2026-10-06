#!/usr/bin/env python3
# crm_build.py: turns the last ClickUp sync (.crm/output) plus crm-seed.tsv into .crm/crm.json,
# the model the CRM tab draws. Read only on everything except crm.json. Run by crm.sh.
#
#   python3 crm_build.py OUTPUT SEED EXCLUDE TEAM ME DEST [MENTIONS]
#
# The model has four levels, as Ayesha set them on Oct 5:
#   1 contracts and active projects   2 warm and hot leads
#   3 outreach for active proposals   4 partners
# plus follow ups (from Hermes), interested later, a calendar of key dates, and a people index
# the Inbox uses to put a level and a company on each email.
import datetime, json, os, re, sys

out_path, seed_path, excl_path, team_path, me_path, dest = sys.argv[1:7]
mentions_path = sys.argv[7] if len(sys.argv) > 7 else ""
today = datetime.date.today()
COS = {"msbai": "MSBAI", "tam fortis": "Tam Fortis", "nexcavate": "Nexcavate"}

def clean(x):
    x = (x or "").strip()
    return "" if x in ("-", "—") else x

def day(ms):
    try:
        return datetime.datetime.fromtimestamp(int(clean(ms)) / 1000).date().isoformat()
    except (ValueError, TypeError):
        return ""

def co(x):
    return COS.get(clean(x).lower(), "")

def guess_co(text):
    t = (text or "").lower()
    if "tam fortis" in t: return "Tam Fortis"
    if "nexcavate" in t or "permitpulse" in t: return "Nexcavate"
    return "MSBAI"

def norm(name):
    return re.sub(r"\s+", " ", re.sub(r"[^\w@.\s]", " ", (name or "").lower())).strip()

def split_rel(name):
    # "Name — Company": the company lane is the last part
    parts = re.split(r"\s+[—–]\s+", name.strip())
    if len(parts) > 1 and parts[-1].lower() in COS:
        return " — ".join(parts[:-1]), COS[parts[-1].lower()]
    return name.strip(), ""

# ── the sync output ──
raw = open(out_path, encoding="utf-8", errors="replace").read() if os.path.exists(out_path) else ""
m = re.search(r"^\s*CRM_START\s*$(.*?)^\s*CRM_END\s*$", raw, re.S | re.M)
if not m:
    print("bad: no CRM_START/CRM_END block"); sys.exit(0)
recs = [l.strip("\r\n ").split("\t") for l in m.group(1).splitlines() if "\t" in l]
pad = lambda f, n: f + [""] * (n - len(f))

F, I, P, W, O, G = [], [], [], [], [], {}
for r in recs:
    k = r[0].strip()
    if k == "F": F.append(pad(r, 13))
    elif k == "I": I.append(pad(r, 11))
    elif k == "P": P.append(pad(r, 13))
    elif k == "W": W.append(pad(r, 4))
    elif k == "O": O.append(pad(r, 5))
    elif k == "G":
        r = pad(r, 4)
        G.setdefault(r[1].strip(), []).append((r[2].strip(), r[3].strip()))

# ── who is internal or noise ──
excl = []
if os.path.exists(excl_path):
    excl = [l.strip().lower() for l in open(excl_path, encoding="utf-8") if l.strip() and not l.startswith("#")]
internal = set()
try:
    me = json.load(open(me_path))
    internal.add(norm(me.get("full", "")))
    dom = (me.get("email", "").split("@") + [""])[1].lower()
except Exception:
    me, dom = {}, ""
if os.path.exists(team_path):
    for l in open(team_path, encoding="utf-8"):
        f = l.rstrip("\n").split("\t")
        if len(f) >= 3 and "@" in f[2]:
            internal.add(norm(f[2].split("@")[0].replace(".", " ")))

def junk(name):
    n = name.lower()
    if norm(name) in internal: return True
    if dom and n.endswith("@" + dom): return True
    return any(p in n for p in excl)

# ── seed ──
seed = []
if os.path.exists(seed_path):
    for l in open(seed_path, encoding="utf-8"):
        if not l.strip() or l.startswith("#"): continue
        f = pad(l.rstrip("\n").split("\t"), 10)
        seed.append(dict(kind=clean(f[0]), company=clean(f[1]), name=clean(f[2]), org=clean(f[3]),
                         people=clean(f[4]), pursuits=clean(f[5]), need=clean(f[6]), date=clean(f[7]),
                         clickup=clean(f[8]), note=clean(f[9])))

def seed_people(s):
    out = []
    for p in [x.strip() for x in s.split(";") if x.strip()]:
        mm = re.match(r"^(.*?)\s*\((.*)\)\s*$", p)
        name, detail = (mm.group(1), mm.group(2)) if mm else (p, "")
        email = detail if "@" in detail else ""
        role = "" if email else detail
        out.append({"name": name.strip(), "role": role, "email": email})
    return out

cu = lambda i: "https://app.clickup.com/t/" + i if i else ""

items, cal = [], []
people = {}   # normalized name -> what we know, for the Inbox and for guards

def person(name, **kw):
    if not name: return
    p = people.setdefault(norm(name), {"name": name})
    for k, v in kw.items():
        if v in (None, "", []): continue
        if k in ("levels", "pursuits", "companies", "roles"):
            p[k] = sorted(set(p.get(k, [])) | set(v))
        else:
            p.setdefault(k, v)

def add_cal(date, kind, label, company, item_id, level):
    if date: cal.append({"date": date, "type": kind, "label": label, "company": company, "item": item_id, "level": level})

# ── level 1: contracts ──
opp_by_name = {}
for _, n, i, name, url in [(r[0], r[1].strip(), r[2].strip(), r[3].strip(), r[4].strip()) for r in O]:
    opp_by_name[name] = {"stage": {"2": "active pursuit", "3": "proposal", "4": "submitted", "5": "won"}.get(n, n), "id": i, "url": url}

seed_contract = {s["clickup"]: s for s in seed if s["kind"] == "contract" and s["clickup"]}
contract_names = set()
for r in W:
    i, name, url = r[1].strip(), r[2].strip(), r[3].strip()
    s = seed_contract.pop(i, None) or {}
    ppl = seed_people(s.get("people", ""))
    it = {"id": i, "kind": "contract", "level": 1, "title": s.get("name") or name, "sub": name if s.get("name") else "",
          "company": s.get("company") or guess_co(name), "org": s.get("org", ""), "who": ppl,
          "need": s.get("need", ""), "note": s.get("note", ""), "url": url or cu(i),
          "opp": opp_by_name.get(name, {}).get("url", ""), "pursuits": [x for x in s.get("pursuits", "").split(";") if x.strip()]}
    items.append(it); contract_names.add(name)
    for p in ppl: person(p["name"], levels=[1], companies=[it["company"]], roles=[p["role"] or "contract"], item=i, email=p["email"])
for s in list(seed_contract.values()) + [s for s in seed if s["kind"] == "contract" and not s["clickup"]]:
    i = "seed:" + re.sub(r"\W+", "-", s["name"].lower()).strip("-")
    ppl = seed_people(s["people"])
    items.append({"id": i, "kind": "contract", "level": 1, "title": s["name"], "company": s["company"] or "MSBAI",
                  "org": s["org"], "who": ppl, "need": s["need"], "note": s["note"], "url": cu(s["clickup"]),
                  "seed": True, "pursuits": [x.strip() for x in s["pursuits"].split(";") if x.strip()]})
    for p in ppl: person(p["name"], levels=[1], companies=[s["company"]], roles=[p["role"] or "contract"], item=i, email=p["email"])

# ── level 4: partners ──
partner_names = set()
for i, name in G.get("rel_partner", []):
    pn, pc = split_rel(name)
    if junk(pn): continue
    items.append({"id": i, "kind": "partner", "level": 4, "title": pn, "company": pc or "MSBAI", "who": [{"name": pn}], "url": cu(i)})
    partner_names.add(norm(pn)); person(pn, levels=[4], companies=[pc], roles=["partner"], rel=i)
for s in [s for s in seed if s["kind"] == "partner"]:
    i = "seed:" + re.sub(r"\W+", "-", (s["company"] + " " + s["name"]).lower()).strip("-")
    ppl = seed_people(s["people"])
    items.append({"id": i, "kind": "partner", "level": 4, "title": s["name"], "company": s["company"] or "MSBAI",
                  "org": s["org"], "who": ppl, "need": s["need"], "note": s["note"], "url": cu(s["clickup"]), "seed": True,
                  "pursuits": [x.strip() for x in s["pursuits"].split(";") if x.strip()]})
    for p in ppl:
        partner_names.add(norm(p["name"]))
        if p["email"]: partner_names.add(norm(p["email"]))
        person(p["name"], levels=[4], companies=[s["company"]], roles=["partner"], item=i, email=p["email"])

# ── level 3: proposals ──
tpocs = {norm(n) for _, n in G.get("con_tpoc", [])}
STATE = {"pre-release": "prerelease", "opening soon (1 week left)": "opening", "open": "open",
         "closing soon (1 week left)": "closing", "closed": "closed", "paused": "paused", "na": "other"}
proposal_names = set()
for r in P:
    i, name, status, who, due, rel, opend, final, mile, pco, nxt, url = [x.strip() for x in r[1:13]]
    if re.match(r"^\[|^Reconcile ", name): continue
    topic = (re.match(r"^([A-Z0-9]{4,}-[A-Z0-9]{3,})\b", name) or [None, ""])[1]
    labels = [x.strip().lower() for x in clean(rel).split(",") if x.strip()]
    state = STATE.get(labels[0], "") if labels else ""
    od, fd, dd, md = day(opend), day(final), day(due), day(mile)
    if status in ("waiting for response", "submitted"): state = "submitted"
    elif not state:
        if od and today.isoformat() < od: state = "prerelease"
        elif (fd or dd) and today.isoformat() <= (fd or dd): state = "unset"
        else: state = "unset"
    cos = [COS.get(x.strip().lower().replace("tam fortis", "tam fortis"), "") for x in clean(pco).split(",")]
    cos = [c for c in cos if c] or [guess_co(name)]
    ppl, tp = [], 0
    for pid, pn in G.get("pursuit:" + topic, []) if topic else []:
        if junk(pn): continue
        role = "tpoc" if norm(pn) in tpocs else ("partner" if norm(pn) in partner_names else "customer side")
        tp += role == "tpoc"
        ppl.append({"name": pn, "role": role, "id": pid, "url": cu(pid)})
        person(pn, levels=[3], companies=cos, roles=[role], pursuits=[topic], contact=pid)
    opp = opp_by_name.get(name, {})
    short = name.split(" — ")[0] if topic else name
    # submitted long ago, paused, or not a real pursuit: kept, but folded under "older" in the tab
    last = max([d for d in (dd, fd, md, od) if d] or [""])
    cutoff = (today - datetime.timedelta(days=45)).isoformat()
    stale = state in ("paused", "other", "closed") or (state == "submitted" and (not last or last < cutoff))
    it = {"id": i, "kind": "proposal", "level": 3, "title": short, "sub": " — ".join(name.split(" — ")[1:]) if topic else "",
          "topic": topic, "status": status, "state": state, "company": cos[0], "companies": cos, "owner": clean(who),
          "due": dd, "final": fd, "open": od, "milestone": md, "next": clean(nxt), "who": ppl, "tpocs": tp,
          "url": url or cu(i), "opp": opp.get("url", ""), "oppStage": opp.get("stage", ""), "stale": stale}
    items.append(it); proposal_names.add(name)
    lab = topic or short
    if state != "submitted":
        add_cal(dd, "due", lab + " internal due", cos[0], i, 3)
        add_cal(fd, "deadline", lab + " final deadline", cos[0], i, 3)
        if od:
            add_cal(od, "opens", lab + " opens", cos[0], i, 3)
            add_cal((datetime.date.fromisoformat(od) - datetime.timedelta(days=1)).isoformat(), "tpoc", lab + " TPOC window closes", cos[0], i, 3)
    add_cal(md, "milestone", lab + (" result expected" if state == "submitted" else " milestone"), cos[0], i, 3)

# ── follow ups (Hermes) ──
open_fu_people = set()
for r in F:
    i, name, who, due, ent, direc, origin, cstate, contacts, purs, ev, url = [x.strip() for x in r[1:13]]
    ctc = [c.strip() for c in clean(contacts).split(";") if c.strip()]
    purs = [p.strip() for p in clean(purs).split(";") if p.strip()]
    title = name
    for c in ctc:
        title = re.sub(r"\s+[—–]\s+" + re.escape(c) + r"\s*$", "", title)
    o = clean(origin)
    kind = {"reply clock": "reply", "result trigger": "result", "check in": "checkin", "interest trigger": "interest"}.get(o, "followup")
    lvl = 2
    for c in ctc:
        p = people.get(norm(c), {})
        if p.get("levels"): lvl = min(p["levels"])
    if any(x in contract_names for x in purs): lvl = 1
    elif any(x in proposal_names for x in purs) and lvl == 2: lvl = 3
    company = co(ent) or guess_co(name)
    it = {"id": i, "kind": kind, "level": lvl, "title": title, "company": company, "owner": clean(who), "due": day(due),
          "direction": clean(direc), "origin": o, "who": [{"name": c} for c in ctc], "pursuits": purs,
          "evidence": clean(ev), "url": url or cu(i)}
    items.append(it)
    for c in ctc:
        open_fu_people.add(norm(c)); person(c, companies=[company], followups=1)
    add_cal(day(due), "followup", title, company, i, lvl)

# ── interested later ──
for r in I:
    i, name, ent, interest, why, trig, resurf, st, contacts, url = [x.strip() for x in r[1:11]]
    ctc = [c.strip() for c in clean(contacts).split(";") if c.strip()]
    company = co(ent) or "MSBAI"
    items.append({"id": i, "kind": "interest", "level": 2, "title": (ctc[0] if ctc else name.split(" — ")[0]),
                  "interest": clean(interest), "why": clean(why), "trigger": clean(trig), "resurface": day(resurf),
                  "state": clean(st), "company": company, "who": [{"name": c} for c in ctc], "url": url or cu(i)})
    add_cal(day(resurf), "resurface", "Resurface " + (ctc[0] if ctc else name), company, i, 2)

# ── level 2: leads ──
grp = {k: {i for i, _ in v} for k, v in G.items()}
cooling = grp.get("rel_cooling", set()) | grp.get("rel_dormant", set()) | grp.get("rel_atrisk", set())
lead_ids = grp.get("rel_engaged", set()) | grp.get("rel_active", set()) | grp.get("rel_key", set()) | grp.get("rel_warm", set())
names = {}
for k, v in G.items():
    if k.startswith("rel_"):
        for i, n in v: names[i] = n
for i in sorted(lead_ids):
    pn, pc = split_rel(names.get(i, ""))
    if not pn or junk(pn) or norm(pn) in partner_names: continue
    if "@" in pn and norm(pn) not in people: continue
    known = people.get(norm(pn), {})
    if 1 in known.get("levels", []): continue
    hot = i in grp.get("rel_touch21", set()) or norm(pn) in open_fu_people
    heat = "hot" if hot else "cooling" if i in cooling else "warm" if (i in grp.get("rel_touch90", set()) or i in grp.get("rel_key", set()) or i in grp.get("rel_warm", set())) else "quiet"
    tier = "key" if i in grp.get("rel_key", set()) else "warm" if i in grp.get("rel_warm", set()) else ""
    items.append({"id": i, "kind": "lead", "level": 2, "title": pn, "company": pc or "MSBAI", "heat": heat, "tier": tier,
                  "pursuits": known.get("pursuits", []), "who": [{"name": pn}], "url": cu(i)})
    person(pn, levels=[2], companies=[pc], rel=i, heat=heat)

# ── people named in meetings (crm.sh meetings: .crm/mentions.tsv) ──
# meeting id, title, date, person, organization, company, kind, what was said, follow up, who said it, seconds
if mentions_path and os.path.exists(mentions_path):
    cut = (today - datetime.timedelta(days=21)).isoformat()
    seen_m = set()
    for l in open(mentions_path, encoding="utf-8", errors="replace"):
        f = pad(l.rstrip("\n").split("\t"), 11)
        mid, title, date, pn, org, mco, kind, said, fu, by, sec = [clean(x) for x in f[:11]]
        if not mid or not pn or date < cut or junk(pn): continue
        key = mid + ":" + norm(pn)
        if key in seen_m: continue
        seen_m.add(key)
        known = people.get(norm(pn), {})
        lvl = min(known.get("levels") or [4 if kind == "partner" else 3 if kind == "tpoc" else 1 if kind == "customer" else 2])
        url = "https://app.fireflies.ai/view/" + mid + (("?t=" + sec) if re.match(r"^\d+(\.\d+)?$", sec or "") else "")
        items.append({"id": "m:" + re.sub(r"\W+", "", key)[:60], "kind": "mention", "level": lvl,
                      "title": pn + (" (" + org + ")" if org else ""), "company": co(mco) or guess_co(mco + " " + org),
                      "said": said, "next": fu, "by": by, "meeting": title, "date": date, "known": bool(known),
                      "mkind": kind, "url": url})
        person(pn, companies=[co(mco)], mentioned=date)

# ── who owns what: lead owners from their open follow ups, and two owners on one person ──
owners_by_person = {}
for it in items:
    if it["kind"] in ("reply", "followup", "checkin", "result") and it.get("owner"):
        for w in it.get("who", []):
            owners_by_person.setdefault(norm(w["name"]), set()).update(o.strip() for o in it["owner"].split(",") if o.strip())
for it in items:
    if it["kind"] in ("lead", "partner", "contract", "mention") and not it.get("owner"):
        os_ = set().union(*[owners_by_person.get(norm(w.get("name", "")), set()) for w in it.get("who", [])] or [set()])
        if os_: it["owner"] = ", ".join(sorted(os_))
    ws = it.get("who", [])
    both = set().union(*[owners_by_person.get(norm(w.get("name", "")), set()) for w in ws] or [set()])
    if len(both) > 1: it["overlap"] = sorted(both)

# ── seed dates ──
for s in [s for s in seed if s["kind"] == "date"]:
    add_cal(s["date"], "event", s["name"], s["company"] or "MSBAI", "", 0)

# ── the People tab (Rolodex): every relationship and contact in the CRM, names only, merged by
# person, with what the rest of the model already knows about them. Light on purpose: details load
# into a card when a name is opened.
roster = {}
def ros(name, **kw):
    if not name or junk(name) or ("@" in name and norm(name) not in people): return
    r = roster.setdefault(norm(name), {"n": name, "c": [], "rel": [], "con": ""})
    for c in kw.get("companies", []):
        if c and c not in r["c"]: r["c"].append(c)
    if kw.get("rel") and kw["rel"] not in r["rel"]: r["rel"].append(kw["rel"])
    if kw.get("con") and not r["con"]: r["con"] = kw["con"]
for i, n in G.get("rel_all", []):
    pn, pc = split_rel(n); ros(pn, companies=[pc], rel=i)
for i, n in G.get("con_all", []):
    ros(n, con=i)
for k, p in people.items():
    ros(p["name"], companies=p.get("companies", []))
for k, r in roster.items():
    p = people.get(k, {})
    if p.get("levels"): r["lv"] = min(p["levels"])
    for f in ("heat", "roles", "pursuits", "mentioned", "email"):
        if p.get(f): r[f] = p[f]
    if norm(r["n"]) in partner_names and "lv" not in r: r["lv"] = 4
roster = sorted(roster.values(), key=lambda r: re.sub(r"^[^a-z]+", "", r["n"].lower()))

lo, hi = (today - datetime.timedelta(days=45)).isoformat(), (today + datetime.timedelta(days=200)).isoformat()
cal = sorted([c for c in cal if lo <= c["date"] <= hi], key=lambda c: (c["date"], c["level"] or 9))
counts = {k: sum(1 for x in items if x["level"] == n) for k, n in (("contracts", 1), ("leads", 2), ("proposals", 3), ("partners", 4))}
notes = []
unset = [x["title"] for x in items if x["kind"] == "proposal" and x["state"] == "unset"]
if unset: notes.append("%d open proposals have no Solicitation Release State in ClickUp" % len(unset))
if not G.get("rel_partner"): notes.append("No partners are marked in the CRM yet; the Partners tab shows the seed list")
model = {"updated": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
         "items": items, "calendar": cal, "people": people, "roster": roster, "counts": counts, "notes": notes}
tmp = dest + ".tmp"
json.dump(model, open(tmp, "w"), separators=(",", ":"), ensure_ascii=False)
os.replace(tmp, dest)
print("ok %d items, %d dates" % (len(items), len(cal)))
