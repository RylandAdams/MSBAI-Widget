# 06 Tasks, notify mode, prep cards and calls

## TASKS.md

Each owner's tasks live in `~/AI Tools/TASKS.md`, in sections `## Active`, `## Waiting On`, `## Someday`, `## Done`. The widget reads `## Active`. It never writes a task itself; it only ticks boxes (and adds one when you use Say it or Make it a task).

The format, which every Claude session and every job follows:

```
- [ ] **Imperative title** - [MSBAI] for Ayesha · due Tue Sep 22 · from <meeting> (Sep 21)
  - One plain language sentence: what was asked, by whom, why. Acronyms expanded.
  - Decisions, deadlines, numbers, open questions: 2 to 5 bullets.
  - Ayesha at 35:51: "the exact words of the ask, when they help"
  - [Slack: what the thread is](https://msbai.slack.com/archives/...)
  - [Drive: document name](https://docs.google.com/...)
  - [Gmail: subject](https://mail.google.com/mail/u/0/#all/<threadId>)
  - [Transcript: meeting name](https://app.fireflies.ai/view/<id>)
  - [ClickUp: task name](https://app.clickup.com/t/<id>) · synced
  - Watch: Gmail from support@example.com mentioning INC0451620
  - When support replies: tell the requester in the thread, then ...
  - Source: transcripts/YYYY-MM-DD-slug.md
```

- The meta line carries the company tag (`[MSBAI]`, `[Tam Fortis]`, `[Nexcavate]`), who it is for, a due date only if one was said, and where it came from.
- Link labels start with a kind (`Slack:`, `Drive:`, `Gmail:`, `Transcript:`, `ClickUp:`), which the widget sets off. Only URLs a tool actually returned.
- `Watch:` and `When ...:` lines tell notify mode what to look for and what to do.
- Ticking moves the whole entry to `## Done` and appends `· done YYYY-MM-DD`.

**On the desk:**

- **Reorder.** Hold a row and drag it up or down (`beginTaskDrag`). A drag only starts after the pointer moves a few pixels, so a click still opens the row, and text selection is off while dragging. The order is saved per Mac in `msbai_task_order` and does not change `TASKS.md`.
- **Sticky note colours.** Rest the pointer on the far right edge of a row for about half a second (`MARK_HOVER_MS`, 550 ms): a tray slides out with pink `#FF9ECF`, yellow `#FFE566` and blue `#8FD8FF`, and a clear. Saved per Mac in `msbai_task_marks`. The task list draws no scrollbar, so the hot edge is never under one.

## Where tasks come from (`tasks-sync.sh`, rules in `tasks-sync.md`)

launchd runs it every 5 minutes; it skips 10 pm to 4 am. A run with no new meeting only checks Fireflies and stops, unless the Slack sweep is due (every 30 minutes).

1. `fireflies.sh refresh`, then fetch each new meeting into `transcripts/`. A transcript with no sentences yet is retried next run; a meeting whose participant list does not include the owner is skipped.
2. A headless Sonnet gets the rules, the transcripts, and a Slack window starting 15 minutes before the last good run. In Slack it searches @mentions of the owner, DMs and group DMs, and the owner's own messages (for promises like "I'll send that"), and reads each thread before deciding.
3. **What counts**: someone asks the owner by name or @mention; a DM asks for something; the owner committed; a request to a small group the owner has a real part in. **What does not**: broadcasts, other people's tasks, anything already done in the thread, anything already in TASKS.md (Active or Done). One ask in a meeting and a Slack thread is one task with both links.
4. Fireflies name fixes: Alan or Allen is Allan Grosvenor; Chris is Kriss Gardner; Aisha is Ayesha Dewan; Araz is Aras Dogan; Dewyer is Dwyer Deighan.
5. It runs in `dontAsk` with read only Slack, Fireflies, Drive, Gmail and ClickUp tools, and `Edit` on TASKS.md only. It inserts new tasks at the end of `## Active` and must end with `ADDED n: ...`; without that line the run counts as failed and the window does not move.
6. New tasks post a notification.

## The ClickUp mirror (`clickup-sync.sh`, rules in `clickup-sync.md`)

Runs right after the task sync. Full rules in [02 ClickUp contract](02-clickup-contract.md#tasks-clickup-syncsh-rules-in-clickup-syncmd). Four jobs:

| Job | When | Model | Does |
|-----|------|-------|------|
| close | Whenever a ticked task has synced ids not yet closed, any hour | Haiku | Marks those ClickUp tasks complete |
| pair | When the set of unpaired Active tasks changes, else every 30 min, 4 am to 10 pm | Sonnet | Finds or creates each twin, adds `focus-now`, merges content both ways, writes the `· synced` line |
| reconcile | Every 2 h, 6 am to 10 pm | Sonnet | Folds duplicates Atlas filed later into one survivor; merges new content |
| snapshot | Every 30 min, 6 am to 10 pm | Haiku (retried once on Sonnet) | The Collab tab: owner's open tasks shared with someone else |

**Waiting for Atlas.** A desk task from a meeting held less than 3 hours ago is not given a new ClickUp task: Atlas may not have filed its own yet. This wait is what keeps the two systems from double filing.

**Final line**: `PAIRED <n> CREATED <m> WAITING <k> TAGGED <t> MERGED <d> ENRICHED <e>: <notes>`.

## Collab

The second tab in the Tasks panel. `.clickup-collab.tsv`: one line per shared task (`id, status, due, list name, other assignees, date_updated, name`). For each task that is new or changed (at most 4 a run), a Sonnet run builds the drop down in `.clickup-collab-notes.tsv`: two to four plain sentences (what it is, who asked, the state, the owner's part), every link in the description, and up to 3 more found in Slack, Drive and Gmail. Each row has **work it**, **copy** and a branch icon that opens Workstreams on the stream whose ClickUp list holds the task.

## Notify mode (`watch.sh`)

Every 30 minutes from 4:30 am to 11:30 pm (`WATCH_EVERY`, `WATCH_START_MIN`, `WATCH_END_MIN`), a headless Sonnet reads the Active tasks and looks for anything new since the last good run (15 minutes of overlap; 48 hours on the very first run) that moves one forward:

- a reply on a linked email or Slack thread,
- an email or message a `Watch:` line asks for,
- a meeting that discussed it,
- a comment on its ClickUp task,
- a doc it was waiting on being shared.

**Linked Slack threads are always read.** Before the run, the script pulls every Slack thread linked from an open task (channel id and thread timestamp, taken from the permalink, `thread_ts` when it is a reply) into a "Linked Slack threads" list at the end of the prompt. The model must call `slack_read_thread` on every one of them first, and keep every reply newer than the cutoff from anyone other than the owner, even if it does not mention them: teammates often reply to each other on the owner's tasks (setting up a call, taking an item, answering a question), and that is news. Only then does it search Slack for messages to, from or mentioning the owner. Every other source is checked cheapest first (Gmail search, then Fireflies, then ClickUp only when something hints at news), and links other than Slack threads are not chased one by one.

**Beyond the linked threads.** The prompt also lists the Slack channels the linked threads live in and the teammates named on each task (matched against `team.tsv`, with their Slack ids). The model reads new top level posts in those channels that are about one of the tasks, and searches each of those teammates' messages since the cutoff, so news posted in a new thread, another channel or a group DM still counts.

**Updates are kept on the task.** After a run, `watch_notes.py` writes each update into the task's notes in `TASKS.md` as a dated `Update` bullet (skipping one whose link the task already has). It survives **got it**, and the next ClickUp sync carries it to the twin with the rest of the notes.

Read only Gmail, Slack, Fireflies, Drive and ClickUp tools; it can never send, post or edit. Each hit becomes an alert in `.watch/alerts.json`: `{title: [{id, src, url, when, what, next, found}]}`, with a notification. The task moves up under the pinned ones, its title shimmers violet, and a box says what happened (with the link) and the suggested next step. **work it** puts the news in the brief under "New since last check". **got it** stops the glow (`.watch/seen`) until something else lands.

## Work it

On any open task, Collab row, workstream node or CRM card. It builds the same brief **copy** does, puts the lead line on top (`CFG.workItLead`), switches to the Claude view, and runs `dock.sh claude-new`: wait for the app, Cmd+N for a new thread, paste, stop. The thread is ready but not sent (`CFG.workItSend: false`), so the owner presses Enter or adds direction first. It is keystrokes through System Events, so it needs Accessibility permission.

## Prep cards (`prep.sh`)

On each beat, `prep.sh tick` reads `.cal-last` (the calendar the widget just read, so EventKit permission stays with Übersicht). A call qualifies when it is timed, not cancelled or declined, and has at least one other attendee. 25 minutes before it starts (`PREP_AHEAD`), a headless Sonnet builds a short card once: who is on it, what happened last time (Fireflies), the owner's open tasks with them (TASKS.md), recent Slack, the docs that came up. 10 minutes before (`PREP_NOTIFY`), a notification goes out and the **heads up** card opens on the desk, once: a countdown ring in the event's colour, who is coming, **Join**, and the prep. The prep also sits in that event's detail card. Read only.

## The event card

Clicking a calendar event opens a glass card (`evCard`) that animates in:

- a live state: starts in, **happening now** with the minutes left (a soft green pulse), or ended;
- the length, the calendar, and the organizer;
- **people**: everyone on the invite with initials, name and RSVP state (accepted, maybe, declined, no reply), from EventKit (`cal.sh` emits `name|status|email|me` for each person, joined by `;;`, plus the organizer); the first few show, the rest behind **more**;
- your own RSVP: accept, maybe, decline;
- the agenda with the invite's boilerplate stripped, the links, the prep brief;
- **Join** for Zoom, Meet, Teams, Webex and other meeting links.

The close button sits above the header (`z-index`) so it always takes the click. Every pulse animates only `transform` and `opacity` on pseudo elements, never `box-shadow`, so it stays at full frame rate.

## Calls (`zoom.sh`, `team.sh`)

The **Meet** pill above the calendar opens the call tile (`meetCss`): an animated camera badge, Zoom and Google Meet as two cards, a name, a chip per teammate (from `team.tsv`, tap to toggle), **Confirm**. `zoom.sh start`:

1. A headless Haiku creates the call. Zoom: an instant meeting through the Zoom connector. Meet: a calendar event starting now (30 minutes, `ZOOM_MEET_MIN`) with a Meet link and the picked teammates as guests, so they also get Google's invite.
2. The start link opens with the owner as host; the join link goes on the clipboard. The card answers here; the rest runs in the background.
3. A headless Haiku sends each picked teammate their own Slack DM: "Here's the link to join the meeting: <link>". DMs go to the Slack ids in `team.tsv`, so nobody is looked up by name and nobody else can be messaged. Meet invites go to the email in `team.tsv`, which should be the address the person actually uses (a teammate who signs in to Slack with a personal address gets the invite there).
4. 20 seconds after the call opens (`ZOOM_FF_DELAY`), Fireflies is added through its API (`addToLiveMeeting`), with one retry 45 seconds later.

Anything that fails posts a notification and shows ✗ in the panel. Google Meet is there because a free Zoom account ends calls at 40 minutes.

**The team list.** `team.sh` reads the members of #general once a day (7 am to 10 pm, Haiku) and adds active, non bot accounts on the owner's own email domain (from `me.json`). It only adds, and never rewrites an existing row, so an email fixed by hand stays fixed: a new teammate goes at the end under their first name and the card says "New from Slack" for a week. Someone no longer active gets a note and a "Take off the list" link. The first run records everyone already there without adding them, so people left off on purpose stay off.

## Say it (`cmd.sh`)

One text box (type, or the Mac's dictation key). A fast model with no tools sorts the sentence into one action:

- `{"action":"call","kind":"zoom"|"meet","topic":"...","people":[...]}`: the call card opens filled in; you press Confirm.
- `{"action":"task","title":"...","due":"..."}`: added to the top of Active.
- `{"action":"claude","prompt":"..."}`: a new Claude thread with it pasted, not sent.

## Terminal tabs and OpenClaw (off)

Switched off on Oct 7 (`CFG.terminal: false`) so Calendar and Tasks get the room; set it to `true` to bring them back. Each tab is a real Terminal window running `claude` in `~/AI Tools`, parked in the desk's slot; only one shows at a time. **+ openclaw** opens a tab that runs the first non comment line of `openclaw-cmd`, for example `ssh -t openclaw-vps "cd ~/openclaw && claude"` over Tailscale.
