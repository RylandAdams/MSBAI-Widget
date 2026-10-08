# 09 OpenClaw alignment

**Who this is for:** Kriss, and OpenClaw itself when Kriss shares this repo with it.

**Why it exists:** on Oct 5 Kriss asked for the widget's code so Claude could compare it with what OpenClaw does with ClickUp and find where task and workstream matching differ, and Ryland offered a breakdown of how the widget organizes the wiki, the workstreams and the email CRM. Ideally the two would match 100 percent, so a task the widget sees and a task OpenClaw files are always recognized as the same work.

**Done when:** Kriss can put this next to OpenClaw's data model and decide whether OpenClaw reorganizes how it stores workstream and wiki data, or keeps its current model. The decisions are listed at the end.

---

## OpenClaw's model, as Kriss described it on Oct 5

This is only what was said in the Oct 5 calls; OpenClaw's own code is the authority.

- **One large JSON (plus SQL)** holds the contracts the company is engaged in. Each contract has a sub property listing the workstreams defined inside it. That is how OpenClaw creates subcategories and tasks: one big id reference of everything being tracked.
- **A task table**, foreign keyed to that JSON.
- **Filing a task:** list the workstreams that exist, pick the definition that best matches what the task is doing, assign it there, or create a new section if nothing is close enough.
- **Data federation:** each agent owns its own tables and is the authority for their schema, so schemas do not change by accident, and an agent that changes its schema also fixes the app's queries. A separate ETL copy was considered and dropped because the copy and OpenClaw would drift apart.
- **SSOT API** in progress: a local Postgres for metadata, possibly Clerk for sign in, Tailscale for access for now, a domain later; a demo app expected.
- **Open choice:** keep building the web app, or open APIs so widgets can pull OpenClaw data directly.
- **Considering an SSOT agent** to handle permissions.
- **Hermes Agent** holds the CRM: SQL files and memories, about 8,000 to 9,000 past emails loaded, threads connected, recent opportunities flagged. All agents can read each other's files today.
- **Atlas** turns every Fireflies meeting into ClickUp tasks in Goals & Workstreams.
- **Repo:** OpenClaw's app goes in a git repo so OpenClaw can change it and any breaking change can be reverted.

## The widget's model

| Concept | How the widget holds it | Where |
|---------|-------------------------|-------|
| Company | Three companies, each with a colour and a system (GURU, the reactor, PermitPulse) | `wiki.json` companies |
| Program | A ClickUp folder in Goals & Workstreams (MSBAI Phase III HPCMP, Phase I NASA, Phase II OrbitGuard, Cross Cutting; Tam Fortis; Nexcavate) | `streams.tsv` column 2 |
| Workstream (identity) | **A ClickUp list.** The list id is the key; the list name is the stream's name | `streams.tsv` |
| Workstream (state) | Status, rank, target, target date, parent, merged into, a dated history of every change, the meetings that moved it | `.flow/flow.json` streams, then ClickUp (Board doc, list description) |
| Meeting | A node: summary, done, next with owners, who said what, links | `.flow/flow.json` nodes |
| Task (the owner's) | A TASKS.md entry, paired 1 to 1 with a ClickUp task by a `· synced` line | `TASKS.md`, ClickUp |
| Task (the team's) | A ClickUp task in a workstream list; its stream is the list it sits in | ClickUp, `.wiki/live.json`, Collab |
| Step done | Evidence from the owner's Slack, sent mail, ticks and closed ClickUp tasks | `.flow/mine.json` |
| Wiki page | A page linked to its workstream and its ClickUp lists | `wiki.json` |
| Person (CRM) | ClickUp CRM v3 records (Hermes), merged into one Rolodex page per person | `.crm/crm.json`, `rolodex/` |
| Outreach item | Contract, lead, proposal, partner, follow up, interested later, mention, email, with a score | `.crm/crm.json` |
| Pursuit timeline and bid gate | Per open proposal: 7 weeks, 21, 14, 7 days; 3 customer conversations by 14 days out | `.crm/plus.json` pursuits |
| Customer type | buyer, end user, TPOC, customer side, partner, peer, typed from Hermes's fields | `.crm/plus.json` types |
| Campaign | One per open pursuit with customer people (made on its own), plus hand made lists; targets by stage, TPOCs first | `.crm/plus.json` campaigns, `campaigns.json` |

## Side by side

| Question | Widget | OpenClaw (as described) | Match today |
|----------|--------|--------------------------|-------------|
| What is the top level? | Company, then program folder | Contract | Partly. A program folder often is one contract (OrbitGuard, NASA Phase I, HPCMP Phase III); Cross Cutting holds many streams with no contract; Tam Fortis and Nexcavate are one folder each |
| What identifies a workstream? | ClickUp list id | A sub property of a contract in OpenClaw's JSON | **By meaning only.** Nothing ties an OpenClaw workstream to a ClickUp list id |
| How is a task placed in a stream? | By the list it sits in | Best matching definition, or a new section | Different. The widget trusts the list; OpenClaw judges by description |
| Can streams end? | Yes: active, paused, done (target happened), merged, reopened, each with why | Not described | Widget only |
| Is there an order of importance? | Yes: ranked by the review, written to ClickUp, moves after each meeting | Not described | Widget only |
| What is each stream building toward? | `target`, `target_date` | Not described | Widget only |
| Who files tasks from meetings? | The widget files only its owner's own asks (into TASKS.md) and pairs them with Atlas's | Atlas files every task for everyone | Two writers, reconciled by the widget |
| How is a task known done? | Desk tick closes the ClickUp twin; the owner's Slack, sent mail and closed tasks count as evidence | Not described; Kriss: completion is "the biggest bane of our current setup" | The widget closes the owner's tasks; nothing closes other people's |
| Where does the CRM live? | Reads ClickUp CRM v3 hourly through the REST API; writes nothing | Hermes's SQL and memories, synced to ClickUp CRM v3 hourly | Same records through ClickUp, including the Conversations list Hermes captures |
| Wiki | 76 pages, linked to lists and streams | Not part of OpenClaw | Widget only |

## Where the two drift today

These are real cases, not guesses.

1. **Matching by meaning misses.** For the UDL ask from the Oct 2 meeting, Kriss said what OpenClaw generated for him "would be a complete miss". Atlas also assigned a "get Abdul a new UDL login" task to Kriss, and he said that "for some reason" it landed on him. A shared key (below) and owner matching by Slack and ClickUp id would remove most of these.
2. **Duplicates.** Atlas and the desk sync file from the same meeting. The widget waits 3 hours for Atlas before creating anything, and its reconcile pass folds later duplicates into the Atlas task. That works, but it is cleanup after the fact.
3. **Stream sprawl.** "Create a new section if nothing is close enough" tends to make many near duplicates. The widget fights the same pull with explicit rules: about 6 active streams, a broad list for routine pursuits, its own stream only for work with its own deadline and people, and a duplicate check by distinctive words (ApexGlide, Supersonics) before any new stream.
4. **Streams never close.** A stream that builds to an event is done when the event happens. Without that, every list looks active forever and nobody can tell what matters this week.
5. **Rank is text.** The widget's rank and status reach ClickUp as a paragraph at the top of each list's description and as the Workstream Board doc. A person can read them; a program has to parse them.
6. **No direct line.** The widget reads ClickUp only. It does not read OpenClaw's JSON or Hermes's files, and OpenClaw does not read the widget's files.
7. **One ClickUp budget.** About 1,000 connector calls a day per account, shared by the widget, OpenClaw jobs on the same login, and Claude chats. On Oct 6 it was spent by about 9 am Pacific, and every ClickUp job waited until the reset. Since Oct 7 the widget's CRM reads through the REST API with the owner's token instead, which has no daily cap; OpenClaw could do the same for its own heavy reads.

## Division of labor (proposed Oct 7)

So the widget never does what OpenClaw already does, the CRM is split like this:

| OpenClaw (Hermes and friends) | The widget |
|-------------------------------|------------|
| Finds and opens pursuits (puts proposals in the Proposals list with dates and release state) | Shows them, sorted with the live timelines first |
| Researches the people on each pursuit and links them (Contacts, Pursuit field) | Turns them into a campaign on its own, no click |
| Sets roles and TPOC flags, records restrictions ("no direct contact while the topic is open") | Honours them: TPOCs first, the window open or closed, **No direct contact** instead of a draft |
| Captures email both ways (the capture address), logs LinkedIn and calls from screenshots | Reads that as evidence for each target's stage |
| Keeps ClickUp current (follow ups, interested later, notes) | Writes nothing to the CRM; drafts messages in Gmail only |

**Two overlaps to settle with Kriss:**

1. **Customer typing.** The widget types every contact (buyer, end user, TPOC, customer side, partner, peer) from Hermes's fields. If Hermes already types people, the widget should read that field instead.
2. **The gate count.** The widget counts customer conversations per pursuit against the playbook's 3 by 14 days out. If OpenClaw tracks the same, one of them should be the source.

## Decisions for Kriss

Each with the options and what the widget does today. None of these are decided.

**1. One key for a workstream.**
- (a) The **ClickUp list id** is the workstream's id everywhere. OpenClaw stores it on each workstream in its contract JSON; the widget already uses it. Matching becomes exact.
- (b) OpenClaw's own id is the key, and the widget maps lists to it from a file OpenClaw publishes.
- *Today:* the widget uses (a). Since ClickUp is the foundation, (a) keeps both sides pointing at the thing everyone can see.

**2. Where a stream's state lives (status, rank, target, parent, merged into).**
- (a) Keep it as it is: the Board doc and a status paragraph on each list.
- (b) A **Workstreams registry list** in Goals & Workstreams: one task per stream, with custom fields (Company, Workstream list, Status, Rank, Target, Target date, Parent stream, Merged into) and the history in its comments. OpenClaw and every widget read fields instead of parsing text.
- (c) OpenClaw's own tables, behind the SSOT API; widgets pull from it.
- *Today:* (a). (b) needs no new service and fits "ClickUp underneath".

**3. One writer for rank and status.** If both the widget's review and OpenClaw compute rank, they will fight. Pick one writer; the other proposes (for example by a comment). *Today:* only the widget writes it.

**4. One filer for tasks.**
- (a) Atlas files every task; widgets only pair, enrich and close.
- (b) Both file, the widget reconciles (today).
- Either way, owner matching should use the Slack and ClickUp ids in each person's `me.json`, not names, so the right person gets the task.

**5. Contracts and folders.** Should OpenClaw's contract list line up one to one with ClickUp folders (and the CRM's level 1 contracts), or stay its own layer above them? If it stays separate, a contract to folder or list mapping published in ClickUp would let the widget show contracts too.

**6. The CRM path.** For the CRM tab to use Hermes's full email history, the widget needs either the path and read permission on the Hermes Agent folder (Ryland asked for this on Oct 5), or a read API. *Today:* it reads what Hermes syncs into ClickUp, including the Conversations list, through the REST API.

**7. Web app or APIs.** The widget is for internal people only; the SSOT still needs a web app for people outside the company, with access by role. For widgets, read APIs would let each one pull OpenClaw's understanding directly instead of only through ClickUp.

**8. Completion.** The widget's evidence check (`mine.sh`) is how it catches finished work nobody reported. OpenClaw could adopt the same approach for everyone, or rely on each teammate's widget closing their own ClickUp tasks as copies spread.

## How to run the comparison with Claude or OpenClaw

1. Read [02 ClickUp contract](02-clickup-contract.md), [03 Workstreams](03-workstreams.md) and [07 Data model](07-data-model.md).
2. Export OpenClaw's contracts JSON (with workstream definitions) and the task table schema.
3. For every line of `src/desk-widget/streams.tsv`, find the OpenClaw workstream it corresponds to. List streams with no match on either side, and any one to many matches.
4. Take the last two weeks of Atlas tasks and, for each, compare the ClickUp list it sits in with the workstream OpenClaw's matcher chose. List disagreements.
5. Compare OpenClaw's fields per workstream with the stream fields in [03](03-workstreams.md#what-a-workstream-is). List what each side has that the other lacks.
6. Report against the decisions above.
