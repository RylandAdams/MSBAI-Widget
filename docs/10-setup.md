# 10 Setting up a copy for a teammate

Each teammate gets their own copy, personalized to them: it reads their Slack, Gmail, Calendar and Fireflies through their own Claude login, lights up their own work, and writes to ClickUp as them.

## What you need

- A Mac (Apple silicon or Intel) with **Übersicht** 1.6 or later.
- The **Claude desktop app**, and **Claude Code** (`claude` on the command line) signed in with your claude.ai account. Every background job is `claude -p`, so it uses your plan.
- These **claude.ai connectors** turned on for your account: ClickUp, Slack, Gmail, Google Drive, Google Calendar, Fireflies, Zoom. The jobs call them as `mcp__claude_ai_<Service>__...`; there is no other login.
- A **Fireflies API key** (fireflies.ai → Settings → Developer Settings).
- A **ClickUp personal API token** if you will use the CRM (ClickUp → your avatar → Settings → Apps → API Token; it starts with `pk_`).
- `python3` (comes with the Xcode command line tools) and `zsh` (the macOS default). Nothing to install with pip.
- Optional: `icalBuddy` (Homebrew) as the calendar fallback.

## Steps

**1. Get the repo** (it is private to the team):

```bash
git clone https://github.com/RylandAdams/MSBAI-Widget.git
cd MSBAI-Widget
```

**2. Say who you are.** Copy the example and fill it in:

```bash
cp examples/me.example.json config/me.json
```

| Key | What to put | Where to find it |
|-----|-------------|------------------|
| `name` | Your first name, as teammates say it | |
| `full` | Your full name, as Fireflies writes it | |
| `aliases` | Every way transcripts write your name, including mishearings | Look at a few of your Fireflies transcripts |
| `slack` | Your Slack member id (starts with U) | Slack: your profile → ⋮ → Copy member ID |
| `clickup` | Your ClickUp member id (digits) | ClickUp: a task assigned to you, or ask whoever admins ClickUp |
| `email` | Your work email | |
| `role` | One line on what you do, used in prompts | |
| `focusBoard` | The link to your ClickUp Focus Board view, if you have one | |
| `crmWatch` | `mine` (only your CRM items glow) or `all` | |
| `crmCc` | The address CRM drafts cc so Hermes logs the outreach | Ask Ayesha or Kriss |
| `agendaPosterSlack` | Slack id of whoever posts the meeting agenda (the review reads it) | Ask Ayesha |

`config/me.json` is ignored by git; it never goes into the repo.

**3. Install.**

```bash
python3 tools/personalize.py config/me.json
```

This writes the code to `~/AI Tools/desk-widget/` with your values filled in, copies `me.json` beside it, and starts you with an example `TASKS.md`, `CLAUDE.md`, `team.tsv`, `crm-seed.tsv`, `crm-exclude.txt` and `campaigns.json` (only if you do not have them). Running it again on an existing install needs `--force`, and even then only the code files are replaced: your tasks, notes, Rolodex, state folders and keys are left alone.

**4. Fireflies key.**

```bash
pbpaste > ~/"AI Tools/desk-widget/.fireflies-key"   # after copying the key
chmod 600 ~/"AI Tools/desk-widget/.fireflies-key"
```

It is never printed by any script. Keep it out of anything you publish.

**4b. ClickUp token** (for the CRM). The CRM reads ClickUp's REST API with it, GET only, so it does not use up the connector's daily limit.

```bash
pbpaste > ~/"AI Tools/desk-widget/.clickup-token"   # after copying the token
chmod 600 ~/"AI Tools/desk-widget/.clickup-token"
python3 ~/"AI Tools/desk-widget/crm_rest.py" fields   # check: prints the CRM lists' field names
```

Without it the CRM falls back to the connector every 3 hours. The file is ignored by git and the leak check fails on any `pk_` token.

**5. Show the widget.** Übersicht's widget folder preference does not stick, so link the widget into the folder it actually watches:

```bash
ln -s ~/"AI Tools/desk-widget/msbai-desk.widget" \
      ~/"Library/Application Support/Übersicht/widgets/msbai-desk.widget"
```

**6. Permissions** (System Settings → Privacy & Security):

- **Calendars**: Übersicht (the calendar feed runs as its child) and icalBuddy. If Übersicht is refused, the calendar quietly falls back to icalBuddy and loses colours and reply state.
- **Automation**: Übersicht → Terminal.
- **Accessibility**: Übersicht (to park the Claude app and Terminal windows and to send the keys for work it).
- In Übersicht's preferences, **Enable interaction** must be on (it is by default).

**7. Background sync.** Install the launchd job that runs the task sync and the ClickUp mirror every 5 minutes:

```bash
cp ~/"AI Tools/desk-widget/com.msbai.tasks-sync.plist" ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.msbai.tasks-sync.plist
```

**8. First runs.**

```bash
cd ~/"AI Tools/desk-widget"
./tasks-sync.sh init 3      # mark older meetings handled, start the Slack window 3 days back
./tasks-sync.sh now         # first task sweep
./clickup-sync.sh now       # pair your tasks with ClickUp
zsh crm.sh sync             # first CRM read (skip if you will not use the CRM)
zsh wiki.sh sync            # the wiki's live layer
```

The workstreams flow builds itself on the first beat (the last 3 weeks of meetings, one at a time, oldest first); it takes a while the first time. `zsh flow.sh status` shows the queue.

**9. Check.** Every script has `status`, which prints the tail of its log: `./tasks-sync.sh status`, `./clickup-sync.sh status`, `zsh flow.sh status`, `zsh crm.sh status`, `zsh watch.sh status`, and so on. Each job's last prompt and full reply are kept beside its state for debugging.

## Optional

- **OpenClaw tab.** Put the command in `openclaw-cmd` (for example `ssh -t openclaw-vps "cd ~/openclaw && claude"` over Tailscale) and **+ openclaw** opens it.
- **Layout.** `CFG` at the top of `msbai-desk.widget/index.jsx`: which screen edge, sizes, zoom, the work it lead line and shortcut, `terminal` (off). Everything else is dragged and remembered, and text size, widget size, glass, contrast, tab bar and corners are on the **Settings** page (double click the desk tab).
- **Campaigns.** Add target lists the CRM does not hold yet to `campaigns.json` (shape in `examples/campaigns.example.json`).
- **Google Calendar writes.** Off (`CFG.googleApi: false`) because the Workspace org does not allow creating an OAuth client. Replies go through Calendar.app; new events through EventKit.
- **Schedules and models.** Every interval and model can be changed with an environment variable (see [08](08-jobs-and-schedules.md)).

## Updating

```bash
cd MSBAI-Widget && git pull
python3 tools/personalize.py config/me.json --force
```

## Removing

```bash
launchctl bootout gui/$(id -u)/com.msbai.tasks-sync
rm ~/Library/LaunchAgents/com.msbai.tasks-sync.plist
rm ~/"Library/Application Support/Übersicht/widgets/msbai-desk.widget"
```

Your `~/AI Tools` folder (tasks, notes, Rolodex, state) stays until you delete it.
