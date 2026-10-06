# 01 Architecture

How the widget is put together, from the pixels down to the background jobs.

## Layers

```
┌──────────────────────────────────────────────────────────────────────────┐
│ UI          msbai-desk.widget/index.jsx (Übersicht, one file)            │
│             draws every view, keeps layout in localStorage, runs shell   │
│             commands on clicks                                           │
├──────────────────────────────────────────────────────────────────────────┤
│ Beat        one shell command every 2 min prints every section between   │
│             ===MARKERS===; each section is a script's `tick`             │
├──────────────────────────────────────────────────────────────────────────┤
│ Scripts     zsh + python3 (standard library only). `tick` prints from    │
│             cache at once and starts a background job when stale         │
├──────────────────────────────────────────────────────────────────────────┤
│ Jobs        claude -p (headless Claude Code), one prompt file per run,   │
│             an allow list of tools, dontAsk, a fixed final line          │
├──────────────────────────────────────────────────────────────────────────┤
│ Sources     claude.ai connectors: ClickUp, Slack, Gmail, Google Drive,   │
│             Google Calendar, Fireflies, Zoom. Fireflies API (one key).   │
│             macOS: EventKit, AppleScript, System Events, launchd         │
├──────────────────────────────────────────────────────────────────────────┤
│ Record      ClickUp (shared) · the owner's files under ~/AI Tools        │
└──────────────────────────────────────────────────────────────────────────┘
```

## The UI

- **Übersicht** draws HTML on the desktop layer, under every window. The widget is one file, `index.jsx`, compiled by Übersicht with its own JSX pragma (no React import, no fragments; see [11 Traps](11-traps.md)).
- **Views.** `desk` (calendar, tasks, call bar, terminal slot, notes), `claude` (the Claude app parked in a slot), and three views the widget draws itself: `crm`, `workstreams` (key `priorities` in the code) and `wiki`.
- **Parking real windows.** The widget never reimplements another app. For the terminal and the Claude app it measures an empty slot, converts it to screen coordinates, and hands the rectangle to AppleScript (`dock.sh`), which moves the real window over it. The apps keep every feature, and nothing breaks when they update.
- **Clicks run shell commands.** Every button calls a script (`crm.sh draft <base64 json>`, `cmd.sh run <base64 text>`, `dock.sh claude-new`, ...). Arguments go through base64 so nothing a user typed can break the command line.
- **Layout state** lives in the browser's localStorage (`msbai_view`, `msbai_geo`, `msbai_split`, `msbai_fold`, `msbai_open_tasks`, `msbai_crm_ui`, ...). Data never does.
- **Owner aware.** `me.json` names the owner. The UI says Mine, you, Yours; it highlights the owner's next steps in Workstreams (gold), their items in the CRM (mine), and signs drafts with their name.

## The beat

`index.jsx` exports one `command` that runs every 120 seconds. It prints, in order: the Collab snapshot, the calendar (EventKit through JXA), `TASKS.md`, notes, terminal tabs, recent calls, the team, `me.json`, the Inbox, the workstreams flow, the owner's steps, prep cards, Google status, the screen size, closed ClickUp ids, the wiki and its live layer, the CRM, and notify alerts. `updateState` splits the output on the `===MARKER===` lines and parses each section. A second command polls CPU, memory, disk and top processes every 5 seconds.

Every `tick` must be fast. The rule each script follows:

```zsh
case $1 in
  tick)
    print cached data                          # instant
    if inside hours && older than EVERY && no lock; then
      ( "$0" sync ) &!                         # background, detached
    fi ;;
  sync) take a lock dir; build prompt; run claude; parse; write files; release ;;
esac
```

Locks are directories (`mkdir` is atomic). A lock older than its job's time limit is treated as stale and taken over.

## The job pattern

Every background job that needs judgement or a connector is a headless Claude Code run:

```zsh
claude -p --model sonnet --permission-mode dontAsk \
       --allowedTools ToolSearch Read mcp__claude_ai_Slack__slack_search_public_and_private ... \
       < prompt.md
```

1. **The prompt is built fresh each run** by the script, from a rules file (`tasks-sync.md`, `clickup-sync.md`) or inline text, plus the data the run needs: the current flow, the open tasks, the time window, the ClickUp ids. The last prompt and reply of every job are kept beside its state (`.flow/prompt.md`, `.crm/sync-output`, ...) for debugging.
2. **Tools are an allow list.** In `dontAsk` mode anything not listed is refused. Read jobs get read tools only. A job whose output is a file usually prints records and lets the script write them, so the model has no write tool at all. The two jobs that edit `TASKS.md` get `Edit` on that one path only.
3. **The reply has a contract.** Each job must end with a fixed marker: `ADDED n: ...` (task sync), `PAIRED n CREATED m ...` (ClickUp pair), `FLOW_START ... FLOW_END` (one meeting), `REVIEW_START ... REVIEW_END` (review), `CRM_START ... CRM_END` (CRM sync), `RESULT<TAB>oid<TAB>ok|failed` then `PUSH_DONE` (CRM writes), `CU_END` (workstream push). No marker means the run failed: the time window does not move, so the next run covers the same ground.
4. **The script applies the result.** Python merges the JSON patch into `flow.json`, builds `crm.json`, writes the Rolodex pages, dedupes alerts. Rules that must always hold (no status change without a reason, at most 20 rank moves kept, the four allowed CRM writes) are enforced here, not trusted to the model.

### Models

| Model | Used for | Why |
|-------|----------|-----|
| Haiku | Collab snapshot, wiki live layer, team list, Say it, call creation and DMs | Cheap, simple list reads and single actions |
| Sonnet | Task sync, ClickUp pairing, meetings into the flow, the review, owner's steps, CRM sync and cards, drafts, notify, prep | Reads and judges |
| Opus | Fallback for a meeting whose reply trips Sonnet's safeguards (defense topics such as interceptors and hypersonics) | Reads those meetings fine |

Haiku sometimes stalls on pagination and asks for a shell; jobs that use it retry once on Sonnet.

### Connectors

All of Slack, Gmail, Google Drive, Google Calendar, ClickUp, Fireflies and Zoom are reached as `mcp__claude_ai_<Service>__<tool>`: the claude.ai connectors of whoever is signed in to Claude Code on that Mac. There is no OAuth client, token file or API key for any of them. Two exceptions:

- **Fireflies API key** (`.fireflies-key`, chmod 600, never printed): listing recent meetings, fetching a transcript to a file, and adding the notetaker to a live call (`addToLiveMeeting`), which the connector cannot do.
- **Google Calendar API** (optional, off): `gcal.py` can answer invitations and create events with invitees if a Google OAuth client is allowed. The Workspace org does not allow one today, so replies go through Calendar.app and creation through EventKit.

## Scheduling

- **launchd**: `com.msbai.tasks-sync` runs `tasks-sync.sh` then `clickup-sync.sh` every 5 minutes, whether or not the widget is open. Each script decides whether there is anything to do.
- **The widget's beat**: everything else starts from a `tick`, each inside its own hours (most 6 am to 10 pm; notify 4:30 am to 11:30 pm).
- **Event driven**: a new meeting fetched by the task sync queues it for the flow and makes a review due; a click queues a CRM write and starts the push.

Full table in [08 Jobs and schedules](08-jobs-and-schedules.md).

## The ClickUp daily limit

ClickUp allows about 1,000 connector calls a day per account. The widget's jobs, any OpenClaw job using the same login, and any Claude chat share that budget. Every ClickUp job sources `cu_limit.zsh`:

- `cu_note "<reply>"` looks for the limit message, works out the reset time, and writes it to `.clickup-blocked` (and a line to `.clickup-limit.log`).
- `cu_blocked` is true until then. ClickUp only jobs (CRM sync and push, wiki live layer, the ClickUp mirror) skip their run and keep their last good data. Mixed jobs (owner's steps, notify, Inbox, task sync) run without their ClickUp tools.
- Writes wait: the CRM outbox and the workstream push (`.flow/cupush-due`) go out on the first beat after the reset.

The CRM sync is built to spend little: a list pass (about 20 calls) and a detail pass only for records that are new or changed since the last time (`.crm/fields.json`, at most 40 a run).

## Where things live on the owner's Mac

```
~/AI Tools/
├── TASKS.md            the owner's tasks (the widget reads ## Active, ticks into ## Done)
├── CLAUDE.md           the owner's memory for Claude: task format, people, terms
├── transcripts/        meetings fetched from Fireflies, one markdown file each
├── notes/              the Notes tabs
└── desk-widget/        this repo's src/desk-widget, personalized, plus its state
    ├── me.json  team.tsv  crm-seed.tsv  crm-exclude.txt  .fireflies-key
    ├── rolodex/        one page per person
    └── .flow/ .crm/ .watch/ .emails/ .prep/ .zoom/ .wiki/ .tasks-sync/ .team/
```

The widget folder is symlinked into Übersicht's widgets folder (see [10 Setup](10-setup.md)).
