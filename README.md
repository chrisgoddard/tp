# tp

`tp` is a project-oriented tmux session manager for the [Fish shell](https://fishshell.com/). It gives each directory a predictable set of numbered tmux sessions, making it quick to create, switch, list, label, and remove project terminals.

Sessions are named from the current directory and a zero-padded number. Running `tp` from a directory named `website`, for example, creates or attaches to `website_001`.

## Requirements

- [Fish](https://fishshell.com/)
- [tmux](https://github.com/tmux/tmux)
- Optional: [cmux](https://github.com/manaflow-ai/cmux) and [`jq`](https://jqlang.github.io/jq/) for the `tp cmux` integration
- For screenshot sharing: a macOS capture computer with `ssh` access to the remote computer

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
tp 2                          Attach to session 002, creating it if needed
tp last                       Attach to the highest-numbered project session
tp ls                         List sessions for the current project
tp name 2 api                 Set or replace the label on session 002
tp kill 2                     Kill project session 002
tp kill                       Kill every session for the current project
tp shot                       Print the newest uploaded screenshot path
tp shot list 5                Print the five newest screenshot paths
tp shot dir                   Print the screenshot upload directory
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

## Share laptop screenshots with a remote Pi session

`tp-shot` solves the local-path problem in remote sessions. It uses the same macOS interactive capture interface as the normal screenshot keys, then:

1. Uploads the PNG over SSH to `~/.cache/pi/screenshots/` on the remote computer. The directory and image are restricted to the remote account.
2. Copies text such as `Please inspect this screenshot: /Users/me/.cache/pi/screenshots/tp-shot-….png` to the laptop clipboard.
3. Shows a macOS notification when the upload is ready.

Paste into Pi with Command-V. Pi receives a path on the computer where it is running, so it can read the image directly.

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

Then test the complete flow from a laptop terminal:

```fish
tp-shot
```

Select a region or window. After the notification appears, paste into Pi. To upload an image created with the ordinary screenshot keys instead, pass its local path:

```fish
tp-shot ~/Desktop/Screenshot.png
```

Use `tp shot` on the remote computer if you lose the copied path. `tp shot list` shows the ten most recent uploads.

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
   /opt/homebrew/bin/fish -lc 'tp-shot'
   ```

   Intel Homebrew commonly uses `/usr/local/bin/fish`; other installations may differ.

5. Open the shortcut details, enable **Use as Quick Action**, and add a keyboard shortcut such as Control-Option-Command-4.
6. Run it once and approve any macOS screen-capture permission request.

The shortcut opens the normal macOS crosshair. The only difference comes after selection: the image goes to the remote Pi computer and the paste-ready remote path goes to the laptop clipboard.

The helper uses non-interactive SSH when launched, so it fails instead of leaving an invisible password prompt open. Configure key-based or Tailscale SSH access before using the keyboard shortcut.

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

Check Fish syntax and run the tests:

```fish
fish -n functions/*.fish completions/*.fish tests/*.fish
fish tests/test_tp.fish
fish tests/test_tp_shot.fish
```

## License

[MIT](LICENSE)
