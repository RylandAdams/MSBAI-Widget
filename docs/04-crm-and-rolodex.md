# 04 CRM and Rolodex

The CRM view: one outreach dashboard across MSBAI, Tam Fortis and Nexcavate, built on the CRM v3 space that OpenClaw's Hermes agent keeps in ClickUp. Code: `crm.sh`, `crm_build.py`, `crm_merge.py`, `crm_pages.py`, `crm_watch.py`, `emails.sh`. State: `.crm/`, `rolodex/`.

## Who owns what

| Thing | Owner | Widget |
|-------|-------|--------|
| Contacts, Organizations, Company Relationships | Hermes (OpenClaw) | Reads only. Never creates or edits |
| Conversations (email history), the capture mailbox | Hermes | Reads through ClickUp search on cards |
| Follow-ups, Interested Later | Hermes and people | Reads; can close a follow up, create a follow up or an interested later, on a click |
| Proposals | Proposal team | Reads |
| Partners, contract people, key dates ClickUp lacks | The owner, in `crm-seed.tsv` | Merged into the model |
| Names that are never leads | The owner, in `crm-exclude.txt` | Filtered out |
| The owner's notes on a person | The owner | `rolodex/<name>.md` "From the desk", plus a ClickUp comment |

## The four levels

Set by Ayesha in the Oct 5 check in. The view always shows what is most urgent across all three companies and filters down to one.

1. **Contracts**: won work and active projects. The paid government contracts, the national lab supercomputing allocations, projects like GAIN with Argonne for Tam Fortis. Highest standing priority: work we already won and must keep.
2. **Leads**: warm and hot leads, people Allan meets at events, people the team keeps naming in BizDev meetings; plus cooling and interested later. These are the threads that get lost after events.
3. **Proposals**: the outreach each active proposal needs, grouped by release state (pre release, open, submitted). **TPOCs** (technical points of contact) must be reached as early as possible in pre release; once a topic is open, direct contact is off limits, so their names are struck through and the batch ask button disappears.
4. **Partners**: who we need to propose with. GAIN requires a national lab partner; anything with significant hardware needs a hardware partner; ARGUS needs several. Partner setup takes the longest, so it starts first.

## The model (`.crm/crm.json`)

Built by `crm_build.py` from the last sync, the seed file and the meeting mentions. Every row is an item with a `kind`:

| Kind | From | Level |
|------|------|-------|
| `contract` | Won proposals, seed contract rows | 1 |
| `lead` | Company Relationships by heat (hot, warm, cooling) | 2 |
| `interest` | Interested Later | 2 |
| `followup`, `checkin`, `reply`, `result` | Follow-ups, by their Origin field: reply clock is `reply`, result trigger is `result`, check in is `checkin`, anything else `followup` | the level of who it is with |
| `proposal` | Proposals, with release state, open and final dates, TPOC count | 3 |
| `partner` | Seed partner rows, partner relationships | 4 |
| `mention` | A person or organization named in a business meeting | the level that fits |
| `email` | A thread in the owner's inbox waiting on them | the sender's level |

Plus `calendar` (key dates: submission windows, TPOC windows, follow up due dates, resurface dates), `people` (an index the Inbox uses to put a level and company on each sender), `roster` (everyone, for the Rolodex), and `counts`. Full shape in [07 Data model](07-data-model.md).

## Scoring: Do now

Every visible item gets a score; the top five are **Do now**. From `crmScore` in `index.jsx`:

| Item | Score |
|------|-------|
| A reply waiting on us | 40, plus 8 a day overdue (up to 60 more) |
| An email in the inbox waiting on the owner | 40, plus 8 a day after the first (up to 40 more) |
| A pre release proposal with TPOCs to reach | 50, plus up to 50 as the open date nears (inside 10 days) |
| A follow up we owe | overdue 35 plus 5 a day (up to 40 more); due today 30; within 3 days 20; later 8 |
| A follow up they owe us | 18 if overdue, else 6 |
| A result to confirm | 30, plus 5 a day overdue (up to 30 more) |
| A proposal due within 7 days / 21 days | 25 / 14 (submitted 3) |
| A new person named in a meeting | 22 if unknown to the CRM, 12 if known, less 1 a day since |
| An interested later whose date came | 20 |
| A lead | hot 12, cooling 10, warm 4 |
| A contract | 8 |
| A partner | 8 if we need something, else 5 |

Then a level weight on anything above 2: contracts +15, leads +5, proposals +10, partners +10.

## Reading ClickUp cheaply (`crm.sh sync`)

Every 3 hours, 6 am to 10 pm (`CRM_EVERY`), Sonnet, read only:

1. **List pass** (about 20 calls): one `clickup_filter_tasks` per list or group, each task with its `date_updated`. Groups: relationships by stage (engaged, active, customer, partner), touched in 21 and 90 days, health (cooling, dormant, at risk), tier (key, warm), TPOC contacts, all relationships and all contacts (names, for the Rolodex), and people on each pursuit by topic code.
2. **Detail pass**: `crm_merge.py need` lists Follow-ups, Interested Later and Proposals that are new or changed since the last time; only those get `clickup_get_task` (at most 40 a run, `CRM_DETAIL_MAX`). Details are cached in `.crm/fields.json` by task id and `date_updated`.
3. `crm_merge.py merge` writes the full `CRM_START ... CRM_END` block, and `crm_build.py` builds the model.

If ClickUp refuses calls, the header says "last sync failed" (hover for why) and the last good data stays on screen. `crm.sh parse` rebuilds the model from the last good sync with no ClickUp call.

## Context cards

Opening any row or name builds a card once a day (cached in `.crm/cards/<id>.json`, deleted after 14 days). A headless Sonnet, read only, gathers from ClickUp (Contacts, Company Relationships, Conversations), Gmail (the latest threads with them), Slack and Fireflies, and returns:

`who`, `how_met`, `first_touch`, `last_touch`, `gap` ("9 months quiet"), `last_speaker` (us or them), `going_on`, `promises_ours`, `promises_theirs`, `why_stopped`, `linked` (proposals, contracts, partners), `cautions`, `next_step`, `suggested` (a short message signed with the owner's first name), `links`.

Cautions are rules, not opinions: a TPOC on an open topic means no direct contact; an active partner is never cold messaged; a Tam Fortis or Nexcavate lane means send from that company's mailbox.

The card, top to bottom: what the row is; People (with TPOC asks); cautions; About; Promises; Next; **Connected on the desk** (open desk tasks and workstream meetings that name the same person, topic number or organization; click to jump); Sources, folded, grouped by ClickUp, Gmail, Slack, Fireflies and Drive; then two action groups:

- **Update the CRM** (writes to ClickUp, on a click): mark done, follow up, remind me later, add note, Rolodex page.
- **Reach out** (never sends): draft it in Gmail, write a different one, ask Claude, copy card, refresh card.

## Working from it

- **Draft from any row.** `crm.sh draft` finds the person's address in the CRM or Gmail, replies on the latest thread with them when there is one, cc's the outreach capture address (so Hermes logs it), and leaves it in the owner's Gmail drafts. Tam Fortis and Nexcavate drafts open with a line saying to send from that company's address, since the Gmail connector can only draft in the owner's own mailbox.
- **Batch TPOC asks.** A proposal that is not open yet has **draft TPOC asks (n)**: one two part ask per TPOC (can we meet; if not, who else should we talk to), starting from the drafts Hermes left on its Opportunity record. If the release state is not set it asks you to confirm the topic is still pre release first.
- **Nudges.** Every 3 hours, 7 am to 8 pm (`CRM_NUDGE_EVERY`), outreach the owner sent 5 or more business days ago to someone outside the company, with no answer, gets a short follow up draft (at most 5 a run, once per thread). Listed at the top of the Inbox.
- **Meetings feed the CRM.** Every 3 hours, 7 am to 9 pm (`CRM_MEET_EVERY`), the last 3 days of business meetings are read and every outside person or organization talked about as a lead, customer, partner or TPOC is logged (`.crm/mentions.tsv`): what was said, by whom, the follow up, and a link to that moment.
- **I have five minutes.** The three most urgent items, one per person, worked one at a time: what it is, who and whose, where it stands, what to do, the first caution, the message ready, then Draft it, Write a different one, Open card, Mark done, Skip.
- **Ask.** A box for questions like "who do we know at Space Force" or "what did we promise Argonne", answered from the model plus ClickUp, Gmail and Slack.
- **Who has what.** Open follow ups, replies and proposals per person, with late counts. A person with follow ups owned by two people is flagged so the team agrees who reaches out.

## Notify mode (`crm_watch.py`)

On the beat, without a model or network: a reply waiting, a follow up we owe going past due, a TPOC window closing within 2 days, an interested later date arriving, an email from someone in the CRM, a new person named in a meeting, a nudge ready. Those rows' titles breathe from white to violet, with what happened and **got it**; new ones post one notification (7 am to 8 pm). Scope is the owner's own items, or everything when `me.json` has `"crmWatch": "all"`.

## The Inbox (`emails.sh`)

The threads in the owner's inbox waiting on them, rebuilt every 15 minutes from 6 am to 10 pm through the Gmail connector. Each gets a suggested reply in the owner's voice (learned from how they have answered before) and a line from the CRM about the sender (level, pursuit, TPOC or partner). use it, edit, change it, to claude, done. Prompts read the owner from `me.json`, so a teammate's copy writes as them.

## The Rolodex, two way

**Down.** Every sync writes one markdown page per person to `rolodex/<slug>.md` (1 to 2 KB each):

```
# <Name>
## Where it stands
## Promises          - We: ...   - They: ...
## Cautions
## Next              next step, suggested message
## Open in the CRM   open follow ups, interested later, with links
## Linked            proposals, contracts, partners
## In meetings       date, meeting, who said what, transcript link
## ClickUp           their records; lines marked · synced are rewritten each sync
## Sources
## From the desk     the owner's notes, never overwritten
```

**Up.** On an open card: **done** (close that follow up, two clicks), **follow up** (we owe them, due in 3 days, a week or 2 weeks), **later** (interested later in 30, 90 or 182 days), **note** (a dated line on their page and a comment on their ClickUp record), **page** (open the markdown). Each click goes to `.crm/outbox.jsonl`, shows as pending at once, and `crm.sh push` sends it; the card shows sent or failed with a link.

**Safety.** Only four writes exist (see [02](02-clickup-contract.md#crm-crmsh-push-from-crmoutboxjsonl)). Duplicates are stopped twice: the outbox refuses the same op already queued, and before creating, the push looks for an open task for the same person and topic and comments on it instead. Nothing writes without a click.

The Rolodex is the CRM's version of `TASKS.md`: the desk's merged view of a person, readable by Claude, OpenClaw or a teammate without a ClickUp call. 1,000 people would be about 1.5 MB. Rolodex pages are personal working data and are never published in this repo.
