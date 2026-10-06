#!/usr/bin/env python3
"""Install the widget for one teammate: copy src/desk-widget to their machine and fill in who they are.

    python3 tools/personalize.py config/me.json [DEST] [--force]

DEST defaults to ~/AI Tools/desk-widget. config/me.json starts as a copy of examples/me.example.json
(see docs/10-setup.md). Every {{PLACEHOLDER}} in the code is replaced from it. me.json itself is
copied beside the scripts, because the widget reads it at run time to light up its owner's work.

It never overwrites an existing install without --force, and even then it only replaces the files
that come from this repo: the owner's state folders (.crm, .flow, .watch, ...), TASKS.md, notes,
the Rolodex and every key or token are left alone.
"""
import json
import os
import re
import shutil
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(REPO, "src", "desk-widget")
EX = os.path.join(REPO, "examples")

args = [a for a in sys.argv[1:] if not a.startswith("--")]
force = "--force" in sys.argv
if not args:
    sys.exit(__doc__)
me = json.load(open(args[0]))
dest = os.path.expanduser(args[1] if len(args) > 1 else "~/AI Tools/desk-widget")

need = ["name", "full", "email", "slack", "clickup"]
missing = [k for k in need if not me.get(k)]
if missing:
    sys.exit("me.json is missing: " + ", ".join(missing))

values = {
    "OWNER_FULL": me["full"],
    "OWNER_FIRST": me["name"],
    "owner_first": me["name"].lower(),
    "OWNER_EMAIL": me["email"],
    "OWNER_SLACK_ID": me["slack"],
    "OWNER_CLICKUP_ID": me["clickup"],
    "OWNER_FOCUS_BOARD_URL": me.get("focusBoard") or "https://app.clickup.com/20115771/home",
    "HOME": os.path.expanduser("~"),
    "CRM_CC_EMAIL": me.get("crmCc") or me["email"],
    "AGENDA_POSTER_SLACK_ID": me.get("agendaPosterSlack") or me["slack"],
}

if os.path.exists(os.path.join(dest, "msbai-desk.widget")) and not force:
    sys.exit("%s already has a widget. Add --force to replace the code files (state is kept)." % dest)

left = set()
for root, dirs, files in os.walk(SRC):
    dirs[:] = [d for d in dirs if d != "__pycache__"]
    for f in files:
        if f == ".DS_Store" or f.endswith(".pyc"):
            continue
        sp = os.path.join(root, f)
        rel = os.path.relpath(sp, SRC)
        dp = os.path.join(dest, rel)
        os.makedirs(os.path.dirname(dp), exist_ok=True)
        text = open(sp, encoding="utf-8", errors="surrogateescape").read()
        text = re.sub(r"\{\{([A-Za-z_]+)\}\}", lambda m: values.get(m.group(1), m.group(0)), text)
        left.update(re.findall(r"\{\{[A-Za-z_]+\}\}", text))
        open(dp, "w", encoding="utf-8", errors="surrogateescape").write(text)
        shutil.copymode(sp, dp)

# me.json, plus starter copies of the owner's own lists (never overwritten once they exist)
json.dump(me, open(os.path.join(dest, "me.json"), "w"), indent=2)
for ex, name in [("team.example.tsv", "team.tsv"), ("crm-seed.example.tsv", "crm-seed.tsv"),
                 ("crm-exclude.example.txt", "crm-exclude.txt")]:
    if not os.path.exists(os.path.join(dest, name)):
        shutil.copy(os.path.join(EX, ex), os.path.join(dest, name))
for ex, name in [("TASKS.example.md", "TASKS.md"), ("CLAUDE.example.md", "CLAUDE.md")]:
    p = os.path.join(os.path.dirname(dest), name)
    if not os.path.exists(p):
        shutil.copy(os.path.join(EX, ex), p)

print("installed for %s at %s" % (me["full"], dest))
if left:
    print("placeholders still open: " + ", ".join(sorted(left)))
print("next: docs/10-setup.md, step 5 (Fireflies key) and step 6 (Übersicht link and launchd)")
