#!/usr/bin/env python3
# crm_pages.py: the Rolodex as files. One markdown page per person in desk-widget/rolodex/, written
# from the CRM model (.crm/crm.json), the cards the widget built (.crm/cards), the people named in
# meetings, and what you add from the desk. It is the CRM's version of TASKS.md: the desk's merged
# view of a person, paired to their ClickUp records by "· synced" lines, so Claude, OpenClaw and a
# teammate's copy can read or search one person without calling ClickUp.
#
#   python3 crm_pages.py CRMJSON CARDSDIR ROLODEXDIR [SLUG]     # all pages, or one
#
# Every section is rewritten on each run except "## From the desk", which is yours: notes added
# with "note" on a card land there with the date and who wrote them, and anything you type into
# that section by hand is kept.
import datetime, glob, json, os, re, sys

crm_p, cards_d, out_d = sys.argv[1:4]
only = sys.argv[4] if len(sys.argv) > 4 else ""
try: d = json.load(open(crm_p))
except Exception: print("bad: no crm.json"); sys.exit(0)
os.makedirs(out_d, exist_ok=True)
norm = lambda x: re.sub(r"\s+", " ", re.sub(r"[^\w@.\s]", " ", (x or "").lower())).strip()
slug = lambda n: re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", norm(n))).strip("-")[:60] or "unknown"
cu = lambda i: "https://app.clickup.com/t/" + i
LV = {1: "active contract", 2: "lead", 3: "active proposal", 4: "partner"}

cards = {}
for f in glob.glob(os.path.join(cards_d, "*.json")):
    try: cards[os.path.basename(f)[:-5].replace("_", ":")] = json.load(open(f))
    except Exception: pass

# what the model knows per person: items that name them, and their card (any card about them)
by_person = {}
for it in d.get("items", []):
    names = [w.get("name", "") for w in it.get("who", [])]
    if it["kind"] in ("lead", "person"): names.append(it["title"])
    if it["kind"] == "mention": names.append(re.sub(r"\s*\(.*\)\s*$", "", it["title"]))
    for n in names:
        if n: by_person.setdefault(norm(n), []).append(it)

def card_for(name, rel_ids, con):
    keys = ["p:" + i for i in rel_ids] + (["p:" + con] if con else []) + rel_ids
    its = by_person.get(norm(name), [])
    # a person's own card first, then a card built from any row that names only them
    keys += [it["id"] for it in its if it["kind"] in ("lead", "person")]
    keys += [it["id"] for it in its if len(it.get("who", [])) == 1]
    for k in keys:
        if k in cards and not cards[k].get("error"): return cards[k]
    return None

def keep_desk(path):
    if not os.path.exists(path): return ""
    t = open(path, encoding="utf-8").read()
    m = re.search(r"^## From the desk\s*\n(.*?)(?=^## |\Z)", t, re.S | re.M)
    return (m.group(1).strip() if m else "")

n_written = 0
for r in d.get("roster", []):
    s = slug(r["n"])
    if only and s != only: continue
    path = os.path.join(out_d, s + ".md")
    its = by_person.get(norm(r["n"]), [])
    rel_ids, con = list(r.get("rel", [])), r.get("con", "")
    rel_ids += [i["id"] for i in its if i["kind"] == "lead" and i["id"] not in rel_ids]   # a lead row is its relationship
    c = card_for(r["n"], rel_ids, con)
    desk = keep_desk(path)
    L = ["---", f"name: {r['n']}", f"slug: {s}", f"companies: [{', '.join(r.get('c', []))}]"]
    if r.get("lv"): L.append(f"level: {LV.get(r['lv'], r['lv'])}")
    if r.get("email"): L.append(f"email: {r['email']}")
    if con: L.append(f"clickup_contact: {con}")
    if rel_ids: L.append(f"clickup_relationships: [{', '.join(rel_ids)}]")
    L += [f"updated: {datetime.date.today().isoformat()}", "---", "", f"# {r['n']}", ""]
    tags = [", ".join(r.get("c", [])) + " lane" if r.get("c") else "", LV.get(r.get("lv"), ""),
            ", ".join(r.get("roles", [])), ", ".join(r.get("pursuits", [])), r.get("heat", "")]
    L.append(" · ".join(t for t in tags if t) or "In the CRM")
    if c:
        L += ["", "## Where it stands"]
        for k, lab in (("who", ""), ("how_met", "How we met: "), ("going_on", ""), ("why_stopped", "Why it stopped: ")):
            if c.get(k): L.append(f"{lab}{c[k]}")
        if c.get("last_touch") or c.get("gap"):
            L.append("Last touch: " + " · ".join(x for x in (c.get("last_touch"), c.get("gap"), c.get("last_speaker") and "last word: " + c["last_speaker"]) if x))
        if c.get("promises_ours") or c.get("promises_theirs"):
            L += ["", "## Promises"] + [f"- We: {x}" for x in c.get("promises_ours", [])] + [f"- They: {x}" for x in c.get("promises_theirs", [])]
        if c.get("cautions"): L += ["", "## Cautions"] + [f"- {x}" for x in c["cautions"]]
        if c.get("next_step") or c.get("suggested"):
            L += ["", "## Next"] + ([c["next_step"]] if c.get("next_step") else []) + (["", "Suggested message:", "", c["suggested"]] if c.get("suggested") else [])
    fus = [i for i in its if i["kind"] in ("reply", "followup", "checkin", "result", "interest")]
    if fus:
        L += ["", "## Open in the CRM"]
        for i in fus:
            when = i.get("due") or i.get("resurface") or ""
            L.append(f"- [{i['title']}]({i['url']}) · {i['kind']}{' · ' + when if when else ''}{' · ' + i['owner'] if i.get('owner') else ''} · synced")
    pros = [i for i in its if i["kind"] in ("proposal", "contract", "partner")]
    if pros:
        L += ["", "## Linked"] + [f"- [{i['title']}]({i['url']}) · {i['kind']}" for i in pros if i.get("url")] + [f"- {i['title']} · {i['kind']}" for i in pros if not i.get("url")]
    ments = [i for i in its if i["kind"] == "mention"]
    if ments:
        L += ["", "## In meetings"] + [f"- {i.get('date','')} {i.get('meeting','')}{' (' + i['by'] + ')' if i.get('by') else ''}: {i.get('said','')} [transcript]({i['url']})" for i in ments]
    L += ["", "## ClickUp"]
    if con: L.append(f"- [Contact]({cu(con)}) · synced")
    for i in rel_ids: L.append(f"- [Company relationship]({cu(i)}) · synced")
    if not con and not rel_ids: L.append("- Not in ClickUp yet")
    if c and c.get("links"):
        L += ["", "## Sources"] + [f"- [{l.get('t','link')}]({l.get('u','')})" for l in c["links"] if l.get("u")]
    L += ["", "## From the desk", "", desk, ""]
    new = "\n".join(L).rstrip() + "\n"
    old = open(path, encoding="utf-8").read() if os.path.exists(path) else ""
    if re.sub(r"^updated: .*$", "", old, flags=re.M) != re.sub(r"^updated: .*$", "", new, flags=re.M):
        open(path, "w", encoding="utf-8").write(new); n_written += 1
print("ok %d pages written, %d people" % (n_written, len(d.get("roster", []))))
