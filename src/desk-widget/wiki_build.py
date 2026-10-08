#!/usr/bin/env python3
# Builds wiki.json, the demo company wiki the desk widget's Wiki tab reads.
# Every fact comes from ClickUp, Drive or Fireflies as of Oct 4 2026; gaps are marked "check".
import json, re, sys

CU = "https://app.clickup.com/20115771/docs/"
WIKI = CU + "k5w9v-41151/"
KB = CU + "k5w9v-51691/"
SSOT = CU + "k5w9v-54951/"
PAPER = "https://docs.google.com/document/d/1l-5Az9YEQMAkYqIDh5sFWSzS1ggxtyTrk17fWKUKP-k/edit"
GEN2 = "https://docs.google.com/document/d/1B6mHUWX0JFXhKHfxN7s7zwCdlU6LgfJq6RYmahE3w_M/edit"
DIAG = "https://docs.google.com/presentation/d/1jyXZr1QN4pI_9s72_cdBwsvYvXsaNnC36OkETRNJq9o/edit"
CILDOC = "https://docs.google.com/document/d/1k4SK06rwKj0JjqhBdhz_Hig4qhCtpnPipJ7EzG6MarQ/edit"
READAHEAD = "https://docs.google.com/document/d/1R98txhQblwyw0cZ80_tvN71zmbQmZ7pHsMC9FvwLNYw/edit"
SSOTDEF = "https://docs.google.com/document/d/1R9DiJQgZPU-u0AWKKnoK7Dd9-DYKN8mI78_Ni03YC4U/edit"
FEB16 = "https://app.fireflies.ai/view/01KHEGDRS8PVXSYT6WJXZQ49SN"
APR24 = "https://app.fireflies.ai/view/01KPCVR4Q9DZCYPJQ0MK5JASJ6"
OCT2 = "https://app.fireflies.ai/view/01M3CJNQ29A6QZMVKMJ3ATF6JF"
OCT2KA = "https://app.fireflies.ai/view/01M3Y7WGPBX2CYT2P00BE091ZY"
PP_DECK = "https://docs.google.com/presentation/d/1rltJ3mwGfBAUytTos_i6dvBkHuAITlIYnNXzb_aphDY/edit"
PP_ONE = "https://docs.google.com/document/d/1cpV3DYZtyVelE5zo-zivpR5DzHoXoE7tVrwc8CvElrc/edit"
OG_DECK = "https://docs.google.com/presentation/d/1FOAK59JCWjacqoUK0b885MGbf_jhyMogH9VIt4CM17o/edit"

def S(t, u): return {"t": t, "u": u}

companies = [
  {"id": "msbai", "name": "MSBAI", "color": "#7FB2FF", "system": "guru",
   "tag": "GURU, the hybrid intelligence platform that drives expert engineering software",
   "home": "msbai"},
  {"id": "tamfortis", "name": "Tam Fortis", "color": "#5ED3A1", "system": "reactor",
   "tag": "A helicopter portable microreactor, 35 to 40 kW for 5 to 10 years",
   "home": "tamfortis"},
  {"id": "nexcavate", "name": "Nexcavate", "color": "#FFB547", "system": "permitpulse",
   "tag": "PermitPulse, an AI copilot for mining permit teams",
   "home": "nexcavate"},
]

P = {}
def page(id, title, company, kind, parent, what, fits="", connects=(), current="", status="current",
         owner="", sources=(), questions=(), terms=(), stream="", children=None, updated="2026-10-04"):
    P[id] = {"id": id, "title": title, "company": company, "kind": kind, "parent": parent,
             "what": what, "fits": fits, "connects": list(connects), "current": current,
             "status": status, "owner": owner, "sources": list(sources), "questions": list(questions),
             "terms": list(terms), "stream": stream, "children": children or [], "updated": updated}

# ───────────── MSBAI ─────────────
page("msbai", "MSBAI", "msbai", "company", "home",
  "MSBAI (Microsurgeonbot Inc.), founded in 2017, builds GURU: a hierarchical neuro symbolic multi agent platform that drives digital engineering and operations workflows on supercomputers and in the cloud.",
  "GURU is the one product. OrbitGuard, CFD automation, MBE GURU, the microreactor digital twin and PermitPulse are services built on it.",
  ["guru", "svc-orbitguard", "svc-cfd", "svc-mbe", "programs"],
  "Programs today span the AFRL GURU Gen 2 contract and HPCMP Phase III, the OrbitGuard SBIR, NASA STTR work and DOE ALCC time on Frontier and Aurora.",
  owner="Allan", sources=[S("GURU paper, June 2026", PAPER), S("MSBAI Company Information (ClickUp)", WIKI + "k5w9v-33391")],
  children=["guru", "programs", "svc-orbitguard", "svc-cfd", "svc-mbe"])

page("guru", "GURU", "msbai", "system", "msbai",
  "GURU learns and runs expert workflows in engineering software: modeling, simulation, analysis, visualization and virtual world building. One architecture and one training factory serve every application.",
  "Read it top down: what a person sees (the interface), how agents talk (global workspace), who does the work (the agent society), what keeps it honest (CIL and rules), where it runs (execution), and how new skills are made (the Learning Engine).",
  ["g-ui", "g-gw", "g-agents", "g-cil", "g-exec", "g-learn"],
  "GURU Gen 2 is the current build: Apptainer services under process compose at gurudev.cloud, CFD stacks on HPCMP systems.",
  owner="Anton (proposed)", sources=[S("GURU paper, section 3", PAPER), S("GURU Gen 2 System Architecture", GEN2), S("GURU Gen 2 System Diagrams", DIAG), S("Learning Engine Overview (ClickUp)", WIKI + "k5w9v-27591")],
  questions=["Which parts of the paper's architecture are deployed today and which are planned? Needs Anton's sign off."],
  terms=["Gen 2", "hybrid intelligence", "neuro symbolic", "society of agents"],
  children=["g-ui", "g-gw", "g-agents", "g-cil", "g-exec", "g-learn", "g-tooling"])

page("g-ui", "User interface", "msbai", "part", "guru",
  "A browser app (a PWA) that runs on phones, tablets, desktops and immersive displays. It takes speech, text, images and on screen controls, and shows plots, job status, remote views and workflow controls.",
  "It does no heavy compute. It turns what a person asks for into intent and posts it to the global workspace; the PWA counts as one more agent there. When a request is ambiguous it shows the top three to five readings to choose from.",
  ["g-gw", "g-exec"],
  "Gen 2: a Vue.js front end with a Node and Express UI backend behind NGINX. Software that has no full API is streamed as a remote display (noVNC, one seat per user).",
  owner="Front end team", sources=[S("GURU paper, section 3.1", PAPER), S("Gen 2 Components and Features (ClickUp)", WIKI + "k5w9v-27211"), S("GURU Gen 2 System Architecture", GEN2)],
  terms=["PWA", "noVNC", "skins", "remote display"])

page("g-gw", "Global workspace", "msbai", "part", "guru",
  "The shared message pool agents use to talk across machines, with modules for logging, attention and explainability. Low priority traffic flows through event pools; salient items rise to a shared blackboard.",
  "It sits between the interface and the agents. There is no central decider: agents read the pool, post findings, and the workspace broadcasts what matters. Safety checks and job failures skip the pool and use direct, deterministic channels.",
  ["g-ui", "g-agents", "g-cil"],
  "Runs on MQTT topics such as workspace/inputs/raw and workspace/inputs/structured. Kafka event sourcing was discussed; today domain orchestrators for CFD and space ops do much of the coordination.",
  owner="Anton (proposed)", sources=[S("GURU paper, section 3.2", PAPER), S("Blackboard and Goal Management (ClickUp)", WIKI + "k5w9v-27971"), S("Selection of Architecture (ClickUp)", WIKI + "k5w9v-28111"), S("GURU Gen 2 System Diagrams", DIAG)],
  questions=["The paper calls it a coordination design rather than a measured result. What should we claim externally?"],
  terms=["Global Workspace Theory", "blackboard", "MQTT", "attention"], stream="Common Internal Language & Agent Blackboard Orchestration",
  children=["g-blackboard"])
page("g-blackboard", "Blackboard", "msbai", "part", "g-gw",
  "Shared memory where knowledge sources (skill agents, RL agents, multimodal models) post findings and partial solutions. Each subtask gets its own blackboard and agent society.",
  "The global workspace sits above the blackboards and makes the higher level calls. Pattern pieces: global goal manager, agent management, plan management, skill management.",
  ["g-gw", "g-agents"], "Publish and subscribe over MQTT. Hussein and Anton proposed competing event strategies; see the down select meeting.",
  owner="Anton (proposed)", sources=[S("AI Blackboard Pattern (ClickUp)", WIKI + "k5w9v-27891"), S("Down Select Meeting (ClickUp)", WIKI + "k5w9v-31211")])

page("g-agents", "Agent society", "msbai", "part", "guru",
  "Many small agents, each with one narrow job: perception, prediction, optimization, constraint checks, software navigation. Only the agents a task needs wake up, and they form a temporary coalition.",
  "Agents are organized in three layers: navigation at the bottom, actions in the middle, planning on top. They announce themselves on the global workspace with presence messages (role, outputs, host, jobs).",
  ["g-gw", "g-learn", "g-cil", "g-exec"],
  "Gen 2 model servers include llama server (Qwen3 30B), CLIP, Voxtral speech to text and TRELLIS image to 3D.",
  owner="Anton (proposed)", sources=[S("GURU paper, section 3.2", PAPER), S("GURU Gen 2 System Architecture", GEN2), S("Skills Agents (ClickUp)", WIKI + "k5w9v-30411")],
  terms=["coalition", "presence message", "skill agent"],
  children=["g-nav", "g-act", "g-plan"])
page("g-nav", "Navigation layer", "msbai", "part", "g-agents",
  "Agents that operate the software itself: interfaces, file systems, databases and remote displays.",
  "The bottom layer of the hierarchy. It guards against losing touch with the live state of the tool being driven.",
  ["g-act", "g-exec"], "Earlier GURU mapped interfaces by brute force on supercomputers with computer vision and OCR; Anton proposed learning from expert sessions instead.",
  sources=[S("GURU paper, Table 1", PAPER), S("ARTIST Learning Engine (ClickUp)", WIKI + "k5w9v-27591")])
page("g-act", "Action layer", "msbai", "part", "g-agents",
  "Bounded decisions: anomaly detection, parameter prediction, grid quality scoring, optimization.",
  "The middle layer. It guards against a single invalid decision, and every action passes the rules engine before it reaches a tool.",
  ["g-nav", "g-plan", "g-rules"], "The grid quality library scores meshes on 30+ metrics across 15 mesh formats.",
  sources=[S("GURU paper, Table 1 and section 3.5", PAPER)])
page("g-plan", "Planning layer", "msbai", "part", "g-agents",
  "Multi step workflows, scenario generation and policy search.",
  "The top layer. It breaks a request into steps (for CFD: geometry, mesh, boundary conditions, solver settings, job, post processing) and guards against a plan drifting open loop.",
  ["g-act", "g-gw"], "Hierarchical RL runs task execution under the global workspace.",
  sources=[S("GURU paper, Table 1", PAPER), S("The Learning Engine (ClickUp)", WIKI + "k5w9v-29291")])

page("g-cil", "Common Internal Language", "msbai", "part", "guru",
  "The shared neuro symbolic language that links agents, tools, models and provenance. Every message states types, units, physical limits, uncertainty and where it came from.",
  "It runs across every layer rather than being a layer. LLMs only translate what a person asks into CIL; they do not make consequential engineering or operating decisions. Fotis called it GURU's nervous system.",
  ["g-gw", "g-agents", "g-rules"],
  "Four structures: ontologies, the interaction scene, CIL messages on the global workspace, and translators. Versioned, grounded, with a full chain of custody.",
  owner="Fotis (proposed)", sources=[S("GURU paper, section 3.3", PAPER), S("GURU architecture and CIL wiki example", CILDOC), S("AI Standup, Apr 24, 2:30:17", APR24)],
  terms=["CIL", "ontology", "translator", "provenance"], stream="Common Internal Language & Agent Blackboard Orchestration",
  children=["g-rules", "g-ontology"])
page("g-rules", "Rules engine", "msbai", "part", "g-cil",
  "A small deterministic checker. It tests rules, schemas, units, preconditions, solver contracts and safety limits before an action can reach a tool or an actuator.",
  "It is not a chatbot: a conversation agent uses it the way a person uses a calculator. It returns the valid data, the invalid values with hints, and what is still missing.",
  ["g-act", "g-cil"], "Measured: removing it cut physical compliance by about 13 percentage points. Learned models rank; validated physics decides.",
  owner="Rules owner (not named)", sources=[S("Rules: Introduction (ClickUp)", WIKI + "k5w9v-64891"), S("GURU paper, section 3.5", PAPER)])
page("g-ontology", "Ontologies", "msbai", "part", "g-cil",
  "JSON objects, defined by ontology_schema.json, that describe a domain: entities are assets, properties are attributes.",
  "The rules engine evaluates input against one or more ontologies at once (the multi ontology demo).",
  ["g-rules"], "Example ontologies are descriptive and real, starting with the virtual world.",
  sources=[S("Ontology Definition (ClickUp)", WIKI + "k5w9v-22591"), S("Multi ontology hybrid architecture (ClickUp)", WIKI + "k5w9v-26111")])

page("g-exec", "Execution environment", "msbai", "part", "guru",
  "Where the work actually runs: containerized jobs in the cloud, on supercomputers, or on a local machine. It stays cloud agnostic.",
  "Agents ask for compute through the global workspace; jobs report status and results back. The interface can stream any running application to the user.",
  ["g-agents", "g-ui", "g-tooling"],
  "Gen 2 on HPCMP: Raider and Warhawk ready, Narwhal in progress, Carpenter, Nautilus and Blueback partial. Singularity and Apptainer containers on HPC, Kubernetes behind an API gateway in the cloud.",
  owner="Ion (proposed)", sources=[S("GURU Gen 2 System Architecture", GEN2), S("API and Container Management (ClickUp)", WIKI + "k5w9v-26031")],
  stream="HPC Operations")
page("g-learn", "Learning Engine", "msbai", "part", "guru",
  "The agent factory. It trains and compares model families on HPC and registers the best model for each target: AutoML, transformers and VLMs, decision transformers and RL, graph networks, JEPA world models.",
  "New skills enter GURU only through here: specify, collect data, train, validate, register, version, regression test. It is a hybrid, hierarchical learner, not one big LLM.",
  ["g-agents", "g-data", "g-tooling"],
  "Builds on MSBAI's 2017 multi framework AutoML work. Leadership scale runs on Frontier and Aurora under DOE ALCC.",
  owner="Kyrylo (proposed)", sources=[S("GURU paper, section 4.2", PAPER), S("Learning Engine Overview (ClickUp)", WIKI + "k5w9v-27591"), S("GURU Gen 2 System Diagrams", DIAG)],
  terms=["agent factory", "AutoML", "JEPA", "decision transformer"],
  children=["g-data"])
page("g-data", "Data factory", "msbai", "part", "g-learn",
  "The first stage of the training factory. It turns raw simulation output, workflow logs and domain records into validated training sets.",
  "Cleaning, normalization, feature extraction, reproducible splits, Latin hypercube sampling. Its output feeds the Learning Engine.",
  ["g-learn"], "", sources=[S("GURU paper, section 4.1", PAPER)])
page("g-tooling", "Tooling and infrastructure", "msbai", "part", "guru",
  "What it takes to train and ship agents at scale: leadership class training runs, HPC stacks, containers, the GitLab repos.",
  "Underpins the Learning Engine and the execution environment.",
  ["g-learn", "g-exec"],
  "A world model run at 8,000 nodes and RL at 2,000 nodes on DOE systems; repo msbai2/guru_gen2; hardened base images in a private GitLab registry.",
  owner="Ion (proposed)", sources=[S("GURU paper, section 10", PAPER), S("Infrastructure (ClickUp)", WIKI + "k5w9v-30391")])

page("svc-orbitguard", "OrbitGuard", "msbai", "service", "msbai",
  "A space domain awareness copilot built on GURU. It detects, classifies and predicts satellite maneuvers.",
  "Uses the agent society with JEPA and graph models; blackboard style logging gives an audit trail.",
  ["guru", "g-learn"], "Demonstrated at the SDA TAP Lab with UDL and Kafka integration. Accuracy and object counts are in the deck; check claims before reuse.",
  owner="Ryland", status="check", sources=[S("OrbitGuard deck", OG_DECK), S("SDA TAP Lab knowledge base (ClickUp)", "https://app.clickup.com/20115771/v/dc/k5w9v-41151/k5w9v-71591")],
  stream="OrbitGuard Space Domain Awareness & Anomaly Detection")
page("svc-cfd", "CFD automation", "msbai", "service", "msbai",
  "Autonomous meshing and simulation for aerodynamics, the core of the HPCMP Phase III work.",
  "Planning agents run the CFD chain (geometry, mesh, solver, post processing) on the execution environment.",
  ["guru", "g-plan", "g-exec"], "Converged rate on unseen geometries went from under 1 percent to 74 percent, Mach 0.3 to 6 across three facilities.",
  owner="Ion (proposed)", sources=[S("GURU paper, section 5", PAPER)], stream="SU2 Validation & Hypersonic Cases")
page("svc-mbe", "MBE GURU", "msbai", "service", "msbai",
  "GURU for airspace and reentry decision support under NASA. It drives NASA DAIDALUS for debris reroutes and checks regulations for gaps.",
  "Links model based systems engineering with regulatory knowledge graphs.",
  ["guru", "g-cil"], "NASA Phase I; Phase II pursuit and paper in progress.",
  sources=[S("GURU paper, section 7", PAPER)], stream="MBE GURU NASA Phase I")
page("programs", "Programs", "msbai", "overview", "msbai",
  "The contracts and allocations the work runs under.",
  "Each program maps to a ClickUp Goals & Workstreams folder, so the wiki and the workstreams view stay linked.",
  ["svc-cfd", "svc-orbitguard", "svc-mbe"],
  "HPCMP Phase III (CFD); OrbitGuard Phase II (CDAO); NASA Phase I (MBE GURU); DOE ALCC on Frontier and Aurora; plus the cross cutting workstreams.",
  sources=[S("GURU paper, acknowledgments", PAPER)])

# ───────────── Tam Fortis ─────────────
page("tamfortis", "Tam Fortis", "tamfortis", "company", "home",
  "Tam Fortis Solutions builds the first truly portable nuclear power family: a 4 ft, 35 to 40 kW microreactor and a 10 to 15 W power cell.",
  "MSBAI's GURU supports the reactor's design studies and its digital twin; the Microreactor SSOT holds the governed design values.",
  ["reactor", "tf-ssot", "tf-people"],
  "INL allocated a 2028 test slot in its DOME facility. Liberty Station, South Carolina is the intended manufacturing site.",
  owner="Allan", sources=[S("Pentagon Read Ahead v4", READAHEAD), S("AI Standup, Oct 2", OCT2)],
  children=["reactor", "tf-ssot", "tf-people"])
page("reactor", "Microreactor", "tamfortis", "system", "tamfortis",
  "Helicopter portable and meltdown proof: 35 to 40 kWe from 100 to 135 kWth for 5 to 10 years without refueling, under 5 tons, fits a CH 47 sling load or a pickup bed.",
  "Start from the box, then open it: the core makes heat, heat pipes carry it out, a heat exchanger hands it to sCO2, a turbine makes power, a dry cooler rejects the rest, and power electronics deliver it.",
  ["r-core", "r-heatpipes", "r-hx", "r-turbine", "r-cooling", "r-drums", "r-power", "r-structure", "r-autonomy"],
  "Neutronics results not validated as of June 3. Design values live in the SSOT.",
  owner="Robert", status="check", sources=[S("Pentagon Read Ahead v4", READAHEAD), S("SSOT Master Definition", SSOTDEF), S("Monday AI, Feb 16, 27:18", FEB16)],
  questions=["The reactor has no product name yet. DOME is INL's test bed, not ours."],
  stream="Microreactor Design Studies",
  children=["r-core", "r-heatpipes", "r-hx", "r-turbine", "r-cooling", "r-drums", "r-power", "r-structure", "r-autonomy"])
page("r-core", "Reactor core", "tamfortis", "part", "reactor",
  "The fuel and moderator region that makes the heat, with an epithermal spectrum.",
  "Heat leaves through the heat pipes; the control drums around it set reactivity; shielding wraps it.",
  ["r-fuel", "r-moderator", "r-heatpipes", "r-drums"],
  "Two baselines disagree: the read ahead says up to 61 cm diameter and 50 to 80 cm tall; Robert's Core Design 6.x uses 15 cm by 80 cm.",
  owner="Robert", status="conflict", sources=[S("Pentagon Read Ahead v4", READAHEAD), S("SSOT Master Definition, 7.7", SSOTDEF)],
  questions=["Which core dimensions are current? Reconcile the read ahead with Core Design 6.x."],
  children=["r-fuel", "r-moderator"])
page("r-fuel", "Fuel pins and spacing", "tamfortis", "part", "r-core",
  "FCM TRISO fuel, HALEU at 19.75 percent, packing fraction 0.40 to 0.45.",
  "Spacing between fuel pins and moderator pins sets the neutron spectrum. The SSOT tracks pin pitch, count, diameter, layout and fuel volume fraction.",
  ["r-moderator", "r-core"], "The NRIC RFA loading: 54 pins radially, 14 high, 756 pins at 12 mm by 50 mm. Prismatic pins, cylinders or TRISO tubes is still open.",
  owner="Robert", status="check", sources=[S("SSOT Master Definition, 4.1 and 7.6", SSOTDEF), S("Microreactor SSOT (ClickUp)", SSOT + "k5w9v-70971")])
page("r-moderator", "Moderator", "tamfortis", "part", "r-core",
  "Yttrium hydride pins spread through the fuel region, with zirconium hydride as the fallback. Target moderator to fuel ratio 1.5 to 2.5.",
  "Slows neutrons near the fuel. Robert proposes smaller pins next to the fuel to manage a possibly positive temperature coefficient.",
  ["r-fuel", "r-core"], "", owner="Robert", sources=[S("Pentagon Read Ahead v4", READAHEAD), S("SSOT Master Definition, 7.6", SSOTDEF)])
page("r-heatpipes", "Heat pipes", "tamfortis", "part", "reactor",
  "Passive sodium heat pipes, typically 8 to 12, running at 600 to 800 C, with KRUSTY heritage. Potassium is the alternate.",
  "They carry heat from the core to the heat exchanger with no pumps, and they remove decay heat after shutdown.",
  ["r-core", "r-hx"], "Open: split the pipes at the axial midplane, avoid a central plenum, check single pipe failure at 110 percent power.",
  owner="Robert", status="check", sources=[S("Pentagon Read Ahead v4", READAHEAD), S("SSOT Master Definition", SSOTDEF)])
page("r-hx", "Heat exchanger", "tamfortis", "part", "reactor",
  "Printed circuit heat exchangers (Heatric or Alfa Laval) that move heat from the heat pipes into the sCO2 loop.",
  "The handoff between the nuclear side and the power side.",
  ["r-heatpipes", "r-turbine"], "", sources=[S("Pentagon Read Ahead v4", READAHEAD)])
page("r-turbine", "Turbine generator", "tamfortis", "part", "reactor",
  "A recuperated supercritical CO2 Brayton cycle, 20 to 25 percent efficient for the first unit, aiming for 28 to 32 percent with recompression.",
  "Turns heat into electricity; rejects the rest to the dry cooler.",
  ["r-hx", "r-cooling", "r-power"], "Barber Nichols 75 to 100 kW turbine, generator and compressor. Stirling is the contingency.",
  sources=[S("Pentagon Read Ahead v4", READAHEAD)], terms=["Brayton cycle", "sCO2"])
page("r-cooling", "Cooling", "tamfortis", "part", "reactor",
  "A forced air dry cooler rejecting 60 to 80 kWth with no water. A natural convection radiator is the alternate.",
  "Takes waste heat from the turbine loop. Decay heat goes out passively through the heat pipes.",
  ["r-turbine", "r-heatpipes"], "", sources=[S("Pentagon Read Ahead v4", READAHEAD)])
page("r-drums", "Reactivity control", "tamfortis", "part", "reactor",
  "6 to 12 rotating boron carbide control drums in a beryllium reflector, spring loaded to fail safe.",
  "They sit around the core and turn to raise or lower reactivity.",
  ["r-core", "r-autonomy"], "Robert recommends removing the Flint external neutron source. The SCRAM method is still open.",
  owner="Robert", status="check", sources=[S("Pentagon Read Ahead v4", READAHEAD), S("SSOT Master Definition", SSOTDEF)],
  questions=["What is the shutdown architecture if Flint is removed?"])
page("r-power", "Power electronics", "tamfortis", "part", "reactor",
  "Conditions the generator output to 480 V AC or 28 V DC, configurable.",
  "The last step before the customer's plug.",
  ["r-turbine"], "No subsystem description exists yet beyond the output spec.",
  status="gap", sources=[S("Pentagon Read Ahead v4", READAHEAD), S("Monday AI, Feb 16, 27:59", FEB16)],
  questions=["Who writes the power electronics page?"])
page("r-structure", "Structure and shielding", "tamfortis", "part", "reactor",
  "A bird bone structure built for sling loads and rough handling, with tungsten and boron carbide composite shielding.",
  "Wraps everything. Target dose 2.5 millirem at 1 meter. A MIL STD transport survivability test is planned.",
  ["r-core"], "Borated HDPE and tungsten layers are under study.",
  sources=[S("Pentagon Read Ahead v4", READAHEAD), S("SSOT Master Definition", SSOTDEF)])
page("r-autonomy", "Autonomy and digital twin", "tamfortis", "part", "reactor",
  "AI anomaly detection and load following, with a person in the loop for startup and shutdown.",
  "This is where GURU meets the reactor: the digital twin simulates subsystem configurations.",
  ["r-drums", "guru"], "", sources=[S("Pentagon Read Ahead v4", READAHEAD), S("GURU paper, section 8", PAPER)],
  stream="Reactor Control Prototype & Digital Twin")
page("tf-ssot", "Microreactor SSOT", "tamfortis", "tool", "tamfortis",
  "A browser app (ssot.reactor.guru) for governing the reactor configuration and design studies: browse, draft, compare, attach evidence, release through review.",
  "Holds the design values the reactor pages point to. GitLab holds the live config, Postgres the drafts and audit history.",
  ["reactor", "r-fuel"], "One registered config (microreactor_core) with 46 fields and 7 materials. No physics calculations, no geometry, no viewer yet.",
  owner="Ayesha", sources=[S("Microreactor SSOT (ClickUp)", SSOT + "k5w9v-70971"), S("SSOT Master Definition", SSOTDEF)], stream="Microreactor SSOT")
page("tf-people", "People", "tamfortis", "overview", "tamfortis",
  "Allan (cofounder and CEO); Stash (cofounder and chief visionary, phone first); Robert Howe (reactor engineer, Navy and industry nuclear background); Mollie Jahner (BD and investment); Mark Miller (regulatory advisor, 35 years at NRC); Chris Dawson (technical advisor).",
  "Stash needs one simple page he can search on his phone. Robert works top down and bottom up. Molly needs collateral on the road.",
  [], "", sources=[S("Pentagon Read Ahead v4", READAHEAD), S("AI Standup, Oct 2, 54:59", OCT2)])

# ───────────── Nexcavate ─────────────
page("nexcavate", "Nexcavate", "nexcavate", "company", "home",
  "Nexcavate builds PermitPulse, an AI copilot for mining permit teams. US mines take about 29 years from discovery to production, and over half of that goes to permitting and litigation.",
  "PermitPulse was demoed as a GURU Gen 2 workflow.",
  ["permitpulse"], "A Nevada NDEP pilot auto graded about 2,000 historical permits.",
  owner="Ayesha (proposed)", status="check", sources=[S("PermitPulse deck", PP_DECK), S("FY27 one pager", PP_ONE)],
  questions=["Is PermitPulse formally a service built on GURU? No document says so yet."],
  children=["permitpulse", "n-pulse"])
page("permitpulse", "PermitPulse", "nexcavate", "system", "nexcavate",
  "Assembles permit applications, checks every section against the controlling regulation, and keeps a full audit trail.",
  "Follow a permit from intake to the agency: documents in, application assembled, each section checked, every change logged, agency review.",
  ["pp-intake", "pp-assemble", "pp-check", "pp-audit", "pp-agency"],
  "Projected: about 95 percent less back and forth with the agency, 12 to 18 months saved per cycle. Projections, not results.",
  status="check", sources=[S("PermitPulse deck", PP_DECK), S("FY27 one pager", PP_ONE)], stream="PermitPulse",
  children=["pp-intake", "pp-assemble", "pp-check", "pp-audit", "pp-agency"])
for pid, t, w, f in [
  ("pp-intake", "Document intake", "Pulls in the applicant's documents and the agency's historical permits.", "Feeds the assembly step."),
  ("pp-assemble", "Application assembly", "Builds the permit application section by section.", "Each section goes to the compliance check."),
  ("pp-check", "Compliance check", "Checks every section against the controlling regulatory text.", "The same idea as GURU's rules engine: deterministic checks before anything goes out."),
  ("pp-audit", "Audit trail", "Records every change and every check.", "What the agency reviewer sees."),
  ("pp-agency", "Agency review", "The regulator reviews a complete, checked application.", "The NDEP pilot is the first agency."),
]:
  page(pid, t, "nexcavate", "part", "permitpulse", w, f, [], "", sources=[S("PermitPulse deck", PP_DECK)])
page("n-pulse", "Pulse Extract", "nexcavate", "part", "nexcavate",
  "A hardware concept for recovering value from mining waste.", "A separate Nexcavate workstream.", [], "Concept stage; no document yet.",
  status="gap", sources=[], stream="Pulse Extract")

# ───────────── Across the companies ─────────────
page("work", "How we work", "all", "section", "home",
  "Runbooks, rules and lessons learned. The things only one person knew.",
  "Every runbook names a keeper. When something breaks and gets fixed, the fix lands here.",
  [], "", children=["h-paraview", "h-dsrc", "h-baby", "h-singularity", "h-kestrel", "h-rules", "h-lessons"])
page("h-paraview", "Restart the HPCMP ParaView node", "all", "howto", "work",
  "How to bring the remote visualization node back when it stops responding.",
  "Only Ion knew how. Allan: one of numerous examples of why we need a company wiki.",
  ["g-exec"], "Steps not written yet. Ion to record them.", owner="Ion", status="gap",
  sources=[S("Start a searchable company wiki and capture the HPC remote visualization procedure (ClickUp task)", "https://app.clickup.com/t/868m1zaa5")],
  stream="GURU ParaView Automation")
page("h-dsrc", "Running GURU on DSRC", "all", "howto", "work",
  "Start scripts and PBS jobs for running GURU on DoD supercomputers (start guru, guru mpi ava, Mustang job scripts).",
  "Part of the execution environment.", ["g-exec"], "Mostly 2024; check against Gen 2.", status="stale",
  sources=[S("Team Process SOPs (ClickUp)", KB + "k5w9v-65471")], updated="2024-06-01")
page("h-baby", "Run several CFD simulations on the Baby Server", "all", "howto", "work",
  "How to queue multiple CFD runs on the in house server.", "", ["svc-cfd"], "",
  sources=[S("Running Multiple CFD Simulations on the Baby Server (ClickUp)", WIKI + "k5w9v-45891")])
page("h-singularity", "Singularity containers on HPC", "all", "howto", "work",
  "Building and running Singularity and Apptainer images, including SU2.", "", ["g-exec", "g-tooling"], "",
  sources=[S("Infrastructure (ClickUp)", WIKI + "k5w9v-30391")])
page("h-kestrel", "Kestrel tutorials", "all", "howto", "work",
  "Ryland's collection of Kestrel tutorials and the knowledge extraction work.",
  "Allan used this as the example of work that is hard to find.", ["svc-cfd"], "Link the collection here.", owner="Ryland", status="gap",
  stream="Kestrel Knowledge Extraction")
page("h-rules", "Company rules", "all", "howto", "work",
  "Register finished work in the wiki. Hand off work before you go away. Files live in the shared Drive, never only on a laptop or a personal Drive.",
  "Allan set these across 2025 and 2026.", [], "", owner="Allan",
  sources=[S("Organizing Google Drive Files (ClickUp)", KB + "k5w9v-68811")])
page("h-lessons", "Lessons learned", "all", "howto", "work",
  "Short write ups of what broke, the fix, and how not to repeat it.",
  "Problems got a dirty fix and came back. Each lesson links to the part it touches.", [], "Empty. The first entry should be the ParaView node.", status="gap")

page("past", "Past work", "all", "section", "home",
  "Proposals, papers, reviewer feedback, studies and demos, findable by topic.",
  "Ask for all the proposals about space, or every proposal that argues for reinforcement learning.",
  [], "", children=["p-proposals", "p-paper", "p-demos", "p-taplab"])
page("p-proposals", "Proposals", "all", "past", "past",
  "STTR and DoD, Princeton, OLCF Frontier and Summit, ALCC 2023 to 2025, the DOE accelerator GUI, White Cell scenarios, autonomous mission design.",
  "", [], "Up to 2024 in the old wiki; newer ones live in the Proposals space.", status="stale",
  sources=[S("MSBAI Proposals (ClickUp)", WIKI + "k5w9v-28371")], updated="2024-12-01")
page("p-paper", "GURU paper (arXiv, June 2026)", "msbai", "past", "past",
  "The current description of GURU's architecture, results and programs.", "Most GURU pages here cite it.", ["guru"], "",
  sources=[S("GURU paper", PAPER)], stream="Research Papers & Publications")
page("p-demos", "GURU Gen 1 and Gen 2 demos", "msbai", "past", "past",
  "Virtual world, geometry search and synthesis, trajectory, GMAT orbital mechanics, FEA, CFD SU2, SysML.",
  "", ["guru"], "", sources=[S("Demo Details, Jan 2024 (ClickUp)", WIKI + "k5w9v-30831")], updated="2024-01-15")
page("p-taplab", "SDA TAP Lab knowledge base", "msbai", "past", "past",
  "Built by OpenClaw from 52 transcripts and 575 Slack messages: 12 pages, every claim cited.",
  "The best example of the page format so far.", ["svc-orbitguard"], "Nothing added since July 30. Edits made in ClickUp are overwritten on the next publish.",
  owner="Ryland", status="stale", sources=[S("SDA TAP Lab knowledge base (ClickUp)", "https://app.clickup.com/20115771/v/dc/k5w9v-41151/k5w9v-71591")], updated="2026-07-30")

page("decisions", "Decisions and questions", "all", "section", "home",
  "What was decided, when, by whom and why, and the questions still open.",
  "When a question gets answered, the answer is registered here so the next person finds it.",
  [], "", children=["d-clickup", "d-guru-one", "d-layer", "q-people", "q-access", "q-owner"])
page("d-clickup", "The wiki lives where people already work", "all", "decision", "decisions",
  "Feb 12 2026: Allan chose ClickUp so the wiki sits in the tool people already use. Confluence was dropped in 2024 because nobody used it.",
  "", [], "Oct 2 2026: Allan endorsed a knowledge layer that pulls from ClickUp, Drive and other sources with its own interface.",
  owner="Allan", sources=[S("AI Standup, Oct 2", OCT2)])
page("d-guru-one", "GURU is the one product", "all", "decision", "decisions",
  "Ayesha's rule: GURU is the product; OrbitGuard, PermitPulse and CFD are services built on it.",
  "This wiki is organized that way.", ["guru"], "Proposed in February, never formally settled.", status="check")
page("d-layer", "Ingest automatically, browse visually", "all", "decision", "decisions",
  "Oct 2 2026, Kriss and Anton: pull from Drive, transcripts and Slack automatically, link it once with a strong model, answer searches with a cheaper one, show a visual map. Allan asked for a live prototype.",
  "This demo is that prototype's front end.", [], "", sources=[S("Kriss and Anton working session, Oct 2", OCT2KA)])
page("q-people", "Written by people or generated?", "all", "question", "decisions",
  "Allan wants both: automatic ingestion plus everyone registering their work. Generated content needs an error check; Fireflies summaries have invented technical details before.",
  "", [], "", status="open")
page("q-access", "How do we keep companies separate?", "all", "question", "decisions",
  "Tam Fortis people see Tam Fortis material; people in more than one company see both through one login. Nobody has proposed how yet.",
  "Try the View as switch at the top of this wiki.", [], "", status="open", sources=[S("AI Standup, Oct 2, 33:14", OCT2)])
page("q-owner", "Who owns the content?", "all", "question", "decisions",
  "The wiki passed through admin staff, Ryland and Ayesha, TheSystemsBoss, Anton, Kriss and Ion. Nobody owns it today.",
  "Proposal: one keeper per system page, named on the page.", [], "", status="open")

page("glossary", "Glossary", "all", "section", "home",
  "The words the team uses, in plain language.", "Taken from the MSBAI Technical Glossary in ClickUp.", [], "",
  sources=[S("MSBAI Technical Glossary (ClickUp)", KB + "k5w9v-69731")])

glossary = [
 ("AFRL", "Air Force Research Laboratory; runs a DSRC where GURU was demonstrated."),
 ("ALCC", "DOE leadership computing challenge; MSBAI's allocation on Frontier and Aurora."),
 ("Anomaly detection", "Finding deviations from a baseline in satellites, simulations or reactors."),
 ("Aurora", "DOE exascale system at Argonne."),
 ("AutoML", "Automated model selection and tuning; part of the Learning Engine."),
 ("Blackboard", "Shared memory where agents post findings and partial solutions."),
 ("Brayton cycle", "The sCO2 power cycle the Tam Fortis turbine uses."),
 ("CIL", "Common Internal Language: GURU's shared, typed, unit aware message language."),
 ("CFD", "Computational fluid dynamics; core GURU automation area."),
 ("Digital twin", "A simulation of the reactor used to test configurations and watch health."),
 ("DOME", "INL's microreactor test bed; Tam Fortis has a 2028 slot."),
 ("DSRC", "DoD Supercomputing Resource Center, part of HPCMP."),
 ("FCM", "Fully ceramic microencapsulated fuel; Tam Fortis uses it with HALEU."),
 ("Frontier", "ORNL exascale system; MSBAI runs 2,000+ node jobs there."),
 ("Global Workspace Theory", "The cognitive theory GURU's architecture borrows from."),
 ("GURU", "MSBAI's hybrid intelligence platform that drives expert workflows in software."),
 ("HALEU", "Uranium enriched to 5 to 20 percent U 235."),
 ("HPCMP", "DoD High Performance Computing Modernization Program; primary GURU Gen 2 customer."),
 ("Hybrid intelligence", "Symbolic reasoning plus machine learning; MSBAI's core idea."),
 ("JEPA", "Joint embedding predictive architecture; predicts in representation space."),
 ("Learning Engine", "GURU's agent factory: trains, compares and registers models."),
 ("Microreactor", "Tam Fortis units from 15 W to 40 kW for off grid power."),
 ("MQTT", "The publish and subscribe protocol under the global workspace."),
 ("Neuro symbolic", "Neural networks plus symbolic rules in one system."),
 ("OrbitGuard", "Space domain awareness copilot built on GURU."),
 ("ParaView", "Visualization tool GURU drives for post processing."),
 ("PermitPulse", "Nexcavate's AI copilot for mining permits."),
 ("Phase I, II, III", "SBIR and STTR stages; Phase III allows sole source awards."),
 ("PWA", "Progressive web app; GURU's interface on any device."),
 ("Rules engine", "GURU's deterministic checker for units, limits and contracts."),
 ("SDA TAP Lab", "Space Force prototyping lab where OrbitGuard was demonstrated."),
 ("SSOT", "Single source of truth; the governed store of design values."),
 ("SU2", "Open source CFD solver GURU runs."),
 ("UDL", "DoD Unified Data Library; OrbitGuard reads from it."),
]

# ───────────── system maps (viewBox units) ─────────────
maps = {
 "guru": {"vb": [100, 72], "nodes": [
   {"id": "svc-orbitguard", "x": 14, "y": 1, "w": 17, "h": 5, "shape": "pill", "label": "OrbitGuard"},
   {"id": "svc-cfd", "x": 32.5, "y": 1, "w": 17, "h": 5, "shape": "pill", "label": "CFD automation"},
   {"id": "svc-mbe", "x": 51, "y": 1, "w": 17, "h": 5, "shape": "pill", "label": "MBE GURU"},
   {"id": "permitpulse", "x": 69.5, "y": 1, "w": 16.5, "h": 5, "shape": "pill", "label": "PermitPulse"},
   {"id": "g-ui", "x": 14, "y": 10, "w": 72, "h": 8, "label": "User interface", "sub": "PWA on phone, tablet, desktop, AR"},
   {"id": "g-gw", "x": 14, "y": 23, "w": 72, "h": 9, "label": "Global workspace", "sub": "message pool, blackboard, attention"},
   {"id": "g-agents", "x": 14, "y": 36, "w": 72, "h": 16, "label": "Agent society", "sub": "", "group": True},
   {"id": "g-plan", "x": 16.5, "y": 42, "w": 21.5, "h": 7.5, "label": "Planning", "sub": "multi step plans"},
   {"id": "g-act", "x": 39.25, "y": 42, "w": 21.5, "h": 7.5, "label": "Action", "sub": "bounded decisions"},
   {"id": "g-nav", "x": 62, "y": 42, "w": 21.5, "h": 7.5, "label": "Navigation", "sub": "drive the software"},
   {"id": "g-exec", "x": 14, "y": 57, "w": 72, "h": 8, "label": "Execution environment", "sub": "cloud, supercomputers, local"},
   {"id": "g-learn", "x": 1, "y": 23, "w": 11, "h": 29, "label": "Learning\nEngine", "sub": "agent\nfactory", "tall": True},
   {"id": "g-data", "x": 1, "y": 57, "w": 11, "h": 8, "label": "Data\nfactory"},
   {"id": "g-cil", "x": 88, "y": 10, "w": 11, "h": 42, "label": "CIL\nand\nrules", "sub": "checks\nevery\naction", "tall": True},
   {"id": "g-tooling", "x": 14, "y": 67, "w": 72, "h": 4.5, "shape": "strip", "label": "Tooling and infrastructure"},
 ], "links": [
   {"a": [50, 18], "b": [50, 23], "k": "msg"},
   {"a": [50, 32], "b": [50, 36], "k": "msg"},
   {"a": [50, 52], "b": [50, 57], "k": "msg"},
   {"a": [12, 44], "b": [16.5, 45.7], "k": "train"},
   {"a": [6.5, 57], "b": [6.5, 52], "k": "train"},
   {"a": [86, 27.5], "b": [88, 27.5], "k": "check"},
   {"a": [83.5, 45.7], "b": [88, 45.7], "k": "check"},
   {"a": [38, 45.7], "b": [39.25, 45.7], "k": "msg"},
   {"a": [60.75, 45.7], "b": [62, 45.7], "k": "msg"},
   {"a": [50, 6], "b": [50, 10], "k": "msg"},
 ]},
 "reactor": {"vb": [100, 64], "nodes": [
   {"id": "r-structure", "x": 1, "y": 1, "w": 98, "h": 62, "shape": "frame", "label": "Structure and shielding"},
   {"id": "r-autonomy", "x": 70, "y": 4, "w": 26, "h": 6, "shape": "pill", "label": "Autonomy and digital twin"},
   {"id": "r-drums", "shape": "ring", "cx": 22, "cy": 35, "r": 17, "r0": 13, "label": "Control drums", "lx": 22, "ly": 59},
   {"id": "r-core", "shape": "core", "cx": 22, "cy": 35, "r": 12.5, "label": "Core"},
   {"id": "r-heatpipes", "x": 36, "y": 25, "w": 12, "h": 20, "shape": "pipes", "label": "Heat pipes"},
   {"id": "r-hx", "x": 48, "y": 26, "w": 13, "h": 18, "label": "Heat\nexchanger", "sub": "PCHE"},
   {"id": "r-turbine", "x": 65, "y": 26, "w": 14, "h": 18, "label": "Turbine\ngenerator", "sub": "sCO2 Brayton"},
   {"id": "r-power", "x": 83, "y": 26, "w": 13, "h": 18, "label": "Power\nelectronics", "sub": "480 V AC\n28 V DC"},
   {"id": "r-cooling", "x": 65, "y": 50, "w": 14, "h": 9, "label": "Dry cooler"},
 ], "links": [
   {"a": [61, 31], "b": [65, 31], "k": "heat"},
   {"a": [65, 39], "b": [61, 39], "k": "cold"},
   {"a": [72, 44], "b": [72, 50], "k": "heat"},
   {"a": [79, 35], "b": [83, 35], "k": "power"},
   {"a": [96, 35], "b": [99, 35], "k": "power"},
 ], "subs": {"r-core": [{"id": "r-fuel", "label": "Fuel pins"}, {"id": "r-moderator", "label": "Moderator"}]}},
 "permitpulse": {"vb": [100, 40], "nodes": [
   {"id": "pp-intake", "x": 1, "y": 12, "w": 17, "h": 12, "label": "Documents\nin"},
   {"id": "pp-assemble", "x": 21, "y": 12, "w": 18, "h": 12, "label": "Assemble\napplication"},
   {"id": "pp-check", "x": 42, "y": 12, "w": 18, "h": 12, "label": "Check against\nregulation"},
   {"id": "pp-audit", "x": 63, "y": 12, "w": 16, "h": 12, "label": "Audit\ntrail"},
   {"id": "pp-agency", "x": 82, "y": 12, "w": 17, "h": 12, "label": "Agency\nreview"},
   {"id": "n-pulse", "x": 1, "y": 30, "w": 22, "h": 6, "shape": "pill", "label": "Pulse Extract"},
   {"id": "guru", "x": 42, "y": 30, "w": 18, "h": 6, "shape": "pill", "label": "Runs on GURU?"},
 ], "links": [
   {"a": [18, 18], "b": [21, 18], "k": "msg"}, {"a": [39, 18], "b": [42, 18], "k": "msg"},
   {"a": [60, 18], "b": [63, 18], "k": "msg"}, {"a": [79, 18], "b": [82, 18], "k": "msg"},
   {"a": [51, 30], "b": [51, 24], "k": "check"},
 ]},
}

STREAMS_TSV = __import__("os").path.join(__import__("os").path.dirname(__import__("os").path.abspath(__file__)), "streams.tsv")
exec(open(__import__("os").path.join(__import__("os").path.dirname(__import__("os").path.abspath(__file__)), "wiki_v2.py"), encoding="utf-8").read())

inbox = [
  {"who": "Ion", "when": "2026-09-04", "text": "ParaView node restart steps", "to": "h-paraview", "state": "waiting for steps"},
  {"who": "Ryland", "when": "2026-10-02", "text": "Kestrel tutorial collection link", "to": "h-kestrel", "state": "waiting for link"},
]

out = {"updated": "2026-10-04", "companies": companies, "pages": P, "glossary": [{"t": t, "d": d} for t, d in glossary],
       "maps": maps, "inbox": inbox,
       "sections": SECTIONS, "lists": LISTS, "folders": FOLDERS}

# writing rules: no em or en dashes; flag hyphens between letters
txt = json.dumps(out, ensure_ascii=False)
bad = [m.group(0) for m in re.finditer(r"[–—]", txt)]
words = json.dumps({k: [v["title"], v["what"], v["fits"], v["current"]] + v["questions"] for k, v in P.items()})
hy = set(re.findall(r"[A-Za-z]+-[A-Za-z]+", words))
if bad: sys.exit("dashes: %r" % bad)
print("hyphens in prose:", sorted(hy))
missing = [c for p in P.values() for c in p["children"] + p["connects"] if c not in P]
mapmiss = [n["id"] for m in maps.values() for n in m["nodes"] if n["id"] not in P]
print("missing refs:", missing, mapmiss)
json.dump(out, open(sys.argv[1], "w"), ensure_ascii=False, indent=0)
print(len(P), "pages", len(glossary), "terms")
