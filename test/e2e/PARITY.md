# Fish → Bun E2E parity

Every behavioral assertion in the frozen Fish tests has one named Bun spec below.
The oracle specs live in their owning files: `tp.oracle.cli.e2e.test.ts` (lane #14), `tp.oracle.core.e2e.test.ts` (lane #16), `tp.oracle.listings.e2e.test.ts` (lane #17), `tp.oracle.pi.e2e.test.ts` (lane #18), and `tp.oracle.origin.e2e.test.ts` (lane #19).
The concrete `todo-awaiting-lane-#14`, `#16`, `#17`, `#18`, `#19`, and `#21` statuses identify the owning implementation lane. The live status is the `test()`/`test.todo()` marker in each per-lane file. Command behavior belongs to later lanes and the translated oracle must remain green before those lanes land.

| Fish source test | Bun spec | Status |
| --- | --- | --- |
| `legacy/tests/test_tp.fish:40 — leading zeroes are parsed as decimal.` | `leading zeroes are parsed as decimal` | todo-awaiting-lane-#14 |
| `legacy/tests/test_tp.fish:41 — all-zero input is normalized.` | `all-zero input is normalized` | todo-awaiting-lane-#14 |
| `legacy/tests/test_tp.fish:42 — session numbers are padded.` | `session numbers are padded` | todo-awaiting-lane-#14 |
| `legacy/tests/test_tp.fish:43 — large session numbers are preserved.` | `large session numbers are preserved` | todo-awaiting-lane-#14 |
| `legacy/tests/test_tp.fish:57 — nested command serialization preserves argument boundaries.` | `nested command serialization preserves argument boundaries` | todo-awaiting-lane-#14 |
| `legacy/tests/test_tp.fish:60 — non-numeric session numbers are rejected.` | `non-numeric session numbers are rejected` | todo-awaiting-lane-#14 |
| `legacy/tests/test_tp.fish:63 — Linux client TTYs are sanitized.` | `Linux client TTYs are sanitized` | todo-awaiting-lane-#19 |
| `legacy/tests/test_tp.fish:64 — macOS client TTYs are sanitized.` | `macOS client TTYs are sanitized` | todo-awaiting-lane-#19 |
| `legacy/tests/test_tp.fish:65 — separator runs in client TTYs become single underscores.` | `separator runs in client TTYs become single underscores` | todo-awaiting-lane-#19 |
| `legacy/tests/test_tp.fish:77 — invalid client TTY values are rejected.` | `empty, control-containing, oversized, and separator-only client TTYs are rejected` | todo-awaiting-lane-#19 |
| `legacy/tests/test_tp.fish:168 — outside attachment installs metadata stamping before attach-session.` | `outside attachment installs metadata stamping before attach-session` | todo-awaiting-lane-#19 |
| `legacy/tests/test_tp.fish:175 — outside attachment keeps the exact session target.` | `outside attachment keeps the exact session target` | todo-awaiting-lane-#19 |
| `legacy/tests/test_tp.fish:186 — outside hook preserves IPv6 sources.` | `outside hook preserves IPv6 sources` | todo-awaiting-lane-#19 |
| `legacy/tests/test_tp.fish:191 — missing SSH metadata clears the exact mapping before attachment.` | `missing SSH metadata clears the exact mapping before attachment` | todo-awaiting-lane-#19 |
| `legacy/tests/test_tp.fish:195 — missing SSH metadata clears only the current TTY mapping.` | `missing SSH metadata clears only the current TTY mapping` | todo-awaiting-lane-#19 |
| `legacy/tests/test_tp.fish:196 — tmux receives an argument-safe option unset command.` | `tmux receives an argument-safe option unset command` | todo-awaiting-lane-#19 |
| `legacy/tests/test_tp.fish:201 — control-containing SSH metadata clears the exact mapping.` | `control-containing SSH metadata clears the exact mapping` | todo-awaiting-lane-#19 |
| `legacy/tests/test_tp.fish:210 — invalid TTY does not create a metadata option.` | `an invalid TTY does not create a metadata option` | todo-awaiting-lane-#19 |
| `legacy/tests/test_tp.fish:216 — failed tty lookup does not create a metadata option.` | `a failed tty lookup does not create a metadata option` | todo-awaiting-lane-#19 |
| `legacy/tests/test_tp.fish:225 — inside tmux reuses the current client mapping before switching.` | `inside tmux reuses the current client mapping before switching` | todo-awaiting-lane-#19 |
| `legacy/tests/test_tp.fish:229 — inside tmux reads the current client TTY.` | `inside tmux reads the current client TTY` | todo-awaiting-lane-#19 |
| `legacy/tests/test_tp.fish:230 — inside tmux reads the current client mapping.` | `inside tmux reads the current client mapping` | todo-awaiting-lane-#19 |
| `legacy/tests/test_tp.fish:231 — inside tmux keeps the exact switch target.` | `inside tmux keeps the exact switch target` | todo-awaiting-lane-#19 |
| `legacy/tests/test_tp.fish:232 — inside tmux does not overwrite metadata from SSH_CONNECTION.` | `inside tmux does not overwrite metadata from SSH_CONNECTION` | todo-awaiting-lane-#19 |
| `legacy/tests/test_tp.fish:233 — inside tmux does not clear a trusted client mapping.` | `inside tmux does not clear a trusted client mapping` | todo-awaiting-lane-#19 |
| `legacy/tests/test_tp.fish:238 — inside tmux leaves a missing client mapping absent and still switches.` | `inside tmux leaves a missing client mapping absent and still switches` | todo-awaiting-lane-#19 |
| `legacy/tests/test_tp.fish:242 — inside tmux does not guess a missing source.` | `inside tmux does not guess a missing source` | todo-awaiting-lane-#19 |
| `legacy/tests/test_tp.fish:243 — inside tmux does not mutate an absent source mapping.` | `inside tmux does not mutate an absent source mapping` | todo-awaiting-lane-#19 |
| `legacy/tests/test_tp.fish:308 — real client-attached hook records the real client_created.` | `real client-attached hook records the real client_created` | todo-awaiting-lane-#19 |
| `legacy/tests/test_tp.fish:326 — plain reattach reuses the original client TTY.` | `plain reattach reuses the original client TTY` | todo-awaiting-lane-#19 |
| `legacy/tests/test_tp.fish:331 — stale source remains bound to the previous client_created.` | `stale source remains bound to the previous client_created` | todo-awaiting-lane-#19 |
| `legacy/tests/test_tp.fish:335 — outside attach cleanup removes pending records.` | `outside attach cleanup removes pending records` | todo-awaiting-lane-#19 |
| `legacy/tests/test_tp.fish:382 — abandoned hook cannot mint a mapping for a later plain attach.` | `abandoned hook cannot mint a mapping for a later plain attach` | todo-awaiting-lane-#19 |
| `legacy/tests/test_tp.fish:391 — empty project list contains no phantom session.` | `empty project list contains no phantom session` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:394 — empty global list contains no phantom session.` | `empty global list contains no phantom session` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:398 — tp ls fails when no project sessions exist.` | `tp ls fails when no project sessions exist` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:399 — tp ls reports no project sessions.` | `tp ls reports no project sessions` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:403 — tp global fails when no tp sessions exist.` | `tp global fails when no tp sessions exist` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:404 — tp global reports no sessions.` | `tp global reports no sessions` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:411 — project sessions are sorted numerically.` | `project sessions are sorted numerically` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:412 — next number follows the highest existing session.` | `next number follows the highest existing session` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:416 — project listing excludes other projects.` | `project listing excludes other projects` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:419 — global listing is grouped and sorted.` | `global listing is grouped and sorted` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:434 — a live Pi session contributes its abbreviated id.` | `a live Pi session contributes its abbreviated id` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:435 — a session running no Pi contributes no id.` | `a session running no Pi contributes no id` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:436 — an id left behind by a dead Pi process is suppressed.` | `an id left behind by a dead Pi process is suppressed` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:442 — a live process owned by another user still counts as live.` | `a live process owned by another user still counts as live` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:448 — an id published without a pid is still shown.` | `an id published without a pid is still shown` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:453 — tp ls shows the label and Pi session id together.` | `tp ls shows the label and Pi session id together` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:459 — tp global shows the Pi session id.` | `tp global shows the Pi session id` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:465 — tp all shows the Pi session id.` | `tp all shows the Pi session id` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:472 — an uncached session still yields an empty suffix.` | `an uncached session still yields an empty suffix` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:480 — a duration under an hour reads in minutes.` | `a duration under an hour reads in minutes` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:481 — a duration under a minute reads in seconds.` | `a duration under a minute reads in seconds` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:482 — a duration under a day reads in hours.` | `a duration under a day reads in hours` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:483 — a long duration reads in days.` | `a long duration reads in days` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:485 — a non-numeric duration is rejected.` | `a non-numeric duration is rejected` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:490 — state, context and model are separate fields.` | `state, context and model are separate fields` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:491 — a blocked session names the tool holding it.` | `a blocked session names the tool holding it` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:492 — context usage is rendered as a percentage.` | `context usage is rendered as a percentage` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:493 — the model is rendered last.` | `the model is rendered last` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:497 — an idle session does not name a stale tool.` | `an idle session does not name a stale tool` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:499 — a thinking session does not name a stale tool.` | `a thinking session does not name a stale tool` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:502 — a session publishing no state renders nothing.` | `a session publishing no state renders nothing` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:506 — a state with no extras is still rendered.` | `a state with no extras is still rendered` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:507 — a state with no timestamp omits the age.` | `a state with no timestamp omits the age` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:513 — every field is shown when there is room.` | `every field is shown when there is room` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:517 — a field that exactly fills the line is kept.` | `a field that exactly fills the line is kept` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:521 — a field one column too wide is dropped.` | `a field one column too wide is dropped` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:525 — no field is shown when the prefix already fills the line.` | `no field is shown when the prefix already fills the line` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:535 — a listing shows the label, id and full state together.` | `a listing shows the label, id and full state together` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:544 — a dead Pi shows neither its id nor its last state.` | `a dead Pi shows neither its id nor its last state` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:553 — a narrow terminal keeps the state and drops the rest.` | `a narrow terminal keeps the state and drops the rest` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:564 — a state with no identity behind it is not shown.` | `a state with no identity behind it is not shown` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:579 — TP_COLOR=never disables colour.` | `TP_COLOR=never disables colour` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:580 — no escapes are emitted when colour is off.` | `no escapes are emitted when colour is off` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:584 — TP_COLOR=always keeps colour through a pipe.` | `TP_COLOR=always keeps colour through a pipe` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:588 — TP_COLOR=always emits escapes.` | `TP_COLOR=always emits escapes` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:597 — NO_COLOR wins over TP_COLOR=always.` | `NO_COLOR wins over TP_COLOR=always` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:601 — a coloured string measures its visible width.` | `a coloured string measures its visible width` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:602 — an uncoloured string measures the same.` | `an uncoloured string measures the same` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:607 — a character-set reset does not widen a coloured string.` | `a character-set reset does not widen a coloured string` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:614 — colour escapes do not consume the width budget.` | `colour escapes do not consume the width budget` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:620 — blocked and idle are visually distinct.` | `blocked and idle are visually distinct` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:627 — a low context percent still reads plainly.` | `a low context percent still reads plainly` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:628 — a high context percent still reads plainly.` | `a high context percent still reads plainly` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:630 — a nearly-full context window is coloured differently.` | `a nearly-full context window is coloured differently` | todo-awaiting-lane-#17 |
| `legacy/tests/test_tp.fish:648 — the displayed Pi id reaches past the UUIDv7 timestamp.` | `the displayed Pi id reaches past the UUIDv7 timestamp` | todo-awaiting-lane-#18 |
| `legacy/tests/test_tp.fish:652 — tp sid prints the full untruncated Pi session id.` | `tp sid prints the full untruncated Pi session id` | todo-awaiting-lane-#18 |
| `legacy/tests/test_tp.fish:656 — the id resolver returns the full id.` | `the id resolver returns the full id` | todo-awaiting-lane-#18 |
| `legacy/tests/test_tp.fish:659 — tp sid fails on a session running no Pi.` | `tp sid fails on a session running no Pi` | todo-awaiting-lane-#18 |
| `legacy/tests/test_tp.fish:660 — tp sid fails on a session that does not exist.` | `tp sid fails on a session that does not exist` | todo-awaiting-lane-#18 |
| `legacy/tests/test_tp.fish:664 — tp sid rejects invalid arguments with usage status.` | `tp sid rejects invalid arguments with usage status` | todo-awaiting-lane-#18 |
| `legacy/tests/test_tp.fish:674 — restart drops --resume and appends the recorded session id.` | `restart drops --resume and appends the recorded session id` | todo-awaiting-lane-#18 |
| `legacy/tests/test_tp.fish:679 — restart drops --continue and keeps other Pi flags.` | `restart drops --continue and keeps other Pi flags` | todo-awaiting-lane-#18 |
| `legacy/tests/test_tp.fish:683 — restart replaces an existing --session and its value.` | `restart replaces an existing --session and its value` | todo-awaiting-lane-#18 |
| `legacy/tests/test_tp.fish:687 — restart replaces a joined --session=value.` | `restart replaces a joined --session=value` | todo-awaiting-lane-#18 |
| `legacy/tests/test_tp.fish:696 — restart preserves quoted argument boundaries.` | `restart preserves quoted argument boundaries` | todo-awaiting-lane-#18 |
| `legacy/tests/test_tp.fish:704 — restart keeps an update-first wrapper intact.` | `restart keeps an update-first wrapper intact` | todo-awaiting-lane-#18 |
| `legacy/tests/test_tp.fish:709 — restart rejects an empty recorded command.` | `restart rejects an empty recorded command` | todo-awaiting-lane-#18 |
| `legacy/tests/test_tp.fish:715 — the session directory mirrors the path-to-dashes rule Pi uses.` | `the session directory mirrors the path-to-dashes rule Pi uses` | todo-awaiting-lane-#18 |
| `legacy/tests/test_tp.fish:722 — a published id with no log file is not resumable.` | `a published id with no log file is not resumable` | todo-awaiting-lane-#18 |
| `legacy/tests/test_tp.fish:727 — an existing log file is found for the published id.` | `an existing log file is found for the published id` | todo-awaiting-lane-#18 |
| `legacy/tests/test_tp.fish:732 — restart refuses a session running no Pi.` | `restart refuses a session running no Pi` | todo-awaiting-lane-#18 |
| `legacy/tests/test_tp.fish:734 — a refused restart leaves the session running.` | `a refused restart leaves the session running` | todo-awaiting-lane-#18 |
| `legacy/tests/test_tp.fish:739 — restart refuses a session that does not exist.` | `restart refuses a session that does not exist` | todo-awaiting-lane-#18 |
| `legacy/tests/test_tp.fish:742 — tp <n> --restart refuses a session running no Pi.` | `tp <n> --restart refuses a session running no Pi` | todo-awaiting-lane-#18 |
| `legacy/tests/test_tp.fish:744 — tp global <i> --restart refuses a session running no Pi.` | `tp global <i> --restart refuses a session running no Pi` | todo-awaiting-lane-#18 |
| `legacy/tests/test_tp.fish:746 — tp <n> rejects an unknown argument.` | `tp <n> rejects an unknown argument` | todo-awaiting-lane-#18 |
| `legacy/tests/test_tp.fish:768 — tp p update-first launches the updater before Pi and preserves Pi arguments.` | `tp p update-first launches the updater before Pi and preserves Pi arguments` | todo-awaiting-lane-#16 |
| `legacy/tests/test_tp.fish:772 — tp p applies its name to the tmux session.` | `tp p applies its name to the tmux session` | todo-awaiting-lane-#16 |
| `legacy/tests/test_tp.fish:773 — tp p attaches to the new session.` | `tp p attaches to the new session` | todo-awaiting-lane-#16 |
| `legacy/tests/test_tp.fish:776 — tp pi passes every argument after -- directly to Pi.` | `tp pi passes every argument after -- directly to Pi` | todo-awaiting-lane-#16 |
| `legacy/tests/test_tp.fish:782 — tp pi stops interpreting options after --.` | `tp pi stops interpreting options after --` | todo-awaiting-lane-#16 |
| `legacy/tests/test_tp.fish:789 — tp pi rejects a missing name value.` | `tp pi rejects a missing name value` | todo-awaiting-lane-#16 |
| `legacy/tests/test_tp.fish:793 — tp pi shows usage after a missing name value.` | `tp pi reports usage for a missing name value` | todo-awaiting-lane-#16 |
| `legacy/tests/test_tp.fish:794 — tp pi creates no session after a missing name value.` | `tp pi creates no session after a missing name value` | todo-awaiting-lane-#16 |
| `legacy/tests/test_tp.fish:813 — screenshots are listed newest first.` | `screenshots are listed newest first` | todo-awaiting-lane-#16 |
| `legacy/tests/test_tp.fish:816 — tp shot returns the newest screenshot.` | `tp shot returns the newest screenshot` | todo-awaiting-lane-#16 |
| `legacy/tests/test_tp.fish:817 — tp shot list accepts a result limit.` | `tp shot list accepts a result limit` | todo-awaiting-lane-#16 |
| `legacy/tests/test_tp.fish:818 — tp shot dir returns the screenshot directory.` | `tp shot dir returns the screenshot directory` | todo-awaiting-lane-#16 |
| `legacy/tests/test_tp.fish:822 — tp shot latest rejects an extra argument.` | `tp shot latest rejects an extra argument` | todo-awaiting-lane-#16 |
| `legacy/tests/test_tp.fish:826 — tp shot rejects invalid arguments with usage status.` | `tp shot rejects invalid arguments with usage status` | todo-awaiting-lane-#16 |
| `legacy/tests/test_tp.fish:830 — tp shot list rejects an oversized count.` | `tp shot list rejects an oversized count` | todo-awaiting-lane-#16 |
| `legacy/tests/test_tp.fish:834 — oversized screenshot counts fail without Fish diagnostics.` | `oversized screenshot counts fail without Fish diagnostics` | todo-awaiting-lane-#16 |
| `legacy/tests/test_tp.fish:837 — tp name stores a session label.` | `tp name stores a session label` | todo-awaiting-lane-#16 |
| `legacy/tests/test_tp.fish:840 — project completions contain sorted session numbers.` | `project completions contain sorted session numbers` | todo-awaiting-lane-#14 |
| `legacy/tests/test_tp.fish:843 — project completion includes the session label.` | `project completion includes the session label` | todo-awaiting-lane-#14 |
| `legacy/tests/test_tp.fish:848 — global completions contain one-based indexes.` | `global completions contain one-based indexes` | todo-awaiting-lane-#14 |
| `legacy/tests/test_tp.fish:850 — global completion indexes match list order.` | `global completion indexes match list order` | todo-awaiting-lane-#14 |
| `legacy/tests/test_tp.fish:852 — tp kill removes a selected project session.` | `tp kill removes a selected project session` | todo-awaiting-lane-#16 |
| `legacy/tests/test_tp.fish:860 — tp kill removes all current-project sessions.` | `tp kill removes all current-project sessions` | todo-awaiting-lane-#16 |
| `legacy/tests/test_tp_shot.fish:218 — remote setup reports its path under fish.` | `remote setup reports its path under fish` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:219 — remote setup creates a private directory under fish.` | `remote setup creates a private directory under fish` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:231 — custom remote setup reports its exact path under fish.` | `custom remote setup reports its exact path under fish` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:232 — custom remote setup creates a private directory under fish.` | `custom remote setup creates a private directory under fish` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:218 — remote setup reports its path under sh.` | `remote setup reports its path under sh` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:219 — remote setup creates a private directory under sh.` | `remote setup creates a private directory under sh` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:231 — custom remote setup reports its exact path under sh.` | `custom remote setup reports its exact path under sh` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:232 — custom remote setup creates a private directory under sh.` | `custom remote setup creates a private directory under sh` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:244 — explicit host is passed to ssh.` | `explicit host is passed to ssh` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:244 — ssh option parsing ends before the explicit host.` | `ssh option parsing ends before the explicit host` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:248 — clipboard receives only the remote screenshot path.` | `clipboard receives only the remote screenshot path` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:253 — existing image is copied to the remote path.` | `existing image is copied to the remote path` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:254 — remote screenshot directory is private.` | `remote screenshot directory is private` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:255 — uploaded screenshot is private.` | `uploaded screenshot is private` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:260 — ssh option parsing ends before the permission-command host.` | `ssh option parsing ends before the permission-command host` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:262 — uploaded screenshot permission command is compatible with macOS chmod.` | `uploaded screenshot permission command is compatible with macOS chmod` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:265 — uploaded screenshot permission command includes chmod 600.` | `uploaded screenshot permission command includes chmod 600` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:270 — scp receives the selected host and remote path.` | `scp receives the selected host and remote path` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:281 — TP_SHOT_HOST supplies the default host.` | `TP_SHOT_HOST supplies the default host` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:283 — no file argument opens an interactive screenshot capture.` | `no file argument opens an interactive screenshot capture` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:288 — captured image is copied to the remote path.` | `captured image is copied to the remote path` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:298 — cancelled capture exits without changing the clipboard.` | `cancelled capture exits without changing the clipboard` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:308 — failed scp removes its partial screenshot.` | `failed scp removes its partial screenshot` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:313 — remote cleanup command is compatible with macOS rm.` | `remote cleanup command is compatible with macOS rm` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:316 — remote cleanup command includes rm -f.` | `remote cleanup command includes rm -f` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:320 — failed upload exits without changing the clipboard.` | `failed upload exits without changing the clipboard` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:332 — permission failure removes the upload and leaves the clipboard unchanged.` | `permission failure removes the upload and leaves the clipboard unchanged` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:346 — failed remote setup does not invoke scp.` | `failed remote setup does not invoke scp` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:350 — failed remote setup exits without changing the clipboard.` | `failed remote setup exits without changing the clipboard` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:358 — empty host is rejected before ssh.` | `empty host is rejected before ssh` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:360 — empty host is rejected before capture.` | `empty host is rejected before capture` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:367 — missing input is rejected.` | `missing input is rejected` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:373 — notification test sends a macOS notification.` | `notification test sends a macOS notification` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:383 — automatic notifications fall back to osascript.` | `automatic notifications fall back to osascript` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:391 — notification test reports when notifications are disabled.` | `notification test reports when notifications are disabled` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:410 — async worker does not start scp before ownership transfer.` | `async worker does not start scp before ownership transfer` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:412 — async worker keeps both remote paths absent before ownership transfer.` | `async worker keeps both remote paths absent before ownership transfer` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:419 — async worker uploads only after ownership transfer.` | `async worker uploads only after ownership transfer` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:422 — async worker removes startup handshake markers after ownership transfer.` | `async worker removes startup handshake markers after ownership transfer` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:437 — async mode copies the UUID-based final path immediately.` | `async mode copies the UUID-based final path immediately` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:442 — async upload writes to the hidden temporary path.` | `async upload writes to the hidden temporary path` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:443 — async temporary path can contain partial upload data.` | `async temporary path can contain partial upload data` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:445 — async final path is absent while only partial upload data exists.` | `async final path is absent while only partial upload data exists` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:452 — async upload atomically publishes the complete image.` | `async upload atomically publishes the complete image` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:454 — async upload publishes a private image.` | `async upload publishes a private image` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:456 — async upload removes its temporary remote file.` | `async upload removes its temporary remote file` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:461 — async upload uses a private source snapshot.` | `async upload uses a private source snapshot` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:465 — async upload cleans its private source snapshot.` | `async upload cleans its private source snapshot` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:467 — async upload sends a ready notification after publication.` | `async upload sends a ready notification after publication` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:470 — async upload records a useful completion log.` | `async upload records a useful completion log` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:472 — async upload log is private.` | `async upload log is private` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:486 — failed async upload cleans up and sends a failure notification.` | `failed async upload cleans up and sends a failure notification` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:504 — async publish failure cleans up and sends a failure notification.` | `async publish failure cleans up and sends a failure notification` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:509 — async publish failure cleans its local source snapshot.` | `async publish failure cleans its local source snapshot` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:521 — startup failure preserves the immediately copied reserved path.` | `startup failure preserves the immediately copied reserved path` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:524 — async startup failure cleans local capture.` | `async startup failure cleans local capture` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:527 — async startup failure explains that the uploader failed to start.` | `async startup failure explains that the uploader failed to start` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:529 — async startup failure sends a failure notification.` | `async startup failure sends a failure notification` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:541 — short-lived Fish process copies its reserved path.` | `short-lived Fish process copies its reserved path` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:543 — short-lived Fish process does not wait for its delayed upload.` | `short-lived Fish process does not wait for its delayed upload` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:546 — detached worker survives its calling Fish process.` | `detached worker survives its calling Fish process` | todo-awaiting-lane-#21 |
| `legacy/tests/test_tp_shot.fish:548 — surviving detached worker notifies on completion.` | `surviving detached worker notifies on completion` | todo-awaiting-lane-#21 |

## Status legend and counts

`active` = active proof in this suite; each concrete `todo-awaiting-lane-#14`, `#16`, `#17`, `#18`, `#19`, or `#21` row waits for that owning lane; `not-ported(<concrete reason>)` = Fish-only setup intentionally excluded.

- `active`: 0 oracle rows (5 active harness self-tests live in `harness.e2e.test.ts`).
- `todo-awaiting-lane-#14`: 10 rows.
- `todo-awaiting-lane-#16`: 19 rows.
- `todo-awaiting-lane-#17`: 54 rows.
- `todo-awaiting-lane-#18`: 22 rows.
- `todo-awaiting-lane-#19`: 27 rows.
- `todo-awaiting-lane-#21`: 62 rows.
- `not-ported(Fish-only function loading)`: 1 row.
- `not-ported(Fish-only variable scoping)`: 1 row.
- `not-ported(Fish-only helper invocation)`: 1 row.
- `not-ported(Fish-only exit cleanup)`: 1 row.

## Intentionally not ported

| Fish setup/mechanic | Status | Reason |
| --- | --- | --- |
| `legacy/tests/test_tp.fish` function loading (`source`, `functions -c`, and Fish function replacement) | not-ported(Fish-only function loading) | Bun imports the TypeScript harness directly; Fish function lookup and replacement are not behaviors of the rewritten CLI. |
| `legacy/tests/test_tp.fish` test-local global variables and `set -Ux`/`set -gx` setup | not-ported(Fish-only variable scoping) | Bun tests use per-test temporary directories and explicit `env` passed to `runTp`; Fish variable scoping is test plumbing. |
| `legacy/tests/test_tp_shot.fish` Fish `source` and `_tp_shot_async_entry` direct helper invocation | not-ported(Fish-only helper invocation) | The public `tp-shot` process is the oracle boundary; Fish-only helper loading is not part of the TypeScript contract. |
| Fish `fish_exit` cleanup handlers | not-ported(Fish-only exit cleanup) | Bun `afterAll`/`finally` teardown provides the equivalent failure-safe lifecycle. |
