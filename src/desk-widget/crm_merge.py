#!/usr/bin/env python3
# crm_merge.py: keeps the CRM sync inside ClickUp's daily call limit. The sync runs in two passes:
# a list pass (one call per list or group, with each task's date_updated) and a detail pass that
# calls clickup_get_task only for Follow-ups, Interested Later and Proposals that are new or changed
# since the last time. Detail lines are cached in .crm/fields.json, keyed by task id and date_updated.
#
#   python3 crm_merge.py need  LISTOUT CACHE MAX      -> lines "kind<TAB>id" still needing detail (at most MAX)
#   python3 crm_merge.py merge LISTOUT CACHE DETAILOUT OUTPUT
#                                                     -> caches the new detail lines, writes the CRM_START block
#
# List pass lines:  FL / IL / PL <TAB> id <TAB> date_updated <TAB> name <TAB> status <TAB> assignees <TAB> due <TAB> url
#                   W, O and G lines exactly as crm_build.py reads them.
# Detail pass lines: F, I and P lines exactly as crm_build.py reads them.
import json, os, re, sys

def block(path, a="CRM_START", b="CRM_END"):
    raw = open(path, encoding="utf-8", errors="replace").read() if os.path.exists(path) else ""
    m = re.search(r"^\s*%s\s*$(.*?)^\s*%s\s*$" % (a, b), raw, re.S | re.M)
    return None if not m else [l.strip("\r\n ").split("\t") for l in m.group(1).splitlines() if "\t" in l]

def load(p):
    try: return json.load(open(p))
    except Exception: return {}

mode = sys.argv[1]
lst = block(sys.argv[2])
if lst is None: print("bad: no list block"); sys.exit(0)
cache = load(sys.argv[3])
listed = [(r[0][0], r[1].strip(), r[2].strip(), r) for r in lst if r[0] in ("FL", "IL", "PL") and len(r) >= 3]

if mode == "need":
    cap = int(sys.argv[4])
    need = [(k, i) for k, i, upd, _ in listed if (cache.get(i) or {}).get("upd") != upd]
    for k, i in need[:cap]: print(k + "\t" + i)
    sys.exit(0)

det = block(sys.argv[4], "DETAIL_START", "DETAIL_END") or []
upd_of = {i: upd for _, i, upd, _ in listed}
for r in det:
    if r[0] in ("F", "I", "P") and len(r) > 2 and r[1].strip() in upd_of:
        cache[r[1].strip()] = {"upd": upd_of[r[1].strip()], "line": "\t".join(r)}
listed_ids = set(upd_of)
cache = {k: v for k, v in cache.items() if k in listed_ids}          # closed tasks drop out
tmp = sys.argv[3] + ".tmp"; json.dump(cache, open(tmp, "w")); os.replace(tmp, sys.argv[3])

# the last good output: a task waiting for detail keeps its previous full line rather than a stub
prev = {r[1].strip(): "\t".join(r) for r in (block(sys.argv[5]) or []) if r[0] in ("F", "I", "P") and len(r) > 2}
out, fresh, stale = ["CRM_START"], 0, 0
for k, i, upd, r in listed:
    c = cache.get(i)
    if c:
        out.append(c["line"]); fresh += c["upd"] == upd; stale += c["upd"] != upd
        continue
    if i in prev:
        out.append(prev[i]); continue
    f = r + [""] * 9
    name, status, who, due, url = f[3], f[4], f[5], f[6], f[7]
    if k == "F": out.append("\t".join(["F", i, name, who, due, "-", "-", "-", "-", "-", "-", "-", url]))
    elif k == "I": out.append("\t".join(["I", i, name, "-", "-", "-", "-", "-", "-", "-", url]))
    else: out.append("\t".join(["P", i, name, status, who, due, "-", "-", "-", "-", "-", "-", url]))
for r in lst:
    if r[0] in ("W", "O", "G"): out.append("\t".join(r))
out.append("CRM_END")
open(sys.argv[5], "w").write("\n".join(out) + "\n")
print("ok %d detailed, %d waiting for detail" % (sum(1 for _, i, _, _ in listed if i in cache), sum(1 for _, i, _, _ in listed if i not in cache)))
