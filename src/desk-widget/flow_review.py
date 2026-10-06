#!/usr/bin/env python3
# flow_review.py: the Workstreams review. Meetings are read one at a time (flow.sh worker), and a
# single meeting rarely says "that stream is finished". This pass looks at the whole board at once,
# the way Ayesha runs the Monday and Friday AI meetings and the Tuesday to Thursday working
# sessions: what is the order of importance right now, what landed (the NASA check in was held, the
# proposal went in), what went quiet, what folded into something else, and what has been hiding
# inside a broad stream and deserves its own.
#
#   flow_review.py prompt FLOW CALENDAR_TSV STREAMS_TSV > prompt.md
#   flow_review.py apply  OUTPUT FLOW            # prints "ok <summary>" or "bad"
#
# Nothing is ever deleted: every status change is written into the stream's history with the date,
# who made it (meeting or review) and why, so a stream can always be traced and reopened.
import datetime, hashlib, json, os, re, sys

NOW = datetime.datetime.now().astimezone()
TODAY = NOW.date()
QUIET_DAYS = 10          # an active stream with no meeting in this long is flagged as quiet
SOON_DAYS = 14


def ts(x):
    try:
        return datetime.datetime.fromisoformat(str(x)).timestamp()
    except Exception:
        return 0


def day(x):
    try:
        return datetime.date.fromisoformat(str(x)[:10])
    except Exception:
        return None


def load(path):
    try:
        return json.load(open(path))
    except Exception:
        return {"streams": [], "nodes": []}


def facts(d):
    """What can be known without a model: quiet streams, targets passed, last meeting per stream."""
    out = {}
    for s in d.get("streams", []):
        mine = [n for n in d.get("nodes", []) if s["id"] in n.get("streams", [])]
        last = max([n["date"] for n in mine] or [""])
        ld = day(last)
        quiet = (TODAY - ld).days if ld else None
        td = day(s.get("target_date"))
        out[s["id"]] = {
            "meetings": len(mine), "last": last[:10], "quiet": quiet,
            "flag": ("target date passed %s" % s["target_date"] if td and td < TODAY and s.get("status") != "done" else "")
                    or ("quiet %d days" % quiet if quiet is not None and quiet >= QUIET_DAYS and s.get("status") == "active" else ""),
        }
    return out


def prompt(flow_path, cal_path, streams_path):
    d = load(flow_path)
    f = facts(d)
    p = []
    w = p.append
    w("Review the team's workstreams as a whole, unattended; nobody will answer. Today is %s." % NOW.strftime("%A %b %d %Y"))
    w("")
    w("The team (MSBAI: GURU, OrbitGuard, HPCMP CFD, NASA, BD; Tam Fortis Solutions: microreactors; Nexcavate:")
    w("PermitPulse; all led by Allan Grosvenor) drives 3 or 4 main streams at a time. Ayesha Dewan runs the")
    w("Monday and Friday AI team meetings and the Tuesday to Thursday morning working sessions from a focus")
    w("list: the items Allan wants, in his order. She often posts it in Slack before the meeting (for example")
    w("\"Friday AI team meeting prep: Allan asked for these three items on Friday's agenda, in this order\").")
    w("The order of importance shifts week to week (this week a NASA meeting might be first and the hypersonic")
    w("dive work second). Work often builds toward an event (a customer meeting, a submission, a demo); when")
    w("the event happens, that stream is done for now even if work returns later.")
    w("")
    w("1. Search Slack (slack_search_public_and_private) for Ayesha's agenda or prep posts from the last 10")
    w("   days: from:<@{{AGENDA_POSTER_SLACK_ID}}> with words like agenda, prep, priorities, focus, in this order. Read the")
    w("   newest one in full with slack_read_thread if it was cut off. If none, use what the meetings say.")
    w("2. Read the streams, the meetings and the calendar below, then decide, for every stream:")
    w("   active (being worked now), paused (on hold, focus moved away, or quiet with nothing coming), done")
    w("   (its target happened or its work is complete; say what landed), or merged (folded into another")
    w("   stream; give into). A paused or done stream that came back is active again. Change only what the")
    w("   evidence supports and cite it in why (the meeting date and title, or the Slack post).")
    w("3. Rank the active streams, most important first, the way Allan and Ayesha would order the agenda")
    w("   this week. Nearest hard deadline with Allan's attention first. Ranks move after meetings: what Allan")
    w("   said in the newest meeting outweighs an older agenda post, so a stream he pushed up today goes up.")
    w("   A new stream from step 4 is ranked by its name.")
    w("4. Look for real work hiding inside a broad stream (BizDev & Proposal Research Pipeline swallows a lot):")
    w("   a pursuit with its own deadline and people, or a technical effort Allan tracks by name, gets its")
    w("   own stream. Use a ClickUp list name from the list below when one fits. Name the meetings (node ids")
    w("   from the list below) that belong to it. Before adding one, check it is not already a stream under")
    w("   another name. When a stream's work is really another ClickUp list's work (the hypersonic dive")
    w("   convergence work is the SU2 Validation & Hypersonic Cases list, not Kestrel), give that list name in")
    w("   the update's clickup field and the stream takes that name.")
    w("5. Give every active stream a target (the event, submission or result it is building toward) and a")
    w("   target_date when one is known.")
    w("")
    w("Streams now (id | name | company | status | target | where it stands | meetings | last meeting | flag):")
    for s in d.get("streams", []):
        x = f[s["id"]]
        tgt = (s.get("target", "") + (" by " + s["target_date"] if s.get("target_date") else "")).strip()
        w("- %s | %s | %s | %s | %s | %s | %d | %s | %s" % (s["id"], s["name"], s.get("company", ""), s.get("status", "active"),
          tgt or "none", s.get("now", ""), x["meetings"], x["last"] or "never", x["flag"] or "-"))
    w("")
    w("Meetings in the last 21 days, oldest first (node id | date | meeting | streams | summary | done | next):")
    cut = NOW.timestamp() - 21 * 86400
    for n in sorted(d.get("nodes", []), key=lambda n: ts(n["date"])):
        if ts(n["date"]) < cut:
            continue
        nxt = "; ".join("%s: %s" % (x.get("who", ""), x.get("what", "")) for x in (n.get("next") or [])[:6])
        w("- %s | %s | %s | %s | %s | done: %s | next: %s" % (n["id"], n["date"][:16], n.get("meetingTitle") or n.get("title"),
          ",".join(n.get("streams", [])), n.get("summary", ""), "; ".join(n.get("done") or []), nxt))
    w("")
    w("Calendar, next %d days (date | title):" % SOON_DAYS)
    try:
        for line in open(cal_path, encoding="utf-8", errors="replace"):
            w("- " + line.strip())
    except Exception:
        w("- (not available)")
    w("")
    w("ClickUp workstream lists (program <TAB> list name):")
    try:
        for line in open(streams_path, encoding="utf-8"):
            parts = line.rstrip("\n").split("\t")
            if len(parts) >= 3:
                w(parts[1] + "\t" + parts[2])
    except Exception:
        pass
    w("")
    w("Answer with one JSON object between a line REVIEW_START and a line REVIEW_END, nothing else:")
    w('{"ranking": [{"id": "stream id", "why": "one line: why it sits here"}],')
    w(' "updates": [{"id": "...", "status": "active|paused|done|merged", "into": "for merged", "why": "evidence, one line",')
    w('              "target": "...", "target_date": "YYYY-MM-DD", "now": "...", "next": "...",')
    w('              "clickup": "only to move it to the ClickUp list its work belongs to"}],')
    w(' "new_streams": [{"name": "...", "clickup": "list name or empty", "company": "MSBAI|Tam Fortis|Nexcavate",')
    w('                  "from": "stream id it was hiding in, or empty", "nodes": ["node ids that belong to it"],')
    w('                  "now": "...", "next": "...", "target": "...", "target_date": "YYYY-MM-DD or empty"}],')
    w(' "board": [{"item": "a focus item as Ayesha or Allan put it", "stream": "stream id or empty"}],')
    w(' "board_source": "the Slack link of the agenda post, or the meeting it came from",')
    w(' "board_date": "YYYY-MM-DD the agenda was posted or said",')
    w(' "team_focus": "at most 16 words: what the whole team is driving this week, its top streams in order, not one person\'s tasks",')
    w(' "team_focus_why": "one line: who set it and when",')
    w(' "questions": ["anything a person should settle, for example two streams that might be one"]}')
    w("")
    w("Only list streams in updates when something changes. Keep about 6 active streams at most. Never invent")
    w("anything; when unsure, leave the stream as it is and add a question. Plain language a high schooler")
    w("could follow. No em dashes, en dashes or connector hyphens. Write GURU in all caps.")
    w("If a tool result was saved to a file because it was large, open it with Read.")
    print("\n".join(p))


PALETTE = ["#0A84FF", "#FF9F0A", "#30D158", "#BF5AF2", "#FF375F", "#64D2FF", "#FFD60A", "#AC8E68", "#5E5CE6", "#66D4CF"]


def list_names(streams_path):
    out = {}
    try:
        for line in open(streams_path, encoding="utf-8"):
            f = line.rstrip("\n").split("\t")
            if len(f) >= 3 and f[0].isdigit():
                out[re.sub(r"[^a-z0-9]+", " ", f[2].lower()).strip()] = f[2]
    except Exception:
        pass
    return out


def apply(out_path, flow_path, streams_path=""):
    names = list_names(streams_path) if streams_path else {}
    raw = open(out_path, encoding="utf-8", errors="replace").read()
    m = re.search(r"^REVIEW_START\s*$(.*?)^REVIEW_END\s*$", raw, re.S | re.M)
    body = m.group(1) if m else raw
    p = None
    for k in [i for i, ch in enumerate(body) if ch == "{"][:20]:
        try:
            p, _ = json.JSONDecoder(strict=False).raw_decode(body[k:])
            break
        except Exception:
            continue
    if not isinstance(p, dict) or not any(k in p for k in ("ranking", "updates", "new_streams", "board")):
        print("bad")
        return
    d = load(flow_path)
    when = NOW.isoformat()
    by = {s["id"]: s for s in d["streams"]}
    nodes = {n["id"]: n for n in d["nodes"]}
    changes = []

    def hist(s, frm, to, why):
        s.setdefault("history", []).append({"date": when, "from": frm, "to": to, "why": why, "by": "review"})

    # new streams first, so updates and ranking can name them (by id, or by the new stream's name)
    created = {}
    for ns in p.get("new_streams") or []:
        name = str(ns.get("name") or "").strip()
        if not name:
            continue
        twin = next((s for s in d["streams"] if name.lower() == s["name"].lower()
                     or (s.get("status") != "done" and same_work(name, s["name"]))), None)
        if twin:                                       # already there under this or a close name: never a duplicate
            created[norm(name)] = twin["id"]
            continue
        b = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40].strip("-") or "stream"
        sid, k = b, 2
        while sid in by:
            sid, k = "%s-%d" % (b, k), k + 1
        used = {s.get("color") for s in d["streams"] if s.get("status") != "done"}
        color = next((c for c in PALETTE if c not in used), PALETTE[len(d["streams"]) % len(PALETTE)])
        claimed = sorted([nodes[i] for i in (ns.get("nodes") or []) if i in nodes], key=lambda n: ts(n["date"]))
        src = ns.get("from") if ns.get("from") in by else ""
        for n in claimed:
            if sid not in n["streams"]:
                n["streams"].append(sid)
            if src and src in n["streams"] and len(n["streams"]) > 1:
                n["streams"].remove(src)               # it was hiding there; now it has its own lane
        s = {"id": sid, "name": name, "clickup": ns.get("clickup") or "", "company": ns.get("company") or "",
             "color": color, "status": "active", "bornFrom": claimed[0]["id"] if claimed else "",
             "parent": src, "now": ns.get("now") or "", "next": ns.get("next") or "",
             "target": ns.get("target") or "", "target_date": ns.get("target_date") or "", "history": []}
        hist(s, "", "active", "split out of %s, %d meeting(s)" % (by[src]["name"], len(claimed)) if src else "started by review")
        d["streams"].append(s)
        by[sid] = s
        created[norm(name)] = sid
        changes.append("new: " + name)

    for u in p.get("updates") or []:
        s = by.get(u.get("id"))
        if not s:
            continue
        for k in ("now", "next", "target", "target_date"):
            if u.get(k):
                s[k] = u[k]
        # filed under the wrong ClickUp list (the hypersonic dive was under Kestrel): it takes the right list's name
        to = names.get(norm(u.get("clickup")))
        if to and norm(to) != norm(s["name"]) and not any(norm(x["name"]) == norm(to) for x in d["streams"] if x is not s):
            hist(s, s.get("status", "active"), s.get("status", "active"), "renamed from %s to match its ClickUp list" % s["name"])
            changes.append("%s renamed to %s" % (s["name"], to))
            s["name"], s["clickup"] = to, to
        st, prev = u.get("status"), s.get("status", "active")
        why = str(u.get("why") or "").strip()
        if st not in ("active", "paused", "done", "merged") or not why:
            continue                                   # no status change without a reason
        if st == "merged":
            if u.get("into") not in by or u["into"] == s["id"] or (s.get("ended") == "merged" and s.get("mergedInto") == u["into"]):
                continue
            s.update(status="done", ended="merged", mergedInto=u["into"], why=why)
            s["endNode"] = max(((n["id"], ts(n["date"])) for n in d["nodes"] if s["id"] in n["streams"]), key=lambda x: x[1], default=("", 0))[0]
        elif st == "done":
            if prev == "done":
                continue
            s.update(status="done", ended="done", why=why)
            s["endNode"] = max(((n["id"], ts(n["date"])) for n in d["nodes"] if s["id"] in n["streams"]), key=lambda x: x[1], default=("", 0))[0]
        else:
            s["status"] = st
            if prev == "done":
                for k in ("endNode", "ended", "mergedInto"):
                    s.pop(k, None)
        if s["status"] != prev or st == "merged":
            hist(s, prev, "merged" if st == "merged" else s["status"], why)
            changes.append("%s: %s to %s" % (s["name"], prev, "merged" if st == "merged" else s["status"]))

    rid = lambda x: x if x in by else created.get(norm(x), next((s["id"] for s in d["streams"] if norm(s["name"]) == norm(x)), x))
    ranked = [rid(r.get("id") if isinstance(r, dict) else r) for r in (p.get("ranking") or [])]
    why = {rid(r.get("id")): r.get("why", "") for r in (p.get("ranking") or []) if isinstance(r, dict)}
    order = [i for i in ranked if i in by and by[i].get("status") == "active"]
    # rank moves are kept (ranks: the last 20) so a stream jumping to 1 or 2 after a meeting is seen
    first = not d.get("review")
    last = max(d.get("nodes") or [{"date": "", "meetingTitle": ""}], key=lambda n: ts(n.get("date")))
    after = "after %s, %s" % (last.get("meetingTitle") or last.get("title") or "the last meeting", str(last.get("date"))[:10])
    moves = []
    for s in d["streams"]:
        old = s.get("rank")
        new = order.index(s["id"]) + 1 if s["id"] in order else None
        if new:
            s["rank"], s["rankWhy"] = new, why.get(s["id"], "")
        else:
            s.pop("rank", None)
            s.pop("rankWhy", None)
        if old != new:
            s["ranks"] = (s.get("ranks") or [])[-19:] + [{"date": when, "from": old, "to": new, "after": after}]
            if not first:
                s["moved"] = {"date": when, "from": old, "to": new, "after": after}
                moves.append({"id": s["id"], "name": s["name"], "from": old, "to": new})
    moves.sort(key=lambda m: m["to"] or 99)
    for m in moves:
        changes.append("%s: rank %s to %s" % (m["name"], m["from"] or "none", m["to"] or "none"))

    board = [b for b in (p.get("board") or []) if isinstance(b, dict) and b.get("item")]
    if board:
        d["board"] = {"date": when, "source": p.get("board_source") or "", "posted": str(p.get("board_date") or "")[:10],
                      "items": [{"item": b["item"], "stream": b.get("stream") if b.get("stream") in by else ""} for b in board[:8]]}
    f = facts(d)
    for s in d["streams"]:
        s["flag"] = f[s["id"]]["flag"]
    if str(p.get("team_focus") or "").strip():
        d["teamFocus"], d["teamFocusWhy"] = str(p["team_focus"]).strip(), str(p.get("team_focus_why") or "").strip()
        d["focus"], d["focusWhy"], d["focusSet"] = d["teamFocus"], d["teamFocusWhy"], when   # the shared page reads focus
    d["review"] = {"date": when, "after": after, "changes": changes, "moves": moves,
                   "questions": [q for q in (p.get("questions") or []) if isinstance(q, str)][:6]}
    tmp = flow_path + ".tmp"
    json.dump(d, open(tmp, "w"), indent=1)
    os.replace(tmp, flow_path)
    # the moves that matter enough for a notification: into the top two, or out of first
    top = [m for m in moves if (m["to"] and m["to"] <= 2 and (not m["from"] or m["from"] > m["to"])) or m["from"] == 1]
    with open(os.path.join(os.path.dirname(flow_path), "review-moves.txt"), "w") as fh:
        for m in top:
            fh.write("%s %s\n" % (m["name"], "is now #%d (was %s)" % (m["to"], "#%d" % m["from"] if m["from"] else "unranked") if m["to"]
                                  else "dropped from #1"))
    print("ok " + ("; ".join(changes) or "no status changes") + " | ranked " + ",".join(order))


# ── ClickUp: the board doc, each stream's list, and lists for streams that have none ──
# What changed since the last push is worked out here, so a run with nothing new costs no calls.
SPACE = "90114201246"                                   # Goals & Workstreams
FOLDER = {"MSBAI": "90118135058", "Tam Fortis": "90118135097", "Nexcavate": "90118135098"}
PROGRAM = {"90118135058": "MSBAI · Cross-Cutting", "90118135097": "Tam Fortis", "90118135098": "Nexcavate"}
MARK = "Workstream status (from the desk review"
norm = lambda x: re.sub(r"[^a-z0-9]+", " ", str(x or "").lower()).strip()


def lists_of(streams_path):
    out = {}
    try:
        for line in open(streams_path, encoding="utf-8"):
            f = line.rstrip("\n").split("\t")
            if len(f) >= 3 and f[0].isdigit():
                out[norm(f[2])] = f[0]
    except Exception:
        pass
    return out


def nice(x):
    dd = day(x)
    return dd.strftime("%b %-d") if dd else ""


def block(s, n_active, when):
    st = {"active": "Active", "paused": "Paused", "done": "Merged" if s.get("ended") == "merged" else "Done"}.get(s.get("status"), "Active")
    parts = [("Rank %d of %d" % (s["rank"], n_active)) if s.get("rank") else "Not ranked"]
    parts.append(st)
    if s.get("target"):
        parts.append("Building toward: %s%s" % (s["target"], " by " + nice(s["target_date"]) if s.get("target_date") else ""))
    if s.get("status") == "done" and s.get("why"):
        parts.append("Why: " + s["why"])
    return "%s, %s): %s" % (MARK, nice(when) or when[:10], " | ".join(parts))


STOP = {"proposal", "proposals", "challenge", "pursuit", "research", "platform", "outreach", "integration", "training",
        "operations", "validation", "quality", "dataset", "program", "customer", "demos", "submission", "workstream",
        "pipeline", "architecture", "detection", "anomaly", "publications", "fundraising", "investor", "readiness"}


def same_work(a, b):
    """Two stream names that name the same work: a shared distinctive word (ApexGlide, Supersonics, OrbitGuard)."""
    ta = {w for w in re.findall(r"[a-z0-9]+", str(a).lower()) if len(w) >= 6 and w not in STOP}
    tb = {w for w in re.findall(r"[a-z0-9]+", str(b).lower()) if len(w) >= 6 and w not in STOP}
    return bool(ta & tb)


def owners(d, lists):
    """Which stream speaks for each ClickUp list: only the stream named after it. A stream merely filed
    under a broader list (a pursuit inside BizDev or Monthly Submissions) never writes on that list."""
    own = {}
    for s in d.get("streams", []):
        lid = lists.get(norm(s["name"]))
        if lid:
            own[lid] = s["id"]
    return own


def board_md(d):
    when = (d.get("review") or {}).get("date") or NOW.isoformat()
    streams = d.get("streams", [])
    act = sorted([s for s in streams if s.get("status") == "active"], key=lambda s: s.get("rank") or 99)
    w = ["# Workstream Board", "",
         "Updated %s by the desk review%s. Ranked in this week's order of importance. Written by the desk widget from the team's meetings; the team and OpenClaw read it." % (
             nice(when), " (%s)" % d["review"]["after"] if (d.get("review") or {}).get("after") else ""), ""]
    w += ["## Active, in order", "", "| # | Stream | Building toward | By | Moved | Why it sits here |", "|---|---|---|---|---|---|"]
    for s in act:
        mv = s.get("moved") or {}
        moved = ("from %s, %s" % ("#%d" % mv["from"] if mv.get("from") else "new", nice(mv.get("date")))) if mv and mv.get("to") == s.get("rank") else ""
        why = (s.get("rankWhy") or ("Active, not ranked this week. " + (s.get("now") or ""))).replace("|", "/").replace("\n", " ")
        w.append("| %s | %s | %s | %s | %s | %s |" % (s.get("rank") or "", s["name"], s.get("target") or "", nice(s.get("target_date")), moved,
                                                        why[:200] + ("..." if len(why) > 200 else "")))
    pz = [s for s in streams if s.get("status") == "paused"]
    if pz:
        w += ["", "## Paused", ""] + ["- %s: %s" % (s["name"], ((s.get("history") or [{}])[-1].get("why") or s.get("now") or "")) for s in pz]
    cut = NOW.timestamp() - 30 * 86400
    fin = [s for s in streams if s.get("status") == "done" and any(ts(h.get("date")) >= cut for h in s.get("history") or [])]
    if fin:
        w += ["", "## Finished or merged, last 30 days", ""]
        for s in fin:
            into = next((x["name"] for x in streams if x["id"] == s.get("mergedInto")), "")
            w.append("- %s, %s: %s" % (s["name"], nice((s.get("history") or [{}])[-1].get("date")),
                                       ("merged into %s. " % into if into else "") + (s.get("why") or "")))
    mv = sorted([(r, s) for s in streams for r in (s.get("ranks") or []) if ts(r.get("date")) >= NOW.timestamp() - 14 * 86400],
                key=lambda x: ts(x[0]["date"]), reverse=True)
    if mv:
        w += ["", "## Rank moves, last 14 days", ""]
        for r, s in mv[:20]:
            w.append("- %s: %s %s to %s (%s)" % (nice(r["date"]), s["name"], "#%d" % r["from"] if r.get("from") else "unranked",
                                                 "#%d" % r["to"] if r.get("to") else "unranked", r.get("after", "")))
    w += ["", "## For OpenClaw", "",
          "- File new tasks into the ClickUp list of the stream they move. Each list's description starts with its current rank and status.",
          "- Order meeting briefs and follow ups by the rank above. Rank 1 and 2 come first.",
          "- A task for a paused, done or merged stream still gets filed, but say so in the task so the team can decide whether the stream is back.",
          "- Do not edit this page; the desk review rewrites it after the team's meetings."]
    return "\n".join(w)


def cuplan(flow_path, streams_path, pushed_path, out_dir):
    d = load(flow_path)
    try:
        pushed = json.load(open(pushed_path))
    except Exception:
        pushed = {}
    lists = lists_of(streams_path)
    when = (d.get("review") or {}).get("date") or NOW.isoformat()
    n_active = sum(1 for s in d.get("streams", []) if s.get("status") == "active" and s.get("rank"))
    ups, creates = [], []
    own = owners(d, lists)
    mine = {v: k for k, v in own.items()}
    for s in d.get("streams", []):
        lid = mine.get(s["id"])
        sig = json.dumps([s.get("rank"), s.get("status"), s.get("ended"), s.get("target"), s.get("target_date")])
        if lid:
            if (pushed.get("lists") or {}).get(lid) != sig:
                ups.append({"list": lid, "name": s["name"], "block": block(s, n_active, when), "sig": sig})
        elif s.get("status") == "active" and s.get("rank") and s["id"] not in (pushed.get("asked") or []) and len(creates) < 2:
            creates.append({"stream": s["id"], "name": s["name"], "folder": FOLDER.get(s.get("company"), FOLDER["MSBAI"]),
                            "block": block(s, n_active, when)})
    md = board_md(d)
    doc_new = hashlib.sha1(md.split("\n", 3)[-1].encode()).hexdigest() != pushed.get("board")
    if not (ups or creates or doc_new):
        print("nothing")
        return
    json.dump({"ups": ups, "creates": creates, "board": hashlib.sha1(md.split("\n", 3)[-1].encode()).hexdigest() if doc_new else ""},
              open(os.path.join(out_dir, "cu-plan.json"), "w"))
    open(os.path.join(out_dir, "cu-board.md"), "w").write(md)
    p = ["Update ClickUp for the team's workstreams, unattended; nobody will answer. Workspace 20115771.",
         "Never delete, archive, move or rename anything, never touch a task, and change nothing beyond the steps below.",
         "If a tool result was saved to a file because it was large, open it with Read.", ""]
    k = 1
    if doc_new:
        doc = pushed.get("doc") or {}
        p.append("%d. The board page. Read the file %s; its whole text is the page content (markdown)." % (k, os.path.join(out_dir, "cu-board.md")))
        if doc.get("doc") and doc.get("page"):
            p.append("   Call clickup_update_document_page with document_id %s, page_id %s, content_edit_mode replace, that content." % (doc["doc"], doc["page"]))
        else:
            p.append("   First call clickup_search for a doc named \"Workstream Board\" in space %s; if one exists use it." % SPACE)
            p.append("   Otherwise call clickup_create_document with name \"Workstream Board\", parent {id: \"%s\", type: \"4\"}, visibility PUBLIC," % SPACE)
            p.append("   create_page true. Find its page with clickup_list_document_pages, then call clickup_update_document_page with")
            p.append("   content_edit_mode replace, the page name \"Workstream Board\" and that content.")
        p.append("   Print a line: DOC <document_id> <page_id>")
        k += 1
    if ups:
        p.append("%d. For each list below: call clickup_get_list to read its current content (description). Make the new content:" % k)
        p.append("   the status line given, a blank line, then the old content exactly as it was, except drop any earlier paragraph")
        p.append("   that starts with \"%s\" (up to the first blank line after it). Call clickup_update_list with" % MARK)
        p.append("   list_id and that content only. Print a line: LIST <list_id> ok, or LIST <list_id> failed <why>.")
        for u in ups:
            p.append("   - list %s (%s): %s" % (u["list"], u["name"], u["block"]))
        k += 1
    if creates:
        p.append("%d. These active streams have no ClickUp list yet. For each: call clickup_get_folder for the folder and look" % k)
        p.append("   at its lists. If a list clearly covers this work (same pursuit, even if named differently), print")
        p.append("   FOUND <list_id> <its exact name>, and do not create one. Otherwise call clickup_create_list_in_folder with")
        p.append("   that folder_id, the stream name as the list name, and the status line as content, then print")
        p.append("   CREATED <list_id> <name>.")
        for c in creates:
            p.append("   - stream %s, name \"%s\", folder %s: %s" % (c["stream"], c["name"], c["folder"], c["block"]))
    p += ["", "Then print a line CU_END and nothing else after it."]
    print("\n".join(p))


def cuapply(out_path, flow_path, streams_path, pushed_path, out_dir):
    raw = open(out_path, encoding="utf-8", errors="replace").read()
    try:
        plan = json.load(open(os.path.join(out_dir, "cu-plan.json")))
        pushed = json.load(open(pushed_path)) if os.path.exists(pushed_path) else {}
    except Exception:
        print("bad")
        return
    pushed.setdefault("lists", {})
    pushed.setdefault("asked", [])
    done = []
    m = re.search(r"^DOC\s+(\S+)\s+(\S+)\s*$", raw, re.M)
    if m and plan.get("board"):
        pushed["doc"] = {"doc": m.group(1), "page": m.group(2)}
        pushed["board"] = plan["board"]
        done.append("board")
    for u in plan.get("ups", []):
        if re.search(r"^LIST\s+%s\s+ok\b" % re.escape(u["list"]), raw, re.M):
            pushed["lists"][u["list"]] = u["sig"]
            done.append(u["name"])
    d = load(flow_path)
    by = {s["id"]: s for s in d.get("streams", [])}
    known = lists_of(streams_path)
    found = list(re.finditer(r"^`?(CREATED|FOUND)\s+(\d+)\s+(.+?)`?\s*$", raw, re.M))   # in the order the streams were given
    for i, c in enumerate(plan.get("creates", [])):
        mm = found[i] if i < len(found) else None
        if (mm or "CU_END" in raw) and c["stream"] not in pushed["asked"]:
            pushed["asked"].append(c["stream"])             # a finished run never asks about the same stream twice
        if not mm:
            continue
        lid, name = mm.group(2), mm.group(3).strip().strip('"')
        if norm(name) not in known:
            with open(streams_path, "a", encoding="utf-8") as fh:
                fh.write("%s\t%s\t%s\n" % (lid, PROGRAM.get(c["folder"], "MSBAI · Cross-Cutting"), name))
            known[norm(name)] = lid
        if c["stream"] in by:                          # stream names follow ClickUp list names, so links never break
            s = by[c["stream"]]
            if norm(s["name"]) != norm(name):
                s.setdefault("history", []).append({"date": NOW.isoformat(), "from": s.get("status"), "to": s.get("status"),
                                                    "why": "renamed from %s to match its ClickUp list" % s["name"], "by": "clickup"})
                s["name"] = name
            s["clickup"] = name
        done.append("%s %s" % (mm.group(1).lower(), name))
    tmp = flow_path + ".tmp"
    json.dump(d, open(tmp, "w"), indent=1)
    os.replace(tmp, flow_path)
    pushed["updated"] = NOW.isoformat()
    json.dump(pushed, open(pushed_path, "w"), indent=1)
    print("ok " + (", ".join(done) or "nothing confirmed"))


if __name__ == "__main__":
    if sys.argv[1] == "prompt":
        prompt(*sys.argv[2:5])
    elif sys.argv[1] == "apply":
        apply(*sys.argv[2:5])
    elif sys.argv[1] == "cuplan":
        cuplan(*sys.argv[2:6])
    elif sys.argv[1] == "cuapply":
        cuapply(*sys.argv[2:7])
