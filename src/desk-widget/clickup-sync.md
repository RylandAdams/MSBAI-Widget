# ClickUp pairing — unattended run

You are running unattended on {{OWNER_FULL}}'s Mac, launched by `desk-widget/clickup-sync.sh`.
Nobody will answer a question; decide, and say what you decided in your final line.

`~/AI Tools/TASKS.md` is {{OWNER_FIRST}}'s real task list — the desk widget shows it, and it is the
source of truth. ClickUp has to mirror it on **{{OWNER_FIRST}}'s Focus Board**, so what he works on at his
desk and what the team sees on his board are the same list. Two systems write tasks from the same
meetings and Slack threads: this desk sync (TASKS.md) and OpenClaw's Atlas bot (ClickUp). Your
job is to make them **one** list: every Active desk task has exactly one ClickUp twin per piece of
work, with no duplicates, and each side carries everything the other knows — context, decisions,
deadlines, people and every link.

You may: read ClickUp; create ClickUp tasks; add the `focus-now` tag; rewrite the description of a
task assigned **only** to {{OWNER_FIRST}}, keeping what was there (see "Merging content"); mark a duplicate
complete (see "Duplicates"); edit TASKS.md. Never delete, move, reassign or comment on a ClickUp
task, never use `clickup_merge_tasks` (it deletes tasks), and never change a task that is assigned
to anyone besides {{OWNER_FIRST}}.

## {{OWNER_FIRST}}'s Focus Board

The board ({{OWNER_FOCUS_BOARD_URL}}) shows open tasks **assigned to
{{OWNER_FIRST}} (`{{OWNER_CLICKUP_ID}}`) and tagged `focus-now`**. Atlas's weekly focus-board job curates it. Every
ClickUp task you pair or create must end up on it:

- Pair only tasks assigned to {{OWNER_FIRST}}.
- If a task you pair lacks the `focus-now` tag, add it with `clickup_add_tag_to_task`
  (`tag_name: "focus-now"`).
- Every task you create gets `assignees: ["{{OWNER_CLICKUP_ID}}"]` and `tags: ["focus-now"]`.

## The pairing line

A paired ClickUp task is one sub-bullet under the desk task, exactly:

    - [ClickUp: <the ClickUp task's name>](https://app.clickup.com/t/<task id>) · synced

Only `· synced` lines are paired. When {{OWNER_FIRST}} ticks the desk task, a script marks every synced
ClickUp task under it **complete** — so a synced line must be the *same piece of work*, never a
broader goal or a related task. Other `[ClickUp: …]` links without `· synced` are plain
references; leave them alone and never add `· synced` to them.

Put pairing lines just above the task's `Source:` line (or last, if it has none).

## Which desk tasks to work on

The "This run" section at the bottom says the mode:

- **pair** — every `- [ ]` task under `## Active` with no `· synced` line: find or create its
  twin, then merge content both ways.
- **reconcile** — every `- [ ]` task under `## Active` that already has `· synced` lines: look for
  Atlas tasks filed since the pairing that are the same work (duplicates), and merge any content
  either side gained since the last run. A pair run also does this for the tasks listed under it.

## Finding the counterpart

{{OWNER_FIRST}}'s ClickUp member id is `{{OWNER_CLICKUP_ID}}`; workspace `20115771`. Atlas (user "msb assistant", tag
`atlas`) turns every Fireflies meeting into ClickUp tasks in the **Goals & Workstreams** space.
Its tasks name the source meeting and carry the Fireflies transcript id in the description
(`atlas_task_id: <transcript id>::task::…`).

1. Get {{OWNER_FIRST}}'s open tasks once: `clickup_filter_tasks` with `assignees: ["{{OWNER_CLICKUP_ID}}"]`,
   `include_closed: false`, every page until `has_more` is false.
2. For a desk task from a meeting, the Fireflies id is in its `Transcript:` link
   (`app.fireflies.ai/view/<id>`). `clickup_search` with that id as keywords finds what Atlas made
   from the same meeting; prefer those.
3. Pair by meaning, not wording: same ask, same deliverable. Read a candidate's description
   (`clickup_get_task` with `include: ["description"]`) when the name alone doesn't settle it.
   If Atlas split one ask into genuinely different deliverables, pair each (several synced lines).
   If the same deliverable exists more than once, that is a duplicate — see below.
4. Never pair a task tagged `goal` (those live in `00 Goals` lists and are outcomes, not
   actions). Never pair one ClickUp task under two desk tasks.

## When there is no counterpart

- From a meeting held less than 3 hours ago (see "Now" below): wait. Atlas may not have filed it
  yet; the next run checks again. This wait is what keeps the two systems from double-filing.
- Otherwise — a Slack ask, an email, an older meeting Atlas missed — **create** it with
  `clickup_create_task`:
  - `assignees: ["{{OWNER_CLICKUP_ID}}"]`, `tags: ["focus-now"]`, a due date only if the desk task has one
  - `name`: the desk task's title
  - `markdown_description`: built as in "Merging content" (there is no Atlas text yet)
  - `list_id`: the best-fitting workstream list in Goals & Workstreams (get the hierarchy once
    with `clickup_get_workspace_hierarchy`, `space_ids: ["90114201246"]`). If nothing fits
    clearly, use the company's inbox:
    - MSBAI general `901114113993` · OrbitGuard `901114114014` · NASA `901114113990` ·
      HPCMP / CFD / Kestrel `901114113985` · Tam Fortis `901114114067` · Nexcavate `901114114075`
  - then add its pairing line.
- A matching task exists but is assigned only to someone else (e.g. Atlas gave {{OWNER_FIRST}}'s ask to
  Ayesha): leave it alone and create {{OWNER_FIRST}}'s own task as above.

## Merging content

The goal is one task that knows everything. Do both directions for every task you pair, and for
every synced task in a reconcile run.

**Into ClickUp.** The twin's description keeps whatever Atlas (or anyone) wrote, untouched, and
ends with one section that you own:

    ## From {{OWNER_FIRST}}'s desk
    <every sub-bullet of the desk task except the `· synced` lines and `ClickUp says…` notes,
     as they are — context, decisions, deadlines, and every Slack / Drive / Gmail / Transcript link>
    Source: {{OWNER_FIRST}}'s desk task list (TASKS.md), from <the meta's "from …" part>

If that section already exists, replace it with the current one; never add a second. Write it with
`clickup_update_task` `markdown_description` = the existing description with the section in place.
Skip the update when nothing would change. Only do this to tasks assigned only to {{OWNER_FIRST}}.

**Into TASKS.md.** Read the twin's description. Anything it has that the desk task lacks — a link
(Drive doc, Slack thread, transcript, ClickUp doc), a deadline, a named person, a "done when"
criterion, a decision — goes in as a new sub-bullet under the desk task, above the pairing lines,
in the same plain style as the others (links as `[Drive: name](url)` etc.). Add at most 4 bullets
per run, skip anything already said, and never copy Atlas's boilerplate (`atlas_task_id`,
`routing_state`, "Ownership", the `## From {{OWNER_FIRST}}'s desk` section).

## Duplicates

Two or more of {{OWNER_FIRST}}'s open ClickUp tasks that are the same deliverable — Atlas filed it twice,
or Atlas filed it after this sync had already created one — become one:

1. **Survivor:** the Atlas task (tag `atlas`) if there is one, otherwise the oldest.
2. Copy anything the others have that the survivor lacks into the survivor's description, under a
   `## Merged from duplicates` heading (links and facts only, each once).
3. For each other one — only if it is assigned only to {{OWNER_FIRST}} — set its description to its
   existing text plus a last line `Duplicate of [<survivor name>](https://app.clickup.com/t/<id>) —
   merged by {{OWNER_FIRST}}'s desk sync.`, then `clickup_update_task` it to status `complete` (if refused,
   `clickup_get_task` with `expand_statuses: true` and use the closed-type status).
4. In TASKS.md, the desk task keeps one `· synced` line, for the survivor: change or remove the
   duplicates' lines, add the survivor's line if missing.

A duplicate shared with someone else is left open and unsynced.

## ClickUp closed something first

If every synced ClickUp task under an Active desk task already shows a closed status (someone
finished it in ClickUp), don't tick it — add one sub-bullet so {{OWNER_FIRST}} sees it:
`  - ClickUp says this is complete (closed <date>) — tick it if it's done.` Once only.

## Editing TASKS.md

Edit with the Edit tool. Insert lines, and change or remove only `· synced` lines as "Duplicates"
says; keep everything else byte-for-byte. The widget rewrites the file when a box is ticked — if an
edit fails because the file changed, read it again and redo it. Don't touch `## Done`.

## Final line

End with exactly one line, and nothing after it:

`PAIRED <n> CREATED <m> WAITING <k> TAGGED <t> MERGED <d> ENRICHED <e>: <short notes>`

(`TAGGED`: paired tasks you added `focus-now` to. `MERGED`: duplicates folded into a survivor.
`ENRICHED`: tasks where either side gained content.) If a ClickUp call failed, say which.
