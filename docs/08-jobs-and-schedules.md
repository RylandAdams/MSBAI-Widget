# 08 Jobs and schedules

Every background job, when it runs, which model, which connector tools it is allowed, and what it writes. Times are the owner's local time. Intervals can be changed with the environment variable in brackets.

## Started by launchd (every 5 min, widget open or not)

| Job | Runs | Model | Allowed tools | Writes |
|-----|------|-------|---------------|--------|
| `tasks-sync.sh` | Full run on a new meeting, else a Slack sweep every 30 min; skips 10 pm to 4 am | Sonnet (`TASKS_SYNC_MODEL`) | Fireflies (search, transcript, summary), Slack (search, read thread and channel, profiles), Gmail (search, thread, message), Drive (search, read, metadata), ClickUp (search, filter, get) | `TASKS.md` (Edit on that path only), `transcripts/` |
| `clickup-sync.sh` close | When a ticked task has open synced ids, any hour | Haiku | ClickUp update_task, get_task | ClickUp: mark complete |
| `clickup-sync.sh` pair | When unpaired tasks change, else every 30 min, 4 am to 10 pm | Sonnet (`CLICKUP_SYNC_MODEL`) | ClickUp filter, search, get_task, hierarchy, get_list, create_task, update_task, add_tag | ClickUp tasks; `TASKS.md` |
| `clickup-sync.sh` reconcile | Every 2 h, 6 am to 10 pm | Sonnet | same as pair | same as pair |
| `clickup-sync.sh` snapshot | Every 30 min, 6 am to 10 pm | Haiku, retried once on Sonnet | ClickUp filter_tasks | `.clickup-collab.tsv` |
| `clickup-sync.sh` collab notes | Same run, at most 4 changed tasks | Sonnet | ClickUp get_task, search; Slack search, read thread; Drive search, metadata; Gmail search | `.clickup-collab-notes.tsv` |

## Started by the widget's beat (every 2 min while the widget is open)

| Job | Runs | Model | Allowed tools | Writes |
|-----|------|-------|---------------|--------|
| `flow.sh worker` | Each new meeting, an hour after it ends, 8 min or longer; first run backfills 3 weeks | Sonnet, Opus fallback (`FLOW_MODEL`) | Slack search, read thread; Drive search | `.flow/flow.json` |
| `flow.sh review` | Within 30 min of a new meeting (`FLOW_REVIEW_GAP`), at least daily (`FLOW_REVIEW_EVERY`), 6 am to 10 pm | Sonnet | Slack search, read thread | `.flow/flow.json` |
| `flow.sh cupush` | After a review that changed something; waits out the ClickUp limit | Sonnet | ClickUp search, get_list, update_list, get_folder, create_list_in_folder, create_document, list_document_pages, update_document_page | ClickUp: Workstream Board doc, list descriptions, new lists; `streams.tsv` |
| `mine.sh` | Every 30 min (`MINE_EVERY`), 6 am to midnight, when the flow is idle | Sonnet | ClickUp filter, search; Slack search; Gmail search, thread | `.flow/mine.json` |
| `crm.sh sync` with a token (`crm_rest.py sync`) | Every hour, 6 am to 10 pm | none (python, REST GET only) | none: ClickUp REST API with `.clickup-token` | `.crm/output`, `.crm/cu-cache.json`, `.crm/crm.json`, `.crm/plus.json`, `rolodex/` |
| `crm.sh sync` without a token | Every 3 h (`CRM_EVERY`), 6 am to 10 pm | Sonnet (`CRM_MODEL`) | ClickUp filter_tasks (list pass), get_task (detail pass) | same |
| `crm_plus.py` | After every sync, and on the beat when `plus.json` is over 90 s old | none (python) | none | `.crm/plus.json` |
| `crm.sh card` | When a card is opened, kept a day | Sonnet | ClickUp records from `crm_rest.py card` (REST) passed in as text; Gmail search, thread; Slack search; Fireflies search | `.crm/cards/` |
| `crm.sh draft`, `tpoc` | On a click | Sonnet | Gmail search, thread, create_draft, get_draft, update_draft; ClickUp search, get_task | Gmail drafts only |
| `crm.sh nudge` | Every 3 h (`CRM_NUDGE_EVERY`), 7 am to 8 pm | Sonnet | Gmail search, thread, create_draft, get_draft, update_draft | Gmail drafts, `.crm/nudges.tsv` |
| `crm.sh meetings` | Every 3 h (`CRM_MEET_EVERY`), 7 am to 9 pm | Sonnet, Opus fallback | Fireflies get_transcripts, search, summary | `.crm/mentions.tsv` |
| `crm.sh ask` | On a question in the ask box | Sonnet | ClickUp search, get_task; Gmail search, thread; Slack search | the answer only |
| `crm.sh push` | Dormant since Oct 7: no button queues a write | Sonnet | ClickUp get_custom_fields, filter, get_task, update_task, create_task, create_task_comment | ClickUp: the four CRM writes |
| `crm.sh watch` | Every beat | none (python) | none | `.crm/alerts.json` |
| `emails.sh sync` | Every 15 min (`EMAILS_EVERY`), 6 am to 10 pm | Sonnet (`EMAILS_MODEL`) | Gmail search, thread | `.emails.tsv` |
| `emails.sh suggest` | After a sync, up to 6 replies a pass | Sonnet | Gmail search, thread; Slack search, read thread; Drive search; ClickUp search | `.emails/sugg/` |
| `emails.sh draft` | On a click | Sonnet | Gmail thread, create_draft, get_draft, update_draft; Drive search | Gmail drafts only |
| `watch.sh` | Every 30 min (`WATCH_EVERY`), 4:30 am to 11:30 pm | Sonnet (`WATCH_MODEL`) | Gmail search, thread, message; Slack search, read thread and channel; Fireflies search, transcript, summary; Drive search, metadata; ClickUp get_task, comments, search | `.watch/alerts.json`; update bullets in `TASKS.md` (`watch_notes.py`) |
| `prep.sh` | 25 min before each qualifying call (`PREP_AHEAD`) | Sonnet (`PREP_MODEL`) | Calendar get, list, search events; Fireflies search, transcripts, summary; Slack search, read thread, users; Drive search | `.prep/` |
| `wiki.sh` | Every 2 h (`WIKI_EVERY`), 7 am to 10 pm | Haiku (`WIKI_MODEL`) | ClickUp filter_tasks | `.wiki/live.json` |
| `team.sh` | Once a day (`TEAM_EVERY`), 7 am to 10 pm | Haiku (`TEAM_MODEL`) | Slack list_channel_members | `team.tsv` (adds only) |
| `zoom.sh start` | On Confirm | Haiku | Zoom meeting_create; Calendar create_event; Slack send_message (to the picked ids only) | the call, DMs, Fireflies on the call |
| `cmd.sh run` | On Enter in Say it | Haiku, no tools | none | one action |

## Not started by a model

| Script | What |
|--------|------|
| `cal.sh` | The calendar feed, EventKit through JXA, icalBuddy fallback |
| `dock.sh` | Parks Terminal and the Claude app in their slots; new Claude thread for work it |
| `notes.sh` | Named markdown notes |
| `fireflies.sh` | Meeting list and transcripts through the Fireflies API, never in bulk |
| `gcal.sh`, `gcal.py` | Optional Google Calendar API writes |
| `voice.sh`, `listen.swift` | On device speech for Say it (built once; currently off the bar) |

## Rough daily ClickUp spend

The widget is built to stay well under the shared 1,000 connector calls a day. With a token, the CRM spends none of them: its hourly sync (10 to 26 REST calls) and its cards (a few REST calls each) go through the REST API, which has no daily cap. Without a token, the CRM list pass is about 20 calls every 3 hours and the detail pass only touches changed records. Beyond the CRM, the Collab snapshot and wiki layer are a handful of paged calls each, and the workstream push spends nothing when nothing changed. The calls that add up are pairing and reconcile on a busy day of meetings, and any Claude chat or OpenClaw job using the same login. When the limit is hit, everything waits for the reset and keeps its last good data (see [01](01-architecture.md#the-clickup-daily-limit)).
