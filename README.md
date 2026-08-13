# tp

`tp` is a project-oriented tmux session manager for the [Fish shell](https://fishshell.com/). It gives each directory a predictable set of numbered tmux sessions, making it quick to create, switch, list, label, and remove project terminals.

Sessions are named from the current directory and a zero-padded number. Running `tp` from a directory named `website`, for example, creates or attaches to `website_001`.

## Requirements

- [Fish](https://fishshell.com/)
- [tmux](https://github.com/tmux/tmux)
- Optional: [cmux](https://github.com/manaflow-ai/cmux) and [`jq`](https://jqlang.github.io/jq/) for the `tp cmux` integration
- For screenshot sharing: a macOS capture computer with `ssh` access to the remote computer
- Optional: [`terminal-notifier`](https://github.com/julienXX/terminal-notifier) for reliable background upload notifications

## Installation

### Fisher

Install [Fisher](https://github.com/jorgebucaran/fisher), then install this plugin:

```fish
fisher install chrisgoddard/tp
```

Upgrade it later with:

```fish
fisher update chrisgoddard/tp
```

Remove it with:

```fish
fisher remove chrisgoddard/tp
```

### Local development installation

To use a local clone directly, remove the Fisher-managed copy and link the clone's Fish files into your user configuration. Changes in the clone then take effect without reinstalling the plugin:

```fish
fisher remove chrisgoddard/tp

for kind in functions completions
    mkdir -p "$__fish_config_dir/$kind"
    for source in $kind/*.fish
        ln -sfn (path resolve "$source") "$__fish_config_dir/$kind/"(path basename "$source")
    end
end

# Reload the newly linked functions and completions in this shell.
source "$__fish_config_dir/functions/tp.fish"
source "$__fish_config_dir/functions/tp-shot.fish"
source "$__fish_config_dir/completions/tp.fish"
source "$__fish_config_dir/completions/tp-shot.fish"
```

Run this from the root of the local `tp` clone. The links are user-wide, so new Fish shells also use the clone automatically.

### Manual installation

Copy the function and completion files into your Fish configuration:

```fish
git clone https://github.com/chrisgoddard/tp.git /tmp/tp
cp /tmp/tp/functions/*.fish ~/.config/fish/functions/
cp /tmp/tp/completions/*.fish ~/.config/fish/completions/
rm -rf /tmp/tp
```

Start a new Fish shell after installing.

## Usage

```text
tp                            Attach to the first project session, or create 001
tp new                        Create and attach to the next numbered session
tp new --name api             Create the next session and label it "api"
tp new command arguments      Create a session that runs a command
tp pi                         Create the next session and run Pi in it
tp pi --name auth             Name both the tmux session and the Pi session "auth"
tp pi --update-first          Update Pi and its extensions before running Pi
tp pi --model sonnet:high     Pass all other arguments directly to Pi
tp 2                          Attach to session 002, creating it if needed
tp 2 --restart                Restart session 002's Pi, resuming the same conversation
tp last                       Attach to the highest-numbered project session
tp ls                         List sessions for the current project, with any Pi session id
tp name 2 api                 Set or replace the label on session 002
tp sid 2                      Print the full Pi session id running in session 002
tp kill 2                     Kill project session 002
tp kill                       Kill every session for the current project
tp shot                       Print the newest uploaded screenshot path
tp shot list 5                Print the five newest screenshot paths
tp shot dir                   Print the screenshot upload directory
tp global                     List tp sessions across all projects
tp global 3                   Attach to item 3 in the global list
tp global 3 --restart         Restart item 3's Pi, resuming the same conversation
tp all                        List every tmux session
tp cmux                       Show tp sessions and their cmux state
tp cmux 3                     Open or focus item 3 in cmux
tp cmux website               Open sessions whose names start with "website"
tp cmux all                   Open or focus every tp session in cmux
```

Common commands also have short aliases:

| Command | Alias |
| --- | --- |
| `new` | `n` |
| `pi` | `p` |
| `last` | `l` or `-` |
| `kill` | `k` |
| `global` | `g` |
| `cmux` | `c` |
| `all` | `a` |

### Run a command in a new session

Arguments after `tp new` are run inside the new session under Fish:

```fish
tp new pi
tp new --name server npm run dev
```

When that command exits, `tp` preserves and replays the pane's final output in the calling terminal.

### Run Pi in a new session

`tp pi` (short form: `tp p`) is the Pi-specific form of `tp new pi`:

```fish
tp pi
tp pi --name "auth refactor"
tp p -n "release audit" --thinking high "Review the release changes"
```

`--name` / `-n` labels the tmux session and passes the same display name to Pi. `--update-first` / `-uf` runs `pi update --all` first and launches Pi only if the update succeeds:

```fish
tp pi -uf --name "upgrade follow-up"
```

Every other argument is passed to Pi with its original argument boundaries intact. Use `--` to stop `tp pi` from interpreting its own options; everything after it goes only to Pi.

## Share laptop screenshots with a remote Pi session

`tp-shot` solves the local-path problem in remote sessions. It uses the same macOS interactive capture interface as the normal screenshot keys, uploads the image over SSH, and copies only the remote path to the laptop clipboard. Images land in `~/.cache/pi/screenshots/` on the remote computer. The directory and image are restricted to the remote account.

Synchronous mode is the default. It waits for the upload, then copies the final path and reports success:

```fish
tp-shot
tp-shot ~/Desktop/Screenshot.png
```

Async mode reserves a UUID-based final path, copies it immediately, and uploads in a detached worker:

```fish
tp-shot --async
tp-shot --async ~/Desktop/Screenshot.png
```

The detached worker waits for the foreground process to transfer cleanup ownership before it starts SSH. It then uploads to a hidden temporary file, sets private permissions, and moves the complete file to the copied final path in one filesystem operation. An explicit input image is copied to a private local snapshot before the command returns, so later edits to the original cannot change the upload. A macOS notification reports when the path is ready or when the upload failed. Each upload writes a private log under `~/.cache/tp-shot/` on the laptop.

Paste the copied path into Pi with Command-V. Pi receives a path on the computer where it is running, so it can read the image directly. If async upload is still running, a Pi installation with the `wait_for_screenshot` tool can wait briefly and return the uploaded image directly instead of treating the missing path as a permanent error.

The ordinary Command-Shift-4 shortcut only saves an image or places image data on the laptop clipboard. Neither is visible to a process running on another computer. `tp-shot` adds the SSH transfer and puts a remote text path on the clipboard instead. It does not replace the ordinary shortcut.

### First-time setup

Install `tp` with Fisher on both computers:

```fish
fisher install chrisgoddard/tp
```

If it is already installed, update it instead:

```fish
fisher update chrisgoddard/tp
```

On the laptop, choose the SSH host used for uploads:

```fish
set -Ux TP_SHOT_HOST good-studio
```

`good-studio` is already the default. You can instead use `100.79.250.86` or `good-kiwi-studio.tail1fe17.ts.net`.

Before using a keyboard shortcut, connect once in a terminal so SSH can confirm the host and credentials:

```fish
ssh good-studio true
```

Test notifications before relying on async mode:

```fish
tp-shot --notify-test
```

The helper uses `terminal-notifier` when available and falls back to `osascript` if it is missing or fails. If the test does not appear, allow notifications for the relevant app in macOS System Settings. You can install the preferred notifier with `brew install terminal-notifier`. Set `TP_SHOT_NOTIFIER=none` only when you intentionally want log-only outcomes; `--notify-test` then reports that notifications are disabled.

Then test both upload modes from a laptop terminal:

```fish
# Wait for upload before returning
tp-shot

# Copy the final path immediately; notify when it becomes ready
tp-shot --async
```

Select a region or window. After the ready notification appears, paste into Pi. Use `tp shot` on the remote computer if you lose the copied path. `tp shot list` shows the ten most recent uploads.

Async mode assumes the laptop and remote account use the same absolute screenshot directory. If they do not, configure the remote path on the laptop:

```fish
set -Ux TP_SHOT_REMOTE_DIR /Users/remote-user/.cache/pi/screenshots
```

### Add a separate macOS keyboard shortcut

Keep Command-Shift-4 unchanged and assign another key combination to `tp-shot`:

1. Open **Shortcuts** and create a new shortcut named **Screenshot for Pi**.
2. Add **Run Shell Script**.
3. In a laptop terminal, find the absolute path to Fish:

   ```fish
   command -s fish
   ```

4. Use that path in the shortcut's script. For example, Apple Silicon Homebrew normally uses:

   ```sh
   /opt/homebrew/bin/fish -lc 'tp-shot --async'
   ```

   Intel Homebrew commonly uses `/usr/local/bin/fish`; other installations may differ.

5. Open the shortcut details, enable **Use as Quick Action**, and add a keyboard shortcut such as Control-Option-Command-4.
6. Run it once and approve any macOS screen-capture permission request.

The shortcut opens the normal macOS crosshair. After selection, async mode copies the reserved remote path without waiting. A later notification reports whether that path became ready.

The detached uploader survives the shortcut's shell process exiting. It uses non-interactive SSH, so it fails instead of leaving an invisible password prompt open. Configure key-based or Tailscale SSH access before using the keyboard shortcut.

### cmux integration

`tp cmux` maps tp-managed tmux sessions to cmux workspaces. It requires cmux socket automation to be enabled:

1. Open cmux settings.
2. Go to **Automation**.
3. Enable **Socket Control Mode → Automation**.

`jq` is used to identify an already-open workspace. Without it, `tp` cannot reliably detect and focus existing tp workspaces.

### Pi session ids in listings

`tp ls`, `tp global`, and `tp all` show the Pi session running in each tmux session, abbreviated to its first eight characters:

```text
Sessions for 'pi-delegate':
  014  →  pi-delegate_014 [fix-232] pi:019ff3d2 (attached)
  015  →  pi-delegate_015 [issue-119] pi:019ff185
```

The id comes from two tmux pane options that Pi writes on the pane it runs in:

```text
@pi_session_id = <full Pi session id>
@pi_pid        = <Pi's process id>
```

Publishing them is the Pi side's job — the `@caair/pi-caair-dev-tools` package does it on session start and unsets them on shutdown. A session running anything else simply has no id to show.

`tp` reads both in the single `tmux list-sessions` call it already uses for labels and attachment, because a pane option resolves in a `list-sessions` format against each session's active pane.

Pi cannot unset the options when it is killed outright, so `tp` treats the published pid as the liveness check: an id whose process is gone is not shown. The check is `ps -p`, not `kill -0`, because `kill -0` fails on a live process owned by another user. An id published without a pid is shown as-is, since nothing disproves it.

### Session state

Alongside the id, a listing shows what each Pi session is doing:

```text
  001  →  demo_001 [issue filer] pi:019ff650-ac6d · ⏸ blocked:bash 3m · 24% · gpt-5.6-sol
  002  →  demo_002 [api work]    pi:019ff3d2-4dea · ● tool:read 4s · 61% · gpt-5.6-sol
  003  →  demo_003              pi:019ff69e-6014 · ○ idle 2h · 8% · claude-opus-4-8
```

| Marker | State | Colour | Meaning |
| --- | --- | --- | --- |
| `⏸` | `blocked` | yellow | Waiting for you — a guard prompt or a question |
| `●` | `tool` | cyan | Running the named tool |
| `●` | `thinking` | blue | Working, between tools |
| `○` | `idle` | grey | Waiting for your next message |

Then time in that state, context window used, and the model.

Every state carries both a marker and a colour, so the meaning survives a
monochrome terminal, a pipe, and colour blindness. Yellow marks the only state
that needs you; red is kept for a context window near its limit (85% or more,
amber from 70%), where the next thing to happen is a compaction.

Labels are green, the Pi id and model are grey — an id is for copying, not
reading — and `(attached)` is magenta.

Colour is disabled when output is not a terminal, so `tp ls | cat` and scripts
get clean text. Two environment variables override that:

| Variable | Effect |
| --- | --- |
| `NO_COLOR` | Never colour, whatever else is set |
| `TP_COLOR=always` | Colour even through a pipe, for `tp ls \| less -R` |
| `TP_COLOR=never` | Never colour |

`blocked` is the one worth acting on, and it is reported rather than guessed. Pi
emits no event when a prompt opens, and from outside a blocked session looks
exactly like a busy one — both are a tool that started and has not ended. So a
40-second compile cannot be told from a 40-second wait by timing alone. Instead
the `ask` tool is known to block by definition, and `command-guard` marks its own
prompts while they are open. Everything else is reported as the tool it is.

State comes from more tmux pane options that Pi publishes, read in the same
single call: `@pi_state`, `@pi_tool`, `@pi_state_since`, `@pi_ctx_pct`, and
`@pi_model`. Publishing them is `@caair/pi-caair-dev-tools`' job.

A state is only shown while the publishing process is alive, checked exactly as
the id is. A `SIGKILL`ed Pi leaves its last state on the pane forever, and a
listing claiming `thinking` for a process that no longer exists would be worse
than showing nothing.

That check needs the id and pid, so a session running `command-guard` **without**
`@caair/pi-caair-dev-tools` shows no state at all — the guard publishes
`blocked`, but nothing published an identity to verify it against. Install both
to see state; installing only the guard changes nothing about how tp behaves
today.

Fields are dropped from the right when the terminal is too narrow, so the state
survives and the model is the first thing to go.

The listing truncates to 13 characters. Pi session ids are UUIDv7, whose leading hex digits are a millisecond timestamp rather than randomness — 8 characters is only a 65-second window, so sessions started together in that window share it. Thirteen characters reaches past the timestamp into the random block.

For the exact, untruncated id, use `tp sid`:

```fish
tp sid 2      # 019ff650-ac6d-7641-bb90-4475b973cc82
```

It exits non-zero when that session is not running Pi.

### Restart and resume a Pi session

`--restart` stops the Pi running in a session and starts a fresh one that resumes the same conversation:

```fish
tp 2 --restart          # by project session number
tp global 3 --restart   # by global list index
```

Use it when Pi itself needs restarting — after upgrading it, or when a session is wedged — without losing the conversation.

What it does:

1. Reads the session id the running Pi published.
2. Sends `SIGTERM`, Pi's documented shutdown path, and waits up to five seconds for it to flush its session log and exit. If it outlives that, ending the tmux session takes it down.
3. Finds the exact saved session file and rebuilds the original command recorded in `TP_CMD`, dropping `--resume`, `--continue`, and any previous `--session`, then appending `--session <path>`. Other flags such as `--model` and `--thinking` are kept. The lookup includes first-level session directories such as `sessions/forks`, which Pi APIs can use for a live conversation.
4. Recreates the tmux session with the same name, number, label, and working directory, and attaches to it.

The conversation is restored from the session log, so the new Pi keeps the full history and the same session id. It is a new process with a new context window, not a live migration: work that was in flight when it was stopped is not resumed.

`--restart` refuses, and changes nothing, when:

- the target session is not running a live Pi — a plain shell session, or one whose Pi was killed outright and left only a stale id; or
- that Pi has no saved conversation yet. Pi publishes its session id at startup but does not write the session log until the first message, so restarting a session you have not spoken to would resume an id that does not resolve. Nothing is killed in that case.

### SSH origin metadata

Before an outside client attaches, `tp` records the first whitespace-delimited field of that shell's `SSH_CONNECTION` in a server-wide tmux user option keyed by the attaching TTY:

```text
@tp_ssh_source_<sanitized-client-tty> = v1 ip=<source-ip> created=<client_created>
```

For example, `/dev/pts/7` uses `@tp_ssh_source_dev_pts_7`, while `/dev/ttys003` uses `@tp_ssh_source_dev_ttys003`. `tp` trims the full TTY, rejects empty values, control characters, and values longer than 255 characters, replaces each run outside `[A-Za-z0-9]` with `_`, trims leading and trailing `_`, and rejects an empty result.

The attaching client does not exist until `attach-session` starts. For valid SSH metadata, `tp` therefore clears the mapping, installs a one-shot `client-attached` hook, and lets that hook stamp the real `#{client_created}`. The hook also checks the attaching TTY and clears its temporary values. If the hook cannot obtain a valid creation value, the mapping remains clear. Missing or invalid SSH metadata clears the exact mapping. A bare source IP was unsafe because a TTY is reused and the server-global option outlives its client: a later plain `tmux attach` could otherwise present the previous client's source. Consumers must compare `created` with the currently attached client's `#{client_created}` and refuse a mismatch.

When `tp` switches sessions from inside tmux, it reads and preserves the current `#{client_tty}` mapping instead of using the pane's potentially stale `SSH_CONNECTION`. The stored source is only a token from SSH connection metadata; a consumer must validate it as an IP address. The consumer's `created` comparison is what makes a stale record harmless when a TTY is reused.

Known limitations are owner PID reuse and hook-slot reservation. If the original owner PID is recycled before the hook fires, `kill -0` alone cannot distinguish the unrelated process. The primary hook slot uses the Fish PID, but the random fallback has a check-then-set race between concurrent processes. `tp` narrows these windows; the lifecycle-bound `created` comparison remains the protection against stale records. `tp` does not enumerate stale mappings and does not depend on Pi or Tailscale.

## How project names work

The project name is the basename of the current working directory, with leading dots removed. Session names use this form:

```text
<project>_<number>
```

Numbers are padded to three digits (`001`, `002`, …) and are sorted numerically.

## Development

Check Fish syntax and run the tests:

```fish
fish -n functions/*.fish completions/*.fish tests/*.fish
fish tests/test_tp.fish
fish tests/test_tp_shot.fish
```

## License

[MIT](LICENSE)
