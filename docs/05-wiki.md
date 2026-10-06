# 05 Company wiki

A working demo of the company wiki Allan has asked for over about 60 meetings: one place to find the company's technology, top down and visual. It is separate from the single source of truth (SSOT), which is a different effort with outside users and access by role. Code: `wiki_build.py`, `wiki_v2.py`, `wiki.sh`. Data: `wiki.json` (generated), `.wiki/live.json`, `.wiki/inbox.jsonl`.

## How it is built

`python3 wiki_build.py wiki.json` writes the whole wiki. The content is in `wiki_build.py`; the links and the How we work pages are in `wiki_v2.py`; the ClickUp list ids come from `streams.tsv`. Every fact was taken from ClickUp, Drive or Fireflies as of Oct 4 2026; anything not confirmed is marked `check`.

Today: 76 pages, three system maps, a glossary.

| Page kind | Count | What |
|-----------|-------|------|
| `company` | 3 | MSBAI, Tam Fortis, Nexcavate |
| `system` | 3 | GURU, the reactor, PermitPulse |
| `part` | 31 | Components of a system (GURU's interface, global workspace, agent society, CIL, execution environment, Learning Engine, ...) |
| `service` | 3 | Applications of a system (OrbitGuard, CFD automation, MBE GURU) |
| `process`, `howto` | 15 | How we work: outreach, proposals, HPC operations, ... with steps and rules |
| `overview`, `section`, `tool` | 11 | Navigation and reference |
| `past`, `decision`, `question` | 10 | Past work, decisions made, open questions |

Page status: `current` (checked), `check` (needs a person to confirm), `gap` (we know it is missing), `stale`, `open`, `conflict` (sources disagree).

## A page

| Field | What |
|-------|------|
| `id`, `title`, `company`, `kind`, `parent`, `children` | Where it sits in the tree |
| `what` | What it is, in plain words |
| `fits` | How it fits with the rest |
| `current` | What is true today |
| `status`, `owner`, `updated` | Who keeps it and when it was last checked |
| `connects` | Other pages it connects to |
| `stream` | The workstream that works on it |
| `lists`, `folders` | Its ClickUp lists and folders, its future ClickUp home |
| `sources` | `[{t, u}]` where each fact came from |
| `links` | `[{k, t, u}]` everywhere the topic lives: `k` is slack, clickup, drive, fireflies, web |
| `find` | Search terms for Gmail and Drive |
| `questions`, `terms` | Open questions and glossary terms on the page |

The page reads: what it is, keeper, checked date, its future ClickUp home, how it fits, what is current, steps and rules (How we work pages), checklists, connects to, inside, open questions, then two panels:

- **Work on it now**: the matching workstream (opens the Workstreams view), what is held up by you, your desk tasks for this page (check them off here), goals and open ClickUp tasks in its lists.
- **Find it everywhere**: ClickUp lists, spaces and docs; Slack channels; Drive folders and docs; Fireflies meetings; Gmail and Drive searches, all opening in their apps.

## System maps

`maps` holds one diagram per system: a view box and nodes with position, size, shape and label, each node linked to its page. GURU reads top down: what a person sees (the interface), how agents talk (global workspace), who does the work (the agent society), what keeps it honest (CIL and rules), where it runs (execution), and how new skills are made (the Learning Engine). The services built on GURU (OrbitGuard, CFD automation, MBE GURU, PermitPulse) sit on top.

## The start page

One card per company (mini map, pages, active streams, open ClickUp tasks), the How we work pages, Reference (past work, decisions, glossary, about this wiki), then **Needs a check**, **Your wiki tasks** and **Waiting to be filed**. **Preview as a Tam Fortis partner** shows what an outside partner would see (a first step toward the SSOT's role based access, not the SSOT itself).

## The live layer (`wiki.sh`)

Every open task in Goals & Workstreams, read from ClickUp every 2 hours from 7 am to 10 pm (Haiku, read only), into `.wiki/live.json`: `{id, list, status, who, due, tags, name}`. Each page shows the open tasks in its lists. It refuses a partial run (it once replaced 605 tasks with 100).

## Writing back

- **Make it a task** (on a page that needs work, or an open question) adds a desk task with a `wiki:<page id>` note. The task sync carries it to ClickUp like any other task, and it shows on the page and the start page until it is ticked.
- **Register work** and **Suggest a fix** append to `.wiki/inbox.jsonl` (`{who, when, text, to, state}`), which a filing agent would read.

## Where it is going

The plan is for ClickUp to mirror this structure: a top down, visual wiki (the GURU layout, components and agents) organized in ClickUp, with the wiki as a skeleton kept in sync with ClickUp data the same way desk tasks are. That reorganization of ClickUp is a decision for the team and OpenClaw (see [09](09-openclaw-alignment.md)); the widget's wiki is the working example of the target shape.
