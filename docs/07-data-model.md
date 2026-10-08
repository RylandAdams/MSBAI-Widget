# 07 Data model

The shape of every file the widget keeps. Paths are relative to `~/AI Tools/desk-widget/` unless they start with `~`. None of these files are published in this repo; only their shapes are.

## Who and with whom

**`me.json`**: who this copy belongs to. Read by the UI and most prompts.

```json
{"name": "Sam", "full": "Sam Rivera", "aliases": ["Sam", "Sam Rivera"],
 "slack": "U0XXXXXXXXX", "clickup": "00000000", "email": "sam.rivera@example.com",
 "role": "systems engineer on the GURU team",
 "focusBoard": "https://app.clickup.com/...", "crmWatch": "mine"}
```

`aliases` are the names transcripts use for the owner (including what Fireflies mishears). `crmWatch` is `mine` or `all`. `role`, `focusBoard`, `crmCc` and `agendaPosterSlack` are used at install time by `tools/personalize.py`.

**`team.tsv`**: teammates for the call card, in chip order. `Name <TAB> Slack user id <TAB> email`.

**`streams.tsv`**: ClickUp workstream lists. `list id <TAB> program (folder) <TAB> list name`. Company wide, the same in every copy.

## Tasks

**`~/AI Tools/TASKS.md`**: see [06](06-tasks-notify-and-calls.md#tasksmd).

**`.clickup-collab.tsv`**: `id <TAB> status <TAB> due YYYY-MM-DD or - <TAB> list name <TAB> other assignees <TAB> date_updated ms <TAB> name`.

**`.clickup-collab-notes.tsv`**: `id <TAB> one note line`, several lines per task (summary, then links).

**`.tasks-sync/clickup-closed`**: ClickUp ids already closed by a tick, one per line.

**`.watch/alerts.json`**:

```json
{"<task title>": [{"id": "c2d8d9d41fc0", "src": "Slack|Gmail|Fireflies|Drive|ClickUp", "url": "...",
                   "when": "ISO time of the news", "what": "what happened, naming who",
                   "next": "the next step that would help", "found": "ISO time found"}]}
```

`.watch/seen`: alert ids dismissed with got it.

## Workstreams

**`.flow/flow.json`**:

```json
{"streams": [{"id": "", "name": "", "clickup": "", "company": "", "color": "#0A84FF",
              "status": "active|paused|done", "ended": "merged|", "mergedInto": "", "why": "",
              "bornFrom": "<node id>", "parent": "<stream id>", "endNode": "<node id>",
              "now": "", "next": "", "flag": "",
              "target": "", "target_date": "YYYY-MM-DD",
              "rank": 1, "rankWhy": "",
              "ranks": [{"date": "", "from": 3, "to": 1, "after": "meeting or review"}],
              "moved": {"date": "", "from": 3, "to": 1, "after": ""},
              "history": [{"date": "", "from": "active", "to": "done", "why": "", "by": "meeting|review"}]}],
 "nodes": [{"id": "n<ms>", "meeting": "<fireflies id>", "date": "ISO", "title": "", "meetingTitle": "",
            "streams": ["<stream id>"], "spawns": ["<stream id>"],
            "summary": "", "done": [""], "next": [{"what": "", "who": ""}],
            "said": [{"who": "", "what": ""}], "links": [{"kind": "", "label": "", "url": ""}],
            "transcript": "https://app.fireflies.ai/view/<id>"}],
 "focus": "", "focusWhy": "", "focusSet": "", "updated": "",
 "board": {"date": "", "source": "", "posted": "", "items": [{"item": "", "stream": ""}]},
 "review": {"date": "", "after": "", "changes": [""], "moves": [{"id": "", "name": "", "from": null, "to": 1}],
            "questions": [""]}}
```

**`.flow/mine.json`**: the owner's steps.

```json
{"items": {"<node id>:<index of next>": {"status": "open|done|dropped", "evidence": "", "url": "", "checked": ""}},
 "groups": [{"title": "", "keys": ["<node id>:<index>"], "waiting": ""}],
 "myFocus": "", "myFocusWhy": "", "myFocusSet": "", "focusSet": "", "updated": ""}
```

**`.flow/cu-pushed.json`**: what was last written to ClickUp: `{"lists": {"<list id>": "<signature>"}, "board": "<sha1>", "doc": {"doc": "", "page": ""}, "asked": ["<stream id>"]}`.

Queue files: `.flow/queue` (`id <TAB> ms <TAB> minutes <TAB> title`), `.flow/seen`, `.flow/failed`, `.flow/current`, `.flow/review-due`, `.flow/cupush-due`.

## CRM

**`.crm/crm.json`**:

```json
{"updated": "",
 "items": [{"id": "<ClickUp id or seed id>", "kind": "contract|lead|interest|followup|checkin|reply|result|proposal|partner|mention",
            "level": 1, "title": "", "sub": "", "company": "MSBAI", "companies": [""], "org": "",
            "who": [], "owner": "", "need": "", "note": "", "url": "", "opp": "", "pursuits": [""],
            "topic": "", "status": "", "state": "prerelease|open|submitted", "due": "", "final": "", "open": "",
            "milestone": "", "next": "", "tpocs": 0, "oppStage": "", "stale": false,
            "direction": "we owe them|they owe us", "origin": "", "evidence": "", "heat": "hot|warm|cooling",
            "seed": false, "overlap": [""]}],
 "calendar": [{"date": "", "type": "", "label": "", "company": "", "item": "<item id>", "level": 3}],
 "people": {"<lower case name>": {"name": "", "levels": [1], "companies": [""], "roles": [""], "item": ""}},
 "roster": [{"n": "name", "c": ["company"], "rel": [], "con": "contact id", "lv": 2, "roles": [""],
             "pursuits": [""], "heat": "", "email": ""}],
 "counts": {"contracts": 0, "leads": 0, "proposals": 0, "partners": 0},
 "notes": [""]}
```

**`.crm/plus.json`**: the playbook layer, written by `crm_plus.py`.

```json
{"updated": "",
 "types": {"<contact task id>": "buyer|user|tpoc|adjacent|partner|peer|unknown"},
 "pursuits": {"<proposal task id>": {
     "due": "YYYY-MM-DD", "days": 6, "phase": "shaping|outreach|draft|gate|final|past", "state": "prerelease|open|...",
     "open": "", "marks": {"start": "", "d21": "", "d14": "", "d7": ""},
     "people": [{"n": "", "type": "", "st": "none|contacted|talked", "last": "", "url": "", "em": "", "id": "", "org": "", "title": ""}],
     "talked": {"buyer": 0, "user": 0, "tpoc": 0, "adjacent": 0}, "gate": 0,
     "gstate": "ok|building|short|late|nodate", "peers": 0, "cust": 0, "warn": ""}},
 "campaigns": [{"key": "<name or p:<pursuit id>>", "name": "", "company": "", "pursuit": "", "due": "", "gate": "",
     "auto": true, "release": "", "open": "", "goal": "", "ask": "", "doc": "",
     "targets": [{"n": "", "org": "", "fn": "", "type": "", "stage": "found|contacted|replied|met|letter", "last": "",
                  "channels": [""], "url": "", "inCrm": true, "touches": 0, "rel": "", "restrict": "", "first": false}],
     "counts": {"letter": 0, "met": 0, "replied": 0, "contacted": 0, "found": 0},
     "talked": 0, "offLimits": 0, "tpoc": {"n": 0, "fresh": 0, "window": "open|closed|unknown"}}],
 "debriefs": [], "week": {}, "restrict": {"<contact id>": "<what Hermes recorded>"}}
```

`debriefs` and `week` are still computed but no UI shows them (both were taken out on Oct 8).

**`campaigns.json`** (owner's, never published): `{"campaigns": [{"key", "name", "company", "pursuit", "due", "gate", "goal", "ask", "doc", "targets": [{"n", "org", "fn", "type", "first", "letter"}]}]}`. See `examples/campaigns.example.json`.

**`.crm/cu-cache.json`**: every task the last REST sync read from the CRM lists (id, name, list, status, custom fields, dates), so a card can find its person locally. **`.crm/cu-lists.json`**: list ids and names. **`.crm/meetings-log.jsonl`**: past calendar meetings with people outside the team, one per line, the evidence for the `met` stage. **`.crm/touches.jsonl`**: touches logged from the tab (no UI writes it since Oct 8).

**`.crm/cards/<id>.json`**: one context card (see [04](04-crm-and-rolodex.md#context-cards)), reused for a day, deleted after 14.

**`.crm/outbox.jsonl`**: one queued write per line.

```json
{"op": "close|followup|later|comment", "task": "<ClickUp id>", "name": "", "company": "", "title": "",
 "due": "YYYY-MM-DD", "note": "", "interest": "", "why": "", "resurface": "YYYY-MM-DD",
 "contact": "<contact task id>", "text": "", "oid": "<10 hex>", "at": 1791270000}
```

`.crm/outbox-done.jsonl`: `{"oid", "status": "ok|failed", "detail": "url or why", "done"}`.

**`.crm/alerts.json`**: `{"<kind>:<item id>": {"item", "what", "next", "company", "when", "key"}}`.

`.crm/mentions.tsv` (people named in meetings), `.crm/nudges.tsv` (follow up drafts left), `.crm/fields.json` (detail cache by id and date_updated), `.crm/seen`, `.crm/nudged`.

**`crm-seed.tsv`**: `kind <TAB> company <TAB> name <TAB> organization <TAB> people <TAB> pursuits <TAB> what we need <TAB> date <TAB> ClickUp task id <TAB> note`. `kind` is contract, partner or date. See `examples/crm-seed.example.tsv`.

**`crm-exclude.txt`**: names that are never leads, one per line.

**`rolodex/<slug>.md`**: one page per person, sections in [04](04-crm-and-rolodex.md#the-rolodex-two-way).

**`.emails.tsv`**: the Inbox. `thread <TAB> last message id <TAB> date <TAB> from name <TAB> from email <TAB> company <TAB> subject <TAB> what they need <TAB> Gmail link`, plus two base64 fields when a suggested reply exists.

## Wiki

**`wiki.json`**: `{"updated", "companies": [{id, name, color, system, tag, home}], "pages": {"<id>": page}, "glossary": [{t, d}], "maps": {"<system>": {"vb": [w, h], "nodes": [{id, x, y, w, h, shape, label}]}}, "inbox": [{who, when, text, to, state}], "sections": [...], "lists": {"<list id>": {name, folder}}, "folders": {"<folder id>": name}}`. Page fields in [05](05-wiki.md#a-page).

Company colours, shared by every view: MSBAI `#7FB2FF`, Tam Fortis `#FF9F5A`, Nexcavate `#5ED3A1`.

**`.wiki/live.json`**: `{"updated", "tasks": [{"id", "list", "status", "who", "due", "tags", "name"}]}`.

**`.wiki/inbox.jsonl`**: Register work and Suggest a fix entries.

## Calls and calendar

`.zoom/sessions.tsv`: `id <TAB> topic <TAB> join link <TAB> who was invited`; `.zoom/s-<id>.ff`, `.zoom/s-<id>.dm`: how Fireflies and the DMs went.

`.cal-last`: the last calendar read, tab separated, one event per line with its iCalendar UID last.

## Shared guards

`.clickup-blocked`: epoch when ClickUp's daily limit resets. `.clickup-limit.log`: when it was hit.
