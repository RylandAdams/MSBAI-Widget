# 02 The ClickUp contract

Everything the widget reads from and writes to ClickUp, with the ids it uses. ClickUp is the shared record: when this page and the widget's local files disagree, ClickUp wins for anything the team sees.

Workspace: **20115771**.

## Spaces, folders and lists

### Goals & Workstreams (space 90114201246)

Atlas files every meeting's tasks here. One folder per program; inside each, a `00 Goals` list (outcomes, tagged `goal`), a `01 Inbox / Untriaged` list, and one list per workstream.

| Folder | Id |
|--------|----|
| MSBAI · Phase III HPCMP (CFD) | 90118135056 |
| MSBAI · Phase I NASA (MBE GURU) | 90118135057 |
| MSBAI · Cross Cutting | 90118135058 |
| MSBAI · Phase II OrbitGuard (CDAO) | 90118135060 |
| Tam Fortis | 90118135097 |
| Nexcavate | 90118135098 |

Inbox lists, used when a new task fits no workstream list clearly:

| Inbox | List id |
|-------|---------|
| MSBAI general | 901114113993 |
| OrbitGuard | 901114114014 |
| NASA | 901114113990 |
| HPCMP / CFD / Kestrel | 901114113985 |
| Tam Fortis | 901114114067 |
| Nexcavate | 901114114075 |

**Workstream lists** are in `src/desk-widget/streams.tsv`, one per line: `list id <TAB> program <TAB> list name`. This file is the shared vocabulary: the flow names its streams after these lists, the wiki links its pages to them, and the Collab tab's branch icon finds a task's stream by its list. A new list created by the workstream push is appended here.

### CRM v3 (kept by OpenClaw's Hermes agent)

| List | Id | Widget reads | Widget writes |
|------|----|--------------|---------------|
| Contacts | 901115367051 | names, TPOC role, pursuit (topic code) | never |
| Company Relationships | 901115367052 | names, stage, last touch, health, tier | never |
| Opportunities | 901115367054 | by stage (values 2 to 5) | never |
| Follow-ups | 901115367058 | every open task with custom fields | close one; create one |
| Interested Later | 901115485850 | every open task with custom fields | create one |
| Proposals | 901102025484 | open statuses with custom fields; `won` names | never |

Custom fields the sync filters on (by id, with the values it uses):

| Field id | List | Values used | Group it fills |
|----------|------|-------------|----------------|
| cfd8f5eb-7078-4376-bb84-c38a3a9ad7c6 | Opportunities | 2, 3, 4, 5 | opportunity stage |
| d73c6732-93b2-4dc2-8d6d-4aca606ed5a9 | Company Relationships | 2 engaged, 3 active, 4 customer, 5 partner | relationship level |
| a2f76dfd-52c8-45ed-aee2-d3f8c8dab62e | Company Relationships | date ≥ 21 days ago, ≥ 90 days ago | touched recently |
| b9494d62-b26e-4313-88b0-0c5ba96f6130 | Company Relationships | 1 cooling, 2 dormant, 3 at risk | health |
| a4f4d7e4-6101-416b-accc-73f31a6f4a40 | Company Relationships | 0 key, 1 warm | tier |
| e5636f85-1bd7-4d36-a882-d3284bdb9c4c | Contacts | 0 TPOC | TPOC contacts |
| e7fd3448-b785-4352-9d7c-fb247f23a891 | Contacts | a proposal's topic code | people on a pursuit |

Follow-ups fields read: Entity, Direction (we owe them / they owe us), Origin, Commitment State, Contact, Pursuit, Source Evidence. Interested Later: Entity, Interest, Why Later, Trigger Event, Resurface On, Interest State, Contact. Proposals: Solicitation Release State, Open Date, Final Submission Date, Next Milestone Date, Proposing Company, Next Step + Due Date. Field option ids are looked up live with `clickup_get_custom_fields`, never hard coded.

Proposal statuses read as open: to do, monitoring for release, waiting for response, affected by sbir reauth, collecting information, writing, needs review, missing information, urgent (help needed), ready for submission, submitted.

### Per person

- **Member id**: each owner's ClickUp member id is in their `me.json` (`clickup`).
- **Focus Board**: a view of open tasks assigned to the owner and tagged `focus-now`. Atlas's weekly focus board job curates it; the widget adds to it.

### Tags and markers

| Marker | Meaning |
|--------|---------|
| `atlas` tag, user "msb assistant" | Filed by Atlas. Its description carries `atlas_task_id: <Fireflies transcript id>::task::...` |
| `focus-now` tag | On the owner's Focus Board |
| `goal` tag | An outcome in a `00 Goals` list. Never paired with a desk task |
| `untriaged` tag | Atlas could not place it |
| `## From <owner>'s desk` | The one section of a description the widget owns |
| `## Merged from duplicates` | Facts copied into a survivor from its duplicates |
| A last line starting `Duplicate of [name](url)` | Added to a duplicate, naming its survivor, before it is marked complete |
| `Workstream status (from the desk review, <date>): ...` | First paragraph of a workstream list's description |
| `From <owner>'s desk (CRM tab): ...` | Start of every CRM description or comment the widget writes |

## Every read

| Job | What it reads | Tools | How often |
|-----|---------------|-------|-----------|
| `clickup-sync.sh` pair / reconcile | Owner's open tasks (all pages), Atlas tasks from the same meeting (search by transcript id), descriptions, the hierarchy | filter_tasks, search, get_task, get_workspace_hierarchy, get_list | When the unpaired set changes, else every 30 min; reconcile every 2 h; 4 am to 10 pm |
| `clickup-sync.sh` snapshot (Collab) | Owner's open tasks that have another assignee | filter_tasks | Every 30 min, 6 am to 10 pm |
| `clickup-sync.sh` collab notes | Description of each shared task that is new or changed (at most 4 a run) | get_task, search | Same run |
| `wiki.sh` | Every open task in Goals & Workstreams | filter_tasks | Every 2 h, 7 am to 10 pm |
| `crm.sh sync` | The CRM v3 lists and groups above; details only for new or changed records | filter_tasks, get_task | Every 3 h, 6 am to 10 pm |
| `crm.sh card` | Everything about one person | filter_tasks, get_task, search | When a card is opened (kept a day) |
| `watch.sh` | Comments on the ClickUp tasks linked from open desk tasks | get_task, get_task_comments, search | Every 30 min, 4:30 am to 11:30 pm |
| `mine.sh` | The owner's closed tasks, as evidence a step is done | filter_tasks, search | Every 30 min, 6 am to midnight |
| `tasks-sync.sh`, `emails.sh` | Lookups for context and links | search, filter_tasks, get_task | With their runs |

## Every write

Nothing writes to ClickUp except these. Each is listed with the exact guard that keeps it safe.

### Tasks (`clickup-sync.sh`, rules in `clickup-sync.md`)

| Write | When | Guard |
|-------|------|-------|
| Create a task | A desk task has no twin, and its meeting is over 3 hours old (or it came from Slack or email) | Assigned to the owner, tagged `focus-now`, in the best workstream list or the company inbox |
| Add tag `focus-now` | A paired task lacks it | Owner's tasks only |
| Rewrite a description | Merging content | Only tasks assigned **only** to the owner. Existing text kept byte for byte; only the `## From <owner>'s desk` section is replaced |
| Mark complete | The desk task was ticked (close), or it is a duplicate (reconcile) | Only `· synced` ids under a Done task; duplicates only if assigned only to the owner |

Never: delete, move, reassign, comment, or `clickup_merge_tasks` (it deletes). A task shared with someone else is never changed.

### Workstreams (`flow.sh cupush`, plan built by `flow_review.py cuplan`)

| Write | Guard |
|-------|-------|
| The **Workstream Board** doc in Goals & Workstreams (create once, then replace its one page) | Only when the board text changed |
| The status paragraph at the top of a stream's list description | Only the stream named after that list; only when its rank, status, target or date changed; the rest of the description is kept |
| Create a list for a ranked active stream with none | At most 2 a run; first checks the company folder for a list that already covers it (then prints FOUND and creates nothing) |

Never: delete, archive, move or rename anything, never touch a task.

### CRM (`crm.sh push`, from `.crm/outbox.jsonl`)

| Op | What it does | Guard |
|----|--------------|-------|
| `close` | Marks a follow up complete | Checked first: must be an open task in the Follow-ups list |
| `followup` | Creates a follow up we owe them (due in 3 days, a week or 2 weeks) | First looks for an open follow up for the same person and topic; comments on it instead if found |
| `later` | Creates an Interested Later entry (30, 90 or 182 days) | Same duplicate check on Interested Later |
| `comment` | Adds a comment to an existing task (a note from a card) | Only on an existing task |

Every op is queued from a click, refused if the same op is already queued, shown as pending, and reported back as `ok` with a link or `failed` with why. Never: create or edit Contacts, Organizations or Company Relationships (Hermes keeps those clean), delete, archive, merge, move or reassign.

## The pairing line

The one format both sides rely on. Under a desk task in `TASKS.md`:

```
- [ ] **Send the team the draft test plan** - [MSBAI] for Alex · due Fri Oct 9 · from Weekly Standup (Oct 5)
  - ...context and links...
  - [ClickUp: Send draft test plan to the team](https://app.clickup.com/t/868abc123) · synced
  - Source: transcripts/2026-10-05-weekly-standup.md
```

- Only lines ending `· synced` are pairs. Any other `[ClickUp: ...]` link is a plain reference.
- A synced line means **the same piece of work**, never a broader goal or a related task, because ticking the desk task closes it.
- One ClickUp task is never paired under two desk tasks.
- If Atlas split one ask into genuinely different deliverables, the desk task carries several synced lines.

The Rolodex uses the same idea: a person's page lists their ClickUp records, and lines marked `· synced` are rewritten from ClickUp on every sync.

## What OpenClaw can rely on

- Every desk task the owner has is on their Focus Board, with the desk's context in a `## From <owner>'s desk` section.
- Every active workstream with a list has its rank, status and target in the first paragraph of the list description, and all of them are on the Workstream Board doc, with a **For OpenClaw** section that says: file tasks into the list of the stream they move; order briefs by rank; flag tasks for paused, done or merged streams; do not edit the board (the review rewrites it).
- Nothing the widget writes ever removes or rewrites what Atlas or Hermes wrote.
