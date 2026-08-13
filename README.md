# tp

`tp` is a standalone, project-oriented tmux session manager. It gives each
working directory a predictable set of numbered tmux sessions, so you can
create, attach, label, list, and remove project terminals quickly. It is a
Bun binary: **Fish is not required**. `tp new` runs commands with `$SHELL` by
default.

A project named `website` gets sessions such as `website_001` and
`website_002`. Numbers are sorted numerically and padded to three digits.

## Requirements

- [Bun](https://bun.sh/), version 1.1 or newer
- [tmux](https://github.com/tmux/tmux), version 3.2 or newer
- Optional: [cmux](https://github.com/manaflow-ai/cmux) with socket automation
- Optional: [Tailscale](https://tailscale.com/) for SSH-origin names
- macOS, SSH access, and a notification tool for `tp-shot`

## Install

The v0.2 install is from a clone. Install Bun first, then:

```sh
git clone https://github.com/chrisgoddard/tp.git
cd tp
bun install && bun link
```

This links both `tp` and `tp-shot` into your Bun bin directory. Publishing an
npm package is planned; it is not available yet.

Check the installation with:

```sh
tp version
tp doctor
```

## Command reference

The complete `tp help` command list is below. Aliases are shown in parentheses.

| Command | Purpose |
| --- | --- |
| `tp new` (`n`) | Create the next numbered project session |
| `tp pi` (`p`) | Create a session and run Pi |
| `tp last` (`l`, `-`) | Attach to the last project session |
| `tp ls` (`list`) | List sessions for the current project |
| `tp kill` (`k`) | Kill one or all project sessions |
| `tp name` | Set a session label |
| `tp sid` | Print a Pi session id |
| `tp shot` | Find uploaded screenshots |
| `tp global` (`g`) | List or attach to sessions across projects |
| `tp all` (`a`) | List every tmux session |
| `tp cmux` (`c`) | Open or focus sessions in cmux |
| `tp w` | Watch sessions live |
| `tp b` | Attach to a blocked session |
| `tp status` | Show session status counts |
| `tp origin` | Show the current SSH origin |
| `tp doctor` | Check the tp environment |
| `tp update` | Update tp from its git clone |
| `tp bind` | Install tp tmux bindings |
| `tp pop` | Open the session picker |
| `tp restore` | Restore sessions after reboot |
| `tp completions` | Print a shell completion shim |
| `tp help` | Show help |
| `tp version` | Show the version |

Every command accepts `-h` or `--help` where its help text lists that option.
The command resolver tries an exact command or alias, a session number, and then
a unique label prefix. A label that has the same name as a command cannot be
reached by that name.

### Create and attach

```sh
tp
tp new
tp new --name server npm run dev
tp new --layout dev
tp pi
tp pi --name auth --model sonnet:high
tp 2
tp 2 --restart
tp project-api
tp last
```

`tp` attaches to the first project session and creates `001` when needed.
`tp new` creates the next session. Arguments after `new` run under `$SHELL`;
set `TP_SHELL` or `shell` in the config to use another shell. `tp pi` runs Pi;
`--name`/`-n` labels both the tmux and Pi sessions, and
`--update-first`/`-uf` runs `pi update --all` before launch. Other `pi`
arguments keep their original boundaries. Use `--` when an argument must go
only to Pi.

A number attaches to that project session, creating it if it does not exist.
A label attaches by exact or unique prefix. `--restart` stops a live Pi and
starts it with the same conversation. It refuses to act when there is no live
Pi or no saved conversation.

### List, label, and kill

```sh
tp ls
tp ls --json
tp name 2 api-work
tp sid
tp sid 2
tp kill 2
tp kill --force
tp shot
tp shot list 5
tp shot dir
tp global
tp g work
tp g work 2
tp g 3
tp g --recent
tp g --json
tp all
```

`tp name <number> <label>` sets or replaces a label. `tp sid` with no number
uses the current pane when inside a tp session. It exits nonzero if no Pi id is
available. Bare `tp kill` asks `y/N` on a terminal. Use `--force`/`-f` for
non-interactive use; a non-TTY invocation without it is a usage error.

`tp shot` prints the newest image path. `tp shot list [count]` lists images
(the default count is 10), and `tp shot dir` prints the directory. The
screenshot directory is the configured remote directory or
`~/.cache/pi/screenshots`.

`tp global` is also `tp g`. A non-numeric first argument filters by project
prefix; a second number selects within that filtered list. An all-digit
argument is always a global list index. `--recent` sorts by tmux activity and
`--json` emits the listing schema described below. `tp ls --json` emits the
same schema for the current project. JSON is uncolored and goes to stdout.

`tp cmux` is also `tp c`. With no selector it lists tp sessions and their cmux
state; a number selects a global item, a project prefix selects matching
sessions, and `all` opens every tp session. cmux socket automation must be
enabled first (see below).

```sh
tp cmux
tp cmux 3
tp cmux website
tp cmux all
```

### Watch, attach, and status

```sh
tp w
tp w --global
tp g --watch
tp b
tp b --global
tp status
tp status --global
tp status --tmux -g
tp status --json
```

`tp w` refreshes the current-project listing every two seconds until a key is
pressed. `tp g -w` watches all projects. Both need a terminal. `tp b` attaches
to the only blocked session, lists blocked sessions and exits 1 when there are
several, and exits 1 with `nothing blocked` when there are none.

`tp status` prints counts such as `2 blocked · 3 busy · 4 idle`. `-g` includes
all projects. `--tmux` prints a status-line segment with tmux color formats;
`--json` prints `{blocked,busy,idle,total}`.

### Origin, diagnostics, and maintenance

```sh
tp origin
tp origin --json
tp doctor
tp doctor --json
tp update --check
tp update
tp bind --print
tp bind
tp pop
tp restore --list
tp restore --project website
tp restore
```

`tp origin` reports the current, verified SSH origin. When Tailscale whois
resolves it, the output includes hostname and user; `--json` returns
`hostname`, `user`, `ip`, and `createdFresh`. `tp doctor` runs environment
checks and returns nonzero when a required check fails. `--json` returns the 11
checks with `id`, `status` (`pass`, `fail`, or `skip`), and `detail`.

`tp update` is for a clean git-clone install with an upstream branch. It runs a
fast-forward-only pull and installs dependencies; `--check` only compares the
clone with its upstream. `tp bind` writes
`~/.config/tp/tmux.conf` (or the equivalent XDG path), prints it, and prints a
`source-file` command. `--print` prints the generated config without writing.

`tp pop` opens a tmux `display-popup` session picker when called inside tmux;
its picker supports filtering, arrow keys, Ctrl-N/Ctrl-P, Enter, and Escape or
`q`. It needs tmux 3.2 or newer. `tp restore` reads the saved snapshot, skips
sessions that already exist, and resumes Pi conversations when their session
files are available. `--list` prints the saved JSON records and `--project`
filters them.

## Shell completions

The generated shims call the hidden `tp __complete` protocol. Install one for
your shell:

### Fish

Source it for the current shell:

```fish
tp completions fish | source
```

Install it for future shells:

```fish
tp completions fish > ~/.config/fish/completions/tp.fish
```

### Bash

```sh
tp completions bash >> ~/.bash_completion
```

Start a new Bash shell or source `~/.bash_completion`.

### Zsh

```sh
mkdir -p ~/.zsh/completions
tp completions zsh > ~/.zsh/completions/_tp
```

Add `~/.zsh/completions` to `fpath` before compinit, then start a new Zsh
shell or run `autoload -Uz compinit && compinit`.

The shim also supplies static `tp-shot` flags in Fish. The hidden
`tp __complete` command is internal and is not part of the public command list.

## tmux status line and bindings

Add the status segment to tmux's `status-right`:

```sh
tp status --tmux -g
```

For example, this tmux setting runs the command when tmux redraws the status:

```tmux
set -g status-right '#(tp status --tmux -g)'
```

Install tp's bindings and source the generated file:

```sh
tp bind
```

Then run the printed `source-file ~/.config/tp/tmux.conf` command (or source
the path it prints when `XDG_CONFIG_HOME` is set). The generated bindings are:

- `prefix T` opens `tp pop` in a popup.
- `prefix B` runs `tp b -g` to attach a blocked session.
- Window status formats show Pi blocked, tool, thinking, and idle markers.

## Configuration

The configuration file is `~/.config/tp/config.toml`, or
`$XDG_CONFIG_HOME/tp/config.toml` when `XDG_CONFIG_HOME` is set. Precedence is
**flag > environment > file > default**. Unknown keys are warned about.

### Environment variables

| Variable | Meaning |
| --- | --- |
| `TP_SHELL` | Shell for commands passed to `tp new`. |
| `TP_COLOR` | `always`, `never`, or `auto`; `NO_COLOR` overrides it. |
| `NO_COLOR` | Disable color for all output. |
| `TP_TMUX_SOCKET` | Use the named tmux socket; useful for isolated test servers. |
| `TP_SHOT_HOST` | SSH host or alias for `tp-shot` (default `good-studio`). |
| `TP_SHOT_REMOTE_DIR` | Remote Pi-host directory for screenshots. It must be absolute for async uploads. |
| `TP_SHOT_NOTIFIER` | `auto`, `terminal-notifier`, `osascript`, or `none`. |
| `TP_SHOT_TRANSPORT` | `ssh` or `taildrive`. |
| `TP_SHOT_DIR` | Override the directory searched by `tp shot`. |
| `TP_SHOT_LOG_DIR` | Override the local directory for async `tp-shot` logs. |
| `TP_UPDATE_ROOT` | Override the clone root used by `tp update`. |

`TP_COLOR=always` forces colors through a pipe; `TP_COLOR=never` disables
colors. The precedence is `NO_COLOR`, then `TP_COLOR`, then terminal
 detection.

### `config.toml`

| Key | Type and meaning |
| --- | --- |
| `shell` | String. Shell for `tp new`; defaults to `$SHELL`, then `fish`. |
| `color` | String. `auto`, `always`, or `never`. |
| `shot.host` | String. SSH host or alias. |
| `shot.remote_dir` | String. Remote Pi-host screenshot directory. `~` and `~/...` are expanded. |
| `shot.taildrive_dir` | String. Locally mounted Taildrive share directory; required for `taildrive`. |
| `shot.notifier` | String. `auto`, `terminal-notifier`, `osascript`, or `none`. |
| `shot.transport` | String. `ssh` (default) or `taildrive`. |
| `layouts.<name>.windows` | Array of window tables. A layout must contain this array. |
| `layouts.<name>.windows[].name` | String. Required window or pane name. |
| `layouts.<name>.windows[].cmd` | String, optional. Command run by the configured shell. |
| `layouts.<name>.windows[].split` | `"h"` or `"v"`, optional. Split the previous window's pane; the first entry cannot split. |

Example:

```toml
shell = "/bin/zsh"
color = "auto"

[shot]
host = "good-studio"
remote_dir = "/home/pi/.cache/pi/screenshots"
transport = "ssh"
notifier = "auto"

[layouts.dev]
windows = [
  { name = "edit", cmd = "vim" },
  { name = "server", cmd = "bun run dev" },
  { name = "logs", split = "h", cmd = "tail -f app.log" },
]
```

## cmux integration

`tp cmux` uses cmux socket automation. Enable **Socket Control Mode →
Automation** in cmux settings. `tp` talks to the socket directly; **jq is not
required**.

## Migration from Fisher

The old Fish plugin is frozen in [`legacy/`](legacy/). It is retained as a
parity reference and will be removed after v0.2 ships.

Remove the plugin before installing the standalone binary:

```fish
fisher remove chrisgoddard/tp
```

Then install Bun and follow the clone installation above. Do not link the old
`functions/` or `completions/` files into your Fish configuration. The new
`tp` and `tp-shot` executables work from Fish, Bash, Zsh, or another supported
shell.

## tp-shot: direct-binary screenshot uploads

`tp-shot` captures a macOS interactive screenshot, uploads it, and copies the
remote path to the clipboard. SSH is the default transport. Synchronous mode
waits for the upload:

```sh
tp-shot
tp-shot ~/Desktop/Screenshot.png
```

Async mode copies a reserved path immediately and uploads in a detached worker:

```sh
tp-shot --async
tp-shot --async ~/Desktop/Screenshot.png
tp-shot --notify-test
```

Use `--host HOST` to override the SSH host and `--transport ssh|taildrive` to
choose a transport. Files are private and are published only after the upload
is complete. Async logs are under `~/.cache/tp-shot/` unless
`TP_SHOT_LOG_DIR` is set. Notifications use `terminal-notifier` when available
and fall back to `osascript`; `TP_SHOT_NOTIFIER=none` disables them.

### macOS Shortcuts

For a keyboard shortcut, create a macOS Shortcut with **Run Shell Script** and
call the installed binary directly:

```sh
tp-shot --async
```

Do not invoke `fish -lc`; no shell plugin is needed. Enable **Use as Quick
Action**, assign a shortcut, and allow screen-capture permission. Set up
key-based or Tailscale SSH access first because the uploader is non-interactive.

### SSH setup

The default host is `good-studio`. Override it in the environment or config:

```sh
export TP_SHOT_HOST=good-studio
ssh good-studio true
tp-shot --notify-test
```

For async mode, the laptop's `TP_SHOT_REMOTE_DIR` must be the same absolute
Pi-host directory that Pi reads. `tp-shot` copies that remote path, not a local
path. The normal screenshot shortcut remains unchanged.

### Taildrive setup

The Tailscale bridge mounts a Taildrive share on the capture Mac. Follow the
[pi-caair-dev-tools tailscale-bridge documentation](https://gitlab.intel.com/pi/pi-caair-dev-tools/-/merge_requests/64)
to install and mount that share on both computers.

Configure the local mounted directory and the path as seen by the Pi host:

```toml
[shot]
transport = "taildrive"
taildrive_dir = "/Volumes/taildrive/pi-screenshots"
remote_dir = "/home/pi/.cache/pi/screenshots"
```

`shot.taildrive_dir` is required and must already be a mounted directory.
`shot.remote_dir` must name the corresponding directory on the Pi host. The
clipboard receives `remote_dir`, never the Mac's `/Volumes/...` path. The
transport uses a private temporary file and an atomic rename, and it never
silently falls back to SSH. Run `tp doctor` to check the mount on macOS.

## Interoperability protocols

These sections describe data exchanged with tmux and
`@caair/pi-caair-dev-tools`. `tp` reads these options; it does not publish
Pi's pane options itself.

### Pi pane options

Pi publishes these options on its active pane:

| Option | Meaning |
| --- | --- |
| `@pi_session_id` | Full Pi session id. |
| `@pi_pid` | Pi process id used for liveness. |
| `@pi_state` | `blocked`, `tool`, `thinking`, or `idle`. |
| `@pi_tool` | Name of the running tool, when there is one. |
| `@pi_state_since` | State start timestamp. |
| `@pi_ctx_pct` | Context window percentage. |
| `@pi_model` | Model name. |

`tp` reads all seven in one `tmux list-sessions` call. It shows an id or state
only while the published pid is alive, checked with `ps -p` rather than
`kill -0`. A pane option without a pid is shown because there is no liveness
signal to disprove it. Listings truncate ids to 13 characters; use `tp sid` for
the full id. The Pi tooling publishes and clears these options.

### Session state

Listings show the state marker, state duration, context percentage, and model:

```text
001  →  demo_001 [issue filer] pi:019ff650-ac6d · ⏸ blocked:bash 3m · 24% · gpt-5.6-sol
002  →  demo_002 [api work]    pi:019ff3d2-4dea · ● tool:read 4s · 61% · gpt-5.6-sol
003  →  demo_003              pi:019ff69e-6014 · ○ idle 2h · 8% · claude-opus-4-8
```

| Marker | State | Color | Meaning |
| --- | --- | --- | --- |
| `⏸` | `blocked` | yellow | Waiting for you: a guard prompt or question. |
| `●` | `tool` | cyan | Running the named tool. |
| `●` | `thinking` | blue | Working between tools. |
| `○` | `idle` | grey | Waiting for your next message. |

A state is reported only while its publishing Pi process is alive. A session
running `command-guard` without the Pi tooling therefore shows no state.
Labels are green, ids and models are grey, and `(attached)` is magenta. Context
is amber at 70% and red at 85%. Color is disabled for non-terminals unless
forced by `TP_COLOR=always`.

### SSH origin contract

Before an outside client attaches, `tp` records the first whitespace-delimited
field of `SSH_CONNECTION` in a server-wide tmux option:

```text
@tp_ssh_source_<sanitized-client-tty> = v1 ip=<source-ip> created=<client_created>
```

The TTY is trimmed; empty, control-character, and over-255-character values
are rejected. Runs outside `[A-Za-z0-9]` become `_`, leading and trailing `_`
are removed, and an empty result is rejected. For valid metadata, `tp` clears
the mapping, installs a one-shot `client-attached` hook, and stamps the real
`#{client_created}`. The hook verifies the TTY and clears temporary values.
Missing or invalid SSH metadata clears the exact mapping.

When `tp` switches sessions inside tmux, it preserves the current client's
mapping instead of trusting a pane's possibly stale `SSH_CONNECTION`. The
stored source is a token until a consumer validates it as an IP address.
Consumers must compare `created` to the currently attached client's
`#{client_created}` and reject a mismatch. This lifecycle check protects
against TTY reuse and stale server-global options. The hook has narrow owner-PID
reuse and concurrent fallback-slot race windows; the lifecycle comparison is
the stale-record protection.

## Session names and state files

The project is the basename of the current directory with leading dots
removed. Session names are `<project>_<NNN>`. `tp restore` stores snapshots at
`$XDG_STATE_HOME/tp/sessions.json`, or `~/.local/state/tp/sessions.json` by
default. Records include the session, project, number, label, working
 directory, recorded `TP_CMD`, Pi session id, and update time.

## License

[MIT](LICENSE)
