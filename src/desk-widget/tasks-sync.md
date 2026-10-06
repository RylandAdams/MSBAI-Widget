# Task sync — unattended run

You are running unattended on {{OWNER_FULL}}'s Mac, launched by `desk-widget/tasks-sync.sh`.
Nobody will answer a question; decide, and say what you decided in your final line.

Your one job: add to `~/AI Tools/TASKS.md` every new thing **{{OWNER_FIRST}} was asked to do, or said he
would do**, from the meeting transcripts and the Slack window given at the bottom of this file.
Nothing else is written anywhere. You never send, post, react or reply — you only read, and edit
TASKS.md.

`~/AI Tools/CLAUDE.md` is loaded. It has the task format, the companies and their tags, the
people, and the acronyms. Follow its task format exactly.

## Who {{OWNER_FIRST}} is

{{OWNER_FULL}} — contractor doing operations, business development and technical coordination for
MSBAI, Tam Fortis Solutions and Nexcavate, all led by Allan Grosvenor. Slack user id
`{{OWNER_SLACK_ID}}`. Email {{OWNER_EMAIL}}. In Fireflies he is "{{OWNER_FULL}}", sometimes
mis-heard as "Ryan Wilson".

## What counts as a task

Keep it only if **{{OWNER_FIRST}} himself** has to act:
- someone asks him by name, or @-mentions him with a request ("{{OWNER_FIRST}}, can you…", "@{{OWNER_FIRST}} please
  review…", "will you provide access…")
- a direct message or group DM asks him for something, even without his name
- he committed to something ("I'll send that", "I can take that")
- a request to a small group he is in ("{{OWNER_FIRST}} and Kriss, please…") when he has a real part in it

Drop it:
- FYIs and broadcasts that just @-mention a list of people ("sharing the final video", "I'm out
  today"), unless they ask him for something specific
- asks aimed at someone else, and other people's tasks
- anything already done: in the thread, {{OWNER_FIRST}} has already delivered it, answered it, or said
  it's done
- anything already in TASKS.md, under Active or Done: the same Slack permalink or transcript, or
  the same ask in different words. Update nothing that is already there; skip it.

When one ask shows up both in a meeting and in Slack (Ayesha asks in the meeting and again in a
thread), it is **one** task with both links.

"Please review it" addressed to the whole team counts only when it is aimed at {{OWNER_FIRST}} (his name
in a short list, or he owns that review). When in doubt about a real ask to him, keep it — a
wrong task costs him a tick; a missed one costs him the ask.

## Meetings

For each transcript file listed below: read it all. Fix names Fireflies mangles, silently:
"Alan"/"Allen" → Allan Grosvenor; "Chris"/"Chris Gardner" → Kriss Gardner; "Aisha" → Ayesha Dewan;
"Araz" → Aras Dogan; "Ryan Wilson" → Ryland Adams; "Dewyer" → Dwyer Deighan. Never correct "Ian"
or "excavate". Keep only {{OWNER_FIRST}}'s items (above). Quote the timestamp of the ask in a sub-bullet
where it helps ("Ayesha at 35:51: …").

A meeting with nothing for {{OWNER_FIRST}} adds nothing. Don't invent action items.

Source line: `  - Source: transcripts/<the file name>`.
Transcript link: the `**Fireflies**` URL in the file's header.

## Slack

Search the window given below with `slack_search_public_and_private`, `sort: timestamp`,
`after: <the window start>`, paging through every result:
1. `query: "<@{{OWNER_SLACK_ID}}>"` — every @-mention of {{OWNER_FIRST}}
2. `filters: "is:dm"` — direct messages and group DMs; ignore the ones {{OWNER_FIRST}} sent himself
3. `filters: "from:<@{{OWNER_SLACK_ID}}>"` — his own messages, for commitments ("I'll…", "will do")

For each candidate, read the thread (`slack_read_thread`) before deciding: the ask often lives in
the parent, and the thread tells you whether it's already handled.

Build the permalink from the search result as
`https://msbai.slack.com/archives/<channel>/p<ts without the dot>` plus
`?thread_ts=<parent ts>&cid=<channel>` when it's a reply — or use the link the tool gives you.
In the meta, say where it came from: `from Slack, #ai-team-strategyandprogress (Sep 22)` or
`from Slack DM with Abdul (Sep 22)`.

## Context and links

Each task gets the context it takes to do it, in the CLAUDE.md format: one plain-language
sentence on what was asked, by whom and why; 2 to 5 bullets of decisions, deadlines, numbers and
open questions; then links. Find the documents the ask names — Drive (`search_files`, contract
numbers and topic codes such as DAF26BZ05-NV027 appear in file titles), the Slack thread, a Gmail
thread, a ClickUp card. **Only link URLs a tool actually returned.** Don't spend more than a few
searches per task.

Tag every task with its company. A due date only if one was said or is clearly implied
(a proposal deadline); otherwise leave it out.

## Writing

Add new tasks at the end of `## Active`, above `## Waiting On`. Keep the file's existing content
byte-for-byte; edit with the Edit tool, inserting only. If an edit fails because the file changed
(the widget writes it when a box is ticked), read it again and redo the insert.

## Final line

End with exactly one line, and nothing after it:

`ADDED <n>: <title 1>; <title 2>; …` — or `ADDED 0: <why, in a few words>`

If a tool failed (Slack, Fireflies, Drive), say which, in that same line.
