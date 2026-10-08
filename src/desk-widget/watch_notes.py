# watch_notes.py: keep each watcher update on the task itself. Writes a dated "Update" bullet into
# the task's notes in TASKS.md (Active section), so it survives "got it" and goes to ClickUp with the
# rest of the notes on the next sync. Skips any update whose link the task already has.
#   watch_notes.py TASKS.md .watch/tasks.txt .watch/output
import datetime, re, sys
tasks_md, tasks_txt, output = sys.argv[1:4]
titles = {}
for line in open(tasks_txt, encoding="utf-8"):
    m = re.match(r"^TASK (\d+): (.*)$", line.rstrip("\n"))
    if m: titles[m.group(1)] = m.group(2)
adds = {}
for line in open(output, encoding="utf-8", errors="replace"):
    f = line.rstrip("\n").split("\t")
    if len(f) < 7 or f[0] != "A" or f[1].strip() not in titles: continue
    src, url, when, what = (x.strip() for x in f[2:6])
    try: d = datetime.datetime.fromisoformat(when.replace("Z", "+00:00"))
    except Exception: d = datetime.datetime.now()
    b = f"  - Update ({d:%b} {d.day}, {src}): {what}" + (f" [link]({url})" if url.startswith("http") else "")
    adds.setdefault(titles[f[1].strip()], []).append((url, b))
if not adds: sys.exit(0)
lines = open(tasks_md, encoding="utf-8").read().split("\n")
sec, i, wrote = None, 0, 0
while i < len(lines):
    l = lines[i]
    if l.startswith("## "): sec = l[3:].strip()
    m = re.match(r"^- \[ \] \*\*(.+?)\*\*", l)
    if m and sec == "Active" and m.group(1) in adds:
        j = i + 1
        while j < len(lines) and re.match(r"^(\s{2,}|\t)-\s", lines[j]): j += 1
        block = "\n".join(lines[i:j])
        at = next((k for k in range(i + 1, j) if re.match(r"^\s+- (\[|Related |Source:)", lines[k])), j)
        new = [b for url, b in adds[m.group(1)] if not (url and url in block)]
        lines[at:at] = new; wrote += len(new); i = j + len(new); continue
    i += 1
if wrote:
    open(tasks_md, "w", encoding="utf-8").write("\n".join(lines))
    print(f"{datetime.datetime.now():%F %T}  notes: {wrote} update line(s) written to TASKS.md")
