# ───────────── second pass: where every page lives, and the operating pages ─────────────
# Inserted into wiki_build.py before the output is assembled.
SLK = "https://msbai.slack.com/archives/"
def slack(name, cid): return {"k": "slack", "t": "#" + name, "u": SLK + cid}
def cus(name, sid): return {"k": "clickup", "t": name + " space", "u": "https://app.clickup.com/20115771/v/s/" + sid}
def cuf(name, fid): return {"k": "clickup", "t": name, "u": "https://app.clickup.com/20115771/v/f/" + fid}
def cul(name, lid): return {"k": "clickup", "t": name, "u": "https://app.clickup.com/20115771/v/li/" + lid}
def cud(name, u): return {"k": "clickup", "t": name, "u": u}
def drv(name, fid): return {"k": "drive", "t": name, "u": "https://drive.google.com/drive/folders/" + fid}
def gdoc(name, did): return {"k": "drive", "t": name, "u": "https://docs.google.com/document/d/" + did + "/edit"}

# ClickUp: Goals & Workstreams lists (from streams.tsv) and their folders
FOLDERS = {"90118135056": "MSBAI · Phase III HPCMP (CFD)", "90118135057": "MSBAI · Phase I NASA (MBE GURU)",
           "90118135060": "MSBAI · Phase II OrbitGuard (CDAO)", "90118135058": "MSBAI · Cross Cutting",
           "90118135097": "Tam Fortis", "90118135098": "Nexcavate"}
FOLDER_OF = {"MSBAI · Phase III HPCMP (CFD)": "90118135056", "MSBAI · Phase I NASA (MBE GURU)": "90118135057",
             "MSBAI · Phase II OrbitGuard (CDAO)": "90118135060", "MSBAI · Cross-Cutting": "90118135058",
             "Tam Fortis": "90118135097", "Nexcavate": "90118135098", "Goals & Workstreams": ""}
LISTS = {}
# the 00 Goals and 01 Inbox lists seen in ClickUp on Oct 4, so goals and untriaged work land on the right company
for _id, _nm, _fo in [("901114113984", "00 Goals", "90118135056"), ("901114113989", "00 Goals", "90118135057"),
                      ("901114113990", "01 Inbox / Untriaged", "90118135057"), ("901114113992", "00 Goals", "90118135058"),
                      ("901114113993", "01 Inbox / Untriaged", "90118135058"), ("901114114013", "00 Goals", "90118135060"),
                      ("901114114014", "01 Inbox / Untriaged", "90118135060"), ("901114114066", "00 Goals", "90118135097"),
                      ("901114114067", "01 Inbox / Untriaged", "90118135097"), ("901114114075", "01 Inbox / Untriaged", "90118135098")]:
    LISTS[_id] = {"name": _nm, "folder": _fo}
for line in open(STREAMS_TSV, encoding="utf-8"):
    f = line.rstrip("\n").split("\t")
    if len(f) >= 3 and f[0].isdigit():
        LISTS[f[0]] = {"name": f[2], "folder": FOLDER_OF.get(f[1], "")}
def lid(name):
    for k, v in LISTS.items():
        if v["name"].lower().startswith(name.lower()): return k
    raise SystemExit("no list: " + name)

G_AND_W = cus("Goals & Workstreams", "90114201246")
WHERE = {
 "msbai": dict(links=[slack("general", "CBGKWT5M3"), slack("bizdev", "C01SQDMFLGH"), G_AND_W,
        cuf("Cross Cutting workstreams", "90118135058"), drv("MSBAI BIZDEV", "1nigd7gql2lLIgx8nKErmPT7icbpoNdgR"),
        drv("GURU Marketing Materials", "1x-qoTtCvcKM4LVFAnNDDg1ZgQjhj3Das")],
        folders=["90118135056", "90118135057", "90118135060", "90118135058"], find="MSBAI"),
 "guru": dict(links=[slack("guru_gen2_requirements_and_architecture", "C05PXTD7W22"), slack("gen2-capabilities", "C06PNGDEZSR"),
        cus("GURU Gen 2 (Dev)", "90113932521"), cuf("GURU Gen 2 docs", "90111677285"),
        drv("Gen 2 architecture resources", "1Ds0gF5CiSnazy8NDxiPWeOXz1WPx7VuQ"), drv("GURU Supporting Materials", "1gDysJ3h36kjEUz9LHrtJCAFGwo_7QDYM")],
        lists=[lid("GURU Gen 2 Platform")], find="GURU Gen 2"),
 "g-ui": dict(links=[slack("guru-ui", "C01R0PR7PT7"), slack("guru-gen-2-design-eleken", "C09FCQEK1PH"), drv("GURU_UI", "1G-mGl07YtjcIc5tWsBAyrU_9e3saupiF")],
        lists=[lid("GURU Gen 2 Platform")], find="GURU UI"),
 "g-gw": dict(links=[slack("self_orchestration_and_voice", "C01B9FH4E5V"), slack("guru_gen2_requirements_and_architecture", "C05PXTD7W22")],
        lists=[lid("Common Internal Language"), lid("SELF Orchestration")], find="global workspace"),
 "g-blackboard": dict(lists=[lid("Common Internal Language")], find="blackboard"),
 "g-agents": dict(links=[slack("geometry_search_and_synthesis", "C05RNN2S3QS"), cus("Registry (Dev)", "90113948962")],
        lists=[lid("Geometry Synthesis"), lid("Software Control")], find="GURU agents"),
 "g-nav": dict(lists=[lid("Software Control")], find="software navigation"),
 "g-act": dict(lists=[lid("CFD Workflow Parallelization")], find="grid quality"),
 "g-plan": dict(lists=[lid("CFD Workflow Parallelization")], find="workflow planning"),
 "g-cil": dict(links=[slack("self_orchestration_and_voice", "C01B9FH4E5V")], lists=[lid("Common Internal Language"), lid("SELF Orchestration")],
        find="common internal language"),
 "g-rules": dict(lists=[lid("Common Internal Language")], find="rules engine"),
 "g-ontology": dict(lists=[lid("Common Internal Language")], find="ontology"),
 "g-exec": dict(links=[slack("hpc-concepts", "C01U1S3981M"), slack("hpc-status", "C03UKEYSC05"), slack("devops", "C05V35EUB41"),
        cus("Supercomputer", "90114082928"), drv("HPCMP", "1xP_QS3M9BbZhCEW4JNei8wE4CZ22iibC")],
        lists=[lid("HPC Operations")], find="HPCMP"),
 "g-learn": dict(links=[slack("ai-team-strategyandprogress", "C014L3RAMF1"), cus("Learning Engine (Dev)", "90113930893"), cus("Registry (Dev)", "90113948962")],
        lists=[lid("Conjunction-Risk JEPA")], find="Learning Engine"),
 "g-data": dict(lists=[lid("Geometry Synthesis")], find="training data"),
 "g-tooling": dict(links=[slack("frontier-project", "C036GRN7RK7"), slack("devops", "C05V35EUB41"), cus("Supercomputer", "90114082928")],
        lists=[lid("HPC Operations")], find="Frontier Aurora"),
 "svc-orbitguard": dict(links=[slack("sda_tap_lab_apollo_accelerator", "C07FAEH24HM"), slack("spaceforce_whitecell_phase2", "C064CCLE528"),
        cuf("OrbitGuard folder", "90118135060"), drv("OrbitGuard TACFI", "1GvDY_T6vkqfZ1p5rlDyDqVruCdj8wETW"),
        drv("OrbitGuard Demos", "1QjD1yu1k3UuX9rrEV51OZ65HKgrbh0Ck")],
        folders=["90118135060"], lists=[lid("OrbitGuard"), lid("Conjunction-Risk JEPA")], find="OrbitGuard"),
 "svc-cfd": dict(links=[slack("cfd_applications", "C02MDKZHV97"), cuf("HPCMP Phase III folder", "90118135056"),
        drv("AFRL GURU Gen 2 Phase III", "1FvwhcezbTNHDckH5eAayK8jSGP0Sa3LX")],
        folders=["90118135056"], lists=[lid("SU2 Validation"), lid("Customer Demos"), lid("Kestrel Knowledge"), lid("Kestrel Integration")], find="CFD SU2"),
 "svc-mbe": dict(links=[cuf("NASA Phase I folder", "90118135057")], folders=["90118135057"], lists=[lid("MBE GURU")], find="MBE GURU NASA"),
 "programs": dict(links=[G_AND_W] + [cuf(v, k) for k, v in FOLDERS.items() if k in ("90118135056", "90118135057", "90118135060", "90118135058")]),
 "tamfortis": dict(links=[slack("tamfortissolutions", "C08PZ1TTJ65"), cuf("Tam Fortis workstreams", "90118135097"), cus("SSOT", "90114195400"),
        drv("Tam Fortis Solutions", "1caCkpPU39Pb2zsGLBMm2IL4R63zRazOy"), drv("Internal Documents, Tam Fortis", "1b4ySbHXPTYLZl4x_5dVkooy1Y2A77puh")],
        folders=["90118135097"], find="Tam Fortis"),
 "reactor": dict(links=[slack("tamfortissolutions", "C08PZ1TTJ65"), drv("Internal Documents, Tam Fortis", "1b4ySbHXPTYLZl4x_5dVkooy1Y2A77puh")],
        lists=[lid("Microreactor Design Studies"), lid("Advanced Reactor Architecture"), lid("Microreactor SSOT")], find="microreactor"),
 "tf-ssot": dict(links=[cus("SSOT", "90114195400")], lists=[lid("Microreactor SSOT")], find="SSOT reactor"),
 "tf-people": dict(lists=[lid("Tam Fortis Fundraising"), lid("Tam Fortis Marketing")], find="Tam Fortis"),
 "r-autonomy": dict(lists=[lid("Reactor Control Prototype")], find="digital twin reactor"),
 "nexcavate": dict(links=[slack("nexcavate", "C07RABB39L0"), slack("nexcavate_collaboration", "C08U39DBEVB"), cuf("Nexcavate workstreams", "90118135098"),
        drv("Nexcavate", "1-9pjHbJ3jTxQK0prSbam8apn4H4SU1F1"), drv("Nexcavate Materials", "1Mj2ZcjfceLe4t8qCxVIjrQd0KXludo-_")],
        folders=["90118135098"], find="Nexcavate"),
 "permitpulse": dict(links=[slack("nexcavate", "C07RABB39L0"), drv("PermitPulse one pager assets", "1BNBk8XyjmXUmETUdX2ZQfMJiMmroX8Vc")],
        lists=[lid("PermitPulse"), lid("Nexcavate Opportunity")], find="PermitPulse"),
 "n-pulse": dict(lists=[lid("Pulse Extract")], find="Pulse Extract"),
 "h-paraview": dict(links=[cuf("ParaView docs", "90118302400"), slack("data-visualization", "C023R15JPV3")], lists=[lid("GURU ParaView")], find="ParaView"),
 "h-dsrc": dict(links=[cus("Supercomputer", "90114082928")], lists=[lid("HPC Operations")], find="DSRC"),
 "h-singularity": dict(links=[slack("devops", "C05V35EUB41")], find="Singularity container"),
 "h-kestrel": dict(lists=[lid("Kestrel Knowledge"), lid("Kestrel Integration")], find="Kestrel tutorial"),
 "p-proposals": dict(links=[cus("Proposals", "90110367357"), drv("Proposals 2026", "1qgOrOlFFCvGVNg45WvF0cUndPsORSDEF"),
        drv("Proposals, selected", "191jwhcSL-gvGZ_6_DwKFGL2rkp2r4-HV"), drv("Proposals, not selected", "1qLLaowCUUx-7cG5ehGAf8lvPpTRSAoDi")],
        lists=[lid("BizDev & Proposal")], find="proposal"),
 "p-paper": dict(links=[drv("arXiv publication", "1IKyU2k9NOWXkLKpuS5bzZ8pYB9IIhl5t")], lists=[lid("Research Papers")], find="arXiv GURU paper"),
 "p-taplab": dict(links=[slack("sda_tap_lab_apollo_accelerator", "C07FAEH24HM")], find="TAP Lab"),
}

# ── how we work: the operating pages OpenClaw reads ──
def op(id, title, what, fits, steps, rules, links, lists=(), find="", owner="Ryland", status="current", connects=()):
    page(id, title, "all", "process", "work", what, fits, list(connects), "", status=status, owner=owner)
    P[id]["steps"] = steps; P[id]["rules"] = rules
    WHERE[id] = dict(links=links, lists=list(lists), find=find or title)

op("w-tasks", "How a task is born and closed",
   "Every task starts somewhere (a meeting, an email, a Slack thread, a gap on a wiki page) and ends checked off, with proof. This is the one path, so nobody has to remember where something went.",
   "Tasks live in ClickUp. Your desk list in the widget is your view of them, kept in sync both ways.",
   ["A call starts from the widget's Create Meet. Fireflies joins and records it.",
    "Atlas (OpenClaw) writes the meeting brief into the Meeting Briefs space and creates the tasks in Goals & Workstreams, in the right workstream list, tagged atlas. Anything it cannot place goes to that program's 01 Inbox / Untriaged.",
    "The widget's Workstreams view reads the same meetings, draws which streams moved, and checks your own steps against ClickUp, Slack and your sent mail so finished work stops glowing.",
    "Your tasks show on the desk list. Each one synced with ClickUp carries its ClickUp link.",
    "Check it off on the desk. The ClickUp task closes on the next sync.",
    "If the work changed what the company knows, register it on its wiki page."],
   ["One owner per task, named.", "Start the title with a verb.", "Put it in a workstream list, never only in a chat.",
    "Link the source: the meeting, email or thread it came from.", "Tags: atlas means OpenClaw made it, goal means it is an outcome in 00 Goals, focus-now means this week, untriaged means it still needs a home."],
   [G_AND_W, cus("Meeting Briefs", "90114263093"), slack("meeting-summaries", "C0BQDD6FKTN"), cul("Project Management & ClickUp Rollout", lid("Project Management"))],
   lists=[lid("Project Management")], find="task", connects=["w-streams", "w-meetings", "w-clickup"])
op("w-streams", "Workstreams",
   "A workstream is one line of work with one ClickUp list, for example SU2 Validation & Hypersonic Cases or PermitPulse. Goals & Workstreams has a folder per program, and every folder has 00 Goals and 01 Inbox / Untriaged plus one list per workstream.",
   "Wiki pages name their workstream, so a page shows the live work on it and the Workstreams tab opens straight to that stream.",
   ["A goal is written in the program's 00 Goals list: the outcome, an owner, a date when there is one.",
    "Each task goes in the workstream list it moves forward.",
    "New work with no home lands in 01 Inbox / Untriaged until someone places it.",
    "The Workstreams tab draws streams branching, merging and finishing from the meetings, newest at the bottom.",
    "When a stream finishes or merges, its wiki page records what was decided and where the result lives."],
   ["Stream names match the ClickUp list names exactly, so links never break.", "Proposed: a stream with no movement in three weeks comes up at the Monday meeting."],
   [G_AND_W] + [cuf(v, k) for k, v in FOLDERS.items()], find="workstream", connects=["w-tasks", "programs"])
op("w-clickup", "Where things live in ClickUp",
   "One map of the ClickUp workspace, so anyone (and any agent) knows where to put something and where to look for it.",
   "When this wiki moves into ClickUp, it becomes the Wiki space's front page.",
   ["Goals & Workstreams: goals, tasks and inboxes for every program. The place work is tracked.",
    "Meeting Briefs: one brief per meeting, by month, written by Atlas.",
    "Proposals: Opportunity Pipeline, Proposals In progress, Monthly Proposals & Submissions, the master list, events.",
    "CRM and CRM v3: contacts, relationships and email history.",
    "Wiki: the MSBAI Knowledge Base and, in the full build, this wiki.",
    "Documentation: the 2023 to 2024 engineering wiki, SOPs, HPC and ParaView docs. Evidence now, not a home.",
    "SSOT: the Tam Fortis Microreactor SSOT.", "OpenClaw: the OpenClaw handbook and its own work.",
    "GURU Gen 2 (Dev), Learning Engine (Dev), Registry (Dev), Supercomputer: engineering spaces."],
   ["Proposed: track work only in Goals & Workstreams.", "Proposed: write knowledge on wiki pages, not in task comments.", "Proposed: link Drive files instead of uploading copies."],
   [G_AND_W, cus("Meeting Briefs", "90114263093"), cus("Proposals", "90110367357"), cus("CRM", "90114024653"), cus("CRM v3", "90115186193"),
    cus("Wiki", "90114041591"), cus("Documentation", "90110097723"), cus("SSOT", "90114195400"), cus("OpenClaw", "90114178977"),
    cus("GURU Gen 2 (Dev)", "90113932521"), cus("Supercomputer", "90114082928")], find="ClickUp", connects=["w-tasks", "w-streams"])
op("w-email", "Email and outreach",
   "How email gets answered and how outreach is run and logged, so no thread is lost and every contact has a history.",
   "The widget's Emails tab and the OpenClaw CRM share the same rules.",
   ["The Emails tab lists threads waiting on you and suggests a reply using Gmail, Slack, ClickUp and Drive for context.",
    "You edit the suggestion or give a one line note; the reply is saved as a Gmail draft. Nothing is sent for you.",
    "Anything Ayesha sends, receives or is copied on goes to the OpenClaw mailbox and is logged on the contact in the ClickUp CRM.",
    "Outreach replies are tracked in the Email Response Tracker list in Proposals.",
    "A reply that asks for work becomes a task in the right workstream."],
   ["Sign as Ryland Adams, MSBAI.", "Plain language, the ask first.", "Describe customer interest only as documented interest, participation or a potential path.",
    "Link documents instead of attaching them when the reader has access."],
   [slack("email-triage", "C0B67A65D6F"), slack("openclaw-crm", "C0AU2G7NM5L"), cus("CRM", "90114024653"), cus("CRM v3", "90115186193"),
    cul("Email Response Tracker", "901113291308")], find="outreach", connects=["w-proposals", "w-writing"])
op("w-proposals", "Proposal building",
   "From an opportunity to a submitted proposal, and what we keep afterwards so the next one is faster.",
   "Past proposals and reviewer feedback are the Past work section of this wiki.",
   ["Opportunities arrive in the Opportunity Pipeline (generated agency workflows, DSIP, BizDev from Slack).",
    "A go decision moves it to Proposals In progress, with a due date and owner.",
    "Drafts follow the Proposal Document Generation Standard (OpenClaw) and live in Drive under Proposals 2026.",
    "Before it goes out: an internal audit in four parts, WE SAID, WE DID, THE GAP, FIX.",
    "Submitted proposals are logged in Monthly Proposals & Submissions, then filed as selected or not selected with the reviewer feedback."],
   ["No figure appears externally without source confirmation from Abdul or Anton.", "Background IP (GURU, trained models) stays MSBAI background IP.",
    "Reuse the paper and architecture categories in this wiki for technical volumes."],
   [slack("bizdev", "C01SQDMFLGH"), slack("proposals", "C0245QBBNMN"), cus("Proposals", "90110367357"), cul("Monthly Proposals & Submissions", "901114418813"),
    cul("Import, MASTER Proposal List", "901103915833"), cul("Proposal Document Generation Standard (OpenClaw)", "901114380622"),
    drv("Proposals 2026", "1qgOrOlFFCvGVNg45WvF0cUndPsORSDEF"), drv("Proposal Writing (OpenClaw)", "1547qDUXjVZc4-35Eok6TkyAy8h0eZM2w")],
   lists=[lid("BizDev & Proposal")], find="proposal", owner="Ayesha", connects=["p-proposals", "w-writing"])
op("w-writing", "Writing rules",
   "The house style for anything written for MSBAI, Tam Fortis or Nexcavate, by a person or an agent.",
   "Kriss proposed on Oct 2 that OpenClaw enforce these with one shared terms library checked after every response.",
   [], ["Write GURU in all caps, every time. Allan's rule.", "No em dashes, en dashes or hyphens used as connectors.",
    "Plain language. Bottom line first.", "Slack: one message, saved as a draft to check before sending. Mention people with @, no bold name beside it. Caps section headers instead of bold.",
    "Spell team names right; the glossary is the reference."],
   [slack("bizdev", "C01SQDMFLGH")], find="style", connects=["glossary", "w-openclaw"])
op("w-meetings", "Meetings",
   "How a meeting is set up, recorded and turned into work.",
   "Feeds How a task is born and closed.",
   ["Start the call from the widget: Create Meet, pick Meet or Zoom, name it, tick teammates. They get the link by Slack DM and Fireflies joins.",
    "Twenty five minutes before a calendar meeting the widget builds a prep card from past meetings, Slack, Drive and tasks.",
    "After the call, Atlas writes the brief to Meeting Briefs and creates the tasks.",
    "Decisions made in the meeting are registered on the wiki page they change."],
   ["Action items name a person.", "Proposed: every working session is recorded."],
   [cus("Meeting Briefs", "90114263093"), slack("meeting-summaries", "C0BQDD6FKTN")], find="meeting", connects=["w-tasks"])
op("w-openclaw", "What OpenClaw takes from this wiki",
   "The wiki is the map OpenClaw works from. Each part of it answers a question an agent would otherwise guess at.",
   "Atlas already creates the tasks and briefs; this page is what it should read first.",
   ["Where does this belong? The page tree. Every page names its company and its place in the system.",
    "Who should see it? The keeper on the page.",
    "Where does the task go? The workstream list named on the page.",
    "How should it read? Writing rules, enforced after every response.",
    "Can we say this externally? The claim rules on Proposal building.",
    "What is stale? Pages marked Needs a check or Out of date get refreshed first."],
   ["Proposed: agents propose changes to pages and keepers approve them.", "Proposed: agents never overwrite a person's text."],
   [slack("openclaw-assistant", "C0ASY03CERE"), slack("openclaw-logs", "C0B40PG41K9"), cus("OpenClaw", "90114178977"),
    cud("OpenClaw Docs", "https://app.clickup.com/20115771/docs/k5w9v-54891"), cul("OpenClaw Automations", lid("OpenClaw Automations"))],
   lists=[lid("OpenClaw Automations")], find="OpenClaw", owner="Kriss (proposed)", connects=["w-tasks", "w-writing"])
P["work"]["children"] = ["w-tasks", "w-streams", "w-clickup", "w-meetings", "w-email", "w-proposals", "w-writing", "w-openclaw"] + P["work"]["children"]
P["work"]["what"] = "How the companies run: tasks, workstreams, ClickUp, meetings, email, proposals, writing, OpenClaw. Then the runbooks only one person knew."

# ── about this wiki ──
NEEDS = [
 ("One source of truth for every part and how parts connect", "demo"),
 ("End dark room work: everyone's work visible and shared", "partial"),
 ("Visual, interactive view of every platform element and its connections", "demo"),
 ("Layered: high level map, drill down to detail", "demo"),
 ("Anyone can read and update it", "spec"),
 ("Version history: what changed, when, by whom", "spec"),
 ("Linked to GitLab", "later"),
 ("Linked to ClickUp tasks: who is working on what", "demo"),
 ("Same structure for GURU and the microreactor", "demo"),
 ("Shared goals: everyone works from the same picture", "demo"),
 ("Automation keeps it current", "spec"),
 ("Connected to task management across both projects", "demo"),
 ("Visually intuitive, no digging through menus", "demo"),
 ("One overview page from top level to small pieces", "demo"),
 ("A living wiki that sends reminders and flags stale sections", "spec"),
 ("Slack: wiki messages link back to the page", "partial"),
 ("Dashboard of cross system test status in ClickUp", "later"),
 ("Working session with Anton and Kyrylo on the major buckets", "open"),
 ("Bring Olivia and Kendra up to speed", "open"),
]
page("about", "About this wiki", "all", "section", "home",
  "What Allan asked for, what this wiki does about it, and what is left.",
  "Allan, June 11: a wiki of top level stuff and a lot of detail on each product, service and technology, so we stop arguing about what we thought it was.",
  [], "", children=["a-asks", "a-needs", "a-tests"])
page("a-asks", "What Allan asked for", "all", "overview", "about",
  "Three jobs. Find what we already wrote. A living reference everyone adds to. A layered system view of GURU and the reactor where you can open any part and go back up.",
  "From about 60 meetings since April 2024. He set the bar himself: someone new is not immediately lost, it works on a phone, and something lost is found live in a meeting.",
  [], "One starting page per company; reuse the categories in our papers; Google Docs stay but are linked from the wiki; it must not depend on naming conventions; it must not become a chore.",
  owner="Ryland", sources=[S("The Company Wiki: What Allan Wants, What Exists, and the Gap", "https://docs.google.com/document/d/1p5e0p3diVH8GM-dKsmu0vLUu8cfEDaDB8hnAxpz3I-k/edit"),
  S("Company Wiki: Build Spec and Working Demo", "https://docs.google.com/document/d/1krTCDyDMsbl37pD-tQ75Tqs8cLYKKn8_ZGahrDHF6jI/edit"),
  S("AI Standup, Oct 2", OCT2)])
page("a-needs", "Ryland's needs list, checked", "all", "overview", "about",
  "The 19 points from Feb 19, each marked with where it stands in this build.",
  "Works now means you can use it in this wiki today. Designed means it is in the build spec. Partly, Later and Open are what they say.",
  [], "", owner="Ryland", sources=[S("Click Up Wiki Needs 2/19/26", "https://docs.google.com/document/d/1u1ZY1AyRvq9sp1z7QLGtTF0f7dBuVoHs47RVkWe355Q/edit"),
  S("MSBAI ClickUp Wiki Structure (drawio)", "https://drive.google.com/file/d/1L4OTFwKVi7IjLODuordQR54Q8tG1Un3m/view")])
P["a-needs"]["checks"] = [{"t": t, "s": s} for t, s in NEEDS]
page("a-tests", "Allan's tests", "all", "overview", "about",
  "The bar the wiki has to clear before Allan sees it.", "", [], "", owner="Ryland")
P["a-tests"]["checks"] = [
  {"t": "Outsider test: someone new gets an overview of GURU and the reactor and finds three named things alone", "s": "open"},
  {"t": "Three clicks: the GURU definition and the reactor core from the start page (two in this demo)", "s": "demo"},
  {"t": "Phone test: Stash, Robert and Molly use it on a phone", "s": "later"},
  {"t": "Meeting test: something lost is found live in a meeting", "s": "partial"},
  {"t": "Short pages: no page needs scrolling to find its point", "s": "demo"}]

for k, v in WHERE.items():
    assert k in P, k
    P[k]["links"] = v.get("links", [])
    P[k]["lists"] = v.get("lists", [])
    P[k]["folders"] = v.get("folders", [])
    P[k]["find"] = v.get("find", P[k]["title"])
for p in P.values():
    p.setdefault("links", []); p.setdefault("lists", []); p.setdefault("folders", []); p.setdefault("find", p["title"])
SECTIONS = ["work", "past", "decisions", "glossary", "about"]
