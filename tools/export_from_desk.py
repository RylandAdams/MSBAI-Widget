#!/usr/bin/env python3
"""Refresh src/desk-widget from a live desk widget folder, with the owner's personal values taken out.

    python3 tools/export_from_desk.py [SOURCE]      # SOURCE defaults to ~/AI Tools/desk-widget

What it does, in order:
  1. Copies only the files on the ALLOW list below (overwriting; it never deletes). State folders (.crm, .flow, .watch, ...), keys,
     tokens, the Rolodex pages, contact lists, backups and vendor packs are never copied.
  2. Replaces the owner's name, email, Slack id, ClickUp id, home folder and Focus Board link with
     {{PLACEHOLDERS}}. tools/personalize.py puts a teammate's own values back at install time.
  3. Makes sure the owner's Fireflies key does not appear anywhere in the output (the key is read
     on this machine only to check for it; it is never printed or written).
  4. Runs tools/leak_check.py over the whole repo and stops with an error if it finds anything.

Run it from the repo root on the machine that has the live widget, then review `git diff` before
committing. It only writes inside this repo.
"""
import os
import re
import shutil
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.expanduser(sys.argv[1]) if len(sys.argv) > 1 else os.path.expanduser("~/AI Tools/desk-widget")
DEST = os.path.join(REPO, "src", "desk-widget")

# Framework files only. Anything not named here stays on the owner's machine.
ALLOW = [
    "msbai-desk.widget/index.jsx",
    # tasks and the ClickUp mirror
    "tasks-sync.sh", "tasks-sync.md", "clickup-sync.sh", "clickup-sync.md", "cu_limit.zsh",
    "com.msbai.tasks-sync.plist",
    # workstreams
    "flow.sh", "flow_review.py", "mine.sh", "streams.tsv",
    # CRM, Rolodex, inbox
    "crm.sh", "crm_build.py", "crm_merge.py", "crm_pages.py", "crm_watch.py", "emails.sh",
    # wiki
    "wiki.sh", "wiki_build.py", "wiki_v2.py", "wiki.json",
    # notify, prep, calls, commands
    "watch.sh", "prep.sh", "zoom.sh", "cmd.sh", "team.sh",
    # desk plumbing
    "cal.sh", "gcal.sh", "gcal.py", "dock.sh", "notes.sh", "fireflies.sh", "voice.sh", "listen.swift",
    "openclaw-cmd",
]

# Files whose text is company content (the wiki), where a person's name is a page owner, not the
# widget's owner. Only ids, emails and paths are replaced in these.
CONTENT_ONLY = {"wiki_build.py", "wiki_v2.py", "wiki.json"}

# Order matters: the longest and most specific patterns go first.
PROTECT = [
    # Fireflies mishears the owner's name; the team wide name fix keeps the real name it maps to.
    (re.compile(r"(Ryan Wilson is(?:\"\s*\n\s*print -r -- \")?\s*)Ryland Adams"), r"\1@@TEAMNAME@@"),
    (re.compile(r"(\"Ryan Wilson\" → )Ryland Adams"), r"\1@@TEAMNAME@@"),
]
SUBS = [
    (re.compile(r"https://app\.clickup\.com/20115771/v/l/k5w9v-55351"), "{{OWNER_FOCUS_BOARD_URL}}"),
    (re.compile(r"ryland\.adams@microsurgeonbot\.com"), "{{OWNER_EMAIL}}"),
    (re.compile(r"ayesha\.dewan@microsurgeonbot\.com"), "{{CRM_CC_EMAIL}}"),
    (re.compile(r"/Users/ryland"), "{{HOME}}"),
    (re.compile(r"U01RGF1301F"), "{{OWNER_SLACK_ID}}"),
    (re.compile(r"U05T2GKMRTJ"), "{{AGENDA_POSTER_SLACK_ID}}"),
    (re.compile(r"U0B01SFHYRH"), "U0XXXXXXXXX"),
    (re.compile(r"\b75474330\b"), "{{OWNER_CLICKUP_ID}}"),
    (re.compile(r"Ryland Adams"), "{{OWNER_FULL}}"),
    (re.compile(r"\bRyland\b"), "{{OWNER_FIRST}}"),
    (re.compile(r"\bryland\b"), "{{owner_first}}"),
]
CONTENT_SUBS = [s for s in SUBS if s[1] in ("{{OWNER_EMAIL}}", "{{CRM_CC_EMAIL}}", "{{HOME}}", "{{OWNER_SLACK_ID}}",
                                             "{{OWNER_CLICKUP_ID}}", "{{OWNER_FOCUS_BOARD_URL}}")]


def scrub(name, text):
    for rx, rep in PROTECT:
        text = rx.sub(rep, text)
    for rx, rep in (CONTENT_SUBS if os.path.basename(name) in CONTENT_ONLY else SUBS):
        text = rx.sub(rep, text)
    return text.replace("@@TEAMNAME@@", "Ryland Adams")


def main():
    if not os.path.isdir(SRC):
        sys.exit("no desk widget folder at %s" % SRC)
    key = ""
    kp = os.path.join(SRC, ".fireflies-key")
    if os.path.isfile(kp):
        key = open(kp).read().strip()
    # Files are overwritten in place; nothing is deleted. A file left in src/ that is no longer on
    # the allow list is reported, so a person can remove it with git rm.
    stale = []
    if os.path.isdir(DEST):
        for root, _, files in os.walk(DEST):
            for f in files:
                rel = os.path.relpath(os.path.join(root, f), DEST)
                if rel not in ALLOW:
                    stale.append(rel)
    copied, missing = [], []
    for rel in ALLOW:
        sp = os.path.join(SRC, rel)
        if not os.path.isfile(sp):
            missing.append(rel)
            continue
        dp = os.path.join(DEST, rel)
        os.makedirs(os.path.dirname(dp), exist_ok=True)
        text = open(sp, encoding="utf-8", errors="surrogateescape").read()
        text = scrub(rel, text)
        if key and key in text:
            sys.exit("STOP: the Fireflies key was found in %s; nothing was committed" % rel)
        open(dp, "w", encoding="utf-8", errors="surrogateescape").write(text)
        shutil.copymode(sp, dp)
        copied.append(rel)
    print("copied %d files into src/desk-widget" % len(copied))
    if missing:
        print("not found (skipped): " + ", ".join(missing))
    if stale:
        print("in src/ but not on the allow list (git rm them): " + ", ".join(stale))
    rc = subprocess.call([sys.executable, os.path.join(REPO, "tools", "leak_check.py"), REPO])
    if rc:
        sys.exit("leak check failed: fix the export rules above before committing")


if __name__ == "__main__":
    main()
