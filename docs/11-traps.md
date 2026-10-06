# 11 Traps

Every one of these cost real debugging time. Read before changing the code.

## Übersicht and the UI

- **No React import, no fragments.** Übersicht compiles JSX with its own pragma and no fragment pragma, so `<>...</>` becomes `React.Fragment` and the widget dies with "Can't find variable: React", while every ordinary tag keeps working. Return one element, or two complete ones from the two arms of a conditional.
- **`className` styles Übersicht's wrapper, not your element.** The wrapper has one child, so a `gap` there separates nothing. The flex column must be on the element `render()` returns.
- **Use CSS `zoom`, not `transform: scale()`.** `zoom` runs layout again so text stays sharp; `transform` stretches a bitmap.
- **Measure the DOM in an event handler or a `setTimeout`, never during render.** Mid render, `getBoundingClientRect()` returns the previous commit's box.
- **Whether `getBoundingClientRect` includes `zoom` varies by engine.** The widget measures the zoom wrapper against its known width and derives the factor.
- **The widget cannot draw over its own terminal or app slot.** Those slots have a real window parked on top, which floats above the desktop layer. Cards hang off the calendar row instead.
- **Übersicht renders once per display.** Only the main display copy may place windows (`CFG.mainDisplayOnly`).
- **A reload keeps the old state, and a mid edit reload can leave it partial.** `updateState` fills any missing field from `initialState`, or render dies on every beat until Übersicht restarts.
- **Editing `index.jsx` reloads the widget**, which visibly repaints. That flicker is the edit, not a bug.
- **Backdrop blur flickers.** Every state change rerenders the tree and WebKit rerasterizes the blur, which reads as panels flickering on the 5 second stats beat. `CFG.glassBlur` is 0 on purpose.
- **Dictation fights controlled inputs.** Every text box that takes dictation is uncontrolled; writing its value back on each render fights macOS dictation.
- **A label ticks its checkbox.** Task rows are `div`s, not `<label>`s, or any click on the text would tick the task.

## Shell, AppleScript and data

- **An unquoted heredoc eats backslashes before `osascript` sees them.** `replace(/\\/g, ...)` arrives as an unterminated regex, kills the whole calendar script, and the only symptom is the calendar losing its colours (it falls back to icalBuddy). Quote the heredoc.
- **AppleScript compiles the whole script before running any of it.** Empty coordinates leave `{, }` in a line and kill the entire script, including the parts that would have worked.
- **A minimised window reports a correct frame but never draws.** Un minimise before positioning.
- **`pgrep` is unreliable for GUI apps here.** Use `ps ax -o comm | grep`.
- **A pipe is a legal character in a meeting title** ("xTech|Disrupt Fires"). Every feed emits tab separated records.
- **`String(nilObjCString)` is `"[id nil]"`, not empty.** Check `isNil()` first.
- **Format EventKit dates as local wall clock, not ISO with a zone**, or the grid slides by the UTC offset.
- **icalBuddy omits empty properties**, so fields are matched by name, and `-ps` takes its delimiter from its first character.
- **Apple silicon uses 16K pages.** Memory math that assumes 4K reads RAM about 4 times low.
- **`df` capacity is used ÷ (used + available)**, not used ÷ size.
- **Pass user text through base64.** Every click that carries text sends it base64 encoded so nothing typed can break the command.
- **A reply and a heredoc both want stdin.** Python that parses a job's reply reads it from a file, not a pipe.

## Headless Claude jobs

- **No final marker means failure.** Never move a time window or mark a meeting seen unless the reply ends with its marker line; the next run covers the same ground.
- **Haiku stalls on pagination** and asks for a shell. Tell it it already has every tool it needs, and retry once on Sonnet.
- **Defense topics can trip Sonnet's safeguards** (interceptors, hypersonics) and the reply comes back as an API error. Retry those on Opus before failing.
- **Large tool results are saved to a file.** Every prompt says to open them with Read.
- **Never trust the model with invariants.** No status change without a reason, the four allowed CRM writes, at most 20 rank moves: enforced in Python.
- **A partial page run is not data.** The wiki live sync refuses a result much smaller than the last one (it once replaced 605 tasks with 100).
- **ClickUp's daily limit is shared.** When a reply says the limit is spent, stop every ClickUp job until the reset rather than spend calls that will be refused (`cu_limit.zsh`).
- **`clickup_merge_tasks` deletes tasks.** Never use it.
- **A meeting read twice makes two nodes.** Mark the meeting being read as current before reading it.

## The Mac

- **Dock icons of parked apps stay.** Removing one while the app runs needs `LSUIElement` in its signed bundle, which breaks the signature (and its Keychain items). Not worth it.
- **Übersicht cannot hold microphone permission**, so on device speech runs in a tiny separate app (`MSBAI Listen.app`, built from `listen.swift` by `voice.sh`).
