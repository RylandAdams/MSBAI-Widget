#!/usr/bin/env python3
"""Fail if the repo holds anything personal or secret. Run before every commit.

    python3 tools/leak_check.py [REPO]

Checks every text file except .git:
  * secrets: API keys and tokens (Slack, OpenAI, Anthropic, GitHub, Google OAuth), private keys,
    and any file named like a key or token
  * personal ids of the person who exported the code: their Slack id, ClickUp member id, email and
    home folder (they must be {{PLACEHOLDERS}} in src/)
  * email addresses, except placeholders, example.com and the Fireflies notetaker addresses
  * state that must never be published: TASKS.md, transcripts, rolodex pages, .crm/.flow/.watch
    folders, practice emails

The owner's first name is allowed in two places only: the wiki content (where a person is a page
owner) and the team wide Fireflies name fix ("Ryan Wilson is Ryland Adams").
"""
import os
import re
import sys

REPO = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SECRET = [
    (r"xox[abposr]-[A-Za-z0-9-]{10,}", "Slack token"),
    (r"\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}", "API key"),
    (r"\bgh[pousr]_[A-Za-z0-9]{30,}", "GitHub token"),
    (r"\bya29\.[A-Za-z0-9_-]{20,}", "Google access token"),
    (r"\b1//0[A-Za-z0-9_-]{20,}", "Google refresh token"),
    (r"-----BEGIN [A-Z ]*PRIVATE KEY-----", "private key"),
    (r"\"client_secret\"\s*:\s*\"[^\"]{8,}\"", "OAuth client secret"),
    (r"\bpk_(?:live|test)_[A-Za-z0-9]{20,}|\bsk_(?:live|test)_[A-Za-z0-9]{20,}", "Clerk/Stripe key"),
]
PERSONAL = [
    (r"U01RGF1301F", "owner Slack id"),
    (r"\b75474330\b", "owner ClickUp id"),
    (r"ryland\.adams@", "owner email"),
    (r"/Users/[a-z]+", "home folder path"),
]
BANNED_FILES = re.compile(r"(^|/)(TASKS\.md|\.fireflies-key|\.gcal-(client|token)\.json|practice\.tsv|crm\.json|"
                          r"alerts\.json|outbox\.jsonl|mentions\.tsv|me\.json|team\.tsv|crm-seed\.tsv|crm-exclude\.txt)$|"
                          r"(^|/)(rolodex|transcripts|\.crm|\.flow|\.watch|\.emails|\.prep|\.zoom|\.wiki|\.tasks-sync|backups|vendor)/")
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[a-z]{2,}")
EMAIL_OK = re.compile(r"(@example\.com$|^fred@fireflies\.ai$|^notetaker@|@noreply|^noreply@|^servicenow@helpdesk\.hpc\.mil$|@zoomcrc\.com$)")
NAME = re.compile(r"\bRyland\b")
NAME_OK_FILES = {"wiki_build.py", "wiki_v2.py", "wiki.json"}


def main():
    bad = []
    for root, dirs, files in os.walk(REPO):
        dirs[:] = [d for d in dirs if d != ".git"]
        for f in files:
            p = os.path.join(root, f)
            rel = os.path.relpath(p, REPO)
            if BANNED_FILES.search(rel) and not rel.startswith("examples/"):
                bad.append("%s: this file must never be published" % rel)
                continue
            try:
                text = open(p, encoding="utf-8").read()
            except (UnicodeDecodeError, OSError):
                continue
            for i, line in enumerate(text.splitlines(), 1):
                for rx, what in SECRET:
                    if re.search(rx, line):
                        bad.append("%s:%d: %s" % (rel, i, what))
                if rel.startswith("tools/"):
                    continue          # the export and check rules name the patterns they look for
                for rx, what in PERSONAL:
                    if re.search(rx, line):
                        bad.append("%s:%d: %s" % (rel, i, what))
                for m in EMAIL.findall(line):
                    if not EMAIL_OK.search(m) and "{{" not in line:
                        bad.append("%s:%d: email address %s" % (rel, i, m))
                if rel.startswith("src/") and NAME.search(line) and f not in NAME_OK_FILES and "Ryan Wilson" not in line \
                        and "Ryland Adams, Dewyer is" not in line:
                    bad.append("%s:%d: owner name left in code" % (rel, i))
    if bad:
        print("LEAK CHECK FAILED (%d):" % len(bad))
        print("\n".join(bad[:200]))
        sys.exit(1)
    print("leak check ok")


if __name__ == "__main__":
    main()
