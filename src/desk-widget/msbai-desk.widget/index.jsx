// MSBAI Desk — Übersicht widget
//
//   ┌───────────────────────┬──────────┐
//   │ Calendar (next 12 h)  │ Tasks    │   ← rows expand to notes + links
//   │                       ├──────────┤
//   │                       │ System   │   ← click the label to fold to a bar
//   │                       ├──────────┤
//   │                       │ Meetings │   ← same; Tasks takes the room
//   ├───────────────────────┴──────────┤
//   │ ▸ thread tabs                    │   ← real Terminal windows running claude
//   │   (terminal parks here)          │
//   ├──────────────────────────────────┤
//   │ Notes                            │
//   └──────────────────────────────────┘
//
// Styling follows the "Glass Widgets" pack by Matteo Savoia (vendor/glass-widgets):
// white-tinted translucency over a heavy backdrop blur, hairline light border,
// 22px corners, and 9px/800 uppercase labels. Edit CFG to move/resize.

import { css as emoCss, run } from "uebersicht";
// Every css block goes through here so the Settings page can scale text: each "font-size: Npx"
// becomes N px times the Text size slider (a CSS variable set on the page, 1 = as designed).
const css = (strings, ...vals) => {
  let out = strings[0];
  vals.forEach((v, i) => { out += v + strings[i + 1]; });
  return emoCss(out.replace(/font-size:\s*([\d.]+)px/g, "font-size: calc($1px * var(--msbfs, 1))"));
};

// ───────────────────────── config ─────────────────────────
const CFG = {
  folder: "$HOME/AI Tools",         // where TASKS.md and notes.md live
  account: "{{OWNER_EMAIL}}",  // the Google Calendar account gcal.sh writes to
  googleApi: false,                 // true only with a Google OAuth client + `gcal.sh auth`. The
                                    // Workspace org blocks creating one, so replies go through
                                    // Calendar.app (opened at the event) and creating goes through
                                    // EventKit. gcal.py keeps the API path for if that changes.
  slackTeam: "TBHCSMFPG",           // msbai.slack.com — lets a Slack link open the app directly
  side: "right",                    // "left" | "right" — which screen edge the column hugs
  edge: 24,                         // px from screen edge
  top: 40,                          // px from top of screen (leave room for the menu bar)
  calWidth: 380,                    // px — calendar column
  tasksWidth: 280,                  // px — tasks + system column, beside the calendar
  zoom: 1.12,                       // the permanent size of the whole cluster. 1 = native.
                                    // `zoom` re-lays-out, so text stays sharp at any value —
                                    // unlike transform: scale(), which stretches a bitmap.
  gap: 14,                          // px between panels — the ONLY vertical spacing value
  timeSide: "left",                 // which side of the calendar the hour labels sit on
  tasksMax: 30,                     // rows shown in the tasks panel (it scrolls)
  foldHeight: 34,                   // px — a folded System / Meetings panel is just its label
  procsMax: 4,                      // rows shown in the top-processes list
  hours: 12,                        // rolling window length
  spareHours: 4,                    // drawn past the window, into room hidden all-day chips give back
  hourHeight: 44,                   // px per hour row — starting value; the divider adjusts it
  dockHeight: 280,                  // px — where the terminal window parks (0 to remove)
  terminal: false,                  // the Terminal strip on the desk (thread tabs and the slot a Terminal
                                    // window parks in). Off: Calendar and Tasks grow into its room, so
                                    // Notes stays where it is on every tab. true brings it back.
  rackWidth: 196,                   // px — the thread rail in the Claude pane
  claudeHeight: 940,                // px — the Claude desktop pane, in the other view
  notesHeight: 120,                 // px — about a paragraph
  dockNudgeY: 0,                    // px — bump if the terminal parks high/low of the slot
  // App keys to QUIT when you switch away from their pane, instead of only hiding them.
  // Hiding leaves the Dock icon behind; quitting is what removes it. Empty = never quit.
  // e.g. ["claude"] — leaving cursor out, since editors hold unsaved work.
  quitOnLeave: [],
  mainDisplayOnly: true,            // false to also draw it on secondary displays (no terminal there)
  glassTint: 0.17,                  // 0.04 = clearer, 0.2 = milkier
  glassBlur: 0,                     // px of backdrop blur. 0 = none, and 0 is deliberate:
                                    // Übersicht re-renders the whole tree on every state change,
                                    // and each re-render made WebKit re-rasterise the blur, which
                                    // read as the panels flickering between two frost levels on
                                    // the 5s stats beat. A plain translucent fill cannot flicker.
  refreshMs: 120 * 1000,            // calendar / tasks / notes / tabs — icalBuddy is ~1s of work
  statsMs: 5 * 1000,                // cpu / ram / disk / processes, polled separately
  // "work it" on an open task row: a new thread in the Claude app with the task pasted in.
  calNewButton: false,              // the calendar's "+ new" event composer; calls start from the call bar
  workItKey: "n",                   // the app's new thread shortcut, sent with Cmd
  workItSend: false,                // false = paste and stop: Enter sends it, or type more first
  workItLead: "Work this task from my desk widget. Open every linked source before you start, then do it. Drafts only: send or post nothing without asking me.",
};

const BASE_WIDTH = CFG.calWidth + CFG.gap + CFG.tasksWidth;
// The cluster's width. Drag its right edge to change it (saved as split.wide); every view uses
// the extra room: Tasks, the Claude pane, Emails, Priorities. Set at the top of each render.
let WIDTH = BASE_WIDTH;
const WIDE_MIN = BASE_WIDTH - 80, WIDE_MAX = 1800;

// Each of these gets a tab. The pane is a slot and the real app window parks over it, so every
// one keeps its full feature set — nothing here reimplements them.
const APPS = [
  { key: "claude",  name: "Claude",   label: "claude" },
];
// Views the widget draws itself, rather than parking an app over a slot.
const OWN_VIEWS = [
  { key: "crm", label: "crm" },
  { key: "priorities", label: "workstreams" },
  { key: "wiki", label: "wiki" },
];
const appByKey = k => APPS.find(a => a.key === k);
const DOCK = `"${CFG.folder}/desk-widget/dock.sh"`;
const NOTES = `"${CFG.folder}/desk-widget/notes.sh"`;
const FLY = `"${CFG.folder}/desk-widget/fireflies.sh"`;
const ZOOM = `/bin/zsh "${CFG.folder}/desk-widget/zoom.sh"`;   // through zsh, so a lost +x bit cannot stop it
const GC  = `GCAL_ACCOUNT=${JSON.stringify(CFG.account)} "${CFG.folder}/desk-widget/gcal.sh"`;
const CAL_CMD = `"${CFG.folder}/desk-widget/cal.sh" events ${CFG.hours + CFG.spareHours}`;

// ───────────────────────── glass ─────────────────────────
const GLASS = {
  bg: `rgba(255, 255, 255, var(--msbglass, ${CFG.glassTint}))`,
  blur: `${CFG.glassBlur}px`,
  radius: "var(--msbradius, 22px)",
  border: "1px solid rgba(255, 255, 255, 0.15)",
  shadow: "0 20px 50px rgba(0,0,0,0.3)",
  label: "rgba(255, 255, 255, var(--msbl, 0.4))",
  sub: "rgba(255, 255, 255, var(--msbs, 0.6))",
  hair: "rgba(255, 255, 255, 0.1)",
};
// cal = the interactive highlight: a cool silver rather than a saturated blue, so selection and
// hover read as part of the glass instead of sitting on top of it.
// The blur is opt-in. With it off there is no compositing layer to invalidate, so a re-render
// cannot change how the panels look.
const FROST = CFG.glassBlur > 0
  ? `backdrop-filter: blur(${CFG.glassBlur}px); -webkit-backdrop-filter: blur(${CFG.glassBlur}px);
     transform: translateZ(0); will-change: backdrop-filter;`
  : "";

// Urgency has its own colors, apart from every company color (MSBAI blue, Tam Fortis green,
// Nexcavate amber) and the gold of "yours": red for late, overdue, owed or failed; rose for a
// warning or "soon".
const ACCENT = { cpu: "#34C759", ram: "#32D74B", disk: "#FFCC00", cal: "#CBD3DE", now: "#FF453A",
                 link: "#4CB4FF",
                 pin: "#F2C14E",      // a pinned task's title: gold
                 notify: "#C9A8FF",   // a task with news (watch.sh): soft violet
                 reply: "#64D2FF",
                 heads: "#F5D46B" };  // "good to know" cautions on a CRM card (embargo, TPOC rules, which mailbox): soft gold. Red stays for late.  // waiting on YOUR reply, everywhere (CRM, inbox, tab badge, unanswered invites): baby blue // a task with news (watch.sh): soft violet. link is the one blue, reserved for "this opens something"

// ───────────────────────── data commands ─────────────────────────
// cal.sh reads EventKit directly (colour, attendee status, cancellations — none of which
// icalBuddy can express) and falls back to icalBuddy if calendar access is refused.
// fireflies.sh serves a cached list of meeting titles; a transcript is only ever fetched
// when one is clicked.
// Written by the command on every beat, so a look at desk-widget/.widget-build tells which version of
// this file Übersicht is actually running (a file that fails to compile leaves the old one running).
const WIDGET_BUILD = "2026-10-08 proposals first";
export const command = `
F="${CFG.folder}";
echo "${WIDGET_BUILD}" > "$F/desk-widget/.widget-build";
for nf in "$F/desk-widget/.newnotes/"*.md; do [ -f "$nf" ] && mv -n "$nf" "$F/notes/" 2>/dev/null; done;
for nf in "$F/desk-widget/.replacenotes/"*.md; do [ -f "$nf" ] && mv -f "$nf" "$F/notes/" 2>/dev/null; done;
[ -f "$F/desk-widget/.notes-cleaned-1" ] || { rm -f "$F/notes/guru-wording.md"; : > "$F/desk-widget/.notes-cleaned-1"; };
[ -x "$F/desk-widget/MSBAI Listen.app/Contents/MacOS/listen" ] || [ -f "$F/desk-widget/.voice/build.log" ] ||
  ( /bin/zsh "$F/desk-widget/voice.sh" build >/dev/null 2>&1 & );
[ -s "$F/desk-widget/.probe" ] || { for b in ffmpeg sox rec whisper whisper-cli whisper-cpp swift swiftc python3; do
  printf '%s\t%s\n' "$b" "$(command -v $b || ls /opt/homebrew/bin/$b /usr/local/bin/$b 2>/dev/null | head -1)"; done;
  sw_vers -productVersion; ls /opt/homebrew/Cellar 2>/dev/null | tr '\n' ' '; } > "$F/desk-widget/.probe" 2>&1;
echo "===CLICKUP===";
cat "$F/desk-widget/.clickup-collab.tsv" 2>/dev/null;
echo "===COLLABNOTES===";
cat "$F/desk-widget/.clickup-collab-notes.tsv" 2>/dev/null;
echo "===CAL===";
"$F/desk-widget/cal.sh" events ${CFG.hours + CFG.spareHours} 2>/dev/null | tee "$F/desk-widget/.cal-last";
echo "===TASKS===";
cat "$F/TASKS.md" 2>/dev/null;
echo "===NOTELIST===";
"$F/desk-widget/notes.sh" list 2>/dev/null;
echo "===NOTES===";
"$F/desk-widget/notes.sh" read 2>/dev/null;
echo "===TABS===";
"$F/desk-widget/dock.sh" list 2>/dev/null;
echo "===ZOOMS===";
/bin/zsh "$F/desk-widget/zoom.sh" recent 2>/dev/null;
echo "===TEAM===";
/bin/zsh "$F/desk-widget/team.sh" tick 2>/dev/null;
echo "===ME===";
cat "$F/desk-widget/me.json" 2>/dev/null;
echo "===EMAILS===";
/bin/zsh "$F/desk-widget/emails.sh" tick 2>/dev/null;
echo "===FLOW===";
/bin/zsh "$F/desk-widget/flow.sh" tick 2>/dev/null;
echo "===MINE===";
/bin/zsh "$F/desk-widget/mine.sh" tick 2>/dev/null;
echo "===PREP===";
/bin/zsh "$F/desk-widget/prep.sh" tick 2>/dev/null;
echo "===GCAL===";
"$F/desk-widget/gcal.sh" status 2>/dev/null;
echo "===MAIN===";
/usr/bin/osascript -l JavaScript -e 'ObjC.import("AppKit"); var f = $.NSScreen.screens.objectAtIndex(0).frame; f.size.width + "x" + f.size.height' 2>/dev/null;
echo "===CUCLOSED===";
cat "$F/desk-widget/.tasks-sync/clickup-closed" 2>/dev/null;
echo "===WIKI===";
cat "$F/desk-widget/wiki.json" 2>/dev/null;
echo "===WIKIINBOX===";
tail -20 "$F/desk-widget/.wiki/inbox.jsonl" 2>/dev/null;
echo "===WIKILIVE===";
/bin/zsh "$F/desk-widget/wiki.sh" tick 2>/dev/null;
echo "===CRM===";
/bin/zsh "$F/desk-widget/crm.sh" tick 2>/dev/null;
echo "===WATCH===";
/bin/zsh "$F/desk-widget/watch.sh" tick 2>/dev/null;
`;

// Polled on its own, faster clock — the calendar side is far too expensive to run this often.
// memory_pressure gives the same free-percentage Activity Monitor works from, and the page size
// is read rather than assumed (Apple silicon uses 16K pages, not the 4K the glass pack hardcodes).
const STATS_CMD = `
top -l 1 -n 0 | awk '/CPU usage/ {print "cpu " $3 + $5}';
memory_pressure 2>/dev/null | awk '/System-wide memory free percentage/ {gsub("%","",$NF); print "memfree " $NF}';
sysctl -n hw.memsize | awk '{print "memtotal " $1}';
df -k /System/Volumes/Data | awk 'NR==2 {print "disk " $3 " " $4 " " $2}';
echo "===PROCS===";
ps axro "%cpu,comm" | awk 'FNR>1' | head -n ${CFG.procsMax};
`;

export const refreshFrequency = CFG.refreshMs;
const FRONT_CMD = `/usr/bin/lsappinfo info -only name "$(/usr/bin/lsappinfo front)" 2>/dev/null`;

const SPLIT_KEY = "msbai_split";
const savedSplit = () => {
  try { return JSON.parse(localStorage.getItem(SPLIT_KEY) || "null") || {}; } catch (e) { return {}; }
};
const SPLIT_DEFAULTS = { cal: CFG.calWidth, sys: 244, dock: CFG.dockHeight,
                         hourH: CFG.hourHeight, meet: 132 };

// System and Meetings fold down to a one-line bar; whatever is folded is remembered, and
// Tasks — the flexible panel in the column — takes the room they give up.
const FOLD_KEY = "msbai_fold";
const savedFold = () => {
  try { return JSON.parse(localStorage.getItem(FOLD_KEY) || "null") || {}; } catch (e) { return {}; }
};
// Which task rows are open to their notes. Keyed by title, so a rewrite of TASKS.md that keeps
// the title keeps the row open.
const OPEN_KEY = "msbai_open_tasks";
const savedOpen = () => {
  try { return JSON.parse(localStorage.getItem(OPEN_KEY) || "[]"); } catch (e) { return []; }
};

// Pinned tasks: a double-click gilds the title and lifts the row to the top of the list until it
// is ticked done or double-clicked again. Newest pin first. Only the display order changes —
// TASKS.md keeps its order, so an unpinned row falls back to exactly where it was.
const PIN_KEY = "msbai_pinned_tasks";
const savedPins = () => {
  try { return JSON.parse(localStorage.getItem(PIN_KEY) || "[]"); } catch (e) { return []; }
};

// Highlights: rest the pointer on the far right edge of a task for a moment and a small swatch
// tray slides out; pick one of three colors (click the same one again to clear it). Keyed by
// title, like pins. Only this widget sees them.
const MARK_KEY = "msbai_task_marks";
const MARKS = [                             // sticky note colors: pink, yellow, blue
  { key: "m1", name: "pink",   hex: "#FF9ECF", rgb: "255,158,207" },
  { key: "m2", name: "yellow", hex: "#FFE566", rgb: "255,229,102" },
  { key: "m3", name: "blue",   hex: "#8FD8FF", rgb: "143,216,255" },
];
const savedMarks = () => {
  try { return JSON.parse(localStorage.getItem(MARK_KEY) || "{}") || {}; } catch (e) { return {}; }
};
// Your own order: hold a task and drag it to move it. Pinned rows stay on top (in the order you
// drag them), then new tasks you have not placed yet, then the rest in your order.
const ORDER_KEY = "msbai_task_order";
const savedOrder = () => {
  try { return JSON.parse(localStorage.getItem(ORDER_KEY) || "[]") || []; } catch (e) { return []; }
};

// The Tasks panel has two tabs: the desk list (TASKS.md), and Collab, {{OWNER_FIRST}}'s open ClickUp tasks
// that teammates are also assigned to, as clickup-sync.sh last saw them (.clickup-collab.tsv,
// refreshed every 10 min). A click on a tab switches; a double-click on either opens his Focus Board.
// A Collab row folds open like a desk task, to notes clickup-sync.sh builds whenever the task changes
// in ClickUp (.clickup-collab-notes.tsv: id <TAB> one note line).
const FOCUS_BOARD = "{{OWNER_FOCUS_BOARD_URL}}";
const TASK_TAB_KEY = "msbai_task_tab";
const savedTaskTab = () => {
  try { return localStorage.getItem(TASK_TAB_KEY) === "collab" ? "collab" : "desk"; } catch (e) { return "desk"; }
};
const parseFocus = tsv => String(tsv || "").split("\n").map(l => l.split("\t"))
  .filter(f => f.length >= 7 && /^[0-9a-z]+$/.test(f[0]))
  .map(([id, status, due, list, who, updated, ...name]) => ({ id, status, due: due === "-" ? "" : due, list, who, name: name.join(" ") }));
const parseCollabNotes = tsv => String(tsv || "").split("\n").reduce((m, l) => {
  const i = l.indexOf("\t");
  if (i > 0 && l.slice(i + 1).trim()) (m[l.slice(0, i)] = m[l.slice(0, i)] || []).push(l.slice(i + 1).trim());
  return m;
}, {});

const CHIPS_KEY = "msbai_hidden_chips";
const savedChips = () => {
  try { return JSON.parse(localStorage.getItem(CHIPS_KEY) || "[]"); } catch (e) { return []; }
};

const ROWH_KEY = "msbai_rowh";
const savedRowH = () => {
  try { return parseInt(localStorage.getItem(ROWH_KEY) || "0", 10) || 0; } catch (e) { return 0; }
};
let lastRowH = 0;

// Hiding an all-day chip used to shorten the calendar panel, and the whole cluster below it rode
// up with it. The panel now keeps the tallest height it has had today at this hour height, and the
// hour grid grows into whatever the chips give back — more of the coming hours, nothing moving.
// The calendar panel's fixed part (header, all-day chips, padding): everything but the hour grid.
// With the terminal off, the hours stretch so the panel fills the room the terminal used to take.
// ── Settings (double-click the desk tab) ──
// Each slider's middle is the setup this widget was tuned on, so moving one is always a change
// from a known good place. Saved per Mac; Reset puts everything back to the middle.
const SETTINGS_KEY = "msbai_settings";
const SETTINGS = [
  { k: "fs",     label: "Text size",       min: 0.8,  max: 1.2,  step: 0.01, def: 1,    fmt: v => `${Math.round(v * 100)}%`,
    hint: "every label, title and note" },
  { k: "zoom",   label: "Widget size",     min: 0.92, max: 1.32, step: 0.01, def: 1.12, fmt: v => `${Math.round(v / 1.12 * 100)}%`,
    hint: "the whole cluster, bigger or smaller on screen" },
  { k: "glass",  label: "Glass opacity",   min: 0.04, max: 0.30, step: 0.005, def: 0.17, fmt: v => `${Math.round(v * 100)}%`,
    hint: "clearer for a dark wallpaper, milkier for a busy one" },
  { k: "ink",    label: "Label contrast",  min: 0.6,  max: 1.4,  step: 0.01, def: 1,    fmt: v => `${Math.round(v * 100)}%`,
    hint: "how bright the gray secondary text is" },
  { k: "tabs",   label: "Tab bar size",    min: 0.8,  max: 1.4,  step: 0.01, def: 1,    fmt: v => `${Math.round(v * 100)}%`,
    hint: "the desk, claude, crm, workstreams, wiki switch" },
  { k: "radius", label: "Corner roundness", min: 10,  max: 34,   step: 1,    def: 22,   fmt: v => `${Math.round(v)}px`,
    hint: "how rounded the glass panels are" },
];
const SETTINGS_DEF = Object.assign({}, ...SETTINGS.map(x => ({ [x.k]: x.def })));
const savedSettings = () => {
  try { return { ...SETTINGS_DEF, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {}) }; }
  catch (e) { return { ...SETTINGS_DEF }; }
};
CFG.zoom = savedSettings().zoom || CFG.zoom;          // the widget size slider drives the cluster's zoom
function setSetting(cur, k, v, dispatch) {
  const next = { ...(cur || SETTINGS_DEF), [k]: v };
  if (k === "zoom") CFG.zoom = v;
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch (e) {}
  dispatch({ type: "SETTINGS", value: next });
}
function resetSettings(dispatch) {
  CFG.zoom = SETTINGS_DEF.zoom;
  try { localStorage.removeItem(SETTINGS_KEY); } catch (e) {}
  dispatch({ type: "SETTINGS", value: { ...SETTINGS_DEF } });
}
const settingsVars = st => `:root { --msbfs: ${st.fs}; --msbglass: ${st.glass}; --msbradius: ${st.radius}px;
  --msbl: ${Math.min(1, 0.4 * st.ink).toFixed(3)}; --msbs: ${Math.min(1, 0.6 * st.ink).toFixed(3)}; }`;

// The System pill: click it to flip between load (CPU, RAM, free space) and storage detail.
const SYSMODE_KEY = "msbai_sys_mode";
const savedSysMode = () => { try { return localStorage.getItem(SYSMODE_KEY) || "load"; } catch (e) { return "load"; } };
function flipSysMode(cur, dispatch) {
  const next = cur === "disk" ? "load" : "disk";
  try { localStorage.setItem(SYSMODE_KEY, next); } catch (e) {}
  dispatch({ type: "SYS_MODE", value: next });
}
const CALFIX_KEY = "msbai_cal_fixed";
const savedCalFixed = () => { try { return parseInt(localStorage.getItem(CALFIX_KEY) || "0", 10) || 0; } catch (e) { return 0; } };
function rememberCalFixed() {
  const el = document.getElementById("msbai-cal"), g = document.getElementById("msbai-grid");
  if (!el || !g) return;
  const f = Math.round(el.offsetHeight - g.offsetHeight);
  if (f > 0 && f !== savedCalFixed()) { try { localStorage.setItem(CALFIX_KEY, String(f)); } catch (e) {} }
}
const CALH_KEY = "msbai_calh";
const savedCalH = hourH => {
  try {
    const c = JSON.parse(localStorage.getItem(CALH_KEY) || "null");
    if (c && c.day === new Date().toDateString() && c.hourH === hourH) return c.h;
  } catch (e) {}
  return 0;
};
function rememberCalH(hourH) {
  const el = document.getElementById("msbai-cal"), g = document.getElementById("msbai-grid");
  if (!el || !g) return;
  // the panel's natural height: what it would be with the grid at exactly its window
  const h = Math.round(el.offsetHeight - (g.offsetHeight - CFG.hours * hourH));
  if (h > savedCalH(hourH)) {
    try { localStorage.setItem(CALH_KEY, JSON.stringify({ day: new Date().toDateString(), hourH, h })); } catch (e) {}
  }
}
const PANEH_KEY = "msbai_paneh";
const savedPaneH = () => { try { return parseInt(localStorage.getItem(PANEH_KEY) || "0", 10) || 0; } catch (e) { return 0; } };
function rememberPaneH() {
  const r = document.getElementById("msbai-row"), n = document.getElementById("msbai-notes");
  if (!r || !n) return;
  const h = Math.round(n.offsetTop - r.offsetTop - CFG.gap);
  if (h > 100) { try { localStorage.setItem(PANEH_KEY, String(h)); } catch (e) {} }
  // Everything above the terminal slot (calendar row, gap, thread tabs). The big area on every
  // other tab is this plus the terminal's height, so Notes sits in the same place on all tabs.
  const d = document.getElementById("msbai-dock");
  if (d && h > 100) { try { localStorage.setItem(PANEOVER_KEY, String(Math.round(h - d.offsetHeight))); } catch (e) {} }
}
const PANEOVER_KEY = "msbai_pane_over";
const savedPaneOver = () => { try { return parseInt(localStorage.getItem(PANEOVER_KEY) || "0", 10) || 0; } catch (e) { return 0; } };
function rememberRowH() {
  const el = document.getElementById("msbai-row");
  if (!el) return;
  const h = Math.round(el.offsetHeight);          // layout px, so it matches the split values
  if (h > 0 && h !== lastRowH) {
    lastRowH = h;
    try { localStorage.setItem(ROWH_KEY, String(h)); } catch (e) {}
  }
}

const GEO_KEY = "msbai_geo";
const savedGeo = () => {
  try {
    const g = JSON.parse(localStorage.getItem(GEO_KEY) || "null");
    if (g && typeof g.x === "number" && typeof g.y === "number") return g;
  } catch (e) {}
  return null;
};
const defaultGeo = () => ({
  x: CFG.side === "right" ? Math.max(8, (window.innerWidth || 1440) - CFG.edge - WIDTH * CFG.zoom) : CFG.edge,
  y: CFG.top,
});

const savedView = () => {
  try {
    let v = localStorage.getItem("msbai_view");
    if (v === "emails") v = "crm";                     // the Emails tab became the CRM tab (Oct 6)
    return v === "desk" || appByKey(v) || OWN_VIEWS.some(o => o.key === v) ? v : "desk";
  } catch (e) { return "desk"; }
};

export const initialState = {
  cal: [], allDay: [], tasks: [], notes: "", notesDirty: false, tabs: [], main: "", view: savedView(),
  meetings: [], meetNote: "", pulling: "", copied: "",
  geo: savedGeo(), split: savedSplit(), hiddenChips: savedChips(), sel: null,
  fold: savedFold(), openTasks: savedOpen(), pinned: savedPins(), copiedTask: "",
  marks: savedMarks(), taskOrder: savedOrder(), markPop: "", taskDrag: null, sysMode: savedSysMode(), settings: savedSettings(),
  taskTab: savedTaskTab(), cuTasks: [], cuNotes: {}, cuClose: { pending: 0, titles: [] },
  gcal: "", compose: null, evBusy: "", flash: "", zoomBox: null, zooms: [], team: [], teamNotes: { added: [], gone: [], synced: 0 }, teamSync: false,
  me: { name: "", aliases: [] },
  crm: null, crmUi: savedCrmUi(),
  emails: [], mail: {}, mailSync: false, preps: {}, prepSeen: (() => { try { return JSON.parse(localStorage.getItem("msbai_prep_seen") || "[]"); } catch (e) { return []; } })(), prepOpen: "", cmdBox: null,
  flow: null, flowStatus: "", flowSel: "", noteMode: "view", mine: { items: {} }, flowDone: false, flowGrp: "",
  flowTab: (() => { try { return localStorage.getItem("msbai_flow_tab") || "team"; } catch (e) { return "team"; } })(),
  noteList: [], noteEdit: null,
  wiki: null, wikiInbox: [], wikiLive: null, wikiQ: "", wikiKind: "all", wikiAdd: null, wikiOrigin: "50% 30%",
  wikiPage: (() => { try { return localStorage.getItem("msbai_wiki_page") || "home"; } catch (e) { return "home"; } })(),
  wikiAs: (() => { try { return localStorage.getItem("msbai_wiki_as") || "all"; } catch (e) { return "all"; } })(),
  stats: { cpu: 0, memPct: 0, memUsed: 0, memTotal: 0, diskPct: 0, diskUsed: 0, diskFree: 0, diskTotal: 0, procs: [] },
  error: "",
};

// ───────────────────────── parsing ─────────────────────────
// cal.sh emits one tab-separated record per event. Tabs, not pipes: a real meeting on this
// calendar is titled "xTech|Disrupt Fires", which ate a field the first time round.
const EK_STATUS = { 2: "tentative", 3: "canceled" };
const EK_MINE   = { 1: "reply", 3: "declined", 4: "maybe" };

// cal.sh escapes newlines so one event stays one record; put them back.
const unesc = v => String(v || "").replace(/\\(.)/g, (m, c) => (c === "n" ? "\n" : c)).trim();

const parseLocal = v => {
  const m = String(v || "").match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null;
};

// EventKit participant status -> the card's reply dot
const EK_PART = { 0: "pending", 1: "pending", 2: "accepted", 3: "declined", 4: "tentative", 5: "accepted", 6: "accepted", 7: "pending" };
function parseCal(block) {
  const events = [], allDay = [];
  const text = String(block || "");
  if (text.trim().startsWith("!!")) return { events, allDay, error: text.trim() };
  text.split("\n").forEach(raw => {
    if (!raw.startsWith("E\t")) return;
    const f = raw.split("\t");
    const title = (f[10] || "").trim();
    if (!title) return;
    const type = parseInt(f[7], 10) || 0;
    const e = {
      title,
      status: EK_STATUS[parseInt(f[4], 10)] || "",     // canceled / tentative, from the organiser
      mine: EK_MINE[parseInt(f[5], 10)] || "",         // my own reply: needs one, declined, maybe
      attendees: parseInt(f[6], 10) || 0,
      birthday: type === 4,
      sub: type === 3,                                  // a subscribed calendar — holidays and such
      calendar: (f[8] || "").trim(),
      color: /^\d{1,3},\d{1,3},\d{1,3}$/.test((f[9] || "").trim()) ? f[9].trim() : "",
      loc: unesc(f[11]),
      url: unesc(f[12]),
      notes: unesc(f[13]),
      uid: (f[14] || "").trim(),                        // iCalendar UID — gcal.sh finds it on Google by this
      // who is invited (cal.sh): name, reply, email, and which one is you
      people: unesc(f[15]).split(";;").filter(Boolean).map(x => {
        const [n, st, em, me] = x.split("|");
        return { n: (n || "").trim() || (em || "").split("@")[0], st: EK_PART[parseInt(st, 10)] || "pending", em: (em || "").trim(), me: me === "1" };
      }),
      organizer: unesc(f[16]).trim(),
    };
    const start = parseLocal(f[1]), end = parseLocal(f[2]);
    // spareHours fetches past the window; an all-day event that only starts out there stays hidden
    if (f[3] === "1" || !start || !end) {
      if (!start || start.getTime() < Date.now() + CFG.hours * 3600 * 1000) allDay.push(e);
      return;
    }
    events.push({ ...e, start, end });
  });
  return { events, allDay, error: "" };
}

// fireflies.sh list → id<TAB>epoch_ms<TAB>minutes<TAB>title, or a "!!" state marker.
function parseMeetings(block) {
  const text = String(block || "").trim();
  if (text.startsWith("!!")) return { list: [], note: text.slice(2) };
  const list = text.split("\n").map(l => {
    const f = l.split("\t");
    if (f.length < 4 || !f[0]) return null;
    return { id: f[0], when: new Date(parseInt(f[1], 10) || 0), mins: parseInt(f[2], 10) || 0, title: f[3] };
  }).filter(Boolean);
  return { list, note: "" };
}

// zoom.sh recent → id<TAB>topic<TAB>join<TAB>names<TAB>fireflies state<TAB>dm state, newest first.
function parseZooms(block) {
  return String(block || "").trim().split("\n").map(l => {
    const f = l.split("\t");
    if (f.length < 6 || !/^\d+$/.test(f[0])) return null;
    return { id: f[0], when: new Date(parseInt(f[0], 10) * 1000), topic: f[1], join: f[2], names: f[3], ff: f[4], dm: f[5] };
  }).filter(Boolean);
}
// team.sh tick → team.tsv (name<TAB>Slack user id<TAB>email, one teammate per line, in the order the card
// shows them), then NOTE lines (added / gone) and a SYNCED line with when it last checked Slack.
function parseTeam(block) {
  return String(block || "").trim().split("\n").map(l => {
    const f = l.split("\t").map(x => x.trim());
    return f.length >= 2 && f[0] && /^[UW][A-Z0-9]{6,}$/.test(f[1]) ? { name: f[0], id: f[1], email: f[2] || "" } : null;
  }).filter(Boolean);
}

function parseTeamNotes(block) {
  const notes = { added: [], gone: [], synced: 0 };
  String(block || "").split("\n").forEach(l => {
    const f = l.split("\t").map(x => x.trim());
    if (f[0] === "NOTE" && (f[1] === "added" || f[1] === "gone") && f[2]) notes[f[1]].push({ id: f[2], name: f[3] || f[2] });
    if (f[0] === "SYNCED") notes.synced = (parseInt(f[1], 10) || 0) * 1000;
  });
  return notes;
}
const TEAM_SH = `/bin/zsh "${CFG.folder}/desk-widget/team.sh"`;
function teamCmd(args, dispatch) {
  dispatch({ type: "TEAM_SYNC", value: true });
  run(`${TEAM_SH} ${args}`).then(out => dispatch({ type: "TEAM", value: out }))
    .catch(() => dispatch({ type: "TEAM_SYNC", value: false }));
}
const agoShort = ms => {
  const m = Math.round((Date.now() - ms) / 60e3);
  return m < 2 ? "just now" : m < 60 ? `${m}m ago` : m < 48 * 60 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};

// me.json: whose widget this is. Their name lights up wherever the work names them.
function parseMe(text, prev) {
  try { const m = JSON.parse(String(text || "").trim()); if (m && m.name) return m; } catch (e) {}
  return prev || { name: "", aliases: [] };
}
const isMe = (who, me) => {
  const w = String(who || "").trim().toLowerCase();
  if (!w || !me || !me.name) return false;
  return [me.name, me.full, ...(me.aliases || [])].filter(Boolean).some(a => {
    const x = String(a).toLowerCase(); return w === x || w.startsWith(x + " ") || x.startsWith(w + " ");
  });
};
const unb64 = x => { try { return decodeURIComponent(escape(atob(x))); } catch (e) { return ""; } };
// emails.sh → thread, last message, date, from name, from email, company, subject, need, link.
function parseEmails(block) {
  return String(block || "").trim().split("\n").map(l => {
    const f = l.split("\t");
    if (f.length < 9 || !f[0]) return null;
    const when = new Date(f[2]);
    return { thread: f[0], message: f[1], when: isNaN(when) ? null : when, from: f[3] || f[4], email: f[4],
             company: f[5], subject: f[6], need: f[7], url: f[8] || "",
             suggestion: f[9] && f[9] !== "-" ? unb64(f[9]) : "", why: f[10] ? unb64(f[10]) : "",
             suggestTried: f[9] === "-", practice: f[11] === "P", sent: f[12] ? unb64(f[12]) : "" };
  }).filter(Boolean);
}
// watch.sh tick → one JSON line: {task title: [{id, src, url, when, what, next, found}]}, the unseen
// alerts on Active tasks. A missing or bad line keeps the last good set on screen.
function parseWatch(block, prev) {
  const js = String(block || "").split("\n").find(l => l.trim().startsWith("{"));
  if (!js) return prev || {};
  try { const w = JSON.parse(js); return w && typeof w === "object" ? w : (prev || {}); } catch (e) { return prev || {}; }
}
// prep.sh tick → calendar uid <TAB> base64 of the prep card's markdown.
function parsePreps(block) {
  const out = {};
  String(block || "").trim().split("\n").forEach(l => {
    const i = l.indexOf("\t");
    if (i > 0) { const md = unb64(l.slice(i + 1)).trim(); if (md) out[l.slice(0, i)] = md; }
  });
  return out;
}
// flow.sh tick → "STATUS <TAB> text", then flow.json on one line. A bad or missing JSON keeps
// the last good flow on screen.
function parseFlow(block, prev) {
  const lines = String(block || "").trim().split("\n");
  const st = (lines[0] || "").startsWith("STATUS\t") ? lines[0].slice(7) : (prev && prev.flowStatus) || "";
  let flow = prev && prev.flow;
  const js = lines.find(l => l.startsWith("{"));
  if (js) { try { flow = JSON.parse(js); } catch (e) {} }
  return { flow, flowStatus: st };
}
// mine.sh tick → "MINE <TAB> json": which of the owner's steps are done, and the focus line.
function parseMine(block, prev) {
  const l = String(block || "").trim().split("\n").find(x => x.startsWith("MINE\t"));
  if (l) { try { return JSON.parse(l.slice(5)); } catch (e) {} }
  return prev || { items: {} };
}
const FLOW_TAB_KEY = "msbai_flow_tab";
const PREP_SEEN_KEY = "msbai_prep_seen";
const savedPrepSeen = () => { try { return JSON.parse(localStorage.getItem(PREP_SEEN_KEY) || "[]"); } catch (e) { return []; } };

// Overlapping meetings used to draw straight on top of each other. Apple lays them out side
// by side, which is the same greedy column packing: take each run of events that overlap, and
// give each event the first column whose previous event has already finished.
// "Finished" means where the box is drawn to, not the clock: a box is never shorter than
// minMs, so a 10-minute meeting drawn 25 minutes tall must still push the next one aside.
function layout(events, minMs = 0) {
  const endOf = e => Math.max(e.end.getTime(), e.start.getTime() + minMs);
  const sorted = [...events].sort((a, b) => a.start - b.start || b.end - a.end);
  const out = [];
  let cluster = [], clusterEnd = 0;
  const flush = () => {
    if (!cluster.length) return;
    const colEnds = [];
    const placed = cluster.map(e => {
      let c = colEnds.findIndex(t => t <= e.start.getTime());
      if (c === -1) { c = colEnds.length; colEnds.push(0); }
      colEnds[c] = endOf(e);
      return { e, col: c };
    });
    placed.forEach(({ e, col }) => out.push({ ...e, col, cols: colEnds.length }));
    cluster = [];
  };
  sorted.forEach(e => {
    if (cluster.length && e.start.getTime() >= clusterEnd) flush();
    cluster.push(e);
    clusterEnd = cluster.length === 1 ? endOf(e) : Math.max(clusterEnd, endOf(e));
  });
  flush();
  return out;
}

function parseTasks(md) {
  const lines = md.split("\n");
  const out = [];
  let inActive = false;
  for (const line of lines) {
    if (/^## /.test(line)) { inActive = /^## Active/.test(line); continue; }
    if (!inActive) continue;
    const m = line.match(/^- \[( |x|X)\] \*\*(.+?)\*\*(.*)$/);
    if (m) { out.push({ done: m[1] !== " ", title: m[2], meta: m[3].replace(/^\s*-\s*/, "").trim(), notes: [] }); continue; }
    // An indented bullet belongs to the task above it: context, links, the source transcript.
    // These are what completeTask() carries along to Done, so the two agree on the shape.
    const sub = line.match(/^(?:\s{2,}|\t)-\s+(.*\S)\s*$/);
    if (sub && out.length) out[out.length - 1].notes.push(sub[1]);
  }
  return out;
}

function syncedIdFromNote(n) {
  const m = String(n).match(/app\.clickup\.com\/t\/([0-9a-z]+)\)\s*·\s*synced/i);
  return m ? m[1] : null;
}

function syncedIdsFromNotes(notes) {
  return (notes || []).map(syncedIdFromNote).filter(Boolean);
}

function parseClickupClosed(text) {
  return new Set(String(text || "").split("\n").map(s => s.trim()).filter(id => /^[0-9a-z]+$/.test(id)));
}

// Done desk tasks whose synced ClickUp ids are not yet in clickup-closed.
function parseClickupClose(md, closedText) {
  const closed = parseClickupClosed(closedText);
  const titles = [];
  const pending = [];
  let sec = null, title = null, ids = [];
  const flush = () => {
    if (sec === "Done" && title) {
      const wait = ids.filter(id => !closed.has(id));
      if (wait.length) { pending.push(...wait); titles.push(title); }
    }
  };
  for (const line of String(md || "").split("\n")) {
    if (/^## /.test(line)) { flush(); sec = line.replace(/^##\s+/, "").trim(); title = null; ids = []; continue; }
    const m = line.match(/^- \[( |x|X)\] \*\*(.+?)\*\*/);
    if (m) { flush(); title = m[2]; ids = []; continue; }
    const id = syncedIdFromNote(line);
    if (id) ids.push(id);
  }
  flush();
  return { pending: pending.length, titles };
}

const COPY_SNAP_KEY = "msbai_copy_snap";

function classifyNotes(notes) {
  const sources = [], decisions = [], questions = [], rest = [];
  let deadline = "";
  for (const n of notes || []) {
    const s = String(n);
    if (syncedIdFromNote(s)) continue;
    const isLink = /https?:\/\//i.test(s) || /^(Slack|Drive|Docs?|Gmail|Email|Mail|Sheet|Deck|Transcript|Meeting|ClickUp|Web)\s*:/i.test(s);
    if (isLink) sources.push(s);
    else if (/\?/.test(s) || /^(open question|unresolved|need to ask)\b/i.test(s)) questions.push(s);
    else if (/^(decision|decided|agreed)\b/i.test(s)) decisions.push(s);
    else {
      if (!deadline && /\b(due|deadline)\b/i.test(s)) deadline = s;
      rest.push(s);
    }
  }
  return { sources, decisions, questions, rest, deadline };
}

function noteDiff(prev, next) {
  const before = new Set(prev || []);
  const after = new Set(next || []);
  const out = [];
  for (const n of next || []) if (!before.has(n)) out.push("Added: " + n);
  for (const n of prev || []) if (!after.has(n)) out.push("Removed: " + n);
  return out;
}

// dock.sh list → "slot|windowid|title|zorder|visible"
function parseTabs(block) {
  return block.split("\n")
    .map(l => l.trim()).filter(Boolean)
    .map(l => {
      const [n, id, label, z, vis] = l.split("|");
      return { n: parseInt(n, 10), id, label: label || "", z: parseInt(z, 10) || 99, visible: vis === "true" };
    })
    .filter(t => t.n && t.id)
    .sort((a, b) => a.n - b.n);
}

// notes.sh list → alphabetical, with the active note marked "*name"
function parseNotes(block) {
  return String(block || "").split("\n")
    .map(l => l.trim()).filter(Boolean)
    .map(l => ({ name: l.replace(/^\*/, ""), on: l.startsWith("*") }));
}

function parseStats(out) {
  const s = { cpu: 0, memPct: 0, memUsed: 0, memTotal: 0, diskPct: 0, diskUsed: 0, diskFree: 0, diskTotal: 0, procs: [] };
  const [head, procBlock = ""] = String(out || "").split("===PROCS===");
  head.split("\n").forEach(line => {
    const p = line.trim().split(/\s+/);
    if (p[0] === "cpu") s.cpu = parseFloat(p[1]) || 0;
    if (p[0] === "memfree") s.memPct = 100 - (parseFloat(p[1]) || 0);
    if (p[0] === "memtotal") s.memTotal = parseFloat(p[1]) || 0;
    if (p[0] === "disk") {
      s.diskUsed = parseFloat(p[1]) || 0;
      s.diskFree = parseFloat(p[2]) || 0;
      s.diskTotal = parseFloat(p[3]) || 0;
    }
  });
  s.memUsed = s.memTotal * (s.memPct / 100);
  // Match what df and Disk Utility report: the reserved slice is neither used nor available.
  const usable = s.diskUsed + s.diskFree;
  s.diskPct = usable ? (s.diskUsed / usable) * 100 : 0;
  s.procs = procBlock.split("\n")
    .map(l => l.trim()).filter(Boolean)
    .map(l => {
      const m = l.match(/^([\d.]+)\s+(.+)$/);
      return m ? { pct: parseFloat(m[1]), name: m[2].trim().split("/").pop() } : null;
    })
    .filter(Boolean)
    .slice(0, CFG.procsMax);
  return s;
}

export const updateState = (event, prevIn) => {
  // Übersicht carries state across a reload of this file. A reload that landed mid-edit can leave
  // it missing fields, and render then dies on every beat ("stats.procs" of undefined) until
  // Übersicht restarts. Filling the gaps from initialState makes it heal on the next event.
  const prev = { ...initialState, ...(prevIn || {}) };
  if (event.type === "NOTES_EDIT") return { ...prev, notes: event.value, notesDirty: true };
  if (event.type === "NOTE_MODE") return { ...prev, noteMode: event.value };
  if (event.type === "NOTES_SAVED") return { ...prev, notesDirty: false };
  if (event.type === "TABS") return { ...prev, tabs: parseTabs(event.value || "") };
  if (event.type === "MEETINGS") { const m = parseMeetings(event.value || ""); return { ...prev, meetings: m.list, meetNote: m.note, pulling: "" }; }
  if (event.type === "PULLING") return { ...prev, pulling: event.value };
  if (event.type === "COPIED") return { ...prev, copied: event.value, pulling: "" };
  if (event.type === "STATS") return { ...prev, stats: parseStats(event.value) };
  if (event.type === "VIEW") return { ...prev, view: event.value };
  if (event.type === "GEO") return { ...prev, geo: event.value };
  if (event.type === "SPLIT") return { ...prev, split: event.value };
  if (event.type === "CHIPS") return { ...prev, hiddenChips: event.value };
  if (event.type === "FOLD") return { ...prev, fold: event.value };
  if (event.type === "OPEN_TASKS") return { ...prev, openTasks: event.value };
  if (event.type === "PINNED") return { ...prev, pinned: event.value };
  if (event.type === "MARKS") return { ...prev, marks: event.value };
  if (event.type === "SYS_MODE") return { ...prev, sysMode: event.value };
  if (event.type === "SETTINGS") return { ...prev, settings: event.value };
  if (event.type === "MARK_POP") return { ...prev, markPop: event.value };
  if (event.type === "TASK_ORDER") return { ...prev, taskOrder: event.value };
  if (event.type === "TASK_DRAG") return { ...prev, taskDrag: event.value };
  if (event.type === "TASK_TAB") return { ...prev, taskTab: event.value };
  if (event.type === "COPIED_TASK") return { ...prev, copiedTask: event.value };
  if (event.type === "WATCH_DISMISS") { const w = { ...(prev.watch || {}) }; delete w[event.value]; return { ...prev, watch: w }; }
  if (event.type === "CAL") { const c = parseCal(event.value || ""); return { ...prev, cal: c.events, allDay: c.allDay, error: c.error }; }
  if (event.type === "GCAL") return { ...prev, gcal: event.value };
  if (event.type === "COMPOSE") return { ...prev, compose: event.value };
  if (event.type === "ZOOM") return { ...prev, zoomBox: event.value };
  if (event.type === "ZOOMS") return { ...prev, zooms: parseZooms(event.value) };
  if (event.type === "TEAM") return { ...prev, team: parseTeam(event.value), teamNotes: parseTeamNotes(event.value), teamSync: false };
  if (event.type === "TEAM_SYNC") return { ...prev, teamSync: event.value };
  if (event.type === "EMAILS") return { ...prev, emails: parseEmails(event.value), mailSync: false };
  if (event.type === "MAIL_SYNC") return { ...prev, mailSync: event.value };
  if (event.type === "MAIL") return { ...prev, mail: { ...(prev.mail || {}), [event.thread]: event.value } };
  if (event.type === "MAIL_HIDE") return { ...prev, emails: (prev.emails || []).filter(m => m.thread !== event.thread) };
  if (event.type === "CRM") return { ...prev, crm: parseCrm(event.value, prev.crm) };
  if (event.type === "CRM_UI") {
    const ui = { ...(prev.crmUi || savedCrmUi()), ...event.value };
    try { localStorage.setItem(CRM_UI_KEY, JSON.stringify({ co: ui.co, tab: ui.tab, mine: ui.mine, older: ui.older, cal: ui.cal, order: ui.order, fold: ui.fold, orderV: 3, flowV: 2 })); } catch (e) {}
    return { ...prev, crmUi: ui };
  }
  if (event.type === "CRM_DRAFT") {
    const c = prev.crm || { data: null, cards: {}, sync: "" };
    return { ...prev, crm: { ...c, drafts: { ...(c.drafts || {}), [event.id]: event.value } } };
  }
  if (event.type === "CRM_OUTBOX_ADD") {
    const c = prev.crm || { data: null, cards: {} };
    return { ...prev, crm: { ...c, outbox: [...(c.outbox || []), event.value] } };
  }
  if (event.type === "CRM_ASK") return { ...prev, crm: { ...(prev.crm || { data: null, cards: {} }), ask: event.value } };
  if (event.type === "CRM_SEEN") {
    const c = prev.crm || { data: null, cards: {} }, al = { ...(c.alerts || {}) };
    delete al[event.key];
    return { ...prev, crm: { ...c, alerts: al } };
  }
  if (event.type === "CRM_NUDGE_DONE") {
    const c = prev.crm || { data: null, cards: {} };
    return { ...prev, crm: { ...c, nudges: (c.nudges || []).filter(n => n.thread !== event.thread) } };
  }
  if (event.type === "CRM_CARD") {
    const c = prev.crm || { data: null, cards: {}, sync: "" };
    return { ...prev, crm: { ...c, cards: { ...(c.cards || {}), [event.id]: event.value } } };
  }
  if (event.type === "PREP_SEEN") return { ...prev, prepSeen: event.value };
  if (event.type === "PREP_OPEN") return { ...prev, prepOpen: event.value };
  if (event.type === "CMD") return { ...prev, cmdBox: event.value };
  if (event.type === "FLOW_SEL") return { ...prev, flowSel: event.value };
  if (event.type === "FLOW_TAB") { try { localStorage.setItem(FLOW_TAB_KEY, event.value); } catch (e) {} return { ...prev, flowTab: event.value, flowSel: "" }; }
  if (event.type === "FLOW_DONE") return { ...prev, flowDone: event.value };
  if (event.type === "FLOW_CLOSED") return { ...prev, flowClosed: event.value };
  if (event.type === "FLOW_GRP") return { ...prev, flowGrp: event.value };
  if (event.type === "WIKI_GO") {
    try { localStorage.setItem("msbai_wiki_page", event.value); } catch (e) {}
    return { ...prev, wikiPage: event.value, wikiQ: event.keepQ ? prev.wikiQ : "", wikiOrigin: event.origin || "50% 30%", wikiAdd: null };
  }
  if (event.type === "WIKI_Q") return { ...prev, wikiQ: event.value };
  if (event.type === "WIKI_KIND") return { ...prev, wikiKind: event.value };
  if (event.type === "WIKI_AS") { try { localStorage.setItem("msbai_wiki_as", event.value); } catch (e) {} return { ...prev, wikiAs: event.value, wikiPage: "home", wikiQ: "" }; }
  if (event.type === "WIKI_ADD") return { ...prev, wikiAdd: event.value };
  if (event.type === "FLOW_STATUS") return { ...prev, flowStatus: event.value };
  if (event.type === "TASK_ADD")
    return { ...prev, tasks: [{ done: false, title: event.title, meta: event.meta, notes: [] }, ...(prev.tasks || [])] };
  if (event.type === "EV_BUSY") return { ...prev, evBusy: event.value };
  if (event.type === "FLASH") return { ...prev, flash: event.value };
  if (event.type === "SEL_MINE") {
    // my reply changed on Google's side; show it now rather than after Calendar.app syncs it back
    const fix = e => (e && e.uid === event.uid) ? { ...e, mine: event.value } : e;
    return { ...prev, sel: fix(prev.sel), cal: prev.cal.map(fix), allDay: prev.allDay.map(fix), evBusy: "" };
  }
  if (event.type === "SEL") return { ...prev, sel: event.value };
  if (event.type === "NOTE_EDIT") return { ...prev, noteEdit: event.value };
  if (event.type === "NOTE_ORDER") {
    const by = event.value;
    return { ...prev, noteList: by.map(n => (prev.noteList || []).find(x => x.name === n)).filter(Boolean) };
  }
  if (event.type === "NOTE_LOAD") {
    const [head, body = ""] = String(event.value || "").split("===NOTES===");
    return {
      ...prev,
      noteList: parseNotes(head),
      notes: body.replace(/^\n/, "").replace(/\n$/, ""),
      notesDirty: false,
      noteEdit: null,
    };
  }
  if (event.type === "TASK_DONE")
    return { ...prev, tasks: prev.tasks.filter(t => t.title !== event.title),
             openTasks: (prev.openTasks || []).filter(t => t !== event.title),
             pinned: (prev.pinned || []).filter(t => t !== event.title) };
  if (event.error) return { ...prev, error: String(event.error) };
  const out = event.output || "";
  const cu    = (out.split("===CLICKUP===")[1] || "").split("===COLLABNOTES===")[0] || "";
  const cn    = (out.split("===COLLABNOTES===")[1] || "").split("===CAL===")[0] || "";
  const cal   = (out.split("===CAL===")[1]   || "").split("===TASKS===")[0] || "";
  const tasks = (out.split("===TASKS===")[1] || "").split("===NOTELIST===")[0] || "";
  const noteList = (out.split("===NOTELIST===")[1] || "").split("===NOTES===")[0] || "";
  const notes = (out.split("===NOTES===")[1] || "").split("===TABS===")[0]  || "";
  const tabs  = (out.split("===TABS===")[1]  || "").split("===ZOOMS===")[0] || "";
  const zoomsText = (out.split("===ZOOMS===")[1] || "").split("===TEAM===")[0] || "";
  const teamText  = (out.split("===TEAM===")[1] || "").split("===ME===")[0] || "";
  const meText    = (out.split("===ME===")[1] || "").split("===EMAILS===")[0] || "";
  const emailText = (out.split("===EMAILS===")[1] || "").split("===FLOW===")[0] || "";
  const flowText  = (out.split("===FLOW===")[1] || "").split("===MINE===")[0] || "";
  const mineText  = (out.split("===MINE===")[1] || "").split("===PREP===")[0] || "";
  const prepText  = (out.split("===PREP===")[1] || "").split("===GCAL===")[0] || "";
  const gcal  = ((out.split("===GCAL===")[1] || "").split("===MAIN===")[0] || "").trim();
  const mainBlock = (out.split("===MAIN===")[1]  || "");
  const main  = (mainBlock.split("===CUCLOSED===")[0] || "").trim();
  const cuClosedText = ((out.split("===CUCLOSED===")[1] || "").split("===WIKI===")[0] || "");
  const wikiText  = ((out.split("===WIKI===")[1] || "").split("===WIKIINBOX===")[0] || "");
  const wikiInbox = ((out.split("===WIKIINBOX===")[1] || "").split("===WIKILIVE===")[0] || "");
  const wikiLive  = ((out.split("===WIKILIVE===")[1] || "").split("===CRM===")[0] || "");
  const crmText   = ((out.split("===CRM===")[1] || "").split("===WATCH===")[0] || "");
  const watchText = (out.split("===WATCH===")[1] || "");
  const c = parseCal(cal);
  return {
    ...prev,
    cal: c.events, allDay: c.allDay, error: c.error,
    tasks: parseTasks(tasks),
    cuTasks: parseFocus(cu),
    cuNotes: parseCollabNotes(cn),
    cuClose: parseClickupClose(tasks, cuClosedText),
    noteList: parseNotes(noteList),
    tabs: parseTabs(tabs),
    zooms: parseZooms(zoomsText), team: parseTeam(teamText), teamNotes: parseTeamNotes(teamText), me: parseMe(meText, prev.me),
    emails: parseEmails(emailText), preps: parsePreps(prepText), ...parseFlow(flowText, prev),
    mine: parseMine(mineText, prev.mine),
    wiki: parseWiki(wikiText, prev.wiki), wikiInbox: parseWikiInbox(wikiInbox), wikiLive: parseWikiLive(wikiLive, prev.wikiLive),
    gcal: gcal || prev.gcal,
    watch: parseWatch(watchText, prev.watch),
    crm: parseCrm(crmText, prev.crm),
    main,
    notes: prev.notesDirty ? prev.notes : notes.replace(/^\n/, "").replace(/\n$/, ""),
  };
};

// ───────────────────────── actions ─────────────────────────
const b64 = s => btoa(unescape(encodeURIComponent(s)));

// A save is bound to the note it was typed in. It used to write to whichever note was active when
// the 800 ms timer fired, so switching tabs inside that window copied one note over the other.
let saveTimer = null, savePending = null;
// Cmd+B around the selection, and again to take it off. Setting the value drops the caret, so it
// has to be put back on the next tick.
function wrapBold(e, dispatch, name) {
  const el = e.target;
  const a = el.selectionStart, b = el.selectionEnd, v = el.value;
  const on = v.slice(Math.max(0, a - 2), a) === "**" && v.slice(b, b + 2) === "**";
  const next = on
    ? v.slice(0, a - 2) + v.slice(a, b) + v.slice(b + 2)
    : v.slice(0, a) + "**" + v.slice(a, b) + "**" + v.slice(b);
  const [ca, cb] = on ? [a - 2, b - 2] : [a + 2, b + 2];
  el.value = next;                     // the box is uncontrolled, so set it directly
  dispatch({ type: "NOTES_EDIT", value: next });
  saveNotes(next, dispatch, name);
  setTimeout(() => { try { el.selectionStart = ca; el.selectionEnd = cb; } catch (err) {} }, 0);
}

function saveNotes(text, dispatch, name) {
  clearTimeout(saveTimer);
  savePending = { text, name, dispatch };
  saveTimer = setTimeout(flushNotes, 800);
}

function flushNotes() {
  clearTimeout(saveTimer);
  const p = savePending;
  savePending = null;
  if (!p) return Promise.resolve();
  return run(`${NOTES} write '${b64(p.text)}' ${JSON.stringify(p.name)}`)
    .then(() => p.dispatch({ type: "NOTES_SAVED" }));
}

// Dragging a note tab reorders the row live and writes the order out on release. A press that
// never moves stays a plain click, so switching and renaming still work.
let noteDragged = false;
function beginNoteDrag(e, name, tabs, dispatch) {
  if (e.button !== 0) return;
  noteDragged = false;
  const sx = e.clientX;
  const row = e.currentTarget.parentElement;
  let order = tabs.map(t => t.name);
  const move = ev => {
    if (!noteDragged && Math.abs(ev.clientX - sx) < 5) return;
    noteDragged = true;
    const els = Array.from(row.children).filter(c => c.tagName === "SPAN" && !c.classList.contains("add"));
    let target = -1;
    els.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      if (ev.clientX >= r.left && ev.clientX <= r.right) target = i;
    });
    const from = order.indexOf(name);
    if (target >= 0 && target !== from) {
      order = order.filter(n => n !== name);
      order.splice(target, 0, name);
      dispatch({ type: "NOTE_ORDER", value: order });
    }
  };
  const up = () => {
    document.removeEventListener("mousemove", move);
    document.removeEventListener("mouseup", up);
    if (!noteDragged) return;
    run(`${NOTES} order ${order.map(n => JSON.stringify(n)).join(" ")}`);
    setTimeout(() => { noteDragged = false; }, 0);
  };
  document.addEventListener("mousemove", move);
  document.addEventListener("mouseup", up);
}

// Run a notes.sh verb and pull the new list + contents back in one shot, so switching a note
// does not sit and wait for the next refresh.
const noteCmd = (args, dispatch) =>
  flushNotes().then(() => run(`${NOTES} ${args} >/dev/null 2>&1; ${NOTES} list; echo "===NOTES==="; ${NOTES} read`)
    .then(out => dispatch({ type: "NOTE_LOAD", value: out })));

function completeTask(t, dispatch) {
  // Move the task line (and its sub-bullets) from Active to Done, in the same format the plugin uses.
  const title = t.title;
  const ids = syncedIdsFromNotes(t.notes);
  const py = `
import re,sys,base64,datetime
p="${CFG.folder.replace("$HOME", "~")}/TASKS.md"
import os; p=os.path.expanduser(p)
title=base64.b64decode(sys.argv[1]).decode()
lines=open(p).read().split("\\n")
out=[];moved=[];i=0;sec=None
while i<len(lines):
    l=lines[i]
    if l.startswith("## "): sec=l
    if sec and sec.startswith("## Active") and re.match(r"^- \\[ \\] \\*\\*"+re.escape(title)+r"\\*\\*",l):
        # keep the meta (tag, who for, source meeting); only the box and a date change
        moved.append(re.sub(r"^- \\[ \\] ", "- [x] ", l).rstrip()+" · done "+datetime.date.today().isoformat())
        i+=1
        while i<len(lines) and lines[i].startswith("  "): moved.append(lines[i]); i+=1
        continue
    out.append(l); i+=1
if moved:
    j=next((k for k,l in enumerate(out) if l.startswith("## Done")),None)
    if j is None: out+=["","## Done"]; j=len(out)-1
    out[j+1:j+1]=moved
    open(p,"w").write("\\n".join(out))
`;
  run(`python3 - '${b64(title)}' <<'PY'\n${py}\nPY`).then(() => {
    try { localStorage.setItem(PIN_KEY, JSON.stringify(savedPins().filter(x => x !== title))); } catch (e) {}
    dispatch({ type: "TASK_DONE", title });
    if (ids.length) flash(`ClickUp close queued (${ids.length})`, dispatch, 4000);
    else flash("Done on desk · no synced ClickUp task", dispatch, 3500);
  });
}

// ── system stats, on their own timer ──
// Übersicht re-evaluates this module on every save, so clear the previous interval or they stack up.
// Forget the id as well: pollStats() only starts a timer when there is none, so a cleared-but-
// remembered id left System frozen at 0% after every save.
if (typeof window !== "undefined" && window.__msbaiStatsTimer) {
  clearInterval(window.__msbaiStatsTimer);
  window.__msbaiStatsTimer = null;
}
function pollStats(dispatch, isMain) {
  if (typeof window === "undefined") return;
  // A secondary display's copy stops rendering once the probe answers, but its interval would
  // otherwise keep shelling out forever — so stop it from the same call that would start it.
  if (!isMain) {
    if (window.__msbaiStatsTimer) { clearInterval(window.__msbaiStatsTimer); window.__msbaiStatsTimer = null; }
    if (window.__msbaiFrontTimer) { clearInterval(window.__msbaiFrontTimer); window.__msbaiFrontTimer = null; }
    return;
  }
  if (!window.__msbaiFrontTimer) {
    // The frontmost app, a few times a second (lsappinfo is cheap and needs no permission).
    // When it changes to an app that has a tab here, the widget follows, so clicking Claude in
    // the Dock lands on the claude tab instead of leaving the widget on desk.
    window.__msbaiFront = "";
    window.__msbaiFrontTimer = setInterval(() => run(FRONT_CMD).then(out => {
      const m = String(out || "").match(/"(?:LSDisplayName|name)"="([^"]+)"/);
      const name = m ? m[1] : "";
      if (!name || name === window.__msbaiFront) return;
      window.__msbaiFront = name;
      const app = APPS.find(a => a.name === name);
      if (app && curView !== app.key) setView(app.key, dispatch);
    }).catch(() => {}), CFG.frontMs || 700);
  }
  if (window.__msbaiStatsTimer) return;
  const tick = () => run(STATS_CMD).then(out => dispatch({ type: "STATS", value: out })).catch(() => {});
  window.__msbaiStatsTimer = setInterval(tick, CFG.statsMs);
  tick();
}

// ── terminal dock ──
// The dock slot is just empty space in the widget; the real Terminal windows float
// above it. Measure the slot on screen and hand those coordinates to dock.sh.
// Whether getBoundingClientRect folds in CSS `zoom` differs between engines, and guessing wrong
// parks windows at the wrong size and place. Measure the zoom wrapper against its known unscaled
// width and find out instead.
function zoomCorrection() {
  const z = document.getElementById("msbai-zoom");
  if (!z) return 1;
  const w = z.getBoundingClientRect().width;
  if (!w) return 1;
  return Math.abs(w - WIDTH * CFG.zoom) <= Math.abs(w - WIDTH) ? 1 : CFG.zoom;
}

function rectOf(id) {
  const el = document.getElementById(id);
  const shellEl = document.getElementById("msbai-shell");
  if (!el || !shellEl) return null;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  const c = zoomCorrection();
  if (c !== 1) {
    const sh = shellEl.getBoundingClientRect();
    const ax = Math.max(0, window.screen.width - window.innerWidth);
    const ay = Math.max(0, window.screen.height - window.innerHeight);
    return [
      Math.round(sh.left + (r.left - sh.left) * c + ax),
      Math.round(sh.top + (r.top - sh.top) * c + ay + CFG.dockNudgeY),
      Math.round(r.width * c),
      Math.round(r.height * c),
    ];
  }
  // Übersicht's window starts below the menu bar, Terminal's bounds are screen
  // coordinates — so the two differ by whatever the window is inset by.
  const dx = Math.max(0, window.screen.width - window.innerWidth);
  const dy = Math.max(0, window.screen.height - window.innerHeight);
  return [Math.round(r.left + dx), Math.round(r.top + dy + CFG.dockNudgeY), Math.round(r.width), Math.round(r.height)];
}
const dockRect = () => rectOf("msbai-dock");

// Übersicht draws the widget on every display. Only the copy on the main display can place a
// Terminal window correctly, so that is the only one that gets a dock — and, by default, the only
// one drawn at all. Until the probe answers, assume main so the widget never blinks out.
const onMainDisplay = main => !main || main === `${window.screen.width}x${window.screen.height}`;

const tell = (args, dispatch) =>
  run(`${DOCK} ${args}`).then(out => dispatch({ type: "TABS", value: out }));

// One meeting, on demand, straight onto the clipboard. The list the panel shows is only
// titles and dates; this is the only thing that ever pulls a transcript, and fireflies.sh
// skips the network entirely once that meeting is on disk — so a second click is instant.
const pullMeeting = (id, dispatch) => {
  dispatch({ type: "PULLING", value: id });
  run(`${FLY} copy ${JSON.stringify(id)}`)
    .then(out => {
      const ok = /^copied/.test(String(out || "").trim());
      dispatch({ type: "COPIED", value: ok ? id : "" });
      if (ok) setTimeout(() => dispatch({ type: "COPIED", value: "" }), 2200);
    })
    .catch(() => dispatch({ type: "COPIED", value: "" }));
};
const refreshMeetings = dispatch =>
  run(`${FLY} refresh`).then(out => dispatch({ type: "MEETINGS", value: out }));

// Position and zoom live on the element we return, so the whole cluster moves as one.
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
let dragMoved = false;

function clampGeo(g) {
  const vw = window.innerWidth || 1440;
  const vh = window.innerHeight || 900;
  const w = WIDTH * CFG.zoom;
  return {
    ...g,
    x: Math.round(Math.max(4, Math.min(g.x, Math.max(4, vw - w - 4)))),
    y: Math.round(Math.max(0, Math.min(g.y, vh - 80))),
  };
}

function saveGeo(g, dispatch) {
  const c = clampGeo(g);
  try { localStorage.setItem(GEO_KEY, JSON.stringify(c)); } catch (e) {}
  dispatch({ type: "GEO", value: c });
}

function beginDrag(e, geo, dispatch) {
  if (e.button !== 0) return;
  e.preventDefault();
  dragMoved = false;
  const el = document.getElementById("msbai-shell");
  const sx = e.clientX, sy = e.clientY;
  const move = ev => {
    const dx = ev.clientX - sx, dy = ev.clientY - sy;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;
    if (el) { el.style.left = (geo.x + dx) + "px"; el.style.top = (geo.y + dy) + "px"; }
  };
  const up = ev => {
    document.removeEventListener("mousemove", move);
    document.removeEventListener("mouseup", up);
    if (!dragMoved) return;                       // a plain click still switches view
    saveGeo({ ...geo, x: Math.round(geo.x + ev.clientX - sx), y: Math.round(geo.y + ev.clientY - sy) }, dispatch);
    setTimeout(() => { dragMoved = false; }, 0);
  };
  document.addEventListener("mousemove", move);
  document.addEventListener("mouseup", up);
}

// Drag a divider between two panes. Pointer deltas are viewport pixels; the panes are laid out
// inside a zoomed box, so the delta has to be divided by the zoom to stay 1:1 under the cursor.
function beginSplit(e, key, axis, sign, start, min, max, split, k, dispatch) {
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  const s0 = axis === "x" ? e.clientX : e.clientY;
  let last = start;
  const move = ev => {
    const d = ((axis === "x" ? ev.clientX : ev.clientY) - s0) / (k || 1);
    last = Math.round(clamp(start + sign * d, min, max));
    dispatch({ type: "SPLIT", value: { ...split, [key]: last } });
  };
  const up = () => {
    document.removeEventListener("mousemove", move);
    document.removeEventListener("mouseup", up);
    const next = { ...split, [key]: last };
    try { localStorage.setItem(SPLIT_KEY, JSON.stringify(next)); } catch (err) {}
    dispatch({ type: "SPLIT", value: next });
    reparkAfterResize(dispatch);
  };
  document.addEventListener("mousemove", move);
  document.addEventListener("mouseup", up);
}

// The terminal's bottom divider and the notes' bottom divider know where the screen ends. Growing
// the terminal first uses free room below the widget, then takes it from the notes (down to
// NOTES_MIN), and never pushes the notes off the screen. The notes' own divider grows them only
// into free room.
const NOTES_MIN = 60;
// After any resize, the real window follows its slot: the terminal threads re-park in the desk
// view, the parked app (Claude) in its own view, so neither is left at its old size.
let curView = "desk";
let lastThread = "";              // the terminal thread on screen the last time the desk was drawn
function reparkAfterResize(dispatch) {
  setTimeout(() => {
    if (curView === "desk") { const r = dockRect(); if (r) tell(`snap ${r.join(" ")}`, dispatch); }
    else { const app = appByKey(curView); if (app) setPane(app.name); }
  }, 220);
}
function beginBottomSplit(e, sp, which, dispatch, start) {
  if (e.button !== 0) return;
  e.preventDefault(); e.stopPropagation();
  const shellEl = document.getElementById("msbai-zoom");
  const k = zoomCorrection() || 1;
  const bottom0 = shellEl ? shellEl.getBoundingClientRect().bottom : 0;
  const free = Math.max(0, ((window.innerHeight || 900) - 6 - bottom0) / k);
  const y0 = e.clientY, dock0 = start || sp[which] || sp.dock, notes0 = sp.notes || CFG.notesHeight;
  let next = { ...sp };
  const move = ev => {
    const d = (ev.clientY - y0) / k;
    if (which === "notes") {
      next = { ...sp, notes: Math.round(clamp(notes0 + d, NOTES_MIN, notes0 + free)) };
    } else {
      const grow = Math.max(0, d - free);                  // beyond the free room: borrow from notes
      const notes = Math.round(clamp(notes0 - grow, NOTES_MIN, notes0));
      const dock = Math.round(clamp(dock0 + Math.min(d, free) + (d > free ? notes0 - notes : 0), 120, 1600));
      next = { ...sp, [which]: dock, notes };
    }
    dispatch({ type: "SPLIT", value: next });
  };
  const up = () => {
    document.removeEventListener("mousemove", move);
    document.removeEventListener("mouseup", up);
    try { localStorage.setItem(SPLIT_KEY, JSON.stringify(next)); } catch (err) {}
    dispatch({ type: "SPLIT", value: next });
    reparkAfterResize(dispatch);
  };
  document.addEventListener("mousemove", move);
  document.addEventListener("mouseup", up);
}

// The row/terminal divider moves two values at once: the calendar's hour height shrinks and the
// pane below grows by the same number of pixels, so the cluster keeps its overall height and the
// space is simply reallocated between them.
function beginRowSplit(e, sp, paneKey, dispatch) {
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  const s0 = e.clientY;
  const h0 = sp.hourH, p0 = sp[paneKey];
  let next = sp;
  const move = ev => {
    const d = (ev.clientY - s0) / (CFG.zoom || 1);
    const hourH = clamp(h0 + d / CFG.hours, 16, 96);
    const pane = clamp(p0 + (h0 - hourH) * CFG.hours, 120, 1400);
    next = { ...sp, hourH: Math.round(hourH * 100) / 100, [paneKey]: Math.round(pane) };
    dispatch({ type: "SPLIT", value: next });
  };
  const up = () => {
    document.removeEventListener("mousemove", move);
    document.removeEventListener("mouseup", up);
    try { localStorage.setItem(SPLIT_KEY, JSON.stringify(next)); } catch (err) {}
    dispatch({ type: "SPLIT", value: next });
    reparkAfterResize(dispatch);
  };
  document.addEventListener("mousemove", move);
  document.addEventListener("mouseup", up);
}

// One shell call per switch. dock.sh hides every other pane app and places the chosen one in a
// single Apple event pass — four separate hides used to cost ~450ms, this is ~40ms.
const setPane = name => {
  const r = name ? rectOf("msbai-app-dock") : null;
  run(`${DOCK} panes ${JSON.stringify(name || "")}${r ? " " + r.join(" ") : ""}`);
};
const showApp = name => setPane(name);

// All-day events are noisy: some matter, most do not. Dismissed ones are remembered by title.
function hideChip(title, hidden, dispatch) {
  const next = Array.from(new Set([...(hidden || []), title]));
  try { localStorage.setItem(CHIPS_KEY, JSON.stringify(next)); } catch (e) {}
  dispatch({ type: "CHIPS", value: next });
}
function restoreChips(dispatch) {
  try { localStorage.removeItem(CHIPS_KEY); } catch (e) {}
  dispatch({ type: "CHIPS", value: [] });
}

function toggleFold(key, fold, dispatch) {
  const next = { ...(fold || {}), [key]: !(fold || {})[key] };
  try { localStorage.setItem(FOLD_KEY, JSON.stringify(next)); } catch (e) {}
  dispatch({ type: "FOLD", value: next });
}
function toggleTask(title, open, dispatch) {
  const cur = open || [];
  const next = cur.includes(title) ? cur.filter(t => t !== title) : [...cur, title];
  try { localStorage.setItem(OPEN_KEY, JSON.stringify(next)); } catch (e) {}
  dispatch({ type: "OPEN_TASKS", value: next });
}

function togglePin(title, pinned, dispatch) {
  const cur = pinned || [];
  const next = cur.includes(title) ? cur.filter(t => t !== title) : [title, ...cur];
  try { localStorage.setItem(PIN_KEY, JSON.stringify(next)); } catch (e) {}
  dispatch({ type: "PINNED", value: next });
}

function setMark(title, key, marks, dispatch) {
  const next = { ...(marks || {}) };
  if (!key || next[title] === key) delete next[title]; else next[title] = key;
  try { localStorage.setItem(MARK_KEY, JSON.stringify(next)); } catch (e) {}
  dispatch({ type: "MARKS", value: next });
  dispatch({ type: "MARK_POP", value: "" });
}
// Hold a task and drag it up or down. Nothing happens until the pointer has moved a few pixels, so
// a plain click still opens the notes and a double-click still opens the swatches. The rows
// rearrange live under the pointer; on release, pinned rows keep their place at the top (in the
// new order) and everything else is saved as your order. Not from inside open notes or news, so
// text there can still be selected and links clicked.
let taskDragged = false;
let threadsHidden = false;          // terminal off: parked thread windows get hidden once
let markTimer = null;                       // the short hover wait before the swatch tray slides out
const MARK_HOVER_MS = 550;
function beginTaskDrag(e, title, titles, pins, dispatch) {
  if (e.button !== 0 || e.detail > 1) return;
  if (e.target.closest && e.target.closest(".notes, .news, .cp, .mkpop, a, .lk")) return;
  const y0 = e.clientY;
  let moved = false, list = titles;
  const move = ev => {
    if (!moved && Math.abs(ev.clientY - y0) < 5) return;
    if (!moved) {
      moved = true; taskDragged = true;
      try { window.getSelection().removeAllRanges(); } catch (err) {}
      document.body.style.userSelect = "none"; document.body.style.webkitUserSelect = "none"; document.body.style.cursor = "grabbing";
    }
    ev.preventDefault();
    const rows = [...document.querySelectorAll("[data-task]")].filter(r => r.dataset.task !== title);
    const at = rows.filter(r => { const b = r.getBoundingClientRect(); return b.top + b.height / 2 < ev.clientY; }).length;
    const others = rows.map(r => r.dataset.task);
    list = [...others.slice(0, at), title, ...others.slice(at)];
    dispatch({ type: "TASK_DRAG", value: { title, list } });
  };
  const up = () => {
    document.removeEventListener("mousemove", move);
    document.removeEventListener("mouseup", up);
    document.body.style.userSelect = ""; document.body.style.webkitUserSelect = ""; document.body.style.cursor = "";
    try { window.getSelection().removeAllRanges(); } catch (err) {}
    if (!moved) return;
    setTimeout(() => { taskDragged = false; }, 0);   // after the click this release fires
    dispatch({ type: "TASK_DRAG", value: null });
    const newPins = list.filter(t => pins.includes(t));
    const order = list.filter(t => !pins.includes(t));
    try { localStorage.setItem(PIN_KEY, JSON.stringify(newPins)); localStorage.setItem(ORDER_KEY, JSON.stringify(order)); } catch (err) {}
    dispatch({ type: "PINNED", value: newPins });
    dispatch({ type: "TASK_ORDER", value: order });
  };
  document.addEventListener("mousemove", move);
  document.addEventListener("mouseup", up);
}

// Brief + sources + what changed, then the remaining notes. Pasted into a cloud session the
// ask is already a job, not a pile of links. Base64 through the shell so no character can break it.
let copyTimer = null;
function taskBrief(t) {
  const notes = t.notes || [];
  const ids = syncedIdsFromNotes(notes);
  const key = ids[0] || t.title;
  let snap = {};
  try { snap = JSON.parse(localStorage.getItem(COPY_SNAP_KEY) || "{}"); } catch (e) {}
  const prev = snap[key];
  const cls = classifyNotes(notes);
  const changed = prev
    ? (noteDiff(prev.notes, notes).length ? noteDiff(prev.notes, notes) : [`No note changes since last copy (${prev.at || "unknown"}).`])
    : ["First copy of this task. Full context is below."];
  const md = [
    `# ${t.title}`,
    t.meta ? t.meta : "",
    "",
    "## Brief",
    `- Outcome: ${t.title}`,
    `- Deadline: ${cls.deadline || "none written"}`,
    `- Decisions: ${cls.decisions.length ? cls.decisions.join(" | ") : "none written"}`,
    `- Open questions: ${cls.questions.length ? cls.questions.join(" | ") : "none written"}`,
    "",
    ...((t.alerts || []).length ? ["## New since last check",
      ...t.alerts.map(a => `- ${a.src || "New"} (${a.when || a.found || "recent"}): ${a.what}${a.url ? ` [link](${a.url})` : ""}${a.next ? ` Suggested next step: ${a.next}` : ""}`), ""] : []),
    "## What changed",
    ...changed.map(x => `- ${x}`),
    "",
    "## Sources",
    ...(cls.sources.length ? cls.sources.map(s => `- ${s}`) : ["- none linked"]),
    "",
    "## Context",
    ...(cls.rest.length ? cls.rest.map(s => `- ${s}`) : ["- none"]),
    "",
    "Do the outcome. Do not invent extra scope."
  ].filter((line, i, arr) => !(line === "" && (i === 0 || arr[i - 1] === ""))).join("\n");
  snap[key] = { notes, at: new Date().toISOString().slice(0, 16).replace("T", " ") };
  try { localStorage.setItem(COPY_SNAP_KEY, JSON.stringify(snap)); } catch (e) {}
  return md;
}
function copyTask(t, dispatch) {
  const md = taskBrief(t);
  run(`printf %s ${JSON.stringify(b64(md))} | base64 -d | pbcopy`).then(() => {
    dispatch({ type: "COPIED_TASK", value: t.title });
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => dispatch({ type: "COPIED_TASK", value: "" }), 1800);
  });
}
// "work it": the same brief, with a lead line, pasted into a new thread in the Claude app. The
// claude view parks the app in the pane (starting it if needed); dock.sh claude-new waits for its
// window, opens a new thread, pastes and sends.
function workTask(t, dispatch) { toClaude(`${CFG.workItLead}\n\n${taskBrief(t)}`, dispatch); }
// "got it" on a task's news: watch.sh marks those alerts seen, and the glow stops at once.
function dismissWatch(title, dispatch) {
  dispatch({ type: "WATCH_DISMISS", value: title });
  run(`/bin/zsh "${CFG.folder}/desk-widget/watch.sh" dismiss '${b64(title)}'`).catch(() => {});
}
// Any text into a new thread in the Claude app, pasted and left unsent (CFG.workItSend).
function toClaude(md, dispatch) {
  run(`printf %s ${JSON.stringify(b64(md))} | base64 -d | pbcopy`).then(() => {
    setView("claude", dispatch);
    setTimeout(() => run(`${DOCK} claude-new ${CFG.workItSend ? "send" : "paste"} ${JSON.stringify(CFG.workItKey || "n")}`)
      .then(out => { const s = firstLine(out); if (s !== "ok") flash(`work it: ${s || "the Claude app did not answer"}`, dispatch, 6000); }), 900);
  });
}

// ── Wiki tab ──
// wiki.json (beside the scripts) holds the demo wiki: companies, pages, system maps, glossary.
// It is read every beat but only parsed when the text changes. Suggestions and new entries go to
// .wiki/inbox.jsonl, which is what a filing agent would read in the full build.
let wikiRaw = "", wikiParsed = null;
function parseWiki(text, prev) {
  const t = (text || "").trim();
  if (!t) return prev || null;
  if (t === wikiRaw && wikiParsed) return wikiParsed;
  try { wikiParsed = JSON.parse(t); wikiRaw = t; return wikiParsed; } catch (e) { return prev || null; }
}
let liveRaw = "", liveParsed = null;
function parseWikiLive(text, prev) {
  const line = String(text || "").split("\n").find(l => l.startsWith("LIVE\t"));
  if (!line) return prev || null;
  if (line === liveRaw && liveParsed) return liveParsed;
  try { liveParsed = JSON.parse(line.slice(5)); liveRaw = line; return liveParsed; } catch (e) { return prev || null; }
}
function parseWikiInbox(text) {
  return (text || "").split("\n").map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean).reverse();
}
function wikiFile(entry, dispatch) {
  const line = JSON.stringify({ ...entry, when: new Date().toISOString() });
  run(`mkdir -p "${CFG.folder}/desk-widget/.wiki" && printf %s ${JSON.stringify(b64(line + "\n"))} | base64 -d >> "${CFG.folder}/desk-widget/.wiki/inbox.jsonl"`)
    .then(() => dispatch({ type: "WIKI_ADD", value: { ...(entry || {}), sent: true } }));
}
function wikiPageMd(pg, wiki) {
  const name = id => ((wiki.pages || {})[id] || {}).title || id;
  return [`# ${pg.title}`, "", pg.what, "", pg.fits ? `How it fits: ${pg.fits}` : "",
    pg.current ? `What is current: ${pg.current}` : "",
    (pg.connects || []).length ? `Connects to: ${pg.connects.map(name).join(", ")}` : "",
    (pg.questions || []).length ? `Open questions:\n${pg.questions.map(q => `- ${q}`).join("\n")}` : "",
    (pg.sources || []).length ? `Sources:\n${pg.sources.map(x => `- ${x.t}: ${x.u}`).join("\n")}` : "",
    "", "Using the sources above plus Drive, ClickUp and Fireflies, help me bring this wiki page up to date: what changed, what is wrong, what is missing. Keep it short and plain."]
    .filter(x => x !== "").join("\n");
}

// ── Emails tab ──
// emails.sh keeps the list (rebuilt every 15 min through the refresh beat); these act on one row.
const EMAILS = `/bin/zsh "${CFG.folder}/desk-widget/emails.sh"`;
function syncEmails(dispatch) {
  dispatch({ type: "MAIL_SYNC", value: true });
  run(`${EMAILS} sync`).then(out => dispatch({ type: "EMAILS", value: out }))
    .catch(() => dispatch({ type: "MAIL_SYNC", value: false }));
}
function draftReply(m, note, dispatch, body) {
  dispatch({ type: "MAIL", thread: m.thread, value: { state: "busy" } });
  const spec = { thread: m.thread, message: m.message, note: (note || "").trim(), body: (body || "").trim() };
  run(`${EMAILS} draft ${JSON.stringify(b64(JSON.stringify(spec)))}`).then(out => {
    const s = firstLine(out);
    dispatch({ type: "MAIL", thread: m.thread, value: s.startsWith("ok ")
      ? { state: "ready", url: s.slice(3).trim() }
      : { state: "error", msg: s.replace(/^failed:\s*/, "") || "the draft did not come back" } });
  }).catch(() => dispatch({ type: "MAIL", thread: m.thread, value: { state: "error", msg: "emails.sh did not run" } }));
}
function hideEmail(m, dispatch) {
  dispatch({ type: "MAIL_HIDE", thread: m.thread });
  run(`${EMAILS} done ${JSON.stringify(m.thread)}`);
}
function emailToClaude(m, dispatch) {
  toClaude([
    "Help me answer this email. Read the whole thread in Gmail first, then draft my reply in my voice and save it as a Gmail draft. Do not send it.",
    "",
    `- From: ${m.from} <${m.email}> (${m.company})`,
    `- Subject: ${m.subject}`,
    `- What they need: ${m.need}`,
    m.url ? `- Thread: ${m.url}` : "",
  ].filter(Boolean).join("\n"), dispatch);
}

// ── CRM tab ──
// The CRM tab took the Emails tab's place on Oct 6. crm.sh keeps .crm/crm.json from the CRM v3
// space in ClickUp (read only; Hermes in OpenClaw writes it), plus crm-seed.tsv for what ClickUp
// does not hold yet, and people named in business meetings. Top to bottom: company filter, ask,
// key dates, Do now (and the five minute mode), the team strip, Ayesha's four levels (contracts,
// leads, proposals, partners) and the Inbox (the old Emails tab, plus nudges waiting in drafts).
// Nothing here sends or changes anything: drafts land in Gmail drafts, and "to claude" pastes a
// brief into a new thread without sending it. Rows glow when crm_watch.py finds news.
const CRMSH = `/bin/zsh "${CFG.folder}/desk-widget/crm.sh"`;
const CRM_COS = ["All", "MSBAI", "Tam Fortis", "Nexcavate"];
// What changed on a Do now line since you last pressed got it (crm_watch.py alert kinds).
const CRM_WHY = { reply: "reply waiting", late: "past due", tpoc: "TPOC window", later: "resurfacing", ment: "named in a meeting", mail: "new email", nudge: "nudge ready" };
// the same company colours the wiki uses (COMPANIES in wiki_build.py), so a dot means one thing everywhere
const CRM_CO_DOT = { "MSBAI": "#7FB2FF", "Tam Fortis": "#5ED3A1", "Nexcavate": "#FFB547" };
const CRM_TPOC = "#FF7AB6";   // TPOC windows: pink, apart from Nexcavate amber and the violet of news
const CRM_TABS = [
  { key: "contracts", label: "Contracts", level: 1, tip: "Level 1: active contracts and projects, won work we have to keep" },
  { key: "leads", label: "Leads", level: 2, tip: "Level 2: warm and hot leads, people named in meetings, interested later, check ins" },
  { key: "proposals", label: "Proposals", level: 3, tip: "Level 3: outreach for active proposals, TPOCs first while pre release" },
  { key: "campaigns", label: "Campaigns", tip: "Outreach for each open proposal (made on their own from the customer people the CRM links to it) plus your own lists, like the FAA roster" },
  { key: "partners", label: "Partners", level: 4, tip: "Level 4: partners a pursuit needs (national labs, hardware, teaming)" },
  { key: "people", label: "Rolodex", tip: "Everyone in the CRM, A to Z. Open a name for their card" },
  { key: "inbox", label: "Inbox", tip: "Email waiting on you with the CRM beside each thread, and nudges waiting in drafts" },
];
const CRM_KIND = { reply: "reply waiting", followup: "follow up", checkin: "check in", result: "confirm result",
                   interest: "interested later", proposal: "proposal", lead: "lead", contract: "contract",
                   partner: "partner", email: "email", mention: "from a meeting", person: "person" };
const CRM_STATE = { prerelease: "pre release", opening: "opening soon", open: "open", closing: "closing soon",
                    submitted: "submitted", paused: "paused", closed: "closed", other: "other", unset: "state not set" };
const CRM_TAB_OF = { 1: "contracts", 2: "leads", 3: "proposals", 4: "partners" };
const CRM_UI_KEY = "msbai_crm_ui";
// a function declaration, so initialState (higher up the file) can call it before this line runs
// The top of the CRM tab is three cards (Key dates, Do now, Who has what). Each folds, and the grip
// on its left slides it up or down; the order and folds are remembered.
const CRM_SECS = { donow: "Do now", dates: "Key dates", team: "Who has what" };
const CRM_SEC_ORDER = ["dates", "donow", "team"];
let crmSecDragged = false;
function beginCrmSecDrag(e, key, order, set) {
  if (e.button !== 0) return;
  e.preventDefault();
  crmSecDragged = false;
  const sy = e.clientY;
  const box = e.currentTarget.closest(".secs");
  let cur = order.slice();
  const move = ev => {
    if (!crmSecDragged && Math.abs(ev.clientY - sy) < 4) return;
    if (!crmSecDragged) { crmSecDragged = true; set({ dragK: key }); }
    const cards = Array.from(box.children).filter(c => c.dataset && c.dataset.k);
    let target = -1;
    cards.forEach((el, i) => { const r = el.getBoundingClientRect(); if (ev.clientY >= r.top && ev.clientY <= r.bottom) target = i; });
    if (target < 0) target = ev.clientY < box.getBoundingClientRect().top ? 0 : cards.length - 1;
    const from = cur.indexOf(key);
    if (target !== from) { cur = cur.filter(k => k !== key); cur.splice(target, 0, key); set({ order: cur }); }
  };
  const up = () => {
    document.removeEventListener("mousemove", move);
    document.removeEventListener("mouseup", up);
    set({ dragK: "" });
  };
  document.addEventListener("mousemove", move);
  document.addEventListener("mouseup", up);
}
function savedCrmUi() {
  const d = { co: "All", tab: "inbox", mine: false, older: false, cal: true };
  let u = d;
  try { u = { ...d, ...JSON.parse(localStorage.getItem("msbai_crm_ui") || "{}") }; } catch (e) {}
  // Oct 6: Key dates moved to the top; an order saved before that starts over with it first
  if (u.orderV !== 3) u = { ...u, order: ["dates", ...((u.order || []).filter(k => k !== "dates"))], orderV: 3 };
  // Oct 7: the short lived Today tab is gone; anyone left on it lands on the Inbox below the overview
  if (u.tab === "today" || u.flowV !== 2) u = { ...u, tab: u.tab === "today" || !u.tab ? "inbox" : u.tab, flowV: 2 };
  return u;
}
const crmNorm = s => String(s || "").toLowerCase().replace(/[^\w@.\s]/g, " ").replace(/\s+/g, " ").trim();
const crmDays = d => {
  if (!d) return null;
  const t = new Date(d + "T12:00:00"), n = new Date(); n.setHours(12, 0, 0, 0);
  return isNaN(t) ? null : Math.round((t - n) / 864e5);
};
const crmWhen = d => {
  const n = crmDays(d);
  if (n == null) return "";
  return n === 0 ? "today" : n === 1 ? "tomorrow" : n === -1 ? "yesterday" : n < 0 ? `${-n}d late` : n < 8 ? `in ${n}d`
    : new Date(d + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
};
const crmFirst = n => String(n || "").split(/[ ,]/)[0];

let crmRaw = "";
const crmAsked = new Set();
let crmPlusRaw = "";
function parseCrm(block, prev) {
  const p = prev || { data: null, cards: {}, sync: "", alerts: {}, nudges: [], drafts: {}, ask: null };
  const next = { ...p, cards: { ...(p.cards || {}) } };
  const text = String(block || "");
  if (!text.trim()) return next;
  next.alerts = {}; next.nudges = []; next.outbox = [];
  text.split("\n").forEach(l => {
    if (l.startsWith("CRM\t")) {
      const t = l.slice(4);
      if (t !== crmRaw) { try { next.data = JSON.parse(t); crmRaw = t; } catch (e) {} }
    } else if (l.startsWith("CARD\t")) {
      const i = l.indexOf("\t", 5);
      if (i < 0) return;
      const id = l.slice(5, i), cur = next.cards[id];
      if (cur && cur.busy) return;                       // a card being rebuilt keeps its spinner
      try { next.cards[id] = JSON.parse(l.slice(i + 1)); } catch (e) {}
    } else if (l.startsWith("ALERTS\t")) {
      try { next.alerts = JSON.parse(l.slice(7)) || {}; } catch (e) {}
    } else if (l.startsWith("NUDGE\t")) {
      const f = l.split("\t");
      if (f.length >= 6) next.nudges.push({ thread: f[1], to: f[2], subject: f[3], url: f[4], sent: f[5] || "" });
    } else if (l.startsWith("ASK\t")) {
      if (!(p.ask && p.ask.busy)) { try { next.ask = JSON.parse(l.slice(4)); } catch (e) {} }
    } else if (l.startsWith("OUTBOX\t")) {
      try { next.outbox.push(JSON.parse(l.slice(7))); } catch (e) {}
    } else if (l.startsWith("PLUS\t")) {
      const t = l.slice(5);
      if (t !== crmPlusRaw) { try { next.plus = JSON.parse(t); crmPlusRaw = t; } catch (e) {} }
    } else if (l.startsWith("CRMSYNC\t")) next.sync = l.slice(8);
  });
  const fileOps = new Set(next.outbox.map(o => o.title + "|" + o.op + "|" + (o.text || "")));
  next.outbox = next.outbox.concat((p.outbox || []).filter(o => String(o.oid).startsWith("local") && !fileOps.has(o.title + "|" + o.op + "|" + (o.text || "")) && Date.now() - Number(String(o.oid).slice(5)) < 600000));
  return next;
}

function crmSync(dispatch) {
  dispatch({ type: "CRM_UI", value: { syncing: true } });
  run(`${CRMSH} sync; ${CRMSH} tick`).then(out => {
    dispatch({ type: "CRM", value: out }); dispatch({ type: "CRM_UI", value: { syncing: false } });
  }).catch(() => dispatch({ type: "CRM_UI", value: { syncing: false } }));
}
const crmCardName = it =>
  ["lead", "interest", "proposal", "contract", "partner"].includes(it.kind) ? it.title
    : it.kind === "mention" ? it.title.replace(/ \(.*\)$/, "") : (((it.who || [])[0] || {}).name || it.title);
const crmContext = it => [it.title, it.sub, it.org, it.need, it.next, it.note, it.interest, it.why, it.said,
  (it.pursuits || []).length ? `pursuits ${it.pursuits.join(", ")}` : "",
  it.state ? `state ${CRM_STATE[it.state] || it.state}` : "", it.heat ? `heat ${it.heat}` : "",
  it.meeting ? `named in ${it.meeting} on ${it.date}${it.by ? ` by ${it.by}` : ""}` : "",
  (it.who || []).map(w => w.name + (w.role ? ` (${w.role})` : "")).join("; ")].filter(Boolean).join(". ");
function crmCard(it, dispatch, fresh) {
  const spec = { id: it.id, name: crmCardName(it), company: it.company, kind: CRM_KIND[it.kind] || it.kind, context: crmContext(it) };
  dispatch({ type: "CRM_CARD", id: it.id, value: { busy: true } });
  const cmd = `${fresh ? `rm -f "${CFG.folder}/desk-widget/.crm/cards/${String(it.id).replace(/:/g, "_")}.json"; ` : ""}${CRMSH} card ${JSON.stringify(b64(JSON.stringify(spec)))}`;
  run(cmd).then(out => {
    const l = String(out || "").split("\n").find(x => x.startsWith("CARD\t"));
    let v = { error: "the card did not come back" };
    if (l) { try { v = JSON.parse(l.slice(l.indexOf("\t", 5) + 1)); } catch (e) {} }
    dispatch({ type: "CRM_CARD", id: it.id, value: v });
  }).catch(() => dispatch({ type: "CRM_CARD", id: it.id, value: { error: "crm.sh did not run" } }));
}
// A Gmail draft to the person on a row: the card's suggested message as it stands, or one written
// from a note. Never sent; it waits in the owner's Gmail drafts.
function crmDraft(it, dispatch, body, note) {
  const spec = { name: crmCardName(it), company: it.company, body: body || "", note: note || "", context: crmContext(it) };
  dispatch({ type: "CRM_DRAFT", id: it.id, value: { busy: true } });
  run(`${CRMSH} draft ${JSON.stringify(b64(JSON.stringify(spec)))}`).then(out => {
    const s = firstLine(out);
    dispatch({ type: "CRM_DRAFT", id: it.id, value: s.startsWith("ok ") ? { url: s.slice(3).trim() } : { error: s.replace(/^failed:\s*/, "") || "the draft did not come back" } });
  }).catch(() => dispatch({ type: "CRM_DRAFT", id: it.id, value: { error: "crm.sh did not run" } }));
}
function crmTpoc(it, dispatch) {
  const people = (it.who || []).filter(w => w.role === "tpoc").map(w => ({ name: w.name, url: w.url }));
  const spec = { topic: it.topic, title: it.sub || it.title, company: it.company, opp: it.opp, people };
  dispatch({ type: "CRM_DRAFT", id: "tpoc:" + it.id, value: { busy: true } });
  run(`${CRMSH} tpoc ${JSON.stringify(b64(JSON.stringify(spec)))}`).then(out => {
    const rows = String(out || "").split("\n").filter(l => /^(DRAFT|SKIP|FAILED)\t/.test(l)).map(l => l.split("\t"));
    dispatch({ type: "CRM_DRAFT", id: "tpoc:" + it.id, value: { rows } });
  }).catch(() => dispatch({ type: "CRM_DRAFT", id: "tpoc:" + it.id, value: { error: "crm.sh did not run" } }));
}
function crmAsk(q, co, dispatch) {
  if (!String(q || "").trim()) return;
  dispatch({ type: "CRM_ASK", value: { busy: true, q } });
  run(`${CRMSH} ask ${JSON.stringify(b64(JSON.stringify({ q, co })))}`).then(out => {
    const l = String(out || "").split("\n").find(x => x.startsWith("ASK\t"));
    let v = { q, a: "No answer came back." };
    if (l) { try { v = JSON.parse(l.slice(4)); } catch (e) {} }
    dispatch({ type: "CRM_ASK", value: v });
  }).catch(() => dispatch({ type: "CRM_ASK", value: { q, a: "crm.sh did not run." } }));
}
const crmSeen = (key, dispatch) => { dispatch({ type: "CRM_SEEN", key }); run(`${CRMSH} seen ${JSON.stringify(key)}`); };
const crmNudgeDone = (thread, dispatch) => { dispatch({ type: "CRM_NUDGE_DONE", thread }); run(`${CRMSH} nudge-done ${JSON.stringify(thread)}`); };

function crmBrief(it, card) {
  const c = card && !card.busy && !card.error ? card : null;
  const list = (h, xs) => (xs && xs.length ? [`${h}:`, ...xs.map(x => `- ${x}`)] : []);
  return [
    "Help me with this CRM item. Open every linked source first. Draft any message as a Gmail draft from the right company mailbox (MSBAI, Tam Fortis or Nexcavate) and cc Ayesha so the CRM logs it. Do not send anything.",
    "Rules: a TPOC on an open topic gets no direct contact; an active partner is never cold pitched; nothing invented, unknowns in [square brackets]; GURU in all caps; no em dashes, en dashes or connector hyphens.",
    "",
    `# ${it.title}`,
    `${it.company} · ${CRM_KIND[it.kind] || it.kind}${it.state ? ` · ${CRM_STATE[it.state] || it.state}` : ""}${it.due ? ` · due ${it.due}` : ""}${it.final ? ` · final ${it.final}` : ""}${it.owner ? ` · owner ${it.owner}` : ""}`,
    it.sub || "", it.next ? `Next step: ${it.next}` : "", it.need ? `Need: ${it.need}` : "", it.note ? `Note: ${it.note}` : "",
    it.said ? `Said in ${it.meeting} (${it.date})${it.by ? ` by ${it.by}` : ""}: ${it.said}` : "",
    ...list("People", (it.who || []).map(w => `${w.name}${w.role ? ` (${w.role})` : ""}${w.url ? ` ${w.url}` : ""}`)),
    ...(c ? [
      "", "## What the CRM card says",
      c.who ? `Who: ${c.who}` : "", c.how_met ? `How we met: ${c.how_met}` : "",
      c.last_touch ? `Last touch: ${c.last_touch}${c.gap ? ` (${c.gap})` : ""}${c.last_speaker ? `, last word from ${c.last_speaker}` : ""}` : "",
      c.going_on || "", ...list("We promised", c.promises_ours), ...list("They promised", c.promises_theirs),
      ...list("Cautions", c.cautions), c.next_step ? `Next step: ${c.next_step}` : "",
      c.suggested ? `Suggested message:\n${c.suggested}` : "",
    ] : []),
    "", "## Sources",
    ...Object.entries(crmSources(it, card).groups).map(([k, xs]) => `${k}:\n${xs.map(x => `- ${x.t}: ${x.u}`).join("\n")}`),
  ].filter(x => x !== "").join("\n");
}
function crmScore(it) {
  const du = crmDays(it.due);
  let s = 0;
  if (it.kind === "reply") s = 40 + Math.min(60, 8 * Math.max(0, -(du || 0)));
  else if (it.kind === "result") s = 30 + (du != null && du < 0 ? Math.min(30, 5 * -du) : 0);
  else if (it.kind === "followup" || it.kind === "checkin") {
    if (it.direction === "they owe us") s = du != null && du < 0 ? 18 : 6;
    else s = du == null ? 8 : du < 0 ? 35 + Math.min(40, 5 * -du) : du === 0 ? 30 : du <= 3 ? 20 : 8;
    if (it.kind === "checkin") s = Math.min(s, 15);
  } else if (it.kind === "interest") { const r = crmDays(it.resurface); s = r != null && r <= 0 ? 20 : 2; }
  else if (it.kind === "proposal") {
    const dd = crmDays(it.final || it.due), od = crmDays(it.open);
    if (it.stale) s = 0;
    else if (it.state === "prerelease" && it.tpocs) s = 50 + (od != null && od < 10 ? 5 * (10 - Math.max(0, od)) : 0);
    else if (it.state === "submitted") s = 3;
    else if (dd != null && dd >= 0 && dd <= 7) s = 25;
    else if (dd != null && dd >= 0 && dd <= 21) s = 14;
    else s = 6;
  } else if (it.kind === "lead") s = { hot: 12, cooling: 10, warm: 4 }[it.heat] || 1;
  else if (it.kind === "mention") { const a = -(crmDays(it.date) || 0); s = (it.known ? 12 : 22) - Math.min(10, a); }
  else if (it.kind === "contract") s = 8;
  else if (it.kind === "partner") s = it.need ? 8 : 5;
  else if (it.kind === "email") {
    const age = it.when ? Math.floor((Date.now() - it.when.getTime()) / 864e5) : 0;
    s = 40 + Math.min(40, 8 * Math.max(0, age - 1));
  }
  return Math.round(s + (s > 2 ? ({ 1: 15, 2: 5, 3: 10, 4: 10 }[it.level] || 0) : 0));
}
// The number on the crm tab: replies waiting on the widget's owner, in their own inbox plus the
// "reply waiting" follow ups Hermes assigned to them. Hover the tab for the breakdown.
function crmBadge(crm, emails, me) {
  const mail = (emails || []).filter(m => !m.practice).length;
  const replies = ((crm && crm.data && crm.data.items) || []).filter(i => i.kind === "reply" && crmIsMine(i, me)).length;
  const n = mail + replies;
  return { n, tip: n ? `${n} waiting on you: ${mail} email${mail === 1 ? "" : "s"} in your inbox, ${replies} reply follow up${replies === 1 ? "" : "s"} assigned to you in the CRM` : "Nothing waiting on you" };
}
const crmMatchCo = (it, co) => co === "All" || it.company === co || (it.companies || []).includes(co);
const crmIsMine = (it, me) => [me && me.full, me && me.name].filter(Boolean)
  .some(n => String(it.owner || "").toLowerCase().includes(String(n).toLowerCase()));
const crmMeta = it => {
  const who = (it.who || []).map(w => w.name).filter(Boolean);
  if (it.kind === "proposal") {
    const tp = (it.who || []).filter(w => w.role === "tpoc").length;
    const dd = it.state === "submitted" ? "" : it.final ? `final ${crmWhen(it.final)}` : it.due ? `due ${crmWhen(it.due)}` : "";
    return [CRM_STATE[it.state] || it.state, dd, it.state === "submitted" && it.milestone ? `result ${crmWhen(it.milestone)}` : "",
            `${tp} TPOC${tp === 1 ? "" : "s"}`, `${(it.who || []).length} people`, it.status].filter(Boolean).join(" · ");
  }
  if (it.kind === "person") return [(it.companies || []).join(", "), (it.roles || []).join(", "), (it.pursuits || []).join(", "), it.heat, it.email].filter(Boolean).join(" · ");
  if (it.kind === "lead") return [it.heat, it.tier && `${it.tier} tier`, (it.pursuits || []).join(", ")].filter(Boolean).join(" · ");
  if (it.kind === "mention") return [it.known ? "in the CRM" : "new", `${it.meeting} ${crmWhen(it.date)}`, it.by && `said by ${it.by}`, it.said].filter(Boolean).join(" · ");
  if (it.kind === "contract" || it.kind === "partner")
    return [it.org, who.join(", "), (it.pursuits || []).join(", "), it.need].filter(Boolean).join(" · ");
  if (it.kind === "interest") return [it.interest, it.resurface && `resurface ${crmWhen(it.resurface)}`].filter(Boolean).join(" · ");
  return [who.join(", "), it.direction].filter(Boolean).join(" · ");
};

// One email row: the Emails tab's row, unchanged, with the CRM's read on the sender beside the name.
const MailRow = ({ m, mail, tag, dispatch }) => {
  const st = mail[m.thread] || {};
  const set = v => dispatch({ type: "MAIL", thread: m.thread, value: { ...st, ...v } });
  return (
    <div className={`m${m.practice ? " practice" : ""}`}>
      <div className="top">
        <span className="who" title={m.email}>{m.from}</span>
        {m.company && <span className="co">{m.company}</span>}
        {tag && <span className="crmtag" title="what the CRM knows about the sender">{tag}</span>}
        {m.practice && <span className="pr" title="an old thread you already answered, shown as if it just arrived">practice</span>}
        <span className="when">{m.when ? dayShort(m.when) : ""}</span>
      </div>
      <div className="sub">{m.subject}</div>
      {m.need && <div className="need">{m.need}</div>}
      {m.suggestion && st.state !== "ready" && (
        <div className="sg">
          <div className="sgh">Suggested reply{m.why ? ` · ${m.why}` : ""}</div>
          {st.editing
            ? <textarea value={st.body != null ? st.body : m.suggestion} rows={7}
                        onChange={e => set({ body: e.target.value })} />
            : <div className={`sgb${st.full ? " full" : ""}`} onClick={() => set({ full: !st.full })}>{m.suggestion}</div>}
        </div>
      )}
      {!m.suggestion && !m.suggestTried && <div className="need" style={{ opacity: .6 }}>Writing a suggested reply…</div>}
      {m.practice && m.sent && (
        <div className="sg sent">
          <div className="sgh tog" onClick={() => set({ showSent: !st.showSent })}>
            What you actually sent {st.showSent ? "▾" : "▸"}</div>
          {st.showSent && <div className="sgb full">{m.sent}</div>}
        </div>
      )}
      {st.writing && st.state !== "busy" && (
        <div className="note">
          <input type="text" placeholder="What should it say? (optional) Enter to draft"
                 ref={el => { if (el && !st.focused) { el.focus(); st.focused = true; } }}
                 onInput={e => { st.note = e.target.value; }}
                 onKeyDown={e => { if (e.key === "Enter") draftReply(m, e.target.value, dispatch); if (e.key === "Escape") set({ writing: false }); }} />
        </div>
      )}
      <div className="acts">
        {m.url && <span onClick={() => openUrl(m.url)}>open</span>}
        {st.state === "busy" ? <span className="ok">drafting…</span>
          : st.state === "ready" ? <span className="ok" title="opens the thread in Gmail; the reply draft sits at the bottom, ready to edit and send"
                     onClick={() => openUrl(m.url || st.url)}>draft ready, open it</span>
          : m.suggestion && !st.writing
            ? <span className="ok" title="put this reply in Gmail drafts, as shown"
                    onClick={() => draftReply(m, "", dispatch, st.body != null ? st.body : m.suggestion)}>use it</span>
            : <span onClick={() => st.writing ? draftReply(m, st.note, dispatch) : set({ writing: true, focused: false })}>
                {st.writing ? "draft it" : "draft reply"}</span>}
        {m.suggestion && st.state !== "busy" && st.state !== "ready" && !st.writing &&
          <span onClick={() => set({ editing: !st.editing })}>{st.editing ? "done editing" : "edit"}</span>}
        {m.suggestion && st.state !== "busy" && st.state !== "ready" && !st.writing &&
          <span title="tell it what to change" onClick={() => set({ writing: true, focused: false })}>change it</span>}
        <span title="a new Claude thread with this email, not sent" onClick={() => emailToClaude(m, dispatch)}>to claude</span>
        <span title="hide until a new message arrives" onClick={() => hideEmail(m, dispatch)}>done</span>
        {st.state === "error" && <span className="bad">{st.msg}</span>}
      </div>
    </div>
  );
};

// The draft controls a row (or the five minute list) shares: draft the suggested message as it
// stands, or say what it should say first. Both land in Gmail drafts.
const CrmDraftActs = ({ it, card, draft, ui, dispatch, pill }) => {
  const c = card && !card.busy && !card.error ? card : null;
  const d = draft || {};
  const noteOpen = ui.note === it.id;
  const cls = (k, x) => pill ? `bt b-${k}${x ? " " + x : ""}` : (x === "go" ? "ok" : "");
  const ic = t => pill ? <i>{t}</i> : null;
  if (d.busy) return <span className={pill ? "bt st" : "ok"}>{ic("…")}{pill ? "Drafting in Gmail" : "drafting…"}</span>;
  if (d.url) return <span className={cls("dready", "go")} title="opens the draft in Gmail, ready to edit and send" onClick={() => openUrl(d.url)}>
    {ic("↗")}{pill ? "Draft ready, open it" : "draft ready, open it"}</span>;
  return (
    <span className="dact">
      {c && c.suggested && <span className={cls("draft", "go")} title="put the suggested message in Gmail drafts, as shown" onClick={() => crmDraft(it, dispatch, c.suggested)}>
        {ic("✉")}{pill ? "Draft it in Gmail" : "draft it"}</span>}
      <span className={cls("change", noteOpen ? "on" : "")} title="say what it should say, then Enter" onClick={() => dispatch({ type: "CRM_UI", value: { note: noteOpen ? "" : it.id } })}>
        {ic("✎")}{pill ? (c && c.suggested ? "Write a different one" : "Draft an email") : (c && c.suggested ? "change it" : "draft")}</span>
      {d.error && <span className="bad">{d.error}</span>}
      {noteOpen && (
        <input type="text" className="dnote" placeholder="What should it say? Enter to draft"
               ref={el => { if (el && el.dataset.f !== "1") { el.focus(); el.dataset.f = "1"; } }}
               onKeyDown={e => { if (e.key === "Enter") { crmDraft(it, dispatch, "", e.target.value); dispatch({ type: "CRM_UI", value: { note: "" } }); }
                                 if (e.key === "Escape") dispatch({ type: "CRM_UI", value: { note: "" } }); }} />
      )}
    </span>
  );
};

// ── Two way: what you do on a card that ClickUp should know ──
// Each write goes into .crm/outbox.jsonl and crm.sh push sends it (see crm.sh). Only writes Hermes
// reads back: close a Follow-up, create a Follow-up, create an Interested Later, comment on the
// person's Company Relationship. Notes also land on the person's Rolodex page (rolodex/<slug>.md).
const crmSlug = n => crmNorm(n).replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "unknown";
const crmPersonOf = it => it.kind === "proposal" || it.kind === "contract" ? null
  : it.kind === "lead" || it.kind === "person" ? it.title
  : it.kind === "mention" ? it.title.replace(/\s*\(.*\)\s*$/, "") : (((it.who || [])[0] || {}).name || "");
const crmRelOf = it => it.kind === "lead" ? it.id : it.kind === "person" ? (it.rel || "") : "";
function crmQueue(op, dispatch) {
  const tmp = { ...op, oid: "local" + Date.now(), status: "pending" };
  dispatch({ type: "CRM_OUTBOX_ADD", value: tmp });
  run(`${CRMSH} queue ${JSON.stringify(b64(JSON.stringify(op)))}`);
}
function crmNoteSave(it, text, dispatch) {
  const name = crmPersonOf(it) || it.title;
  const spec = { name, company: it.company, text, rel: crmRelOf(it), con: it.con || "" };
  dispatch({ type: "CRM_OUTBOX_ADD", value: { op: "note", name, text, oid: "local" + Date.now(), status: spec.rel || spec.con ? "pending" : "ok" } });
  run(`${CRMSH} note ${JSON.stringify(b64(JSON.stringify(spec)))}`);
}
const crmPlusDays = n => { const d = new Date(Date.now() + n * 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const CRM_DUES = [["today", 0], ["in 3 days", 3], ["next week", 7], ["in 2 weeks", 14]];
const CRM_LATERS = [["in 30 days", 30], ["in 90 days", 90], ["in 6 months", 182]];

// The "Update the CRM" group at the bottom of a card: mark done / follow up / remind me later /
// add note / open Rolodex page, a line that says what the hovered button does, the open form, and
// what is waiting to sync. Every write goes to ClickUp through the outbox; none of them deletes.
const CrmWrite = ({ it, ui, outbox, dispatch }) => {
  const w = ui.w && ui.w.id === it.id ? ui.w : null;
  const set = v => dispatch({ type: "CRM_UI", value: { w: v ? { id: it.id, ...v } : null } });
  const person = crmPersonOf(it);
  const first = person ? crmFirst(person) : "";
  const isFu = ["reply", "followup", "checkin", "result"].includes(it.kind);
  const mine = (outbox || []).filter(o => o.item === it.id || (person && o.name === person));
  const closing = mine.find(o => o.op === "close");
  const confirm = w && w.mode === "done";
  const toggle = m => set(w && w.mode === m ? null : m === "fu" ? { mode: "fu", due: 3 } : m === "later" ? { mode: "later", days: 90 } : { mode: m });
  const go = {
    fu: t => crmQueue({ op: "followup", item: it.id, title: t, name: person, company: it.company, due: crmPlusDays(w.due || 0), contact: it.con || "", note: t }, dispatch),
    later: t => crmQueue({ op: "later", item: it.id, name: person, company: it.company, interest: t, why: t, resurface: crmPlusDays(w.days || 90), contact: it.con || "" }, dispatch),
    note: t => crmNoteSave(it, t, dispatch),
  };
  const submit = () => { const t = String((w && w.text) || "").trim(); if (t && go[w.mode]) { go[w.mode](t); set(null); } };
  const acts = [
    isFu && !closing && { k: "done", ic: "✓", l: confirm ? "Yes, close it in ClickUp" : "Mark done", x: confirm ? "go" : "",
      h: "Closes this follow up in ClickUp once you confirm. OpenClaw then drops it. Nothing is deleted.",
      on: () => confirm ? (crmQueue({ op: "close", task: it.id, item: it.id, title: it.title }, dispatch), set(null)) : set({ mode: "done" }) },
    confirm && { k: "cancel", ic: "×", l: "Cancel", h: "Leave it open.", on: () => set(null) },
    person && !confirm && { k: "fu", ic: "+", l: "Follow up", h: `Adds a follow up we owe ${first} to ClickUp, assigned to you, with a due date you pick.`, on: () => toggle("fu") },
    person && !confirm && { k: "later", ic: "◷", l: "Remind me later", h: `Parks ${first} in Interested Later and brings them back in 30 days, 90 days or 6 months.`, on: () => toggle("later") },
    !confirm && { k: "note", ic: "✎", l: "Add note", h: person ? `Saves a dated note on ${first}'s Rolodex page and adds it as a comment on their ClickUp record.` : "Saves a dated note and adds it as a comment on this ClickUp record.", on: () => toggle("note") },
    person && !confirm && { k: "page", ic: "↗", l: "Rolodex page", h: `Opens ${first}'s page on your Mac: everything the CRM knows about them, plus your notes.`, on: () => run(`open "${CFG.folder}/desk-widget/rolodex/${crmSlug(person)}.md"`) },
  ].filter(Boolean);
  const openAct = w && acts.find(a => a.k === w.mode);
  const field = ph => (
    <div className="fr">
      <input type="text" className="dnote" placeholder={ph}
             ref={el => { if (el && el.dataset.f !== "1") { el.focus(); el.dataset.f = "1"; } }}
             onInput={e => set({ ...w, text: e.target.value })}
             onKeyDown={e => { if (e.key === "Enter") submit(); if (e.key === "Escape") set(null); }} />
      <span className="bt sm go" onClick={submit}>{w.mode === "note" ? "Save" : "Add"}</span>
      <span className="bt sm" onClick={() => set(null)}>Cancel</span>
    </div>
  );
  return (
    <div className="apg">
      <div className="ah"><span className="an">Update the CRM</span><span className="as">goes to ClickUp · never deletes</span></div>
      <div className="bts">
        {acts.map(a => <span key={a.k} className={`bt b-${a.k}${a.x ? " " + a.x : ""}${w && w.mode === a.k && a.k !== "done" ? " on" : ""}`} onClick={a.on}><i>{a.ic}</i>{a.l}</span>)}
      </div>
      <div className="hns">
        <div className="hn h0">{openAct ? openAct.h : "Changes here are written to ClickUp on the next sync."}</div>
        {acts.map(a => <div key={a.k} className={`hn h-${a.k}`}>{a.h}</div>)}
      </div>
      {w && w.mode === "fu" && (
        <div className="wf">
          <div className="fl">New follow up for {first}, due</div>
          <div className="chips">{CRM_DUES.map(([l, n]) => <span key={l} className={w.due === n ? "on" : ""} onClick={() => set({ ...w, due: n })}>{l}</span>)}</div>
          {field(`What do we owe ${first}?`)}
        </div>
      )}
      {w && w.mode === "later" && (
        <div className="wf">
          <div className="fl">Bring {first} back</div>
          <div className="chips">{CRM_LATERS.map(([l, n]) => <span key={l} className={w.days === n ? "on" : ""} onClick={() => set({ ...w, days: n })}>{l}</span>)}</div>
          {field("Interested in what, and why later?")}
        </div>
      )}
      {w && w.mode === "note" && <div className="wf"><div className="fl">Note{person ? ` on ${first}` : ""}</div>{field("A note for the record")}</div>}
      {mine.length > 0 && (
        <div className="ob">
          {mine.slice(-4).map(o => (
            <div key={o.oid} className={`o ${o.status}`}>
              {o.status === "pending" ? "syncing to ClickUp: " : o.status === "ok" ? "in ClickUp: " : "did not sync: "}
              {o.op === "close" ? "closed" : o.op === "followup" ? `follow up "${o.title}" due ${o.due}` : o.op === "later" ? `resurface ${o.resurface}` : o.op === "note" ? `note "${o.text}"` : `comment "${o.text}"`}
              {o.status === "ok" && /^https?:/.test(o.detail || "") && <span className="lk" onClick={() => openUrl(o.detail)}> open</span>}
              {o.status === "failed" && o.detail ? ` (${o.detail})` : ""}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Where a link points, for the Sources list on a card.
const CRM_SRC = [
  [/app\.clickup\.com/, "ClickUp"], [/mail\.google\.com/, "Gmail"], [/slack\.com/, "Slack"],
  [/fireflies\.ai/, "Fireflies"], [/(docs|drive)\.google\.com/, "Drive"],
];
const crmSrcType = u => (CRM_SRC.find(([re]) => re.test(String(u || ""))) || [null, "Web"])[1];
// Every source behind a row, deduplicated and grouped by where it lives.
function crmSources(it, card) {
  const c = card && !card.busy && !card.error ? card : null;
  const out = [], seen = new Set();
  const add = (t, u) => { if (!u || seen.has(u)) return; seen.add(u); out.push({ t, u, k: crmSrcType(u) }); };
  if (it.url) add(it.kind === "mention" ? `Transcript: ${it.meeting || "meeting"}` : `ClickUp record: ${it.title}`, it.url);
  if (it.opp) add("CRM Opportunity (drafted outreach)", it.opp);
  if (it.evidence) add("The email behind this follow up", it.evidence);
  (it.who || []).forEach(w => w.url && add(`Contact: ${w.name}${w.role ? ` (${w.role})` : ""}`, w.url));
  ((c && c.links) || []).forEach(l => add(String(l.t || "").replace(/^(ClickUp|Gmail|Slack|Fireflies|Drive):\s*/i, ""), l.u));
  const groups = {};
  out.forEach(s => { (groups[s.k] = groups[s.k] || []).push(s); });
  return { list: out, groups };
}
// What else on the desk touches this row: Active desk tasks and workstream meetings that name the
// same person, topic number or organization.
function crmConnected(it, tasks, flow) {
  const stop = new Set(["msbai", "tam fortis", "nexcavate", "proposal", "contract", "partner"]);
  const needles = [it.topic, ...(it.pursuits || []),
    ...(it.who || []).map(w => w.name).filter(n => /\s/.test(n || "")),
    ["lead", "partner", "contract", "person", "mention"].includes(it.kind) ? String(it.title).replace(/\s*\(.*\)\s*$/, "").split(",")[0] : ""]
    .map(x => String(x || "").trim()).filter(x => x.length >= 4 && !stop.has(x.toLowerCase()));
  if (!needles.length) return { tasks: [], nodes: [] };
  const res = needles.map(n => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"));
  const hit = s => res.some(r => r.test(String(s || "")));
  return {
    tasks: (tasks || []).filter(t => !t.done && (hit(t.title) || (t.notes || []).some(hit))).slice(0, 5),
    nodes: ((flow && flow.nodes) || []).filter(n => hit(n.title) || hit(n.summary)).slice(-4).reverse(),
  };
}

// One CRM row. Opening it builds (or shows) the context card: who they are, how we met, the gap
// since we last spoke, what each side promised, and the cautions that decide how to reach out.
// The card reads top down: what this is, the card's read, what is connected on the desk, then the
// sources (folded), then the actions.
// While a card is being built: the label sweeps in the company's color, a thin bar runs left to right, and each source
// lights in turn so it reads as working through ClickUp, Gmail, Slack and Fireflies. CSS only.
const CRM_LOAD_SRCS = ["ClickUp", "Gmail", "Slack", "Fireflies"];
const crmLoadCls = co => "lc" + (Object.keys(CRM_CO_DOT).indexOf(co) + 1);   // lc0 = no company: silver
const CrmLoading = ({ label, small, co }) => (
  <div className={"load " + crmLoadCls(co) + (small ? " sm" : "")}>
    <div className="lt"><span className="lw">{label}</span><span className="dots"><i>.</i><i>.</i><i>.</i></span></div>
    <div className="bar"><i /></div>
    {!small && <div className="srcs">{CRM_LOAD_SRCS.map((x, i) =>
      <span key={x} style={{ animationDelay: `${i * 1.5}s` }}><b />{x}</span>)}</div>}
  </div>
);
const CrmRow = ({ it, open, card, alert, drafts, ui, copied, ctx, dispatch, page }) => {
  const toggle = () => {
    if (page) return;
    dispatch({ type: "CRM_UI", value: { open: it.id, page: it.id } });
    if (!card && it.kind !== "email") crmCard(it, dispatch);
  };
  const c = card && !card.busy && !card.error ? card : null;
  const dueTxt = it.kind === "proposal" && it.state === "submitted" ? "" : it.kind === "person" ? ""
    : crmWhen(it.kind === "interest" ? it.resurface : it.kind === "proposal" ? (it.final || it.due) : it.kind === "mention" ? it.date : it.due);
  const late = /late|yesterday/.test(dueTxt) && it.kind !== "mention";
  const people = it.who || [];
  const tpocs = people.filter(w => w.role === "tpoc");
  const tpocLocked = it.kind === "proposal" && ["open", "closing", "submitted", "closed"].includes(it.state);
  const tpocAsk = it.kind === "proposal" && tpocs.length > 0 && !tpocLocked;
  const td = drafts["tpoc:" + it.id] || {};
  const caution = [];
  if (it.kind === "proposal" && it.state === "unset" && tpocs.length)
    caution.push("Release state is not set in ClickUp. Check whether the topic is open before contacting a TPOC.");
  if (tpocLocked && tpocs.length) caution.push("Topic is open: TPOCs get no direct contact, formal Q&A only.");
  if (it.kind === "partner") caution.push("Active partner: never cold pitch.");
  if ((it.overlap || []).length > 1) caution.push(`Two owners on this person: ${it.overlap.join(" and ")}. Agree who reaches out.`);
  const allCautions = caution.concat((c && c.cautions) || []);
  const src = open ? crmSources(it, card) : null;
  const con = open ? crmConnected(it, ctx.tasks, ctx.flow) : null;
  const srcOpen = ui.src === it.id;
  const copySrc = () => {
    const md = Object.entries(src.groups).map(([k, xs]) => `${k}:\n${xs.map(s => `- ${s.t}: ${s.u}`).join("\n")}`).join("\n");
    run(`printf %s ${JSON.stringify(b64(md))} | base64 -d | pbcopy`);
    dispatch({ type: "COPIED", value: "src:" + it.id }); setTimeout(() => dispatch({ type: "COPIED", value: "" }), 2200);
  };
  return (
    <div className={`r${open ? " on" : ""}${alert ? " notify" : ""}${page ? " inpage" : ""}`}>
      {!page && <div className="top" onClick={toggle}>
        <span className="dot" style={{ background: CRM_CO_DOT[it.company] || GLASS.label }} title={it.company} />
        <span className="t"><span className="nt">{it.title}</span></span>
        <span className={`k ${it.kind}${it.heat ? " " + it.heat : ""}${it.kind === "mention" && !it.known ? " new" : ""}`}>
          {it.kind === "lead" ? it.heat : it.kind === "mention" && !it.known ? "new, meeting" : it.kind === "person" ? (it.tag || "person") : CRM_KIND[it.kind]}</span>
        {it.owner && <span className={`own${(it.overlap || []).length > 1 ? " two" : ""}`} title={`owner: ${it.owner}`}>{it.owner.split(",").map(o => crmFirst(o.trim())).join(" + ")}</span>}
        <span className={`when${late ? " late" : ""}`}>{dueTxt}</span>
      </div>}
      {!page && <div className="meta">{crmMeta(it)}</div>}
      {!page && it.kind === "proposal" && ctx.plus && ctx.plus.pursuits && ctx.plus.pursuits[it.id] && <CrmGate p={ctx.plus.pursuits[it.id]} />}
      {alert && (
        <div className="news">
          <div><span className="src">New</span>{alert.what}</div>
          {alert.next && <div className="nx">{alert.next}</div>}
          <div className="acts"><span onClick={() => crmSeen(alert.key, dispatch)}>got it</span></div>
        </div>
      )}
      {open && (
        <div className="card">
          {(it.sub || it.said || it.next || it.need || it.why || it.note) && (
            <div className="blk">
              {it.sub && <div className="ln">{it.sub}</div>}
              {it.said && <div className="ln"><b>{it.by || "Said"}</b> {it.said}</div>}
              {it.next && <div className="ln"><b>Next step</b> {it.next}</div>}
              {it.need && <div className="ln"><b>Need</b> {it.need}</div>}
              {it.why && <div className="ln"><b>Why later</b> {it.why}{it.trigger ? ` · trigger: ${it.trigger}` : ""}</div>}
              {it.note && <div className="ln dim">{it.note}</div>}
            </div>
          )}
          {it.kind === "proposal" && ctx.plus && ctx.plus.pursuits && ctx.plus.pursuits[it.id] && <CrmCustMap p={ctx.plus.pursuits[it.id]} />}
          {people.length > 0 && it.kind !== "lead" && it.kind !== "person" && it.kind !== "proposal" && (
            <div className="blk">
              <div className="sh">People</div>
              <div className="ppl">
                {people.map((w, i) => (
                  <span key={i} className={`p ${w.role === "tpoc" ? "tpoc" : ""}${w.role === "tpoc" && tpocLocked ? " locked" : ""}`}
                        title={w.role || ""} onClick={() => w.url && openUrl(w.url)}>
                    {w.name}{w.role ? <i> {w.role}</i> : null}</span>
                ))}
              </div>
              {tpocAsk && (
                <div className="tpa">
                  {td.busy ? <span className="ok">drafting {tpocs.length} TPOC ask{tpocs.length === 1 ? "" : "s"}…</span>
                    : td.rows ? td.rows.map((r, i) => (
                        <div key={i} className={r[0] === "DRAFT" ? "ok" : "bad"}>
                          {r[1]}: {r[0] === "DRAFT" ? <span className="lk" onClick={() => openUrl(r[2])}>draft ready</span> : r[2]}</div>))
                    : it.state === "unset" && ui.confirm !== it.id
                      ? <span className="go" onClick={() => dispatch({ type: "CRM_UI", value: { confirm: it.id } })}>draft TPOC asks ({tpocs.length})</span>
                      : <span className="go" onClick={() => { dispatch({ type: "CRM_UI", value: { confirm: "" } }); crmTpoc(it, dispatch); }}>
                          {it.state === "unset" ? `It is still pre release? Yes, draft ${tpocs.length}` : `draft TPOC asks (${tpocs.length})`}</span>}
                  {td.error && <span className="bad">{td.error}</span>}
                </div>
              )}
            </div>
          )}
          {allCautions.length > 0 && <div className="blk">{allCautions.map((x, i) => <div key={i} className="warn">{x}</div>)}</div>}
          {card && card.busy && <div className="blk"><CrmLoading label="Gathering context" co={it.company} /></div>}
          {card && card.error && <div className="blk warn">{card.error}</div>}
          {c && (
            <div className="blk">
              <div className="sh">About</div>
              {c.who && <div className="ln">{c.who}</div>}
              {c.how_met && <div className="ln"><b>How we met</b> {c.how_met}</div>}
              {(c.last_touch || c.gap) && <div className="ln"><b>Last touch</b> {[c.last_touch, c.gap, c.last_speaker && `last word: ${c.last_speaker}`].filter(Boolean).join(" · ")}</div>}
              {c.going_on && <div className="ln">{c.going_on}</div>}
              {c.why_stopped && <div className="ln"><b>Why it stopped</b> {c.why_stopped}</div>}
            </div>
          )}
          {c && ((c.promises_ours || []).length > 0 || (c.promises_theirs || []).length > 0) && (
            <div className="blk">
              <div className="sh">Promises</div>
              {(c.promises_ours || []).map((x, i) => <div key={"o" + i} className="ln li"><b>We</b> {x}</div>)}
              {(c.promises_theirs || []).map((x, i) => <div key={"t" + i} className="ln li"><b>They</b> {x}</div>)}
            </div>
          )}
          {c && (c.next_step || c.suggested) && (
            <div className="blk">
              <div className="sh">Next</div>
              {c.next_step && <div className="ln">{c.next_step}</div>}
              {c.suggested && <div className="sg"><div className="sgh">Suggested message</div><div className="sgb full">{c.suggested}</div></div>}
            </div>
          )}
          {con && (con.tasks.length > 0 || con.nodes.length > 0) && (
            <div className="blk">
              <div className="sh">Connected on the desk</div>
              {con.tasks.map((t, i) => (
                <div key={"k" + i} className="ln cn" onClick={() => { setView("desk", dispatch); if (!(ctx.openTasks || []).includes(t.title)) toggleTask(t.title, ctx.openTasks, dispatch); }}>
                  <i>task</i>{t.title}</div>
              ))}
              {con.nodes.map(n => (
                <div key={n.id} className="ln cn" onClick={() => { dispatch({ type: "FLOW_SEL", value: n.id }); setView("priorities", dispatch); }}>
                  <i>workstream</i>{shortDay(n.date)} · {n.title}</div>
              ))}
            </div>
          )}
          {src && src.list.length > 0 && (
            <div className="blk">
              <div className="sh tog" onClick={() => dispatch({ type: "CRM_UI", value: { src: srcOpen ? "" : it.id } })}>
                Sources {srcOpen ? "▾" : "▸"} <span className="cnt">{Object.entries(src.groups).map(([k, xs]) => `${xs.length} ${k}`).join(" · ")}</span></div>
              {srcOpen && Object.entries(src.groups).map(([k, xs]) => (
                <div key={k} className="sgp">
                  <div className="sk">{k}</div>
                  {xs.map((s, i) => <div key={i} className="si lk" title={s.u} onClick={() => openUrl(s.u)}>{s.t || shortUrl(s.u)}</div>)}
                </div>
              ))}
              {srcOpen && <div className="acts"><span onClick={copySrc}>{copied === "src:" + it.id ? "copied" : "copy sources"}</span></div>}
            </div>
          )}
          <div className="ap">
            {/* "Update the CRM" (mark done, follow up, remind me later, add note) is gone: OpenClaw
                and the mail watchers keep ClickUp current on their own. CrmWrite stays defined
                below in case it is ever wanted back. */}
            <div className="apg">
              <div className="ah"><span className="an">Reach out</span><span className="as">drafts wait in Gmail · nothing is sent</span></div>
              <div className="bts">
                {!(card && card.busy) && it.kind !== "proposal" && !crmRestrict(it, ctx.plus) && <CrmDraftActs it={it} card={card} draft={drafts[it.id]} ui={ui} dispatch={dispatch} pill />}
                {crmRestrict(it, ctx.plus) && <span className="bt st" title={crmRestrict(it, ctx.plus)}><i>⦸</i>No direct contact: {crmRestrict(it, ctx.plus).replace(/\s*\(.*$/, "")}</span>}
                <span className="bt b-claude" onClick={() => toClaude(crmBrief(it, card), dispatch)}><i>✦</i>Ask Claude</span>
                <span className="bt b-copy" onClick={() => { run(`printf %s ${JSON.stringify(b64(crmBrief(it, card)))} | base64 -d | pbcopy`); dispatch({ type: "COPIED", value: "crm:" + it.id }); setTimeout(() => dispatch({ type: "COPIED", value: "" }), 2200); }}>
                  <i>⧉</i>{copied === "crm:" + it.id ? "Copied" : "Copy card"}</span>
                {!(card && card.busy) && <span className="bt b-refresh" onClick={() => crmCard(it, dispatch, true)}><i>↻</i>{card ? "Refresh card" : "Brief me"}</span>}
              </div>
              <div className="hns">
                <div className="hn h0">Write to {crmPersonOf(it) ? crmFirst(crmPersonOf(it)) : "them"}, or take this card into a Claude chat.</div>
                <div className="hn h-draft">Puts the suggested message above into your Gmail drafts, exactly as written. You send it.</div>
                <div className="hn h-change">Tell it what the email should say, press Enter, and the draft lands in Gmail.</div>
                <div className="hn h-dready">Opens the draft in Gmail, ready to edit and send.</div>
                <div className="hn h-claude">Opens a new Claude chat with this card and every source, so you can work on it there. Nothing is sent.</div>
                <div className="hn h-copy">Copies the whole card and its sources to paste anywhere.</div>
                <div className="hn h-refresh">Reads ClickUp, Gmail, Slack and Fireflies again and rebuilds the card.</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const CrmCal = ({ cal, ui, dispatch }) => {
  const weeks = ui.calMore ? 13 : 6;
  const start = new Date(); start.setHours(12, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));            // Monday of this week
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const today = iso(new Date());
  const byDay = {};
  cal.forEach(c => { (byDay[c.date] = byDay[c.date] || []).push(c); });
  const cells = [];
  for (let i = 0; i < weeks * 7; i++) { const d = new Date(start); d.setDate(start.getDate() + i); cells.push(d); }
  const sel = ui.day || "";
  const overdue = cal.filter(c => c.date < today && c.type === "followup");
  const agenda = sel ? (byDay[sel] || [])
    : cal.filter(c => c.date >= today && c.date <= iso(new Date(Date.now() + 7 * 864e5))).slice(0, 6);
  return (
    <div className="cal">
      <div className="grid">
        {["M", "T", "W", "T", "F", "S", "S"].map((x, i) => <div key={"h" + i} className="dh">{x}</div>)}
        {cells.map(d => {
          const k = iso(d), ev = byDay[k] || [];
          const tp = ev.some(c => c.type === "tpoc" || c.type === "opens");
          const dl = ev.some(c => c.type === "deadline" || c.type === "due");
          return (
            <div key={k} className={`c${k === today ? " today" : ""}${k === sel ? " sel" : ""}${k < today ? " past" : ""}${tp ? " tp" : ""}${dl ? " dl" : ""}`}
                 title={ev.map(c => `${c.label} (${c.company})`).join("\n")}
                 onClick={() => dispatch({ type: "CRM_UI", value: { day: k === sel ? "" : k } })}>
              <span className="n">{d.getDate() === 1 ? d.toLocaleDateString(undefined, { month: "short" }) + " 1" : d.getDate()}</span>
              <span className="ds">{ev.slice(0, 4).map((c, i) => <i key={i} style={{ background: CRM_CO_DOT[c.company] || "#999" }} />)}</span>
            </div>
          );
        })}
      </div>
      <div className="ag">
        <div className="agh">
          <span>{sel ? new Date(sel + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : "Next 7 days"}
            {!sel && overdue.length ? ` · ${overdue.length} follow ups past due` : ""}</span>
          <span className="tg" onClick={() => dispatch({ type: "CRM_UI", value: { calMore: !ui.calMore } })}>{ui.calMore ? "6 weeks" : "13 weeks"}</span>
        </div>
        {agenda.length === 0 && <div className="ai dim">{sel ? "Nothing on this day." : "No key dates in the next 7 days."}</div>}
        {agenda.map((c, i) => (
          <div key={i} className={`ai ${c.type}`} onClick={() => c.item && dispatch({ type: "CRM_UI", value: { open: c.item, page: c.item, tab: CRM_TAB_OF[c.level] || "contracts" } })}>
            <i style={{ background: CRM_CO_DOT[c.company] || "#999" }} />
            {!sel && <span className="d">{crmWhen(c.date)}</span>}
            <span className="l">{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Five minute mode: the three most urgent in this view, worked one by one. Each says what it is and
// who it is with, then (once its card is read) where it stands, what to do, a caution if there is one,
// and the message ready to go, with plain buttons: draft it in Gmail (never sent), write a different
// one, open the full card, mark done (ClickUp, after a confirm), or skip it for now (the next one moves
// up). A card that is not read yet has a Prepare button; one that failed says so and can try again.
const CRM_FIVE_KIND = { reply: "Reply waiting", followup: "We owe them", checkin: "Check in due", result: "Result to report",
                        interest: "Interested later", lead: "Lead", partner: "Partner", contract: "Contract", mention: "Named in a meeting", person: "Contact" };
const CrmFive = ({ top, cards, drafts, ui, outbox, maxH, dispatch }) => {
  const set = v => dispatch({ type: "CRM_UI", value: v });
  const drafted = top.filter(it => (drafts[it.id] || {}).url).length;
  const skipped = (ui.skip5 || []).length;
  const open = it => set({ open: it.id, page: it.id, tab: CRM_TAB_OF[it.level] || "contracts", five: false });
  return (
    <div className="five">
      <div className="fhint">The {top.length || "three"} most urgent here, each with a message ready. <b>Draft it in Gmail</b> puts it in your drafts; nothing is sent.
        {top.length > 0 && <span className="fp"> {drafted} of {top.length} drafted</span>}</div>
      {top.length === 0 && <div className="ai dim">Nothing urgent in this view.</div>}
      {top.map((it, i) => {
        const card = cards[it.id], c = card && !card.busy && !card.error ? card : null;
        const d = drafts[it.id] || {};
        const who = ((it.who || [])[0] || {}).name || "";
        const late = (crmDays(it.due) || 0) < 0;
        const isFu = ["reply", "followup", "checkin", "result"].includes(it.kind);
        const closing = (outbox || []).find(o => o.op === "close" && o.item === it.id);
        const confirm = ui.fiveDone === it.id;
        const caution = c && (Array.isArray(c.cautions) ? c.cautions[0] : "");
        return (
          <div key={it.id} className={`fv${d.url ? " sent" : ""}`}>
            <div className="ft"><span className="nn">{d.url ? "✓" : i + 1}</span><i style={{ background: CRM_CO_DOT[it.company] || "#999" }} />
              <span className="l" title="open the full card" onClick={() => open(it)}>{it.title}</span>
              <span className={`d${late ? " late" : ""}`}>{crmWhen(it.due)}</span></div>
            <div className="fm">{[CRM_FIVE_KIND[it.kind] || it.kind, who && `with ${who}`, it.company,
                                  it.owner && `owner ${String(it.owner).split(",").map(o => crmFirst(o.trim())).join(" + ")}`].filter(Boolean).join(" · ")}</div>
            {!card && <div className="bts"><span className="bt" onClick={() => crmCard(it, dispatch)}><i>✦</i>Prepare the message</span></div>}
            {card && card.busy && <div className="fl2"><CrmLoading label="Gathering context" co={it.company} /></div>}
            {card && card.error && <div className="fe">Could not prepare this one: {card.error}.
              <span className="bt sm" onClick={() => crmCard(it, dispatch, true)}>Try again</span></div>}
            {c && (
              <div className="fb">
                {(c.why_stopped || c.gap) && <div className="ln"><b>Where it stands</b> {c.why_stopped || c.gap}</div>}
                {c.next_step && <div className="ln"><b>Do this</b> {c.next_step}</div>}
                {caution && <div className="warn">{caution}</div>}
                {c.suggested && <div className="sgb full">{c.suggested}</div>}
              </div>
            )}
            {c && (
              <div className="bts">
                {it.kind !== "proposal" && <CrmDraftActs it={it} card={card} draft={drafts[it.id]} ui={ui} dispatch={dispatch} pill />}
                <span className="bt" onClick={() => open(it)}><i>↗</i>Open full card</span>
                <span className="bt" onClick={() => set({ skip5: [...(ui.skip5 || []), it.id], fiveDone: "" })}><i>→</i>Skip for now</span>
              </div>
            )}
          </div>
        );
      })}
      {skipped > 0 && <div className="fsk" onClick={() => set({ skip5: [] })}>{skipped} skipped · bring {skipped > 1 ? "them" : "it"} back</div>}
    </div>
  );
};

// A listing opened as its own page, like a wiki article: a header with the essentials, the
// proposal's timeline and gate when it has one, then the whole card. Back (or Esc) returns to the
// list exactly where you left it.
const CrmPage = ({ it, ctx, back, tabLabel, children }) => {
  const p = it.kind === "proposal" && ctx.plus && ctx.plus.pursuits ? ctx.plus.pursuits[it.id] : null;
  const due = it.kind === "interest" ? it.resurface : it.kind === "proposal" ? (it.final || it.due) : it.kind === "mention" ? it.date : it.due;
  const dueTxt = it.kind === "person" || (it.kind === "proposal" && it.state === "submitted") ? "" : crmWhen(due);
  const kind = it.kind === "lead" ? `${it.heat || ""} lead`.trim() : it.kind === "person" ? (it.tag || "person") : CRM_KIND[it.kind] || it.kind;
  return (
    <div className="pgw" tabIndex={-1}
         ref={el => { if (el && el.dataset.f !== it.id) { el.dataset.f = it.id; el.focus(); el.scrollTop = 0; } }}
         onKeyDown={e => { if (e.key === "Escape") back(); }}>
      <div className="pgnav">
        <span className="bk" onClick={back}><svg viewBox="0 0 10 10"><path d="M6.5 1.5L3 5l3.5 3.5" /></svg>{tabLabel}</span>
        <span className="cr">{it.company}{(it.companies || []).length > 1 ? ` + ${it.companies.length - 1}` : ""}</span>
      </div>
      <div className="pghd">
        <div className="pgk"><i style={{ background: CRM_CO_DOT[it.company] || GLASS.label }} />{kind}
          {it.owner && <span className="po">{it.owner.split(",").map(o => crmFirst(o.trim())).join(" + ")}</span>}
          {dueTxt && <span className={`pd${/late|yesterday/.test(dueTxt) ? " late" : ""}`}>{dueTxt}</span>}</div>
        <div className="pgt">{it.title}</div>
        {crmMeta(it) && <div className="pgm">{crmMeta(it)}</div>}
      </div>
      {p && (
        <div className="pgs">
          <div className="sh" style={{ display: "flex", alignItems: "baseline" }}><span>Timeline · {CRM_PHASE[p.phase] || "no date yet"}</span>
            {(((ctx.plus && ctx.plus.campaigns) || []).find(c => c.pursuit === it.id)) &&
              <span className="lk2" style={{ marginLeft: "auto" }} onClick={() => ctx.openCamp((ctx.plus.campaigns || []).find(c => c.pursuit === it.id).key)}>open the outreach campaign</span>}</div>
          <CrmGate p={p} big />
          {p.due && <div className="pgdl">
            {[["7 weeks out, outreach starts", p.marks.start], ["21 days, draft review and letters", p.marks.d21],
              ["14 days, bid gate", p.marks.d14], ["7 days, internal submit", p.marks.d7], ["Deadline", p.due]].map(([l, dt]) => (
              <span key={l} className={crmDays(dt) < 0 ? "past" : ""}><b>{crmWhen(dt)}</b>{l}</span>))}
          </div>}
        </div>
      )}
      {children}
    </div>
  );
};

// A campaign as its own page: the goal and the ask, the pipeline, and every target grouped by
// stage, with the touches you can log for each. Stages update on their own from captured email,
// calendar meetings and logged touches.
const CRM_STAGE_COL = { found: "rgba(255,255,255,0.3)", contacted: "#64D2FF", replied: "#C9A8FF", met: "#5ED3A1", letter: "#F5D46B" };
const CRM_TPOC_TXT = {
  open: "Pre release: the one window when TPOCs can be contacted. Ask to meet before the topic opens, or who else in their organization we should talk to.",
  closed: "The topic is open: no direct contact with TPOCs. Questions go through the official Q&A only. Keep working the other customer people.",
  unknown: "Release state is not set in ClickUp. Check whether the topic is still in pre release before contacting a TPOC.",
};
const CRM_STAGE_TXT = { letter: "Letter of support in hand", met: "Met with us", replied: "Replied", contacted: "Contacted, no reply yet", found: "Not contacted yet" };
const CrmCampaignPage = ({ c, copied, back, dispatch }) => {
  const live = (c.targets || []).filter(t => !t.restrict), off = (c.targets || []).filter(t => t.restrict);
  const n = Math.max(1, live.length), gl = crmDays(c.gate), dl = crmDays(c.due);
  const brief = [`Help me run this outreach campaign: ${c.name}.`, c.goal ? `Goal: ${c.goal}` : "", c.ask ? `The ask: ${c.ask}` : "",
    `Follow the MSBAI CRM Playbook: why this person, existing proof, one interesting question, one easy action, under 150 words, LinkedIn notes under 300 characters, no em dashes. If they cannot meet, ask who else in their organization we should talk to.`,
    (c.tpoc || {}).window === "open" ? `TPOCs first, using the topic author script: we build [one clause]; three questions before the topic opens (what does the current approach get wrong, what would make a Phase I money well spent, which literature or datasets are the serious ones); then who else works this problem outside the review chain, and may we say they suggested it.` : "",
    `Draft a first message for each person not contacted yet, and a follow up for each one contacted with no reply. Never write to a TPOC once the topic is open:`,
    ...live.filter(t => (t.stage === "found" || t.stage === "contacted") && (t.type !== "tpoc" || (c.tpoc || {}).window === "open"))
           .map(t => `- ${t.n}${t.type === "tpoc" ? " (TPOC)" : ""}${t.org ? ", " + t.org : ""}${t.fn ? ", " + t.fn : ""} (${t.stage})`)].filter(Boolean).join("\n");
  return (
    <div className="pgw" tabIndex={-1}
         ref={el => { if (el && el.dataset.f !== c.key) { el.dataset.f = c.key; el.focus(); el.scrollTop = 0; } }}
         onKeyDown={e => { if (e.key === "Escape") back(); }}>
      <div className="pgnav">
        <span className="bk" onClick={back}><svg viewBox="0 0 10 10"><path d="M6.5 1.5L3 5l3.5 3.5" /></svg>Campaigns</span>
        <span className="cr">{c.company}</span>
      </div>
      <div className="pghd">
        <div className="pgk"><i style={{ background: CRM_CO_DOT[c.company] || GLASS.label }} />{c.auto ? "campaign from a proposal" : "outreach campaign"}
          {c.gate && <span className={`pd${gl != null && gl < 0 ? " late" : ""}`}>{gl >= 0 ? `gate in ${gl}d` : `gate passed`}{dl != null ? ` · due in ${dl}d` : ""}</span>}</div>
        <div className="pgt">{c.name}</div>
        {c.goal && <div className="pgm">{c.goal}</div>}
        {c.ask && <div className="pgm"><b style={{ color: "#fff" }}>The ask</b> {c.ask}</div>}
      </div>
      <div className="pgs">
        <div className="cpbig"><span className="cpb"><i className="tk" style={{ width: `${Math.round((c.talked || 0) / n * 100)}%` }} /></span>
          <span className="cprn"><b>{c.talked || 0}</b> of {live.length} talked</span></div>
        <div className="cpk">{CRM_STAGES.map(([k, l]) => <span key={k} className={`s-${k}`}><i />{(c.counts || {})[k] || 0} {l}</span>)}</div>
        <div className="bts" style={{ marginTop: 10 }}>
          <span className="bt go" onClick={() => toClaude(brief, dispatch)}><i>✦</i>Draft the outreach with Claude</span>
          {c.pursuit && <span className="bt" onClick={() => dispatch({ type: "CRM_UI", value: { page: c.pursuit, open: c.pursuit, tab: "proposals" } })}><i>↗</i>Open the proposal</span>}
          {c.doc && <span className="bt" onClick={() => openUrl(c.doc)}><i>↗</i>Plan</span>}
        </div>
      </div>
      {(c.targets || []).some(t => t.type === "tpoc") && (
        <div className={`pgs tpb w-${(c.tpoc || {}).window || "unknown"}`}>
          <div className="sh"><i style={{ background: CRM_TYPE.tpoc[1] }} />TPOCs first · {(c.tpoc || {}).window === "open" ? "window open" : (c.tpoc || {}).window === "closed" ? "window closed" : "window unknown"}
            {c.open ? <span className="tpo"> · topic opens {crmWhen(c.open)}</span> : null}</div>
          <div className="tpr">{CRM_TPOC_TXT[(c.tpoc || {}).window || "unknown"]}</div>
          {(c.targets || []).filter(t => t.type === "tpoc").map((t, i) => {
            const locked = (c.tpoc || {}).window === "closed" || !!t.restrict;
            return (
              <div key={i} className={`tg s-${t.stage}${locked ? " off" : ""}`} title={t.restrict || ""}>
                <span className="tn" onClick={() => t.url && openUrl(t.url)}>{t.n}</span>
                <span className="tf">{[t.org, t.fn].filter(Boolean).join(" · ")}</span>
                <span className="st2">{locked ? "no direct contact" : CRM_STAGE_TXT[t.stage]}</span>
              </div>
            );
          })}
        </div>
      )}
      {CRM_STAGES.slice().reverse().map(([k]) => {
        const xs = live.filter(t => t.stage === k && t.type !== "tpoc");
        if (!xs.length) return null;
        return (
          <div key={k} className="pgs cst">
            <div className="sh"><i style={{ background: CRM_STAGE_COL[k] }} />{CRM_STAGE_TXT[k]} · {xs.length}</div>
            {xs.map((t, i) => (
              <div key={i} className={`tg s-${t.stage}`}>
                <span className="tn" title={t.inCrm ? "open in ClickUp" : "not in the CRM yet"} onClick={() => t.url && openUrl(t.url)}>{t.first ? "★ " : ""}{t.n}</span>
                <span className="tf">{[t.org, t.fn].filter(Boolean).join(" · ")}{t.type && CRM_TYPE[t.type] ? <em style={{ color: CRM_TYPE[t.type][1] }}> {CRM_TYPE[t.type][0]}</em> : null}</span>
                <span className="st2">{t.last ? crmWhen(t.last) : ""}{t.channels && t.channels.length ? ` · ${t.channels.join(", ")}` : ""}</span>
              </div>
            ))}
          </div>
        );
      })}
      {off.filter(t => t.type !== "tpoc").length > 0 && <div className="pgs cst">
        <div className="sh">Off limits for this pursuit · {off.filter(t => t.type !== "tpoc").length}</div>
        {off.filter(t => t.type !== "tpoc").map((t, i) => <div key={i} className="tg off" title={t.restrict}><span className="tn">{t.n}</span><span className="tf">{t.restrict.replace(/\s*\(.*$/, "")}</span></div>)}
      </div>}
      <div className="dbk" style={{ marginTop: 12 }}>Stages update on their own from captured email both ways and meetings on your calendar. LinkedIn and calls will join once OpenClaw logs them.</div>
    </div>
  );
};

// ── The playbook layer (crm_plus.py) ──
// MSBAI Customer Outreach, Follow Up and CRM Playbook (Oct 7): talk to buyers and users before
// drafting, three logged customer conversations by 14 days out, debrief every customer call, follow
// up on a clock, and count it every week.
const CRM_TYPE = { buyer: ["Buyer", "#8FD8FF"], user: ["End user", "#5ED3A1"], tpoc: ["TPOC", "#FF7AB6"],
                   adjacent: ["Customer side", "#C9A8FF"], partner: ["Partner", "#FFB547"], peer: ["Peer", "#9AA4B2"], unknown: ["Not typed yet", "#6B7280"] };
const CRM_PHASE = { shaping: "shaping, more than 7 weeks out", outreach: "customer outreach window", draft: "draft review and letters (21 days)",
                    gate: "bid gate (14 days)", final: "internal submit (7 days)", past: "past the date" };
const crmRestrict = (it, plus) => {
  if (!plus || !plus.restrict) return "";
  const n = crmNorm(crmPersonOf(it) || ((it.who || [])[0] || {}).name || "");
  return (n && plus.restrict[n]) || "";
};
function crmPlusItems(plus, data, co) {
  if (!plus) return [];
  const out = [];
  const items = (data && data.items) || [];
  Object.entries(plus.pursuits || {}).forEach(([id, p]) => {
    const it = items.find(x => x.id === id);
    if (!it || !crmMatchCo(it, co) || p.days == null || p.days < 0) return;
    if (p.gstate === "late" || p.gstate === "short") out.push({ id, kind: "gate", level: 3, company: it.company, owner: it.owner,
      title: `${it.title}: ${p.gate} of 3 customer conversations`, pb: p.gstate === "late" ? "under the gate" : "gate soon",
      pbTip: "the bid gate: three logged conversations with buyers, users, TPOCs or customer side people by 14 days out",
      dueTxt: `${p.days}d left`, score: p.gstate === "late" ? 54 : 46 });
  });
  (plus.campaigns || []).forEach(c => {
    const tp = c.tpoc || {};
    if (tp.window === "open" && tp.fresh > 0) out.push({ id: "camp:" + c.key, kind: "campaign", company: c.company || "MSBAI",
      title: `TPOC window open: ${tp.fresh} TPOC${tp.fresh === 1 ? "" : "s"} to contact for ${c.name}`, pb: "TPOC now",
      pbTip: "TPOCs can only be contacted during pre release. Ask to meet before the topic opens, or who else we should talk to.",
      dueTxt: c.open ? `opens ${crmWhen(c.open)}` : "", score: 70 });
    const left = crmDays(c.gate);
    const fresh = (c.targets || []).filter(t => t.stage === "found");
    if (fresh.length && left != null && left >= 0 && left <= 10) out.push({ id: "camp:" + c.key, kind: "campaign", company: c.company || "MSBAI",
      title: `${c.name}: ${fresh.length} not contacted yet`, pb: "campaign", pbTip: c.goal || "",
      dueTxt: left >= 0 ? `gate in ${left}d` : "gate passed", score: 50 + Math.max(0, 10 - left) });
  });
  return out.filter(x => crmMatchCo(x, co));
}
// The timeline under a proposal row: 7 weeks out, 21, 14 and 7 days, the deadline, and where today
// sits, with the bid gate meter beside it.
const CrmGate = ({ p, big }) => {
  if (!p.due) return <div className="gate"><span className="nd">No due date in ClickUp, so no timeline or gate yet</span></div>;
  const pos = before => Math.max(0, Math.min(100, (49 - before) / 49 * 100));
  const marks = [[49, "7 wk"], [21, "21d"], [14, "gate"], [7, "submit"], [0, "due"]];
  return (
    <div className={`gate${big ? " big" : ""}`} title={`${CRM_PHASE[p.phase] || ""} · due ${p.due}`}>
      <span className="rail">
        <i className="fill" style={{ width: `${pos(Math.max(0, p.days))}%` }} />
        {marks.map(([b, l]) => <b key={b} style={{ left: `${pos(b)}%` }} className={p.days <= b ? "hit" : ""}><em>{l}</em></b>)}
        {p.days >= 0 && p.days <= 49 && <span className="now" style={{ left: `${pos(p.days)}%` }} />}
      </span>
      <span className={`gm ${p.gstate}`}>
        {[0, 1, 2].map(i => <i key={i} className={i < p.gate ? "on" : ""} />)}
        <span>{p.gate}/3</span></span>
    </div>
  );
};
const CrmCustMap = ({ p }) => {
  const groups = ["buyer", "user", "tpoc", "adjacent"];
  const ppl = p.people || [];
  const others = ppl.filter(x => !groups.includes(x.type));
  const st = { talked: "talked", contacted: "contacted, no reply yet", none: "not contacted" };
  return (
    <div className="blk cmap">
      <div className="sh">Customer map · {p.gate} of 3 conversations for the gate{p.days != null && p.days >= 0 ? ` · ${p.days} days left` : ""}</div>
      {p.warn && <div className="warn">{p.warn}</div>}
      <div className="cg">
        {groups.map(g => {
          const xs = ppl.filter(x => x.type === g);
          return (
            <div key={g} className={`cgc${xs.length ? "" : " empty"}`}>
              <div className="cgh"><i style={{ background: CRM_TYPE[g][1] }} />{CRM_TYPE[g][0]} <b>{xs.length || ""}</b></div>
              {xs.length === 0 && <div className="cgn">nobody yet</div>}
              {xs.slice(0, 6).map((x, i) => (
                <div key={i} className={`cp ${x.st}`} title={`${x.n}${x.title ? " · " + x.title : ""}${x.org ? " · " + x.org : ""} · ${st[x.st]}${x.last ? " · " + x.last : ""}`}
                     onClick={() => x.url && openUrl(x.url)}><i />{x.n}</div>
              ))}
              {xs.length > 6 && <div className="cgn">+{xs.length - 6} more</div>}
            </div>
          );
        })}
      </div>
      {others.length > 0 && <div className="cgo">Also linked: {others.length} {others.length === 1 ? "person" : "people"} who are other companies, researchers or not typed yet. They do not count toward the gate.</div>}
      <div className="cgk"><span><i className="talked" />talked</span><span><i className="contacted" />contacted</span><span><i className="none" />not yet</span></div>
    </div>
  );
};
const CrmWeek = ({ plus, copied, dispatch }) => {
  const w = (plus && plus.week) || null;
  if (!w) return <div className="ai dim">The scoreboard fills in after the next CRM sync.</div>;
  const pct = Math.min(100, Math.round((w.conversations || 0) / (w.goal || 10) * 100));
  const txt = [`This week (since ${w.since}):`, `Conversations with outside people: ${w.conversations} of ${w.goal} (${w.customer} on the customer side)`,
               `Outreach sent: ${w.outreach} · replies: ${w.replies} · LinkedIn and calls logged: ${w.touches}`,
               `Overdue follow ups: ${w.overdue} · pursuits under the bid gate: ${w.gateShort}`].join("\n");
  return (
    <div className="wk">
      <div className="wkm">
        <div className="wkr"><span className="wkn">{w.conversations}</span><span className="wkg">of {w.goal} conversations this week</span>
          <span className="wkc">{w.customer} customer side</span></div>
        <div className="wkb"><i style={{ width: `${pct}%` }} /></div>
      </div>
      <div className="wkt">
        <span><b>{w.outreach}</b>outreach</span><span><b>{w.replies}</b>replies</span><span><b>{w.touches}</b>LinkedIn, calls</span>
        <span className={w.overdue ? "bad" : ""}><b>{w.overdue}</b>overdue</span><span className={w.gateShort ? "bad" : ""}><b>{w.gateShort}</b>under the gate</span>
      </div>
      <div className="wkx"><span className="lk2" onClick={() => copyText(txt, dispatch, "crm:week")}>{copied === "crm:week" ? "copied" : "copy for #bizdev"}</span></div>
    </div>
  );
};
function crmTouch(spec, dispatch) {
  run(`${CRMSH} touch ${JSON.stringify(b64(JSON.stringify(spec)))}`).then(() => { dispatch({ type: "COPIED", value: "touch:" + spec.n }); setTimeout(() => dispatch({ type: "COPIED", value: "" }), 1800); crmTick(dispatch); });
}
function crmDebrief(spec, dispatch) {
  run(`${CRMSH} debrief ${JSON.stringify(b64(JSON.stringify(spec)))}`).then(() => crmTick(dispatch));
}
const crmTick = dispatch => run(`${CRMSH} tick`).then(out => dispatch({ type: "CRM", value: out }));
const crmDebForm = {};                       // what you typed in a debrief, kept between renders
const CrmDebriefs = ({ plus, drafts, dispatch }) => {
  const ms = (plus && plus.debriefs) || [];
  if (!ms.length) return <div className="ai dim">No meetings with outside people waiting for a debrief.</div>;
  return (
    <div className="dbs">
      {ms.map(m => {
        const f = crmDebForm[m.key] = crmDebForm[m.key] || { want: "", need: "", next: "" };
        const first = m.people[0] || { n: "" };
        const tyIt = { id: "deb:" + m.key, kind: "person", title: first.n, company: "MSBAI", who: [{ name: first.n }], note: `Thank you note after "${m.title}"` };
        const dr = drafts[tyIt.id] || {};
        const save = () => crmDebrief({ key: m.key, title: m.title, want: f.want, need: f.need, next: f.next, company: "MSBAI",
                                        people: m.people.map(p => ({ n: p.n, rel: p.rel || "" })) }, dispatch);
        const field = (k, ph) => <input type="text" placeholder={ph} defaultValue={f[k]} onInput={e => { f[k] = e.target.value; }} />;
        return (
          <div key={m.key} className={`db${m.customer ? " cust" : ""}`}>
            <div className="dbh"><b>{m.title}</b><span>ended {m.hours < 1 ? "just now" : `${Math.round(m.hours)}h ago`}{m.customer ? " · customer side" : ""}</span></div>
            <div className="dbp">{m.people.slice(0, 8).map((p, i) => <span key={i} title={`${p.em} · ${(CRM_TYPE[p.type] || CRM_TYPE.unknown)[0]}`}>
              <i style={{ background: (CRM_TYPE[p.type] || CRM_TYPE.unknown)[1] }} />{p.n}</span>)}{m.people.length > 8 ? <span>+{m.people.length - 8}</span> : null}</div>
            <div className="dbf">
              {field("want", "What do they say they want?")}
              {field("need", "What do they actually need?")}
              {field("next", "Next step, who and by when")}
            </div>
            <div className="bts">
              <span className="bt go" onClick={save}><i>✓</i>Save debrief</span>
              {dr.url ? <span className="bt" onClick={() => openUrl(dr.url)}><i>↗</i>Open thank you draft</span>
                : <span className={`bt${dr.busy ? " st" : ""}`} onClick={() => !dr.busy && crmDraft(tyIt, dispatch, "", `A short thank you to everyone at "${m.title}". Thank them for their time, restate the one thing they want in a sentence, and say what we will send and when.${f.want ? " They said they want: " + f.want : ""}${f.next ? " Next step: " + f.next : ""}`)}>
                    <i>✉</i>{dr.busy ? "Writing…" : "Thank you draft"}</span>}
              <span className="bt" title="not a customer meeting, nothing to debrief" onClick={() => run(`${CRMSH} debrief-skip ${JSON.stringify(m.key)}`).then(() => crmTick(dispatch))}><i>→</i>Skip</span>
            </div>
            {dr.error && <div className="warn">{dr.error}</div>}
          </div>
        );
      })}
      <div className="dbk">Saved debriefs go on each person's Rolodex page and their ClickUp record. The thank you lands in Gmail drafts; you send it.</div>
    </div>
  );
};
const CRM_STAGES = [["found", "found"], ["contacted", "contacted"], ["replied", "replied"], ["met", "met"], ["letter", "letter"]];
const CrmCampaigns = ({ plus, copied, dispatch }) => {
  const cs = (plus && plus.campaigns) || [];
  if (!cs.length) return <div className="ai dim">No campaigns yet. Every open proposal with customer people becomes one, and desk-widget/campaigns.json adds your own lists.</div>;
  return (
    <div className="cpo">
      {cs.map(c => {
        const n = Math.max(1, (c.targets || []).length - (c.offLimits || 0)), gl = crmDays(c.gate);
        return (
          <div key={c.key} className="cpr" onClick={() => dispatch({ type: "CRM_UI", value: { page: "camp:" + c.key } })}>
            <div className="cprt"><i style={{ background: CRM_CO_DOT[c.company] || "#999" }} />
              <span className="nm">{c.name}</span>
              <span className={`src${c.auto ? "" : " own"}`}>{c.auto ? "from proposal" : "list"}</span>
              {c.tpoc && c.tpoc.n > 0 && <span className={`tpc w-${c.tpoc.window}`} title={CRM_TPOC_TXT[c.tpoc.window]}>
                {c.tpoc.n} TPOC{c.tpoc.n === 1 ? "" : "s"}{c.tpoc.window === "open" ? (c.tpoc.fresh ? ` · ${c.tpoc.fresh} to contact` : " · contacted") : c.tpoc.window === "closed" ? " · locked" : " · check window"}</span>}
              <span className={`gd${gl != null && gl < 0 ? " past" : gl != null && gl <= 7 ? " soon" : ""}`}>{gl == null ? "no gate date" : gl >= 0 ? `gate in ${gl}d` : `gate passed ${-gl}d ago`}</span></div>
            <div className="cprb">
              <span className="cpb" title={`${c.talked || 0} of ${n} talked to`}><i className="tk" style={{ width: `${Math.round((c.talked || 0) / n * 100)}%` }} /></span>
              <span className="cprn"><b>{c.talked || 0}</b>/{n} talked</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// The Settings page: sliders that change the widget live, each centered on the original setup,
// with a preview card so you can see text, glass and tabs move as you drag.
const SettingsView = ({ settings, height, dispatch }) => {
  const st = settings;
  const changed = SETTINGS.filter(x => Math.abs((st[x.k] != null ? st[x.k] : x.def) - x.def) > x.step / 2).length;
  return (
    <div className={`${panel} ${setCss}`} style={{ height, display: "flex", flexDirection: "column" }}>
      <div className={head}>
        <span>Settings</span>
        <span className="v">{changed ? `${changed} changed · ` : "your original setup · "}
          <span className="rs" onClick={() => resetSettings(dispatch)}>reset all</span> ·{" "}
          <span className="rs" onClick={() => setView("desk", dispatch)}>done</span></span>
      </div>
      <div className="wrap">
        <div className="sliders">
          {SETTINGS.map(x => {
            const v = st[x.k] != null ? st[x.k] : x.def;
            const pct = (v - x.min) / (x.max - x.min) * 100;
            const mid = (x.def - x.min) / (x.max - x.min) * 100;
            const moved = Math.abs(v - x.def) > x.step / 2;
            return (
              <div key={x.k} className={`sl${moved ? " moved" : ""}`}>
                <div className="top">
                  <span className="nm" title="double-click to put this one back" onDoubleClick={() => setSetting(st, x.k, x.def, dispatch)}>{x.label}</span>
                  <span className="val">{x.fmt(v)}</span>
                </div>
                <div className="track">
                  <i className="fill" style={{ width: `${pct}%` }} />
                  <i className="mid" style={{ left: `${mid}%` }} title="your original setup" />
                  <input type="range" min={x.min} max={x.max} step={x.step} value={v}
                         onInput={e => setSetting(st, x.k, parseFloat(e.target.value), dispatch)}
                         onChange={e => setSetting(st, x.k, parseFloat(e.target.value), dispatch)}
                         onDoubleClick={() => setSetting(st, x.k, x.def, dispatch)} />
                </div>
                <div className="hint">{x.hint}</div>
              </div>
            );
          })}
          <div className="foot">The mark on each track is your original setup. Double-click a slider or its name to snap back.</div>
        </div>
        <div className="preview">
          <div className="ph">Preview</div>
          <div className="tabsx" style={{ zoom: st.tabs }}><span className="on">desk</span><span>claude</span><span>crm</span><span>wiki</span></div>
          <div className="card">
            <div className="lbl">Tasks · 4 active</div>
            <div className="tt">Send Kevin the GURU OnDemand details</div>
            <div className="mt">[MSBAI] for Rinku · from Slack (Oct 5)</div>
            <div className="nt">A note line, the size most of the widget reads at.</div>
          </div>
          <div className="card">
            <div className="lbl">Calendar</div>
            <div className="ev"><b>Collaborative Working Session</b><span>8:00 – 9:30</span></div>
            <div className="ev alt"><b>Monday AI meeting</b><span>11:00 – 12:00</span></div>
          </div>
          <div className="scale">
            {[9, 11, 13, 16].map(n => <span key={n} style={{ fontSize: `calc(${n}px * var(--msbfs, 1))` }}>Aa {n}</span>)}
          </div>
        </div>
      </div>
    </div>
  );
};
const setCss = css`
  .rs { cursor: pointer; color: #fff; } .rs:hover { text-decoration: underline; text-underline-offset: 2px; }
  .wrap { flex: 1; min-height: 0; display: flex; gap: 22px; overflow: auto; }
  .sliders { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 16px; padding: 4px 2px 8px; }
  .sl .top { display: flex; justify-content: space-between; align-items: baseline; }
  .sl .nm { font-size: 12.5px; font-weight: 700; color: #fff; cursor: default; }
  .sl .val { font-size: 11.5px; font-weight: 800; color: ${GLASS.sub}; font-variant-numeric: tabular-nums; transition: color .2s; }
  .sl.moved .val { color: ${ACCENT.cal}; }
  .sl .hint { font-size: 10.5px; color: ${GLASS.label}; margin-top: 4px; }
  .track { position: relative; height: 22px; margin-top: 4px; }
  .track:before { content: ""; position: absolute; left: 0; right: 0; top: 9px; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.12); }
  .track .fill { position: absolute; left: 0; top: 9px; height: 4px; border-radius: 2px; pointer-events: none;
                 background: linear-gradient(90deg, rgba(203,211,222,0.35), ${ACCENT.cal}); }
  .track .mid { position: absolute; top: 5px; width: 2px; height: 12px; margin-left: -1px; border-radius: 1px; background: rgba(255,255,255,0.45); pointer-events: none; }
  .track input { position: absolute; inset: 0; width: 100%; margin: 0; background: transparent; -webkit-appearance: none; appearance: none; cursor: pointer; }
  .track input::-webkit-slider-runnable-track { height: 22px; background: transparent; }
  .track input::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; margin-top: 3px; border-radius: 50%;
    background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.45), 0 0 0 3px rgba(255,255,255,0.12); transition: transform .15s, box-shadow .15s; }
  .track input:hover::-webkit-slider-thumb { transform: scale(1.12); box-shadow: 0 2px 10px rgba(0,0,0,0.5), 0 0 0 5px rgba(203,211,222,0.22); }
  .track input:active::-webkit-slider-thumb { transform: scale(1.22); }
  .foot { font-size: 10.5px; color: ${GLASS.label}; margin-top: auto; }
  .preview { flex: 0 0 42%; min-width: 0; display: flex; flex-direction: column; gap: 10px; padding: 4px 2px 8px; }
  .ph { font-size: 9px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: ${GLASS.label}; }
  .tabsx { display: flex; align-self: flex-start; gap: 2px; padding: 2px; border-radius: 999px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); }
  .tabsx span { padding: 3px 11px; border-radius: 999px; font-size: 9px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: ${GLASS.label}; }
  .tabsx span.on { background: rgba(255,255,255,0.16); color: #fff; }
  .card { padding: 12px 14px; border-radius: ${GLASS.radius}; background: ${GLASS.bg}; border: ${GLASS.border}; transition: border-radius .2s; }
  .card .lbl { font-size: 9px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: ${GLASS.label}; margin-bottom: 7px; }
  .card .tt { font-size: 13px; font-weight: 600; color: #fff; }
  .card .mt { font-size: 11px; color: ${GLASS.sub}; margin-top: 2px; }
  .card .nt { font-size: 11px; color: rgba(255,255,255,0.82); margin-top: 6px; padding-left: 9px; border-left: 1px solid ${GLASS.hair}; }
  .card .ev { display: flex; justify-content: space-between; gap: 8px; font-size: 11.5px; padding: 5px 8px; border-radius: 7px;
              background: rgba(127,178,255,0.22); border-left: 3px solid #7FB2FF; color: #fff; }
  .card .ev + .ev { margin-top: 5px; }
  .card .ev.alt { background: rgba(94,211,161,0.2); border-left-color: #5ED3A1; }
  .card .ev span { color: ${GLASS.sub}; font-size: 10.5px; }
  .scale { display: flex; align-items: baseline; gap: 14px; color: #fff; font-weight: 600; padding: 4px 2px; }
`;

const CrmView = ({ crm, ui, emails, mail, mailSync, me, copied, height, tasks, flow, openTasks, dispatch }) => {
  const outbox = (crm && crm.outbox) || [];
  const ctx = { tasks, flow, openTasks, outbox, plus: (crm && crm.plus) || null,
                openCamp: key => dispatch({ type: "CRM_UI", value: { page: "camp:" + key, tab: "campaigns" } }) };
  // a follow up you closed here leaves Do now and the lists at once, before ClickUp confirms it
  const closedHere = new Set(outbox.filter(o => o.op === "close" && o.status !== "failed").map(o => o.item));
  const data = (crm && crm.data) || null;
  const cards = (crm && crm.cards) || {};
  const alerts = (crm && crm.alerts) || {};
  const drafts = (crm && crm.drafts) || {};
  const set = v => dispatch({ type: "CRM_UI", value: v });
  const co = ui.co || "All", tab = ui.tab && ui.tab !== "today" ? ui.tab : "inbox";
  const people = (data && data.people) || {};
  const alertOf = {};
  Object.values(alerts).forEach(a => { if (a && a.item) alertOf[a.item] = a; });
  const tagFor = name => {
    const p = people[crmNorm(name)];
    if (!p) return "";
    const lv = Math.min(...(p.levels || [9]));
    return [({ 1: "contract", 2: p.heat ? `${p.heat} lead` : "lead", 3: "proposal", 4: "partner" })[lv] || "",
            (p.roles || []).includes("tpoc") ? "TPOC" : "", (p.pursuits || []).join(", ")].filter(Boolean).join(" · ");
  };
  const mailItems = emails.filter(m => !m.practice).map(m => {
    const p = people[crmNorm(m.from)] || {};
    return { id: "mail:" + m.thread, kind: "email", level: Math.min(...(p.levels || [9])), company: m.company,
             title: m.subject, who: [{ name: m.from }], when: m.when, mail: m };
  });
  const visible = it => crmMatchCo(it, co) && (!ui.mine || it.owner == null || crmIsMine(it, me))
    && (!ui.owner || String(it.owner || "").includes(ui.owner));
  const all = ((data && data.items) || []).concat(mailItems).filter(visible).filter(it => !closedHere.has(it.id)).map(it => ({ ...it, score: crmScore(it) }));
  const plus = (crm && crm.plus) || null;
  const plusItems = crmPlusItems(plus, data, co);
  const ranked = all.filter(it => it.score >= 30).concat(plusItems).sort((a, b) => b.score - a.score);
  const doNow = ranked.slice(0, 5);
  // one per person, so two follow ups about the same conversation do not take two of the three spots
  const fiveTop = ranked.filter(it => it.kind !== "email" && it.kind !== "proposal" && !it.pb && !(ui.skip5 || []).includes(it.id))
    .filter((it, i, xs) => { const w = crmNorm(((it.who || [])[0] || {}).name || it.id); return xs.findIndex(x => crmNorm(((x.who || [])[0] || {}).name || x.id) === w) === i; })
    .slice(0, 3);
  // five minute mode asks for the cards it needs once, after this render (never dispatch mid render)
  if (ui.five) fiveTop.forEach(it => { if (!cards[it.id] && !crmAsked.has(it.id)) { crmAsked.add(it.id); setTimeout(() => crmCard(it, dispatch), 0); } });
  const cal = ((data && data.calendar) || []).filter(c => co === "All" || c.company === co);
  const count = lvl => all.filter(it => it.kind !== "email" && it.level === lvl && !it.stale).length;
  // the team strip: open follow ups, replies and proposals per owner in this company view
  const team = {};
  ((data && data.items) || []).filter(it => crmMatchCo(it, co) && it.owner && !it.stale
      && ["reply", "followup", "checkin", "result", "proposal"].includes(it.kind))
    .forEach(it => it.owner.split(",").map(o => o.trim()).filter(Boolean).forEach(o => {
      const t = team[o] = team[o] || { n: 0, late: 0 };
      t.n++; if (/late/.test(crmWhen(it.due))) t.late++;
    }));
  const overlaps = ((data && data.items) || []).filter(it => crmMatchCo(it, co) && (it.overlap || []).length > 1 && it.kind !== "contract" && it.kind !== "partner");
  const nudges = (crm && crm.nudges) || [];
  const inboxN = emails.filter(m => !m.practice && crmMatchCo({ company: m.company }, co)).length
    + all.filter(it => it.kind === "reply").length + nudges.length;
  let rows = [];
  const t = CRM_TABS.find(x => x.key === tab) || CRM_TABS[0];
  if (t.level) {
    rows = all.filter(it => it.kind !== "email" && it.level === t.level && (ui.older || !it.stale));
    if (ui.day) { const ids = new Set(cal.filter(c => c.date === ui.day).map(c => c.item)); rows = rows.filter(it => ids.has(it.id)); }
    rows.sort((a, b) => (alertOf[b.id] ? 1 : 0) - (alertOf[a.id] ? 1 : 0) || b.score - a.score || String(a.due || "9").localeCompare(String(b.due || "9")));
    // Proposals tab: the proposals themselves come first, the ones with a live timeline on top
    // (soonest due first, then the ones that slipped past due, then no date yet, then submitted).
    // Items that only relate to a proposal (names from a meeting, confirm a result) sit underneath.
    if (t.level === 3) {
      const grp = it => {
        if (it.kind !== "proposal") return 9;
        if (it.state === "submitted") return 5;
        const d = crmDays(it.final || it.due);
        return d == null ? 2 : d >= 0 ? 0 : 1;
      };
      const dueOf = it => String(it.final || it.due || "");
      rows.sort((a, b) => grp(a) - grp(b)
        || (grp(a) === 0 ? dueOf(a).localeCompare(dueOf(b)) : grp(a) === 1 ? dueOf(b).localeCompare(dueOf(a)) : 0)
        || (alertOf[b.id] ? 1 : 0) - (alertOf[a.id] ? 1 : 0) || b.score - a.score);
    }
  }
  const propN = t.level === 3 ? rows.filter(it => it.kind === "proposal").length : rows.length;
  const olderN = t.level ? all.filter(it => it.level === t.level && it.stale).length : 0;
  const replies = all.filter(it => it.kind === "reply").sort((a, b) => b.score - a.score);
  const inboxMail = emails.filter(m => m.practice || crmMatchCo({ company: m.company }, co));
  const ask = (crm && crm.ask) || null;
  const syncTxt = ui.syncing || (crm && crm.sync === "syncing") ? "syncing…"
    : data && data.updated ? `synced ${agoShort(new Date(data.updated).getTime())}` : "";
  const nAlerts = Object.keys(alerts).length;
  const row = it => <CrmRow key={it.id} it={it} open={ui.open === it.id} card={cards[it.id]} alert={alertOf[it.id]}
                            drafts={drafts} ui={ui} copied={copied} ctx={ctx} dispatch={dispatch} />;
  // the Rolodex tab: crm.json's roster, filtered by company, letter and search
  const LV = { 1: "contract", 2: "lead", 3: "proposal", 4: "partner" };
  const roster = tab !== "people" ? [] : ((data && data.roster) || [])
    .filter(r => co === "All" || (r.c || []).includes(co))
    .filter(r => !ui.pq || r.n.toLowerCase().includes(ui.pq.toLowerCase()) || (r.pursuits || []).join(" ").toLowerCase().includes(ui.pq.toLowerCase()));
  const letters = [...new Set(roster.map(r => (r.n.replace(/^[^A-Za-z]+/, "")[0] || "#").toUpperCase()))].sort();
  // the listing open as a page: anything in the lists, or a person from the Rolodex
  const personItem = r => ({
    id: "p:" + ((r.rel || [])[0] || r.con || crmNorm(r.n).replace(/\s+/g, "-")), kind: "person", level: r.lv || 0, title: r.n,
    company: (r.c || [])[0] || "MSBAI", companies: r.c, roles: r.roles, pursuits: r.pursuits, heat: r.heat, email: r.email,
    tag: [LV[r.lv], r.heat].filter(Boolean).join(" · ") || "person",
    rel: (r.rel || [])[0] || "", con: r.con || "",
    who: [{ name: r.n }], url: (r.rel || [])[0] ? `https://app.clickup.com/t/${r.rel[0]}` : r.con ? `https://app.clickup.com/t/${r.con}` : "" });
  const pageCamp = String(ui.page || "").startsWith("camp:")
    ? (((crm && crm.plus && crm.plus.campaigns) || []).find(c => "camp:" + c.key === ui.page) || null) : null;
  const pageIt = !ui.page || pageCamp ? null
    : all.find(x => x.id === ui.page)
      || (String(ui.page).startsWith("p:") ? (((data && data.roster) || []).map(personItem).find(x => x.id === ui.page) || null) : null);
  // The level pills. They sit below the sections; once they scroll out of view, a copy floats at the
  // top of the scroll area (no box: the page fades out under it instead), and picking one there jumps
  // to the start of that list.
  const pills = cls => (
    <div className={cls}>
      {CRM_TABS.map(x => (
        <span key={x.key} className={tab === x.key ? "on" : ""} title={x.tip} onClick={e => {
          const sc = e.currentTarget.closest(".crmwrap").querySelector(".crmscroll"), mk = sc && sc.querySelector(".lvmark");
          set({ tab: x.key, open: "" });
          if (sc && mk) { const dy = mk.getBoundingClientRect().top - sc.getBoundingClientRect().top; if (dy < 0) sc.scrollTop += dy; }
        }}>
          {x.label} <b>{x.level ? count(x.level) : x.key === "campaigns" ? (((crm && crm.plus && crm.plus.campaigns) || []).filter(c => co === "All" || c.company === co).length || "") : x.key === "people" ? (((data && data.roster) || []).filter(r => co === "All" || (r.c || []).includes(co)).length || "") : inboxN}</b></span>
      ))}
      {ui.owner && <span className="dayf" onClick={() => set({ owner: "" })}>{crmFirst(ui.owner)} ×</span>}
      {ui.day && <span className="dayf" onClick={() => set({ day: "" })}>{crmWhen(ui.day)} ×</span>}
    </div>
  );

  return (
    <div className={`${panel} ${crmCss}`} style={{ height, display: "flex", flexDirection: "column" }}>
      <div className={head}>
        <span className="tabs">
          {CRM_COS.map(c => (
            <span key={c} className={`tab${co === c ? " on" : ""}`} onClick={() => set({ co: c, day: "" })}>
              {c !== "All" && <i className="cd" style={{ background: CRM_CO_DOT[c] }} />}{c}</span>
          ))}
          <span className="bar">|</span>
          <span className={`tab${ui.mine ? " on" : ""}`} title="only follow ups and proposals assigned to you" onClick={() => set({ mine: !ui.mine })}>mine</span>
          <span className={`tab${ui.asking ? " on" : ""}`} title="ask the CRM a question" onClick={() => set({ asking: !ui.asking })}>ask</span>
        </span>
        <span>
          {nAlerts > 0 && <span className="nb" title="rows with news glow until you press got it">{nAlerts} new</span>}{" "}
          <span className={`v${/FAILED/.test((crm && crm.sync) || "") ? " bad" : ""}`} title={(crm && crm.sync) || ""}>
            {/FAILED/.test((crm && crm.sync) || "") && !ui.syncing ? `last sync failed (hover) · ${syncTxt}` : syncTxt}</span>{" "}
          <span className={refreshBtn} title="read the CRM in ClickUp again (takes a few minutes)" onClick={() => !ui.syncing && crmSync(dispatch)}>refresh</span>
        </span>
      </div>
      {ui.asking && (
        <div className="askb">
          <input type="text" placeholder="Ask the CRM: who do we know at Space Force? what did we promise Argonne? Enter"
                 ref={el => { if (el && el.dataset.f !== "1") { el.focus(); el.dataset.f = "1"; } }}
                 onKeyDown={e => { if (e.key === "Enter") crmAsk(e.target.value, co, dispatch); if (e.key === "Escape") set({ asking: false }); }} />
          {ask && <div className="ans">
            <div className="aq">{ask.q}{ask.busy ? " · reading the CRM, ClickUp, Gmail and Slack…" : ""}</div>
            {!ask.busy && <div className="aa">{linkify(ask.a)}</div>}
          </div>}
        </div>
      )}
      {/* everything under the header scrolls as one page, so a tall section (five minute mode, an
          open card) never hides what is below it */}
      {pageIt && (
        <CrmPage it={pageIt} ctx={ctx} back={() => set({ page: "", open: "" })} tabLabel={(CRM_TABS.find(x => x.key === tab) || {}).label || "CRM"}>
          <CrmRow key={"pg" + pageIt.id} it={pageIt} open page card={cards[pageIt.id]} alert={alertOf[pageIt.id]}
                  drafts={drafts} ui={{ ...ui, open: pageIt.id }} copied={copied} ctx={ctx} dispatch={dispatch} />
        </CrmPage>
      )}
      {pageCamp && <CrmCampaignPage c={pageCamp} copied={copied} back={() => set({ page: "", tab: "campaigns" })} dispatch={dispatch} />}
      <div className="crmwrap" style={{ flex: 1, minHeight: 0, position: "relative", display: pageIt || pageCamp ? "none" : "flex", flexDirection: "column" }}>
      {data && pills("lv lvfloat")}
      <div className="crmscroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", marginRight: -10, paddingRight: 10 }}
           ref={el => { if (el && !el.dataset.sl) { el.dataset.sl = "1"; el.addEventListener("scroll", () => crmStick(el), { passive: true }); } if (el) setTimeout(() => crmStick(el), 0); }}>
      {!data && <div className="empty">The CRM has not synced yet. It reads ClickUp's CRM v3 space every 90 minutes, 6am to 10pm; press refresh to read it now.</div>}
      {data && (
        <div className="top2 secs">
          {(() => {
            const saved = (ui.order || []).filter(k => CRM_SECS[k]);
            const order = saved.slice();
            CRM_SEC_ORDER.forEach((k, i) => { if (!order.includes(k)) order.splice(Math.min(i, order.length), 0, k); });
            const fold = ui.fold || {};
            const mv = (k, d) => { const o = order.slice(), i = o.indexOf(k), j = i + d; if (j < 0 || j >= o.length) return; o[i] = o[j]; o[j] = k; set({ order: o }); };
            const late = Object.values(team).reduce((a, v) => a + (v.late || 0), 0);
            const pw = (plus && plus.week) || {};
            const sum = { dates: `${(cal || []).length || ""} dates`.trim(), donow: `${doNow.length} to do`,
                          team: `${Object.keys(team).length} people${late ? `, ${late} late` : ""}` };
            const body = {
              dates: <CrmCal cal={cal} ui={ui} dispatch={dispatch} />,
              donow: ui.five ? <CrmFive top={fiveTop} cards={cards} drafts={drafts} ui={ui} outbox={outbox} maxH={Math.max(280, Math.round((height || 640) * 0.62))} dispatch={dispatch} /> : (
                <div className="dn">
                  {doNow.length === 0 && <div className="ai dim">Nothing urgent in this view.</div>}
                  {doNow.map((it, i) => (
                    <div key={it.id} className="ai" onClick={() => it.kind === "email" ? set({ tab: "inbox" })
                      : it.kind === "campaign" ? set({ page: it.id })
                      : it.kind === "debrief" ? set({ fold: { ...(ui.fold || {}), [it.kind]: false } })
                      : set({ open: it.id, page: it.id, tab: CRM_TAB_OF[it.level] || "contracts" })}>
                      <span className="nn">{i + 1}</span>
                      <i style={{ background: CRM_CO_DOT[it.company] || "#999" }} />
                      <span className="l">{it.kind === "email" ? `Reply to ${it.who[0].name}: ${it.title}` : it.title}</span>
                      {alertOf[it.id] && <span className={`why w-${String(alertOf[it.id].key || "").split(":")[0]}`} title={alertOf[it.id].what}>{CRM_WHY[String(alertOf[it.id].key || "").split(":")[0]] || "new"}</span>}
                      {it.pb && <span className={`why pb-${it.kind}`} title={it.pbTip || ""}>{it.pb}</span>}
                      {it.owner && <span className="o">{it.owner.split(",").map(o => crmFirst(o.trim())).join(" + ")}</span>}
                      <span className="d">{it.kind === "email" ? (it.when ? dayShort(it.when) : "") : it.pb ? (it.dueTxt || "") : crmWhen(it.due)}</span>
                    </div>
                  ))}
                </div>
              ),
              team: Object.keys(team).length === 0 ? <div className="ai dim">Nobody has open follow ups in this view.</div> : (
                <div className="team" title="open follow ups, replies and proposals per owner; click to filter">
                  {Object.entries(team).sort((a, b) => b[1].n - a[1].n).map(([o, v]) => (
                    <span key={o} className={`tm${ui.owner === o ? " on" : ""}`} onClick={() => set({ owner: ui.owner === o ? "" : o })}>
                      {crmFirst(o)} <b>{v.n}</b>{v.late ? <em> {v.late} late</em> : null}</span>
                  ))}
                  {overlaps.length > 0 && <span className="ov" title={overlaps.map(x => `${x.title}: ${x.overlap.join(" and ")}`).join("\n")}>{overlaps.length} with two owners</span>}
                </div>
              ),
            };
            const extra = { donow: <span className={`five5${ui.five ? " on" : ""}`} title="the top three, each with a message ready to draft"
                                          onClick={e => { e.stopPropagation(); set({ five: !ui.five }); }}>I have five minutes</span> };
            return order.map((k, i) => (
              <div key={k} data-k={k} className={`blk2${fold[k] ? " folded" : ""}${ui.dragK === k ? " lift" : ""}`}>
                <div className="bh">
                  <span className="grip" title="drag to move this section" onMouseDown={e => beginCrmSecDrag(e, k, order, set)}>
                    <i /><i /><i /><i /><i /><i /></span>
                  <span className="bn2" onClick={() => !crmSecDragged && set({ fold: { ...fold, [k]: !fold[k] } })}>
                    {CRM_SECS[k]} <span className="ch">{fold[k] ? "▸" : "▾"}</span></span>
                  {fold[k] && <span className="sum">{sum[k]}</span>}
                  <span className="bx">{!fold[k] && extra[k]}
                    <span className={`mv${i === 0 ? " off" : ""}`} title="move up" onClick={() => mv(k, -1)}>↑</span>
                    <span className={`mv${i === order.length - 1 ? " off" : ""}`} title="move down" onClick={() => mv(k, 1)}>↓</span></span>
                </div>
                {!fold[k] && <div className="bb">{body[k]}</div>}
              </div>
            ));
          })()}
        </div>
      )}
      {/* the level pills stick to the top while the page scrolls under them; picking one while they
          are stuck jumps to the start of that list, and scrolling back up brings the sections back */}
      <div className="lvmark" />
      {pills("lv")}
      {data && (data.notes || []).length > 0 && <div className="crmnote" title={data.notes.join("\n")}>
        <b>ClickUp gaps</b> {data.notes[0]}{data.notes.length > 1 ? ` (+${data.notes.length - 1} more, hover)` : ""}</div>}
      <div className={`${mailList} lst`} style={{ flex: "0 0 auto" }}>
        {tab === "people" && (
          <div className="ros">
            <input type="text" className="pq" placeholder={`Find someone (${roster.length} people)`} value={ui.pq || ""}
                   onInput={e => set({ pq: e.target.value, pl: "" })} />
            <div className="letters">{letters.map(l => <span key={l} className={ui.pl === l ? "on" : ""} onClick={() => set({ pl: ui.pl === l ? "" : l })}>{l}</span>)}</div>
          </div>
        )}
        {tab === "people" && roster.filter(r => !ui.pl || (r.n.replace(/^[^A-Za-z]+/, "")[0] || "#").toUpperCase() === ui.pl).map(r => row(personItem(r)))}
        {tab === "people" && roster.length === 0 && <div className="empty">{data && data.roster ? "Nobody matches." : "The Rolodex fills in on the next good CRM sync."}</div>}
        {t.level && rows.length === 0 && <div className="empty">{ui.day ? "Nothing at this level on that day." : "Nothing here in this view."}</div>}
        {t.level && rows.slice(0, propN).map(row)}
        {t.level && rows.length > propN && <div className="grph">From meetings and follow ups</div>}
        {t.level && rows.slice(propN).map(row)}
        {t.level && olderN > 0 && <div className="more" onClick={() => set({ older: !ui.older })}>{ui.older ? "hide older" : `show ${olderN} older (submitted long ago, paused)`}</div>}
        {tab === "campaigns" && <CrmCampaigns plus={plus && { ...plus, campaigns: (plus.campaigns || []).filter(c => co === "All" || c.company === co) }} copied={copied} dispatch={dispatch} />}
        {tab === "inbox" && replies.map(row)}
        {tab === "inbox" && nudges.length > 0 && <div className="ih"><span>Nudges waiting in your drafts · {nudges.length}</span></div>}
        {tab === "inbox" && nudges.map(n => (
          <div key={n.thread} className={`r${alerts["nudge:" + n.thread] ? " notify" : ""}`}>
            <div className="top"><span className="t"><span className="nt">{n.to}</span></span>
              <span className="k">nudge</span><span className="when">sent {n.sent ? crmWhen(n.sent).replace(" late", " ago") : ""}</span></div>
            <div className="meta">{n.subject}</div>
            <div className="acts"><span className="ok" onClick={() => openUrl(n.url)}>open the draft</span>
              <span title="sent it, or not needed: take it off the list" onClick={() => crmNudgeDone(n.thread, dispatch)}>done</span></div>
          </div>
        ))}
        {tab === "inbox" && (
          <div className="ih">
            <span>Your inbox{emails.filter(m => !m.practice).length ? ` · ${emails.filter(m => !m.practice).length} waiting` : ""}
              {emails.some(m => m.practice) ? ` · ${emails.filter(m => m.practice).length} practice` : ""}</span>
            <span className={refreshBtn} title="check Gmail again now" onClick={() => !mailSync && syncEmails(dispatch)}>{mailSync ? "checking…" : "check gmail"}</span>
          </div>
        )}
        {tab === "inbox" && inboxMail.length === 0 && <div className="empty">{mailSync ? "Checking Gmail…" : "Nothing waiting on you. Gmail is checked every 15 minutes."}</div>}
        {tab === "inbox" && inboxMail.map(m => <MailRow key={m.thread} m={m} mail={mail} tag={tagFor(m.from)} dispatch={dispatch} />)}
      </div>
      </div>
      </div>
    </div>
  );
};
// stuck = the in place pills have scrolled above the top; set on the DOM directly (no re-render)
function crmStick(sc) {
  const wrap = sc.parentElement, mk = sc.querySelector(".lvmark"), fl = wrap && wrap.querySelector(".lvfloat");
  if (!wrap || !mk) return;
  const stuck = mk.getBoundingClientRect().top - sc.getBoundingClientRect().top < 0;
  if ((wrap.dataset.stuck === "1") !== stuck) wrap.dataset.stuck = stuck ? "1" : "";
  if (fl && stuck) wrap.style.setProperty("--lvh", fl.offsetHeight + "px");
}
const crmCss = css`
  /* ── a listing as a page ── */
  .pgw { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; outline: none; margin-right: -10px; padding: 2px 10px 18px 0;
         animation: pgIn .28s cubic-bezier(.2,.85,.25,1) both; }
  @keyframes pgIn { from { opacity: 0; transform: translateX(14px); } to { opacity: 1; transform: none; } }
  .pgnav { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
  .pgnav .bk { display: inline-flex; align-items: center; gap: 6px; padding: 4px 11px 4px 8px; border-radius: 999px; cursor: pointer; font-size: 11px; font-weight: 700;
               color: ${GLASS.sub}; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); transition: background .15s, color .15s; }
  .pgnav .bk:hover { color: #fff; background: rgba(255,255,255,0.13); }
  .pgnav .bk svg { width: 10px; height: 10px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
  .pgnav .cr { font-size: 10px; font-weight: 800; letter-spacing: .8px; text-transform: uppercase; color: ${GLASS.label}; }
  .pghd { padding-bottom: 12px; border-bottom: 1px solid ${GLASS.hair}; }
  .pgk { display: flex; align-items: center; gap: 8px; font-size: 10px; font-weight: 800; letter-spacing: .8px; text-transform: uppercase; color: ${GLASS.sub}; }
  .pgk > i { width: 8px; height: 8px; border-radius: 50%; }
  .pgk .po { padding: 1px 7px; border-radius: 6px; background: rgba(255,255,255,0.08); letter-spacing: .3px; text-transform: none; font-size: 10.5px; }
  .pgk .pd { margin-left: auto; letter-spacing: .3px; text-transform: none; font-size: 11px; color: ${GLASS.sub}; }
  .pgk .pd.late { color: #FF5F5F; }
  .pgt { font-size: 19px; font-weight: 700; line-height: 1.25; letter-spacing: -0.2px; margin-top: 6px; }
  .pgm { font-size: 12px; color: ${GLASS.sub}; margin-top: 5px; line-height: 1.45; }
  .pgs { margin-top: 14px; }
  .pgdl { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
  .pgdl span { flex: 1 1 120px; padding: 6px 8px; border-radius: 9px; background: rgba(255,255,255,0.045); font-size: 10.5px; color: ${GLASS.label}; line-height: 1.3; }
  .pgdl span b { display: block; font-size: 12px; color: #fff; font-weight: 700; }
  .pgdl span.past { opacity: .55; }
  .r.inpage { padding: 0; background: none !important; }
  .r.inpage .card { margin-left: 0; font-size: 12.5px; }
  .gate.big { margin: 10px 0 8px; }
  .gate.big .rail { height: 6px; margin-bottom: 16px; }
  .gate.big .rail b { top: -2px; height: 10px; }
  .gate.big .rail b em { top: 12px; font-size: 9.5px; }
  .gate.big .rail .now { top: -3px; width: 12px; height: 12px; margin-left: -6px; }
  .gate.big .gm { font-size: 12px; margin-bottom: 16px; } .gate.big .gm i { width: 12px; height: 12px; }
  .cpo { display: flex; flex-direction: column; gap: 4px; }
  .cpr { padding: 7px 9px; border-radius: 10px; cursor: pointer; transition: background .15s; }
  .cpr:hover { background: rgba(255,255,255,0.06); }
  .cprt { display: flex; align-items: center; gap: 7px; font-size: 12px; }
  .cprt > i { flex: 0 0 auto; width: 7px; height: 7px; border-radius: 50%; }
  .cprt .nm { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .cprt .src { flex: 0 0 auto; font-size: 9px; font-weight: 800; letter-spacing: .4px; text-transform: uppercase; color: ${GLASS.label};
               padding: 0 5px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.14); }
  .cprt .src.own { color: #C9A8FF; border-color: rgba(201,168,255,0.4); }
  .cprt .gd { margin-left: auto; flex: 0 0 auto; font-size: 10.5px; color: ${GLASS.label}; }
  .cprt .gd.soon { color: #FF9CA0; } .cprt .gd.past { color: #FF5F5F; }
  .cprb { display: flex; align-items: center; gap: 10px; margin-top: 6px; padding-left: 14px; }
  .cprb .cpb { flex: 1; margin-top: 0; height: 5px; }
  .cprn { flex: 0 0 auto; font-size: 10.5px; color: ${GLASS.label}; } .cprn b { color: #fff; }
  .cpb .tk { display: block; height: 100%; min-width: 0; border-radius: inherit; background: linear-gradient(90deg, #4CB4FF, #8FD8FF);
             box-shadow: 0 0 8px rgba(76,180,255,0.45); transition: width .6s cubic-bezier(.2,.8,.2,1); }
  .cpbig { display: flex; align-items: center; gap: 12px; } .cpbig .cpb { flex: 1; height: 8px; margin-top: 0; border-radius: 4px; }
  .cst .sh { display: flex; align-items: center; gap: 6px; } .cst .sh i { width: 8px; height: 8px; border-radius: 2px; display: inline-block; }
  .cst .tg { grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr) auto auto; }
  .tg .st2 { font-size: 10px; color: ${GLASS.label}; white-space: nowrap; }
  .tg .tf em { font-style: normal; font-size: 10px; font-weight: 700; }
  .tg .lg.on { opacity: .55; } .tg:hover .lg.on { opacity: 1; }
  .tg.off { opacity: .55; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); }
  .cprt .tpc { flex: 0 0 auto; font-size: 9.5px; font-weight: 800; padding: 1px 6px; border-radius: 5px; color: #FF7AB6; border: 1px solid rgba(255,122,182,0.45); }
  .cprt .tpc.w-open { background: rgba(255,122,182,0.14); box-shadow: 0 0 10px rgba(255,122,182,0.25); }
  .cprt .tpc.w-closed { color: ${GLASS.label}; border-color: rgba(255,255,255,0.14); }
  .tpb { padding: 10px 11px; border-radius: 12px; border: 1px solid rgba(255,122,182,0.35); background: rgba(255,122,182,0.06); }
  .tpb.w-closed { border-color: rgba(255,255,255,0.12); background: rgba(255,255,255,0.03); }
  .tpb.w-unknown { border-color: rgba(245,212,107,0.4); background: rgba(245,212,107,0.05); }
  .tpb .sh { display: flex; align-items: center; gap: 6px; } .tpb .sh i { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
  .tpb .tpo { font-weight: 700; letter-spacing: 0; text-transform: none; }
  .tpb .tpr { font-size: 11.5px; color: rgba(255,255,255,0.8); margin: 2px 0 8px; line-height: 1.45; }
  .why.pb-campaign { white-space: nowrap; }
  /* ── playbook layer ── */
  .why.pb-gate { color: #FF9CA0; border-color: rgba(255,156,160,0.45); background: rgba(255,156,160,0.08); }
  .why.pb-debrief { color: ${ACCENT.heads}; border-color: rgba(245,212,107,0.45); background: rgba(245,212,107,0.08); }
  .why.pb-campaign { color: #C9A8FF; border-color: rgba(201,168,255,0.45); background: rgba(201,168,255,0.08); }
  .gate { display: flex; align-items: center; gap: 12px; margin: 7px 0 2px 15px; }
  .gate .nd { font-size: 10.5px; color: ${GLASS.label}; }
  .gate .rail { position: relative; flex: 1; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.1); margin: 0 4px 12px; }
  .gate .rail .fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 2px; background: linear-gradient(90deg, rgba(203,211,222,0.25), rgba(203,211,222,0.7)); }
  .gate .rail b { position: absolute; top: -2px; width: 2px; height: 8px; margin-left: -1px; border-radius: 1px; background: rgba(255,255,255,0.25); }
  .gate .rail b.hit { background: rgba(255,255,255,0.7); }
  .gate .rail b em { position: absolute; top: 9px; left: 50%; transform: translateX(-50%); font-style: normal; font-size: 8.5px; color: ${GLASS.label}; white-space: nowrap; }
  .gate .rail .now { position: absolute; top: -3px; width: 10px; height: 10px; margin-left: -5px; border-radius: 50%; background: #fff; box-shadow: 0 0 0 3px rgba(255,255,255,0.18); }
  .gm { display: inline-flex; align-items: center; gap: 3px; font-size: 10.5px; font-weight: 800; color: ${GLASS.sub}; margin-bottom: 12px; }
  .gm i { width: 9px; height: 9px; border-radius: 3px; background: rgba(255,255,255,0.12); }
  .gm i.on { background: #5ED3A1; }
  .gm span { margin-left: 4px; }
  .gm.ok span { color: #5ED3A1; } .gm.short span { color: #FF9CA0; } .gm.late span { color: #FF5F5F; }
  .gm.late i:not(.on) { background: rgba(255,95,95,0.35); }
  .cmap .cg { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-top: 6px; }
  .cgc { padding: 7px 8px; border-radius: 9px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); min-width: 0; }
  .cgc.empty { border-style: dashed; }
  .cgh { display: flex; align-items: center; gap: 5px; font-size: 9px; font-weight: 800; letter-spacing: .6px; text-transform: uppercase; color: ${GLASS.sub}; margin-bottom: 4px; }
  .cgh i { width: 7px; height: 7px; border-radius: 50%; } .cgh b { margin-left: auto; color: #fff; }
  .cgn { font-size: 10.5px; color: ${GLASS.label}; }
  .cmap .cp { display: flex; align-items: center; gap: 5px; font-size: 11px; color: rgba(255,255,255,0.88); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; padding: 1px 0; }
  .cmap .cp:hover { color: #fff; }
  .cmap .cp i, .cgk i { flex: 0 0 auto; width: 7px; height: 7px; border-radius: 50%; background: rgba(255,255,255,0.18); display: inline-block; }
  .cmap .cp.talked i, .cgk i.talked { background: #5ED3A1; } .cmap .cp.contacted i, .cgk i.contacted { background: #64D2FF; }
  .cgo { font-size: 10.5px; color: ${GLASS.label}; margin-top: 6px; }
  .cgk { display: flex; gap: 12px; font-size: 10px; color: ${GLASS.label}; margin-top: 6px; } .cgk span { display: inline-flex; align-items: center; gap: 4px; }
  .wk { padding: 2px 2px 4px; }
  .wkr { display: flex; align-items: baseline; gap: 8px; }
  .wkn { font-size: 26px; font-weight: 800; line-height: 1; } .wkg { font-size: 12px; color: ${GLASS.sub}; } .wkc { margin-left: auto; font-size: 11px; color: ${GLASS.label}; }
  .wkb { height: 5px; border-radius: 3px; background: rgba(255,255,255,0.1); margin-top: 7px; overflow: hidden; }
  .wkb i { display: block; height: 100%; border-radius: 3px; background: linear-gradient(90deg, #5ED3A1, #8FD8FF); transition: width .6s cubic-bezier(.2,.8,.2,1); }
  .wkt { display: flex; gap: 6px; margin-top: 9px; flex-wrap: wrap; }
  .wkt span { flex: 1 1 0; min-width: 64px; padding: 6px 8px; border-radius: 9px; background: rgba(255,255,255,0.05); font-size: 10px; color: ${GLASS.label}; }
  .wkt b { display: block; font-size: 15px; color: #fff; font-weight: 800; }
  .wkt span.bad b { color: #FF5F5F; }
  .wkx { margin-top: 6px; text-align: right; }
  .lk2 { font-size: 10.5px; font-weight: 700; color: ${ACCENT.link}; cursor: pointer; } .lk2:hover { color: #fff; }
  .dbs .db { padding: 9px 10px; border-radius: 11px; background: rgba(255,255,255,0.045); border: 1px solid rgba(255,255,255,0.08); margin-bottom: 8px; }
  .dbs .db.cust { border-color: rgba(245,212,107,0.4); }
  .dbh { display: flex; gap: 8px; align-items: baseline; } .dbh b { font-size: 12.5px; } .dbh span { margin-left: auto; font-size: 10.5px; color: ${GLASS.label}; white-space: nowrap; }
  .dbp { display: flex; flex-wrap: wrap; gap: 4px 10px; margin-top: 5px; font-size: 11px; color: ${GLASS.sub}; }
  .dbp span { display: inline-flex; align-items: center; gap: 4px; } .dbp i { width: 6px; height: 6px; border-radius: 50%; }
  .dbf { display: grid; gap: 5px; margin-top: 8px; }
  .dbf input { width: 100%; box-sizing: border-box; padding: 6px 9px; border-radius: 8px; font: inherit; font-size: 12px; color: #fff; outline: none;
               background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); }
  .dbf input:focus { border-color: rgba(245,212,107,0.6); }
  .dbs .bts { margin-top: 8px; }
  .dbk { font-size: 10.5px; color: ${GLASS.label}; margin-top: 4px; }
  .cp1 { margin-bottom: 6px; }
  .cph { display: flex; gap: 10px; align-items: baseline; } .cph b { font-size: 12.5px; } .cph span { font-size: 10.5px; color: ${GLASS.label}; } .cph .lk2 { margin-left: auto; }
  .cpg { font-size: 11px; color: ${GLASS.sub}; margin-top: 3px; }
  .cpb { display: flex; height: 6px; border-radius: 3px; overflow: hidden; background: rgba(255,255,255,0.08); margin-top: 8px; }
  .cpb i { height: 100%; transition: width .5s; }
  .s-found i, .cpb .s-found { background: rgba(255,255,255,0.22); } .s-contacted i, .cpb .s-contacted { background: #64D2FF; }
  .s-replied i, .cpb .s-replied { background: #C9A8FF; } .s-met i, .cpb .s-met { background: #5ED3A1; } .s-letter i, .cpb .s-letter { background: ${ACCENT.heads}; }
  .cpk { display: flex; gap: 10px; flex-wrap: wrap; font-size: 10px; color: ${GLASS.label}; margin-top: 5px; }
  .cpk span { display: inline-flex; align-items: center; gap: 4px; } .cpk i { width: 7px; height: 7px; border-radius: 2px; display: inline-block; }
  .cpt { margin-top: 8px; display: flex; flex-direction: column; }
  .tg { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1.4fr) auto auto; gap: 8px; align-items: center; padding: 4px 6px; border-radius: 7px; font-size: 11.5px; }
  .tg:hover { background: rgba(255,255,255,0.05); }
  .tg .tn { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; }
  .tg .tf { color: ${GLASS.label}; font-size: 10.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tg .st { font-size: 9.5px; font-weight: 800; letter-spacing: .4px; text-transform: uppercase; padding: 1px 6px; border-radius: 5px; background: rgba(255,255,255,0.07); color: ${GLASS.sub}; white-space: nowrap; }
  .tg .st.s-contacted { color: #64D2FF; } .tg .st.s-replied { color: #C9A8FF; } .tg .st.s-met { color: #5ED3A1; } .tg .st.s-letter { color: ${ACCENT.heads}; }
  .tg .lg { display: flex; gap: 3px; opacity: 0; transition: opacity .15s; } .tg:hover .lg { opacity: 1; }
  .tg .lg span { font-size: 9.5px; font-weight: 700; padding: 2px 6px; border-radius: 5px; cursor: pointer; color: ${GLASS.sub}; background: rgba(255,255,255,0.07); }
  .tg .lg span:hover { color: #fff; background: rgba(255,255,255,0.15); }
  .tg .lg em { font-style: normal; font-size: 10px; color: #5ED3A1; font-weight: 700; }
  .tabs .tab { display: inline-flex; align-items: center; gap: 4px; }
  .cd { display: inline-block; width: 6px; height: 6px; border-radius: 50%; }
  .nb { color: ${ACCENT.notify}; font-weight: 800; }
  .v.bad { color: #FF5F5F; }
  .empty { font-size: 12px; color: ${GLASS.label}; padding: 8px; }
  .grph { font-size: 9.5px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: ${GLASS.label};
          margin: 16px 2px 6px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.08); }
  .dim { color: ${GLASS.label}; }
  .top2 { flex: 0 0 auto; }
  .sec { display: flex; align-items: baseline; gap: 10px; font-size: 9px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;
         color: ${GLASS.label}; margin: 2px 0 5px; cursor: pointer; user-select: none; }
  .five5 { margin-left: auto; letter-spacing: .5px; padding: 1px 7px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.18); }
  .five5:hover, .five5.on { color: #fff; border-color: ${ACCENT.cal}; }
  .askb { margin: -2px 0 8px; }
  .askb input { width: 100%; box-sizing: border-box; padding: 6px 9px; border-radius: 8px; font: inherit; font-size: 12px; color: #fff;
                background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.14); outline: 0; }
  .ans { margin-top: 6px; padding: 7px 9px; border-radius: 8px; background: rgba(255,255,255,0.05); font-size: 11.5px; line-height: 1.45; }
  .ans .aq { color: ${GLASS.label}; font-size: 10.5px; margin-bottom: 3px; }
  .ans .aa { white-space: pre-wrap; max-height: 160px; overflow: auto; }
  .cal { display: flex; gap: 12px; margin-bottom: 8px; }
  .grid { display: grid; grid-template-columns: repeat(7, 26px); grid-auto-rows: 22px; gap: 2px; flex: 0 0 auto; }
  .dh { font-size: 8.5px; font-weight: 800; color: ${GLASS.label}; text-align: center; line-height: 14px; height: 14px; }
  .c { position: relative; border-radius: 5px; background: rgba(255,255,255,0.04); cursor: pointer; }
  .c:hover { background: rgba(255,255,255,0.12); }
  .c.past { opacity: .45; }
  .c.today { box-shadow: inset 0 0 0 1px ${ACCENT.now}; }
  .c.sel { background: rgba(255,255,255,0.22); }
  .c.tp { box-shadow: inset 0 0 0 1px ${CRM_TPOC}; }
  .c.dl .n { color: #fff; font-weight: 800; }
  .c .n { position: absolute; top: 1px; left: 3px; font-size: 8.5px; color: ${GLASS.sub}; white-space: nowrap; }
  .c .ds { position: absolute; bottom: 2px; left: 3px; display: flex; gap: 2px; }
  .c .ds i { width: 4px; height: 4px; border-radius: 50%; }
  .ag { flex: 1; min-width: 0; }
  .agh { display: flex; justify-content: space-between; font-size: 9px; font-weight: 800; letter-spacing: .6px;
         text-transform: uppercase; color: ${GLASS.label}; margin-bottom: 4px; }
  .agh .tg { cursor: pointer; } .agh .tg:hover { color: #fff; }
  .ai { display: flex; align-items: baseline; gap: 6px; font-size: 11.5px; line-height: 1.5; cursor: pointer;
        white-space: nowrap; overflow: hidden; border-radius: 6px; padding: 0 4px; }
  .ai:hover { background: rgba(255,255,255,0.07); }
  .ai.nw .l { color: ${ACCENT.notify}; }
  .ai i { flex: 0 0 6px; height: 6px; border-radius: 50%; align-self: center; }
  .ai .d { color: ${GLASS.label}; font-size: 10px; flex: 0 0 auto; }
  .ai .o { color: ${GLASS.label}; font-size: 9.5px; flex: 0 0 auto; }
  .ai .l { overflow: hidden; text-overflow: ellipsis; }
  .ai.tpoc .l, .ai.opens .l { color: ${CRM_TPOC}; }
  .ai.deadline .l { color: #fff; font-weight: 600; }
  .dn { margin-bottom: 6px; }
  .dn .ai .o { margin-left: auto; }
  .dn .nn, .five .nn { color: ${GLASS.label}; font-size: 10px; font-weight: 800; flex: 0 0 10px; }
  .five { margin-bottom: 6px; }
  .fv { padding: 5px 4px 6px; border-bottom: 1px solid ${GLASS.hair}; font-size: 11.5px; line-height: 1.45; }
  .fv .ft { display: flex; align-items: baseline; gap: 6px; }
  .fv .ft i { flex: 0 0 6px; height: 6px; border-radius: 50%; align-self: center; }
  .fv .ft .l { font-weight: 700; color: #fff; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fv .ft .d { margin-left: auto; color: ${GLASS.label}; font-size: 10px; }
  .fv .sgb { margin: 3px 0 0 16px; white-space: pre-wrap; }
  .fv .ln { margin-left: 16px; }
  .fv .acts { margin-left: 16px; }
  .fhint { font-size: 11px; color: ${GLASS.label}; line-height: 1.4; margin: 0 0 4px; }
  .fhint b { color: rgba(255,255,255,0.85); font-weight: 600; } .fhint .fp { color: ${ACCENT.cpu}; font-weight: 700; margin-left: 4px; }
  .fv { padding: 8px 4px 10px; }
  .fv .ft .d.late { color: #FF5F5F; font-weight: 700; }
  .fv .fm { margin: 1px 0 0 16px; font-size: 10.5px; color: ${GLASS.label}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .fv .fb { margin: 6px 0 0 16px; display: flex; flex-direction: column; gap: 3px; }
  .fv .fb .ln { margin-left: 0; color: rgba(255,255,255,0.86); }
  .fv .fb .ln b { font-size: 8.5px; font-weight: 800; letter-spacing: .8px; text-transform: uppercase; color: ${GLASS.label}; margin-right: 6px; }
  .fv .fb .warn { color: ${ACCENT.heads}; font-size: 11px; padding-left: 8px; border-left: 2px solid rgba(245,212,107,0.55); }
  .fv .fb .sgb { margin: 3px 0 0; padding: 7px 9px; border-left: 2px solid rgba(255,255,255,0.18); background: rgba(255,255,255,0.04); border-radius: 0 6px 6px 0; }
  .fv .bts { margin: 7px 0 0 16px; }
  .fv .fl2 { margin: 6px 0 0 16px; }
  .fv .fe { margin: 6px 0 0 16px; font-size: 11px; color: #FF5F5F; display: flex; align-items: center; gap: 8px; }
  .fv.sent .ft .l { color: ${GLASS.sub}; } .fv.sent .ft .nn { color: ${ACCENT.cpu}; }
  .fsk { font-size: 10.5px; color: ${GLASS.label}; padding: 6px 4px 0; cursor: pointer; } .fsk:hover { color: #fff; }
  .team { display: flex; flex-wrap: wrap; align-items: baseline; gap: 5px; margin: 0 0 6px; font-size: 10.5px; }
  .team .th { font-size: 9px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: ${GLASS.label}; margin-right: 2px; }
  .team .tm { padding: 1px 7px; border-radius: 999px; background: rgba(255,255,255,0.07); cursor: pointer; }
  .team .tm:hover, .team .tm.on { background: rgba(255,255,255,0.18); }
  .team .tm b { font-weight: 800; } .team .tm em { font-style: normal; color: #FF5F5F; }
  .team .ov { color: #FF9CA0; }
  /* the top sections: plain headings with air between them, no boxes. The grip and arrows only show
     on hover; a section being dragged just dims a little. */
  .secs { display: flex; flex-direction: column; gap: 14px; margin-bottom: 14px; }
  .blk2 { transition: opacity .15s; }
  .blk2.lift { opacity: .55; }
  .blk2 .bh { display: flex; align-items: center; gap: 6px; min-height: 16px; margin-left: -12px; }
  .blk2 .grip { display: grid; grid-template-columns: repeat(2, 2px); gap: 2px; padding: 2px 1px; cursor: grab; opacity: 0; transition: opacity .15s; }
  .blk2 .grip i { width: 2px; height: 2px; border-radius: 50%; background: #fff; }
  .blk2:hover .grip { opacity: .5; } .blk2.lift .grip { cursor: grabbing; opacity: .9; }
  .blk2 .bn2 { font-size: 9px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: ${GLASS.label}; cursor: pointer; user-select: none; }
  .blk2 .bn2:hover { color: #fff; }
  .blk2 .bn2 .ch { margin-left: 2px; }
  .blk2 .sum { font-size: 10.5px; color: ${GLASS.label}; }
  .blk2 .bx { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; }
  .blk2 .bx .five5 { margin-left: 0; font-size: 9px; font-weight: 800; letter-spacing: .5px; text-transform: uppercase; color: ${GLASS.label}; cursor: pointer; }
  .blk2 .mv { font-size: 10px; color: ${GLASS.label}; cursor: pointer; opacity: 0; padding: 0 2px; transition: opacity .15s; }
  .blk2:hover .mv { opacity: .8; } .blk2 .mv:hover { color: #fff; } .blk2 .mv.off { visibility: hidden; }
  .blk2 .bb { margin-top: 5px; }
  .blk2 .bb .dn, .blk2 .bb .team, .blk2 .bb .cal, .blk2 .bb .five { margin-bottom: 0; }
  .lvmark { height: 0; }
  .lv { padding-top: 10px; border-top: 1px solid ${GLASS.hair}; }
  .lv.lvtop { padding: 0 0 8px; margin: 0 0 8px; border-top: 0; border-bottom: 1px solid ${GLASS.hair}; }
  .lvfloat { position: absolute; top: 0; left: 0; right: 0; z-index: 5; margin: 0 !important; padding: 0 0 6px; border-top: 0;
             opacity: 0; pointer-events: none; transition: opacity .12s; }
  .crmwrap[data-stuck="1"] .lvfloat { opacity: 1; pointer-events: auto; }
  .crmwrap[data-stuck="1"] .crmscroll {
    -webkit-mask-image: linear-gradient(to bottom, transparent 0, transparent var(--lvh, 30px), #000 calc(var(--lvh, 30px) + 14px));
            mask-image: linear-gradient(to bottom, transparent 0, transparent var(--lvh, 30px), #000 calc(var(--lvh, 30px) + 14px)); }
  .crmnote b { font-weight: 700; color: #FF9CA0; margin-right: 4px; }
  .crmnote { font-size: 10.5px; color: ${GLASS.label}; margin: 0 0 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lv { display: flex; gap: 4px; flex-wrap: wrap; margin: 2px 0 6px; flex: 0 0 auto; }
  .lv span { padding: 3px 9px; border-radius: 8px; cursor: pointer; font-size: 9.5px; font-weight: 800; letter-spacing: .6px;
             text-transform: uppercase; color: ${GLASS.label}; background: rgba(255,255,255,0.06); user-select: none; }
  .lv span b { font-weight: 800; color: ${GLASS.sub}; margin-left: 2px; }
  .lv span:hover { color: #fff; } .lv span.on { background: rgba(255,255,255,0.18); color: #fff; }
  .lv .dayf { margin-left: auto; background: transparent; border: 1px dashed rgba(255,255,255,0.25); text-transform: none; }
  .lv .dayf + .dayf { margin-left: 0; }
  .r { padding: 7px 8px 6px; border-radius: 9px; }
  .r:hover, .r.on { background: rgba(255,255,255,0.06); }
  .r .top { display: flex; gap: 7px; align-items: baseline; font-size: 12px; cursor: pointer; }
  .r .dot { flex: 0 0 7px; width: 7px; height: 7px; border-radius: 50%; align-self: center; }
  .r .t { font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .r .k { flex: 0 0 auto; font-size: 8.5px; font-weight: 800; letter-spacing: .5px; text-transform: uppercase; color: ${GLASS.label};
          border: 1px solid rgba(255,255,255,0.18); border-radius: 5px; padding: 0 4px; }
  .r .k.result { color: #FF5F5F; border-color: rgba(255,95,95,0.5); }
  .r .k.reply, .r .k.email { color: ${ACCENT.reply}; border-color: rgba(100,210,255,0.55); background: rgba(100,210,255,0.1); }
  .r .k.hot { color: #FF6961; border-color: rgba(255,105,97,0.5); }
  .r .k.cooling { color: #64D2FF; border-color: rgba(100,210,255,0.5); }
  .r .k.new { color: ${ACCENT.notify}; border-color: rgba(201,168,255,0.5); }
  .r .own { flex: 0 0 auto; font-size: 9.5px; color: ${GLASS.sub}; padding: 0 5px; border-radius: 5px; background: rgba(255,255,255,0.07); }
  .r .own.two { color: #FF9CA0; }
  .r .when { margin-left: auto; flex: 0 0 auto; font-size: 10px; color: ${GLASS.label}; white-space: nowrap; }
  .r .when.late { color: #FF5F5F; font-weight: 700; }
  .r .meta { font-size: 11px; color: ${GLASS.sub}; margin: 2px 0 0 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  /* news on a row: a wide violet sheen slides across the letters, left to right, and wraps back to
     the start without a seam (the gradient tile repeats). The
     gradient is clipped to the text and nothing else is drawn (no filter, no shadow), so there is
     no box and the text never changes size. */
  @keyframes crmSweep { from { background-position: 0% 0; } to { background-position: -200% 0; } }
  .r.notify .t .nt { background-image: linear-gradient(90deg, #fff 0%, #fff 18%, ${ACCENT.notify} 38%, #E9DDFF 50%, ${ACCENT.notify} 62%, #fff 82%, #fff 100%);
                     background-size: 200% 100%; background-repeat: repeat-x;
                     -webkit-background-clip: text; background-clip: text; -webkit-box-decoration-break: clone;
                     -webkit-text-fill-color: transparent; color: transparent;
                     animation: crmSweep 6s linear infinite; }
  .news { margin: 6px 0 2px 14px; padding: 6px 9px; border-radius: 8px; font-size: 11px; line-height: 1.45;
          background: rgba(201,168,255,0.08); border: 1px solid rgba(201,168,255,0.28); color: rgba(255,255,255,0.88); }
  .news .src { font-weight: 700; color: ${ACCENT.notify}; margin-right: 6px; }
  .news .nx { color: ${GLASS.sub}; margin-top: 2px; }
  .news .acts { justify-content: flex-end; margin-top: 3px; }
  .card { margin: 6px 0 0 14px; font-size: 11.5px; line-height: 1.45; }
  /* an open card ends with breathing room before the next row */
  .r.on { padding-bottom: 14px; margin-bottom: 8px; }
  /* the card loader, in the item's company color (lc1 MSBAI blue, lc2 Tam Fortis green, lc3 Nexcavate
     amber, lc0 silver). Violet stays reserved for news. */
  @keyframes crmBar { from { left: -45%; } to { left: 100%; } }
  @keyframes crmDot { 0%, 100% { opacity: .15; } 40% { opacity: 1; } }
  @keyframes crmSrcDot { 0%, 30%, 100% { transform: scale(.6); opacity: .4; } 8% { transform: scale(1.25); opacity: 1; } 22% { transform: scale(1); opacity: 1; } }
  .load { padding: 2px 0 1px; }
  .load .lt { font-size: 11.5px; font-weight: 600; white-space: nowrap; }
  .load .lw { background-size: 200% 100%; background-repeat: repeat-x;
              -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent;
              animation: crmSweep 2.6s linear infinite; }
  .load .dots i { font-style: normal; animation: crmDot 1.2s ease-in-out infinite; }
  .load .dots i:nth-child(2) { animation-delay: .2s; } .load .dots i:nth-child(3) { animation-delay: .4s; }
  .load .bar { position: relative; height: 2px; margin: 6px 0 7px; border-radius: 2px; overflow: hidden; background: rgba(255,255,255,0.08); }
  .load .bar i { position: absolute; top: 0; bottom: 0; left: -45%; width: 45%; border-radius: 2px;
                 animation: crmBar 1.7s cubic-bezier(.45,0,.25,1) infinite; }
  .load .srcs { display: flex; flex-wrap: wrap; gap: 5px; }
  .load .srcs span { display: inline-flex; align-items: center; gap: 4px; font-size: 9.5px; padding: 1px 6px 1px 5px; border-radius: 5px;
                     border: 1px solid rgba(255,255,255,0.08); color: ${GLASS.label}; background: rgba(255,255,255,0.04);
                     animation-duration: 6s; animation-timing-function: linear; animation-iteration-count: infinite; }
  .load .srcs b { width: 5px; height: 5px; border-radius: 50%; transform: scale(.6); opacity: .4;
                  animation: crmSrcDot 6s linear infinite; animation-delay: inherit; }
  .load.sm .lt { font-size: 11px; font-weight: 500; } .load.sm .bar { margin: 4px 0 2px; max-width: 180px; }
${["#CBD3DE", ...Object.values(CRM_CO_DOT)].map((hex, n) => {
    const rgb = [1, 3, 5].map(k => parseInt(hex.slice(k, k + 2), 16)).join(",");
    return `  @keyframes crmSrc${n} { 0%, 30%, 100% { color: ${GLASS.label}; background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.08); }
                        5%, 22% { color: #fff; background: rgba(${rgb},0.16); border-color: rgba(${rgb},0.55); } }
  .load.lc${n} .lw { background-image: linear-gradient(90deg, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0.75) 18%, ${hex} 38%, #fff 50%, ${hex} 62%, rgba(255,255,255,0.75) 82%, rgba(255,255,255,0.75) 100%); }
  .load.lc${n} .dots i { color: ${hex}; }
  .load.lc${n} .bar i { background: linear-gradient(90deg, rgba(${rgb},0), ${hex} 45%, #fff 55%, rgba(${rgb},0)); }
  .load.lc${n} .srcs span { animation-name: crmSrc${n}; }
  .load.lc${n} .srcs b { background: ${hex}; }`; }).join("\n")}
  /* Do now: a small tag says what is new on a line (instead of turning the line violet) */
  .ai .why { flex: 0 0 auto; font-size: 9px; font-weight: 700; padding: 0 6px; border-radius: 5px; line-height: 15px;
             color: rgba(255,255,255,0.85); background: rgba(255,255,255,0.09); border: 1px solid rgba(255,255,255,0.14); }
  .ai .why.w-late { color: #FF5F5F; border-color: rgba(255,95,95,0.45); background: rgba(255,95,95,0.1); }
  .ai .why.w-mail { color: #64D2FF; border-color: rgba(100,210,255,0.4); background: rgba(100,210,255,0.08); }
  .ai .why.w-reply { color: ${ACCENT.reply}; border-color: rgba(100,210,255,0.5); background: rgba(100,210,255,0.1); }
  .ai .why.w-tpoc { color: ${CRM_TPOC}; border-color: rgba(255,122,182,0.45); background: rgba(255,122,182,0.08); }
  /* the action panel at the bottom of a card: Update the CRM, then Reach out */
  .ap { margin-top: 12px; padding: 9px 10px 8px; border-radius: 10px; background: rgba(255,255,255,0.045); border: 1px solid ${GLASS.hair}; }
  .apg + .apg { margin-top: 9px; padding-top: 9px; border-top: 1px solid ${GLASS.hair}; }
  .ah { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
  .ah .an { font-size: 8.5px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: rgba(255,255,255,0.75); }
  .ah .as { font-size: 9.5px; color: ${GLASS.label}; white-space: nowrap; }
  .bts { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
  .bts .dact { display: contents; }
  .bts .dnote { flex: 1 1 200px; width: auto; }
  .bt { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px 3px 7px; border-radius: 7px; cursor: pointer; user-select: none;
        font-size: 10.5px; font-weight: 600; letter-spacing: 0; text-transform: none; white-space: nowrap; color: rgba(255,255,255,0.88);
        background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.13); }
  .bt i { font-style: normal; font-size: 10px; width: 10px; text-align: center; color: ${GLASS.label}; }
  .bt:hover { background: rgba(255,255,255,0.16); color: #fff; } .bt:hover i { color: #fff; }
  .bt.on { background: rgba(255,255,255,0.2); border-color: rgba(255,255,255,0.32); color: #fff; } .bt.on i { color: #fff; }
  .bt.go { background: rgba(52,199,89,0.16); border-color: rgba(52,199,89,0.5); color: #fff; } .bt.go i { color: ${ACCENT.cpu}; }
  .bt.go:hover { background: rgba(52,199,89,0.28); }
  .bt.st { cursor: default; color: ${GLASS.sub}; }
  .bt.sm { padding: 2px 9px; font-size: 10px; }
  .bts .bad { font-size: 10px; color: #FF5F5F; }
  .hns { margin-top: 5px; font-size: 10.5px; line-height: 1.35; color: ${GLASS.label}; min-height: 14px; }
  .hn { display: none; } .hn.h0 { display: block; }
  .apg:has(.bt:hover) .hn.h0 { display: none; }
${["done", "cancel", "fu", "later", "note", "page", "draft", "change", "dready", "claude", "copy", "refresh"].map(k => `  .apg:has(.b-${k}:hover) .hn.h-${k} { display: block; }`).join("\n")}
  .ap .wf { margin-top: 7px; padding: 7px 8px; border-radius: 8px; background: rgba(0,0,0,0.2); gap: 6px; }
  .ap .wf .fl { font-size: 10.5px; color: ${GLASS.sub}; }
  .ap .wf .fr { display: flex; gap: 5px; align-items: center; }
  .ap .wf .fr .dnote { flex: 1; width: auto; }
  .ap .ob { margin-top: 7px; }
  .card .blk { margin-top: 8px; } .card .blk:first-child { margin-top: 2px; }
  .card .sh { font-size: 8.5px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: ${GLASS.label}; margin-bottom: 2px; }
  .card .sh.tog { cursor: pointer; user-select: none; } .card .sh.tog:hover { color: #fff; }
  .card .sh .cnt { font-weight: 600; letter-spacing: .3px; text-transform: none; margin-left: 4px; }
  .card .li { padding-left: 2px; }
  .card .cn { cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .card .cn:hover { color: #fff; }
  .card .cn i { font-style: normal; font-size: 8.5px; font-weight: 800; letter-spacing: .5px; text-transform: uppercase;
                color: ${GLASS.label}; margin-right: 6px; }
  .card .sgp { margin: 3px 0 0 2px; }
  .card .sk { font-size: 9px; font-weight: 700; color: ${GLASS.sub}; }
  .card .si { margin-left: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .card .acts.bar { display: flex; justify-content: space-between; margin-top: 10px; padding-top: 6px; border-top: 1px solid ${GLASS.hair}; }
  .card .acts.bar .pri, .card .acts.bar .sec2 { display: inline-flex; gap: 14px; align-items: baseline; }
  .ros { padding: 2px 4px 6px; }
  .pq { width: 100%; box-sizing: border-box; padding: 5px 9px; border-radius: 8px; font: inherit; font-size: 12px; color: #fff;
        background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.14); outline: 0; }
  .letters { display: flex; flex-wrap: wrap; gap: 2px; margin-top: 5px; }
  .letters span { font-size: 9.5px; font-weight: 800; color: ${GLASS.label}; padding: 1px 4px; border-radius: 4px; cursor: pointer; }
  .letters span:hover, .letters span.on { color: #fff; background: rgba(255,255,255,0.14); }
  .card .ln { margin-top: 3px; } .card b { color: #fff; font-weight: 700; margin-right: 4px; }
  .card .warn { margin-top: 4px; color: ${ACCENT.heads}; padding-left: 8px; border-left: 2px solid rgba(245,212,107,0.55); }
  .ppl { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
  .ppl .p { font-size: 10.5px; padding: 1px 7px; border-radius: 999px; background: rgba(255,255,255,0.08); cursor: pointer; }
  .ppl .p i { font-style: normal; color: ${GLASS.label}; font-size: 9.5px; }
  .ppl .p.tpoc { box-shadow: inset 0 0 0 1px ${CRM_TPOC}; }
  .ppl .p.locked { opacity: .45; text-decoration: line-through; }
  .tpa { margin-top: 6px; font-size: 11px; }
  .tpa .go { cursor: pointer; font-weight: 800; font-size: 10px; letter-spacing: .5px; text-transform: uppercase; color: ${CRM_TPOC};
             border: 1px solid ${CRM_TPOC}; border-radius: 6px; padding: 1px 7px; }
  .tpa .ok { color: ${ACCENT.cpu}; } .tpa .bad { color: #FF5F5F; }
  .dact { display: inline-flex; gap: 14px; align-items: baseline; }
  .dnote { width: 230px; box-sizing: border-box; padding: 3px 7px; border-radius: 7px; font: inherit; font-size: 11px; color: #fff;
           text-transform: none; letter-spacing: 0; font-weight: 500;
           background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.14); outline: 0; }
  .wr { margin-top: 8px; }
  .wr .acts { margin-top: 0; }
  .wf { margin-top: 5px; display: flex; flex-direction: column; gap: 5px; }
  .wf .dnote { width: 100%; }
  .chips { display: flex; gap: 4px; flex-wrap: wrap; }
  .chips span { font-size: 9.5px; padding: 1px 7px; border-radius: 999px; background: rgba(255,255,255,0.07); cursor: pointer; color: ${GLASS.sub}; }
  .chips span.on, .chips span:hover { background: rgba(255,255,255,0.2); color: #fff; }
  .ob { margin-top: 5px; font-size: 10.5px; color: ${GLASS.sub}; }
  .ob .o.ok { color: ${ACCENT.cpu}; } .ob .o.failed { color: #FF5F5F; }
  .cc { margin-top: 6px; padding-top: 5px; border-top: 1px solid rgba(255,255,255,0.08); }
  .lks { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 5px; }
  .lk { color: ${ACCENT.link}; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
  .crmtag { font-size: 9px; font-weight: 700; color: #FFD08A; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .more { font-size: 10px; font-weight: 800; letter-spacing: .5px; text-transform: uppercase; color: ${GLASS.label};
          cursor: pointer; padding: 8px; } .more:hover { color: #fff; }
  .ih { display: flex; justify-content: space-between; align-items: baseline; font-size: 9px; font-weight: 800; letter-spacing: 1px;
        text-transform: uppercase; color: ${GLASS.label}; margin: 8px 8px 2px; }
`;

// ── Priorities flow ──
const FLOWSH = `/bin/zsh "${CFG.folder}/desk-widget/flow.sh"`;
function buildFlow(dispatch) {
  dispatch({ type: "FLOW_STATUS", value: "queuing the last 3 weeks of meetings…" });
  run(`${FLOWSH} init 21`).then(out => dispatch({ type: "FLOW_STATUS", value: firstLine(out) || "started" }));
}
const shortDay = iso => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" }); };
function flowNodeMd(n, sById) {
  const names = (n.streams || []).map(id => (sById[id] || {}).name || id);
  return [
    `# ${n.title}`,
    `${shortDay(n.date)} · ${n.meetingTitle || ""} · streams: ${names.join(", ")}`,
    "", n.summary || "",
    (n.done || []).length ? "\n## Done\n" + n.done.map(x => `- ${x}`).join("\n") : "",
    (n.next || []).length ? "\n## Next\n" + n.next.map(x => `- ${x.who ? x.who + ": " : ""}${x.what}`).join("\n") : "",
    (n.said || []).length ? "\n## Who said what\n" + n.said.map(x => `- ${x.who}: ${x.what}`).join("\n") : "",
    (n.links || []).length ? "\n## Links\n" + n.links.map(l => `- [${l.kind}: ${l.label}](${l.url})`).join("\n") : "",
  ].filter(x => x !== "").join("\n");
}
function flowStreamMd(st, nodes) {
  const mine = nodes.filter(n => (n.streams || []).includes(st.id));
  return [
    `# Workstream: ${st.name}`,
    `${st.company || ""}${st.clickup ? ` · ClickUp: ${st.clickup}` : " · not in ClickUp yet"} · ${st.status || "active"}`,
    "", `- Where it stands: ${st.now || "not written"}`, `- Next: ${st.next || "not written"}`,
    "", "## How it got here",
    ...mine.map(n => `- ${shortDay(n.date)} ${n.title}: ${n.summary || ""}${(n.next || []).length ? ` Next: ${n.next.map(x => (x.who ? x.who + " " : "") + x.what).join("; ")}` : ""}`),
    "", "## Links",
    ...mine.flatMap(n => (n.links || []).map(l => `- [${l.kind}: ${l.label}](${l.url})`)),
  ].join("\n");
}
function copyText(md, dispatch, key) {
  run(`printf %s ${JSON.stringify(b64(md))} | base64 -d | pbcopy`).then(() => {
    dispatch({ type: "COPIED", value: key });
    setTimeout(() => dispatch({ type: "COPIED", value: "" }), 1800);
  });
}

const FLOW_ROW = 64;
// Laid out like the calendar: the date sits on the left the way hours do, the lanes run down the
// middle, and what happened reads on the right. Newest at the bottom; the view opens scrolled
// there, and scrolling up walks back through how the work branched. A lane starts where a meeting
// split it off (a curve from its parent), dots mark every meeting that moved it, a curve folds a
// merged stream into the one it joined, and a finished stream ends in a check.
// ───────────────────────── Wiki ─────────────────────────
// The company wiki, top down: pick a company, open its system map, drill into any part and back
// out. Every page has the same short format and is wired to where the work lives: its ClickUp
// workstream (live open tasks), the Workstreams tab, Slack channels, Drive folders, Gmail. Gaps
// and open questions become desk tasks in one click, and those sync to ClickUp like any other.
const WIKI_STATUS = {
  current: ["Current", "#5ED3A1"], check: ["Needs a check", "#F5C542"], conflict: ["Sources disagree", "#FF6B5A"],
  gap: ["Not written yet", "#9AA4B2"], stale: ["Out of date", "#FF9CA0"], open: ["Open", "#64D2FF"],
};
const WIKI_CHECK = { demo: ["Works now", "#5ED3A1"], spec: ["Designed", "#64D2FF"], partial: ["Partly", "#F5C542"],
                     later: ["Later", "#9AA4B2"], open: ["Open", "#FF9CA0"] };
const WIKI_KINDS = [["all", "All"], ["system", "Systems"], ["part", "Parts"], ["process", "How we work"],
                    ["past", "Past work"], ["decision", "Decisions"], ["glossary", "Glossary"]];
const WIKI_LINK = { msg: "rgba(255,255,255,0.55)", train: "#B48CFF", check: "#64D2FF", heat: "#FF5F5F",
                    cold: "#64D2FF", power: "#FFD60A" };
const WIKI_LINK_NAME = { msg: "messages", train: "trains agents", check: "rule checks", heat: "heat",
                         cold: "return loop", power: "electric power" };
const WIKI_SVC = { clickup: ["ClickUp", "#7B68EE", "C"], slack: ["Slack", "#E01E5A", "S"], drive: ["Drive", "#1FA463", "D"],
                   gmail: ["Gmail", "#EA4335", "M"], fireflies: ["Fireflies", "#B37FEB", "F"], web: ["Web", "#8E9AAF", "W"] };
const wikiKindName = { company: "Company", system: "System", part: "Part", service: "Service on GURU", tool: "Tool",
                       overview: "Overview", section: "Section", howto: "Runbook", process: "How we work", past: "Past work",
                       decision: "Decision", question: "Open question" };

const wikiChain = (pages, id) => {
  const out = []; let cur = pages[id], guard = 0;
  while (cur && guard++ < 12) { out.unshift(cur); cur = cur.parent && cur.parent !== "home" ? pages[cur.parent] : null; }
  return out;
};
const wikiMapFor = (wiki, id) => {
  const ch = wikiChain(wiki.pages || {}, id);
  for (let i = ch.length - 1; i >= 0; i--) if ((wiki.maps || {})[ch[i].id]) return ch[i].id;
  const pg = (wiki.pages || {})[id];
  const co = pg && (wiki.companies || []).find(c => c.id === pg.company);
  return co && pg.kind === "company" && (wiki.maps || {})[co.system] ? co.system : "";
};
const wikiSeen = (pg, as) => as === "all" || pg.company === as || pg.id === "glossary";
const wikiColor = (wiki, pg) => (((wiki.companies || []).find(c => c.id === (pg && pg.company))) || {}).color || "#CBD3DE";
const wikiNorm = x => String(x || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const wikiDay = d => (d ? shortDay(String(d).length <= 10 ? d + "T12:00:00" : d) : "");

// where a page lives: its own links, its evidence, its ClickUp lists, plus Gmail and Drive searches
function wikiLinks(wiki, pg, me) {
  const svcOf = u => /clickup\.com/.test(u) ? "clickup" : /slack\.com/.test(u) ? "slack"
    : /docs\.google|drive\.google/.test(u) ? "drive" : /fireflies\.ai/.test(u) ? "fireflies" : /mail\.google/.test(u) ? "gmail" : "web";
  const seen = new Set(), out = [];
  const add = (k, t, u) => { if (!u || seen.has(u)) return; seen.add(u); out.push({ k: k || svcOf(u), t, u }); };
  (pg.lists || []).forEach(id => { const l = (wiki.lists || {})[id]; if (l) add("clickup", `${l.name} list`, `https://app.clickup.com/20115771/v/li/${id}`); });
  (pg.links || []).forEach(l => add(l.k, l.t, l.u));
  (pg.sources || []).forEach(x => add("", x.t, x.u));
  const find = pg.find || pg.title;
  add("gmail", `Search Gmail for “${find}”`, `https://mail.google.com/mail/u/${encodeURIComponent((me && me.email) || "0")}/#search/${encodeURIComponent(find)}`);
  add("drive", `Search Drive for “${find}”`, `https://drive.google.com/drive/search?q=${encodeURIComponent(find)}`);
  return Object.keys(WIKI_SVC).map(k => [k, out.filter(o => o.k === k)]).filter(([, v]) => v.length);
}
// the workstreams a page belongs to, as the Workstreams tab knows them
function wikiStreams(wiki, flow, pg) {
  const names = new Set((pg.lists || []).map(id => wikiNorm(((wiki.lists || {})[id] || {}).name)).filter(Boolean));
  const folders = new Set(pg.folders || []);
  Object.values(wiki.lists || {}).forEach(l => { if (folders.has(l.folder)) names.add(wikiNorm(l.name)); });
  return ((flow && flow.streams) || []).filter(st => names.has(wikiNorm(st.clickup)) || names.has(wikiNorm(st.name)));
}
// live ClickUp tasks for a page (from wiki.sh), falling back to your own collab tasks
function wikiTasks(wiki, live, cuTasks, pg) {
  const lists = new Set(pg.lists || []), folders = new Set(pg.folders || []);
  const inPage = id => lists.has(id) || folders.has(((wiki.lists || {})[id] || {}).folder);
  if (live && (live.tasks || []).length) return { from: "live", items: live.tasks.filter(t => inPage(t.list)) };
  const names = new Set([...(pg.lists || [])].map(id => wikiNorm(((wiki.lists || {})[id] || {}).name)));
  return { from: "mine", items: (cuTasks || []).filter(t => names.has(wikiNorm(t.list)))
    .map(t => ({ id: t.id, list: "", status: t.status, who: t.who, due: t.due, tags: [], name: t.name })) };
}
// your open next steps from meetings, for the streams on a page, merged the same way as Workstreams
function wikiMine(flow, mine, me, streamIds) {
  if (!flow || !streamIds.length) return [];
  const its = (mine && mine.items) || {};
  const open = [];
  (flow.nodes || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).forEach(n => {
    if (!(n.streams || []).some(id => streamIds.includes(id))) return;
    (n.next || []).forEach((x, k) => {
      const st = (its[`${n.id}:${k}`] || {}).status || "open";
      if (st === "open" && isMe(x.who, me)) open.push({ n, x, k });
    });
  });
  return groupMine(open.reverse(), mine && mine.groups);
}
const wikiDeskTasks = (tasks, id) => (tasks || []).filter(t => !t.done && (t.notes || []).some(n => id ? n.includes(`wiki:${id} `) || n.endsWith(`wiki:${id}`) : /wiki:[a-z]/.test(n)));
function wikiTask(title, pg, dispatch) {
  const spec = { title: title.slice(0, 120), due: "", meta: "from the wiki", note: `wiki:${pg.id} · ${pg.title}` };
  run(`${CMD} task ${JSON.stringify(b64(JSON.stringify(spec)))}`).then(r => {
    flash(firstLine(r) === "ok" ? "Added to your desk tasks. It syncs to ClickUp like any other." : `task: ${firstLine(r) || "did not save"}`, dispatch, 5000);
  });
}

function wikiSearch(wiki, q, kind, as) {
  const words = q.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  if (!words.length) return { pages: [], terms: [] };
  const hits = [];
  Object.values(wiki.pages || {}).forEach(pg => {
    if (!wikiSeen(pg, as) || pg.id === "glossary") return;
    if (kind === "glossary") return;
    if (kind !== "all" && !(pg.kind === kind || (kind === "decision" && pg.kind === "question")
        || (kind === "system" && (pg.kind === "company" || pg.kind === "service")) || (kind === "process" && pg.kind === "howto"))) return;
    const title = pg.title.toLowerCase();
    const body = [pg.what, pg.fits, pg.current, pg.owner, (pg.terms || []).join(" "), (pg.questions || []).join(" "),
                  (pg.steps || []).join(" "), (pg.rules || []).join(" "), (pg.sources || []).map(x => x.t).join(" ")].join(" ").toLowerCase();
    let score = 0, all = true;
    words.forEach(w => { const t = title.includes(w), b = body.includes(w); if (!t && !b) all = false; score += (t ? 4 : 0) + (b ? 1 : 0); });
    if (score) hits.push({ pg, score: score + (all ? 6 : 0) });
  });
  const terms = (kind === "all" || kind === "glossary")
    ? (wiki.glossary || []).filter(g => words.every(w => (g.t + " " + g.d).toLowerCase().includes(w))) : [];
  return { pages: hits.sort((a, b) => b.score - a.score).slice(0, 14).map(h => h.pg), terms };
}

const WikiMap = ({ wiki, mapId, sel, mini, dispatch }) => {
  const m = (wiki.maps || {})[mapId];
  if (!m) return null;
  const pages = wiki.pages || {};
  const on = new Set(wikiChain(pages, sel).map(x => x.id));
  const color = wikiColor(wiki, pages[mapId]);
  const [W, H] = m.vb;
  const go = (id, x, y) => !mini && pages[id] && dispatch({ type: "WIKI_GO", value: id, origin: `${Math.round(x / W * 100)}% ${Math.round(y / H * 100)}%` });
  const cls = id => `nd${on.has(id) ? " on" : ""}${sel === id ? " sel" : ""}`;
  const fit = (txt, w, size) => Math.min(size, (w - 1.6) / (Math.max(...String(txt || "").split("\n").map(t => t.length), 1) * 0.58));
  const lines = (txt, x, y, size, k) => String(txt || "").split("\n").map((t, i, arr) => (
    <text key={k + i} x={x} y={y + (i - (arr.length - 1) / 2) * size * 1.18} fontSize={size} textAnchor="middle" dominantBaseline="central">{t}</text>));
  const kinds = [...new Set((m.links || []).map(l => l.k))];
  const els = [];
  (m.nodes || []).forEach((n, i) => {
    const st = { animationDelay: `${i * 35}ms` };
    if (n.shape === "frame") {
      els.push(<g key={n.id} className={cls(n.id) + " frame"} style={st} onClick={() => go(n.id, n.x + 10, n.y + 3)}>
        <rect x={n.x} y={n.y} width={n.w} height={n.h} rx="3" />
        {!mini && <text x={n.x + 2.5} y={n.y + 3.4} fontSize="2.3" className="fl">{n.label}</text>}</g>);
      return;
    }
    if (n.shape === "ring") {
      const drums = [...Array(8)].map((_, k) => {
        const a = (k / 8) * Math.PI * 2, rr = (n.r + n.r0) / 2;
        return <circle key={k} cx={n.cx + rr * Math.cos(a)} cy={n.cy + rr * Math.sin(a)} r={(n.r - n.r0) / 2 - 0.3} className="drum" />;
      });
      els.push(<g key={n.id} className={cls(n.id) + " ring"} style={st} onClick={() => go(n.id, n.cx, n.cy - n.r)}>
        <circle cx={n.cx} cy={n.cy} r={(n.r + n.r0) / 2} strokeWidth={n.r - n.r0} className="band" />
        {/* the eight drums sit evenly round the core, so their own box is centred on it: spinning
            about that box's centre keeps them in place at any zoom */}
        <g className="spin">{drums}</g>
        {!mini && lines(n.label, n.lx, n.ly, 2.3, "l")}</g>);
      return;
    }
    if (n.shape === "core") {
      const fuel = [], mod = [];
      for (let gx = -4; gx <= 4; gx++) for (let gy = -4; gy <= 4; gy++) {
        const x = n.cx + gx * 2.5, y = n.cy + gy * 2.5;
        if (Math.hypot(x - n.cx, y - n.cy) > n.r - 1.6) continue;
        ((gx + gy) % 2 === 0 ? fuel : mod).push(<circle key={`${gx}${gy}`} cx={x} cy={y} r={(gx + gy) % 2 === 0 ? 0.85 : 0.55} />);
      }
      els.push(<g key={n.id} className={cls(n.id) + " core"} style={st}>
        <circle cx={n.cx} cy={n.cy} r={n.r} className="body" onClick={() => go(n.id, n.cx, n.cy)} />
        <g className={`fuel${sel === "r-fuel" ? " sel" : ""}`} onClick={() => go("r-fuel", n.cx, n.cy)}>{fuel}</g>
        <g className={`mod${sel === "r-moderator" ? " sel" : ""}`} onClick={() => go("r-moderator", n.cx, n.cy)}>{mod}</g></g>);
      return;
    }
    if (n.shape === "pipes") {
      const ys = [0.2, 0.5, 0.8].map(f => n.y + n.h * f);
      els.push(<g key={n.id} className={cls(n.id) + " pipes"} style={st} onClick={() => go(n.id, n.x + n.w / 2, n.y)}>
        <rect x={n.x} y={n.y} width={n.w} height={n.h} className="hit" />
        {ys.map((y, k) => <path key={k} d={`M${n.x} ${y} q ${n.w / 4} -1.6 ${n.w / 2} 0 t ${n.w / 2} 0`} className="pipe" />)}
        {!mini && <text x={n.x + n.w / 2} y={n.y - 1.8} fontSize="2.1" textAnchor="middle">{n.label}</text>}</g>);
      return;
    }
    const pill = n.shape === "pill", strip = n.shape === "strip";
    const tall = n.tall;
    const lab = n.sub && !strip ? (tall ? n.y + n.h * 0.36 : n.y + n.h * 0.4) : n.y + n.h / 2;
    els.push(<g key={n.id} className={`${cls(n.id)}${n.group ? " grp" : ""}${pill ? " pill" : ""}${strip ? " strip" : ""}`} style={st}
                onClick={() => go(n.id, n.x + n.w / 2, n.y + n.h / 2)}>
      <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={pill ? n.h / 2 : strip ? 1.2 : 2} />
      {!mini && (n.group
        ? <text x={n.x + 2} y={n.y + 3} fontSize="2.2" className="gl">{n.label}</text>
        : lines(n.label, n.x + n.w / 2, lab, fit(n.label, n.w, pill || strip ? 2.1 : 2.6), "l"))}
      {!mini && n.sub && !n.group && <g className="sub">{lines(n.sub, n.x + n.w / 2, tall ? n.y + n.h * 0.7 : n.y + n.h * 0.74, fit(n.sub, n.w, 1.8), "s")}</g>}
      {sel === n.id && !mini && <rect key={"p" + sel} x={n.x} y={n.y} width={n.w} height={n.h} rx={pill ? n.h / 2 : 2} className="pulse" />}
    </g>);
  });
  const links = (m.links || []).map((l, i) => (
    <line key={"k" + i} x1={l.a[0]} y1={l.a[1]} x2={l.b[0]} y2={l.b[1]} className={`ln ${l.k}`} stroke={WIKI_LINK[l.k]} />));
  return (
    <div className={`map${mini ? " mini" : ""}`} style={{ "--c": color }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">{els}{links}</svg>
      {!mini && <div className="legend">{kinds.map(k => <span key={k}><i style={{ background: WIKI_LINK[k] }} />{WIKI_LINK_NAME[k]}</span>)}
        <span className="hint">Click any part to open its page</span></div>}
    </div>
  );
};

const WikiSvc = ({ k }) => { const s = WIKI_SVC[k] || WIKI_SVC.web; return <span className="svc" style={{ background: s[1] }} title={s[0]}>{s[2]}</span>; };

const WikiWork = ({ wiki, pg, flow, mine, me, tasks, cuTasks, live, dispatch }) => {
  const streams = wikiStreams(wiki, flow, pg);
  const groups = wikiMine(flow, mine, me, streams.map(s => s.id));
  const tk = wikiTasks(wiki, live, cuTasks, pg);
  const isGoal = t => (t.tags || []).includes("goal");
  const goals = tk.items.filter(isGoal);
  const myName = wikiNorm(me && (me.full || me.name));
  const mineT = t => !!myName && wikiNorm(t.who).includes(myName);
  const open = tk.items.filter(t => !isGoal(t)).sort((a, b) => (mineT(b) ? 1 : 0) - (mineT(a) ? 1 : 0));
  const desk = wikiDeskTasks(tasks, pg.id);
  const firstList = (pg.lists || [])[0];
  if (!streams.length && !tk.items.length && !desk.length && !(pg.lists || []).length && !(pg.folders || []).length) return null;
  const row = t => (
    <div key={t.id} className="tk" onClick={() => openUrl(`https://app.clickup.com/t/${t.id}`)}>
      <i className={/progress|writing|pursuing/.test(wikiNorm(t.status)) ? "prog" : ""} />
      <span className={`tn${mineT(t) ? " me" : ""}`}>{t.name}</span>
      <span className="tw">{(t.who || "no owner").split(",")[0]}{t.due ? ` · ${wikiDay(t.due)}` : ""}</span>
    </div>);
  return (
    <div className="panel work">
      <div className="ph"><span>Work on it now</span>
        <span className="pv">{tk.from === "live" ? `live from ClickUp${live && live.updated ? `, ${wikiDay(live.updated)}` : ""}` : "your ClickUp tasks"}</span></div>
      {streams.map(st => (
        <div key={st.id} className="stream" onClick={() => { dispatch({ type: "FLOW_SEL", value: "s:" + st.id }); setView("priorities", dispatch); }}>
          <i style={{ background: st.color }} />
          <div className="sm"><div className="sn">{st.name}<span>{st.status}</span></div>
            {st.now && <div className="ss">{st.now}</div>}</div>
          <span className="go">Workstream {"→"}</span>
        </div>))}
      {groups.length > 0 && <div className="sub">
        <div className="sh gold">Waiting on you · {groups.length}</div>
        {groups.slice(0, 4).map(g => <div key={g.id} className="mi" onClick={() => { dispatch({ type: "FLOW_SEL", value: g.items[0].n.id }); setView("priorities", dispatch); }}>
          <span className="mt">{g.title}</span>{g.items.length > 1 ? <b>{"×"}{g.items.length}</b> : null}<span className="md">{wikiDay(g.last)}</span></div>)}
      </div>}
      {desk.length > 0 && <div className="sub">
        <div className="sh">On your desk</div>
        {desk.map(t => <div key={t.title} className="dk"><span className="box" title="check off" onClick={() => completeTask(t, dispatch)} /><span>{t.title}</span></div>)}
      </div>}
      {goals.length > 0 && <div className="sub"><div className="sh">Goals</div>{goals.slice(0, 4).map(row)}</div>}
      <div className="sub">
        <div className="sh">Open in ClickUp · {open.length}</div>
        {open.length === 0 && <div className="none">{tk.from === "live" ? "Nothing open in these lists." : "Nothing of yours here. The whole team's tasks show after the first ClickUp sync."}</div>}
        {open.slice(0, 6).map(row)}
        {open.length > 6 && firstList && <div className="more" onClick={() => openUrl(`https://app.clickup.com/20115771/v/li/${firstList}`)}>and {open.length - 6} more in ClickUp {"→"}</div>}
      </div>
    </div>
  );
};

const WikiArticle = ({ wiki, pg, as, flow, mine, me, tasks, cuTasks, live, side, dispatch }) => {
  const pages = wiki.pages || {};
  const st = WIKI_STATUS[pg.status] || WIKI_STATUS.current;
  const color = wikiColor(wiki, pg);
  const kids = (pg.children || []).map(id => pages[id]).filter(k => k && wikiSeen(k, as));
  const link = id => pages[id] && wikiSeen(pages[id], as) && <span key={id} className="chip" onClick={() => dispatch({ type: "WIKI_GO", value: id })}>
    <i style={{ background: wikiColor(wiki, pages[id]) }} />{pages[id].title}</span>;
  const chain = wikiChain(pages, pg.id);
  const top = chain[0] || pg;
  const home = `${top.company === "all" ? "Company Wiki" : `${top.title} Wiki`} › ${chain.slice(1).map(c => c.title).join(" › ") || "front page"}`;
  const where = wikiLinks(wiki, pg, me);
  const fixTitle = pg.status === "gap" ? `Write the wiki page: ${pg.title}` : pg.status === "conflict" ? `Settle the sources on the wiki page: ${pg.title}`
    : pg.status === "stale" ? `Bring the wiki page up to date: ${pg.title}` : pg.status === "check" ? `Check the wiki page: ${pg.title}` : "";
  const checks = pg.checks || [];
  const onDesk = wikiDeskTasks(tasks, pg.id).some(t => t.title === fixTitle.slice(0, 120));
  const fixWhy = { gap: "This page still needs writing.", check: "Some facts here need the keeper to confirm them.",
                   conflict: "Two sources disagree. See What is current.", stale: "Older than the work it describes." }[pg.status] || "";
  const panels = [
    <WikiWork key="work" wiki={wiki} pg={pg} flow={flow} mine={mine} me={me} tasks={tasks} cuTasks={cuTasks} live={live} dispatch={dispatch} />,
    <div key="where" className="panel where">
      <div className="ph"><span>Find it everywhere</span><span className="pv">opens in the app</span></div>
      {where.map(([k, items]) => (
        <div key={k} className="svcrow"><WikiSvc k={k} /><div className="svl">
          {items.map(x => <span key={x.u} className="lnk" title={x.u} onClick={() => openUrl(x.u)}>{x.t}</span>)}</div></div>))}
    </div>,
    <div key="foot" className="foot">
      <span className="acts">
        <span onClick={() => toClaude(wikiPageMd(pg, wiki), dispatch)}>Ask Claude to update this page</span>
        <span onClick={() => dispatch({ type: "WIKI_ADD", value: { to: pg.id, title: pg.title } })}>Suggest a fix</span>
      </span>
    </div>];
  return (
    <div className={`art${side ? " side" : ""}`}><div className="main">
      <div className="kick"><i style={{ background: color }} />{wikiKindName[pg.kind] || pg.kind}
        <span className="st" style={{ color: st[1], borderColor: st[1] }}>{st[0]}</span></div>
      <div className="h1">{pg.title}</div>
      <div className="p lead">{pg.what}</div>
      <div className="facts">
        <span><em>Keeper</em>{pg.owner || "nobody yet"}</span>
        <span><em>Checked</em>{wikiDay(pg.updated) || pg.updated}</span>
        <span title="where this page will live when the wiki moves into ClickUp"><em>ClickUp home</em>{home}</span>
      </div>
      {fixTitle && <div className="fix"><span>{fixWhy}</span>
        {onDesk ? <span className="ondesk">On your desk</span> : <span className="btn" onClick={() => wikiTask(fixTitle, pg, dispatch)}>Make it a task</span>}</div>}
      {pg.fits && <div className="sec"><div className="h">How it fits</div><div className="p">{pg.fits}</div></div>}
      {pg.current && <div className="sec"><div className="h">What is current</div><div className="p">{pg.current}</div></div>}
      {(pg.steps || []).length > 0 && <div className="sec"><div className="h">How it works</div>
        <div className="steps">{pg.steps.map((x, i) => <div key={i} className="stp" style={{ animationDelay: `${i * 50}ms` }}><b>{i + 1}</b><span>{x}</span></div>)}</div></div>}
      {(pg.rules || []).length > 0 && <div className="sec"><div className="h">Rules</div>
        {pg.rules.map((x, i) => <div key={i} className={`rule${/^Proposed:/.test(x) ? " prop" : ""}`}><span>{x.replace(/^Proposed:\s*/, "")}</span>{/^Proposed:/.test(x) && <em>proposed</em>}</div>)}</div>}
      {checks.length > 0 && <div className="sec">
        <div className="tally">{Object.keys(WIKI_CHECK).map(k => { const n = checks.filter(c => c.s === k).length;
          return n ? <span key={k} style={{ flex: n, background: WIKI_CHECK[k][1] }} title={`${WIKI_CHECK[k][0]}: ${n}`} /> : null; })}</div>
        <div className="tleg">{Object.keys(WIKI_CHECK).map(k => { const n = checks.filter(c => c.s === k).length;
          return n ? <span key={k}><i style={{ background: WIKI_CHECK[k][1] }} />{WIKI_CHECK[k][0]} {n}</span> : null; })}</div>
        {checks.map((c, i) => <div key={i} className="ck"><span className="n">{i + 1}</span><span className="t">{c.t}</span>
          <span className="s" style={{ color: WIKI_CHECK[c.s][1], borderColor: WIKI_CHECK[c.s][1] }}>{WIKI_CHECK[c.s][0]}</span></div>)}</div>}
      {(pg.connects || []).length > 0 && <div className="sec"><div className="h">Connects to</div><div className="chips">{pg.connects.map(link)}</div></div>}
      {kids.length > 0 && (
        <div className="sec"><div className="h">Inside</div>
          <div className="kids">{kids.map((k, i) => (
            <div key={k.id} className="kid" style={{ animationDelay: `${60 + i * 40}ms` }} onClick={() => dispatch({ type: "WIKI_GO", value: k.id })}>
              <div className="kt"><i style={{ background: (WIKI_STATUS[k.status] || WIKI_STATUS.current)[1] }} />{k.title}</div>
              <div className="kd">{k.what}</div></div>))}</div></div>
      )}
      {(pg.questions || []).length > 0 && <div className="sec"><div className="h">Open questions</div>
        {pg.questions.map((q, i) => <div key={i} className="q"><span>{q}</span>
          <span className="btn" onClick={() => wikiTask(`Answer for the wiki: ${q}`, pg, dispatch)}>Make it a task</span></div>)}</div>}
      {!side && panels}
    </div>
    {side && <div className="aside">{panels}</div>}
    </div>
  );
};

const WikiHome = ({ wiki, as, inbox, live, flow, tasks, dispatch }) => {
  const pages = Object.values(wiki.pages || {}).filter(pg => wikiSeen(pg, as));
  const cos = (wiki.companies || []).filter(c => as === "all" || c.id === as);
  const flagged = pages.filter(pg => pg.status && pg.status !== "current" && pg.status !== "open").slice(0, 8);
  const queue = [...(inbox || []), ...(wiki.inbox || [])]
    .filter(x => !x.to || ((wiki.pages || {})[x.to] && wikiSeen(wiki.pages[x.to], as))).slice(0, 6);
  const desk = wikiDeskTasks(tasks, "");
  const lt = (live && live.tasks) || [];
  const folderOf = id => ((wiki.lists || {})[id] || {}).folder;
  const procs = (((wiki.pages || {}).work || {}).children || []).map(id => (wiki.pages || {})[id]).filter(pg => pg && pg.kind === "process");
  const secs = (wiki.sections || []).filter(id => id !== "work");
  return (
    <div className="home">
      <div className="hero">
        <div className="hl">
          <div className="h0">Company wiki</div>
          <div className="p">What MSBAI, Tam Fortis and Nexcavate know, top down. Open a company, click any part of its system, and each page tells you what it is, how it fits, what is current, who keeps it, and where the work and the files live.</div>
        </div>
        <div className={`livepill${lt.length ? " on" : ""}`}>
          <i />{lt.length ? `Live from ClickUp · ${lt.length} open tasks · ${wikiDay(live.updated)}` : "ClickUp link starts on the next sync"}</div>
      </div>
      {as !== "all" && <div className="note">Previewing what a Tam Fortis partner sees with one login: only Tam Fortis pages.
        <span className="lk" onClick={() => dispatch({ type: "WIKI_AS", value: "all" })}>Back to everyone</span></div>}
      <div className="h">Start with a company</div>
      <div className="cos" style={{ gridTemplateColumns: WIDTH >= 640 ? `repeat(${cos.length}, 1fr)` : "1fr" }}>
        {cos.map((c, i) => {
          const mineP = pages.filter(pg => pg.company === c.id);
          const co = (wiki.pages || {})[c.home] || {};
          const fset = new Set(co.folders || []);
          const nOpen = lt.filter(t => fset.has(folderOf(t.list))).length;
          const nStreams = wikiStreams(wiki, flow, co).filter(s => s.status === "active").length;
          return (
            <div key={c.id} className="co" style={{ "--c": c.color, animationDelay: `${i * 70}ms` }}
                 onClick={() => dispatch({ type: "WIKI_GO", value: c.home })}>
              <div className="bar" />
              <div className="thumb"><WikiMap wiki={wiki} mapId={c.system} sel="" mini dispatch={dispatch} /></div>
              <div className="cn">{c.name}</div>
              <div className="ct">{c.tag}</div>
              <div className="stats">
                <span><b>{mineP.length}</b> pages</span>
                <span><b>{nStreams}</b> active streams</span>
                <span><b>{lt.length ? nOpen : "…"}</b> open tasks</span>
              </div>
              <div className="dots">{mineP.map(pg => <i key={pg.id} title={`${pg.title}: ${(WIKI_STATUS[pg.status] || WIKI_STATUS.current)[0]}`} style={{ background: (WIKI_STATUS[pg.status] || WIKI_STATUS.current)[1] }} />)}</div>
            </div>
          );
        })}
      </div>
      {as === "all" && <div className="h">How we work</div>}
      {as === "all" && (
        <div className="procs">
          {procs.map((pg, i) => (
            <div key={pg.id} className="tile" style={{ animationDelay: `${150 + i * 35}ms` }} onClick={() => dispatch({ type: "WIKI_GO", value: pg.id })}>
              <div className="tn">{pg.title}</div><div className="td">{pg.what}</div></div>))}
          <div className="tile ghost" onClick={() => dispatch({ type: "WIKI_GO", value: "work" })}>
            <div className="tn">Runbooks</div><div className="td">ParaView restarts, DSRC jobs, containers, company rules, lessons learned.</div></div>
        </div>
      )}
      {as === "all" && <div className="h">Reference</div>}
      {as === "all" && (
        <div className="secs">
          {secs.map((id, i) => { const pg = (wiki.pages || {})[id]; if (!pg) return null;
            const n = id === "glossary" ? (wiki.glossary || []).length : (pg.children || []).length;
            return (
              <div key={id} className="tile" style={{ animationDelay: `${300 + i * 40}ms` }} onClick={() => dispatch({ type: "WIKI_GO", value: id })}>
                <div className="tn">{pg.title}<span>{n}</span></div><div className="td">{pg.what}</div></div>);
          })}
        </div>
      )}
      <div className="three">
        <div>
          <div className="h">Needs a check</div>
          {flagged.map(pg => { const st = WIKI_STATUS[pg.status];
            return <div key={pg.id} className="row" onClick={() => dispatch({ type: "WIKI_GO", value: pg.id })}>
              <i style={{ background: st[1] }} /><span className="rt">{pg.title}</span><span className="rs" style={{ color: st[1] }}>{st[0]}</span></div>; })}
        </div>
        <div>
          <div className="h">Your wiki tasks</div>
          {desk.length === 0 && <div className="none">None yet. Open a page that needs work and press Make it a task.</div>}
          {desk.slice(0, 6).map(t => <div key={t.title} className="row dk"><span className="box" title="check off" onClick={() => completeTask(t, dispatch)} /><span className="rt">{t.title}</span></div>)}
        </div>
        <div>
          <div className="h">Waiting to be filed</div>
          {queue.length === 0 && <div className="none">Nothing waiting.</div>}
          {queue.map((x, i) => <div key={i} className="row" onClick={() => x.to && dispatch({ type: "WIKI_GO", value: x.to })}>
            <i style={{ background: "#64D2FF" }} /><span className="rt">{x.text}</span><span className="rs">{x.who || "you"} · {x.state || "new"}</span></div>)}
        </div>
      </div>
      {as === "all" && <div className="access">
        <span>Access: each company sees its own pages with one login.</span>
        <span className="lk" onClick={() => dispatch({ type: "WIKI_AS", value: "tamfortis" })}>Preview as a Tam Fortis partner</span></div>}
    </div>
  );
};

const WikiView = ({ wiki, inbox, live, page, q, kind, as, add, origin, flow, mine, me, tasks, cuTasks, height, dispatch }) => {
  if (!wiki || !wiki.pages) {
    return <div className={panel} style={{ height }}><div className={head}><span>Wiki</span></div>
      <div className={wikiCss}><div className="none">The wiki file is not there yet (desk-widget/wiki.json).</div></div></div>;
  }
  const pages = wiki.pages;
  const pg = pages[page] && wikiSeen(pages[page], as) ? pages[page] : null;
  const id = pg ? pg.id : "home";
  const crumbs = pg ? wikiChain(pages, id) : [];
  const mapId = pg ? wikiMapFor(wiki, id) : "";
  const res = q.trim() ? wikiSearch(wiki, q, kind, as) : null;
  const wide = WIDTH >= 860;
  const back = crumbs.length > 1 ? crumbs[crumbs.length - 2].id : "home";
  const artProps = { wiki, pg, as, flow, mine, me, tasks, cuTasks, live, dispatch };
  let body;
  if (res) {
    body = (
      <div className="results" key={"q" + kind}>
        <div className="kinds">{WIKI_KINDS.map(([k, l]) => <span key={k} className={kind === k ? "on" : ""} onClick={() => dispatch({ type: "WIKI_KIND", value: k })}>{l}</span>)}</div>
        {res.pages.map((r, i) => (
          <div key={r.id} className="hit" style={{ animationDelay: `${i * 25}ms` }} onClick={() => dispatch({ type: "WIKI_GO", value: r.id })}>
            <div className="ht"><i style={{ background: wikiColor(wiki, r) }} />{r.title}
              <span className="hk">{wikiKindName[r.kind]} · {wikiChain(pages, r.id).slice(0, -1).map(x => x.title).join(" › ") || "Wiki"}</span></div>
            <div className="hd">{r.what}</div></div>))}
        {res.terms.map(t => <div key={t.t} className="hit term"><div className="ht"><b>{t.t}</b></div><div className="hd">{t.d}</div></div>)}
        {res.pages.length === 0 && res.terms.length === 0 && <div className="none">No page matches yet.</div>}
        <div className="ask" onClick={() => toClaude(`Search MSBAI's Google Drive, ClickUp docs, Slack and Fireflies meetings for: ${q}\n\nGive me the top three sources with links, one line each on why it matters, and say which wiki page it belongs on.`, dispatch)}>
          Not here? Ask Claude to search Drive, ClickUp, Slack and meetings for {"“"}{q.trim()}{"”"}</div>
      </div>
    );
  } else if (!pg) {
    body = <WikiHome wiki={wiki} as={as} inbox={inbox} live={live} flow={flow} tasks={tasks} dispatch={dispatch} />;
  } else if (id === "glossary") {
    body = (
      <div className="gloss">
        <div className="h1">Glossary</div><div className="p lead">{pg.what} {pg.fits}</div>
        {(wiki.glossary || []).map((g, i) => <div key={g.t} className="term" style={{ animationDelay: `${i * 12}ms` }}><b>{g.t}</b><span>{g.d}</span></div>)}
      </div>
    );
  } else if (mapId) {
    body = (
      <div className={`split${wide ? "" : " stack"}`}>
        <div className="mapcol"><WikiMap wiki={wiki} mapId={mapId} sel={id} dispatch={dispatch} /></div>
        <div className="artcol" key={id} style={{ transformOrigin: origin }}><WikiArticle {...artProps} /></div>
      </div>
    );
  } else {
    body = <div className="solo" key={id} style={{ transformOrigin: origin }}><WikiArticle {...artProps} side={WIDTH >= 980} /></div>;
  }
  return (
    <div className={panel} style={{ height, display: "flex", flexDirection: "column" }}>
      <div className={`${wikiCss} ${wikiTop}`}>
        <div className="crumbs">
          {pg && <span className="bk" title="up a level" onClick={() => dispatch({ type: "WIKI_GO", value: back })}>{"‹"}</span>}
          <span className={pg || res ? "c root" : "c root here"} onClick={() => { const el = document.getElementById("wk-q"); if (el) el.value = "";
            dispatch({ type: "WIKI_GO", value: "home" }); }}>Wiki</span>
          {!res && crumbs.slice(-2).map((c, i, arr) => (
            <span key={c.id} className={i === arr.length - 1 ? "c here last" : "c"} onClick={() => dispatch({ type: "WIKI_GO", value: c.id })}>
              <em>{"›"}</em>{c.title}</span>))}
          {res && <span className="c here"><em>{"›"}</em>Search</span>}
        </div>
        <input key={"wq" + id} id="wk-q" className="search" placeholder="Search pages, people, terms" defaultValue={q}
               onInput={e => dispatch({ type: "WIKI_Q", value: e.target.value })}
               onKeyDown={e => { if (e.key === "Escape") { e.target.value = ""; dispatch({ type: "WIKI_Q", value: "" }); } }} />
        <span className="reg" title="register work you did, or add something the wiki is missing"
              onClick={() => dispatch({ type: "WIKI_ADD", value: add ? null : { to: pg ? pg.id : "", title: pg ? pg.title : "" } })}>
          <svg width="11" height="11" viewBox="0 0 12 12"><path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>Register work</span>
      </div>
      <div className={wikiCss} style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <div className="body">{body}</div>
        {add && (
          <div className="addbox">
            {add.sent
              ? <div className="sent"><b>Filed in the wiki inbox.</b> In the full build an agent places it on the right page, links the source, and asks the keeper to confirm.
                  <span className="lk" onClick={() => dispatch({ type: "WIKI_ADD", value: null })}>Done</span></div>
              : <div>
                  <div className="h">{add.to ? `Suggest a fix: ${add.title}` : "Register work in the wiki"}</div>
                  <div className="hint">{add.to ? "Say what is wrong or missing, and where the right answer lives." : "Say what you did or found, and paste a link to it. It gets filed on the right page and the keeper confirms."}</div>
                  <textarea id="wk-add" placeholder={add.to ? "What is wrong, and a link to the right source" : "What you did, and a link to it"} />
                  <div className="btns">
                    <span className="go" onClick={() => { const el = document.getElementById("wk-add"); const t = el && el.value.trim();
                      if (t) wikiFile({ to: add.to || "", text: t, who: (me && me.name) || "you", state: "new" }, dispatch); }}>Send to the wiki inbox</span>
                    <span onClick={() => dispatch({ type: "WIKI_ADD", value: null })}>Cancel</span>
                  </div>
                </div>}
          </div>
        )}
      </div>
    </div>
  );
};

const wikiTop = css`
  display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex: 0 0 auto;
  .crumbs { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 2px; white-space: nowrap; overflow: hidden; }
  .bk { font-size: 16px; line-height: 1; color: ${GLASS.sub}; cursor: pointer; padding: 0 8px 0 2px; }
  .bk:hover { color: #fff; }
  .c { flex: 0 4 auto; min-width: 24px; font-size: 12px; font-weight: 700; color: ${GLASS.label}; cursor: pointer;
       overflow: hidden; text-overflow: ellipsis; }
  .c.root { flex: 0 0 auto; }
  .c.last { flex: 0 1 auto; min-width: 60px; }
  .c.dim { cursor: default; }
  .c:hover { color: #fff; }
  .c.here { color: #fff; }
  .c em { font-style: normal; margin: 0 6px; color: ${GLASS.label}; }
  .search { flex: 0 1 260px; min-width: 120px; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12);
            border-radius: 9px; padding: 6px 10px; color: #fff; font-size: 12px; outline: none; transition: border-color .15s, background .15s; }
  .search:focus { border-color: rgba(255,255,255,0.35); background: rgba(255,255,255,0.1); }
  .search::placeholder { color: ${GLASS.label}; }
  .as { display: inline-flex; gap: 2px; padding: 2px; border-radius: 8px; background: rgba(255,255,255,0.06); flex: 0 0 auto; }
  .as span { padding: 3px 8px; border-radius: 6px; font-size: 10.5px; font-weight: 700; color: ${GLASS.label}; cursor: pointer; }
  .as span.on { color: #fff; background: rgba(255,255,255,0.14); }
  .reg { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 700; color: #fff;
         cursor: pointer; padding: 6px 11px; border-radius: 9px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.14);
         transition: background .15s, border-color .15s; }
  .reg:hover { background: rgba(255,255,255,0.18); border-color: rgba(255,255,255,0.3); }
`;
const wikiCss = css`
  @keyframes wkIn { from { opacity: 0; transform: translateY(8px) scale(.975); } to { opacity: 1; transform: none; } }
  @keyframes wkPop { from { opacity: 0; transform: scale(.94); } to { opacity: 1; transform: none; } }
  /* each loop must move the dashes by a whole number of dash periods, or they jump at the seam */
  @keyframes wkFlow { to { stroke-dashoffset: -6; } }
  @keyframes wkFlowLn { to { stroke-dashoffset: -4.8; } }
  @keyframes wkSpin { to { transform: rotate(360deg); } }
  @keyframes wkGlow { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }
  @keyframes wkPulse { from { opacity: .9; stroke-width: .5; } to { opacity: 0; stroke-width: 3; } }
  /* scroll areas reach 12px into the panel's right padding, so the bar sits off the text */
  font-size: 12px; color: rgba(255,255,255,0.9);
  .none { color: ${GLASS.label}; padding: 6px 2px; }
  .body { position: absolute; inset: 0; overflow: hidden; }
  .h { font-size: 9px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: ${GLASS.label}; margin-bottom: 6px; }
  .h0 { font-size: 20px; font-weight: 800; color: #fff; letter-spacing: -.2px; }
  .h1 { font-size: 17px; font-weight: 800; color: #fff; margin: 4px 0 6px; text-wrap: balance; }
  .p { font-size: 12.5px; line-height: 1.5; color: rgba(255,255,255,0.78); }
  .p.lead { color: rgba(255,255,255,0.92); font-size: 13px; }
  .lk { color: ${ACCENT.link}; cursor: pointer; margin-left: 8px; }

  .home { height: 100%; overflow-y: auto; margin-right: -12px; padding-right: 16px; display: flex; flex-direction: column; gap: 16px; }
  .hero { display: flex; gap: 16px; align-items: flex-start; justify-content: space-between; }
  .hero .hl { min-width: 0; }
  .hero .p { max-width: 66ch; margin-top: 4px; }
  .livepill { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 7px; font-size: 10.5px; font-weight: 700; color: ${GLASS.sub};
              padding: 5px 10px; border-radius: 20px; background: rgba(255,255,255,0.06); white-space: nowrap; }
  .livepill i { position: relative; width: 7px; height: 7px; border-radius: 50%; background: #9AA4B2; }
  .livepill.on i { background: #5ED3A1; }
  .livepill.on i:after { content: ""; position: absolute; inset: 0; border-radius: 50%; background: #5ED3A1;
    animation: wkLive 2s cubic-bezier(.2,.6,.3,1) infinite; will-change: transform, opacity; transform: translateZ(0); }
  @keyframes wkLive { 0% { transform: scale(1); opacity: .6; } 100% { transform: scale(3); opacity: 0; } }
  .note { color: #FF9CA0; font-size: 11.5px; }
  .home > .h { margin: 2px 0 -8px; }
  .co .thumb { height: 74px; margin: 2px -4px 8px; opacity: .9; pointer-events: none; }
  .co .stats { display: flex; gap: 12px; font-size: 10.5px; color: ${GLASS.sub}; margin-bottom: 8px; flex-wrap: wrap; }
  .co .stats b { color: #fff; font-weight: 800; margin-right: 3px; font-variant-numeric: tabular-nums; }
  .procs { display: grid; grid-template-columns: repeat(auto-fill, minmax(165px, 1fr)); gap: 8px; }
  .tile.ghost { background: transparent; border: 1px dashed rgba(255,255,255,0.14); }
  .three { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .row.dk { cursor: default; }
  .box { flex: 0 0 auto; width: 12px; height: 12px; border-radius: 4px; border: 1.5px solid rgba(255,255,255,0.45); cursor: pointer;
         transition: background .15s, border-color .15s; }
  .box:hover { border-color: #5ED3A1; background: rgba(94,211,161,0.25); }
  .access { display: flex; gap: 10px; align-items: baseline; font-size: 11px; color: ${GLASS.label}; padding: 4px 2px 6px;
            border-top: 1px solid rgba(255,255,255,0.07); padding-top: 10px; }
  .cos { display: grid; gap: 10px; }
  .co { position: relative; border-radius: 14px; padding: 14px 14px 12px; cursor: pointer; overflow: hidden;
        background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09);
        animation: wkPop .35s ease both; transition: transform .18s, background .18s, border-color .18s; }
  .co:hover { transform: translateY(-2px); background: rgba(255,255,255,0.08); border-color: var(--c); }
  .co .bar { position: absolute; left: 0; top: 0; right: 0; height: 3px; background: var(--c); opacity: .85; }
  .co .cn { font-size: 15px; font-weight: 800; color: #fff; }
  .co .ct { font-size: 11.5px; color: ${GLASS.sub}; line-height: 1.4; margin: 3px 0 9px; min-height: 32px; }
  .co .dots { display: flex; flex-wrap: wrap; gap: 3px; margin-bottom: 8px; }
  .co .dots i { width: 6px; height: 6px; border-radius: 50%; opacity: .85; }

  .secs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .tile { border-radius: 11px; padding: 10px 11px; cursor: pointer; background: rgba(255,255,255,0.04);
          animation: wkPop .3s ease both; transition: background .15s; }
  .tile:hover { background: rgba(255,255,255,0.09); }
  .tn { font-size: 12px; font-weight: 800; color: #fff; display: flex; justify-content: space-between; }
  .tn span { color: ${GLASS.label}; font-weight: 700; }
  .td { font-size: 10.5px; color: ${GLASS.sub}; line-height: 1.35; margin-top: 3px; display: -webkit-box; -webkit-line-clamp: 2;
        -webkit-box-orient: vertical; overflow: hidden; }

  .row { display: flex; align-items: center; gap: 8px; padding: 4px 6px; border-radius: 7px; cursor: pointer; min-width: 0; }
  .row:hover { background: rgba(255,255,255,0.06); }
  .row i { width: 6px; height: 6px; border-radius: 50%; flex: 0 0 auto; }
  .rt { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rs { flex: 0 0 auto; font-size: 10.5px; color: ${GLASS.label}; }

  .split { display: flex; gap: 16px; height: 100%; }
  .split.stack { flex-direction: column; }
  .mapcol { flex: 0 0 56%; min-width: 0; display: flex; flex-direction: column; }
  .split.stack { gap: 10px; }
  .split.stack .mapcol { flex: 0 0 50%; }
  .artcol, .solo { flex: 1; min-width: 0; min-height: 0; overflow-y: auto; margin-right: -12px; padding-right: 16px; animation: wkIn .28s cubic-bezier(.2,.8,.2,1) both; }
  .solo { height: 100%; }
  .art.side { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 20px; align-items: start; }
  .art.side .aside > .panel:first-child { margin-top: 0; }
  .art .ondesk { margin-left: auto; font-size: 11px; font-weight: 700; color: #5ED3A1; }

  .map { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .map svg { flex: 1 1 0; min-height: 0; height: 100%; width: 100%; overflow: visible; }
  .map.mini { height: 100%; }
  .map.mini .nd { animation: none; }
  .map.mini .nd rect { stroke: var(--c); stroke-opacity: .45; fill: rgba(255,255,255,0.04); stroke-width: .5; }
  .map text { fill: rgba(255,255,255,0.88); font-weight: 700; pointer-events: none; }
  .map .sub text { fill: rgba(255,255,255,0.5); font-weight: 600; }
  .nd { cursor: pointer; animation: wkPop .4s ease both; transform-box: fill-box; transform-origin: center; }
  .nd rect { fill: rgba(255,255,255,0.05); stroke: rgba(255,255,255,0.2); stroke-width: .25; transition: fill .25s, stroke .25s; }
  .nd:hover rect { fill: rgba(255,255,255,0.1); stroke: rgba(255,255,255,0.45); }
  .nd.on rect { stroke: var(--c); stroke-width: .35; }
  .nd.sel rect { fill: rgba(255,255,255,0.13); stroke: var(--c); stroke-width: .5; filter: drop-shadow(0 0 1.5px var(--c)); }
  .nd.grp > rect { fill: rgba(255,255,255,0.02); stroke-dasharray: 1 .8; }
  .nd .gl { fill: rgba(255,255,255,0.55); font-size: 2.2px; }
  .nd.pill rect { fill: rgba(255,255,255,0.03); }
  .nd.strip rect { fill: rgba(255,255,255,0.03); stroke-dasharray: .6 .6; }
  .nd .pulse { fill: none !important; stroke: var(--c) !important; animation: wkPulse .9s ease-out 1 both; filter: none !important; }
  .nd.frame { animation: none; }
  .nd.frame rect { fill: none; stroke: rgba(255,255,255,0.16); stroke-dasharray: 1.2 1; pointer-events: stroke; stroke-width: .6; }
  .nd.frame:hover rect, .nd.frame.sel rect { stroke: var(--c); fill: none; }
  .nd .fl { fill: rgba(255,255,255,0.5); pointer-events: auto; cursor: pointer; }
  .ring .band { fill: none; stroke: rgba(255,255,255,0.07); transition: stroke .25s; }
  .ring:hover .band, .ring.sel .band { stroke: rgba(94,211,161,0.18); }
  .ring .spin { animation: wkSpin 60s linear infinite; transform-box: fill-box; transform-origin: center; }
  .ring .drum { fill: rgba(203,211,222,0.35); stroke: rgba(255,255,255,0.4); stroke-width: .2; }
  .ring.sel .drum { fill: rgba(94,211,161,0.6); }
  .core .body { fill: rgba(60,200,140,0.12); stroke: rgba(94,211,161,0.55); stroke-width: .35; animation: wkGlow 3.2s ease-in-out infinite; transition: fill .25s; }
  .core.sel .body { fill: rgba(60,200,140,0.24); stroke-width: .6; }
  .core .fuel circle { fill: #5ED3A1; }
  .core .mod circle { fill: #9FD3FF; opacity: .8; }
  .core .fuel.sel circle { fill: #BDF2DA; filter: drop-shadow(0 0 1px #5ED3A1); }
  .core .mod.sel circle { fill: #fff; filter: drop-shadow(0 0 1px #9FD3FF); }
  .core g { cursor: pointer; }
  .pipes .hit { fill: transparent !important; stroke: none !important; }
  .pipes .pipe { fill: none; stroke: #5ED3A1; stroke-width: .7; stroke-dasharray: 1.6 1.4; animation: wkFlow 1.1s linear infinite; opacity: .8; }
  .pipes.sel .pipe { stroke-width: 1.1; opacity: 1; }
  .pipes text { fill: rgba(255,255,255,0.6) !important; }
  .ln { stroke-width: .45; stroke-dasharray: 1.2 1.2; animation: wkFlowLn 1.1s linear infinite; pointer-events: none; }
  .ln.train { animation-duration: 1.8s; }
  .ln.power { stroke-width: .7; }
  .legend { display: flex; flex-wrap: wrap; gap: 12px; padding: 6px 2px 0; font-size: 10px; color: ${GLASS.label}; }
  .legend span { display: inline-flex; align-items: center; gap: 5px; }
  .legend i { width: 12px; height: 2px; border-radius: 1px; }
  .legend .hint { margin-left: auto; }

  .art .kick { display: flex; align-items: center; gap: 7px; font-size: 9.5px; font-weight: 800; letter-spacing: .8px; text-transform: uppercase; color: ${GLASS.label}; }
  .art .kick i { width: 7px; height: 7px; border-radius: 50%; }
  .art .st { margin-left: auto; border: 1px solid; border-radius: 6px; padding: 1px 6px; letter-spacing: .3px; font-size: 9.5px; }
  .art .sec { margin-top: 13px; }
  .art .chips { display: flex; flex-wrap: wrap; gap: 5px; }
  .art .chip { display: inline-flex; align-items: center; gap: 6px; padding: 3px 9px; border-radius: 8px; background: rgba(255,255,255,0.07);
               cursor: pointer; font-size: 11.5px; transition: background .15s; }
  .art .chip:hover { background: rgba(255,255,255,0.14); }
  .art .chip i { width: 6px; height: 6px; border-radius: 50%; }
  .art .kids { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 6px; }
  .art .kid { border-radius: 10px; padding: 8px 10px; background: rgba(255,255,255,0.05); cursor: pointer; animation: wkPop .3s ease both;
              transition: background .15s, transform .15s; }
  .art .kid:hover { background: rgba(255,255,255,0.1); transform: translateY(-1px); }
  .art .kt { font-size: 12px; font-weight: 800; color: #fff; display: flex; align-items: center; gap: 6px; }
  .art .kt i { width: 5px; height: 5px; border-radius: 50%; }
  .art .kd { font-size: 10.5px; color: ${GLASS.sub}; line-height: 1.35; margin-top: 3px; display: -webkit-box; -webkit-line-clamp: 2;
             -webkit-box-orient: vertical; overflow: hidden; }
  .art .q { display: flex; gap: 10px; align-items: center; font-size: 12px; line-height: 1.45; color: #64D2FF; padding: 2px 0 2px 10px;
            border-left: 2px solid rgba(100,210,255,0.5); margin-bottom: 6px; }
  .art .src { font-size: 11.5px; color: ${ACCENT.link}; cursor: pointer; padding: 2px 0; }
  .art .src:hover { text-decoration: underline; text-underline-offset: 2px; }
  .art .foot { margin: 14px 0 6px; display: flex; font-size: 11px; color: ${GLASS.label}; }
  .art .acts { display: flex; gap: 6px; flex-wrap: wrap; }
  .art .facts { display: flex; flex-wrap: wrap; gap: 6px 16px; margin: 10px 0 2px; font-size: 11.5px; color: rgba(255,255,255,0.85); }
  .art .facts span { min-width: 0; }
  .art .facts em { font-style: normal; font-size: 9px; font-weight: 800; letter-spacing: .8px; text-transform: uppercase;
                   color: ${GLASS.label}; margin-right: 6px; }
  .art .fix { display: flex; align-items: center; gap: 10px; margin-top: 12px; padding: 8px 10px; border-radius: 10px;
              background: rgba(245,197,66,0.08); border: 1px solid rgba(245,197,66,0.22); font-size: 12px; }
  .art .btn { margin-left: auto; flex: 0 0 auto; font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 7px; cursor: pointer;
              color: #fff; background: rgba(255,255,255,0.1); transition: background .15s; white-space: nowrap; }
  .art .btn:hover { background: rgba(255,255,255,0.2); }
  .art .steps { position: relative; display: flex; flex-direction: column; gap: 7px; }
  .art .steps:before { content: ""; position: absolute; left: 10px; top: 8px; bottom: 8px; width: 1.5px; background: rgba(255,255,255,0.12); }
  .art .stp { position: relative; display: flex; gap: 10px; align-items: flex-start; animation: wkIn .3s ease both; font-size: 12.5px; line-height: 1.45; }
  .art .stp b { flex: 0 0 auto; width: 21px; height: 21px; border-radius: 50%; display: grid; place-items: center; font-size: 10.5px;
                background: #2a2d34; border: 1.5px solid var(--c, rgba(255,255,255,0.35)); color: #fff; }
  .art .stp span { padding-top: 2px; color: rgba(255,255,255,0.85); }
  .art .rule { display: flex; gap: 8px; align-items: baseline; font-size: 12.5px; line-height: 1.45; padding: 2px 0; color: rgba(255,255,255,0.85); }
  .art .rule:before { content: ""; flex: 0 0 auto; width: 5px; height: 5px; border-radius: 50%; background: #5ED3A1; transform: translateY(-2px); }
  .art .rule.prop:before { background: transparent; border: 1px solid ${GLASS.label}; }
  .art .rule em { font-style: normal; font-size: 9.5px; font-weight: 700; color: ${GLASS.label}; margin-left: 4px; }
  .art .tally { display: flex; gap: 2px; height: 6px; border-radius: 3px; overflow: hidden; margin-bottom: 6px; }
  .art .tleg { display: flex; flex-wrap: wrap; gap: 12px; font-size: 10.5px; color: ${GLASS.sub}; margin-bottom: 8px; }
  .art .tleg i { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 5px; }
  .art .ck { display: flex; gap: 9px; align-items: baseline; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 12px; }
  .art .ck .n { flex: 0 0 18px; color: ${GLASS.label}; font-variant-numeric: tabular-nums; }
  .art .ck .t { flex: 1; min-width: 0; color: rgba(255,255,255,0.88); line-height: 1.4; }
  .art .ck .s { flex: 0 0 auto; font-size: 9.5px; font-weight: 800; border: 1px solid; border-radius: 6px; padding: 1px 6px; }
  .panel { margin-top: 14px; padding: 10px 12px; border-radius: 12px; background: rgba(255,255,255,0.045); border: 1px solid rgba(255,255,255,0.08);
           animation: wkIn .3s ease both; }
  .panel .ph { display: flex; justify-content: space-between; align-items: baseline; font-size: 9px; font-weight: 800; letter-spacing: 1px;
               text-transform: uppercase; color: rgba(255,255,255,0.75); margin-bottom: 8px; }
  .panel .pv { font-size: 9.5px; font-weight: 700; letter-spacing: .3px; text-transform: none; color: ${GLASS.label}; }
  .stream { display: flex; gap: 10px; align-items: center; padding: 6px 6px; border-radius: 8px; cursor: pointer; }
  .stream:hover { background: rgba(255,255,255,0.06); }
  .stream > i { flex: 0 0 4px; align-self: stretch; border-radius: 2px; }
  .stream .sm { flex: 1; min-width: 0; }
  .stream .sn { font-size: 12.5px; font-weight: 800; color: #fff; display: flex; gap: 8px; align-items: baseline; }
  .stream .sn span { font-size: 10px; font-weight: 700; color: ${GLASS.label}; }
  .stream .ss { font-size: 11px; color: ${GLASS.sub}; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .stream .go { flex: 0 0 auto; font-size: 10.5px; font-weight: 700; color: ${GLASS.label}; }
  .stream:hover .go { color: #fff; }
  .panel .sub { margin-top: 8px; }
  .panel .sh { font-size: 9px; font-weight: 800; letter-spacing: .9px; text-transform: uppercase; color: ${GLASS.label}; margin: 0 0 3px 6px; }
  .panel .sh.gold { color: #F5C542; text-shadow: 0 0 6px rgba(245,197,66,0.45); }
  .mi { display: flex; gap: 6px; align-items: baseline; padding: 3px 6px; border-radius: 6px; cursor: pointer; font-size: 12px; min-width: 0; }
  .mi:hover { background: rgba(255,255,255,0.06); }
  .mi .mt { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #fff; }
  .mi b { font-size: 10px; color: #F5C542; }
  .mi .md, .tk .tw { flex: 0 0 auto; font-size: 10.5px; color: ${GLASS.label}; }
  .dk { display: flex; gap: 8px; align-items: center; padding: 3px 6px; font-size: 12px; }
  .tk { display: flex; gap: 8px; align-items: center; padding: 3px 6px; border-radius: 6px; cursor: pointer; font-size: 12px; min-width: 0; }
  .tk:hover { background: rgba(255,255,255,0.06); }
  .tk > i { flex: 0 0 auto; width: 6px; height: 6px; border-radius: 50%; border: 1.5px solid rgba(255,255,255,0.4); }
  .tk > i.prog { background: #64D2FF; border-color: #64D2FF; }
  .tk .tn { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: rgba(255,255,255,0.88); }
  .tk .tn.me { color: #F5C542; text-shadow: 0 0 6px rgba(245,197,66,0.45); }
  .more { font-size: 11px; color: ${ACCENT.link}; cursor: pointer; padding: 3px 6px; }
  .where .svcrow { display: flex; gap: 10px; align-items: flex-start; padding: 4px 0; }
  .svc { flex: 0 0 auto; width: 18px; height: 18px; border-radius: 5px; display: grid; place-items: center; font-size: 10px; font-weight: 800; color: #fff; }
  .where .svl { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; gap: 4px 12px; padding-top: 1px; }
  .lnk { font-size: 11.5px; color: ${ACCENT.link}; cursor: pointer; white-space: nowrap; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
  .lnk:hover { text-decoration: underline; text-underline-offset: 2px; }
  .art .acts span { padding: 3px 8px; border-radius: 7px; cursor: pointer; color: ${GLASS.sub}; font-weight: 700; background: rgba(255,255,255,0.05); }
  .art .acts span:hover { color: #fff; background: rgba(255,255,255,0.12); }

  .results, .gloss { height: 100%; overflow-y: auto; margin-right: -12px; padding-right: 16px; }
  .kinds { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 10px; }
  .kinds span { padding: 3px 9px; border-radius: 7px; font-size: 11px; font-weight: 700; color: ${GLASS.label}; cursor: pointer; background: rgba(255,255,255,0.04); }
  .kinds span.on { color: #fff; background: rgba(255,255,255,0.14); }
  .hit { padding: 7px 8px; border-radius: 9px; cursor: pointer; animation: wkIn .25s ease both; }
  .hit:hover { background: rgba(255,255,255,0.06); }
  .ht { display: flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 800; color: #fff; min-width: 0; }
  .ht i { width: 6px; height: 6px; border-radius: 50%; flex: 0 0 auto; }
  .hk { margin-left: auto; font-size: 10px; font-weight: 600; color: ${GLASS.label}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hd { font-size: 11.5px; color: ${GLASS.sub}; line-height: 1.4; margin: 2px 0 0 13px; display: -webkit-box; -webkit-line-clamp: 2;
        -webkit-box-orient: vertical; overflow: hidden; }
  .hit.term { cursor: default; }
  .ask { margin-top: 10px; padding: 9px 10px; border-radius: 9px; border: 1px dashed rgba(255,255,255,0.18); color: ${GLASS.sub};
         cursor: pointer; font-size: 11.5px; }
  .ask:hover { color: #fff; border-color: rgba(255,255,255,0.4); }
  .gloss .term { display: grid; grid-template-columns: 150px 1fr; gap: 12px; padding: 6px 2px; border-bottom: 1px solid rgba(255,255,255,0.06);
                 animation: wkIn .25s ease both; }
  .gloss .term b { color: #fff; }
  .gloss .term span { color: rgba(255,255,255,0.75); line-height: 1.4; }

  .addbox { position: absolute; left: 0; right: 0; bottom: 0; padding: 12px; border-radius: 14px; background: rgba(28,30,36,0.96);
            border: 1px solid rgba(255,255,255,0.14); box-shadow: 0 -10px 30px rgba(0,0,0,0.35); animation: wkIn .22s ease both; z-index: 5; }
  .addbox textarea { width: 100%; box-sizing: border-box; height: 64px; resize: none; background: rgba(255,255,255,0.06); color: #fff;
                     border: 1px solid rgba(255,255,255,0.14); border-radius: 9px; padding: 8px 10px; font: inherit; font-size: 12px; outline: none; }
  .addbox .btns { display: flex; gap: 6px; margin-top: 8px; }
  .addbox .btns span { padding: 5px 10px; border-radius: 8px; cursor: pointer; font-weight: 700; color: ${GLASS.sub}; background: rgba(255,255,255,0.06); }
  .addbox .btns .go { color: #fff; background: rgba(255,255,255,0.16); }
  .addbox .hint { font-size: 11px; color: ${GLASS.sub}; margin: -2px 0 8px; }
  .addbox .sent { font-size: 12px; line-height: 1.5; color: rgba(255,255,255,0.85); }
`;

// The owner's open steps, merged: the same piece of work asked for in several meetings (often
// under different streams) becomes one entry carrying every stream's color. mine.sh sends its own
// grouping ("groups": [{title, keys, waiting}]); anything it did not cover is grouped here by
// word overlap.
const FLOW_STOP = new Set(("the a an and or to of for with on in at by from into onto is are be it its this that these " +
  "his her their our your my up out over about as so then than also all any each new next get got make do does done " +
  "{{owner_first}} allan team please".split(" ")));
const flowWords = t => [...new Set(String(t || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/)
  .filter(w => w.length > 2 && !FLOW_STOP.has(w)).map(w => w.replace(/(ing|ed|es|s)$/, "")))];
function groupMine(open, given) {
  const byKey = {}; open.forEach(o => { byKey[`${o.n.id}:${o.k}`] = o; });
  const used = new Set(), out = [];
  (given || []).forEach((g, i) => {
    const items = (g.keys || []).map(k => byKey[k]).filter(o => o && !used.has(o));
    if (!items.length) return;
    items.forEach(o => used.add(o));
    out.push({ id: "g" + i, title: g.title, waiting: g.waiting, items, rank: i });
  });
  const rest = open.filter(o => !used.has(o)), words = rest.map(o => flowWords(o.x.what));
  const par = rest.map((_, i) => i), root = i => (par[i] === i ? i : (par[i] = root(par[i])));
  for (let i = 0; i < rest.length; i++) for (let j = i + 1; j < rest.length; j++) {
    const A = words[i], B = new Set(words[j]); const both = A.filter(w => B.has(w)).length;
    if (both >= 2 && both / (A.length + B.size - both) >= 0.45) par[root(j)] = root(i);
  }
  const bucket = {};
  rest.forEach((o, i) => { (bucket[root(i)] = bucket[root(i)] || []).push(o); });
  Object.values(bucket).forEach(items => out.push({ id: `${items[0].n.id}:${items[0].k}`, items, rank: 1e3 }));
  out.forEach(g => {
    g.items.sort((a, b) => String(b.n.date).localeCompare(String(a.n.date)));
    g.last = g.items[0].n.date;
    g.title = g.title || g.items[0].x.what;
    g.streams = [...new Set(g.items.flatMap(o => o.n.streams || []))];
  });
  return out.sort((a, b) => a.rank - b.rank || b.items.length - a.items.length || String(b.last).localeCompare(String(a.last)));
}

const FlowLists = ({ tab, me, groups, active, finished, sById, myDone, doneOpen, grpOpen, nodes, flow, showClosed, dispatch }) => {
  const sel = id => dispatch({ type: "FLOW_SEL", value: id });
  const onMe = id => groups.filter(g => g.streams.includes(id)).length;
  const dots = ids => <span className="dots">{ids.filter(id => sById[id]).slice(0, 5).map(id =>
    <i key={id} title={sById[id].name} style={{ background: sById[id].color }} />)}</span>;
  const mineList = (
    <div key="mine" className="sec">
      <div className="nh gold">Waiting on you · {groups.length}</div>
      {groups.length === 0 && <div className="none">Nothing open. Everything from recent meetings is done or dropped.</div>}
      {groups.map(g => {
        const open = grpOpen === g.id;
        const names = g.streams.filter(id => sById[id]).map(id => sById[id].name);
        return (
          <div key={g.id} className={`g${open ? " open" : ""}`}>
            <div className="gl" onClick={() => dispatch({ type: "FLOW_GRP", value: open ? "" : g.id })}>
              {dots(g.streams)}
              <div className="gm">
                <div className="gt">{g.title}{g.items.length > 1 && <span className="x">{"×"}{g.items.length}</span>}</div>
                <div className="gw">{g.waiting || (names.length ? `Holds up ${names.join(", ")}` : "")}</div>
              </div>
              <span className="dt">{shortDay(g.last)}</span>
            </div>
            {open && g.items.map(o => (
              <div key={`${o.n.id}:${o.k}`} className="src" onClick={() => sel(o.n.id)}>
                <span className="dt">{shortDay(o.n.date)}</span>{dots(o.n.streams || [])}
                <span className="w">{o.x.what}</span><span className="mt">{o.n.meetingTitle}</span>
              </div>))}
          </div>
        );
      })}
      {myDone.length > 0 && (
        <div className="dn">
          <span className="tg" onClick={() => dispatch({ type: "FLOW_DONE", value: !doneOpen })}>
            {"✓"} {myDone.length} done since these meetings {doneOpen ? "▾" : "▸"}</span>
          {doneOpen && myDone.slice(0, 12).map(o => (
            <div key={`${o.n.id}:${o.k}`} className="src done" onClick={() => sel(o.n.id)}>
              <span className="dt">{shortDay(o.n.date)}</span><span className="w">{o.x.what}</span>
              {o.evidence && <span className="ev" onClick={stop(() => o.url && openUrl(o.url))}>{o.evidence}</span>}
            </div>))}
        </div>
      )}
    </div>
  );
  // ranked first (the review's order of importance), then the rest of the active ones, then paused
  const order = st => st.status === "paused" ? 3000 : st.rank ? st.rank : 2000;
  const shown = (tab === "mine" ? active.filter(st => onMe(st.id)) : active).slice().sort((a, b) => order(a) - order(b));
  const review = (flow && flow.review) || null;
  const ended = st => { const h = (st.history || []).filter(x => x.to === "done" || x.to === "merged").pop(); return h ? h.date : ""; };
  const fin = finished.slice().sort((a, b) => String(ended(b)).localeCompare(String(ended(a))));
  const standList = (
    <div key="stand" className="sec">
      <div className="nh">Where things stand · {shown.length}
        {review && <span className="rv" title={(review.changes || []).join("\n") || "no changes"}>reviewed {shortDay(review.date)}{(review.changes || []).length ? ` · ${review.changes.length} change${review.changes.length > 1 ? "s" : ""}` : ""}</span>}</div>
      {shown.map(st => {
        const td = st.target_date ? Math.round((new Date(st.target_date + "T12:00:00") - Date.now()) / 864e5) : null;
        return (
          <div key={st.id} className={`ns${st.status === "paused" ? " paused" : ""}`} onClick={() => sel("s:" + st.id)}>
            <span className={`rk${st.rank ? "" : " no"}`} title={st.rankWhy || (st.status === "paused" ? "paused" : "not ranked")}>{st.rank || (st.status === "paused" ? "||" : "")}</span>
            <i style={{ background: st.color }} />
            <div className="nm">
              <div className="nt"><b>{st.name}</b>{st.status === "paused" && <span className="ps">paused</span>}
                {st.moved && st.moved.to && st.moved.to === st.rank && Date.now() - new Date(st.moved.date) < 3 * 864e5 && (
                  <span className={`mvd ${!st.moved.from || st.moved.from > st.moved.to ? "up" : "dn"}`} title={st.moved.after || ""}>
                    {!st.moved.from ? "new in the ranking" : st.moved.from > st.moved.to ? `↑ from ${st.moved.from}` : `↓ from ${st.moved.from}`}</span>)}
                {st.flag && <span className="fl" title="from the review: check whether this stream is still live">{st.flag}</span>}
                {onMe(st.id) > 0 && <span className="on">{onMe(st.id)} yours</span>}</div>
              {st.target && <div className="tgt">{"→"} {st.target}{st.target_date ? ` · ${shortDay(st.target_date + "T12:00:00")}` : ""}
                {td !== null && <span className={td < 0 ? "late" : td <= 3 ? "soon" : ""}>{td < 0 ? ` · ${-td}d ago` : td === 0 ? " · today" : ` · in ${td}d`}</span>}</div>}
              <div className="s">{st.now}</div>
            </div>
          </div>
        );
      })}
      {review && (review.questions || []).length > 0 && tab !== "mine" && (
        <div className="qs"><div className="qh">To settle</div>{review.questions.map((q, i) => <div key={i} className="q">{q}</div>)}</div>
      )}
      {fin.length > 0 && (() => {
        const now = new Date(); now.setHours(0, 0, 0, 0);
        const mon = new Date(now); mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));     // Monday of this week
        const lastMon = new Date(mon); lastMon.setDate(mon.getDate() - 7);
        const when = st => new Date(ended(st) || 0);
        const groupsC = [["This week", fin.filter(st => when(st) >= mon)], ["Last week", fin.filter(st => when(st) >= lastMon && when(st) < mon)],
                         ["Earlier", fin.filter(st => when(st) < lastMon)]].filter(([, xs]) => xs.length);
        return (
          <div className="fin">
            <div className="fh">{"✓"} Closed · {fin.length}
              <span className="tl" onClick={() => dispatch({ type: "FLOW_CLOSED", value: !showClosed })}>{showClosed ? "fold off the timeline" : "show on the timeline"}</span></div>
            {groupsC.map(([label, xs]) => (
              <div key={label} className="fg">
                <div className="fgh">{label}</div>
                {xs.map(st => (
                  <div key={st.id} className="fr2" onClick={() => sel("s:" + st.id)} title={st.why || ""}>
                    <i style={{ background: st.color }} />
                    <span className="fn">{st.name}</span>
                    <span className="fw">{st.ended === "merged" ? `merged into ${(sById[st.mergedInto] || {}).name || "another"}` : (st.why || "finished")}</span>
                    {ended(st) && <span className="dt">{shortDay(ended(st))}</span>}
                  </div>))}
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
  return (
    <div className={`${flowCss} ${flowLists}`} style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden",
                                                         marginRight: -12, paddingRight: 14 }}>
      {tab === "mine" ? [mineList, standList] : [standList, mineList]}
    </div>
  );
};

const FlowView = ({ flow, status, sel, copied, height, me, mine, tab, doneOpen, grpOpen, split, showClosed, dispatch }) => {
  // the owner's steps, with what mine.sh found: done (with evidence), dropped, or still open.
  // Only open ones glow; done ones are struck through with the proof beside them.
  const its = (mine && mine.items) || {};
  const mineAll = n => (n.next || []).map((x, k) => ({ n, x, k, ...(its[`${n.id}:${k}`] || {}), st: (its[`${n.id}:${k}`] || {}).status || "open" }))
                                     .filter(o => isMe(o.x.who, me));
  const mineNext = n => mineAll(n).filter(o => o.st === "open").map(o => o.x);
  const allNodes = ((flow && flow.nodes) || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  // streams closed more than 3 days ago fold off the timeline (their lanes and the meetings that only
  // touched them), so it shows what is in focus now; the archive below the lists brings them back
  const doneAt = st => { const h = (st.history || []).filter(x => x.to === "done" || x.to === "merged").pop();
                         const en = st.endNode && allNodes.find(n => n.id === st.endNode); return h ? h.date : en ? en.date : ""; };
  const folded = new Set(showClosed ? [] : ((flow && flow.streams) || [])
    .filter(st => st.status === "done" && Date.now() - new Date(doneAt(st) || 0) > 3 * 864e5).map(st => st.id));
  const known = new Set(((flow && flow.streams) || []).map(st => st.id));
  const onlyFolded = n => (n.streams || []).some(id => known.has(id)) && (n.streams || []).filter(id => known.has(id)).every(id => folded.has(id));
  const base = tab === "mine"
    ? allNodes.filter(n => mineAll(n).length || (n.said || []).some(x => isMe(x.who, me)))
    : allNodes;
  const nodes = base.filter(n => !onlyFolded(n));
  const foldedN = base.length - nodes.length;
  const myOpen = allNodes.flatMap(mineAll).filter(o => o.st === "open").reverse();
  const myDone = allNodes.flatMap(mineAll).filter(o => o.st === "done").reverse();
  const groups = groupMine(myOpen, mine && mine.groups);
  // the tree takes the top of the pane, the lists the bottom; the divider between them drags
  const topH = Math.round(clamp((split && split.flowTop) || height * 0.5, 140, Math.max(150, height - 170)));
  // Team shows the team's focus (the review's line, or the top of the ranking); Mine shows the owner's
  // own focus from mine.sh. Every copy of the widget is its owner's, so Mine is always "you".
  const top3 = ((flow && flow.streams) || []).filter(x => x.status === "active" && x.rank).sort((a, b) => a.rank - b.rank).slice(0, 3);
  const teamFocus = (flow && flow.teamFocus) || top3.map(x => x.name.replace(/\s*\(.*\)\s*$/, "")).join(" · ");
  const teamWhy = (flow && flow.teamFocusWhy) || (top3.length ? "The top three streams in this week's ranking" : "");
  const myTop = ((mine && mine.groups) || [])[0];
  const focus = tab === "mine" ? ((mine && mine.myFocus) || (myTop && myTop.title) || "") : teamFocus;
  const focusWhy = tab === "mine" ? ((mine && mine.myFocusWhy) || (myTop ? `Your most urgent open item${myTop.waiting ? `; ${myTop.waiting}` : ""}` : "")) : teamWhy;
  const streams = (flow && flow.streams) || [];
  const sById = {}; streams.forEach(x => { sById[x.id] = x; });
  const finished = streams.filter(x => x.status === "done");
  const lanes = [];
  nodes.forEach(n => (n.streams || []).forEach(id => { if (sById[id] && !folded.has(id) && !lanes.includes(id)) lanes.push(id); }));
  const rowOf = {}; nodes.forEach((n, i) => { rowOf[n.id] = i; });
  const span = {};
  lanes.forEach(id => {
    const st = sById[id];
    const first = nodes.findIndex(n => (n.streams || []).includes(id));
    const end = st.status === "done" && st.endNode in rowOf ? rowOf[st.endNode]
              : st.status === "done" ? Math.max(...nodes.map((n, i) => (n.streams || []).includes(id) ? i : -1)) : nodes.length;
    span[id] = { a: first, b: end };
  });
  // columns share about 40% of the width, like the branches in a git flow chart
  const FLOW_LANE = Math.round(clamp((WIDTH * 0.4) / Math.max(1, lanes.length), 20, 72));
  const gw = Math.max(1, lanes.length) * FLOW_LANE + 12;
  const lx = id => 6 + lanes.indexOf(id) * FLOW_LANE + FLOW_LANE / 2;
  const mid = FLOW_ROW / 2;
  const active = streams.filter(x => x.status !== "done" && lanes.includes(x.id));
  const selNode = sel && sel.startsWith("n") ? nodes.find(n => n.id === sel) : null;
  const selStream = sel && sel.startsWith("s:") ? sById[sel.slice(2)] : null;
  const weekday = iso => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString(undefined, { weekday: "short" }); };
  return (
    <div className={panel} style={{ height, display: "flex", flexDirection: "column", position: "relative" }}>
      <div className={head}>
        <span className={flowTabs}>
          {[["team", "Team"], ["mine", "Mine"]].map(([k, l]) => (
            <span key={k} className={tab === k ? "on" : ""} onClick={() => dispatch({ type: "FLOW_TAB", value: k })}>{l}</span>))}
        </span>
        <span className="v">{status}</span>
      </div>
      {focus && (
        <div className={flowFocus} title={focusWhy}>
          <span className="k">{tab === "mine" ? "My focus" : "Team focus"}</span><span className="f">{focus}</span>
        </div>
      )}
      {!nodes.length && (
        <div className={flowCss}>
          <div className="empty">
            {status === "not started"
              ? <span>No flow yet. <span className="lk" onClick={() => buildFlow(dispatch)}>Build it from the last 3 weeks of meetings</span>.</span>
              : `${status || "Starting"}. Each meeting takes a minute or two to read, oldest first, and appears here as it lands.`}
          </div>
        </div>
      )}
      {nodes.length > 0 && (
      <div style={{ flex: `0 0 ${topH}px`, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div className={flowStrip}>
          {(() => {
            // every meeting on one line, no sideways scrolling: each gets an equal share of the
            // width; dates show where there is room (a wider widget shows more of them)
            const per = (WIDTH - 40) / nodes.length;
            return nodes.map((n, i) => {
              const d = new Date(n.date), prev = nodes[i - 1] ? new Date(nodes[i - 1].date) : null;
              const newDay = !prev || prev.toDateString() !== d.toDateString();
              const newWeek = !prev || d.getDay() < prev.getDay() || (d - prev) > 6 * 864e5;
              const label = per >= 44 ? newDay : per >= 22 ? newWeek : i === 0 || newWeek && (i % Math.ceil(30 / per) === 0);
              return (
                <span key={n.id} className={`m${sel === n.id ? " on" : ""}${mineNext(n).length ? " me" : ""}`}
                      title={`${shortDay(n.date)} · ${n.meetingTitle || n.title}${mineNext(n).length ? `\nYours: ${mineNext(n).map(x => x.what).join("; ")}` : ""}`}
                      onClick={() => {
                        dispatch({ type: "FLOW_SEL", value: n.id });
                        const el = document.getElementById("fn-" + n.id);
                        if (el && el.scrollIntoView) el.scrollIntoView({ block: "center", behavior: "smooth" });
                      }}>
                  <b>{label ? shortDay(n.date) : "\u00A0"}</b>
                  <span className="dots">{(n.streams || []).filter(id => sById[id]).slice(0, 4).map(id => <i key={id} style={{ background: sById[id].color }} />)}</span>
                </span>
              );
            });
          })()}
        </div>
        <div className={flowCss} style={{ display: "flex", flex: "0 0 auto", alignItems: "flex-end", marginBottom: 4 }}>
          <div className="when cap">Time</div>
          <div style={{ width: gw, flex: "0 0 auto", position: "relative", height: 30 }}>
            {lanes.map(id => (
              <div key={id} className="lane" title={sById[id].name}
                   onClick={() => dispatch({ type: "FLOW_SEL", value: "s:" + id })}
                   style={{ left: lx(id) - FLOW_LANE / 2, width: FLOW_LANE, color: sById[id].color,
                            opacity: sById[id].status === "done" ? 0.55 : 1 }}>{sById[id].name}</div>
            ))}
          </div>
          <div className="txt cap">What happened</div>
        </div>
        <div className={flowCss} style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden",
                                         marginRight: -12, paddingRight: 12 }}
             ref={el => { if (el && el.dataset.n !== String(nodes.length)) { el.scrollTop = el.scrollHeight; el.dataset.n = String(nodes.length); } }}>
          {(folded.size > 0 || showClosed) && (
            <div className="foldbar" onClick={e => { e.stopPropagation(); dispatch({ type: "FLOW_CLOSED", value: !showClosed }); }}>
              {showClosed
                ? <span>Showing closed streams on the timeline · <b>fold them away</b></span>
                : <span>{"✓"} {folded.size} closed stream{folded.size > 1 ? "s" : ""} folded away{foldedN ? `, ${foldedN} meeting${foldedN > 1 ? "s" : ""}` : ""} · <b>show</b></span>}
            </div>
          )}
          {nodes.map((n, i) => {
            const prev = nodes[i - 1];
            const newDay = !prev || shortDay(prev.date) !== shortDay(n.date);
            const mine = (n.streams || []).filter(id => lanes.includes(id));
            const spawned = (n.spawns || []).filter(id => lanes.includes(id));
            const ending = lanes.filter(id => span[id].b === i && sById[id].status === "done");
            const merged = ending.filter(id => sById[id].mergedInto && lanes.includes(sById[id].mergedInto));
            const dots = mine.filter(id => !spawned.includes(id) || !sById[id].parent);
            const tieX = dots.filter(id => !merged.includes(id)).map(lx);
            const parts = [];
            lanes.forEach(id => {
              const s2 = span[id], col = sById[id].color;
              if (i < s2.a || i > s2.b) return;
              const x = lx(id);
              if (i === s2.a && spawned.includes(id) && sById[id].parent && lanes.includes(sById[id].parent)) {
                const px = lx(sById[id].parent);     // split off its parent: curve out of the parent's dot
                parts.push(<path key={"b" + id} d={`M${px} ${mid} C${px} ${mid + 18} ${x} ${FLOW_ROW - 16} ${x} ${FLOW_ROW}`}
                                 fill="none" stroke={col} strokeWidth="2.2" strokeOpacity=".85" />);
                return;
              }
              if (merged.includes(id)) {                  // folded into another stream: curve into it
                const tx = lx(sById[id].mergedInto);
                parts.push(<path key={"m" + id} d={`M${x} 0 C${x} 16 ${tx} ${mid - 16} ${tx} ${mid}`}
                                 fill="none" stroke={col} strokeWidth="2.2" strokeOpacity=".85" />);
                return;
              }
              const y1 = i === s2.a ? mid : 0;
              const y2 = i === s2.b && sById[id].status === "done" ? mid : FLOW_ROW;
              parts.push(<line key={"l" + id} x1={x} x2={x} y1={y1} y2={y2} stroke={col} strokeWidth="2.2" strokeOpacity=".75" />);
            });
            if (tieX.length > 1) parts.push(<line key="tie" x1={Math.min(...tieX)} x2={Math.max(...tieX)} y1={mid} y2={mid}
                                                  stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />);
            dots.filter(id => !merged.includes(id)).forEach((id, k) => {
              const done = ending.includes(id) && !merged.includes(id);
              parts.push(<circle key={"c" + id} cx={lx(id)} cy={mid} r={done ? 6 : k === 0 ? 5.5 : 4.3}
                                 fill={done ? "rgba(0,0,0,0.35)" : sById[id].color} stroke={sById[id].color} strokeWidth={done ? 1.8 : 1} />);
              if (done) parts.push(<path key={"k" + id} d={`M${lx(id) - 2.6} ${mid} l1.8 1.9 3.4 -3.6`} fill="none"
                                         stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />);
            });
            const badges = [
              ...spawned.map(id => `→ ${(sById[id] || {}).name || id}`),
              ...ending.map(id => merged.includes(id) ? `${sById[id].name} merged in` : `✓ ${sById[id].name} done`),
            ];
            return (
              <div key={n.id} id={"fn-" + n.id} className={`row${sel === n.id ? " on" : ""}${mineNext(n).length ? " me" : ""}`} style={{ height: FLOW_ROW }}
                   onClick={() => dispatch({ type: "FLOW_SEL", value: sel === n.id ? "" : n.id })}>
                <div className="when">
                  {newDay && <div className="day"><b>{shortDay(n.date)}</b> {weekday(n.date)}</div>}
                  <div className="mt">{n.meetingTitle}</div>
                </div>
                <svg width={gw} height={FLOW_ROW} style={{ flex: "0 0 auto" }}>{parts}</svg>
                <div className="txt">
                  <div className="t">{mineNext(n).length > 0 && <span className="yd" title={`Yours: ${mineNext(n).map(x => x.what).join("; ")}`} />}{n.title}</div>
                  {badges.length > 0 && <div className="bd">{badges.join("  ·  ")}</div>}
                  <div className={`s${badges.length ? " s1" : ""}`}>{n.summary}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}
      {nodes.length > 0 && (
        <div style={{ position: "relative", flex: "0 0 12px" }}>
          <div className={splitH} title="drag: more tree or more lists"
               style={{ left: 0, right: 0, top: 0, height: 12 }}
               onMouseDown={e => beginSplit(e, "flowTop", "y", 1, topH, 140, Math.max(150, height - 170), split, CFG.zoom, dispatch)} />
        </div>
      )}
      {nodes.length > 0 && (
        <FlowLists tab={tab} me={me} groups={groups} active={active} finished={finished} sById={sById} flow={flow} showClosed={showClosed}
                   myDone={myDone} doneOpen={doneOpen} grpOpen={grpOpen} nodes={nodes} dispatch={dispatch} />
      )}
      {(selNode || selStream) && (
        <div className={flowCard}>
          <div className="top">
            <div className="x" title="close" onClick={() => dispatch({ type: "FLOW_SEL", value: "" })}>×</div>
            {selNode && <div className="t">{selNode.title}</div>}
            {selStream && <div className="t"><i className="dot" style={{ background: selStream.color }} />{selStream.name}</div>}
            {selNode && <div className="m">{shortDay(selNode.date)} · {selNode.meetingTitle}</div>}
            {selStream && <div className="m">{selStream.company}{selStream.clickup ? ` · ClickUp: ${selStream.clickup}` : " · not in ClickUp yet"} · {selStream.status}</div>}
            {selNode && <div className="chips">{(selNode.streams || []).filter(id => sById[id]).map(id => (
              <span key={id} onClick={() => dispatch({ type: "FLOW_SEL", value: "s:" + id })}><i style={{ background: sById[id].color }} />{sById[id].name}</span>))}</div>}
          </div>
          <div className="body">
            {selNode && (
              <div>
                {mineNext(selNode).length > 0 && <div className="mine"><div className="h">Yours</div>
                  {mineNext(selNode).map((x, k) => <div key={k} className="b">{x.what}</div>)}</div>}
                {selNode.summary && <div className="p">{selNode.summary}</div>}
                {(selNode.done || []).length > 0 && <div><div className="h">Done</div>{selNode.done.map((x, k) => <div key={k} className="b">{x}</div>)}</div>}
                {(selNode.next || []).length > 0 && <div><div className="h">Next</div>{selNode.next.map((x, k) => {
                  const r = isMe(x.who, me) ? (its[`${selNode.id}:${k}`] || {}) : {};
                  const st = r.status || "open";
                  return (
                    <div key={k} className={`b${st !== "open" ? " settled" : ""}`}>
                      {x.who ? <span className={`who${isMe(x.who, me) && st === "open" ? " me" : ""}`}>{x.who}</span> : null}
                      <span className="w">{x.what}</span>
                      {st === "done" && <span className="ok" onClick={() => r.url && openUrl(r.url)}>{"\u2713"} done{r.evidence ? `: ${r.evidence}` : ""}</span>}
                      {st === "dropped" && <span className="ok">dropped{r.evidence ? `: ${r.evidence}` : ""}</span>}
                    </div>);
                })}</div>}
                {(selNode.said || []).length > 0 && <div><div className="h">Who said what</div>{selNode.said.map((x, k) => (
                  <div key={k} className="b"><span className={`who${isMe(x.who, me) ? " me" : ""}`}>{x.who}</span>{x.what}</div>))}</div>}
                {(selNode.links || []).length > 0 && <div><div className="h">Links</div>{selNode.links.map((l, k) => (
                  <div key={k} className="b"><span className="lk" onClick={() => openUrl(l.url)}>{l.kind}: {l.label}</span></div>))}</div>}
              </div>
            )}
            {selStream && (
              <div>
                {selStream.status === "done" && <div><div className="h">{selStream.ended === "merged" ? `Merged into ${(sById[selStream.mergedInto] || {}).name || "another stream"}` : "Finished"}</div>
                  <div className="p">{selStream.why || "no reason written"}</div></div>}
                {selStream.target && <div><div className="h">Building toward</div><div className="p">{selStream.target}{selStream.target_date ? `, ${shortDay(selStream.target_date + "T12:00:00")}` : ""}</div></div>}
                {selStream.rank && <div><div className="h">Rank {selStream.rank} this week</div><div className="p">{selStream.rankWhy || ""}</div></div>}
                <div className="h">Where it stands</div><div className="p">{selStream.now || "not written"}</div>
                <div className="h">Next</div><div className="p">{selStream.next || "not written"}</div>
                {(() => {
                  const mine = allNodes.filter(n => (n.streams || []).includes(selStream.id)).flatMap(n => mineNext(n).map(x => ({ n, x })));
                  return mine.length > 0 && <div className="mine"><div className="h">Yours in this stream</div>
                    {mine.slice(-6).map((o, k) => <div key={k} className="b"><span className="dt">{shortDay(o.n.date)}</span>{o.x.what}</div>)}</div>;
                })()}
                {(selStream.history || []).length > 0 && <div><div className="h">Status history</div>
                  {selStream.history.slice().reverse().slice(0, 8).map((x, k) => (
                    <div key={k} className="b"><span className="dt">{shortDay(x.date)}</span>{x.from ? `${x.from} to ${x.to}` : x.to}{x.why ? `: ${x.why}` : ""}<span style={{ opacity: .55 }}> ({x.by})</span></div>))}</div>}
                <div className="h">How it got here</div>
                {allNodes.filter(n => (n.streams || []).includes(selStream.id)).map(n => (
                  <div key={n.id} className="b lk" onClick={() => dispatch({ type: "FLOW_SEL", value: n.id })}>
                    <span className="dt">{shortDay(n.date)}</span>{n.title}</div>))}
              </div>
            )}
          </div>
          <div className="go">
            {selNode && <span className="btn" onClick={() => copyText(flowNodeMd(selNode, sById), dispatch, selNode.id)}>
              <svg viewBox="0 0 16 16"><rect x="5.5" y="5.5" width="8" height="8" rx="1.6" /><path d="M10.5 4.5v-1a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h1" /></svg>
              {copied === selNode.id ? "Copied" : "Copy"}</span>}
            {selNode && <span className="btn pri" onClick={() => toClaude(`Pick up from this point in our workstreams. Open the linked sources first.\n\n${flowNodeMd(selNode, sById)}`, dispatch)}>
              <svg viewBox="0 0 16 16"><path d="M5 3.5l7 4.5-7 4.5z" /></svg>Work it in Claude</span>}
            {selNode && (selNode.links || []).find(l => l.kind === "Transcript") &&
              <span className="btn" onClick={() => openUrl(selNode.links.find(l => l.kind === "Transcript").url)}>
                <svg viewBox="0 0 16 16"><path d="M3 2.5h7l3 3v8H3z" /><path d="M5.5 8h5M5.5 10.5h5" /></svg>Transcript</span>}
            {selStream && <span className="btn" onClick={() => copyText(flowStreamMd(selStream, nodes), dispatch, "s:" + selStream.id)}>
              <svg viewBox="0 0 16 16"><rect x="5.5" y="5.5" width="8" height="8" rx="1.6" /><path d="M10.5 4.5v-1a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h1" /></svg>
              {copied === "s:" + selStream.id ? "Copied" : "Copy"}</span>}
            {selStream && <span className="btn pri" onClick={() => toClaude(`Get me going on this workstream. Open the linked sources first, then tell me what to do next.\n\n${flowStreamMd(selStream, nodes)}`, dispatch)}>
              <svg viewBox="0 0 16 16"><path d="M5 3.5l7 4.5-7 4.5z" /></svg>Work it in Claude</span>}
          </div>
        </div>
      )}
    </div>
  );
};

function collabMd(c, notes) {
  return [`# ${c.name}`, [c.who && `with ${c.who}`, c.status, c.due && `due ${c.due}`, c.list].filter(Boolean).join(" · "),
          "", ...(notes || []).map(n => `- ${n}`)].join("\n");
}
// The workstream this ClickUp task belongs to: its list name against each stream's ClickUp list,
// then against the stream names; the view opens on that stream, or on the whole flow.
function openInWorkstreams(c, flow, dispatch) {
  const norm = x => String(x || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const list = norm(c.list), name = norm(c.name);
  const st = ((flow && flow.streams) || []).find(x => list && (norm(x.clickup) === list || norm(x.name) === list))
          || ((flow && flow.streams) || []).find(x => { const n2 = norm(x.name); return n2 && (list.includes(n2) || name.includes(n2)); });
  dispatch({ type: "FLOW_SEL", value: st ? "s:" + st.id : "" });
  setView("priorities", dispatch);
}

// ── Prep cards ──
function markPrepSeen(uid, seen, dispatch) {
  const next = Array.from(new Set([uid, ...(seen || [])])).slice(0, 200);
  try { localStorage.setItem(PREP_SEEN_KEY, JSON.stringify(next)); } catch (e) {}
  dispatch({ type: "PREP_SEEN", value: next });
  dispatch({ type: "PREP_OPEN", value: "" });
}
const prepLines = md => String(md || "").split("\n").map(l => l.trim()).filter(Boolean);

// ── The waveform pill: listen on the Mac's microphone, then run what was said ──
const VOICE = `/bin/zsh "${CFG.folder}/desk-widget/voice.sh"`;
let voiceTimer = null;
function toggleVoice(c, team, dispatch) {
  if (c && c.listening) { run(`${VOICE} stop`); return; }
  clearTimeout(voiceTimer);
  dispatch({ type: "CMD", value: { text: "", busy: false, listening: true, focused: true, ok: true, msg: "Starting the microphone…" } });
  run(`${VOICE} start`).then(out => {
    const s = firstLine(out);
    if (s !== "ok") {
      dispatch({ type: "CMD", value: { text: "", busy: false, listening: false, msg: s.replace(/^failed:\s*/, "") || "the microphone did not start" } });
      return;
    }
    const t0 = Date.now();
    const poll = () => run(`${VOICE} poll`).then(o => {
      const line = firstLine(o), i = line.indexOf("\t");
      const st = i < 0 ? line : line.slice(0, i), text = i < 0 ? "" : line.slice(i + 1).trim();
      if (st === "listening" || st === "starting") {
        dispatch({ type: "CMD", value: { text, busy: false, listening: true, focused: true, ok: true,
          msg: st === "starting" ? "Starting the microphone… (macOS may ask for permission the first time)" : "Listening… click the pill again to stop" } });
        if (Date.now() - t0 < (st === "starting" ? 120000 : 45000)) voiceTimer = setTimeout(poll, 350);
        else dispatch({ type: "CMD", value: { text, busy: false, listening: false, msg: "Stopped listening." } });
      } else if (st === "done" && text) {
        const c2 = { text, busy: false, listening: false, focused: true, msg: "" };
        dispatch({ type: "CMD", value: c2 });
        runCommand(c2, team, dispatch);
      } else {
        dispatch({ type: "CMD", value: { text: "", busy: false, listening: false, msg: st === "error" ? text : "I didn't hear anything. Click the waveform and start talking right away." } });
      }
    });
    voiceTimer = setTimeout(poll, 300);
  });
}

// ── Say it: one sentence, one action ──
const CMD = `/bin/zsh "${CFG.folder}/desk-widget/cmd.sh"`;
function runCommand(c, team, dispatch) {
  const text = (c.text || "").trim();
  if (!text || c.busy) return;
  dispatch({ type: "CMD", value: { ...c, busy: true, msg: "" } });
  run(`${CMD} run ${JSON.stringify(b64(text))}`).then(out => {
    let a = {};
    try { a = JSON.parse(firstLine(out)); } catch (e) { a = { action: "claude", prompt: text }; }
    if (a.action === "call") {
      const want = (a.people || []).map(n => String(n).toLowerCase());
      const picked = (team || []).filter(p => want.some(w => p.name.toLowerCase().startsWith(w) || w.startsWith(p.name.toLowerCase()))).map(p => p.id);
      dispatch({ type: "CMD", value: null });
      dispatch({ type: "ZOOM", value: { ...newZoomBox("meet"), topic: a.topic || "", picked } });
    } else if (a.action === "task" && a.title) {
      run(`${CMD} task ${JSON.stringify(b64(JSON.stringify({ title: a.title, due: a.due || "" })))}`).then(r => {
        if (firstLine(r) === "ok") {
          dispatch({ type: "TASK_ADD", title: a.title, meta: `· added by voice${a.due ? `, due ${a.due}` : ""}` });
          dispatch({ type: "CMD", value: { text: "", busy: false, msg: `Added to Tasks: ${a.title}`, ok: true } });
        } else dispatch({ type: "CMD", value: { ...c, busy: false, msg: firstLine(r) || "could not add the task" } });
      });
    } else {
      dispatch({ type: "CMD", value: null });
      toClaude(`From my desk widget: ${a.prompt || text}`, dispatch);
    }
  }).catch(() => dispatch({ type: "CMD", value: { ...c, busy: false, msg: "cmd.sh did not run" } }));
}

// ── Zoom, one click ──
// zoom.sh creates an instant meeting through the Zoom connector, opens it, copies the join link,
// then adds Fireflies and DMs anyone named, in the background (macOS notifications report back).
function startZoom(z, team, dispatch) {
  if (z.busy) return;
  dispatch({ type: "ZOOM", value: { ...z, busy: true, msg: "" } });
  const people = (team || []).filter(p => (z.picked || []).includes(p.id));
  const spec = { kind: z.kind === "meet" ? "meet" : "zoom", topic: (z.topic || "").trim(), people };
  const label = spec.kind === "meet" ? "Google Meet" : "Zoom";
  run(`${ZOOM} start ${JSON.stringify(b64(JSON.stringify(spec)))}`).then(out => {
    const s = firstLine(out);
    if (s.startsWith("ok")) {
      const names = people.map(p => p.name).join(", ");
      const who = !people.length ? "" : spec.kind === "meet"
        ? ` Calendar invites and Slack DMs going to ${names}.` : ` Slack DMs going to ${names}.`;
      dispatch({ type: "ZOOM", value: { ...z, busy: false, done: true,
        msg: `${label} is open and the join link is on your clipboard.${who} Fireflies joins in about 20 seconds.` } });
    } else {
      dispatch({ type: "ZOOM", value: { ...z, busy: false, msg: s.replace(/^failed:\s*/, "") || `could not start the ${label}` } });
    }
  }).catch(err => dispatch({ type: "ZOOM", value: { ...z, busy: false,
    msg: `zoom.sh did not run: ${String((err && err.message) || err || "").slice(0, 160)}` } }));
}
const refreshZooms = dispatch => run(`${ZOOM} recent`).then(out => dispatch({ type: "ZOOMS", value: out }));
const newZoomBox = kind => ({ kind, topic: "", picked: [], busy: false, msg: "", done: false });
function copyZoomLink(z, dispatch) {
  run(`printf %s ${JSON.stringify(b64(z.join))} | base64 -d | pbcopy`).then(() => {
    dispatch({ type: "COPIED", value: z.id });
    setTimeout(() => dispatch({ type: "COPIED", value: "" }), 1800);
  });
}

// ── calendar, written to ──
// gcal.sh answers invitations and creates events on Google Calendar when it has a login, and
// falls back to Calendar.app for plain events when it does not. The feed is re-read right after,
// rather than waiting up to two minutes for the next beat.
const refreshCal = dispatch => run(CAL_CMD).then(out => dispatch({ type: "CAL", value: out }));
let flashTimer = null;
function flash(msg, dispatch, ms = 3500) {
  dispatch({ type: "FLASH", value: msg });
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => dispatch({ type: "FLASH", value: "" }), ms);
}
const firstLine = out => String(out || "").trim().split("\n")[0];
// Google's answer → the value EventKit will report for it (see EK_MINE); accepted reads as ""
const ANSWER = { accepted: "", tentative: "maybe", declined: "declined" };
function respondTo(e, answer, dispatch) {
  if (!e || !e.uid) return;
  dispatch({ type: "EV_BUSY", value: e.uid });
  run(`${GC} respond ${JSON.stringify(e.uid)} ${answer}`).then(out => {
    const s = firstLine(out);
    if (s.startsWith("ok")) {
      dispatch({ type: "SEL_MINE", uid: e.uid, value: ANSWER[answer] });
      flash(`${answer === "tentative" ? "maybe" : answer} — the organiser has been told`, dispatch);
    } else {
      dispatch({ type: "EV_BUSY", value: "" });
      flash(s || "could not answer", dispatch, 6000);
    }
    setTimeout(() => refreshCal(dispatch), 5000);      // Calendar.app syncs the reply back shortly
  });
}
// Calendar.app, at the event's day — it has Accept / Maybe / Decline of its own, so this is the
// one-click answer path when the Google API is not available.
const openInCalApp = e => {
  const at = e && e.start ? Math.round(e.start.getTime() / 1000) : Math.round(Date.now() / 1000);
  run(`${GC} calapp ${at}`);
};
const openInGoogle = (e, dispatch) => {
  if (!e || !e.uid) return;
  const day = e.start ? `${e.start.getFullYear()}-${String(e.start.getMonth() + 1).padStart(2, "0")}-${String(e.start.getDate()).padStart(2, "0")}` : "";
  run(`${GC} open ${JSON.stringify(e.uid)} ${day}`).then(out => {
    const s = firstLine(out);
    if (!s.startsWith("ok")) flash(s || "no Google Calendar page for this one", dispatch, 5000);
  });
};
function newCompose() {
  const d = new Date(); d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);   // the next half hour
  const pad = n => String(n).padStart(2, "0");
  return { title: "", date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
           start: `${pad(d.getHours())}:${pad(d.getMinutes())}`, minutes: 30, allday: false,
           attendees: "", meet: true, location: "", notes: "", quick: "", busy: false };
}
function afterCreate(out, c, dispatch, doneMsg) {
  const s = firstLine(out);
  if (s.startsWith("ok")) {
    dispatch({ type: "COMPOSE", value: null });
    flash(s.includes("Calendar.app")
            ? "added through Calendar.app" + (s.includes("need Google") ? " — no invitations sent from here yet" : "")
            : doneMsg, dispatch, 5000);
    setTimeout(() => refreshCal(dispatch), 1500);
  } else {
    dispatch({ type: "COMPOSE", value: { ...c, busy: false } });
    flash(s || "could not create", dispatch, 6000);
  }
}
function submitCompose(c, dispatch) {
  if (!c) return;
  if (!c.title.trim()) { flash("give it a title", dispatch); return; }
  dispatch({ type: "COMPOSE", value: { ...c, busy: true } });
  const spec = { title: c.title, date: c.date, start: c.start, minutes: c.minutes, allday: c.allday,
                 attendees: c.attendees, meet: c.meet, location: c.location, notes: c.notes };
  run(`${GC} create ${JSON.stringify(b64(JSON.stringify(spec)))}`)
    .then(out => afterCreate(out, c, dispatch, c.attendees.trim() ? "created — invitations sent" : "created"));
}
function quickAdd(c, dispatch) {
  const t = (c.quick || "").trim();
  if (!t) return;
  dispatch({ type: "COMPOSE", value: { ...c, busy: true } });
  run(`${GC} quick --b64 ${JSON.stringify(b64(t))}`).then(out => afterCreate(out, c, dispatch, "added"));
}

function setView(v, dispatch) {
  try { localStorage.setItem("msbai_view", v); } catch (e) {}
  dispatch({ type: "VIEW", value: v });                 // the tab highlight flips immediately

  // panes hides the other apps; quitting is what actually clears their Dock icons, so any app
  // listed in quitOnLeave is asked to quit as well. It is asked, not killed — an app with
  // unsaved work still gets to put up its own dialog.
  (CFG.quitOnLeave || []).forEach(k => {
    const a = appByKey(k);
    if (a && a.key !== v) run(`${DOCK} app-quit ${JSON.stringify(a.name)}`);
  });

  if (v === "desk") {
    setPane("");
    // back on the desk: bring the terminal thread you were last on straight back into its slot,
    // in front, rather than leaving it behind whatever app had focus
    setTimeout(() => { if (lastThread) focusThread(lastThread, dispatch); }, 200);
    return;
  }
  if (v === "settings" || OWN_VIEWS.some(o => o.key === v)) { setPane(""); return; }   // nothing to park: one call
  const app = appByKey(v);
  if (app) setTimeout(() => setPane(app.name), 120);    // the slot only exists after the re-render
}

const newThread   = (dispatch, kind = "desktop") => { const r = dockRect(); if (r) tell(`new ${r.join(" ")} ${kind === "openclaw" ? "openclaw" : "desktop"}`, dispatch); };
const focusThread = (id, dispatch) => { const r = dockRect(); if (r) tell(`focus ${id} ${r.join(" ")}`, dispatch); };
// Closing the thread on screen brings up its neighbour, so the slot is never left showing
// nothing while other threads are still open.
const closeThread = (id, wasShown, dispatch) =>
  run(`${DOCK} close ${id}`).then(out => {
    dispatch({ type: "TABS", value: out });
    const rest = parseTabs(out || "");
    if (wasShown && rest.length) focusThread(rest[0].id, dispatch);
  });
const hideThreads = dispatch       => tell("hide", dispatch);

// ───────────────────────── styles ─────────────────────────
const font = `-apple-system, "SF Pro Display", "SF Pro Text", Helvetica, sans-serif`;
const LBL = 22;   // px gutter for the hour labels — two digits, not a column
const right = CFG.timeSide === "right";

// Übersicht's wrapper is reduced to a zero-size anchor: all geometry lives on #msbai-shell so
// that dragging and zooming have a single element to act on.
export const className = `
  position: fixed; top: 0; left: 0; width: 0; height: 0;
  font-family: ${font}; -webkit-font-smoothing: antialiased;
  color: #fff; font-size: 12px;
`;
const panel = css`
  position: relative;
  border-radius: ${GLASS.radius};
  padding: 18px 20px; box-sizing: border-box;

  /* The frosted pane lives here rather than on the element itself. React re-renders panel
     content every stats tick; a pseudo-element is outside the React tree, so its compositing
     layer is never invalidated and the blur no longer pops between a cheap and a full raster. */
  &:before {
    content: "";
    position: absolute; inset: 0; box-sizing: border-box;
    border-radius: inherit;
    background: ${GLASS.bg};
    ${FROST}
    border: ${GLASS.border};
    box-shadow: ${GLASS.shadow};
    pointer-events: none;
    z-index: 0;
  }
  > * { position: relative; z-index: 1; }
`;
// Übersicht applies `className` to its own wrapper around this, and that wrapper has a single
// child, so a gap set there separates nothing. The column lives here, on the element we return.
const shell = css`
  display: flex; flex-direction: column; gap: ${CFG.gap}px;
  /* No scrollbars anywhere in the widget. Everything still scrolls with the wheel or trackpad. */
  &, & * { scrollbar-width: none; }
  & *::-webkit-scrollbar, & *:hover::-webkit-scrollbar, &::-webkit-scrollbar
    { width: 0 !important; height: 0 !important; display: none !important; background: transparent; }
`;
const wideGrip = css`
  position: absolute; z-index: 40; top: 24px; bottom: 0; right: -${CFG.gap}px; width: ${CFG.gap}px; cursor: ew-resize;
  &:after { content: ""; position: absolute; top: 26px; bottom: 26px; left: 50%; width: 2px; margin-left: -1px;
            border-radius: 2px; background: ${ACCENT.cal}; opacity: 0; transition: opacity .15s; }
  &:hover:after { opacity: 1; }
`;
const dragTab = css`cursor: grab; &:active { cursor: grabbing; }`;

// Splitters are absolute overlays sitting in the gaps that already exist, so showing them
// costs no layout at all. Invisible until the pointer is over them.
const splitBase = `
  position: absolute; z-index: 6;
  &:after { content: ""; position: absolute; border-radius: 2px;
            background: rgba(255,255,255,0.2); opacity: 0; transition: opacity .15s, background .15s; }
  &:hover:after { opacity: 1; background: ${ACCENT.cal}; }
`;
const splitV = css`
  ${splitBase}
  cursor: ew-resize;
  &:after { top: 26px; bottom: 26px; left: 50%; width: 2px; margin-left: -1px; }
`;
const splitH = css`
  ${splitBase}
  cursor: ns-resize;
  &:after { left: 26px; right: 26px; top: 50%; height: 2px; margin-top: -1px; }
`;
const row = css`display: flex; gap: ${CFG.gap}px; align-items: stretch; position: relative;`;
const col = css`display: flex; flex-direction: column; gap: ${CFG.gap}px; position: relative;`;
const head = css`
  display: flex; justify-content: space-between; align-items: baseline;
  font-size: 9px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;
  color: ${GLASS.label}; margin-bottom: 10px;
  .v { color: ${GLASS.sub}; font-weight: 700; letter-spacing: .5px; }
  .tabs { display: flex; align-items: baseline; gap: 6px; }
  .tab { cursor: pointer; opacity: .45; user-select: none; }
  .tab:hover { opacity: .8; }
  .tab.on { opacity: 1; color: rgba(255, 255, 255, 0.9); }
  .bar { opacity: .3; }
`;
// A task is a title you can tick, and — when the entry in TASKS.md carries sub-bullets — a
// disclosure that opens to them: context in plain language, then the Slack threads, documents
// and emails it takes to do the thing, each a link. The row is a div and not a <label> on
// purpose: a label would tick the box for any click on the text, and the text is the disclosure.
// The task list scrolls with the wheel or trackpad but draws no scrollbar, so the right edge is
// free for the highlight tray's hot zone.
const noBar = css`
  scrollbar-width: none;
  &::-webkit-scrollbar, &:hover::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none; background: transparent; }
`;
const taskRow = css`
  display: flex; gap: 12px; align-items: flex-start; padding: 6px 0;
  border-top: 1px solid ${GLASS.hair};
  &:first-of-type { border-top: 0; padding-top: 0; }
  /* The box hangs a little into the panel's gutter, so the text column starts where the TASKS
     label does. Drawn here, not by the OS: a stock checkbox is a bright white square. */
  input { appearance: none; -webkit-appearance: none; flex: 0 0 auto; cursor: pointer;
          width: 13px; height: 13px; margin: 2px 0 0 -7px; border-radius: 4px;
          border: 1.5px solid rgba(255,255,255,0.32); background: transparent;
          transition: border-color .15s, background .15s; }
  input:hover { border-color: #fff; background: rgba(255,255,255,0.12); }
  input:checked { border-color: ${ACCENT.cal}; background: ${ACCENT.cal}; }
  .body { flex: 1 1 auto; min-width: 0; }
  .t { font-weight: 600; line-height: 1.25; display: flex; gap: 5px; align-items: baseline; }
  /* the header of a task (title and meta line) is a handle, not text: pressing and dragging it moves
     the task and never paints a selection. Open notes and news stay selectable. */
  .t, .m { -webkit-user-select: none; user-select: none; }
  .body { -webkit-tap-highlight-color: transparent; }
  .chev { flex: 0 0 auto; width: 9px; font-size: 10px; color: ${GLASS.sub}; transition: color .15s; }
  .body:hover .chev { color: #fff; }
  .m { color: ${GLASS.sub}; font-size: 11px; margin-top: 2px; }
  .tag { color: ${ACCENT.cal}; }
  position: relative;
  /* the row being dragged: lifted a little and see-through, so you can see where it will land */
  &.dragging { opacity: .6; background: rgba(255,255,255,0.06); border-radius: 6px; }
  /* highlight: a soft wash of the color behind the row and a bar at its edge */
  &.marked { background: linear-gradient(90deg, rgba(var(--mkrgb),0.16), rgba(var(--mkrgb),0.04) 70%, transparent);
             box-shadow: inset 2px 0 0 var(--mk); border-radius: 6px; margin: 0 -6px 0 -10px; padding-left: 10px; padding-right: 6px; }
  /* the swatch pop-up a double-click opens */
  /* the hot edge: the last few pixels on the right of a row. A faint line shows on row hover, and
     it fills while you rest there, so you can see the tray is coming. */
  .mkzone { position: absolute; z-index: 5; right: -14px; top: 0; bottom: 0; width: 14px; cursor: pointer; }
  .mkzone:after { content: ""; position: absolute; right: 5px; top: 25%; bottom: 25%; width: 2px; border-radius: 2px;
                  background: rgba(255,255,255,0.14); opacity: 0; transition: opacity .15s; }
  &:hover .mkzone:after { opacity: 1; }
  .mkzone:hover:after { background: linear-gradient(to top, #FF9ECF, #FFE566, #8FD8FF); opacity: 1;
                        animation: mkFill ${MARK_HOVER_MS}ms linear both; }
  @keyframes mkFill { from { clip-path: inset(100% 0 0 0); } to { clip-path: inset(0 0 0 0); } }
  .mkpop { position: absolute; z-index: 60; right: -14px; top: 50%; display: flex; align-items: center; gap: 6px;
           padding: 5px 7px; border-radius: 9px 0 0 9px; background: rgba(28,30,36,0.94); border: 1px solid rgba(255,255,255,0.14);
           border-right: 0; box-shadow: -6px 6px 18px rgba(0,0,0,0.4); animation: mkSlide .2s cubic-bezier(.2,.8,.2,1) both; }
  @keyframes mkSlide { from { opacity: 0; transform: translate(14px, -50%); } to { opacity: 1; transform: translate(0, -50%); } }

  .mkpop .sw { width: 14px; height: 14px; border-radius: 4px; cursor: pointer; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.25);
               transition: transform .12s; }
  .mkpop .sw:hover { transform: scale(1.18); }
  .mkpop .sw.on { box-shadow: 0 0 0 2px rgba(28,30,36,1), 0 0 0 3.5px #fff; }
  .mkpop .clr, .mkpop .pn { font-size: 10px; font-weight: 700; color: ${GLASS.label}; cursor: pointer; padding: 0 2px; }
  .mkpop .pn { border-left: 1px solid rgba(255,255,255,0.14); padding-left: 7px; margin-left: 1px; }
  .mkpop .clr:hover, .mkpop .pn:hover { color: #fff; }
  &.pin .t { color: ${ACCENT.pin}; }
  &.pin .t .chev { color: ${ACCENT.pin}; opacity: .7; }
  /* notify mode: a task with news from watch.sh. The title shimmers slowly and glows until "got it". */
  @keyframes wkSweep { from { background-position: 0% 0; } to { background-position: -200% 0; } }
  &.notify .t .nt { background-image: linear-gradient(90deg, #fff 0%, #fff 18%, ${ACCENT.notify} 38%, #E9DDFF 50%, ${ACCENT.notify} 62%, #fff 82%, #fff 100%);
                     background-size: 200% 100%; background-repeat: repeat-x;
                     -webkit-background-clip: text; background-clip: text; -webkit-box-decoration-break: clone;
                     -webkit-text-fill-color: transparent; color: transparent;
                    animation: wkSweep 6s linear infinite; }
  .news { margin: 6px 0 2px 13px; padding: 6px 9px; border-radius: 8px; font-size: 11px; line-height: 1.45;
          background: rgba(201,168,255,0.08); border: 1px solid rgba(201,168,255,0.28); color: rgba(255,255,255,0.88); }
  .news .nw + .nw { margin-top: 5px; padding-top: 5px; border-top: 1px solid ${GLASS.hair}; }
  .news .src { font-weight: 700; color: ${ACCENT.notify}; margin-right: 6px; }
  .news .nx { color: ${GLASS.sub}; margin-top: 2px; }
  .news .lk { color: ${ACCENT.link}; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
  .news .acts { display: flex; gap: 12px; justify-content: flex-end; margin-top: 5px; font-size: 10.5px; font-weight: 700; }
  .news .acts span { color: ${GLASS.label}; cursor: pointer; }
  .news .acts span:hover { color: #fff; }
  .notes { margin: 7px 0 2px 13px; padding-left: 9px; border-left: 1px solid ${GLASS.hair};
           font-size: 11px; line-height: 1.45; color: rgba(255,255,255,0.82); }
  .note { padding: 2px 0; }
  .note.src { color: ${GLASS.label}; font-size: 10px; margin-top: 3px; }
  .note .lk { color: ${ACCENT.link}; cursor: pointer; text-decoration: underline;
              text-underline-offset: 2px; text-decoration-thickness: 1px; }
  .note .lk:hover { color: #fff; }
  .note .kind { font-weight: 700; color: ${GLASS.sub}; }
  /* collab row icons: work it, copy, see it in Workstreams */
  .ic { flex: 0 0 auto; padding-left: 9px; cursor: pointer; color: ${GLASS.label}; line-height: 0; align-self: center; }
  .ic svg { width: 13px; height: 13px; display: block; fill: none; stroke: currentColor;
            stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
  .ic:hover { color: #fff; }
  .ic.done { color: ${ACCENT.cpu}; }
  /* top right of an open row: copy the entry as markdown */
  .cp { margin-left: auto; flex: 0 0 auto; padding-left: 8px; cursor: pointer;
        color: ${GLASS.label}; line-height: 0; align-self: center; }
  .cp svg { width: 13px; height: 13px; display: block; fill: none; stroke: currentColor;
            stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
  .cp:hover { color: #fff; }
  .cp.done { color: ${ACCENT.cpu}; }
`;
// A folded System or Meetings panel: the label, a chevron, one line. The same header the open
// panel has, so folding reads as the body leaving rather than the panel changing.
const foldHead = css`
  display: flex; justify-content: space-between; align-items: center; cursor: pointer;
  font-size: 9px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;
  color: ${GLASS.label}; height: 100%;
  .v { color: ${GLASS.sub}; font-weight: 700; letter-spacing: .5px; }
  .chev { font-size: 9px; color: ${GLASS.label}; margin-right: 6px; }
  &:hover, &:hover .chev { color: #fff; }
`;
const headBtn = css`cursor: pointer; &:hover { color: #fff; } .chev { font-size: 9px; margin-right: 6px; }`;

// ── system stats ──
const gaugeRow = css`display: flex; justify-content: space-between; align-items: flex-start;`;
const gaugeBox = css`
  display: flex; flex-direction: column; align-items: center; position: relative; flex: 1;
  svg { width: 64px; height: 64px; transform: rotate(-90deg); }
  circle { fill: none; stroke-width: 5; stroke-linecap: round; }
  .bg { stroke: ${GLASS.hair}; }
  .fg { transition: stroke-dasharray .6s ease-in-out; }
  .val { position: absolute; top: 32px; left: 50%; transform: translate(-50%, -50%);
         font-size: 11px; font-weight: 700; text-align: center; line-height: 1.1; }
  .sub { display: block; font-size: 7px; font-weight: 600; color: ${GLASS.sub}; margin-top: 1px; }
  .lbl { font-size: 9px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;
         color: ${GLASS.label}; margin-top: 8px; }
`;
const procRow = css`
  display: flex; align-items: center; gap: 8px; margin-top: 7px; font-size: 10.5px;
  .n { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: ${GLASS.sub}; }
  .p { font-variant-numeric: tabular-nums; font-weight: 700; color: rgba(255,255,255,0.85); }
  .bar { width: 46px; height: 4px; border-radius: 2px; background: ${GLASS.hair}; overflow: hidden; }
  .bar i { display: block; height: 100%; border-radius: 2px; background: ${ACCENT.cpu}; }
`;

// ── terminal ──
const tabBar = css`
  display: flex; align-items: flex-end; gap: 4px; padding: 0 6px;
  overflow-x: auto; scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
`;
const tab = css`
  display: flex; align-items: center; gap: 6px; flex: 0 0 auto; max-width: 150px;
  padding: 3px 11px 4px; border-radius: 10px 10px 0 0; cursor: pointer;
  background: rgba(255,255,255,0.08); border: ${GLASS.border}; border-bottom: 0;
  color: ${GLASS.sub}; font-size: 10px; font-weight: 600; line-height: 1.25;
  .g { font-size: 10px; opacity: .8; }
  .l { white-space: nowrap; text-overflow: ellipsis; overflow: hidden; }
  .x { opacity: 0; font-size: 12px; line-height: 1; color: ${GLASS.label}; }
  &:hover { background: rgba(255,255,255,0.14); color: #fff; }
  &:hover .x { opacity: 1; }
  &.on { background: rgba(255,255,255,0.16); color: #fff; border-color: rgba(90,200,250,0.4); }
`;
const tabAdd = css`
  flex: 0 0 auto; padding: 3px 12px 4px; border-radius: 10px 10px 0 0; cursor: pointer;
  border: 1px dashed rgba(255,255,255,0.2); border-bottom: 0; color: ${GLASS.label};
  font-size: 10px; font-weight: 700; letter-spacing: .5px;
  &:hover { border-color: ${ACCENT.cal}; color: ${ACCENT.cal}; }
`;
const tabSpacer = css`flex: 1 1 auto;`;
// Every block is spaced by the root gap alone; nothing adds its own.
const paneBlock = css`padding: 0; position: relative;`;
const tabHide = css`
  flex: 0 0 auto; padding: 3px 9px 4px; border-radius: 10px; cursor: pointer;
  color: ${GLASS.label}; font-size: 10px; font-weight: 700;
  &:hover { color: #fff; background: rgba(255,255,255,0.1); }
`;
// Both strips sit in a short wrapper and are lifted mostly out of sight, leaving a bump. The
// wrapper keeps a generous hover area so they come up before the pointer actually lands on them.
const viewTab = css`
  display: flex; align-self: flex-start; gap: 2px; padding: 2px;
  border-radius: 999px; background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.08);

  span { padding: 3px 11px; border-radius: 999px; cursor: pointer;
         font-size: 9px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;
         color: ${GLASS.label}; }
  span.on { background: rgba(255,255,255,0.16); color: #fff; }
`;
const storageRow = css`
  display: flex; align-items: center; gap: 9px; margin-top: 12px;
  padding-top: 11px; border-top: 1px solid ${GLASS.hair}; font-size: 10px;
  .bar { flex: 1; height: 5px; border-radius: 3px; background: ${GLASS.hair}; overflow: hidden; }
  .bar i { display: block; height: 100%; border-radius: 3px; background: ${ACCENT.disk}; }
  .v { color: ${GLASS.sub}; font-variant-numeric: tabular-nums; white-space: nowrap; font-weight: 600; }
`;
const claudePane = css`
  position: relative; z-index: 2;
  height: ${CFG.claudeHeight}px; border-radius: ${GLASS.radius}; cursor: pointer;
  border: 1px dashed rgba(255,255,255,0.18);
  display: flex; align-items: center; justify-content: center;
  color: rgba(255,255,255,0.28); font-size: 9px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;
  &:hover { border-color: rgba(203,211,222,0.6); color: rgba(203,211,222,0.85); }
`;
const dock = css`
  position: relative; z-index: 2;
  height: ${CFG.dockHeight}px; border-radius: ${GLASS.radius}; cursor: pointer;
  border: 1px dashed rgba(255,255,255,0.18);
  display: flex; align-items: center; justify-content: center;
  color: rgba(255,255,255,0.28); font-size: 9px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;
  &:hover { border-color: rgba(203,211,222,0.6); color: rgba(203,211,222,0.85); }
`;

// ── calendar ──
const grid = css`
  position: relative;
  ${right ? `margin-right: ${LBL}px; border-right: 1px solid rgba(255,255,255,0.16);`
          : `margin-left: ${LBL}px; border-left: 1px solid rgba(255,255,255,0.16);`}
`;
// border-box, or every row is hourH + 1px of border while events are placed at exactly hourH
// per hour — the grid drifted a pixel an hour, so by 11 the label sat well below 11's meeting.
const hourRow = css`
  border-top: 1px solid ${GLASS.hair}; position: relative; box-sizing: border-box;
  .lbl { position: absolute; top: -7px; width: ${LBL - 6}px;
         ${right ? `right: -${LBL}px; text-align: left; padding-left: 6px;`
                 : `left: -${LBL}px; text-align: right;`}
         font-size: 10px; font-weight: 600; color: ${GLASS.label}; font-variant-numeric: tabular-nums; }
`;
// Colour, left bar and tint all come from the event's own calendar at render time, so this
// only carries what every event shares. Apple's widget marks four states on top of that:
// cancelled and declined are struck through, tentative and unanswered are outlined rather
// than filled, so an invitation you have not replied to never looks like a commitment.
const evt = css`
  position: absolute; border-radius: 9px; padding: 4px 8px; overflow: hidden; box-sizing: border-box;
  cursor: pointer; transition: filter .15s;
  border-left: 3px solid ${ACCENT.cal};
  &:hover { filter: brightness(1.35); }
  .t { font-weight: 600; font-size: 11.5px; line-height: 1.2; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; }
  .s { font-size: 10px; color: ${GLASS.sub}; font-variant-numeric: tabular-nums;
       white-space: nowrap; text-overflow: ellipsis; overflow: hidden; }
  .b { font-size: 8.5px; font-weight: 800; letter-spacing: .6px; text-transform: uppercase;
       opacity: .95; margin-left: 5px; }
  &.past { opacity: .38; }
  &.off  { opacity: .45; }
  &.off .t, &.gone .t { text-decoration: line-through; }
  &.gone { opacity: .5; }
  &.hollow { background-image: none !important; border-style: dashed;
             border-top: 1px dashed; border-right: 1px dashed; border-bottom: 1px dashed; }
`;
// "Up Next" — the one line Apple's widget leads with, so the next thing is readable without
// reading the grid. In progress it counts down to the end instead of the start.
const upNext = css`
  display: flex; align-items: center; gap: 7px; margin-bottom: 9px;
  font-size: 11px; line-height: 1.3; min-width: 0;
  .dot { flex: 0 0 auto; width: 7px; height: 7px; border-radius: 50%; background: ${ACCENT.cal}; }
  .k { flex: 0 0 auto; font-size: 8.5px; font-weight: 800; letter-spacing: 1px;
       text-transform: uppercase; color: ${GLASS.label}; }
  .t { font-weight: 600; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; min-width: 0; }
  .w { flex: 0 0 auto; color: ${GLASS.sub}; font-variant-numeric: tabular-nums; margin-left: auto; }
  &.clear .t { color: ${GLASS.label}; font-weight: 500; }
`;
// The rolling 12h window routinely crosses midnight; without this the grid silently restarts
// at 1 and yesterday's evening sits directly above tomorrow's morning.
const dayLine = css`
  position: absolute; left: 0; right: 0; z-index: 2; height: 0;
  border-top: 1px dashed rgba(255,255,255,0.3);
  span { position: absolute; top: -6px; ${right ? "left: 4px;" : "right: 4px;"}
         padding: 0 6px; border-radius: 6px; background: rgba(40,42,48,0.92);
         font-size: 8.5px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;
         color: ${GLASS.sub}; }
`;
// Sized to be read, not to be tucked into a corner: it spans the whole cluster and is free to
// cover Tasks, System and Meetings. Vertically it grows to fit and stops at the row's height,
// so long notes scroll inside the card rather than pushing it past the panels it sits on.
// The event card: the same glass as the rest of the widget, tinted by the event's calendar color,
// rising in with its sections following a beat behind.
const evCard = css`
  position: absolute; z-index: 30; left: 0; right: 0; top: 0; max-height: 100%; box-sizing: border-box; overflow: auto;
  outline: none; cursor: default; border-radius: ${GLASS.radius};
  background: linear-gradient(180deg, rgba(var(--ev), 0.16), rgba(var(--ev), 0) 170px), rgba(24,26,31,0.95);
  border: 1px solid rgba(255,255,255,0.16); box-shadow: 0 28px 70px rgba(0,0,0,0.6), inset 3px 0 0 rgba(var(--ev), 0.9);
  padding: 20px 24px 16px 26px; font-size: 13.5px; line-height: 1.5; color: #fff;
  animation: evIn .32s cubic-bezier(.2,.85,.25,1) both;
  @keyframes evIn { from { opacity: 0; transform: translateY(10px) scale(.985); } to { opacity: 1; transform: none; } }
  @keyframes evUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  & > .hd, & > .acts, & > .sec, & > .ft, & > .hint { animation: evUp .34s cubic-bezier(.2,.85,.25,1) both; }
  & > .acts { animation-delay: .05s; } & > .sec { animation-delay: .1s; } & > .sec + .sec { animation-delay: .14s; }
  & > .ft { animation-delay: .18s; }
  .x { position: absolute; z-index: 10; top: 14px; right: 16px; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center;
       justify-content: center; cursor: pointer; color: ${GLASS.sub}; font-size: 17px; background: rgba(255,255,255,0.06); transition: background .15s, color .15s, transform .15s; }
  .x:hover { color: #fff; background: rgba(255,255,255,0.14); transform: rotate(90deg); }
  .cal { display: flex; align-items: center; gap: 7px; font-size: 10px; font-weight: 800; letter-spacing: .9px; text-transform: uppercase; color: ${GLASS.sub}; }
  .cal > i { width: 8px; height: 8px; border-radius: 50%; background: rgb(var(--ev)); box-shadow: 0 0 8px rgba(var(--ev), 0.8); }
  .cal .bdg { margin-left: 4px; padding: 1px 7px; border-radius: 999px; font-size: 9px; letter-spacing: .5px; color: ${ACCENT.reply};
              border: 1px solid rgba(100,210,255,0.45); background: rgba(100,210,255,0.08); }
  .t { font-weight: 700; font-size: 21px; line-height: 1.22; letter-spacing: -0.3px; margin-top: 7px; padding-right: 34px; }
  .when { margin-top: 6px; color: rgba(255,255,255,0.78); font-size: 13.5px; font-variant-numeric: tabular-nums; }
  .live { display: inline-flex; align-items: center; gap: 8px; margin-top: 10px; padding: 4px 11px 4px 9px; border-radius: 999px;
          font-size: 11.5px; font-weight: 700; background: rgba(255,255,255,0.07); color: ${GLASS.sub}; }
  .live .dot { position: relative; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
  .live.now { color: #5EF0A0; background: rgba(94,240,160,0.1); }
  .live.soon { color: ${ACCENT.reply}; background: rgba(100,210,255,0.1); }
  /* The live pulse is a ring that scales and fades: transform and opacity only, so the GPU
     draws it at full frame rate. (Animating box-shadow repainted every frame and stuttered.) */
  .live.now .dot:after, .live.soon .dot:after { content: ""; position: absolute; inset: 0; border-radius: 50%; background: currentColor;
    animation: evRipple 1.8s cubic-bezier(.2,.6,.3,1) infinite; will-change: transform, opacity; transform: translateZ(0); }
  @keyframes evRipple { 0% { transform: scale(1); opacity: .65; } 100% { transform: scale(3.4); opacity: 0; } }
  .live .pb { width: 70px; height: 3px; border-radius: 2px; background: rgba(255,255,255,0.15); overflow: hidden; }
  .live .pb i { display: block; height: 100%; background: currentColor; border-radius: 2px; transition: width .6s; }
  .acts { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 16px; }
  .join { display: inline-flex; align-items: center; gap: 8px; padding: 10px 20px 10px 16px; border-radius: 12px; cursor: pointer;
          font-weight: 800; font-size: 13.5px; color: #071018; background: linear-gradient(180deg, #8FD0FF, ${ACCENT.link});
          box-shadow: 0 6px 18px rgba(76,180,255,0.3); transition: transform .15s, box-shadow .15s, filter .15s; }
  .join svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
  .join:hover { transform: translateY(-1px); filter: brightness(1.08); box-shadow: 0 10px 24px rgba(76,180,255,0.4); }
  .join:active { transform: translateY(0) scale(.98); }
  .join { position: relative; }
  /* the "it's time" glow: a halo layer that fades in and out, again transform and opacity only */
  .join.hot:after { content: ""; position: absolute; inset: -4px; border-radius: 15px; pointer-events: none;
    box-shadow: 0 0 0 2px rgba(76,180,255,0.45), 0 0 24px rgba(76,180,255,0.65);
    opacity: 0; animation: evGlow 2.2s ease-in-out infinite; will-change: opacity, transform; transform: translateZ(0); }
  @keyframes evGlow { 0%, 100% { opacity: 0; transform: scale(.97); } 50% { opacity: 1; transform: scale(1); } }
  .join.alt { color: #fff; background: rgba(255,255,255,0.12); box-shadow: none; border: 1px solid rgba(255,255,255,0.2); }
  .chip { padding: 7px 12px; border-radius: 10px; cursor: pointer; font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.85);
          background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); transition: background .15s, color .15s; white-space: nowrap; }
  .chip:hover { background: rgba(255,255,255,0.13); color: #fff; }
  .chip.ok { color: ${ACCENT.cpu}; border-color: rgba(52,199,89,0.4); }
  .sec { margin-top: 16px; padding-top: 14px; border-top: 1px solid ${GLASS.hair}; }
  .lh { font-size: 9px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: ${GLASS.label}; margin-bottom: 9px; }
  .rsvp { display: flex; align-items: center; gap: 12px; }
  .rsvp .lb { font-size: 12.5px; font-weight: 700; color: ${GLASS.sub}; }
  .seg { display: inline-flex; padding: 3px; border-radius: 11px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); }
  .seg span { padding: 5px 15px; border-radius: 8px; font-size: 12.5px; font-weight: 700; color: rgba(255,255,255,0.75); cursor: pointer; transition: background .18s, color .18s; }
  .seg span:hover { color: #fff; }
  .seg span.on { background: rgba(255,255,255,0.9); color: #0b1016; }
  .seg span.on.no { background: rgba(255,95,95,0.9); color: #fff; }
  .seg span.dis { opacity: .45; cursor: default; }
  .rsvp .need { font-size: 11.5px; font-weight: 700; color: ${ACCENT.reply}; }
  .row { display: flex; gap: 9px; align-items: flex-start; color: rgba(255,255,255,0.85); }
  .row svg { flex: 0 0 auto; width: 15px; height: 15px; margin-top: 2px; fill: none; stroke: ${GLASS.sub}; stroke-width: 1.4; }
  .row + .lh, .loc + .lh { margin-top: 14px; }
  .ppl { display: flex; flex-wrap: wrap; gap: 6px; }
  .pp { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px 3px 3px; border-radius: 999px; cursor: pointer;
        background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08); animation: evUp .3s cubic-bezier(.2,.85,.25,1) both;
        transition: background .15s; }
  .pp:hover { background: rgba(255,255,255,0.13); }
  .pp i { position: relative; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
          font-style: normal; font-size: 9px; font-weight: 800; color: #fff; }
  .pp i:after { content: ""; position: absolute; right: -1px; bottom: -1px; width: 7px; height: 7px; border-radius: 50%;
                border: 1.5px solid rgb(24,26,31); background: rgba(255,255,255,0.35); }
  .pp.accepted i:after { background: #34C759; } .pp.declined i:after { background: #FF5F5F; } .pp.tentative i:after { background: #F5C542; }
  .pp.more i { background: rgba(255,255,255,0.12); } .pp.more i:after { display: none; }
  .pp .pn { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.9); }
  .pp.me .pn { color: #fff; } .pp.declined .pn { color: ${GLASS.label}; text-decoration: line-through; text-decoration-color: rgba(255,255,255,0.3); }
  .n { color: rgba(255,255,255,0.82); line-height: 1.55; word-break: break-word; }
  .n .gap { height: 8px; } .n .bul { padding-left: 15px; text-indent: -15px; }
  .n .fade { -webkit-mask-image: linear-gradient(180deg, #000 60%, transparent); mask-image: linear-gradient(180deg, #000 60%, transparent); }
  .tg { display: inline-block; margin-top: 6px; font-size: 11.5px; font-weight: 700; color: ${ACCENT.link}; cursor: pointer; }
  .tg:hover { color: #fff; }
  .lk { color: ${ACCENT.link}; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; text-decoration-thickness: 1px; }
  .lk:hover { color: #fff; }
  .lks { display: flex; flex-direction: column; gap: 4px; }
  .lk2 { display: flex; gap: 10px; align-items: baseline; padding: 6px 10px; margin: 0 -10px; border-radius: 9px; cursor: pointer; transition: background .15s; }
  .lk2:hover { background: rgba(255,255,255,0.08); }
  .lk2 b { flex: 0 0 auto; font-size: 12.5px; font-weight: 600; }
  .lk2 span { font-size: 11.5px; color: ${ACCENT.link}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .prep { font-size: 12.5px; }
  .hint { margin-top: 10px; font-size: 11.5px; color: ${GLASS.label}; line-height: 1.45; }
  .hint code { font-family: Menlo, monospace; font-size: 11px; color: ${GLASS.sub}; }
  .flash { margin-top: 12px; font-size: 12.5px; color: ${ACCENT.cpu}; } .flash.bad { color: #FF5F5F; }
  .ft { display: flex; gap: 16px; align-items: center; margin-top: 18px; padding-top: 12px; border-top: 1px solid ${GLASS.hair}; font-size: 11.5px; }
  .ft span { color: ${GLASS.sub}; cursor: pointer; } .ft span:hover { color: #fff; }
  .ft .k { margin-left: auto; color: ${GLASS.label}; cursor: default; font-size: 10.5px; } .ft .k:hover { color: ${GLASS.label}; }
`;
// The instant call tile: an animated camera badge, the two platforms as cards, teammates as
// avatar chips, and one big start button.
const meetCss = css`
  .mhd { display: flex; gap: 16px; align-items: center; }
  .mic { position: relative; flex: 0 0 auto; width: 54px; height: 54px; border-radius: 16px; display: flex; align-items: center; justify-content: center;
         background: linear-gradient(135deg, rgba(var(--ev), 0.95), rgba(var(--ev), 0.55)); box-shadow: 0 10px 26px rgba(var(--ev), 0.35);
         transition: background .3s; }
  .mic svg { position: relative; z-index: 2; width: 26px; height: 26px; fill: none; stroke: #fff; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .mic .ring { position: absolute; inset: 0; border-radius: 16px; border: 2px solid rgba(var(--ev), 0.6); animation: micRing 2.4s cubic-bezier(.2,.6,.3,1) infinite;
               will-change: transform, opacity; transform: translateZ(0); }
  .mic .ring.r2 { animation-delay: 1.2s; }
  .mic.busy .ring { animation-duration: 1.1s; } .mic.busy .ring.r2 { animation-delay: .55s; }
  .mic.done .ring { animation: none; opacity: 0; }
  .mic .ck { stroke-dasharray: 24; stroke-dashoffset: 24; animation: micCk .45s .1s ease forwards; stroke-width: 2.4; }
  @keyframes micRing { 0% { transform: scale(1); opacity: .9; } 100% { transform: scale(1.55); opacity: 0; } }
  @keyframes micCk { to { stroke-dashoffset: 0; } }
  .mtx { min-width: 0; } .mtx .t { margin-top: 4px; }
  .plats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .pl { position: relative; display: flex; gap: 10px; align-items: center; padding: 10px 12px; border-radius: 13px; cursor: pointer;
        background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); transition: background .18s, border-color .18s, transform .15s; }
  .pl:hover { background: rgba(255,255,255,0.09); transform: translateY(-1px); }
  .pl.on { background: rgba(var(--ev), 0.14); border-color: rgba(var(--ev), 0.7); }
  .pl i { flex: 0 0 auto; width: 30px; height: 30px; border-radius: 9px; display: flex; align-items: center; justify-content: center;
          background: rgba(255,255,255,0.08); }
  .pl.meet i { background: rgba(52,199,140,0.22); } .pl.zoom i { background: rgba(76,140,255,0.25); }
  .pl i svg { width: 17px; height: 17px; fill: none; stroke: #fff; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
  .pl b { display: block; font-size: 13px; } .pl small { display: block; font-size: 10.5px; color: ${GLASS.sub}; line-height: 1.3; }
  .pl .rad { position: absolute; top: 9px; right: 9px; width: 12px; height: 12px; border-radius: 50%; border: 1.5px solid rgba(255,255,255,0.3); transition: all .18s; }
  .pl.on .rad { border-color: rgb(var(--ev)); background: rgb(var(--ev)); box-shadow: inset 0 0 0 2.5px rgb(24,26,31); }
  .nm { width: 100%; box-sizing: border-box; padding: 10px 13px; border-radius: 11px; font: inherit; font-size: 14px; color: #fff; outline: none;
        background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.14); transition: border-color .15s, background .15s; }
  .nm:focus { border-color: rgba(var(--ev), 0.8); background: rgba(255,255,255,0.09); box-shadow: 0 0 0 3px rgba(var(--ev), 0.18); }
  .lk3 { font-size: 10px; letter-spacing: .3px; text-transform: none; color: ${ACCENT.link}; cursor: pointer; font-weight: 700; }
  .lk3:hover { color: #fff; }
  .tnote { font-size: 11.5px; color: ${GLASS.sub}; margin-bottom: 8px; }
  .pp.pick i { transition: background .2s, transform .2s; }
  .pp.pick.on { background: rgba(var(--ev), 0.16); border-color: rgba(var(--ev), 0.6); }
  .pp.pick.on i { background: rgb(var(--ev)); transform: scale(1.05); font-size: 11px; }
  .pp.pick i:after { display: none; }
  .none { font-size: 12px; color: ${GLASS.label}; }
  .okmsg { color: rgba(255,255,255,0.85); font-size: 13px; }
  .ft2 { display: flex; align-items: center; gap: 10px; margin-top: 18px; padding-top: 14px; border-top: 1px solid ${GLASS.hair}; }
  .ft2 .join { margin: 0; background: linear-gradient(180deg, rgba(var(--ev), 1), rgba(var(--ev), 0.8)); color: #fff;
               box-shadow: 0 8px 22px rgba(var(--ev), 0.35); padding: 11px 22px 11px 18px; }
  .ft2 .join.dis { opacity: .85; cursor: default; }
  .ft2 .k { margin-left: auto; font-size: 10.5px; color: ${GLASS.label}; }
  .spin { width: 14px; height: 14px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.35); border-top-color: #fff; animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
`;
// The heads up ten minutes before a meeting: a countdown ring, join, and your prep.
const headsCss = css`
  .hhd { display: flex; gap: 16px; align-items: center; }
  .cd { position: relative; flex: 0 0 auto; width: 62px; height: 62px; }
  .cd svg { width: 62px; height: 62px; transform: rotate(-90deg); }
  .cd circle { fill: none; stroke-width: 4; }
  .cd .bg { stroke: rgba(255,255,255,0.1); }
  .cd .fg { stroke: rgb(var(--ev)); stroke-linecap: round; transition: stroke-dashoffset 1s linear; }
  .cd .num { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; text-align: center; line-height: 1; }
  .cd .num b { display: block; font-size: 20px; font-weight: 800; } .cd .num small { display: block; font-size: 9px; color: ${GLASS.sub}; margin-top: 2px; }
  .cd .num .nw { font-size: 14px; }
  .cd.now { animation: cdBeat 1.4s ease-in-out infinite; will-change: transform; }
  @keyframes cdBeat { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
  .mtx { min-width: 0; } .mtx .t { margin-top: 4px; }
`;
const popover = css`
  position: absolute; z-index: 30; left: 0; right: 0; top: 0;
  max-height: 100%; box-sizing: border-box; overflow: auto;
  background: linear-gradient(180deg, rgba(127,178,255,0.1), rgba(127,178,255,0) 160px), rgba(24,26,31,0.95);
  border: 1px solid rgba(255,255,255,0.16); border-radius: ${GLASS.radius};
  box-shadow: 0 28px 70px rgba(0,0,0,0.6);
  padding: 20px 24px 22px; font-size: 14px; line-height: 1.5; cursor: default;
  animation: popIn .3s cubic-bezier(.2,.85,.25,1) both;
  @keyframes popIn { from { opacity: 0; transform: translateY(10px) scale(.985); } to { opacity: 1; transform: none; } }
  .t { font-weight: 700; font-size: 20px; line-height: 1.25; padding-right: 30px;
       letter-spacing: -0.2px; }
  .s { color: ${GLASS.sub}; font-variant-numeric: tabular-nums; margin-top: 6px; font-size: 13.5px; }
  .s .cdot { display: inline-block; width: 9px; height: 9px; border-radius: 50%;
             margin-right: 8px; vertical-align: baseline; }
  .s.loc { color: rgba(255,255,255,0.72); }
  /* The one action the card exists for, sized so it is never mistaken for a label. */
  .join { margin-top: 18px; display: inline-block; padding: 10px 22px; border-radius: 12px;
          background: linear-gradient(180deg, #8FD0FF, ${ACCENT.link}); color: #071018; cursor: pointer;
          font-weight: 800; font-size: 13.5px; letter-spacing: .2px; box-shadow: 0 6px 18px rgba(76,180,255,0.3);
          transition: transform .15s, box-shadow .15s, filter .15s; }
  .join:hover { filter: brightness(1.08); transform: translateY(-1px); box-shadow: 0 10px 24px rgba(76,180,255,0.4); }
  .n { color: rgba(255,255,255,0.8); margin-top: 16px; padding-top: 14px;
       border-top: 1px solid ${GLASS.hair}; font-size: 13.5px; line-height: 1.55;
       word-break: break-word; }
  .n .gap { height: 9px; }
  .n .bul { padding-left: 15px; text-indent: -15px; }
  /* Underlined and coloured, because "there is a link here" should survive a glance. */
  .lk { color: ${ACCENT.link}; cursor: pointer; text-decoration: underline;
        text-underline-offset: 2px; text-decoration-thickness: 1px; }
  .lk:hover { color: #fff; }
  .links { margin-top: 18px; padding-top: 14px; border-top: 1px solid ${GLASS.hair}; }
  .lh { font-size: 9px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;
        color: ${GLASS.label}; margin-bottom: 8px; }
  .lrow { display: flex; gap: 12px; align-items: baseline; cursor: pointer;
          padding: 5px 8px; margin: 0 -8px; border-radius: 8px; }
  .lrow:hover { background: rgba(255,255,255,0.09); }
  .lrow .ll { flex: 0 0 auto; font-weight: 600; font-size: 13px; }
  .lrow .lu { color: ${ACCENT.link}; font-size: 12px; text-decoration: underline;
              text-underline-offset: 2px; white-space: nowrap; overflow: hidden;
              text-overflow: ellipsis; }
  .lrow:hover .lu { color: #fff; }
  .x { position: absolute; z-index: 10; top: 14px; right: 16px; width: 26px; height: 26px; border-radius: 50%; display: flex;
       align-items: center; justify-content: center; cursor: pointer; color: ${GLASS.sub}; font-size: 17px; line-height: 1;
       background: rgba(255,255,255,0.06); transition: background .15s, color .15s, transform .15s; }
  .x:hover { color: #fff; background: rgba(255,255,255,0.14); transform: rotate(90deg); }

  /* Your reply, as three buttons — the one that matches your current answer is lit. */
  .resp { margin-top: 16px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .rb { padding: 7px 14px; border-radius: 9px; cursor: pointer; font-size: 12.5px; font-weight: 700;
        border: 1px solid rgba(255,255,255,0.18); background: rgba(255,255,255,0.06);
        color: rgba(255,255,255,0.85); white-space: nowrap; }
  .rb:hover { background: rgba(255,255,255,0.14); color: #fff; }
  .rb.on { background: ${ACCENT.cal}; border-color: ${ACCENT.cal}; color: #0b1016; }
  .rb.on.no { background: rgba(255,69,58,0.85); border-color: transparent; color: #fff; }
  .rb.dis { opacity: .4; cursor: default; }
  .rb.dis:hover { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.85); }
  .resp .gl { margin-left: auto; font-size: 12px; color: ${ACCENT.link}; cursor: pointer;
              text-decoration: underline; text-underline-offset: 2px; white-space: nowrap; }
  .resp .gl:hover { color: #fff; }
  .hint { margin-top: 10px; font-size: 11.5px; color: ${GLASS.label}; line-height: 1.45; }
  .hint code { font-family: Menlo, monospace; font-size: 11px; color: ${GLASS.sub}; }
  .flash { margin-top: 12px; font-size: 12.5px; color: ${ACCENT.cpu}; }
  .flash.bad { color: #FF5F5F; }

  /* The composer: the fields Google Calendar's own quick dialog has, and nothing else. */
  .quick { display: flex; gap: 8px; margin-top: 16px; align-items: stretch; }
  .quick input { flex: 1 1 auto; }
  .quick .rb { display: flex; align-items: center; }
  .form { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 12px; margin-top: 14px; }
  .form .full { grid-column: 1 / -1; }
  .fl { font-size: 9px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;
        color: ${GLASS.label}; margin-bottom: 4px; }
  input[type=text], input[type=date], input[type=time], select, textarea {
    width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: 9px; font: inherit;
    font-size: 13.5px; color: #fff; background: rgba(255,255,255,0.07);
    border: 1px solid rgba(255,255,255,0.14); outline: 0; color-scheme: dark; }
  input:focus, select:focus, textarea:focus { border-color: ${ACCENT.cal}; }
  input:disabled, select:disabled { opacity: .4; }
  textarea { resize: vertical; min-height: 54px; line-height: 1.4; }
  .chk { display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;
         color: rgba(255,255,255,0.85); padding-top: 20px; user-select: none; }
  .chk input { width: 14px; height: 14px; accent-color: ${ACCENT.cal}; margin: 0; }
  .chk.dis { opacity: .4; cursor: default; }
  .go { margin-top: 18px; display: flex; gap: 14px; align-items: center; }
  .go .join { margin-top: 0; }
  .join.dis { opacity: .5; cursor: default; }
  .go .cancel { color: ${GLASS.sub}; cursor: pointer; font-size: 13px; }
  .go .cancel:hover { color: #fff; }
`;
// Click anywhere off the card to dismiss it — with the card this large, hunting for the ×
// is the wrong amount of work.
const scrim = css`
  position: absolute; z-index: 29; inset: 0; cursor: default;
  background: rgba(0,0,0,0.3); border-radius: ${GLASS.radius};
  animation: scrimIn .25s ease both;
  @keyframes scrimIn { from { opacity: 0; } to { opacity: 1; } }
`;
const nowLine = css`
  position: absolute; height: 2px; background: ${ACCENT.now}; z-index: 3;
  ${right ? `left: 0; right: 0;` : `left: 0; right: 0;`}
  &:before { content: ""; position: absolute; ${right ? "right: -4px;" : "left: -4px;"}
             top: -3px; width: 8px; height: 8px; border-radius: 50%; background: ${ACCENT.now}; }
`;
const chip = css`
  display: inline-flex; align-items: center; max-width: 100%; box-sizing: border-box;
  padding: 0 9px; height: 21px; margin: 0 5px 5px 0;
  border-radius: 999px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.08);
  font-size: 10.5px; font-weight: 500; white-space: nowrap;
  > span.lbl { overflow: hidden; text-overflow: ellipsis; }
  .x { margin-left: 6px; margin-right: -2px; opacity: 0; cursor: pointer; font-weight: 700;
       font-size: 12px; line-height: 1; color: ${GLASS.label}; transition: opacity .15s; }
  &:hover .x { opacity: 1; }
  .x:hover { color: #fff; }
`;
// the first hour label is pulled up above the grid's top edge, so the chips need clearance
const chipRow = css`margin-bottom: 14px;`;
const chipOpen = css`cursor: pointer; &:hover { background: rgba(255,255,255,0.18); }`;
const chipRestore = css`
  cursor: pointer; color: ${GLASS.label}; border-style: dashed;
  &:hover { color: #fff; border-color: ${ACCENT.cal}; }
`;
const noteTabs = css`
  display: flex; align-items: center; gap: 4px; flex-wrap: wrap; min-width: 0;
  span { padding: 2px 8px; border-radius: 7px; cursor: grab; white-space: nowrap; user-select: none;
         font-size: 9px; font-weight: 800; letter-spacing: .8px; text-transform: uppercase;
         color: ${GLASS.label}; background: rgba(255,255,255,0.06); }
  span:hover { color: #fff; }
  span.on { background: rgba(255,255,255,0.18); color: #fff; }
  span:active { cursor: grabbing; }
  span.add { background: transparent; border: 1px dashed rgba(255,255,255,0.22); cursor: pointer; }
  input.ni { background: rgba(255,255,255,0.12); border: 1px solid ${ACCENT.cal};
             border-radius: 7px; color: #fff; font: inherit; font-size: 10px;
             padding: 2px 7px; outline: none; width: 140px; }
`;
const notesView = css`
  height: ${CFG.notesHeight}px; overflow: auto; cursor: text; font-size: 12.5px; line-height: 1.5;
  color: rgba(255,255,255,0.88);
  .ph { color: rgba(255,255,255,0.28); }
  .h1 { font-size: 15px; font-weight: 800; color: #fff; margin: 2px 0 4px; }
  .h2 { font-size: 13.5px; font-weight: 800; color: #fff; margin: 6px 0 2px; }
  .h3 { font-size: 9.5px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: ${GLASS.label};
        margin: 8px 0 2px; padding-bottom: 3px; border-bottom: 1px solid rgba(255,255,255,0.1); }
  .h1:first-child, .h2:first-child, .h3:first-child { margin-top: 0; }
  .li { position: relative; padding-left: 11px; }
  .li:before { content: "•"; position: absolute; left: 0; color: ${GLASS.label}; }
  .ol .n { color: ${GLASS.label}; margin-right: 6px; font-variant-numeric: tabular-nums; }
  .gap { height: 6px; }
  hr { border: 0; border-top: 1px solid rgba(255,255,255,0.12); margin: 8px 0; }
  b { color: #fff; font-weight: 700; }
  code { font-family: Menlo, monospace; font-size: 11.5px; padding: 0 4px; border-radius: 4px; background: rgba(255,255,255,0.08); }
  .lk { color: ${ACCENT.link}; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
`;
const notesBox = css`
  width: 100%; height: ${CFG.notesHeight}px; resize: none; box-sizing: border-box;
  background: transparent; border: 0; outline: 0; color: inherit; font: inherit; font-size: 12.5px; line-height: 1.45;
  &::placeholder { color: rgba(255,255,255,0.28); }
`;
const mailList = css`
  display: flex; flex-direction: column; gap: 2px;
  .m { padding: 8px 8px 7px; border-radius: 9px; }
  .m:hover { background: rgba(255,255,255,0.06); }
  .top { display: flex; gap: 8px; align-items: baseline; font-size: 12px; }
  .who { font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .co { font-size: 9px; font-weight: 800; letter-spacing: .5px; text-transform: uppercase; color: ${GLASS.label}; }
  .when { margin-left: auto; font-size: 10px; color: ${GLASS.label}; white-space: nowrap; }
  .sub { font-size: 12px; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .need { font-size: 11.5px; color: ${GLASS.sub}; margin-top: 2px; line-height: 1.35; }
  .acts { display: flex; gap: 14px; margin-top: 6px; font-size: 10px; font-weight: 800; letter-spacing: .5px;
          text-transform: uppercase; color: ${GLASS.label}; }
  .acts span { cursor: pointer; } .acts span:hover { color: #fff; }
  .acts .ok { color: ${ACCENT.cpu}; } .acts .bad { color: #FF5F5F; text-transform: none; letter-spacing: 0; font-weight: 600; }
  .note { display: flex; gap: 8px; margin-top: 6px; }
  .note input { flex: 1; box-sizing: border-box; padding: 6px 9px; border-radius: 8px; font: inherit; font-size: 12px;
                color: #fff; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.14); outline: 0; }
  .empty { font-size: 12px; color: ${GLASS.label}; padding: 8px; }
  .sg { margin-top: 7px; padding: 8px 10px; border-radius: 9px; background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.08); }
  .sgh { font-size: 9px; font-weight: 800; letter-spacing: .6px; text-transform: uppercase; color: ${GLASS.label};
         margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sgb { font-size: 12px; line-height: 1.45; white-space: pre-wrap; cursor: pointer; max-height: 4.4em; overflow: hidden; }
  .sgb.full { max-height: none; }
  .pr { font-size: 9px; font-weight: 800; letter-spacing: .5px; text-transform: uppercase; color: #64D2FF;
        border: 1px solid rgba(100,210,255,0.5); border-radius: 5px; padding: 0 5px; }
  .sg.sent { background: transparent; border-style: dashed; }
  .sgh.tog { cursor: pointer; margin-bottom: 0; }
  .sgh.tog:hover { color: #fff; }
  .sg.sent .sgb { margin-top: 5px; cursor: default; color: rgba(255,255,255,0.75); }
  .sg textarea { width: 100%; box-sizing: border-box; font: inherit; font-size: 12px; line-height: 1.45; color: #fff;
                 background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.14); border-radius: 8px;
                 padding: 7px 9px; outline: 0; resize: vertical; }
`;
const flowCss = css`
  .foldbar { margin: 0 0 6px; padding: 5px 10px; border-radius: 8px; font-size: 11px; color: ${GLASS.label}; cursor: pointer;
             background: rgba(48,209,88,0.06); border: 1px dashed rgba(48,209,88,0.28); text-align: center; }
  .foldbar b { color: ${ACCENT.cpu}; font-weight: 700; }
  .foldbar:hover { background: rgba(48,209,88,0.12); color: #fff; }
  .empty { font-size: 12.5px; color: ${GLASS.sub}; padding: 10px 4px; line-height: 1.5; }
  .lk { color: ${ACCENT.link}; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
  .row { display: flex; align-items: stretch; cursor: pointer; border-radius: 8px; }
  .row:hover, .row.on { background: rgba(255,255,255,0.06); }
  .when { flex: 0 0 18%; min-width: 0; text-align: right; padding: 8px 6px 0 0; border-right: 1px solid rgba(255,255,255,0.12); }
  .cap { font-size: 9px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: ${GLASS.label}; padding-top: 0; border: 0; }
  .lane { position: absolute; bottom: 0; font-size: 9px; font-weight: 800; letter-spacing: .4px; text-transform: uppercase;
          text-align: center; line-height: 1.15; max-height: 30px; overflow: hidden; cursor: pointer;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; word-break: break-word; }
  .when .day { font-size: 11px; color: ${GLASS.sub}; white-space: nowrap; }
  .when .day b { color: #fff; font-weight: 800; }
  .when .mt { font-size: 10px; color: ${GLASS.label}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bd { font-size: 10px; font-weight: 700; color: ${ACCENT.cal}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .txt { flex: 1; min-width: 0; padding: 7px 8px 0 4px; }
  .t { font-size: 12px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .s { font-size: 11px; color: ${GLASS.sub}; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2;
       -webkit-box-orient: vertical; overflow: hidden; }
  .now { margin-top: 10px; padding: 10px 8px; border-top: 1px solid rgba(255,255,255,0.1); }
  .nh { font-size: 9px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: ${GLASS.label}; margin-bottom: 6px; }
  .ns { display: flex; gap: 9px; padding: 5px 4px; border-radius: 7px; cursor: pointer; font-size: 12px; }
  .ns:hover { background: rgba(255,255,255,0.06); }
  .ns i { flex: 0 0 4px; border-radius: 2px; }
  .ns .s { -webkit-line-clamp: 3; }
  .ns.fin b { color: ${GLASS.sub}; }
  .s.s1 { -webkit-line-clamp: 1; }
  .you { font-size: 10.5px; color: ${GLASS.sub}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .yt { font-weight: 700; margin-right: 5px; color: #F5C542; text-shadow: 0 0 6px rgba(245,197,66,0.55); }
  .yd { display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin: 0 6px 1px 0; vertical-align: middle;
        background: #F5C542; box-shadow: 0 0 6px rgba(245,197,66,0.8); }
`;
const flowLists = css`
  padding: 2px 2px 8px;
  .sec + .sec { margin-top: 14px; }
  .nh.gold { color: #F5C542; text-shadow: 0 0 6px rgba(245,197,66,0.45); }
  .none { font-size: 12px; color: ${GLASS.label}; padding: 3px 6px; }
  .dots { display: inline-flex; flex: 0 0 auto; }
  .dots i { width: 8px; height: 8px; border-radius: 50%; box-shadow: 0 0 0 1.5px rgba(20,20,24,0.9); }
  .dots i + i { margin-left: -3px; }
  .g { border-radius: 8px; transition: background .15s; }
  .g.open { background: rgba(255,255,255,0.05); padding-bottom: 4px; }
  .gl { display: flex; align-items: center; gap: 9px; padding: 6px 6px; border-radius: 8px; cursor: pointer; }
  .gl:hover { background: rgba(255,255,255,0.06); }
  .gm { flex: 1; min-width: 0; }
  .gt { font-size: 12.5px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .gt .x { margin-left: 6px; font-size: 10px; font-weight: 800; color: #F5C542; }
  .gw { font-size: 10.5px; color: ${GLASS.sub}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dt { font-size: 10.5px; color: ${GLASS.label}; flex: 0 0 auto; font-variant-numeric: tabular-nums; }
  .src { display: flex; align-items: center; gap: 7px; padding: 3px 6px 3px 26px; font-size: 11px; cursor: pointer; border-radius: 6px; min-width: 0; }
  .src:hover { background: rgba(255,255,255,0.06); }
  .src .dt { flex: 0 0 40px; }
  .src .dots i { width: 6px; height: 6px; }
  .src .w { flex: 1; min-width: 0; color: rgba(255,255,255,0.85); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .src .mt { flex: 0 1 auto; max-width: 30%; color: ${GLASS.label}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .src.done { padding-left: 6px; }
  .src.done .w { color: ${GLASS.label}; text-decoration: line-through; }
  .ev { flex: 0 0 auto; max-width: 45%; font-size: 10.5px; color: ${ACCENT.cpu}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dn { margin-top: 6px; }
  .tg { font-size: 10.5px; font-weight: 700; color: ${ACCENT.cpu}; cursor: pointer; padding: 3px 6px; display: inline-block; }
  .nm { flex: 1; min-width: 0; }
  .nt { display: flex; align-items: baseline; gap: 8px; }
  .nt .ps { font-size: 10px; color: ${GLASS.label}; }
  .nt .on { margin-left: auto; font-size: 10px; font-weight: 700; color: #F5C542; text-shadow: 0 0 6px rgba(245,197,66,0.45); white-space: nowrap; }
  .ns .s { -webkit-line-clamp: 2; }
  .board { margin-bottom: 12px; }
  .board .bs .old { color: #FF5F5F; }
  .board .bs, .nh .rv { margin-left: 8px; font-weight: 600; letter-spacing: 0; text-transform: none; color: ${GLASS.label}; }
  .bi { display: flex; align-items: center; gap: 7px; padding: 3px 6px; border-radius: 6px; font-size: 12px; }
  .bi.has { cursor: pointer; } .bi.has:hover { background: rgba(255,255,255,0.06); }
  .bi .bn { flex: 0 0 14px; font-size: 10.5px; font-weight: 800; color: ${GLASS.label}; text-align: right; }
  .bi i { flex: 0 0 8px; height: 8px; border-radius: 50%; }
  .bi .bt2 { flex: 1; min-width: 0; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ns .rk { flex: 0 0 16px; align-self: flex-start; margin-top: 1px; font-size: 11px; font-weight: 800; color: #fff; text-align: right; font-variant-numeric: tabular-nums; }
  .ns .rk.no { color: ${GLASS.label}; font-size: 9px; }
  .ns.paused { opacity: .62; }
  .nt .mvd { font-size: 9.5px; font-weight: 700; padding: 0 5px; border-radius: 5px; white-space: nowrap; }
  .nt .mvd.up { color: ${ACCENT.notify}; border: 1px solid rgba(201,168,255,0.45); }
  .nt .mvd.dn { color: ${GLASS.label}; border: 1px solid rgba(255,255,255,0.15); }
  .nt .fl { font-size: 9.5px; font-weight: 700; color: #FF5F5F; padding: 0 5px; border-radius: 5px; border: 1px solid rgba(255,95,95,0.4); white-space: nowrap; }
  .tgt { font-size: 11px; color: rgba(255,255,255,0.8); margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tgt .soon { color: #FF5F5F; font-weight: 700; } .tgt .late { color: ${GLASS.label}; }
  .qs { margin: 8px 6px 0; padding: 6px 8px; border-radius: 8px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07); }
  .qs .qh { font-size: 9px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: ${GLASS.label}; margin-bottom: 2px; }
  .qs .q { font-size: 11px; color: rgba(255,255,255,0.82); line-height: 1.4; }
  .fin { font-size: 11px; color: ${GLASS.label}; padding: 10px 0 0; line-height: 1.5; }
  .fin .fh { display: flex; align-items: baseline; font-size: 10.5px; font-weight: 700; color: ${ACCENT.cpu}; padding: 0 6px 2px; }
  .fin .fh .tl { margin-left: auto; font-weight: 600; color: ${GLASS.label}; cursor: pointer; } .fin .fh .tl:hover { color: #fff; }
  .fin .fg + .fg { margin-top: 4px; }
  .fin .fgh { font-size: 9px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: ${GLASS.label}; padding: 4px 6px 1px; }
  .fr2 { display: flex; align-items: center; gap: 7px; padding: 2px 6px; border-radius: 6px; cursor: pointer; min-width: 0; }
  .fr2:hover { background: rgba(255,255,255,0.06); }
  .fr2 i { flex: 0 0 7px; height: 7px; border-radius: 50%; opacity: .6; }
  .fr2 .fn { flex: 0 1 auto; max-width: 45%; color: rgba(255,255,255,0.8); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .fr2 .fw { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
`;
const flowTabs = css`
  display: inline-flex; gap: 2px; padding: 2px; border-radius: 8px; background: rgba(255,255,255,0.06);
  span { padding: 3px 10px; border-radius: 6px; cursor: pointer; color: ${GLASS.label}; }
  span:hover { color: #fff; }
  span.on { color: #fff; background: rgba(255,255,255,0.14); }
`;
const flowFocus = css`
  display: flex; gap: 10px; align-items: baseline; margin: -2px 0 10px; padding: 9px 12px; border-radius: 10px;
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08);
  .k { font-size: 9px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: ${ACCENT.cal}; flex: 0 0 auto; }
  .f { font-size: 13px; font-weight: 700; color: #fff; line-height: 1.35; }
`;
const flowMine = css`
  margin-bottom: 10px; font-size: 12px;
  .hd { font-size: 9px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #F5C542;
        text-shadow: 0 0 6px rgba(245,197,66,0.45); margin-bottom: 4px; }
  .it { display: flex; align-items: center; gap: 6px; padding: 3px 6px; border-radius: 6px; cursor: pointer; min-width: 0; }
  .it:hover { background: rgba(255,255,255,0.07); }
  .it i { width: 6px; height: 6px; border-radius: 50%; flex: 0 0 auto; }
  .dt { font-size: 10.5px; color: ${GLASS.label}; flex: 0 0 42px; font-variant-numeric: tabular-nums; }
  .w { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: rgba(255,255,255,0.9); }
  .none { color: ${GLASS.label}; padding: 3px 6px; }
  .dn { margin-top: 6px; }
  .tg { font-size: 10.5px; font-weight: 700; color: ${ACCENT.cpu}; cursor: pointer; padding: 3px 6px; display: inline-block; }
  .it.done .w { color: ${GLASS.label}; text-decoration: line-through; }
  .ev { margin-left: auto; flex: 0 0 auto; max-width: 45%; font-size: 10.5px; color: ${ACCENT.cpu};
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
`;
const flowStrip = css`
  display: flex; flex: 0 0 auto; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.08);
  .m { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 3px 0 4px;
       border-radius: 6px; cursor: pointer; }
  .m:hover { background: rgba(255,255,255,0.07); }
  .m.on { background: rgba(255,255,255,0.12); }
  .m b { font-size: 9.5px; font-weight: 700; color: ${GLASS.sub}; white-space: nowrap; overflow: visible; }
  .m.me b { color: #F5C542; text-shadow: 0 0 6px rgba(245,197,66,0.55); }
  .dots { display: flex; gap: 2px; flex-wrap: wrap; justify-content: center; }
  .dots i { width: 5px; height: 5px; border-radius: 50%; }
`;
const flowCard = css`
  position: absolute; z-index: 20; top: 36px; right: 8px; bottom: 8px; width: min(62%, 460px);
  display: flex; flex-direction: column; overflow: hidden;
  border-radius: 16px; background: rgba(24,24,28,0.97); border: 1px solid rgba(255,255,255,0.1);
  box-shadow: 0 18px 50px rgba(0,0,0,0.5); font-size: 12.5px; line-height: 1.5; color: rgba(255,255,255,0.88);
  .top { padding: 16px 18px 12px; border-bottom: 1px solid rgba(255,255,255,0.08); position: relative; }
  .x { position: absolute; top: 10px; right: 12px; width: 24px; height: 24px; border-radius: 50%; display: flex;
       align-items: center; justify-content: center; cursor: pointer; font-size: 16px; color: ${GLASS.label}; }
  .x:hover { color: #fff; background: rgba(255,255,255,0.1); }
  .t { font-size: 15px; font-weight: 800; color: #fff; padding-right: 28px; line-height: 1.3; }
  .t .dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 8px; }
  .m { font-size: 11px; color: ${GLASS.label}; margin-top: 3px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  .chips span { display: flex; align-items: center; gap: 5px; font-size: 11px; padding: 3px 9px; border-radius: 999px;
                background: rgba(255,255,255,0.07); cursor: pointer; }
  .chips span:hover { background: rgba(255,255,255,0.14); }
  .chips i { width: 7px; height: 7px; border-radius: 50%; }
  .body { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 18px 14px;
          scrollbar-width: none; }
  .body::-webkit-scrollbar, .body:hover::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }
  .h { font-size: 9px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: ${GLASS.label}; margin: 14px 0 4px; }
  .p { margin-top: 10px; }
  .b { padding-left: 12px; position: relative; margin-top: 3px; }
  .b:before { content: "•"; position: absolute; left: 0; color: ${GLASS.label}; }
  .who { font-weight: 700; color: #fff; margin-right: 6px; }
  .who.me { color: #F5C542; text-shadow: 0 0 6px rgba(245,197,66,0.55); }
  .b.settled .w { color: ${GLASS.label}; text-decoration: line-through; }
  .b .ok { display: block; font-size: 11px; color: ${ACCENT.cpu}; cursor: pointer; }
  .dt { font-size: 10.5px; color: ${GLASS.label}; margin-right: 7px; font-variant-numeric: tabular-nums; }
  .mine .h { color: #F5C542; text-shadow: 0 0 6px rgba(245,197,66,0.55); }
  .lk { color: ${ACCENT.link}; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
  .go { display: flex; gap: 8px; flex-wrap: wrap; padding: 12px 14px; border-top: 1px solid rgba(255,255,255,0.08); }
  .btn { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 700; padding: 6px 11px;
         border-radius: 9px; cursor: pointer; color: rgba(255,255,255,0.88); background: rgba(255,255,255,0.08);
         border: 1px solid rgba(255,255,255,0.1); }
  .btn:hover { background: rgba(255,255,255,0.15); color: #fff; }
  .btn.pri { background: ${ACCENT.cal}; border-color: ${ACCENT.cal}; color: #fff; }
  .btn.pri:hover { filter: brightness(1.1); }
  .btn svg { width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
`;
const prepBody = css`
  margin-top: 12px; font-size: 13px; line-height: 1.45; color: rgba(255,255,255,0.88);
  .h { font-size: 9px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: ${GLASS.label}; margin-top: 10px; }
  .b { padding-left: 12px; position: relative; }
  .b:before { content: "•"; position: absolute; left: 0; color: ${GLASS.label}; }
  .lk { color: ${ACCENT.link}; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
`;
const sysMini = css`
  display: flex; gap: 10px; align-items: baseline; white-space: nowrap; overflow: hidden;
  font-size: 10.5px; color: ${GLASS.sub};
  .k { font-size: 9px; font-weight: 800; letter-spacing: .8px; text-transform: uppercase; color: ${GLASS.label}; }
  b { font-weight: 800; }
  .x { color: ${GLASS.label}; }
  .top { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
`;
// Nine rounded bars, tallest in the middle, alternating dark and light, like a voice level.
const WAVE = [0.30, 0.46, 0.88, 0.64, 1.0, 0.64, 0.88, 0.46, 0.30];
const Wave = () => (
  <svg viewBox="0 0 36 20" width="26" height="15" aria-hidden="true">
    {WAVE.map((h, i) => <rect key={i} x={1 + i * 3.9} y={10 - 9 * h} width="2.3" height={18 * h} rx="1.15"
                               fill="currentColor" fillOpacity={i % 2 ? 0.55 : 1} />)}
  </svg>
);
// Just the waveform: brighter on hover, accent while listening. No pill around it.
const wavePill = css`
  display: inline-flex; align-items: center; justify-content: center; height: 100%; padding: 0 2px;
  cursor: pointer; color: ${GLASS.label}; line-height: 0;
  svg { display: block; }
  &:hover { color: #fff; filter: drop-shadow(0 0 4px rgba(255,255,255,0.35)); }
  &.live { color: ${ACCENT.cal}; filter: drop-shadow(0 0 5px ${ACCENT.cal}); }
`;
const callBtn = css`
  cursor: pointer; font-size: 10px; font-weight: 800; letter-spacing: .6px; text-transform: uppercase;
  color: ${GLASS.sub}; white-space: nowrap; padding: 0 2px; line-height: 1;
  display: inline-flex; align-items: center; height: 100%;
  &:hover { color: #fff; }
`;
const teamSyncLink = css`
  cursor: pointer; font-size: 9px; font-weight: 800; letter-spacing: .6px; text-transform: uppercase;
  color: ${GLASS.label}; white-space: nowrap;
  &:hover { color: #fff; }
`;
const teamNote = css`
  font-size: 11.5px; line-height: 1.45; color: ${GLASS.sub}; margin: 0 0 8px;
  b { color: #fff; font-weight: 700; }
  .lk { color: ${ACCENT.link}; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
`;
const teamChips = css`
  display: flex; flex-wrap: wrap; gap: 6px;
  .tm { padding: 5px 10px; border-radius: 999px; font-size: 12.5px; cursor: pointer; user-select: none;
        color: rgba(255,255,255,0.8); background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.14); }
  .tm:hover { color: #fff; border-color: rgba(255,255,255,0.3); }
  .tm.on { color: #fff; background: ${ACCENT.cal}; border-color: ${ACCENT.cal}; font-weight: 700; }
  .none { font-size: 12px; color: ${GLASS.label}; }
`;
const meetRow = css`
  display: flex; align-items: baseline; gap: 8px; padding: 3px 5px; border-radius: 7px;
  cursor: pointer; min-width: 0;
  .t { flex: 1 1 auto; font-size: 11px; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; }
  .d { flex: 0 0 auto; font-size: 9.5px; color: ${GLASS.label}; font-variant-numeric: tabular-nums;
       white-space: nowrap; }
  &:hover { background: rgba(255,255,255,0.1); }
  &:hover .t { color: #fff; }
  &.busy { opacity: .55; }
  &.busy .d { color: ${GLASS.sub}; }
  &.done .d { color: ${ACCENT.cpu}; font-weight: 700; }
`;
const refreshBtn = css`
  cursor: pointer; font-size: 9px; font-weight: 800; letter-spacing: .5px;
  color: ${GLASS.label}; text-transform: uppercase;
  &:hover { color: #fff; }
`;
const err = css`color: #FF5F5F; font-size: 11px;`;

// ───────────────────────── render ─────────────────────────
const hh = d => d.getHours().toString().padStart(2, "0") + ":" + d.getMinutes().toString().padStart(2, "0");
// Only mark am/pm where it changes — at each 12, plus the first row so the column is never
// ambiguous. Every other hour is just the bare number.
const hourLabel = (h, first) => {
  const x = h % 24;
  const n = x % 12 === 0 ? 12 : x % 12;
  return (x % 12 === 0 || first) ? `${n}${x < 12 ? "a" : "p"}` : String(n);
};
// Apple's widget never prints a bare future timestamp — it says how far off the thing is.
const rel = ms => {
  const m = Math.round(ms / 60000);
  if (m <= 0) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
};
const dayName = d => {
  const a = new Date(); a.setHours(0, 0, 0, 0);
  const b = new Date(d); b.setHours(0, 0, 0, 0);
  const diff = Math.round((b - a) / 86400000);
  return diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : diff === -1 ? "Yesterday"
       : d.toLocaleDateString(undefined, { weekday: "long" });
};
// An invitation you have not answered is drawn hollow instead of filled, so it never reads
// as a commitment you have already made.
const hollowOf = e => e.mine === "reply" || e.status === "tentative";
const tint = e => {
  const c = e.color || "203,211,222";
  return hollowOf(e)
    ? { borderColor: `rgb(${c})`, borderLeftColor: `rgb(${c})`, background: "transparent" }
    : { borderLeftColor: `rgb(${c})`, background: `rgba(${c},0.22)` };
};
const badgeOf = e =>
  e.status === "canceled" ? "canceled"
  : e.mine === "declined" ? "declined"
  : e.mine === "reply"    ? "needs reply"
  : (e.mine === "maybe" || e.status === "tentative") ? "maybe"
  : "";
const dayShort = d =>
  d && d.getTime() ? d.toLocaleDateString(undefined, { month: "numeric", day: "numeric" }) : "";
const gb = bytes => bytes / 1073741824;
const kbGb = kb => kb / 1048576;

// Claude Code renames the window as it works: "✳ Claude Code", "◐ Widget layout reorganization".
// Keep the status glyph, use the topic as the tab label once there is one.
// Two lines at 11px in a 196px rail is about 56 characters.
const clip = (t, n = 56) => (t && t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t);

// ── invite notes ───────────────────────────────────────────────────────────────
// A calendar invite's notes are mostly machinery. Zoom sends HTML fenced in ──────────
// rules, Teams sends ______ rules and angle-bracket links, Google sends a -::~:~::- fence,
// and all three bury the one thing you want — the join link — among dial-in strings, SIP
// addresses, "one tap mobile" numbers and signed invitation URLs nobody ever opens.
// These pull the links out as first-class things and throw the machinery away.

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
              "#39": "'", "#160": " ", "#8217": "’", "#8211": "–", "#8212": "—" };
const unent = t => t.replace(/&(#?\w+);/g, (m, k) => {
  const v = ENT[k.toLowerCase()];
  return v === undefined ? m : v;
});

const hostOf = u => {
  const m = String(u).match(/^https?:\/\/([^/]+)/);
  return m ? m[1].replace(/^www\./, "") : String(u);
};
// A full invitation URL is 200 characters of signature. Show something a person can read.
const shortUrl = u => {
  const m = String(u).match(/^https?:\/\/([^/?#]+)([^?#]*)/);
  if (!m) return String(u);
  const t = m[1].replace(/^www\./, "") + (m[2] || "").replace(/\/$/, "");
  return t.length > 44 ? t.slice(0, 43) + "…" : t;
};

function toText(raw) {
  let t = String(raw || "");
  if (/<(p|br|div|ul|ol|li|strong|em|b|i|a|span)\b[^>]*>/i.test(t)) {
    t = t
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\/\s*(p|div|h[1-6]|tr)\s*>/gi, "\n\n")
      .replace(/<\s*li[^>]*>/gi, "\n• ")
      .replace(/<\/\s*(ul|ol)\s*>/gi, "\n")
      .replace(/<a\b[^>]*?href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (m, href, txt) => {
        const label = unent(txt.replace(/<[^>]+>/g, "")).trim();
        // "xtech.army.mil" pointing at https://www.xtech.army.mil/ adds nothing; drop it.
        return !label || href.replace(/^https?:\/\/(www\.)?/, "").startsWith(label.replace(/^www\./, ""))
          ? href : label + " " + href;
      })
      .replace(/<[^>]+>/g, "");
  }
  t = t.replace(/<(https?:\/\/[^>\s]+)>/g, " $1");     // Teams: Join the meeting now<https://…>
  return unent(t).replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ");
}

// Lines that are pure decoration, or pure telephony, and never carry meaning.
const RULE = /^[\s─-╿\-_=~:.·*•]{3,}$/;   // "---" counts, so three, not four
const JUNK = [
  /^-::~/, /please do not edit this section/i,
  /^(one tap mobile|join by sip|join instructions|dial in by phone|microsoft teams)$/i,
  /^(or dial|more phone numbers|find a local number|phone conference id|for organizers|org help|need help)\b/i,
  /^learn more about meet/i, /^reset dial-in pin/i,
  /^in addition to the dial-in number/i,
  /is inviting you to a scheduled\b/i,          // "Ayesha Dewan is inviting you to a…"
  /^this meeting is being recorded\.?$/i,
  /^\+\d[\d\s,#().-]{6,}/,                    // +16699006833,,83230550217# US (San Jose)
  /^•?\s*\d{5,}@[\w.-]+$/,               // • 83230550217@zoomcrc.com
  /zoom\.us\/[^\s]*invitations\?signature=/i,
  /(dialin|tel)\.[\w.]*(teams\.microsoft|meet)/i,
  /aka\.ms\/JoinTeamsMeeting/i,
  /support\.google\.com\/a\/users/i,
  /teams\.microsoft\.[a-z]+\/meetingOptions/i,
];
// Some of these arrive wrapped in quotes ("In addition to the dial-in number above, …"),
// so test the unquoted form too.
const isJunk = l => {
  const bare = l.replace(/^["'“‘]+|["'”’]+$/g, "").trim();
  return RULE.test(l) || JUNK.some(r => r.test(l) || r.test(bare));
};

// A short line that only names the link beneath it, rather than saying anything itself.
const LABELISH = /^(join|start|dial|meeting|agenda|register|click|open|video|conference|link|passcode|more)\b|link$|agenda$|instructions$/i;

const JOIN_HOST = /(^|\.)(zoom\.us|meet\.google\.com|teams\.microsoft\.(com|us)|teams\.live\.com|webex\.com|whereby\.com|chime\.aws|gotomeeting\.com)$/i;
const isJoinLink = l =>
  JOIN_HOST.test(hostOf(l.url)) &&
  !/invitations\?|\/agenda\/|meetingOptions|dialin|tel\.meet|support\.google|\/launch\/|mynotes=on/i.test(l.url);
// ── the event card's helpers ──
const EV_MORE = new Set();                  // events whose full details are expanded
const EV_PPL = new Set();                   // events whose whole guest list is shown
const evDur = e => {
  const m = Math.round((e.end - e.start) / 60000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}`;
};
const evAgo = m => m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}`;
// where the meeting is relative to now: soon, now (with how far through), later, or over
const evLive = e => {
  if (!e.start || !e.end) return null;
  const now = Date.now(), s0 = e.start.getTime(), s1 = e.end.getTime();
  if (now >= s1) return { k: "past", text: `ended ${evAgo(Math.round((now - s1) / 60000))} ago` };
  if (now >= s0) return { k: "now", text: `happening now · ${evAgo(Math.max(1, Math.round((s1 - now) / 60000)))} left`, pct: Math.round((now - s0) / (s1 - s0) * 100) };
  const m = Math.round((s0 - now) / 60000);
  return { k: m <= 10 ? "soon" : "later", text: m <= 0 ? "starting now" : `starts in ${evAgo(m)}` };
};
const evInitials = n => String(n || "?").split(/[\s.@_]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("") || "?";
const evAvatar = n => {
  let h = 0; for (const c of String(n || "")) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `linear-gradient(135deg, hsla(${h},55%,62%,0.55), hsla(${(h + 40) % 360},55%,45%,0.55))`;
};
// what "prep with Claude" pastes into a new thread
const evBrief = (e, inv, prep) => [
  `Help me prepare for this meeting. Look up anything useful in Gmail, Slack, Fireflies (past meetings with these people) and ClickUp, then give me a short brief: what it is about, what each person cares about, what I owe or am owed, and 3 things I should say or ask.`,
  ``,
  `# ${e.title}`,
  e.start ? `${e.start.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}, ${hh(e.start)} to ${hh(e.end)}` : "All day",
  e.calendar ? `Calendar: ${e.calendar}` : "",
  e.organizer ? `Organizer: ${e.organizer}` : "",
  (e.people || []).length ? `People: ${(e.people || []).map(p => `${p.n}${p.em ? ` <${p.em}>` : ""} (${p.st})`).join(", ")}` : "",
  e.loc ? `Where: ${e.loc}` : "",
  inv.join ? `Join: ${inv.join}` : "",
  inv.body.length ? `\nInvite:\n${inv.body.join("\n")}` : "",
  inv.links.length ? `\nLinks:\n${inv.links.map(l => `- ${l.label}: ${l.url}`).join("\n")}` : "",
  prep ? `\nMy prep notes:\n${prep}` : "",
].filter(x => x !== "").join("\n");

const joinVerb = u => {
  const h = hostOf(u);
  return /zoom\.us$/i.test(h) ? "Join Zoom"
       : /meet\.google\.com$/i.test(h) ? "Join Google Meet"
       : /teams\./i.test(h) ? "Join Teams"
       : /webex/i.test(h) ? "Join Webex" : "Join meeting";
};

// Split an invite into: the links worth a button, and the prose worth reading.
function inviteParts(e) {
  if (!e) return { body: [], links: [], join: "" };
  const lines = toText(e.notes).split("\n").map(l => l.trim());
  const body = [], links = [], seen = new Set();
  const add = (label, url) => {
    url = url.replace(/[).,;\]]+$/, "");
    if (seen.has(url)) return;
    seen.add(url);
    links.push({ label: (label || "").replace(/[:–—-]\s*$/, "").trim() || hostOf(url), url });
  };
  lines.forEach(ln => {
    if (!ln) { if (body.length && body[body.length - 1] !== "") body.push(""); return; }
    if (isJunk(ln)) return;
    const m = ln.match(/^(.*?)(https?:\/\/\S+)$/);
    if (m) {
      const lead = m[1].trim().replace(/[:–—-]\s*$/, "");
      // Link on its own, or under a label: becomes a button. Inside a sentence: stays put
      // and the renderer makes it clickable where it stands.
      if (!lead || (lead.length <= 46 && LABELISH.test(lead))) {
        let label = lead;
        if (!label) {
          for (let i = body.length - 1; i >= 0; i--) {
            const prev = body[i];
            if (prev === "") continue;
            if (prev.length <= 46 && LABELISH.test(prev) && !/[.!?]$/.test(prev)) {
              label = prev; body.splice(i, 1);
            }
            break;
          }
        }
        add(label, m[2]);
        return;
      }
    }
    body.push(ln);
  });
  // Stripping rules and boilerplate leaves runs of blank lines behind them.
  const tidy = body.filter((l, i) => l !== "" || (body[i - 1] || "") !== "");
  while (tidy.length && tidy[tidy.length - 1] === "") tidy.pop();
  while (tidy.length && tidy[0] === "") tidy.shift();
  // The event's own url field wins as the join target when it is a real meeting link.
  const own = (e.url || "").match(/https?:\/\/\S+/);
  const cand = (own ? [{ label: "", url: own[0] }] : []).concat(links);
  const join = (cand.find(isJoinLink) || {}).url || "";
  const base = u => u.split(/[?#]/)[0];
  return { body: tidy, links: links.filter(l => base(l.url) !== base(join)), join };
}

// A Slack permalink opened as https goes to the browser first, which then bounces to the app.
// The app's own scheme skips that: slack://channel?team=…&id=…&message=<ts>. The permalink's
// p1789985532150549 is the message ts with the dot removed; a thread reply carries thread_ts.
function slackDeep(u) {
  const m = String(u).match(/^https?:\/\/[a-z0-9-]+\.slack\.com\/archives\/([A-Z0-9]+)(?:\/p(\d{10})(\d{6}))?(?:[?&#].*)?$/i);
  if (!m || !CFG.slackTeam) return "";
  let d = `slack://channel?team=${CFG.slackTeam}&id=${m[1]}`;
  if (m[2]) d += `&message=${m[2]}.${m[3]}`;
  const th = String(u).match(/[?&]thread_ts=(\d+\.\d+)/);
  if (th) d += `&thread_ts=${th[1]}`;
  return d;
}
const openUrl = u => {
  const clean = String(u).replace(/[).,;]+$/, "");
  run(`open ${JSON.stringify(slackDeep(clean) || clean)}`);
};

// URLs left inside prose stay where they are and become clickable in place, rather than
// being hoisted out and stranding the sentence that referred to them.
const linkify = text => String(text || "").split(/(https?:\/\/\S+)/g).map((part, i) =>
  /^https?:\/\//.test(part)
    ? <span key={i} className="lk" onClick={() => openUrl(part)}>{shortUrl(part)}</span>
    : part
);

// A path in a note (the transcript it came from) opens in the default app, relative to the
// AI Tools folder. Quotes and shell metacharacters cannot be part of such a path, so they go.
const openPath = p => run(`open "${CFG.folder}/${String(p).replace(/["`$\\]/g, "")}"`);
const stop = fn => e => { e.stopPropagation(); fn(); };

// One task note, as the markdown it was written in: `[Label](url)` becomes a link, a bare URL
// becomes a link, `**bold**` loses its stars, a `[Tag]` is tinted, and a `Slack:` / `Drive:` /
// `Gmail:` prefix inside a link label is set off as the kind of thing the link is.
function mdInline(text) {
  const parts = String(text || "").split(/(\[[^\]]+\]\([^)\s]+\))/g);
  return parts.map((part, i) => {
    const m = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (m) {
      const km = m[1].match(/^(Slack|Drive|Docs?|Gmail|Email|Mail|Sheet|Deck|Transcript|Meeting|ClickUp|Web)\s*:\s*(.*)$/i);
      const go = /^https?:\/\//.test(m[2]) ? () => openUrl(m[2]) : () => openPath(m[2]);
      return <span key={i} className="lk" title={m[2]} onClick={stop(go)}>
        {km ? <span className="kind">{km[1]} · </span> : null}{km ? km[2] : m[1]}</span>;
    }
    const plain = part.replace(/\*\*(.+?)\*\*/g, "$1");
    const src = plain.match(/^(Source:\s*)(\S+\.md)\s*$/i);
    if (src) return <span key={i}>{src[1]}<span className="lk" onClick={stop(() => openPath(src[2]))}>{src[2]}</span></span>;
    return <span key={i}>{plain.split(/(\[[^\]]+\]|https?:\/\/\S+)/g).map((s, j) =>
      /^\[/.test(s) ? <span key={j} className="tag">{s}</span>
      : /^https?:\/\//.test(s) ? <span key={j} className="lk" onClick={stop(() => openUrl(s))}>{shortUrl(s)}</span>
      : s)}</span>;
  });
}

// Markdown for reading: # and ## headings, a line that is only **bold** as a section label,
// - and 1. lists, --- as a rule, blank lines as space; inline **bold**, *italic*, `code`, links.
function mdSpan(text, key) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|_[^_\s][^_]*_|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|https?:\/\/[^\s)]+)/g;
  let last = 0, m, k = 0;
  const str = String(text || "");
  while ((m = re.exec(str))) {
    if (m.index > last) out.push(str.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("**")) out.push(<b key={k++}>{t.slice(2, -2)}</b>);
    else if (t.startsWith("`")) out.push(<code key={k++}>{t.slice(1, -1)}</code>);
    else if (t.startsWith("[")) {
      const l = t.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
      out.push(<span key={k++} className="lk" onClick={stop(() => /^https?:/.test(l[2]) ? openUrl(l[2]) : openPath(l[2]))}>{l[1]}</span>);
    } else if (/^https?:/.test(t)) out.push(<span key={k++} className="lk" onClick={stop(() => openUrl(t))}>{shortUrl(t)}</span>);
    else out.push(<i key={k++}>{t.slice(1, -1)}</i>);
    last = m.index + t.length;
  }
  if (last < str.length) out.push(str.slice(last));
  return <span key={key}>{out}</span>;
}
function mdBlock(md) {
  return String(md || "").split("\n").map((raw, i) => {
    const l = raw.trimEnd();
    if (!l.trim()) return <div key={i} className="gap" />;
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) return <hr key={i} />;
    let m;
    if ((m = l.match(/^(#{1,3})\s+(.*)$/))) return <div key={i} className={`h${m[1].length}`}>{mdSpan(m[2])}</div>;
    if ((m = l.match(/^\*\*([^*]+)\*\*:?\s*$/))) return <div key={i} className="h3">{m[1]}</div>;
    if ((m = l.match(/^(\s*)[-*\u2022]\s+(.*)$/))) return <div key={i} className="li" style={{ marginLeft: 12 + m[1].length * 6 }}>{mdSpan(m[2])}</div>;
    if ((m = l.match(/^(\s*)(\d+)[.)]\s+(.*)$/))) return <div key={i} className="ol" style={{ marginLeft: 16 + m[1].length * 6 }}><span className="n">{m[2]}.</span>{mdSpan(m[3])}</div>;
    return <div key={i} className="p">{mdSpan(l)}</div>;
  });
}

// A prep card's markdown: "**Section**" lines become labels, "- " lines bullets, links clickable.
const PrepBody = ({ md }) => (
  <div className={prepBody}>
    {prepLines(md).map((l, i) => /^\*\*[^*]+\*\*$/.test(l)
      ? <div key={i} className="h">{l.replace(/\*\*/g, "")}</div>
      : /^[-*\u2022]\s+/.test(l)
        ? <div key={i} className="b">{mdInline(l.replace(/^[-*\u2022]\s+/, ""))}</div>
        : <div key={i}>{mdInline(l.replace(/\*\*/g, ""))}</div>)}
  </div>
);

const linkOf = e => {
  if (!e) return "";
  const hit = (e.url || "").match(/https?:\/\/\S+/) ||
              (e.notes || "").match(/https?:\/\/\S+/) ||
              (e.loc || "").match(/https?:\/\/\S+/);
  return hit ? hit[0].replace(/[.,)]+$/, "") : "";
};

const GENERIC = /^(claude code|terminal|login|-?zsh|bash)$/i;
function tabParts(t) {
  const raw = (t.label || "").trim();
  const m = raw.match(/^([^\w\s]+)\s*(.*)$/);
  const glyph = m ? m[1] : "";
  const text = (m ? m[2] : raw).trim();
  return { glyph, text: !text || GENERIC.test(text) ? `thread ${t.n}` : text };
}

const R = 28, C = 2 * Math.PI * R;
const Gauge = ({ pct, color, label, sub }) => {
  const on = (Math.max(0, Math.min(100, pct)) / 100) * C;
  return (
    <div className={gaugeBox}>
      <svg viewBox="0 0 64 64">
        <circle className="bg" cx="32" cy="32" r={R} />
        <circle className="fg" cx="32" cy="32" r={R} style={{ stroke: color, strokeDasharray: `${on} ${C}` }} />
      </svg>
      <div className="val">
        {Math.round(pct)}%
        {sub && <span className="sub">{sub}</span>}
      </div>
      <div className="lbl">{label}</div>
    </div>
  );
};

export const render = ({ cal, allDay, tasks, notes, notesDirty, tabs, main, view,
                        geo: savedG, split, hiddenChips, sel, noteList, noteEdit, stats = initialState.stats, error,
                        meetings, meetNote, pulling, copied, fold, openTasks, pinned, copiedTask, cuClose = { pending: 0, titles: [] },
                        marks = {}, taskOrder = [], markPop = "", taskDrag = null, sysMode = "load", settings = SETTINGS_DEF,
                        taskTab = "desk", cuTasks = [], cuNotes = {},
                        gcal, compose, evBusy, flash: flashMsg, zoomBox, zooms = [], team = [],
                        teamNotes = { added: [], gone: [], synced: 0 }, teamSync = false,
                        emails = [], mail = {}, mailSync = false, preps = {}, prepSeen = [], prepOpen = "", cmdBox = null,
                        flow = null, flowStatus = "", flowSel = "", noteMode = "view", me = initialState.me,
                        mine = { items: {} }, flowTab = "team", flowDone = false, flowGrp = "", flowClosed = false,
                        wiki = null, wikiInbox = [], wikiLive = null, wikiPage = "home", wikiQ = "", wikiKind = "all", wikiAs = "all",
                        wikiAdd = null, wikiOrigin = "50% 30%", watch = {}, crm = null, crmUi = null }, dispatch) => {
  const gOK = CFG.googleApi && gcal === "ok";
  const flashEl = flashMsg
    ? <div className={`flash${/^(api|not|no|fail|could|give|unknown)/i.test(flashMsg) ? " bad" : ""}`}>{flashMsg}</div>
    : null;
  WIDTH = clamp((split && split.wide) || BASE_WIDTH, WIDE_MIN, WIDE_MAX);
  curView = view || "desk";
  const geo = savedG || defaultGeo();
  const sp = { ...SPLIT_DEFAULTS, ...(split || {}) };
  const fd = fold || {};
  // a folded panel is a bar; its splitter goes with it, since there is nothing left to resize
  const hSys  = fd.sys  ? CFG.foldHeight : sp.sys;
  const hMeet = CFG.foldHeight;               // the call bar: always one line, never folds
  const calW = clamp(sp.cal, 240, WIDTH - 200);
  const colW = WIDTH - CFG.gap - calW;
  const showProcs = hSys >= 200;            // a short System panel drops the process list
  const rowH = savedRowH();
  const notesTabs = noteList || [];
  const activeNote = (notesTabs.find(n => n.on) || notesTabs[0] || { name: "notes" }).name;
  const shownChips = (allDay || []).filter(e => !(hiddenChips || []).includes(e.title));
  // an app pane swallows the space the calendar row + terminal occupied, so Notes never shifts
  const paneH0 = view === "desk" ? sp.dock : (savedPaneH() || (rowH ? rowH + CFG.gap + sp.dock : sp.dock));
  // One big area for every tab. On the desk it is the calendar row plus the terminal; on CRM,
  // Workstreams, Wiki and Claude it is that same total, so Notes never moves when you switch.
  // Dragging the handle under any of them grows or shrinks the terminal by the same amount.
  const paneOver = savedPaneOver();
  const paneH = view !== "desk" && paneOver > 0 ? paneOver + sp.dock : paneH0;
  const viewGrip = view !== "desk" && (
    <div className={splitH} title="drag to give this view more room (Notes shrinks when the screen runs out)"
         style={{ left: 0, right: 0, bottom: -CFG.gap, height: CFG.gap }}
         onMouseDown={e => beginBottomSplit(e, sp, "dock", dispatch)} />
  );
  const hourBase = clamp(sp.hourH || CFG.hourHeight, 16, 96);
  // Terminal off: the desk row (Calendar and Tasks) takes the whole big area the row and the
  // terminal used to share, the same height CRM, Workstreams, Wiki and Claude get. The calendar's
  // hours stretch to fill it, so you see the same window of the day, just roomier.
  const deskBig = !CFG.terminal && paneOver > 0 ? paneOver + sp.dock : 0;
  const calFixed = savedCalFixed();
  const hourH = deskBig && calFixed ? clamp((deskBig - calFixed - hMeet - CFG.gap) / CFG.hours, hourBase, 160) : hourBase;
  const isMain = onMainDisplay(main);
  // terminal off: any Terminal thread windows still parked over the desk are hidden, once
  if (!CFG.terminal && !threadsHidden && (tabs || []).some(t => t.visible)) { threadsHidden = true; hideThreads(dispatch); }
  pollStats(dispatch, isMain);
  if (view === "desk") setTimeout(() => { rememberRowH(); rememberCalH(hourH); rememberCalFixed(); rememberPaneH(); }, 250);
  const calMinH = savedCalH(hourH);
  const drawnHours = CFG.hours + CFG.spareHours;
  if (CFG.mainDisplayOnly && !isMain) return <div />;

  const now = new Date();
  const startHour = new Date(now); startHour.setMinutes(0, 0, 0);
  const windowStart = startHour.getTime();
  const pxPerMin = hourH / 60;
  const toY = t => ((t - windowStart) / 60000) * pxPerMin;
  const windowEnd = windowStart + drawnHours * 3600 * 1000;
  const inWindow = cal.filter(e => e.end.getTime() > windowStart && e.start.getTime() < windowEnd);
  const visible = layout(inWindow, (18 / pxPerMin) * 60000);   // 18px = an event's minimum height
  // What Apple leads with: whatever is running now, else the next thing you have not declined.
  const notOut = inWindow.filter(e => e.mine !== "declined" && e.status !== "canceled");
  const live = notOut.filter(e => e.start <= now && e.end > now).sort((a, b) => a.end - b.end)[0];
  const next = notOut.filter(e => e.start > now).sort((a, b) => a.start - b.start)[0];
  const lead = live ? { kind: "now", e: live, at: live.end }
             : next ? { kind: "up next", e: next, at: next.start }
             : null;
  // midnight inside the rolling window, if it falls there
  const midnight = new Date(startHour); midnight.setHours(24, 0, 0, 0);
  const crosses = midnight.getTime() > windowStart && midnight.getTime() < windowEnd;
  const pins = pinned || [];
  // pinned first, then tasks you have not placed yet (news before the rest), then your dragged
  // order. With no dragged order yet, that is the old rule: news first, then TASKS.md's order.
  const ord = taskOrder || [];
  const rank = t => {
    const i = pins.indexOf(t.title); if (i >= 0) return i;
    const o = ord.indexOf(t.title);
    if (o < 0) return pins.length + ((watch[t.title] || []).length ? 0 : 0.5);
    return pins.length + 1 + o;
  };
  // sort is stable, so rows of equal rank keep TASKS.md's order
  let active = tasks.filter(t => !t.done).map(t => ({ ...t, alerts: watch[t.title] || [] }))
                    .sort((a, b) => rank(a) - rank(b)).slice(0, CFG.tasksMax);
  if (taskDrag) {                            // mid drag: draw the rows in the order under the pointer
    const pos = t => { const i = taskDrag.list.indexOf(t.title); return i < 0 ? 999 : i; };
    active = [...active].sort((a, b) => pos(a) - pos(b));
  }
  const activeTitles = active.map(t => t.title);
  const today = now.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });

  // the frontmost on-screen thread is the one the dock is currently showing
  const shown = tabs.filter(t => t.visible).sort((a, b) => a.z - b.z)[0];
  if (view === "desk") {
    lastThread = shown ? shown.id
      : (lastThread && tabs.some(t => t.id === lastThread)) ? lastThread : (tabs[0] ? tabs[0].id : "");
  }
  const busiest = stats.procs.length ? Math.max(...stats.procs.map(p => p.pct), 1) : 1;

  return (
    <div id="msbai-shell" style={{ position: "fixed", left: geo.x, top: geo.y }}>
    <div className={shell} id="msbai-zoom" style={{ zoom: CFG.zoom, width: WIDTH, position: "relative" }}>
      <style>{settingsVars(settings || SETTINGS_DEF)}</style>
      <div className={wideGrip} title="drag to make the whole widget wider or narrower"
           onMouseDown={e => beginSplit(e, "wide", "x", 1, WIDTH, WIDE_MIN, WIDE_MAX, sp, CFG.zoom, dispatch)} />
      {/* ── which pane this is: deliberately faint until you go looking for it ── */}
      <div className={`${viewTab} ${dragTab}`} title="drag to move the whole cluster · double-click desk for settings"
           style={{ zoom: (settings || SETTINGS_DEF).tabs }}
           onMouseDown={e => beginDrag(e, geo, dispatch)}>
        <span className={view === "desk" ? "on" : view === "settings" ? "on set" : ""}
              onClick={() => { if (!dragMoved && view !== "settings") setView("desk", dispatch); }}
              onDoubleClick={() => setView(view === "settings" ? "desk" : "settings", dispatch)}>{view === "settings" ? "settings" : "desk"}</span>
        {APPS.map(a => (
          <span key={a.key} className={view === a.key ? "on" : ""}
                onClick={() => { if (!dragMoved) setView(a.key, dispatch); }}>{a.label}</span>
        ))}
        {OWN_VIEWS.map(o => (
          <span key={o.key} className={view === o.key ? "on" : ""} title={o.key === "crm" ? crmBadge(crm, emails, me).tip : ""}
                onClick={() => { if (!dragMoved) setView(o.key, dispatch); }}>
            {o.label}{o.key === "crm" && crmBadge(crm, emails, me).n
              ? <b style={{ color: ACCENT.reply, marginLeft: 4, fontWeight: 800 }}>{crmBadge(crm, emails, me).n}</b> : ""}</span>
        ))}
      </div>

      {/* ── Calendar + (Tasks over System) ── */}
      {view === "desk" && <div className={row} id="msbai-row" style={deskBig ? { minHeight: deskBig } : undefined}>
        {/* The detail card hangs off the row, not off the calendar grid, so it can use the
            full width of the cluster and cover Tasks / System / Meetings — which is what you
            want when you are reading it. The row is also the right ceiling: the terminal slot
            below holds a real window that floats above the desktop layer, so a card drawn
            over that would simply be hidden by it. */}
        {sel && (
          <div className={scrim} onClick={() => dispatch({ type: "SEL", value: null })} />
        )}
        {sel && (() => {
          const inv = inviteParts(sel);
          // Nothing to join and nothing extracted? Fall back to whatever single link the
          // event carries, so a bare invite with only a url still gets a button, unless that
          // link is already sitting in the prose, where it is clickable where it belongs.
          const only = linkOf(sel);
          const spare = inv.links.length || !only || inv.body.join(" ").includes(only);
          const primary = inv.join || (spare ? "" : only);
          const close = () => dispatch({ type: "SEL", value: null });
          const live = evLive(sel);
          const people = sel.people || [];
          const going = people.filter(p => p.st === "accepted").length;
          const rgb = sel.color || "203,211,222";
          const more = EV_MORE.has(sel.uid || sel.title);
          const body = inv.body;
          const longBody = body.filter(Boolean).length > 7;
          const shownBody = longBody && !more ? body.slice(0, 7) : body;
          const peopleShown = EV_PPL.has(sel.uid || sel.title) ? people : people.slice(0, 8);
          const canAnswer = CFG.googleApi && sel.attendees > 0 && !sel.sub && !sel.birthday;
          const startCall = () => {
            const want = people.filter(p => !p.me).map(p => (p.em || p.n).toLowerCase());
            const picked = (team || []).filter(t => want.some(w => w.startsWith(String(t.name || "").toLowerCase().split(" ")[0])
                                                              || (t.email && w === String(t.email).toLowerCase()))).map(t => t.id);
            close();
            dispatch({ type: "ZOOM", value: { ...newZoomBox("meet"), topic: sel.title, picked } });
          };
          return (
          <div className={evCard} style={{ "--ev": rgb }} tabIndex={-1}
               ref={el => { if (!el) return; el.style.setProperty("--ev", rgb);
                            if (el.dataset.f !== sel.title) { el.dataset.f = sel.title; el.focus(); } }}
               onKeyDown={e => { if (e.key === "Escape") close(); }}>
            <div className="glow" />
            <div className="x" title="close (Esc)" onClick={close}>×</div>

            <div className="hd">
              <div className="cal"><i />{sel.calendar || "Calendar"}{badgeOf(sel) ? <span className="bdg">{badgeOf(sel)}</span> : null}</div>
              <div className="t">{sel.title}</div>
              <div className="when">
                {sel.start
                  ? <span>{sel.start.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })} · {hh(sel.start)} to {hh(sel.end)} · {evDur(sel)}</span>
                  : <span>All day</span>}
              </div>
              {live && <div className={`live ${live.k}`}>
                <span className="dot" />{live.text}
                {live.k === "now" && <span className="pb"><i style={{ width: `${live.pct}%` }} /></span>}
              </div>}
            </div>

            <div className="acts">
              {primary && <span className={`join${live && (live.k === "now" || live.k === "soon") ? " hot" : ""}`} onClick={() => openUrl(primary)}>
                <svg viewBox="0 0 16 16"><path d="M2.5 5.2A1.7 1.7 0 0 1 4.2 3.5h5.1A1.7 1.7 0 0 1 11 5.2v5.6a1.7 1.7 0 0 1-1.7 1.7H4.2a1.7 1.7 0 0 1-1.7-1.7z" /><path d="M11 7l3-2v6l-3-2" /></svg>
                {inv.join ? joinVerb(inv.join) : "Open link"}</span>}
              {!primary && sel.attendees > 0 && <span className="join alt" onClick={startCall} title="start a Meet or Zoom with these people (Fireflies joins)">
                <svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10" /></svg>Start a call</span>}
              {primary && <span className={`chip${copied === "ev:" + sel.title ? " ok" : ""}`} onClick={() => copyText(primary, dispatch, "ev:" + sel.title)}>
                {copied === "ev:" + sel.title ? "copied" : "copy link"}</span>}
              <span className="chip" title="a new Claude thread with this meeting: who, when, the invite and your prep"
                    onClick={() => { close(); toClaude(evBrief(sel, inv, preps[sel.uid]), dispatch); }}>prep with Claude</span>
              {primary && sel.attendees > 0 && <span className="chip" onClick={startCall} title="start a fresh Meet or Zoom with these people instead">new call</span>}
            </div>

            {canAnswer && (
              <div className="sec rsvp">
                <span className="lb">Going?</span>
                <span className="seg">
                  {[["accepted", "Yes", ""], ["tentative", "Maybe", "maybe"], ["declined", "No", "declined"]].map(([ans, lbl, st]) => {
                    const on = sel.mine === st || (st === "" && !sel.mine), busy = evBusy === sel.uid;
                    return (
                      <span key={ans} className={`${on ? "on" : ""}${on && st === "declined" ? " no" : ""}${!gOK || busy ? " dis" : ""}`}
                            title={gOK ? `${lbl}: the organiser is notified` : "connect Google Calendar to answer from here"}
                            onClick={() => { if (gOK && !busy && !on) respondTo(sel, ans, dispatch); }}>{busy && !on ? "…" : lbl}</span>
                    );
                  })}
                </span>
                {sel.mine === "reply" && <span className="need">needs your answer</span>}
              </div>
            )}
            {canAnswer && gcal && !gOK && (
              <div className="hint">Answer invitations from here after a one time login: <code>desk-widget/gcal.sh auth</code>
                {gcal === "noclient" ? ". The README has the five minute setup." : ""}</div>
            )}
            {flashEl}

            {(sel.loc || people.length > 0) && (
              <div className="sec">
                {sel.loc && <div className="row loc"><svg viewBox="0 0 16 16"><path d="M8 14s4.5-4.2 4.5-7.6A4.5 4.5 0 0 0 3.5 6.4C3.5 9.8 8 14 8 14z" /><circle cx="8" cy="6.4" r="1.6" /></svg>
                  <span>{linkify(sel.loc)}</span></div>}
                {people.length > 0 && <div>
                  <div className="lh">People · {people.length}{going ? ` · ${going} going` : ""}{sel.organizer ? ` · organized by ${sel.organizer}` : ""}</div>
                  <div className="ppl">
                    {peopleShown.map((p, i) => (
                      <span key={i} className={`pp ${p.st}${p.me ? " me" : ""}`} style={{ animationDelay: `${60 + i * 25}ms` }}
                            title={`${p.n}${p.em ? " · " + p.em : ""} · ${p.st}${p.em ? " · click to copy the email" : ""}`}
                            onClick={() => p.em && copyText(p.em, dispatch, "ev:" + p.em)}>
                        <i style={{ background: evAvatar(p.n) }}>{evInitials(p.n)}</i>
                        <span className="pn">{copied === "ev:" + p.em ? "copied" : p.me ? "You" : p.n.split(" ")[0]}</span>
                      </span>
                    ))}
                    {people.length > 8 && <span className="pp more" onClick={() => { EV_PPL.has(sel.uid || sel.title) ? EV_PPL.delete(sel.uid || sel.title) : EV_PPL.add(sel.uid || sel.title); dispatch({ type: "SEL", value: { ...sel } }); }}>
                      <i>{EV_PPL.has(sel.uid || sel.title) ? "−" : `+${people.length - 8}`}</i><span className="pn">{EV_PPL.has(sel.uid || sel.title) ? "less" : "more"}</span></span>}
                  </div>
                </div>}
              </div>
            )}

            {sel.uid && preps[sel.uid] && <div className="sec prep"><div className="lh">Your prep</div><PrepBody md={preps[sel.uid]} /></div>}

            {body.length > 0 && (
              <div className="sec n">
                <div className="lh">Details</div>
                <div className={longBody && !more ? "fade" : ""}>
                  {shownBody.map((ln, i) =>
                    ln === ""
                      ? <div key={i} className="gap" />
                      : <div key={i} className={/^\u2022/.test(ln) ? "bul" : ""}>{linkify(ln)}</div>
                  )}
                </div>
                {longBody && <span className="tg" onClick={() => { more ? EV_MORE.delete(sel.uid || sel.title) : EV_MORE.add(sel.uid || sel.title); dispatch({ type: "SEL", value: { ...sel } }); }}>
                  {more ? "show less" : "show everything"}</span>}
              </div>
            )}

            {inv.links.length > 0 && (
              <div className="sec">
                <div className="lh">Links</div>
                <div className="lks">
                  {inv.links.map((l, i) => (
                    <span key={i} className="lk2" title={l.url} onClick={() => openUrl(l.url)}>
                      <b>{l.label}</b><span>{shortUrl(l.url)}</span></span>
                  ))}
                </div>
              </div>
            )}

            <div className="ft">
              {!sel.sub && !sel.birthday && <span onClick={() => openInCalApp(sel)}>{sel.attendees > 0 && sel.mine === "reply" && !CFG.googleApi ? "Answer in Calendar" : "Open in Calendar"}</span>}
              {sel.uid && <span onClick={() => openInGoogle(sel, dispatch)}>Open in Google Calendar</span>}
              <span className="k">Esc to close</span>
            </div>
          </div>
          );
        })()}
        {/* ── Say it: one sentence becomes a call, a task, or a Claude thread. ── */}
        {cmdBox && !sel && !compose && !zoomBox && (
          <div className={scrim} onClick={() => dispatch({ type: "CMD", value: null })} />
        )}
        {cmdBox && !sel && !compose && !zoomBox && (() => {
          const c = cmdBox;
          return (
          <div className={popover}>
            <div className="x" title="close" onClick={() => dispatch({ type: "CMD", value: null })}>×</div>
            <div className="t">{c.listening ? "Listening" : "Say it"}</div>
            <div className="s">Talk (the waveform pill, or your dictation key) or type. "Start a Meet with Kriss and Ayesha about Supersonics", "remind me to send Abdul the UDL doc Friday", "draft a reply to Allan's email about the CLIN".</div>
            <div className="form">
              <div className="full">
                {/* Uncontrolled, like Notes: writing value back on each render fights macOS dictation,
                    which re-inserts its provisional text and tripled every phrase. */}
                <input type="text" placeholder="What do you need?"
                       ref={el => {
                         if (!el) return;
                         if (document.activeElement !== el && el.value !== (c.text || "")) el.value = c.text || "";
                         if (!c.focused) { el.focus(); c.focused = true; }
                       }}
                       onInput={e => { c.text = e.target.value; }}
                       onKeyDown={e => { if (e.key === "Enter") runCommand({ ...c, text: e.target.value }, team, dispatch); }} />
              </div>
            </div>
            <div className="go">
              <span className={`join${c.busy ? " dis" : ""}`} onClick={() => runCommand({ ...c, text: c.text }, team, dispatch)}>{c.busy ? "Working…" : "Go"}</span>
              <span className="cancel" onClick={() => dispatch({ type: "CMD", value: null })}>Close</span>
            </div>
            {c.msg && <div className={`flash${c.ok ? "" : " bad"}`}>{c.msg}</div>}
          </div>
          );
        })()}

        {/* ── Prep card: opens by itself ten minutes before a call, once. ── */}
        {(() => {
          if (sel || compose || zoomBox || cmdBox) return null;
          const nowMs = Date.now();
          const ev = prepOpen
            ? (cal || []).find(e => e.uid === prepOpen)
            : (cal || []).find(e => e.uid && preps[e.uid] && e.start &&
                e.start.getTime() - nowMs <= 10 * 60e3 && nowMs - e.start.getTime() <= 5 * 60e3 &&
                !(prepSeen || []).includes(e.uid));
          if (!ev || !preps[ev.uid]) return null;
          const mins = Math.round((ev.start.getTime() - nowMs) / 60e3);
          const join = inviteParts(ev).join || linkOf(ev);
          const close = () => markPrepSeen(ev.uid, prepSeen, dispatch);
          const left = ev.start.getTime() - nowMs;
          const frac = Math.max(0, Math.min(1, 1 - left / (10 * 60e3)));   // the ring fills over the last ten minutes
          const C = 2 * Math.PI * 24;
          const people = (ev.people || []).filter(p => !p.me);
          return (
            <div>
            <div className={scrim} onClick={close} />
            <div className={`${evCard} ${headsCss}`} tabIndex={-1}
                 ref={el => { if (!el) return; el.style.setProperty("--ev", ev.color || "100,210,255");
                              if (el.dataset.f !== ev.uid) { el.dataset.f = ev.uid; el.focus(); } }}
                 onKeyDown={e => { if (e.key === "Escape") close(); }}>
              <div className="x" title="close (Esc)" onClick={close}>×</div>
              <div className="hd hhd">
                <div className={`cd${mins <= 1 ? " now" : ""}`}>
                  <svg viewBox="0 0 56 56"><circle className="bg" cx="28" cy="28" r="24" />
                    <circle className="fg" cx="28" cy="28" r="24" style={{ strokeDasharray: C, strokeDashoffset: C * (1 - frac) }} /></svg>
                  <span className="num">{mins > 0 ? <span><b>{mins}</b><small>min</small></span> : <b className="nw">now</b>}</span>
                </div>
                <div className="mtx">
                  <div className="cal"><i />Coming up{ev.calendar ? ` · ${ev.calendar}` : ""}</div>
                  <div className="t">{ev.title}</div>
                  <div className="when">{hh(ev.start)} to {hh(ev.end)} · {evDur(ev)} · {mins > 0 ? `starts in ${mins} min` : mins === 0 ? "starting now" : `started ${-mins} min ago`}</div>
                </div>
              </div>
              <div className="acts">
                {join && <span className="join hot" onClick={() => { close(); openUrl(join); }}>
                  <svg viewBox="0 0 16 16"><path d="M2.5 5.2A1.7 1.7 0 0 1 4.2 3.5h5.1A1.7 1.7 0 0 1 11 5.2v5.6a1.7 1.7 0 0 1-1.7 1.7H4.2a1.7 1.7 0 0 1-1.7-1.7z" /><path d="M11 7l3-2v6l-3-2" /></svg>
                  {joinVerb(join)}</span>}
                <span className="chip" onClick={() => { close(); dispatch({ type: "SEL", value: ev }); }}>meeting details</span>
                <span className="chip" onClick={() => { close(); toClaude(evBrief(ev, inviteParts(ev), preps[ev.uid]), dispatch); }}>prep with Claude</span>
              </div>
              {people.length > 0 && <div className="sec">
                <div className="lh">With</div>
                <div className="ppl">
                  {people.slice(0, 10).map((p, i) => (
                    <span key={i} className={`pp ${p.st}`} style={{ animationDelay: `${60 + i * 25}ms` }} title={`${p.n} · ${p.st}`}>
                      <i style={{ background: evAvatar(p.n) }}>{evInitials(p.n)}</i><span className="pn">{p.n.split(" ")[0]}</span></span>
                  ))}
                  {people.length > 10 && <span className="pp more"><i>+{people.length - 10}</i></span>}
                </div>
              </div>}
              <div className="sec prep"><div className="lh">Your prep</div><PrepBody md={preps[ev.uid]} /></div>
              <div className="ft"><span onClick={close}>Got it</span><span className="k">Esc to close</span></div>
            </div>
            </div>
          );
        })()}

        {/* ── Zoom now. Same card and scrim as New event. ── */}
        {zoomBox && !sel && !compose && (
          <div className={scrim} onClick={() => dispatch({ type: "ZOOM", value: null })} />
        )}
        {zoomBox && !sel && !compose && (() => {
          const z = zoomBox;
          const set = (k, v) => dispatch({ type: "ZOOM", value: { ...z, [k]: v, msg: "", done: false } });
          const close = () => dispatch({ type: "ZOOM", value: null });
          const label = z.kind === "meet" ? "Google Meet" : "Zoom";
          const go = () => startZoom({ ...z, topic: z.topic }, team, dispatch);
          const n = (z.picked || []).length;
          return (
          <div className={`${evCard} ${meetCss}`} tabIndex={-1}
               ref={el => { if (!el) return; el.style.setProperty("--ev", z.kind === "meet" ? "52,199,140" : "76,140,255");
                            if (!el.dataset.f) { el.dataset.f = "1"; el.focus(); } }}
               onKeyDown={e => { if (e.key === "Escape") close(); }}>
            <div className="x" title="close (Esc)" onClick={close}>×</div>
            <div className="hd mhd">
              <div className={`mic${z.busy ? " busy" : ""}${z.done ? " done" : ""}`}>
                <span className="ring" /><span className="ring r2" />
                {z.done
                  ? <svg viewBox="0 0 24 24"><path className="ck" d="M6 12.5l4 4 8-9" /></svg>
                  : <svg viewBox="0 0 24 24"><rect x="3" y="7" width="12" height="10" rx="2.4" /><path d="M15 10.5l5-3v9l-5-3" /></svg>}
              </div>
              <div className="mtx">
                <div className="cal"><i />Instant call{n ? <span className="bdg">{n} invited</span> : null}</div>
                <div className="t">{z.done ? `Your ${label} is live` : "Start a call now"}</div>
                <div className="when">{z.done ? "The join link is on your clipboard." : `Fireflies joins to take notes.${n ? " Everyone you pick gets the link." : ""}`}</div>
              </div>
            </div>

            {!z.done && <div className="sec">
              <div className="lh">Call on</div>
              <div className="plats">
                {[["meet", "Google Meet", "calendar invite and a Slack DM"], ["zoom", "Zoom", "a Slack DM with the link"]].map(([k, lbl, sub]) => (
                  <span key={k} className={`pl ${k}${z.kind === k ? " on" : ""}`} onClick={() => set("kind", k)}>
                    <i>{k === "meet"
                      ? <svg viewBox="0 0 24 24"><rect x="3" y="7" width="12" height="10" rx="2.4" /><path d="M15 10.5l5-3v9l-5-3" /></svg>
                      : <svg viewBox="0 0 24 24"><rect x="2.5" y="6.5" width="13" height="11" rx="3" /><path d="M15.5 10.5l5-3v9l-5-3" /></svg>}</i>
                    <span><b>{lbl}</b><small>{sub}</small></span>
                    <em className="rad" />
                  </span>
                ))}
              </div>
            </div>}

            {!z.done && <div className="sec">
              <div className="lh">Name</div>
              <input className="nm" type="text" placeholder="Quick sync"
                     ref={el => { if (el && document.activeElement !== el && el.value !== (z.topic || "")) el.value = z.topic || ""; }}
                     onInput={e => { z.topic = e.target.value; }}
                     onBlur={e => set("topic", e.target.value)}
                     onKeyDown={e => { if (e.key === "Enter") startZoom({ ...z, topic: e.target.value }, team, dispatch); }} />
            </div>}

            {!z.done && <div className="sec">
              <div className="lh" style={{ display: "flex", alignItems: "baseline" }}>
                <span>Invite{n ? ` · ${n} picked` : ""}</span>
                <span className="lk3" style={{ marginLeft: "auto" }}
                      title={`Teammates come from Slack: active people with your email domain, checked once a day${teamNotes.synced ? `, last ${agoShort(teamNotes.synced)}` : ""}`}
                      onClick={() => { if (!teamSync) teamCmd("sync", dispatch); }}>{teamSync ? "checking Slack\u2026" : "update from Slack"}</span>
              </div>
              {(teamNotes.added.length > 0 || teamNotes.gone.length > 0) && (
                <div className="tnote">
                  {teamNotes.added.length > 0 && <div>New from Slack: <b>{teamNotes.added.map(p => p.name).join(", ")}</b></div>}
                  {teamNotes.gone.map(p => (
                    <div key={p.id}><b>{p.name}</b> is no longer active in Slack.{" "}
                      <span className="lk3" onClick={() => teamCmd(`drop ${p.id}`, dispatch)}>Take off the list</span></div>
                  ))}
                </div>
              )}
              <div className="ppl">
                {team.length === 0 && <span className="none">No teammates yet. Click update from Slack.</span>}
                {team.map((p, i) => {
                  const on = (z.picked || []).includes(p.id);
                  return (
                    <span key={p.id} className={`pp pick${on ? " on" : ""}`} style={{ animationDelay: `${40 + i * 18}ms` }}
                          onClick={() => set("picked", on ? z.picked.filter(x => x !== p.id) : [...(z.picked || []), p.id])}>
                      <i style={{ background: on ? "" : evAvatar(p.name) }}>{on ? "\u2713" : evInitials(p.name)}</i>
                      <span className="pn">{p.name}</span>
                    </span>
                  );
                })}
              </div>
            </div>}

            {z.done && z.msg && <div className="sec okmsg">{z.msg}</div>}

            <div className="ft2">
              {z.done
                ? <span className="join" onClick={close}>Done</span>
                : <span className={`join${z.busy ? " dis" : ""}`} onClick={go}>
                    {z.busy ? <span className="spin" /> : <svg viewBox="0 0 16 16"><path d="M2.5 5.2A1.7 1.7 0 0 1 4.2 3.5h5.1A1.7 1.7 0 0 1 11 5.2v5.6a1.7 1.7 0 0 1-1.7 1.7H4.2a1.7 1.7 0 0 1-1.7-1.7z" /><path d="M11 7l3-2v6l-3-2" /></svg>}
                    {z.busy ? `Starting your ${label}\u2026` : `Start ${label}`}</span>}
              {!z.done && <span className="chip" onClick={close}>Cancel</span>}
              <span className="k">Esc to close</span>
            </div>
            {z.msg && !z.done && <div className="flash bad">{z.msg}</div>}
          </div>
          );
        })()}
        {/* ── New event. Same card, same place; the scrim closes it. ── */}
        {compose && !sel && (
          <div className={scrim} onClick={() => dispatch({ type: "COMPOSE", value: null })} />
        )}
        {compose && !sel && (() => {
          const c = compose;
          const set = (k, v) => dispatch({ type: "COMPOSE", value: { ...c, [k]: v } });
          return (
          <div className={popover}>
            <div className="x" title="close" onClick={() => dispatch({ type: "COMPOSE", value: null })}>×</div>
            <div className="t">New event</div>
            <div className="s">{gOK
              ? "On your Google calendar. Invitations go out when you save."
              : CFG.googleApi
                ? "Through Calendar.app until Google is connected — no invitations from here yet."
                : "Goes onto your Google calendar through Calendar.app. Add invitees there afterwards."}</div>
            {gOK && (
              <div className="quick">
                <input type="text" value={c.quick} placeholder={'Quick add — "Lunch with Kriss tomorrow 12pm"'}
                       onChange={e => set("quick", e.target.value)}
                       onKeyDown={e => { if (e.key === "Enter") quickAdd(c, dispatch); }} />
                <span className={`rb${c.busy ? " dis" : ""}`} onClick={() => !c.busy && quickAdd(c, dispatch)}>Add</span>
              </div>
            )}
            <div className="form">
              <div className="full">
                <div className="fl">Title</div>
                <input type="text" value={c.title} onChange={e => set("title", e.target.value)}
                       onKeyDown={e => { if (e.key === "Enter") submitCompose(c, dispatch); }} />
              </div>
              <div>
                <div className="fl">Date</div>
                <input type="date" value={c.date} onChange={e => set("date", e.target.value)} />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div className="fl">Start</div>
                  <input type="time" value={c.start} disabled={c.allday} onChange={e => set("start", e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <div className="fl">Length</div>
                  <select value={c.minutes} disabled={c.allday} onChange={e => set("minutes", parseInt(e.target.value, 10))}>
                    {[15, 30, 45, 60, 90, 120].map(m => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h`}</option>)}
                  </select>
                </div>
              </div>
              {CFG.googleApi && <div className="full">
                <div className="fl">Invite</div>
                <input type="text" value={c.attendees} placeholder="emails, comma separated"
                       onChange={e => set("attendees", e.target.value)} />
              </div>}
              {CFG.googleApi && <div className={`chk${gOK ? "" : " dis"}`} onClick={() => gOK && set("meet", !c.meet)}>
                <input type="checkbox" checked={gOK && c.meet} disabled={!gOK} readOnly /> Add Google Meet
              </div>}
              <div className="chk" onClick={() => set("allday", !c.allday)}>
                <input type="checkbox" checked={c.allday} readOnly /> All day
              </div>
              <div className="full">
                <div className="fl">Location</div>
                <input type="text" value={c.location} onChange={e => set("location", e.target.value)} />
              </div>
              <div className="full">
                <div className="fl">Notes</div>
                <textarea value={c.notes} onChange={e => set("notes", e.target.value)} />
              </div>
            </div>
            <div className="go">
              <span className={`join${c.busy ? " dis" : ""}`} onClick={() => !c.busy && submitCompose(c, dispatch)}>
                {c.busy ? "Saving…" : gOK ? (c.attendees.trim() ? "Create and send invitations" : "Create") : "Add to calendar"}
              </span>
              <span className="cancel" onClick={() => dispatch({ type: "COMPOSE", value: null })}>Cancel</span>
            </div>
            {CFG.googleApi && gcal && !gOK && (
              <div className="hint">Invitations, Google Meet and quick add need a one-time login: <code>desk-widget/gcal.sh auth</code>
                {gcal === "noclient" ? " — the README has the five-minute setup." : ""}</div>
            )}
            {flashEl}
          </div>
          );
        })()}
        {CFG.terminal
          ? <div className={splitH} title="drag: trade calendar height for terminal space"
                 style={{ left: 0, right: 0, bottom: -CFG.gap, height: CFG.gap }}
                 onMouseDown={e => beginRowSplit(e, sp, "dock", dispatch)} />
          : <div className={splitH} title="drag to give Calendar and Tasks more room (Notes shrinks when the screen runs out)"
                 style={{ left: 0, right: 0, bottom: -CFG.gap, height: CFG.gap }}
                 onMouseDown={e => beginBottomSplit(e, sp, "dock", dispatch)} />}
        <div className={splitV} title="drag to resize"
             style={{ top: 0, bottom: 0, left: calW, width: CFG.gap }}
             onMouseDown={e => beginSplit(e, "cal", "x", 1, calW, 240, WIDTH - 200, sp, CFG.zoom, dispatch)} />
        <div style={{ width: calW, flex: "0 0 auto", display: "flex", flexDirection: "column", gap: CFG.gap }}>
          {/* ── Above the calendar: System on the left, + Meet on the right, two pills that together
                 span the calendar's width. ── */}
          <div style={{ display: "flex", gap: CFG.gap, flex: "0 0 auto", height: hMeet }}>
            <div className={panel} style={{ flex: "2 1 0", minWidth: 0, padding: "0 14px", overflow: "hidden", cursor: "pointer",
                                             display: "flex", alignItems: "center" }}
                 title={(sysMode === "disk" ? "click for CPU and RAM · " : "click for storage detail · ")
                        + `CPU ${Math.round(stats.cpu)}% · RAM ${gb(stats.memUsed).toFixed(1)}G of ${gb(stats.memTotal).toFixed(0)}G · ${kbGb(stats.diskFree).toFixed(0)}G free of ${kbGb(stats.diskTotal).toFixed(0)}G`}
                 onClick={() => flipSysMode(sysMode, dispatch)}>
              {sysMode !== "disk" && <span className={sysMini} style={{ width: "100%", justifyContent: "space-between" }}>
                <span>CPU <b style={{ color: ACCENT.cpu }}>{Math.round(stats.cpu)}%</b></span>
                <span>RAM <b style={{ color: ACCENT.ram }}>{Math.round(stats.memPct)}%</b></span>
                <span><b style={{ color: ACCENT.disk }}>{kbGb(stats.diskFree).toFixed(0)}G</b> free</span>
              </span>}
              {sysMode === "disk" && <span className={sysMini} style={{ width: "100%", alignItems: "center", gap: 10 }}>
                <span className="k">Disk</span>
                <span><b style={{ color: "#fff" }}>{kbGb(stats.diskUsed).toFixed(0)}G</b> of {kbGb(stats.diskTotal).toFixed(0)}G</span>
                <span style={{ flex: "1 1 auto", minWidth: 24, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.12)", overflow: "hidden" }}>
                  <i style={{ display: "block", height: "100%", width: `${Math.min(100, Math.round(stats.diskPct))}%`, borderRadius: 2,
                              background: stats.diskPct >= 90 ? "#FF5F5F" : stats.diskPct >= 80 ? "#FF9CA0" : ACCENT.disk }} /></span>
                <span><b style={{ color: ACCENT.disk }}>{kbGb(stats.diskFree).toFixed(0)}G</b> free</span>
              </span>}
            </div>
            <div className={panel} style={{ flex: "1 1 0", minWidth: 0, padding: "0 11px", overflow: "hidden", cursor: "pointer",
                                             display: "flex", alignItems: "center", justifyContent: "center" }}
                 title="start a call now: pick Google Meet or Zoom, pick teammates, Fireflies joins"
                 onClick={() => dispatch({ type: "ZOOM", value: zoomBox ? null : newZoomBox("meet") })}>
              <span className={callBtn}>
                <svg viewBox="0 0 10 10" width="8" height="8" aria-hidden="true" style={{ display: "block", marginRight: 5 }}>
                  <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                Meet</span>
            </div>
          </div>
        <div id="msbai-cal" className={panel}
             style={{ flex: "1 1 auto", paddingLeft: 10, minHeight: calMinH || undefined,
                      display: "flex", flexDirection: "column" }}>
          <div className={head}>
            <span>{today}</span>
            <span style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
              {CFG.calNewButton && <span className={refreshBtn} title="new event"
                    onClick={() => dispatch({ type: "COMPOSE", value: compose ? null : newCompose() })}>+ new</span>}
              <span className="v">next {CFG.hours}h</span>
            </span>
          </div>
          {error && <div className={err}>{error}</div>}
          {/* Two whole elements rather than one with a fragment inside: Übersicht compiles JSX
              with pragma `html` and sets no pragmaFrag, so `<>` falls through to React.Fragment
              and there is no React here. It also keeps the flex children direct children. */}
          {lead ? (
            <div className={upNext} style={{ cursor: "pointer" }}
                 onClick={() => dispatch({ type: "SEL", value: lead.e })}>
              <i className="dot" style={{ background: `rgb(${lead.e.color || "203,211,222"})` }} />
              <span className="k">{lead.kind}</span>
              <span className="t" title={lead.e.title}>{lead.e.title}</span>
              <span className="w">
                {lead.kind === "now" ? `ends ${hh(lead.e.end)}` : `in ${rel(lead.at - now)}`}
              </span>
            </div>
          ) : (
            <div className={`${upNext} clear`}>
              <span className="t">
                {inWindow.length ? "No more events today" : "Your day is clear"}
              </span>
            </div>
          )}
          {(shownChips.length > 0 || hiddenChips.length > 0) && (
            <div className={chipRow}>
              {shownChips.map((e, i) => (
                <span key={i} className={`${chip} ${chipOpen}`} title={e.calendar || e.title}
                      style={e.color ? { background: `rgba(${e.color},0.22)`,
                                         borderColor: `rgba(${e.color},0.5)` } : undefined}
                      onClick={() => dispatch({ type: "SEL", value: e })}>
                  <span className="lbl">{e.birthday ? `${e.title} 🎂` : e.title}</span>
                  <b className="x" title="hide this all-day event"
                     onClick={ev => { ev.stopPropagation(); hideChip(e.title, hiddenChips, dispatch); }}>×</b>
                </span>
              ))}
              {hiddenChips.length > 0 && (
                <span className={`${chip} ${chipRestore}`} title="show hidden all-day events again"
                      onClick={() => restoreChips(dispatch)}>+{hiddenChips.length}</span>
              )}
            </div>
          )}
          <div id="msbai-grid" className={grid}
               style={{ flex: "1 1 0", minHeight: CFG.hours * hourH,
                        // cut the spare hours off at the bottom only: the hour labels hang outside the side
                        clipPath: "inset(-40px -60px 0 -60px)" }}
               onClick={() => sel && dispatch({ type: "SEL", value: null })}>
            {Array.from({ length: drawnHours }).map((_, i) => (
              <div key={i} className={hourRow} style={{ height: hourH }}><span className="lbl">{hourLabel(startHour.getHours() + i, i === 0)}</span></div>
            ))}
            <div className={nowLine} style={{ top: toY(now.getTime()) }} />
            {crosses && (
              <div className={dayLine} style={{ top: toY(midnight.getTime()) }}>
                <span>{dayName(midnight)}</span>
              </div>
            )}
            {visible.map((e, i) => {
              const top = Math.max(0, toY(e.start.getTime()));
              const bottom = Math.min(drawnHours * hourH, toY(e.end.getTime()));
              const h = Math.max(18, bottom - top);
              const badge = badgeOf(e);
              const gone = e.status === "canceled";
              const off = e.mine === "declined";
              // Side by side when a cluster overlaps, full width when it does not. The two
              // OpenClaw sessions at 11:00 used to be one box hiding another.
              const L = right ? 4 : 6, R = right ? 6 : 4;
              const span = `((100% - ${L + R}px) / ${e.cols})`;
              return (
                <div key={i}
                     className={`${evt} ${e.end < now ? "past" : ""} ${hollowOf(e) ? "hollow" : ""}` +
                                `${gone ? " gone" : ""}${off ? " off" : ""}`}
                     title={`${e.title}${e.calendar ? ` — ${e.calendar}` : ""}`}
                     style={{ top, height: h,
                              left: `calc(${L}px + ${span} * ${e.col})`,
                              width: `calc(${span} - ${e.cols > 1 ? 3 : 0}px)`,
                              ...tint(e) }}
                     onClick={ev => { ev.stopPropagation(); dispatch({ type: "SEL", value: e }); }}>
                  <div className="t">
                    {/* too short for the time line, so the start time leads the title instead */}
                    {h <= 30 && <span style={{ fontWeight: 500, opacity: .75, marginRight: 4,
                                               fontVariantNumeric: "tabular-nums" }}>{hh(e.start)}</span>}
                    {e.title}
                    {badge && e.cols === 1 && <span className="b" style={e.mine === "reply" ? { color: ACCENT.reply } : undefined}>{badge}</span>}
                  </div>
                  {h > 30 && (
                    <div className="s">
                      {hh(e.start)}–{hh(e.end)}
                      {e.cols === 1 && e.attendees > 1 ? ` · ${e.attendees}` : ""}
                      {e.cols === 1 && e.loc ? ` · ${e.loc}` : ""}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        </div>

        <div className={col} style={{ width: colW, flex: "0 0 auto" }}>
          <div className={panel} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <div className={head}>
              <span className="tabs">
                {/* no React here (see the calendar header), so a flat list rather than fragments */}
                {[["desk", "Tasks"], ["bar"], ["collab", "Collab"]].map(([k, label]) => k === "bar"
                  ? <span key="bar" className="bar">|</span>
                  : <span key={k} className={`tab${taskTab === k ? " on" : ""}`}
                          title={`${k === "collab" ? "tasks you share with teammates" : "your desk tasks"} · double-click to open your Focus Board in ClickUp`}
                          onMouseDown={e => { if (e.detail > 1) e.preventDefault(); }}
                          onClick={() => { try { localStorage.setItem(TASK_TAB_KEY, k); } catch (e) {}
                                           dispatch({ type: "TASK_TAB", value: k }); }}
                          onDoubleClick={() => openUrl(FOCUS_BOARD)}>{label}</span>)}
              </span>
              <span className="v">{taskTab === "collab" ? `${cuTasks.length} shared` : `${active.length} active${(cuClose && cuClose.pending) ? ` · ClickUp ${cuClose.pending} queued` : ""}`}</span>
            </div>
            {/* The list is absolutely positioned inside an empty flex box, so it contributes no
                height of its own. In flow, an open task grew the column, the column grew the row,
                and the terminal and Notes were shoved down the screen; now the panel keeps the
                calendar's height and the list scrolls inside it.
                The scroll box reaches 8px into the panel's left gutter and pads it back, so a checkbox
                hanging left of the text column is drawn rather than clipped by overflow. It reaches
                14px into the right gutter the same way, so the overlay scrollbar sits there instead
                of on top of each open row's copy button. */}
            <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
            <div className={noBar} style={{ position: "absolute", top: 0, bottom: 0, left: -20, right: -14,
                          overflow: "auto", paddingLeft: 20, paddingRight: 14 }}>
              {taskTab === "collab" && (() => {
                // which board tasks are already twinned with a desk task (a `· synced` line)
                const onDesk = new Set();
                tasks.forEach(t => (t.notes || []).forEach(n =>
                  (String(n).match(/app\.clickup\.com\/t\/([0-9a-z]+)\)\s*·\s*synced/g) || [])
                    .forEach(m => onDesk.add(m.match(/t\/([0-9a-z]+)/)[1]))));
                if (!cuTasks.length) return <div style={{ color: GLASS.label }}>No shared tasks, or not fetched yet.</div>;
                return cuTasks.map(c => {
                  // open state shares the desk list's store, under a key no task title can have
                  const key = `cu:${c.id}`;
                  // summary lines first, then this task's own ClickUp link, then the other links;
                  // any other link to the same task is dropped so it shows once
                  const self = `https://app.clickup.com/t/${c.id}`;
                  const raw = (cuNotes[c.id] || []).filter(n => !n.includes(`${self})`));
                  const isLink = n => /^\[[^\]]+\]\(https?:\/\//.test(n);
                  const notes = [...raw.filter(n => !isLink(n)), `[Click to view in ClickUp](${self})`, ...raw.filter(isLink)];
                  const open = (openTasks || []).includes(key);
                  return (
                    <div key={c.id} className={taskRow}>
                      <div className="body" style={{ cursor: "pointer" }}
                           title={open ? "click to fold" : (cuNotes[c.id] ? "click for details and links" : "details are still being gathered")}
                           onClick={() => toggleTask(key, openTasks, dispatch)}>
                        <div className="t">
                          <span className="chev">{open ? "\u25BE" : "\u25B8"}</span>
                          <span>{c.name}</span>
                          <span className="ic" style={{ marginLeft: "auto" }} title="work it: a new Claude thread with this collaboration"
                                onClick={stop(() => toClaude(`${CFG.workItLead}\n\n${collabMd(c, notes)}`, dispatch))}>
                            <svg viewBox="0 0 16 16"><path d="M5 3.5l7 4.5-7 4.5z" /></svg></span>
                          <span className={`ic${copied === key ? " done" : ""}`} title="copy everything about this collaboration"
                                onClick={stop(() => copyText(collabMd(c, notes), dispatch, key))}>
                            {copied === key ? <svg viewBox="0 0 16 16"><path d="M3 8.5l3.2 3.2L13 5" /></svg>
                              : <svg viewBox="0 0 16 16"><rect x="5.5" y="5.5" width="8" height="8" rx="1.6" />
                                  <path d="M10.5 4.5v-1a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h1" /></svg>}</span>
                          <span className="ic" title="see it in Workstreams" onClick={stop(() => openInWorkstreams(c, flow, dispatch))}>
                            <svg viewBox="0 0 16 16"><path d="M4 2.5v11M4 5.5c0 3 8 2 8 5" /><circle cx="4" cy="3" r="1.6" />
                              <circle cx="12" cy="11.5" r="1.6" /><circle cx="4" cy="13" r="1.6" /></svg></span>
                        </div>
                        <div className="m">
                          {[c.who && `with ${c.who}`, c.status, c.due && `due ${c.due}`, c.list].filter(Boolean).join(" · ")}
                          {onDesk.has(c.id) ? <span className="tag">[on desk]</span> : null}
                        </div>
                        {open && <div className="notes" onClick={e => e.stopPropagation()}>
                          {notes.map((n, i) => <div key={i} className="note">{mdInline(n)}</div>)}
                        </div>}
                      </div>
                    </div>
                  );
                });
              })()}
              {taskTab !== "collab" && active.length === 0 && <div style={{ color: GLASS.label }}>Nothing active. Debriefs land here.</div>}
              {taskTab !== "collab" && active.map(t => {
                const notes = t.notes || [];
                const news = t.alerts || [];
                // news alone is enough to open a row: a glowing task always has something to show
                const has = notes.length > 0 || news.length > 0;
                const open = has && (openTasks || []).includes(t.title);
                const pin = pins.includes(t.title);
                const mk = MARKS.find(m => m.key === (marks || {})[t.title]);
                const dragging = taskDrag && taskDrag.title === t.title;
                return (
                  <div key={t.title} data-task={t.title}
                       className={`${taskRow}${pin ? " pin" : ""}${news.length ? " notify" : ""}${mk ? " marked" : ""}${dragging ? " dragging" : ""}`}
                       style={mk ? { "--mk": mk.hex, "--mkrgb": mk.rgb } : undefined}
                       ref={el => { if (!el) return; if (mk) { el.style.setProperty("--mk", mk.hex); el.style.setProperty("--mkrgb", mk.rgb); }
                                    else { el.style.removeProperty("--mk"); el.style.removeProperty("--mkrgb"); } }}
                       onMouseLeave={() => { clearTimeout(markTimer); if (markPop === t.title) dispatch({ type: "MARK_POP", value: "" }); }}>
                    <span className="mkzone"
                          onMouseEnter={() => { clearTimeout(markTimer);
                                                markTimer = setTimeout(() => dispatch({ type: "MARK_POP", value: t.title }), MARK_HOVER_MS); }}
                          onMouseLeave={() => clearTimeout(markTimer)} />
                    {markPop === t.title && (
                      <div className="mkpop" onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
                        {MARKS.map(m => <span key={m.key} className={`sw${mk && mk.key === m.key ? " on" : ""}`}
                                              title={mk && mk.key === m.key ? `clear the ${m.name} highlight` : `highlight ${m.name}`}
                                              style={{ background: m.hex }}
                                              onClick={() => setMark(t.title, m.key, marks, dispatch)} />)}
                        {mk && <span className="clr" title="no highlight" onClick={() => setMark(t.title, "", marks, dispatch)}>×</span>}
                      </div>
                    )}
                    <input type="checkbox" title="done — moves it to Done in TASKS.md, then queues synced ClickUp tasks to close"
                           onChange={() => completeTask(t, dispatch)} />
                    <div className="body" style={{ cursor: has ? "pointer" : "default" }}
                         title={(news.length && !open ? "new: open to see what came in · " : "")
                                + (has ? (open ? "click to fold" : `click for ${notes.length} note${notes.length === 1 ? "" : "s"}`) + " · " : "")
                                + (pin ? "double-click to unpin" : "double-click to pin to the top")
                                + " · hold and drag to move · rest on the right edge to highlight"}
                         onMouseDown={e => { if (e.detail > 1) e.preventDefault(); else beginTaskDrag(e, t.title, activeTitles, pins, dispatch); }}
                         onClick={e => {
                           if (taskDragged) { taskDragged = false; return; }   // that was a drag, not a click
                           // the second click of a double-click: the first already toggled the notes,
                           // so put them back, and let onDoubleClick do the pinning
                           if (has) toggleTask(t.title, e.detail === 2 ? savedOpen() : openTasks, dispatch);
                         }}
                         onDoubleClick={() => togglePin(t.title, pins, dispatch)}>
                      <div className="t">
                        {has && <span className="chev">{open ? "\u25BE" : "\u25B8"}</span>}
                        <span className={news.length ? "nt" : ""}>{t.title}</span>
                        {open && <span className={`cp${copiedTask === t.title ? " done" : ""}`}
                                       title={copiedTask === t.title ? "copied" : "copy brief, sources, and what changed"}
                                       onClick={stop(() => copyTask(t, dispatch))}>
                          {copiedTask === t.title
                            ? <svg viewBox="0 0 16 16"><path d="M3 8.5l3.2 3.2L13 5" /></svg>
                            : <svg viewBox="0 0 16 16">
                                <rect x="5.5" y="5.5" width="8" height="8" rx="1.6" />
                                <path d="M10.5 4.5v-1a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h1" />
                              </svg>}</span>}
                        {open && <span className="cp" style={{ marginLeft: 0 }}
                                       title="work it: a new thread in the Claude app with this task"
                                       onClick={stop(() => workTask(t, dispatch))}>
                          <svg viewBox="0 0 16 16"><path d="M5 3.5l7 4.5-7 4.5z" /></svg></span>}
                      </div>
                      {t.meta && <div className="m">{t.meta.split(/(\[[^\]]+\])/).map((s, i) => /^\[/.test(s) ? <span key={i} className="tag">{s}</span> : s)}</div>}
                      {open && news.length > 0 && <div className="news" onClick={e => e.stopPropagation()}>
                        {news.map(a => <div key={a.id} className="nw">
                          <div className="wh"><span className="src">{a.src || "new"}</span>
                            {a.url ? mdInline(`[${a.what}](${a.url})`) : a.what}</div>
                          {a.next && <div className="nx">{a.next}</div>}
                        </div>)}
                        <div className="acts">
                          <span title="work it with this news: a new Claude thread" onClick={stop(() => workTask(t, dispatch))}>work it</span>
                          <span title="seen it: stop the glow until something else lands" onClick={stop(() => dismissWatch(t.title, dispatch))}>got it</span>
                        </div>
                      </div>}
                      {open && <div className="notes">
                        {notes.map((n, i) => <div key={i} className={`note${/^Source:/i.test(n) ? " src" : ""}`}>{mdInline(n)}</div>)}
                      </div>}
                    </div>
                  </div>
                );
              })}
            </div>
            </div>
          </div>

        </div>
      </div>}

      {/* ── Terminal: tabs on top, the window parks in the slot below ── */}
      {view === "desk" && CFG.terminal && CFG.dockHeight > 0 && isMain && (
        <div className={paneBlock}>
          <div className={tabBar}>
            {tabs.map(t => {
              const p = tabParts(t);
              const on = shown && shown.id === t.id;
              return (
                <div key={t.id}
                     className={`${tab} ${on ? "on" : ""}`}
                     title={t.label || `thread ${t.n}`}
                     onClick={() => focusThread(t.id, dispatch)}>
                  {p.glyph && <span className="g">{p.glyph}</span>}
                  <span className="l">{p.text}</span>
                  <span className="x" onClick={e => { e.stopPropagation(); closeThread(t.id, on, dispatch); }}>×</span>
                </div>
              );
            })}
            <div className={tabAdd} title="a Claude thread here on the Mac, in ~/AI Tools"
                 onClick={() => newThread(dispatch, "desktop")}>+ desktop</div>
            <div className={tabAdd} title="an OpenClaw terminal: runs the command in desk-widget/openclaw-cmd"
                 onClick={() => newThread(dispatch, "openclaw")}>+ openclaw</div>
            <div className={tabSpacer} />
            {tabs.some(t => t.visible) && <div className={tabHide} onClick={() => hideThreads(dispatch)}>hide</div>}
          </div>
          <div className={splitH} title="drag to resize"
               style={{ left: 0, right: 0, bottom: -CFG.gap, height: CFG.gap }}
               onMouseDown={e => beginBottomSplit(e, sp, "dock", dispatch)} />
          <div id="msbai-dock" className={dock} style={{ height: sp.dock }}
               onClick={() => (shown ? focusThread(shown.id, dispatch)
                             : tabs[0] ? focusThread(tabs[0].id, dispatch)
                             : newThread(dispatch))}>
            {tabs.length === 0 ? "click to start a terminal thread" : "terminal"}
          </div>
        </div>
      )}

      {/* ── App panes: the real app parks in the slot, Notes stays put underneath ── */}
      {view !== "desk" && isMain && appByKey(view) && (
        <div className={paneBlock}>
          <div id="msbai-app-dock" className={claudePane} style={{ height: paneH }}
               onClick={() => showApp(appByKey(view).name)}>
            {appByKey(view).label} parks here
          </div>
          {viewGrip}
        </div>
      )}
      {/* ── Priorities: the team's workstreams as a flow, newest at the bottom. ── */}
      {view === "priorities" && (<div className={paneBlock}>
        <FlowView flow={flow} status={flowStatus} sel={flowSel} copied={copied} height={paneH} me={me}
                  mine={mine} tab={flowTab} doneOpen={flowDone} grpOpen={flowGrp} split={sp} showClosed={flowClosed} dispatch={dispatch} />
        {viewGrip}
      </div>)}
      {/* ── Settings: double-click the desk tab. ── */}
      {view === "settings" && (<div className={paneBlock}>
        <SettingsView settings={settings || SETTINGS_DEF} height={paneH} dispatch={dispatch} />
        {viewGrip}
      </div>)}
      {/* ── Wiki: the company's knowledge, top down. ── */}
      {view === "wiki" && (<div className={paneBlock}>
        <WikiView wiki={wiki} inbox={wikiInbox} live={wikiLive} page={wikiPage} q={wikiQ} kind={wikiKind} as={wikiAs}
                  add={wikiAdd} origin={wikiOrigin} flow={flow} mine={mine} me={me} tasks={tasks} cuTasks={cuTasks}
                  height={paneH} dispatch={dispatch} />
        {viewGrip}
      </div>)}
      {/* ── CRM: what is most urgent across the three companies, by Ayesha's four levels, plus the Inbox. ── */}
      {view === "crm" && (<div className={paneBlock}>
        <CrmView crm={crm} ui={crmUi || initialState.crmUi} emails={emails} mail={mail} mailSync={mailSync} me={me}
                 copied={copied} height={paneH} tasks={tasks} flow={flow} openTasks={openTasks} dispatch={dispatch} />
        {viewGrip}
      </div>)}
      {/* ── Notes ── */}
      <div className={panel} id="msbai-notes" style={{ position: "relative" }}>
        <div className={splitH} title="drag to make the notes taller or shorter"
             style={{ left: 0, right: 0, bottom: -CFG.gap, height: CFG.gap }}
             onMouseDown={e => beginBottomSplit(e, sp, "notes", dispatch)} />
        <div className={head}>
          <div className={noteTabs}>
            {noteEdit === null && notesTabs.map(n => (
              <span key={n.name} className={n.on ? "on" : ""}
                    title={n.name + ".md  ·  drag to reorder, double-click to rename"}
                    onMouseDown={e => beginNoteDrag(e, n.name, notesTabs, dispatch)}
                    onClick={() => { if (!noteDragged && !n.on) noteCmd(`use ${JSON.stringify(n.name)}`, dispatch); }}
                    onDoubleClick={() => n.on &&
                      dispatch({ type: "NOTE_EDIT", value: { mode: "rename", value: n.name } })}>{n.name}</span>
            ))}
            {noteEdit === null && (
              <span className="add" title="new note"
                    onClick={() => dispatch({ type: "NOTE_EDIT", value: { mode: "new", value: "" } })}>+</span>
            )}
            {noteEdit !== null && (
              <input className="ni" autoFocus value={noteEdit.value}
                     placeholder={noteEdit.mode === "new" ? "new note name" : "rename to…"}
                     onChange={e => dispatch({ type: "NOTE_EDIT", value: { ...noteEdit, value: e.target.value } })}
                     onKeyDown={e => {
                       if (e.key === "Enter") {
                         const v = (noteEdit.value || "").trim();
                         dispatch({ type: "NOTE_EDIT", value: null });
                         if (v) noteCmd(`${noteEdit.mode === "new" ? "new" : "rename"} ${JSON.stringify(v)}`, dispatch);
                       } else if (e.key === "Escape") {
                         dispatch({ type: "NOTE_EDIT", value: null });
                       }
                     }} />
            )}
          </div>
          <span className="v">{notesDirty ? "saving…" : `${activeNote}.md`}</span>
        </div>
        {/* Uncontrolled on purpose. Writing value back on every render (each keystroke, each stats
            tick) fights macOS dictation, which keeps provisional text in the field and re-inserts
            it when the field is reset: one spoken phrase came out ~30 times. The box owns its text
            while focused; a note is loaded into it on a tab switch or when nobody is typing. */}
        {/* Notes read formatted (headings, bold, lists, rules, links); click anywhere to edit the
            markdown, click away to read it again. */}
        {noteMode !== "edit" && (
          <div className={notesView} title="click to edit" style={{ height: sp.notes || CFG.notesHeight }}
               onClick={e => { if (!e.target.closest || !e.target.closest(".lk")) dispatch({ type: "NOTE_MODE", value: "edit" }); }}>
            {String(notes || "").trim() ? mdBlock(notes) : <span className="ph">Scratch space. Click to write; saves to AI Tools/notes/.</span>}
          </div>
        )}
        {noteMode === "edit" && <textarea
          key={activeNote}
          className={notesBox}
          style={{ height: sp.notes || CFG.notesHeight }}
          onBlur={() => dispatch({ type: "NOTE_MODE", value: "view" })}
          ref={el => {
            if (!el) return;
            if (document.activeElement !== el && !notesDirty && el.value !== notes) el.value = notes;
            if (!el.dataset.focused) { el.dataset.focused = "1"; el.focus(); }
          }}
          placeholder="Scratch space. Saves to AI Tools/notes/ as you type."
          onChange={e => { dispatch({ type: "NOTES_EDIT", value: e.target.value }); saveNotes(e.target.value, dispatch, activeNote); }}
          onKeyDown={e => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") { e.preventDefault(); wrapBold(e, dispatch, activeNote); }
            if (e.key === "Escape") e.target.blur();
          }}
        />}
      </div>

    </div>
    </div>
  );
};
