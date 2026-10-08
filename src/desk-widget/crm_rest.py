#!/usr/bin/env python3
# crm_rest.py: the CRM sync read straight from ClickUp's REST API with your personal token
# (.clickup-token), instead of through the Claude ClickUp connector. The connector shares one
# ~1,000 calls a day pool with OpenClaw and every chat; the REST API has no daily cap, only a per
# minute one (100 a minute on most plans), and one list call returns every task's custom fields,
# so a whole sync is about 10 to 20 calls. Read only: it only ever sends GET requests.
#
#   python3 crm_rest.py sync OUTPUT     -> writes the CRM_START block crm_build.py reads; prints "ok ..." or "failed: ..."
#   python3 crm_rest.py card SPECFILE   -> the ClickUp records for one lead card, as text for the card prompt
#   python3 crm_rest.py fields          -> custom field names per list (for checking the mapping)
#
# Every sync also saves the CRM lists (Contacts, Relationships, Conversations, Follow-ups, Interested
# Later, Proposals) to .crm/cu-cache.json, so a card finds its person locally and only spends a few
# REST calls fetching those tasks fresh. Cards never use the connector's daily limit.
import json, os, re, sys, time, urllib.parse, urllib.request
from datetime import datetime, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
TOKEN_FILE = os.path.join(HERE, ".clickup-token")
API = "https://api.clickup.com/api/v2"

L_FOLLOW, L_LATER, L_PROPOSALS = "901115367058", "901115485850", "901102025484"
L_OPPS, L_RELS, L_CONTACTS = "901115367054", "901115367052", "901115367051"
OPEN_PROPOSAL = ["to do", "monitoring for release", "waiting for response", "affected by sbir reauth",
                 "collecting information", "writing", "needs review", "missing information",
                 "urgent (help needed)", "ready for submission", "submitted"]
F_OPP_LEVEL = "cfd8f5eb-7078-4376-bb84-c38a3a9ad7c6"
F_REL_STAGE = "d73c6732-93b2-4dc2-8d6d-4aca606ed5a9"
F_REL_TOUCH = "a2f76dfd-52c8-45ed-aee2-d3f8c8dab62e"
F_REL_HEALTH = "b9494d62-b26e-4313-88b0-0c5ba96f6130"
F_REL_KEY = "a4f4d7e4-6101-416b-accc-73f31a6f4a40"
F_CON_TPOC = "e5636f85-1bd7-4d36-a882-d3284bdb9c4c"
F_CON_PURSUIT = "e7fd3448-b785-4352-9d7c-fb247f23a891"

def token():
    try: return open(TOKEN_FILE).read().strip()
    except Exception: return ""

CALLS = 0
def get(path, params=None):
    global CALLS
    q = urllib.parse.urlencode(params or [], doseq=True)
    req = urllib.request.Request(f"{API}{path}{'?' + q if q else ''}", headers={"Authorization": token()})
    for attempt in range(4):
        try:
            CALLS += 1
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 3:          # per minute limit: wait for the reset
                reset = e.headers.get("X-RateLimit-Reset")
                time.sleep(max(2, min(65, int(reset) - int(time.time()) + 1)) if reset else 30); continue
            raise RuntimeError(f"ClickUp said {e.code} on {path}: {e.read()[:200].decode('utf-8', 'replace')}")
        except urllib.error.URLError as e:
            if attempt < 3: time.sleep(5); continue
            raise RuntimeError(f"could not reach ClickUp: {e.reason}")

CACHE = os.path.join(HERE, ".crm", "cu-cache.json")
LISTS = os.path.join(HERE, ".crm", "cu-lists.json")
SEEN = {}                                   # list id -> the raw tasks this sync read

def tasks(list_id, statuses=None, closed=False):
    out, page = [], 0
    while True:
        p = [("page", page), ("subtasks", "false"), ("include_closed", "true" if closed else "false")]
        p += [("statuses[]", s) for s in (statuses or [])]
        r = get(f"/list/{list_id}/task", p)
        out += r.get("tasks", [])
        if r.get("last_page", True) or not r.get("tasks"):
            SEEN.setdefault(list_id, []).extend(out); return out
        page += 1

# ── field values as words ──
def clean(v):
    v = re.sub(r"[\t\r\n]+", " ", str(v if v is not None else "")).strip()
    return v or "-"

def field(t, key):
    """key is a field id, or a name (case and spacing ignored; a trailing s is optional)."""
    norm = lambda s: re.sub(r"[^a-z0-9+]", "", s.lower()).rstrip("s")
    for f in t.get("custom_fields", []):
        if f.get("id") == key or norm(f.get("name", "")) == norm(key): return f
    return None

def opt_index(f):
    v = (f or {}).get("value")
    if v is None or v == "": return None
    if isinstance(v, int) or (isinstance(v, str) and v.isdigit()): return int(v)
    for o in ((f.get("type_config") or {}).get("options") or []):
        if o.get("id") == v: return o.get("orderindex")
    return None

def words(f, join=", "):
    if not f: return "-"
    v, typ = f.get("value"), f.get("type")
    opts = (f.get("type_config") or {}).get("options") or []
    if v is None or v == "" or v == []: return "-"
    if typ == "drop_down":
        i = opt_index(f)
        for o in opts:
            if o.get("orderindex") == i or o.get("id") == v: return clean(o.get("name"))
        return clean(v)
    if typ == "labels":
        by = {o.get("id"): o.get("label") or o.get("name") for o in opts}
        return clean(join.join(by.get(x, str(x)) for x in v))
    if typ in ("list_relationship", "tasks"):
        return clean(join.join(x.get("name", "") for x in v if isinstance(x, dict)))
    if typ == "users":
        return clean(join.join(x.get("username", "") for x in v if isinstance(x, dict)))
    if isinstance(v, (list, dict)): return clean(json.dumps(v))
    return clean(v)

def who(t): return clean(",".join(a.get("username", "") for a in t.get("assignees", [])))
def due(t): return clean(t.get("due_date"))

def has_name(f, val):
    """a dropdown or label field holding an option named val, or a text field equal to val"""
    if not f or f.get("value") in (None, "", []): return False
    return val.lower() in [s.strip().lower() for s in words(f, "\x1f").split("\x1f")]

def sync(out_path):
    if not token(): print("failed: no token in .clickup-token"); return
    lines = ["CRM_START"]
    for t in tasks(L_FOLLOW):
        lines.append("\t".join(["F", t["id"], clean(t["name"]), who(t), due(t),
            words(field(t, "Entity")), words(field(t, "Direction")), words(field(t, "Origin")),
            words(field(t, "Commitment State")), words(field(t, "Contact"), ";"),
            words(field(t, "Pursuit"), ";"), words(field(t, "Source Evidence")), clean(t.get("url"))]))
    for t in tasks(L_LATER):
        lines.append("\t".join(["I", t["id"], clean(t["name"]), words(field(t, "Entity")),
            words(field(t, "Interest")), words(field(t, "Why Later")), words(field(t, "Trigger Event")),
            words(field(t, "Resurface On")), words(field(t, "Interest State")),
            words(field(t, "Contact"), ";"), clean(t.get("url"))]))
    props = tasks(L_PROPOSALS, OPEN_PROPOSAL)
    for t in props:
        lines.append("\t".join(["P", t["id"], clean(t["name"]), clean((t.get("status") or {}).get("status")), who(t), due(t),
            words(field(t, "Solicitation Release State")), words(field(t, "Open Date")),
            words(field(t, "Final Submission Date")), words(field(t, "Next Milestone Date")),
            words(field(t, "Proposing Company")), words(field(t, "Next Step + Due Date")), clean(t.get("url"))]))
    for t in tasks(L_PROPOSALS, ["won"], closed=True):
        lines.append("\t".join(["W", t["id"], clean(t["name"]), clean(t.get("url"))]))
    for t in tasks(L_OPPS):
        n = opt_index(field(t, F_OPP_LEVEL))
        if n in (2, 3, 4, 5): lines.append("\t".join(["O", str(n), t["id"], clean(t["name"]), clean(t.get("url"))]))

    g = lambda grp, t: lines.append("\t".join(["G", grp, t["id"], clean(t["name"])]))
    now = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    d21, d90 = [int((now - timedelta(days=d)).timestamp() * 1000) for d in (21, 90)]
    for t in tasks(L_RELS):
        stage, health, key = (opt_index(field(t, k)) for k in (F_REL_STAGE, F_REL_HEALTH, F_REL_KEY))
        for i, grp in ((2, "rel_engaged"), (3, "rel_active"), (4, "rel_customer"), (5, "rel_partner")):
            if stage == i: g(grp, t)
        try: touch = int((field(t, F_REL_TOUCH) or {}).get("value") or 0)
        except Exception: touch = 0
        if touch >= d21: g("rel_touch21", t)
        if touch >= d90: g("rel_touch90", t)
        for i, grp in ((1, "rel_cooling"), (2, "rel_dormant"), (3, "rel_atrisk")):
            if health == i: g(grp, t)
        for i, grp in ((0, "rel_key"), (1, "rel_warm")):
            if key == i: g(grp, t)
        g("rel_all", t)
    codes = sorted({m.group(1) for t in props for m in [re.match(r"\s*([A-Za-z0-9]+-[A-Za-z0-9]+)", t["name"])] if m})
    for t in tasks(L_CONTACTS):
        if opt_index(field(t, F_CON_TPOC)) == 0: g("con_tpoc", t)
        g("con_all", t)
        pf = field(t, F_CON_PURSUIT)
        for c in codes:
            if has_name(pf, c): g("pursuit:" + c, t)
    lines.append("CRM_END")
    try:
        conv = conversations_list()
        if conv: tasks(conv)
    except Exception:
        pass
    save_cache()
    tmp = out_path + ".tmp"
    open(tmp, "w").write("\n".join(lines) + "\n"); os.replace(tmp, out_path)
    n = sum(1 for l in lines if l.split("\t")[0] in ("F", "I", "P"))
    print("ok %d detailed, %d REST calls" % (n, CALLS))

# ── the local copy cards search ──
def slim(t, list_name):
    def show(f):
        if f.get("type") == "date":
            try: return datetime.fromtimestamp(int(f["value"]) / 1000).strftime("%Y-%m-%d")
            except Exception: pass
        return words(f, "; ")
    cf = {f.get("name"): show(f) for f in t.get("custom_fields", []) if f.get("value") not in (None, "", [])}
    return {"id": t["id"], "name": t.get("name", ""), "list": list_name, "url": t.get("url", ""),
            "status": (t.get("status") or {}).get("status", ""), "upd": t.get("date_updated", ""),
            "fields": cf, "desc": (t.get("text_content") or t.get("description") or "")[:2500]}

def list_names():
    names = {L_FOLLOW: "Follow-ups", L_LATER: "Interested Later", L_PROPOSALS: "Proposals",
             L_OPPS: "Opportunities", L_RELS: "Company Relationships", L_CONTACTS: "Contacts"}
    try: names.update(json.load(open(LISTS)).get("names", {}))
    except Exception: pass
    return names

def save_cache():
    names = list_names()
    rows, seen = [], set()
    for lid, ts in SEEN.items():
        for t in ts:
            if t["id"] in seen: continue
            seen.add(t["id"]); rows.append(slim(t, names.get(lid, lid)))
    tmp = CACHE + ".tmp"; json.dump(rows, open(tmp, "w")); os.replace(tmp, CACHE)

def conversations_list():
    """The CRM space's Conversations list, found once from the Contacts list's space and remembered."""
    try:
        d = json.load(open(LISTS))
        if d.get("conversations"): return d["conversations"]
    except Exception:
        d = {}
    space = (get(f"/list/{L_CONTACTS}").get("space") or {}).get("id")
    if not space: return ""
    found = []
    for f in get(f"/space/{space}/folder", [("archived", "false")]).get("folders", []):
        found += f.get("lists", [])
    found += get(f"/space/{space}/list", [("archived", "false")]).get("lists", [])
    names = {l["id"]: l["name"] for l in found}
    conv = next((l["id"] for l in found if "conversation" in l["name"].lower()), "")
    json.dump({"conversations": conv, "names": names, "space": space}, open(LISTS, "w"))
    return conv

def norm_words(s):
    return [w for w in re.sub(r"[^a-z0-9 ]+", " ", str(s).lower()).split() if len(w) > 1]

def card(spec_path):
    spec = json.load(open(spec_path))
    name = re.sub(r"\s*\(.*?\)\s*$", "", str(spec.get("name") or "")).strip()
    want = norm_words(name)
    if not want: print("NO_MATCH"); return
    try: rows = json.load(open(CACHE))
    except Exception: rows = []
    def score(r):
        nw = set(norm_words(r["name"]))
        fw = set(norm_words(" ".join(v for k, v in r["fields"].items() if k.lower().startswith(("contact", "company", "entity", "organization", "relationship")))))
        if name.lower() in r["name"].lower(): return 3
        if all(w in nw for w in want): return 2
        if len(want) > 1 and all(w in fw for w in want): return 1
        return 0
    hits = sorted([(score(r), r) for r in rows if score(r)], key=lambda x: (-x[0], x[1]["list"]))
    order = ["Contacts", "Company Relationships", "Conversations", "Follow-ups", "Interested Later", "Proposals", "Opportunities"]
    picked, per = [], {}
    for sc, r in hits:                       # a few per list, the strongest first
        if per.get(r["list"], 0) >= 3 or len(picked) >= 10: continue
        per[r["list"]] = per.get(r["list"], 0) + 1; picked.append(r)
    if not picked: print("NO_MATCH"); return
    names = list_names(); out = []
    for r in sorted(picked, key=lambda r: order.index(r["list"]) if r["list"] in order else 99):
        try:                                 # fresh copy: description, fields and status as of now
            t = get(f"/task/{r['id']}"); r = slim(t, r["list"])
        except Exception:
            pass
        out.append(f"### {r['list']}: {r['name']}  ({r['url']})")
        if r["status"]: out.append(f"status: {r['status']}")
        for k, v in r["fields"].items(): out.append(f"{k}: {v}")
        if r["desc"].strip(): out.append("description: " + r["desc"].strip())
        out.append("")
    print("\n".join(out)[:14000])

def fields():
    for name, lid in (("Follow-ups", L_FOLLOW), ("Interested Later", L_LATER), ("Proposals", L_PROPOSALS),
                      ("Opportunities", L_OPPS), ("Relationships", L_RELS), ("Contacts", L_CONTACTS)):
        r = get(f"/list/{lid}/field")
        print(name + ": " + "; ".join(f"{f['name']} ({f['type']})" for f in r.get("fields", [])))

if __name__ == "__main__":
    try:
        {"sync": lambda: sync(sys.argv[2]), "card": lambda: card(sys.argv[2]), "fields": fields}[sys.argv[1]]()
    except Exception as e:
        print("failed: " + str(e)[:300])
