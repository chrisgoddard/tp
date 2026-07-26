# tp

`tp` is a project-oriented tmux session manager for the [Fish shell](https://fishshell.com/). It gives each directory a predictable set of numbered tmux sessions, making it quick to create, switch, list, label, and remove project terminals.

Sessions are named from the current directory and a zero-padded number. Running `tp` from a directory named `website`, for example, creates or attaches to `website_001`.

## Requirements

- [Fish](https://fishshell.com/)
- [tmux](https://github.com/tmux/tmux)
- Optional: [cmux](https://github.com/manaflow-ai/cmux) and [`jq`](https://jqlang.github.io/jq/) for the `tp cmux` integration

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

### Manual installation

Copy the function and completion files into your Fish configuration:

```fish
git clone https://github.com/chrisgoddard/tp.git /tmp/tp
cp /tmp/tp/functions/tp.fish ~/.config/fish/functions/
cp /tmp/tp/completions/tp.fish ~/.config/fish/completions/
rm -rf /tmp/tp
```

Start a new Fish shell after installing.

## Usage

```text
tp                            Attach to the first project session, or create 001
tp new                        Create and attach to the next numbered session
tp new --name api             Create the next session and label it "api"
tp new command arguments      Create a session that runs a command
tp 2                          Attach to session 002, creating it if needed
tp last                       Attach to the highest-numbered project session
tp ls                         List sessions for the current project
tp name 2 api                 Set or replace the label on session 002
tp kill 2                     Kill project session 002
tp kill                       Kill every session for the current project
tp global                     List tp sessions across all projects
tp global 3                   Attach to item 3 in the global list
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

### cmux integration

`tp cmux` maps tp-managed tmux sessions to cmux workspaces. It requires cmux socket automation to be enabled:

1. Open cmux settings.
2. Go to **Automation**.
3. Enable **Socket Control Mode → Automation**.

`jq` is used to identify an already-open workspace. Without it, `tp` cannot reliably detect and focus existing tp workspaces.

## How project names work

The project name is the basename of the current working directory, with leading dots removed. Session names use this form:

```text
<project>_<number>
```

Numbers are padded to three digits (`001`, `002`, …) and are sorted numerically.

## Development

Check Fish syntax and run the tmux-backed tests:

```fish
fish -n functions/tp.fish completions/tp.fish tests/test_tp.fish
fish tests/test_tp.fish
```

## License

[MIT](LICENSE)
