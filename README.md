# MSBAI Desk Widget: the framework

The MSBAI Desk Widget is a desktop hub that sits behind your windows on a Mac and pulls a person's whole working day into one place: their calendar, their tasks with every link it takes to do them, the team's workstreams ranked in this week's order, the company wiki, a CRM for outreach, and one click calls with Fireflies already in them. It reads Slack, Gmail, Google Drive, Google Calendar, Fireflies and ClickUp through Claude, and it writes back to ClickUp so the team and OpenClaw see the same picture.

This repository holds the **framework**: the code, the rules each background job follows, the data shapes, and the exact contract with ClickUp. It holds **no one's personal data**. Names, emails, Slack and ClickUp ids in the code are `{{PLACEHOLDERS}}` that are filled in when a teammate installs it, and the owner's tasks, contacts, transcripts, keys and caches never leave their machine (see [Keeping this repo clean](#keeping-this-repo-clean)).

It has two readers:

1. **OpenClaw (and Kriss).** Read this to compare how the widget organizes tasks, workstreams, the wiki and the CRM against how OpenClaw stores the same things, and decide whether OpenClaw keeps its model or reorganizes. Start with [docs/09-openclaw-alignment.md](docs/09-openclaw-alignment.md).
2. **Every teammate.** Each person gets their own copy, set up for them, that lights up their own work. Start with [docs/10-setup.md](docs/10-setup.md).

---

## Contents

1. [The idea: ClickUp underneath, a widget on every desk](#1-the-idea-clickup-underneath-a-widget-on-every-desk)
2. [A tour of the widget](#2-a-tour-of-the-widget)
3. [How it works underneath](#3-how-it-works-underneath)
4. [How it talks to ClickUp](#4-how-it-talks-to-clickup)
5. [Workstreams: lifecycle and ranking](#5-workstreams-lifecycle-and-ranking)
6. [CRM and Rolodex](#6-crm-and-rolodex)
7. [Company wiki](#7-company-wiki)
8. [What it stores](#8-what-it-stores)
9. [What it will never do](#9-what-it-will-never-do)
10. [For OpenClaw](#10-for-openclaw)
11. [Setting it up for a teammate](#11-setting-it-up-for-a-teammate)
12. [Repo layout](#12-repo-layout)
13. [Keeping this repo clean](#keeping-this-repo-clean)
14. [Built, and not built yet](#14-built-and-not-built-yet)

Deeper references live in `docs/`:

| Doc | What is in it |
|-----|---------------|
| [01 Architecture](docs/01-architecture.md) | The layers, the refresh beat, the background job pattern, models, connectors |
| [02 ClickUp contract](docs/02-clickup-contract.md) | Every space, list, field and id the widget uses, every read and every write |
| [03 Workstreams](docs/03-workstreams.md) | How meetings become streams, how the review ranks them, what gets written to ClickUp |
| [04 CRM and Rolodex](docs/04-crm-and-rolodex.md) | The four outreach levels, scoring, cards, drafts, nudges, the two way sync |
| [05 Wiki](docs/05-wiki.md) | Page model, system maps, the live ClickUp layer, how it becomes the ClickUp skeleton |
| [06 Tasks, notify and calls](docs/06-tasks-notify-and-calls.md) | TASKS.md format, meeting and Slack task sync, ClickUp pairing, notify mode, prep cards, calls |
| [07 Data model](docs/07-data-model.md) | The shape of every JSON and TSV file the widget keeps |
| [08 Jobs and schedules](docs/08-jobs-and-schedules.md) | Every background job: when it runs, which model, which tools, what it writes |
| [09 OpenClaw alignment](docs/09-openclaw-alignment.md) | Side by side with OpenClaw's data model, the gaps, and the decisions to make |
| [10 Setup](docs/10-setup.md) | Installing a personalized copy for a teammate |
| [11 Traps](docs/11-traps.md) | Things that cost real debugging time, so nobody pays for them twice |

---

## 1. The idea: ClickUp underneath, a widget on every desk

Three things already hold the company's work, and each sees part of it:

- **ClickUp** is the record. Tasks, workstream lists, goals, CRM records and docs live there, and everyone can see them.
- **OpenClaw** is MSBAI's multi agent system. Its **Atlas** bot turns every Fireflies meeting into ClickUp tasks in the Goals & Workstreams space, and its **Hermes** agent keeps the CRM v3 space in ClickUp (contacts, organizations, company relationships, follow ups, opportunities), fed by the shared outreach mailbox. OpenClaw builds the **general understanding**: every meeting, every contract, every task.
- **Each person** holds the detail OpenClaw cannot see: their DMs, their sent mail, the doc they shared, the thing they finished without telling anyone.

The widget is the third piece made visible. It builds its owner's detailed understanding (every task with its Slack thread, Drive doc, email and transcript; what they finished; what is waiting on them) and writes the parts the team needs back into ClickUp. Every teammate runs their own copy. Because all of them write to and read from the same ClickUp, they work like a multiplayer game: each widget sees its owner's work in full detail and everyone else's work through ClickUp, and OpenClaw sees all of it.

```
                         ┌──────────────────────────────┐
                         │           ClickUp            │
                         │  the record everyone shares  │
                         │  Goals & Workstreams space   │
                         │  CRM v3 space · Focus Boards │
                         │  Workstream Board doc        │
                         └──────▲───────────────▲───────┘
            files tasks from    │               │   pairs tasks, ranks streams,
            every meeting,      │               │   closes follow ups, adds notes
            keeps CRM people    │               │   (reads everything else)
                         ┌──────┴──────┐  ┌─────┴──────────────────────────┐
                         │  OpenClaw   │  │  Desk widget, one per person   │
                         │  Atlas      │  │  Ryland's · Ayesha's · Aras's  │
                         │  Hermes     │  │  each reads its owner's Slack, │
                         │  (VPS)      │  │  Gmail, Drive, Calendar and    │
                         └─────────────┘  │  Fireflies through Claude      │
                                          └────────────────────────────────┘
```

**ClickUp is the foundation everything runs off of.** The widget never treats its own files as the team's truth. Its local files are the owner's working copy and a cache of what it drew; anything the team needs goes into ClickUp, in the places and formats in [docs/02](docs/02-clickup-contract.md). Today the widget talks to ClickUp only; it does not call OpenClaw directly. OpenClaw reads what the widget writes the same way it reads anything else in ClickUp.

What moves where, today:

| From | To | What | How |
|------|----|------|-----|
| Fireflies, Slack | Owner's TASKS.md | Asks made to the owner and promises they made | `tasks-sync.sh`, every 5 min check, full run on a new meeting or every 30 min |
| TASKS.md | ClickUp | Each desk task paired with its ClickUp twin (usually the one Atlas filed), or a new one created; notes and links merged both ways; ticking closes it | `clickup-sync.sh` (pair, reconcile, close) |
| ClickUp | Widget | The owner's tasks shared with teammates (Collab), every open task in Goals & Workstreams (Wiki), the CRM v3 space (CRM, Rolodex) | `clickup-sync.sh snapshot`, `wiki.sh`, `crm.sh sync` |
| Fireflies | Widget, then ClickUp | Every meeting placed into the workstreams flow; the review ranks streams; rank, status and target written to each stream's list and to the **Workstream Board** doc | `flow.sh`, `flow_review.py`, `flow.sh cupush` |
| Widget | ClickUp CRM | Close a follow up, create a follow up, create an interested later, add a note as a comment | `crm.sh push`, only on a click |
| Gmail, Slack, ClickUp, Fireflies | Widget | News on an open task (a reply, a meeting, a comment) | `watch.sh`, notify mode |

---

## 2. A tour of the widget

The widget has five views, switched from a bar at the top that is also the drag handle: **desk**, **claude**, **crm**, **workstreams** and **wiki**. The widget never shows its owner's name as a label. It says **Mine**, **you** and **Yours**, so the same build reads right on anyone's desk; who "you" is comes from `me.json`.

### Desk view

```
┌──────────────────────────────────────────────┐
│ desk · claude · crm · workstreams · wiki     │  view switcher, drag handle
├───────────────────────┬──────────────────────┤
│ Calendar, next 12 h   │ Tasks | Collab       │  rows open to context and links
│ up next, colours,     │  ▶ work it · copy    │  glowing titles = news (notify)
│ replies, overlaps     ├──────────────────────┤
│ prep card on calls    │ Create Zoom · Meet   │  one line call bar, Say it
├───────────────────────┴──────────────────────┤
│ Terminal tabs: + desktop · + openclaw        │  real Terminal windows running claude
├──────────────────────────────────────────────┤
│ Notes  [tab][tab][+]                         │  named markdown notes
└──────────────────────────────────────────────┘
```

- **Calendar.** A rolling 12 hours from the Mac's calendar (EventKit), drawn the way Apple's own Calendar widget draws it: each event in its calendar's colour, invitations you have not answered drawn hollow with a "needs reply" badge, declined events struck through, overlapping meetings side by side, a "Tomorrow" line when the window crosses midnight. Clicking an event opens a card that strips the invite's boilerplate (dial in numbers, SIP blocks, HTML) down to the agenda, the links, and one **Join** button.
- **Prep cards.** About 25 minutes before any call with other people on it, a background job builds a short card: who is on it, what happened last time (Fireflies), your open tasks with them, recent Slack and the docs that came up. Ten minutes before, a notification goes out and the card opens on the desk.
- **Tasks.** The owner's `TASKS.md`, `## Active` section. Each task opens to a plain language summary of the ask, the decisions and deadlines, and every link it takes to do it (Slack thread, Drive doc, Gmail thread, Fireflies transcript, ClickUp task), each labelled by kind. Ticking a box moves the task to `## Done` with the date, and the ClickUp twin is closed for you.
  - **copy** puts the whole task on the clipboard as markdown, ready to paste into any Claude session.
  - **▶ work it** opens a new thread in the Claude app with the task and a lead line already pasted ("Work this task from my desk widget. Open every linked source before you start, then do it. Drafts only: send or post nothing without asking me."), and stops. Press Enter, or add your own direction first.
  - **Notify mode.** Every 30 minutes from 4:30 am to 11:30 pm, a background job looks for anything new that moves an open task forward: a reply on a linked thread, a meeting that discussed it, a comment on its ClickUp task. The task's title slowly glows violet and a small box says what happened, with the link and a suggested next step. **got it** stops the glow. A task can say exactly what to watch for with a `Watch:` line and what to do with a `When ...:` line.
- **Collab.** The second tab of the Tasks panel: the owner's open ClickUp tasks that are shared with someone else, each with a drop down of context and links built from ClickUp, Slack, Drive and Gmail. Each row has **work it**, **copy** and a branch icon that jumps to the workstream that task belongs to. Double click the tab name to open the owner's ClickUp Focus Board.
- **Call bar.** **Create Zoom** and **Create Google Meet**. One card: name the call, tap the teammates to invite, **Confirm**. The call opens with you as host, each teammate gets their own Slack DM with the join link (and for Meet, a calendar invite), and about 20 seconds later Fireflies is added to the same call. The teammate chips come from `team.tsv`, which keeps itself current from Slack once a day (active people on the company's email domain only; it only ever adds).
- **Say it.** One text box: type or dictate one sentence and it becomes one action. "Start a Meet with Kriss and Ayesha about Supersonics" fills the call card. "Remind me to send Abdul the UDL doc Friday" adds a task. Anything else opens a Claude thread with it pasted.
- **Terminal tabs.** Each tab is a real Terminal window running `claude` in the owner's `AI Tools` folder, parked in the widget's slot. **+ openclaw** opens a tab that runs the command in `openclaw-cmd`, for example an ssh over Tailscale into the OpenClaw server.
- **Notes.** Named markdown files, formatted when read, editable on click.
- **System bar.** CPU, memory and free disk in one line.

### Claude view

The real Claude desktop app, parked in the widget's slot. The widget never redraws another app: it measures a slot and moves the real window over it, so the app keeps every feature it has. Clicking Claude in the Dock flips the widget to this view.

### Workstreams view

The team's work as a top to bottom flow chart in the style of a git graph, newest at the bottom, built from the last three weeks of meetings and every meeting since.

- Each coloured **lane** is a workstream. Stream names come from ClickUp's Goals & Workstreams lists, so the flow and ClickUp use the same words.
- Each **dot** is a meeting that moved that stream. A horizontal stroke ties together the streams one meeting touched. A stream that split off curves out of its parent; a merged stream curves into the one it joined; a finished one ends in a check.
- Click a dot for the meeting's summary, what got done, what is next and who owns it, who said what (Allan first), and the transcript, Slack and Drive links. **copy** or **work it** hands it on.
- **Where things stand** lists the streams in rank order, each with what it is building toward, the days left, and a flag when it has gone quiet for 10 days or passed its target date. Paused streams sit dimmed at the bottom; **Finished or merged** lists what landed. Streams closed more than 3 days ago fold off the timeline behind a dashed bar that brings them back.
- **Team** and **Mine** tabs. Mine keeps only the meetings that gave the owner something to do. **Held up by you** merges the owner's open steps across meetings and streams, and a background check marks each one done when it finds evidence (the task ticked, the ClickUp task closed, the owner's Slack message or sent email), with the proof beside it.
- **Team focus** is one line for the whole team, written by the review. **My focus** is the owner's single most urgent thing.
- When a meeting moves a stream up, the rank change shows beside it for 3 days (violet when it went up), and a move into the top two posts a notification.

### CRM view

The outreach dashboard Ayesha asked for on Oct 5, across MSBAI, Tam Fortis and Nexcavate, with a filter down to one company and a **mine** switch.

- **Do now**: the five most urgent items in view, scored (a person waiting on our reply, overdue follow ups, a pre release proposal with TPOCs still to reach, deadlines inside a week). **I have five minutes** walks the top three one by one with the message ready.
- **Key dates**: a six week calendar of submission windows, TPOC windows and follow up dates, coloured by company.
- **Who has what**: open follow ups, replies and proposals per person, with how many are late.
- **Levels**, as Ayesha set them: **Contracts** (won work to keep healthy), **Leads** (warm, hot, cooling, interested later), **Proposals** (grouped by release state, with TPOC outreach while it is still allowed), **Partners**. Then the **Rolodex** (everyone in the CRM, A to Z) and the **Inbox** (threads waiting on you, each with a suggested reply).
- Opening any person builds a **context card**: who they are, how we met, the gap since we last spoke, what each side promised, cautions, a next step and a suggested message. **Draft it in Gmail** puts a real draft in your Gmail, never sent. **Update the CRM** writes one of four things to ClickUp, only on a click.

### Wiki view

A working demo of the company wiki Allan has asked for: one card per company, three interactive system maps (GURU, the Tam Fortis reactor, PermitPulse), 76 pages, How we work pages, decisions, past work and a glossary. Every page links to its workstream, its open ClickUp tasks, and everywhere the topic lives (ClickUp, Slack, Drive, Fireflies). It is built to become the skeleton that ClickUp mirrors.

---

## 3. How it works underneath

Full detail in [docs/01-architecture.md](docs/01-architecture.md).

**The widget is an [Übersicht](https://tracesof.net/uebersicht/) widget.** One React style file (`msbai-desk.widget/index.jsx`) draws everything. Every 2 minutes it runs one shell command that prints each section's data between markers (`===TASKS===`, `===FLOW===`, `===CRM===`, ...). Each section comes from a small script. A separate 5 second timer reads the system stats.

**Every script prints from its cache instantly, and refreshes in the background when stale.** The `tick` of each script costs nothing; if its data is older than its interval and it is inside its hours, it starts a background job and returns. The widget never waits on the network.

**Every background job is the same pattern:**

```
script builds a prompt file      →  claude -p --model <haiku|sonnet|opus>
(rules + the data it needs)          --permission-mode dontAsk
                                     --allowedTools <only the tools this job needs>
                                  →  the reply must end with a fixed marker line
                                     (ADDED n, PAIRED n, FLOW_END, CRM_END, CU_END, ...)
                                  →  the script parses it and writes its own files
```

- **Connectors, not tokens.** Slack, Gmail, Drive, Calendar, ClickUp, Fireflies and Zoom are reached through the owner's claude.ai connectors, so there is no app login to set up for any of them. The only key on disk is the Fireflies API key (for adding the notetaker to a live call and listing meetings).
- **Least privilege.** Each job's allowed tools are listed in the script. Most jobs get read tools only. A job that writes files usually prints its result and lets the script write, so the model needs no write tool at all. Jobs run in `dontAsk` mode: anything not on the list is refused, not asked about.
- **Nothing is sent.** No job can send an email or post a message, except the Slack DM with a call link, which goes only to the people you picked on the call card.
- **Models.** Haiku for cheap list reads (Collab snapshot, wiki live layer, the team list, Say it). Sonnet for everything that reads and judges. Opus as a fallback when a meeting about defense topics trips Sonnet's safeguards.
- **Schedules.** The widget's own beat starts most jobs, each inside its own hours. One launchd job (`com.msbai.tasks-sync`) runs the task sync and the ClickUp mirror every 5 minutes, even when the widget is closed. All jobs are listed in [docs/08](docs/08-jobs-and-schedules.md).
- **ClickUp's daily limit.** ClickUp allows about 1,000 connector calls a day per account, shared by the widget, any OpenClaw job using that login, and any Claude chat. `cu_limit.zsh` is sourced by every job that uses ClickUp: when a reply says the limit is spent, the reset time is written to `.clickup-blocked`, ClickUp only jobs wait and keep their last good data, and mixed jobs run without their ClickUp tools. Writes wait in a queue and go out after the reset.

---

## 4. How it talks to ClickUp

Full detail, with every id, in [docs/02-clickup-contract.md](docs/02-clickup-contract.md).

**The spaces it uses.** Goals & Workstreams (one folder per program, one list per workstream, plus `00 Goals` and `01 Inbox / Untriaged` lists in each folder) and CRM v3 (Contacts, Organizations, Company Relationships, Follow ups, Interested Later, Opportunities, plus the Proposals list).

**Tasks: one list, two systems.** Two things file tasks from the same meetings: the widget's task sync (into the owner's `TASKS.md`) and Atlas (into ClickUp). `clickup-sync.sh` makes them one list:

- **pair**: each open desk task gets exactly one ClickUp twin per piece of work, usually the task Atlas filed from the same meeting (found by the Fireflies id in the task's transcript link). If none exists after 3 hours (Atlas may be late), one is created in the best fitting workstream list. Every paired or created task is assigned to the owner and tagged `focus-now`, which puts it on their **Focus Board**. The pairing is one line under the desk task:
  `- [ClickUp: <name>](https://app.clickup.com/t/<id>) · synced`
- **merge both ways**: the ClickUp description keeps everything Atlas wrote and gains one `## From <owner>'s desk` section with the desk's context and links. Anything the ClickUp task has that the desk lacks (a link, a deadline, a person, a done when) comes back as a bullet.
- **reconcile** (every 2 hours): duplicates Atlas filed later are folded into one survivor (the Atlas task wins), and the extras are marked complete with "Duplicate of ...". Nothing is deleted.
- **close**: ticking a desk task marks every `· synced` ClickUp task under it complete. If ClickUp closed it first, the desk task gets a note instead of being ticked for you.

**Workstreams: rank and status, written where OpenClaw reads.** After each review, the widget writes (only what changed):

- the **Workstream Board** doc in Goals & Workstreams: active streams in rank order with targets and moves, paused, closed in the last 30 days, rank moves, and a **For OpenClaw** section;
- a status line at the top of each stream's list description: `Workstream status (from the desk review, Oct 6): Rank 1 of 6 | Active | Building toward: ...`, with the rest of the description kept as it was;
- a new list in the company's folder for a ranked active stream that has none, after checking the folder for one that already covers it.

**CRM: Hermes owns the people, the widget adds the work.** The widget reads the whole CRM v3 space in two passes that spend few calls, and writes only four things, each only on a click: close a follow up, create a follow up, create an interested later, add a comment. It never creates or edits Contacts, Organizations or Company Relationships.

---

## 5. Workstreams: lifecycle and ranking

Full detail in [docs/03-workstreams.md](docs/03-workstreams.md).

A **workstream** is a line of work that runs for days or weeks and usually builds toward something: a customer meeting, a submission, a demo, a result Allan asked for. The team drives 3 or 4 main streams at a time; the widget keeps about 6 active at most.

**Each meeting** (one headless run per meeting, oldest first) is read in full and placed into the flow: which streams it moved, whether it started a new one (and from which parent), what each stream is now building toward (`target`, `target_date`), and whether it shows the target happened (then the stream is done, even if more work follows later). The stream name must be a ClickUp list name when one fits.

**The review** looks at the whole board at once, the way Ayesha runs the Monday and Friday AI meetings and the Tuesday to Thursday working sessions. It reads Ayesha's agenda or prep posts in Slack, the last 3 weeks of meetings and the next 2 weeks of the calendar, then:

1. **ranks** the active streams in this week's order of importance (nearest hard deadline with Allan's attention first; what Allan said in the newest meeting outweighs an older agenda post);
2. **closes** what landed, **pauses** what went quiet or lost the focus, **merges** what folded into something else, **reopens** what came back;
3. **splits** real work out of a broad stream (a pursuit with its own deadline and people, or a technical effort Allan tracks by name);
4. gives every active stream a target.

No status changes without a reason. Every change goes into the stream's `history` with the date, who made it (a meeting or the review) and why, so nothing is lost and anything can be reopened. Every new meeting makes a review due, and it runs within half an hour, so a stream Allan pushes up on Monday is first by the time the meeting ends. Each stream keeps its last 20 rank moves with the meeting that caused them.

---

## 6. CRM and Rolodex

Full detail in [docs/04-crm-and-rolodex.md](docs/04-crm-and-rolodex.md).

**Four levels**, as Ayesha set them in the Oct 5 check in:

| Level | What | Why it matters |
|-------|------|----------------|
| 1 Contracts | Won work and active projects: the paid government contracts, the national lab supercomputing allocations, projects like GAIN with Argonne for Tam Fortis | Highest priority: work we already won and must keep |
| 2 Leads | Warm and hot leads, people Allan meets at events, cooling and interested later | The threads that get dropped after events |
| 3 Proposals | Outreach every active proposal needs, TPOCs above all, by release state | TPOCs must be reached in pre release; once a topic is open it is too late |
| 4 Partners | National lab partners (GAIN needs one), hardware partners, teaming partners | Partner setup takes the longest, so it starts first |

**Where the data comes from.** ClickUp's CRM v3 space (kept by Hermes) is read every 3 hours from 6 am to 10 pm. What ClickUp does not hold yet (partners, contract people, key dates) is in `crm-seed.tsv`; names that are never leads are in `crm-exclude.txt`; teammates are left out on their own. People named in business meetings are logged from Fireflies every 3 hours and show in the level that fits, marked new when the CRM does not know them.

**Working from it.** Draft from any row (it finds their address, replies on the latest thread, cc's the outreach capture address so Hermes logs it, and leaves it in Gmail drafts). Batch TPOC asks for a pre release topic, one two part ask per TPOC. Nudge drafts every 3 hours for outreach that has gone 5 business days without an answer. Notify mode every 5 minutes, without a model: a reply waiting, a follow up going past due, a TPOC window closing within 2 days.

**Rolodex, two way.** Every sync writes one markdown page per person to `rolodex/<name>.md`: where it stands, promises, cautions, next step, open ClickUp items, the meetings that named them, sources. Lines marked `· synced` are rewritten each sync; the **From the desk** section is the owner's and never overwritten. Notes added on a card land on the page with the date and also go to ClickUp as a comment. The Rolodex is the CRM's version of `TASKS.md`: the desk's merged view of a person, readable by Claude, OpenClaw or a teammate without calling ClickUp. The pages themselves are never published in this repo.

---

## 7. Company wiki

Full detail in [docs/05-wiki.md](docs/05-wiki.md).

The wiki came out of about 60 meetings where Allan asked for one place to find the company's technology, and it is kept separate from the single source of truth (SSOT) work. Each page says what the thing is, who keeps it, when it was last checked, its future ClickUp home, how it fits, what is current, and its open questions, then **Work on it now** (the matching workstream, what is held up by you, your desk tasks for the page, open ClickUp tasks in its lists) and **Find it everywhere** (ClickUp lists and docs, Slack channels, Drive folders, Fireflies meetings). **Make it a task** adds a desk task that the task sync carries to ClickUp like any other. A live layer reads every open task in Goals & Workstreams every 2 hours so each page shows the work happening on it right now.

---

## 8. What it stores

Full shapes in [docs/07-data-model.md](docs/07-data-model.md). Only what the widget draws is kept locally; everything else stays in ClickUp, Gmail, Slack and Fireflies and is read when needed.

| File | What |
|------|------|
| `~/AI Tools/TASKS.md` | The owner's task list (Active, Waiting On, Someday, Done). The widget's source of truth for their own tasks |
| `.flow/flow.json` | Streams (status, rank, target, history, parent, ClickUp list) and nodes (one per meeting) |
| `.flow/mine.json` | The owner's open steps checked against evidence, grouped; My focus |
| `.crm/crm.json` | The CRM model: items by level, key dates calendar, people index, roster |
| `rolodex/*.md` | One page per person |
| `wiki.json` | Wiki pages, maps, glossary, ClickUp lists and folders |
| `.wiki/live.json` | Every open task in Goals & Workstreams |
| `.watch/alerts.json` | News per task for notify mode |
| `streams.tsv` | ClickUp list id, program, list name: the shared vocabulary for workstreams |
| `me.json` | Who this copy belongs to |
| `team.tsv` | Teammates for the call card |

---

## 9. What it will never do

These are rules in the code and in every prompt, not intentions:

- **Never send or post.** No email is sent; drafts only. No Slack message is posted except the call link DM to people you picked on the card.
- **Never delete anything in ClickUp.** No delete, archive, merge, move or reassign anywhere. `clickup_merge_tasks` is never used (it deletes tasks). A duplicate is marked complete with a pointer to its survivor.
- **Never change someone else's ClickUp task.** Descriptions are rewritten only on tasks assigned only to the owner.
- **Never create or edit CRM people.** Contacts, Organizations and Company Relationships belong to Hermes.
- **Never write without a click** in the CRM. Every write is queued, shown as pending, checked against duplicates twice, and reported back as sent or failed.
- **Never invent.** Every link must be one a tool actually returned. A meeting with nothing for the owner adds nothing.

---

## 10. For OpenClaw

Full comparison and the decisions to make in [docs/09-openclaw-alignment.md](docs/09-openclaw-alignment.md). The short version:

- **Shared key.** The widget keys a workstream to its **ClickUp list id** (`streams.tsv`). OpenClaw keys workstreams as sub properties of contracts in its own JSON. Agreeing on the ClickUp list id as the one key would let the two match 100 percent instead of by meaning.
- **Lifecycle.** The widget's streams carry status (active, paused, done, merged), rank with history, target and target date, parent and merge links, and a dated reason for every change. OpenClaw's definitions describe what a stream is, which is what new tasks are matched against. Both are needed; the question is where each lives.
- **Where to read the widget's view.** The Workstream Board doc, the status line on each list, and the `· synced` pairing lines. Today the status line is text at the top of a description; custom fields would make it queryable.
- **Task completion** is the gap both sides feel. The widget closes ClickUp tasks when a desk task is ticked, and checks the owner's Slack, sent mail and ClickUp for evidence a step is done. Spreading that to every teammate's widget is how completion gets caught without anyone updating ClickUp by hand.

---

## 11. Setting it up for a teammate

Step by step in [docs/10-setup.md](docs/10-setup.md). In short: a Mac with Übersicht and the Claude desktop app, Claude Code signed in with the teammate's claude.ai account and connectors (Slack, Gmail, Drive, Calendar, ClickUp, Fireflies, Zoom), then:

```bash
cp examples/me.example.json config/me.json     # fill in who you are
python3 tools/personalize.py config/me.json     # installs to ~/AI Tools/desk-widget
```

Then the Fireflies key, the Übersicht link, the launchd job, and the first build of the workstreams flow.

---

## 12. Repo layout

```
MSBAI-Widget/
├── README.md                    this file
├── docs/                        the reference docs listed at the top
├── src/desk-widget/             the framework code, with {{PLACEHOLDERS}} for the owner
│   ├── msbai-desk.widget/index.jsx    the whole widget UI
│   ├── tasks-sync.sh/.md        meetings and Slack → TASKS.md
│   ├── clickup-sync.sh/.md      TASKS.md ↔ ClickUp (pair, reconcile, close, Collab)
│   ├── flow.sh, flow_review.py  workstreams: per meeting, review, ClickUp push
│   ├── mine.sh                  the owner's open steps and focus
│   ├── crm.sh, crm_*.py         CRM, Rolodex, drafts, nudges, notify, push
│   ├── emails.sh                the Inbox and suggested replies
│   ├── wiki.sh, wiki_build.py, wiki_v2.py, wiki.json   the wiki
│   ├── watch.sh                 notify mode for tasks
│   ├── prep.sh                  prep cards
│   ├── zoom.sh, team.sh, cmd.sh calls, the team list, Say it
│   ├── cal.sh, gcal.*, dock.sh, notes.sh, fireflies.sh, voice.sh, listen.swift
│   ├── cu_limit.zsh             the shared ClickUp daily limit guard
│   ├── streams.tsv              ClickUp workstream lists
│   └── com.msbai.tasks-sync.plist     the launchd job
├── examples/                    starter files with made up people (me, team, CRM seed, TASKS.md)
├── config/                      your own me.json goes here (ignored by git)
└── tools/
    ├── export_from_desk.py      refresh src/ from a live widget, personal values taken out
    ├── personalize.py           install a copy for one teammate
    └── leak_check.py            fail if anything personal or secret is in the repo
```

---

## Keeping this repo clean

The widget changes almost daily, so `src/` is refreshed from a live copy instead of edited by hand:

```bash
python3 tools/export_from_desk.py              # from ~/AI Tools/desk-widget
git diff                                       # read what changed
git add -A && git commit -m "Refresh from desk"
```

`export_from_desk.py` copies only the framework files on its allow list. It never copies `TASKS.md`, transcripts, notes, the Rolodex, `me.json`, `team.tsv`, the CRM seed or exclude lists, any state folder (`.crm`, `.flow`, `.watch`, `.emails`, `.prep`, `.zoom`, `.wiki`, `.tasks-sync`), backups, vendor packs, or any key or token. It swaps the owner's name, email, Slack id, ClickUp id, home folder and Focus Board link for placeholders, checks the Fireflies key appears nowhere, then runs `leak_check.py`, which fails on any token, key, personal id, stray email address or forbidden file. Run the leak check by itself any time:

```bash
python3 tools/leak_check.py
```

The repo still describes company structure (ClickUp ids, Slack channel names, program names, Drive links in the wiki content). Keep it **private** to the team and OpenClaw.

---

## 14. Built, and not built yet

**Built and running daily:** everything in sections 2 to 9.

**Not built yet**, from the Oct 5 conversations:

- **Choosing tools per person.** A teammate who does not need the CRM (Aras, for example) should be able to leave it out at install. Today every copy gets every view.
- **Owner neutral prompts everywhere.** Some prompts still describe the owner's role in words written for the first owner (for example "operations, BD and technical coordination"). Names and ids are placeholders, but those role sentences should read from `me.json`'s `role`.
- **Direct OpenClaw link.** The widget talks to ClickUp only. Reading Hermes's CRM files directly (everything lives under the Hermes Agent folder on the OpenClaw server) would let the CRM tab use the full email history Hermes holds; that needs a path and permissions from OpenClaw.
- **The SSOT web app** is separate. The widget is for internal people; the single source of truth needs a web app for people outside the company, with access by role.
- **Calendar**: a multi day view, editing an existing event, and proposing a new time.
