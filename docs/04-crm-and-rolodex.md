# 04 CRM and Rolodex

The CRM view: one outreach dashboard across MSBAI, Tam Fortis and Nexcavate, built on the CRM v3 space that OpenClaw's Hermes agent keeps in ClickUp, and shaped since Oct 7 by the team's Customer Outreach, Follow Up and CRM Playbook. Code: `crm.sh`, `crm_rest.py`, `crm_build.py`, `crm_plus.py`, `crm_merge.py`, `crm_pages.py`, `crm_watch.py`, `emails.sh`. State: `.crm/`, `rolodex/`, `campaigns.json`.

**It is read only.** The widget reads ClickUp, ranks what it finds, and drafts messages. It writes nothing back to the CRM: OpenClaw and the mail watchers keep ClickUp current.

## The data flow

```
OpenClaw / Hermes ──writes──▶ ClickUp CRM v3 space
                                   │  GET only, hourly (crm_rest.py sync, owner's token)
                                   ▼
                      .crm/output  +  .crm/cu-cache.json
                                   │  crm_build.py (+ crm-seed.tsv, crm-exclude.txt, team.tsv, meeting mentions)
                                   ▼
                             .crm/crm.json      the model: items by level, key dates, people, roster
                                   │  crm_plus.py (+ campaigns.json, the calendar, me.json)
                                   ▼
                             .crm/plus.json     types, timelines, gates, campaigns, restrictions
                                   │  crm.sh tick prints CRM, CARD, ALERTS and PLUS lines
                                   ▼
                          the CRM tab in index.jsx (parseCrm)
```

`crm.sh tick` reruns `crm_plus.py` when `plus.json` is more than 90 seconds old, so a calendar change shows up on the next beat without a sync.

## Who owns what

| Thing | Owner | Widget |
|-------|-------|--------|
| Contacts, Organizations, Company Relationships | Hermes (OpenClaw) | Reads only. Never creates or edits |
| Conversations (email history), the capture mailbox | Hermes | Reads the Conversations list on every sync; cards match a person locally |
| Follow-ups, Interested Later | Hermes and people | Reads only |
| Proposals, release state, TPOC flags, restrictions | Proposal team and Hermes | Reads; the timeline, gate and campaigns are worked out from them |
| LinkedIn, InMail and call touches | Hermes (from screenshots and the capture) | Reads them as evidence of contact |
| Extra target lists (an agency roster from research) | The owner, in `campaigns.json` | Merged into Campaigns |
| Partners, contract people, key dates ClickUp lacks | The owner, in `crm-seed.tsv` | Merged into the model |
| Names that are never leads | The owner, in `crm-exclude.txt` | Filtered out |
| The owner's notes on a person | The owner | `rolodex/<name>.md` "From the desk", plus a ClickUp comment |

## The layout

```
company filter (All · MSBAI · Tam Fortis · Nexcavate) · mine · synced 12m ago
Key dates      six week calendar, coloured by company          ┐ three cards: each folds, and the grip
Do now         the five most urgent, I have five minutes        │ on its left drags it up or down;
Who has what   follow ups, replies, proposals per person        ┘ order and folds are remembered
Contracts · Leads · Proposals · Campaigns · Partners · Rolodex · Inbox     the tab row
rows for the open tab
```

- The tab row sits below the cards and **floats at the top** once you scroll past it, so you can always switch.
- The tab opens on **Inbox**. Each tab shows its count.
- **Every row opens as its own page** (`ui.page`), the way wiki pages do, with a back link to the tab. Campaign pages are `ui.page = "camp:<key>"`.
- Default order of the cards is Key dates, Do now, Who has what (`CRM_SEC_ORDER`). Saved layouts from before Oct 7 are moved to the new order once (`orderV`, `flowV` in `msbai_crm_ui`).

## The levels

Set by Ayesha in the Oct 5 check in. The view always shows what is most urgent across all three companies and filters down to one.

1. **Contracts**: won work and active projects. The paid government contracts, the national lab supercomputing allocations, projects like GAIN with Argonne for Tam Fortis. Highest standing priority: work we already won and must keep.
2. **Leads**: warm and hot leads, people Allan meets at events, people the team keeps naming in BizDev meetings; plus cooling and interested later. These are the threads that get lost after events.
3. **Proposals**: every active proposal and the outreach it needs. **TPOCs** (technical points of contact) must be reached as early as possible in pre release; once a topic is open, direct contact is off limits, so their names are struck through, the batch ask button disappears, and their card says **No direct contact**.
4. **Partners**: who we need to propose with. GAIN requires a national lab partner; anything with significant hardware needs a hardware partner; ARGUS needs several. Partner setup takes the longest, so it starts first.

### How the Proposals tab is ordered

The proposals themselves come first, then everything else that only relates to a proposal:

1. Proposals with a due date still ahead, soonest first (these have a live timeline and gate).
2. Proposals past their due date that are not marked submitted, most recent first.
3. Proposals with no due date in ClickUp yet ("No due date in ClickUp, so no timeline or gate yet").
4. Submitted proposals.
5. Under a **From meetings and follow ups** heading: people or groups named in meetings about a proposal, and results to confirm.

Within a group, a row with fresh news goes first, then the Do now score. Submitted long ago or paused proposals hide behind **show older**.

## Proposal pages: timeline and bid gate

From `crm_plus.py`, per open proposal (`plus.pursuits[<task id>]`):

- **Timeline.** Start (7 weeks out), 21 days, 14 days, 7 days, due. Drawn as a line with today marked (`CrmGate`). The phase says where we are: `shaping` (more than 7 weeks out), `outreach` (7 weeks to 21 days), `draft` (21 to 14 days), `gate` (14 to 7 days), `final` (the last week), `past`.
- **Bid gate.** The playbook's rule: **3 conversations with buyers, end users, TPOCs or customer side people by 14 days out**. Gate state: `ok` (3 or more), `building` (more than 21 days out), `short` (21 to 14 days out and under 3), `late` (inside 14 days and under 3), `nodate`. A short or late gate goes into Do now.
- **Customer map** (`CrmCustMap`): the people the CRM links to the proposal, grouped by type, each with whether we have contacted them, talked to them, or not yet.
- **People** and a link to the proposal's **campaign**.

## Customer types

Every contact is typed from the fields Hermes keeps (role, TPOC flag, organization, relationship stage): `buyer`, `user` (end user), `tpoc`, `adjacent` (customer side, not the buyer), `partner`, `peer`, or `unknown` ("Not typed yet"). Only buyer, user, tpoc and adjacent count toward the gate. This typing is one of the two places that could overlap with OpenClaw (see [09](09-openclaw-alignment.md#division-of-labor-proposed-oct-7)).

## Campaigns

A campaign is the outreach list for one pursuit. They are **dynamic**:

- **Made on their own.** Every open pursuit with customer side people linked in the CRM becomes a campaign, with those people as targets and the proposal's 14 day mark as its gate. A pursuit past its due date drops off.
- **Added by hand.** `campaigns.json` adds lists the CRM does not hold yet, for example the FAA roster researched for the NASA Phase II. A list can be tied to a pursuit by its ClickUp task id, and then the CRM's customer people for that pursuit are added to it. See `examples/campaigns.example.json`.
- **Stages** are worked out fresh on every run from evidence, never set by hand (except the letter): `found` (not contacted yet), `contacted` (we wrote, no reply yet), `replied`, `met` (a meeting with them is on the calendar log), `letter` (set `"letter": true` once a letter of support is in hand).
- **TPOCs first.** Each campaign counts its TPOCs and how many are still untouched, and says whether the window is **open** (pre release), **closed** (the topic is open, or a TPOC restriction says "while the topic is open") or unknown. The TPOC block sits at the top of the campaign page, and an open window with untouched TPOCs goes into Do now.
- **Off limits.** A target with a restriction recorded in the CRM is shown but not counted, and has no draft button.

**The Campaigns tab** lists every campaign: name, company, due and gate, a TPOC chip, and a **blue bar for talked out of total**, filling from the left. Click one for its page: the TPOC block, the goal and the ask, every target by stage with their organization and function, the source doc, and **Draft the outreach with Claude**.

**How a proposal becomes a campaign.** Nothing to click. When OpenClaw (or the proposal team) puts a proposal in the Proposals list with a due date and links customer people to it in Contacts (the Pursuit field), the next sync makes the campaign. If the people are not in the CRM yet, add them to `campaigns.json` or ask OpenClaw to research and add them.

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
| A campaign whose TPOC window is open with TPOCs untouched | 70 (from `plus.json`) |
| A proposal behind its bid gate, or a campaign near its gate | from `plus.json` |
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

## Reading ClickUp (`crm.sh sync`)

### With the token: the REST API (`crm_rest.py`), the normal path

The owner's ClickUp personal API token sits in `desk-widget/.clickup-token` (chmod 600, ignored by git, never published). With it, `crm.sh sync` runs `crm_rest.py sync` first:

- **Hourly**, 6 am to 10 pm (`EVERY` drops from 3 h to 1 h when the token exists).
- **GET requests only.** It cannot write.
- **No model.** Python reads every CRM list in pages (Contacts, Company Relationships, Conversations, Follow-ups, Interested Later, Opportunities, Proposals). One list call returns every task with its custom fields, so a whole sync is about 10 to 26 calls and returns about 100 items.
- **No daily cap.** ClickUp's REST limit is per minute (100 a minute on most plans). On a 429 it waits for `X-RateLimit-Reset` and retries.
- It writes the same `CRM_START ... CRM_END` block the connector path wrote, so `crm_build.py` did not change, and it saves every list to `.crm/cu-cache.json` (and list names to `.crm/cu-lists.json`).
- `crm_rest.py fields` prints the custom field names per list, to check the mapping.

If the REST sync fails (no token, a bad token, ClickUp down), `crm.sh` falls back to the connector path below.

### Without the token: the connector, the fallback

Every 3 hours, 6 am to 10 pm (`CRM_EVERY`), Sonnet, read only:

1. **List pass** (about 20 calls): one `clickup_filter_tasks` per list or group, each task with its `date_updated`. Groups: relationships by stage (engaged, active, customer, partner), touched in 21 and 90 days, health (cooling, dormant, at risk), tier (key, warm), TPOC contacts, all relationships and all contacts (names, for the Rolodex), and people on each pursuit by topic code.
2. **Detail pass**: `crm_merge.py need` lists Follow-ups, Interested Later and Proposals that are new or changed since the last time; only those get `clickup_get_task` (at most 40 a run, `CRM_DETAIL_MAX`). Details are cached in `.crm/fields.json` by task id and `date_updated`.
3. `crm_merge.py merge` writes the full `CRM_START ... CRM_END` block, and `crm_build.py` builds the model.

If ClickUp refuses calls, the header says "last sync failed" (hover for why) and the last good data stays on screen. `crm.sh parse` rebuilds the model from the last good sync with no ClickUp call.

## Context cards

Opening any row or name builds a card once a day (cached in `.crm/cards/<id>.json`, deleted after 14 days). The ClickUp part no longer uses the connector: `crm_rest.py card` finds the person in `.crm/cu-cache.json` (Contacts, Relationships, Conversations, Follow-ups) and fetches just those tasks fresh with `GET /task/{id}`, a few REST calls. A headless Sonnet then gets those records as text, adds Gmail (the latest threads with them), Slack and Fireflies, read only, and returns:

`who`, `how_met`, `first_touch`, `last_touch`, `gap` ("9 months quiet"), `last_speaker` (us or them), `going_on`, `promises_ours`, `promises_theirs`, `why_stopped`, `linked` (proposals, contracts, partners), `cautions`, `next_step`, `suggested` (a short message signed with the owner's first name), `links`.

Cautions are rules, not opinions, and are drawn in gold: a TPOC on an open topic means no direct contact; an active partner is never cold messaged; a Tam Fortis or Nexcavate lane means send from that company's mailbox. A restriction recorded in the CRM is a hard stop: the card shows **No direct contact** where the draft button would be (`crmRestrict`).

The card, top to bottom: what the row is; People (with TPOC asks); cautions; About; Promises; Next; **Connected on the desk** (open desk tasks and workstream meetings that name the same person, topic number or organization; click to jump); Sources, folded, grouped by ClickUp, Gmail, Slack, Fireflies and Drive; then **Reach out** (never sends): draft it in Gmail, write a different one, ask Claude, copy card, refresh card.

There is no **Update the CRM** group any more (removed Oct 7), and no LinkedIn or call log buttons (removed Oct 8; one press had posted a ClickUp comment nobody meant to post). OpenClaw logs those touches.

## Working from it

- **Draft from any row.** `crm.sh draft` finds the person's address in the CRM or Gmail, replies on the latest thread with them when there is one, cc's the outreach capture address (so Hermes logs it), and leaves it in the owner's Gmail drafts. Tam Fortis and Nexcavate drafts open with a line saying to send from that company's address, since the Gmail connector can only draft in the owner's own mailbox.
- **Batch TPOC asks.** A proposal that is not open yet has **draft TPOC asks (n)**: one two part ask per TPOC (can we meet; if not, who else should we talk to), starting from the drafts Hermes left on its Opportunity record. If the release state is not set it asks you to confirm the topic is still pre release first.
- **Nudges.** Every 3 hours, 7 am to 8 pm (`CRM_NUDGE_EVERY`), outreach the owner sent 5 or more business days ago to someone outside the company, with no answer, gets a short follow up draft (at most 5 a run, once per thread). Listed at the top of the Inbox.
- **Meetings feed the CRM.** Every 3 hours, 7 am to 9 pm (`CRM_MEET_EVERY`), the last 3 days of business meetings are read and every outside person or organization talked about as a lead, customer, partner or TPOC is logged (`.crm/mentions.tsv`): what was said, by whom, the follow up, and a link to that moment.
- **I have five minutes.** The three most urgent items, one per person, worked one at a time: what it is, who and whose, where it stands, what to do, the first caution, the message ready, then Draft it, Write a different one, Open card, Mark done, Skip.
- **Ask.** A box for questions like "who do we know at Space Force" or "what did we promise Argonne", answered from the model plus ClickUp, Gmail and Slack.
- **Who has what.** Open follow ups, replies and proposals per person, with late counts. A person with follow ups owned by two people is flagged so the team agrees who reaches out.

## Colours

Company dots (`CRM_CO_DOT`, the same colours the wiki uses): MSBAI `#7FB2FF` blue, Tam Fortis `#5ED3A1` green, Nexcavate `#FFB547` amber. Urgency never reuses a company colour: past due `#FF5F5F` red, due soon `#FF9CA0` soft rose, reply waiting `#64D2FF` baby blue, TPOC windows `#FF7AB6` pink, cautions gold `#F5D46B`.

## Tried and taken out

- **Debrief** (a card after meetings with outside people, asking who it was and how it went). The CRM already learns this from the mail capture and Fireflies, so it was confusing. `crm_plus.py` still computes `debriefs` and `crm.sh debrief` still exists; no UI uses them.
- **This week** (a scoreboard of customer conversations against 10 a week). Removed as unclear. `crm_plus.py` still computes `week`.
- **Update the CRM** and the touch log buttons, as above.

## Notify mode (`crm_watch.py`)

On the beat, without a model or network: a reply waiting, a follow up we owe going past due, a TPOC window closing within 2 days, an interested later date arriving, an email from someone in the CRM, a new person named in a meeting, a nudge ready. Those rows' titles breathe from white to violet, with what happened and **got it**; new ones post one notification (7 am to 8 pm). Scope is the owner's own items, or everything when `me.json` has `"crmWatch": "all"`.

## The Inbox (`emails.sh`)

The threads in the owner's inbox waiting on them, rebuilt every 15 minutes from 6 am to 10 pm through the Gmail connector. Each gets a suggested reply in the owner's voice (learned from how they have answered before) and a line from the CRM about the sender (level, pursuit, TPOC or partner). use it, edit, change it, to claude, done. Prompts read the owner from `me.json`, so a teammate's copy writes as them.

## The Rolodex

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

**Up (dormant).** Until Oct 7 a card could write four things back to ClickUp on a click (close a follow up, create a follow up, create an interested later, add a note as a comment), through `.crm/outbox.jsonl` and `crm.sh push`, with duplicate checks (see [02](02-clickup-contract.md#crm-crmsh-push-from-crmoutboxjsonl)). The code is kept but no button reaches it, because OpenClaw and the mail watchers already keep ClickUp current and two writers would drift.

The Rolodex is the CRM's version of `TASKS.md`: the desk's merged view of a person, readable by Claude, OpenClaw or a teammate without a ClickUp call. 1,000 people would be about 1.5 MB. Rolodex pages are personal working data and are never published in this repo.
