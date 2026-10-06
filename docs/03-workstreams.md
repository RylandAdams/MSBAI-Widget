# 03 Workstreams

How meetings become workstreams, how streams open and close, how they are ranked, and what is written to ClickUp. Code: `flow.sh`, `flow_review.py`, `mine.sh`. State: `.flow/flow.json`, `.flow/mine.json`.

## What a workstream is

A line of work that runs for days or weeks and usually builds toward something: a customer meeting, a proposal submission, a demo, a result Allan asked for. At any time the team drives 3 or 4 main streams, sometimes one big focus for the week. The widget keeps about 6 active at most so the board stays readable.

Every stream has:

| Field | Meaning |
|-------|---------|
| `id` | The widget's own id for the stream |
| `name` | A ClickUp workstream list name when one fits (from `streams.tsv`); otherwise a new name, shown as not in ClickUp |
| `clickup` | The ClickUp list name it matches, or empty |
| `company` | MSBAI, Tam Fortis or Nexcavate |
| `status` | `active`, `paused`, `done`; a merged stream is `done` with `ended: "merged"` and `mergedInto` |
| `now`, `next` | Where it stands, the next step |
| `target`, `target_date` | What it is building toward, and by when |
| `rank`, `rankWhy` | Its place in this week's order (active streams only), and why |
| `ranks` | The last 20 rank moves: `{date, from, to, after}` where `after` names the meeting or review that caused it |
| `moved` | The latest move, shown beside the rank for 3 days |
| `history` | Every status change: `{date, from, to, why, by}` where `by` is a meeting or the review |
| `bornFrom`, `parent` | The meeting that started it and the stream it split off |
| `ended`, `why`, `endNode` | How and why it ended, and the meeting that closed it |
| `flag` | "quiet 10 days" or "target date passed" |
| `color` | Its lane colour |

A **node** is one meeting that moved one or more streams:

| Field | Meaning |
|-------|---------|
| `id`, `meeting`, `date`, `meetingTitle`, `transcript` | Which meeting, and its Fireflies link |
| `title` | Short name for what the meeting was about |
| `streams` | The streams it moved |
| `spawns` | The streams it started |
| `summary` | Two or three plain sentences |
| `done` | What got done or decided |
| `next` | `[{what, who}]` what happens next and who owns it |
| `said` | `[{who, what}]` the few points that steer the work, Allan's first |
| `links` | `[{kind, label, url}]` Slack, Drive, ClickUp, Web; only URLs a tool returned |

## Pass 1: each meeting (`flow.sh worker`)

1. **Queue.** The first beat queues every Fireflies meeting from the last 3 weeks, oldest first. After that, each meeting the task sync fetches is queued once it is at least an hour old (so the transcript exists) and at least 8 minutes long. A meeting being read is marked as current so a refresh cannot queue it twice.
2. **Read.** One headless Sonnet run per meeting. It gets the full transcript (names Fireflies mangles are fixed: Alan or Allen is Allan Grosvenor, Chris is Kriss Gardner, Aisha is Ayesha Dewan, Araz is Aras Dogan, Dewyer is Dwyer Deighan), the current flow (every stream with status, target, now, next and its last two meetings), and the ClickUp workstream list names.
3. **Answer** with one JSON patch between `FLOW_START` and `FLOW_END`:

```json
{"skip": false,
 "node": {"title": "...", "summary": "...", "done": ["..."],
          "next": [{"what": "...", "who": "Kriss"}],
          "said": [{"who": "Allan", "what": "..."}],
          "links": [{"kind": "Slack", "label": "...", "url": "..."}]},
 "streams": ["ids of existing streams this meeting moved"],
 "new_streams": [{"name": "...", "clickup": "list name or empty", "company": "MSBAI",
                  "now": "...", "next": "...", "branch_from": "parent id or empty",
                  "target": "...", "target_date": "YYYY-MM-DD"}],
 "stream_updates": [{"id": "...", "status": "active|paused|done|merged", "into": "for merged",
                     "why": "one line", "now": "...", "next": "...", "target": "...", "target_date": "..."}],
 "focus": "only if this meeting set the team's big focus for the week"}
```

4. **Rules in the prompt.** List only streams where something was decided, finished or handed off; fold side topics into the summary. Use a broad list (BizDev & Proposal Research Pipeline) rather than a stream per pursuit, except a pursuit with its own deadline and people (the Supersonics challenge, a NASA phase, an Army proposal) or a technical effort Allan tracks by name. When the meeting shows the target happened, mark the stream done with why, even if more work follows. On hold or focus moved away: paused. A paused stream that comes back: active. A meeting that moved no work (social, a test call): `{"skip": true}`. Never invent.
5. **Apply.** `flow.sh` merges the patch into `flow.json`. A meeting read late (an older one retried) links itself to its streams but never overrides what a newer meeting said. New streams are checked against existing ones by distinctive words (ApexGlide, Supersonics) so the same work never gets two streams.
6. **Failures never drop a meeting.** A reply without `FLOW_END` is retried on Opus (defense topics can trip Sonnet's safeguards). One that still fails goes to `.flow/failed`; the header shows how many; `flow.sh retry` reads them again.

## Pass 2: the review (`flow_review.py`, run by `flow.sh review`)

A single meeting rarely says "that stream is finished". The review looks at the whole board the way Ayesha runs the Monday and Friday AI meetings and the Tuesday to Thursday working sessions: a focus list of the items Allan wants, in his order.

**When.** Every new meeting makes a review due, and it runs within 30 minutes (`FLOW_REVIEW_GAP`), and at least once a day (`FLOW_REVIEW_EVERY`), 6 am to 10 pm.

**What it reads.**

- Ayesha's agenda or prep posts in Slack from the last 10 days (searched by her Slack id with words like agenda, prep, priorities, focus, in this order).
- Every stream, with facts worked out without a model: meetings count, last meeting, days quiet, target date passed.
- Every meeting in the last 21 days: summary, done, next.
- The calendar for the next 14 days.
- The ClickUp workstream list names.

**What it decides.**

1. Status for every stream: active, paused, done (say what landed), merged (give `into`). Only what the evidence supports, cited in `why` (the meeting date and title, or the Slack post).
2. **Rank** the active streams, most important first, the way Allan and Ayesha would order the agenda this week. Nearest hard deadline with Allan's attention first. What Allan said in the newest meeting outweighs an older agenda post, so a stream he pushed up today goes up.
3. **Split** real work hiding inside a broad stream into its own, naming the meetings that belong to it, after checking it is not already a stream under another name.
4. **Move** a stream to the ClickUp list its work really belongs to (the hypersonic dive convergence work is the SU2 Validation & Hypersonic Cases list, not Kestrel).
5. A target and target date for every active stream.
6. The **board**: the focus items as Ayesha or Allan put them, each tied to a stream, with the source link and date.
7. **Team focus**: at most 16 words on what the whole team is driving this week.
8. **Questions** a person should settle (two streams that might be one); shown under **To settle**.

**Answer** between `REVIEW_START` and `REVIEW_END`:

```json
{"ranking": [{"id": "...", "why": "..."}],
 "updates": [{"id": "...", "status": "...", "into": "...", "why": "...", "target": "...",
              "target_date": "...", "now": "...", "next": "...", "clickup": "..."}],
 "new_streams": [{"name": "...", "clickup": "...", "company": "...", "from": "...",
                  "nodes": ["..."], "now": "...", "next": "...", "target": "...", "target_date": "..."}],
 "board": [{"item": "...", "stream": "..."}], "board_source": "...", "board_date": "...",
 "team_focus": "...", "team_focus_why": "...", "questions": ["..."]}
```

**Apply** (`flow_review.py apply`, in code, not trusted to the model): a status change without a `why` is refused; a merge into itself or into a missing stream is refused; every change is written to `history`; a rank change appends to `ranks` (last 20 kept) and sets `moved`; a stream moving into the top two, or out of first, posts one notification (7 am to 9 pm).

## Pass 3: the owner's steps (`mine.sh`)

Every 30 minutes (6 am to midnight, when the flow builder is idle) a headless Sonnet checks each open step the flow gives the owner (`next` items whose `who` is them) against:

- `TASKS.md` (ticked into Done),
- their ClickUp tasks (closed),
- their own Slack messages,
- their sent Gmail.

A step with clear evidence is marked `done` with the evidence and a link; one a later meeting made moot is `dropped`. It also groups the same work asked for in several meetings into one entry ("Held up by you", with every stream's colour and a count), and rewrites **My focus**: the owner's single most urgent thing, weighted toward what Allan said most recently. Read only everywhere.

This is how completion gets caught without anyone updating ClickUp: the owner's widget sees that they sent the doc in a DM and closes the step.

## Pass 4: write to ClickUp (`flow.sh cupush`)

After each review, `flow_review.py cuplan` works out what changed since the last push (`.flow/cu-pushed.json` keeps a signature per list and a hash of the board). If nothing changed, no ClickUp calls are spent. Otherwise one headless Sonnet run does exactly the planned steps:

1. **Workstream Board doc** in Goals & Workstreams (found by name or created once, then its page is replaced). Sections: Active, in order (rank, stream, building toward, by, moved, why it sits here); Paused; Finished or merged, last 30 days; Rank moves, last 14 days; For OpenClaw.
2. **Each changed stream's list description** gets a first paragraph like:
   `Workstream status (from the desk review, Oct 6): Rank 1 of 6 | Active | Building toward: NASA Phase II submission, Oct 30`
   Any earlier status paragraph is dropped; the rest of the description is kept as it was. Only the stream named after a list writes on it, never a pursuit merely filed under a broad list.
3. **A ranked active stream with no list** gets one in its company's folder, after checking the folder for a list that already covers it (at most 2 a run), and is added to `streams.tsv`.

While ClickUp's daily limit is spent, the push waits (`.flow/cupush-due`) and goes on the first beat after the reset.

## The board in the widget

- **Timeline**: lanes, dots, merges and splits; closed streams older than 3 days fold behind a dashed bar.
- **Where things stand**: streams by rank with target, days left, quiet or overdue flags; paused dimmed; Closed grouped by This week, Last week, Earlier.
- **Team | Mine**: Mine keeps the meetings that gave the owner something to do, with their open steps on top and the done ones folded underneath.
- **A stream's page**: rank and why, target, status history, every meeting.
- **Shared page**: the same flow is published as a private claude.ai page (Team Workstreams); a scheduled task copies `flow.json` there every two hours on weekdays.
