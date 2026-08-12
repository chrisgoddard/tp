function tp --description "Manage tmux sessions for the current project directory"
    set -l project (basename (pwd) | string trim -l -c '.')
    set -l cmd $argv[1]

    # Decide colour once, here. `isatty stdout` is only truthful at the top
    # level: every listing line is built inside a command substitution, and a
    # substitution's stdout is a pipe even when the terminal is a tty, so a
    # check further down would disable colour permanently. `set_color` writes
    # its escapes unconditionally, so nothing else suppresses them for `tp ls |
    # cat`.
    _tp_set_colour_enabled

    if test -z "$cmd"
        set -l existing (_tp_list_sessions $project)
        if test (count $existing) -eq 0
            set -l first (_tp_format_number 1)
            _tp_create $project $first
            _tp_attach "$project"_$first
        else
            _tp_attach $existing[1]
        end
        return
    end

    switch $cmd
        case new n
            set -l next (_tp_format_number (_tp_next_number $project))
            set -l name ""
            set -l rest $argv[2..]
            if test (count $rest) -ge 2; and test "$rest[1]" = "--name" -o "$rest[1]" = "-n"
                set name $rest[2]
                set rest $rest[3..]
            end
            if test (count $rest) -eq 0
                _tp_create $project $next
            else
                _tp_create $project $next $rest
            end
            if test -n "$name"
                _tp_set_session_name "$project"_"$next" "$name"
            end
            _tp_attach "$project"_"$next"

        case pi p
            _tp_pi "$project" $argv[2..]

        case ls list
            set -l existing (_tp_list_sessions $project)
            if test (count $existing) -eq 0
                echo "No tmux sessions for '$project'"
                return 1
            end
            echo "Sessions for '$project':"
            _tp_load_session_metadata
            for s in $existing
                set -l num (string replace -- "$project"_ "" $s)
                echo "  $num  →  $s"(_tp_session_suffix $s)
            end

        case kill k
            if set -q argv[2]
                set -l target "$project"_(_tp_format_number "$argv[2]")
                if tmux has-session -t "=$target" 2>/dev/null
                    tmux kill-session -t "=$target"
                    echo "Killed $target"
                else
                    echo "No session '$target'"
                    return 1
                end
            else
                set -l existing (_tp_list_sessions $project)
                if test (count $existing) -eq 0
                    echo "No sessions to kill for '$project'"
                    return 1
                end
                for s in $existing
                    tmux kill-session -t "=$s"
                    echo "Killed $s"
                end
            end

        case last l -
            set -l existing (_tp_list_sessions $project)
            if test (count $existing) -eq 0
                set -l first (_tp_format_number 1)
                echo "No tmux sessions for '$project'. Creating _$first..."
                _tp_create $project $first
                _tp_attach "$project"_$first
                return
            end
            # _tp_list_sessions is sorted ascending by number → last is highest
            _tp_attach $existing[-1]

        case shot
            _tp_shot $argv[2..]

        case cmux c
            _tp_cmux $argv[2..]

        case global g
            set -l sessions (_tp_list_global)
            if test (count $sessions) -eq 0
                echo "No tp sessions"
                return 1
            end
            # tp g <index> → attach to that global session
            if set -q argv[2]
                set -l rest $argv[2..]
                set -l restart 0
                if set -l restart_index (contains --index -- --restart $rest)
                    set restart 1
                    set -e rest[$restart_index]
                end
                set -l idx $rest[1]
                if test (count $rest) -ne 1; or not string match -qr '^\d+$' -- "$idx"
                    echo "Usage: tp global [<index>] [--restart]"
                    return 1
                end
                if test $idx -lt 1 -o $idx -gt (count $sessions)
                    echo "Index out of range (1-"(count $sessions)")"
                    return 1
                end
                if test "$restart" -eq 1
                    _tp_restart_session $sessions[$idx]
                    or return 1
                end
                _tp_attach $sessions[$idx]
                return
            end
            echo "All tp sessions:"
            _tp_load_session_metadata
            set -l i 1
            for s in $sessions
                printf '  %2d  →  %s%s\n' $i $s (_tp_session_suffix $s)
                set i (math $i + 1)
            end
            echo ""
            echo "Attach with: tp g <index>"

        case all a
            set -l sessions (tmux list-sessions -F '#{session_name}' 2>/dev/null)
            if test (count $sessions) -eq 0
                echo "No tmux sessions"
                return 1
            end
            _tp_load_session_metadata
            for s in $sessions
                echo "  $s"(_tp_session_suffix $s)
            end

        case sid
            if test (count $argv) -ne 2
                echo "Usage: tp sid <n>" >&2
                return 2
            end
            set -l target "$project"_(_tp_format_number "$argv[2]")
            or begin
                echo "Usage: tp sid <n>" >&2
                return 2
            end
            if not tmux has-session -t "=$target" 2>/dev/null
                echo "No session '$target'" >&2
                return 1
            end
            _tp_load_session_metadata
            set -l session_id (_tp_pi_session_id "$target")
            or begin
                echo "No live Pi session in '$target'" >&2
                return 1
            end
            printf '%s\n' "$session_id"

        case name
            if test (count $argv) -lt 3
                echo "Usage: tp name <n> <label>"
                return 1
            end
            set -l target "$project"_(_tp_format_number "$argv[2]")
            if not tmux has-session -t "=$target" 2>/dev/null
                echo "No session '$target'"
                return 1
            end
            _tp_set_session_name "$target" "$argv[3]"
            tmux set-option -t "$target" set-titles on
            tmux set-option -t "$target" set-titles-string '#{?@tp_name,#T · #{@tp_name},#T}'
            echo "Named $target → $argv[3]"

        case '*'
            if string match -qr '^\d+$' $cmd
                set -l id (_tp_format_number "$cmd")
                set -l target "$project"_$id
                set -l rest $argv[2..]
                set -l restart 0
                if set -l restart_index (contains --index -- --restart $rest)
                    set restart 1
                    set -e rest[$restart_index]
                end
                if test (count $rest) -gt 0
                    echo "Usage: tp <n> [--restart]" >&2
                    return 2
                end
                if tmux has-session -t "=$target" 2>/dev/null
                    if test "$restart" -eq 1
                        _tp_restart_session "$target"
                        or return 1
                    end
                    _tp_attach $target
                else if test "$restart" -eq 1
                    echo "No session '$target' to restart" >&2
                    return 1
                else
                    echo "Session '$target' doesn't exist. Creating it..."
                    _tp_create $project $id
                    _tp_attach $target
                end
            else
                echo "Usage: tp [new [-n name] [cmd...]|pi [-n name] [-uf] [pi-args...]|ls|last|kill [n]|name <n> <label>|sid <n>|shot [latest|list [n]|dir]|global [i]|cmux [i|prefix|all]|all|<number> [--restart]]"
                echo ""
                echo "  tp                       Attach to first session (or create _1)"
                echo "  tp new [-n name] [cmd..] Create next numbered session"
                echo "  tp pi [-n name] [-uf]    Create the next session running Pi (alias: p)"
                echo "  tp name <n> <label>      Set/update a session's name"
                echo "  tp sid <n>               Print the full Pi session id running in session _n"
                echo "  tp <n>                   Attach to session _n (creates if missing)"
                echo "  tp <n> --restart         Restart session _n's Pi, resuming its session"
                echo "  tp last                  Attach to last-created session here (alias: l, -)"
                echo "  tp ls                    List sessions for current project"
                echo "  tp kill                  Kill all project sessions"
                echo "  tp kill <n>              Kill session _n"
                echo "  tp shot                  Print the newest uploaded screenshot path"
                echo "  tp shot list [n]         List the newest screenshot paths (default: 10)"
                echo "  tp shot dir              Print the screenshot upload directory"
                echo "  tp global                List all tp sessions everywhere (alias: g)"
                echo "  tp global <i>            Attach to global tp session by index"
                echo "  tp global <i> --restart  Restart that session's Pi, resuming its session"
                echo "  tp cmux                  List global sessions and cmux state (alias: c)"
                echo "  tp cmux <i>              Open/focus global session <i> in cmux"
                echo "  tp cmux <prefix>         Open/focus sessions whose names start with prefix"
                echo "  tp cmux all              Open/focus every global session in cmux"
                echo "  tp all                   List all tmux sessions"
                return 1
            end
    end
end

function _tp_pi --description "Create a named tp session running Pi"
    set -l project $argv[1]
    set -e argv[1]

    set -l name ""
    set -l update_first 0
    set -l parse_options 1
    set -l pi_args

    while set -q argv[1]
        set -l argument $argv[1]
        set -e argv[1]

        if test "$parse_options" -eq 0
            set -a pi_args "$argument"
            continue
        end

        switch "$argument"
            case --
                set parse_options 0
            case --update-first -uf
                set update_first 1
            case --name -n
                if not set -q argv[1]
                    echo "Usage: tp pi [--name <name>] [--update-first] [--] [pi-args...]" >&2
                    return 2
                end
                set name $argv[1]
                set -e argv[1]
            case '--name=*'
                set name (string replace -- '--name=' '' "$argument")
            case '*'
                set -a pi_args "$argument"
        end
    end

    set -l next (_tp_format_number (_tp_next_number "$project"))
    set -l pi_command pi
    if test -n "$name"
        set -a pi_command --name "$name"
    end
    set -a pi_command $pi_args

    if test "$update_first" -eq 1
        # The extra Fish process sequences the update and Pi while preserving
        # every Pi argument as a distinct value in its own $argv.
        _tp_create "$project" "$next" fish -c 'pi update --all; and pi $argv' -- $pi_command[2..]
    else
        _tp_create "$project" "$next" $pi_command
    end

    set -l session_name "$project"_"$next"
    if test -n "$name"
        _tp_set_session_name "$session_name" "$name"
    end
    _tp_attach "$session_name"
end

function _tp_set_session_name --description "Set the human-readable label on a tp session"
    tmux set-option -t "$argv[1]" @tp_name "$argv[2]"
end

function _tp_shot --description "Find screenshots uploaded by tp-shot"
    set -l action $argv[1]

    switch "$action"
        case '' latest
            if test (count $argv) -gt 1
                echo "Usage: tp shot latest" >&2
                return 2
            end
            set -l shots (_tp_list_shots)
            if test (count $shots) -eq 0
                echo "No uploaded screenshots in "(_tp_shot_dir) >&2
                return 1
            end
            printf '%s\n' "$shots[1]"

        case list ls
            set -l limit 10
            if set -q argv[2]
                set limit (_tp_decimal_number "$argv[2]")
                or begin
                    echo "Usage: tp shot list [count]" >&2
                    return 2
                end
                if test (string length "$limit") -gt 6
                    echo "tp shot list: count is too large" >&2
                    return 2
                end
                if test "$limit" -lt 1
                    echo "tp shot list: count must be at least 1" >&2
                    return 2
                end
            end
            if test (count $argv) -gt 2
                echo "Usage: tp shot list [count]" >&2
                return 2
            end

            set -l shots (_tp_list_shots)
            if test (count $shots) -eq 0
                echo "No uploaded screenshots in "(_tp_shot_dir) >&2
                return 1
            end
            if test "$limit" -gt (count $shots)
                set limit (count $shots)
            end
            printf '%s\n' $shots[1..$limit]

        case dir
            if test (count $argv) -gt 1
                echo "Usage: tp shot dir" >&2
                return 2
            end
            _tp_shot_dir

        case '*'
            echo "Usage: tp shot [latest|list [count]|dir]" >&2
            return 2
    end
end

function _tp_shot_dir --description "Return the screenshot upload directory"
    if set -q TP_SHOT_DIR; and test -n "$TP_SHOT_DIR"
        printf '%s\n' "$TP_SHOT_DIR"
    else
        printf '%s\n' "$HOME/.cache/pi/screenshots"
    end
end

function _tp_list_shots --description "List uploaded screenshots newest first"
    set -l shot_dir (_tp_shot_dir)
    if not test -d "$shot_dir"
        return
    end

    for name in (command ls -1t "$shot_dir" 2>/dev/null)
        if string match -qir '\.(png|jpe?g|gif|webp|bmp)$' -- "$name"; and test -f "$shot_dir/$name"
            printf '%s/%s\n' "$shot_dir" "$name"
        end
    end
end

function _tp_cmux --description "Open tp-managed tmux sessions as cmux workspaces"
    if not command -q cmux
        echo "cmux is not installed or not on PATH"
        return 1
    end

    if not cmux ping >/dev/null 2>&1
        echo "Cannot connect to cmux. Run this inside a cmux terminal, or enable"
        echo "Settings → Automation → Socket Control Mode → Automation."
        return 1
    end

    set -l sessions (_tp_list_global)
    if test (count $sessions) -eq 0
        echo "No tp sessions"
        return 1
    end

    set -l selection $argv[1]
    if test -z "$selection"
        set -l workspaces_json (cmux workspace list --json 2>/dev/null | string collect)
        echo "All tp sessions:"
        set -l index 1
        for session in $sessions
            set -l state ""
            if test -n "$workspaces_json"; and _tp_cmux_workspace_ref "$session" "$workspaces_json" >/dev/null
                set state " (open in cmux)"
            end

            set -l label ""
            set -l raw_name (tmux show-option -t "$session" -v @tp_name 2>/dev/null)
            if test -n "$raw_name"
                set label " [$raw_name]"
            end

            printf '  %2d  →  %s%s%s\n' $index $session "$label" "$state"
            set index (math $index + 1)
        end
        echo ""
        echo "Open with: tp c <index|prefix>   Open all with: tp c all"
        return
    end

    if test "$selection" = all -o "$selection" = a
        set -l result 0
        for session in $sessions
            _tp_cmux_open "$session"
            or set result 1
        end
        return $result
    end

    if not string match -qr '^\d+$' "$selection"
        set -l matches
        set -l prefix_pattern '^'(string escape --style=regex "$selection")
        for session in $sessions
            if string match -qr "$prefix_pattern" "$session"
                set -a matches "$session"
            end
        end

        if test (count $matches) -eq 0
            echo "No tp sessions start with '$selection'"
            return 1
        end

        set -l result 0
        for session in $matches
            _tp_cmux_open "$session"
            or set result 1
        end
        return $result
    end

    if test "$selection" -lt 1 -o "$selection" -gt (count $sessions)
        echo "Index out of range (1-"(count $sessions)")"
        return 1
    end

    _tp_cmux_open "$sessions[$selection]"
end

function _tp_cmux_open --description "Open or focus one tmux session in cmux"
    set -l session $argv[1]
    set -l workspaces_json (cmux workspace list --json 2>/dev/null | string collect)
    set -l existing_ref (_tp_cmux_workspace_ref "$session" "$workspaces_json")

    if test -n "$existing_ref"
        cmux workspace select "$existing_ref" >/dev/null
        or begin
            echo "Failed to focus cmux workspace for '$session'"
            return 1
        end
        echo "Focused cmux workspace for $session"
        return
    end

    set -l cwd (tmux display-message -p -t "=$session" '#{pane_current_path}' 2>/dev/null)
    if test -z "$cwd"
        set cwd $HOME
    end

    set -l title "tp:$session"
    cmux workspace create \
        --name "$title" \
        --cwd "$cwd" \
        --env "TP_CMUX_SESSION=$session" \
        --command 'exec tmux attach-session -t "=$TP_CMUX_SESSION"' \
        >/dev/null
    or begin
        echo "Failed to create cmux workspace for '$session'"
        return 1
    end

    echo "Opened $session in cmux"
end

function _tp_cmux_workspace_ref --description "Find the cmux workspace for a tmux session"
    set -l session $argv[1]
    set -l workspaces_json $argv[2]
    if test -z "$workspaces_json"; or not command -q jq
        return 1
    end

    set -l title "tp:$session"
    set -l ref (printf '%s' "$workspaces_json" | jq -r --arg title "$title" '
        (if type == "array" then . else (.workspaces // .data // []) end)
        | .[]
        | select((.title // .name // "") == $title)
        | (.ref // .id // empty)
    ' 2>/dev/null | head -n 1)

    if test -z "$ref"
        return 1
    end

    printf '%s\n' "$ref"
end

function _tp_metadata_separator --description "Return the field separator used by tmux listing formats"
    # A tab cannot appear in a session name and is never produced by the numeric
    # fields, so only the trailing label can contain one. Splitting with a field
    # limit keeps such a label intact.
    printf '\t'
end

function _tp_load_session_metadata --description "Cache one tmux read of every session's tp and Pi metadata"
    set -l separator (_tp_metadata_separator)
    # @tp_name is last because it is the only free-form field: `string split -m`
    # stops splitting after the fixed fields, so a tab inside a label cannot
    # shift the columns after it.
    set -l format (string join -- "$separator" \
        '#{session_name}' '#{@pi_session_id}' '#{@pi_pid}' '#{session_attached}' \
        '#{@pi_state}' '#{@pi_tool}' '#{@pi_state_since}' '#{@pi_ctx_pct}' '#{@pi_model}' \
        '#{@tp_name}')

    # One call for the whole server: the @pi_* options are pane options, and a
    # pane option in a list-sessions format resolves against each session's
    # active pane. Pi writes them on the pane it runs in, so a tp session running
    # Pi answers here without a per-session lookup.
    set -g __tp_session_metadata (tmux list-sessions -F "$format" 2>/dev/null)
end

function _tp_metadata_fields --description "Split a metadata row into its fields"
    string split -m 9 -- (_tp_metadata_separator) "$argv[1]"
end

function _tp_format_duration --description "Render a second count as a compact age"
    set -l seconds $argv[1]

    if not string match -qr '^\d+$' -- "$seconds"
        return 1
    end
    if test "$seconds" -lt 60
        printf '%ds\n' "$seconds"
    else if test "$seconds" -lt 3600
        printf '%dm\n' (math --scale=0 "$seconds / 60")
    else if test "$seconds" -lt 86400
        printf '%dh\n' (math --scale=0 "$seconds / 3600")
    else
        printf '%dd\n' (math --scale=0 "$seconds / 86400")
    end
end

function _tp_pi_state_fields --description "Render state, tool, context and model as separate fields"
    # Printed one per line, most important first, so a caller can drop trailing
    # fields to fit the terminal without re-deciding what matters.
    set -l state (string trim -- "$argv[1]")
    set -l tool (string trim -- "$argv[2]")
    set -l since (string trim -- "$argv[3]")
    set -l ctx_pct (string trim -- "$argv[4]")
    set -l model (string trim -- "$argv[5]")

    if test -z "$state"
        return 1
    end

    # A marker gives the state a shape that reads at a glance down a column,
    # which matters most for the one state a user acts on: blocked. Colour says
    # the same thing again, so the meaning survives a monochrome terminal, a
    # pipe, and the ~8% of men with red-green colour blindness.
    set -l marker
    set -l colour
    switch $state
        case blocked
            # The only state that needs the user. Yellow reads as "your turn"
            # without the alarm of red, which is reserved for real failure.
            set marker ⏸
            set colour yellow
        case tool
            set marker ●
            set colour cyan
        case thinking
            set marker ●
            set colour blue
        case idle
            # Nothing to do here, so it should recede rather than compete.
            set marker ○
            set colour brblack
        case '*'
            set marker ·
            set colour normal
    end

    set -l elapsed
    if string match -qr '^\d+$' -- "$since"
        set -l age (math --scale=0 (date +%s) - "$since")
        if test "$age" -ge 0
            set elapsed (_tp_format_duration "$age")
        end
    end

    # The tool is named while one runs, and a blocked session names it too:
    # `blocked:bash` is a guard prompt, `blocked:ask` is a question. An idle or
    # thinking session has no tool, so a name surviving there is stale and would
    # read as nonsense (`idle:bash`).
    set -l headline "$marker $state"
    if test -n "$tool"; and contains -- "$state" tool blocked
        set headline "$headline:$tool"
    end
    if test -n "$elapsed"
        set headline "$headline $elapsed"
    end
    _tp_colour $colour "$headline"

    # Context usage is only worth a colour when it is worth acting on: a session
    # near its limit is about to compact. Below that it stays unremarkable.
    if string match -qr '^\d+$' -- "$ctx_pct"
        set -l ctx_colour brblack
        if test "$ctx_pct" -ge 85
            set ctx_colour red
        else if test "$ctx_pct" -ge 70
            set ctx_colour yellow
        end
        _tp_colour $ctx_colour "$ctx_pct%"
    end
    if test -n "$model"
        _tp_colour brblack "$model"
    end
end

function _tp_terminal_width --description "Return the usable terminal width"
    if set -q COLUMNS; and string match -qr '^\d+$' -- "$COLUMNS"
        printf '%s\n' "$COLUMNS"
        return 0
    end
    set -l width (tput cols 2>/dev/null)
    if string match -qr '^\d+$' -- "$width"
        printf '%s\n' "$width"
        return 0
    end
    # No terminal to measure (a pipe, or a test harness). Assume room for
    # everything rather than silently hiding fields.
    printf '%s\n' 1000
end

function _tp_fit_fields --description "Join as many fields as fit the given width"
    set -l width $argv[1]
    set -l used $argv[2]
    set -l fields $argv[3..]

    set -l out ""
    for field in $fields
        # " · " is three columns; stop at the first field that would overflow so
        # the fields stay in priority order rather than filling gaps out of turn.
        set -l candidate "$out · $field"
        # Measured on the visible text: a coloured field carries escape bytes
        # that occupy no columns, and counting them would drop fields that fit.
        if test (math "$used" + (_tp_visible_length "$candidate")) -gt "$width"
            break
        end
        set out "$candidate"
    end

    printf '%s\n' "$out"
end

function _tp_session_metadata_row --description "Return the cached metadata row for one session"
    set -l name $argv[1]
    set -l separator (_tp_metadata_separator)
    for row in $__tp_session_metadata
        if test (string split -m 1 -- "$separator" "$row")[1] = "$name"
            printf '%s\n' "$row"
            return 0
        end
    end
    return 1
end

set -g __tp_pi_id_display_length 13

# Room reserved for the part of a listing line this function never sees: the
# indent, the session number or index, and the session name. Measured against
# the longest real form (`   12  →  pi-caair-dev-tools_012`), rounded up.
set -g __tp_state_prefix_budget 34

function _tp_set_colour_enabled --description "Decide once whether listings may use colour"
    # Honour the two conventions a user already expects, then fall back to
    # whether this is a terminal at all.
    if set -q NO_COLOR
        set -g __tp_colour 0
        return 0
    end
    if set -q TP_COLOR
        # TP_COLOR=always keeps colour through a pipe, for `tp ls | less -R`.
        switch "$TP_COLOR"
            case always 1 yes true
                set -g __tp_colour 1
                return 0
            case never 0 no false
                set -g __tp_colour 0
                return 0
        end
    end
    if test "$TERM" = dumb
        set -g __tp_colour 0
        return 0
    end

    if isatty stdout
        set -g __tp_colour 1
    else
        set -g __tp_colour 0
    end
end

function _tp_colour --description "Wrap text in a colour when listings are coloured"
    set -l colour $argv[1]
    set -l text $argv[2..]

    if not set -q __tp_colour; or test "$__tp_colour" -ne 1
        printf '%s\n' "$text"
        return 0
    end

    printf '%s%s%s\n' (set_color $colour) "$text" (set_color normal)
end

function _tp_visible_length --description "Length of a string ignoring colour escapes"
    # `string length` counts the bytes of an escape sequence, which would make a
    # coloured field look far wider than it prints and drop fields that fit.
    string length -- (string replace -ra '\e\[[0-9;]*m' '' -- "$argv[1]")
end

function _tp_live_pi_identity --description "Return the Pi session id and pid when a live Pi published them"
    set -l session_id (string trim -- "$argv[1]")
    set -l pi_pid (string trim -- "$argv[2]")

    if test -z "$session_id"
        return 1
    end

    # Pi clears both options on shutdown, but a SIGKILLed Pi never gets to. The
    # published pid is the check that separates a live session from that residue.
    #
    # `ps -p`, not `kill -0`: `kill -0` fails with EPERM for a live process owned
    # by another user, which would read as dead and hide a perfectly good id.
    if string match -qr '^\d+$' -- "$pi_pid"
        if not ps -p "$pi_pid" >/dev/null 2>&1
            return 1
        end
        printf '%s\n%s\n' "$session_id" "$pi_pid"
        return 0
    end

    # An older Pi published an id with no pid. Nothing disproves the id, so it is
    # still reported; the empty pid tells a caller there is no process to signal.
    printf '%s\n\n' "$session_id"
end

function _tp_pi_session_dir --description "Return Pi's session directory for a working directory"
    set -l working_directory (path resolve -- "$argv[1]")
    set -l agent_dir "$HOME/.pi/agent"
    if set -q PI_CODING_AGENT_DIR; and test -n "$PI_CODING_AGENT_DIR"
        set agent_dir (path resolve -- "$PI_CODING_AGENT_DIR")
    end

    # Mirrors Pi's own getDefaultSessionDirPath: strip the leading separator,
    # then replace every remaining separator with a dash, wrapped in `--`.
    set -l safe (string replace -r '^/' '' -- "$working_directory" | string replace -a '/' '-')
    printf '%s/sessions/--%s--\n' "$agent_dir" "$safe"
end

function _tp_pi_session_log --description "Return the session log file for a Pi session id"
    set -l session_dir (_tp_pi_session_dir "$argv[1]")
    set -l session_id $argv[2]

    # Pi writes the log lazily: an id is published at startup, but no file exists
    # until the first message. Resuming an id with no log makes Pi exit 1, so a
    # restart must confirm the log before killing anything.
    set -l matches $session_dir/*_$session_id.jsonl
    if test (count $matches) -gt 0; and test -f "$matches[1]"
        printf '%s\n' "$matches[1]"
        return 0
    end

    # Pi APIs can store a conversation in another first-level directory such as
    # sessions/forks. This is the same breadth as Pi's global --session ID lookup:
    # every immediate child of the sessions root, without an unbounded walk.
    set -l sessions_root (path dirname "$session_dir")
    set matches $sessions_root/*/*_$session_id.jsonl
    if test (count $matches) -eq 0; or not test -f "$matches[1]"
        return 1
    end
    printf '%s\n' "$matches[1]"
end

function _tp_stop_pi --description "Stop a Pi process, preferring a graceful exit"
    set -l pi_pid $argv[1]

    if not string match -qr '^\d+$' -- "$pi_pid"
        return 0
    end
    if not ps -p "$pi_pid" >/dev/null 2>&1
        return 0
    end

    # SIGTERM is Pi's documented shutdown path: it runs session_shutdown, so the
    # conversation is flushed and the pane options are cleared. The session log
    # is what the restart resumes from, so letting Pi finish writing it matters.
    kill -TERM "$pi_pid" 2>/dev/null

    for attempt in (seq 1 50)
        if not ps -p "$pi_pid" >/dev/null 2>&1
            return 0
        end
        sleep 0.1
    end

    # Still alive after five seconds. The caller kills the tmux session next,
    # which takes the process with it.
    return 1
end

function _tp_restart_session --description "Restart a session's Pi, resuming its recorded session id"
    set -l session_name $argv[1]

    if not tmux has-session -t "=$session_name" 2>/dev/null
        echo "No session '$session_name'" >&2
        return 1
    end

    _tp_load_session_metadata
    set -l row (_tp_session_metadata_row "$session_name")
    or begin
        echo "No session '$session_name'" >&2
        return 1
    end
    set -l fields (_tp_metadata_fields "$row")
    set -l identity (_tp_live_pi_identity "$fields[2]" "$fields[3]")
    or begin
        echo "No live Pi session in '$session_name'; nothing was changed" >&2
        return 1
    end
    set -l session_id "$identity[1]"
    set -l pi_pid "$identity[2]"
    set -l label "$fields[10]"

    # Recreate in the session's own directory, not the caller's.
    set -l session_path (tmux display-message -p -t "$session_name" '#{session_path}' 2>/dev/null)
    if test -z "$session_path"; or not test -d "$session_path"
        set session_path (pwd)
    end

    # Refuse before killing anything if there is nothing to resume. Pi publishes
    # its id at startup but writes the log only on the first message, so a
    # never-used session has an id that `--session` cannot resolve.
    set -l session_log (_tp_pi_session_log "$session_path" "$session_id")
    or begin
        echo "Pi in '$session_name' has no saved conversation yet; nothing was changed" >&2
        return 1
    end

    set -l original (tmux show-environment -t "$session_name" TP_CMD 2>/dev/null | string replace -- 'TP_CMD=' '')
    # Use the exact path rather than the id. An id found in a first-level custom
    # directory goes through Pi's global lookup, which prompts to fork it instead
    # of reopening the saved conversation in place.
    set -l restart_command (_tp_restart_command "$original" "$session_log")
    or begin
        echo "Could not rebuild the command for '$session_name'; nothing was changed" >&2
        return 1
    end

    set -l project (string replace -r '_\d+$' '' -- "$session_name")
    set -l number (string match -r '\d+$' -- "$session_name")

    echo "Restarting $session_name (pi:"(string sub -l $__tp_pi_id_display_length -- "$session_id")")"
    _tp_stop_pi "$pi_pid"
    or echo "  Pi did not exit within 5s; ending the session anyway" >&2

    tmux kill-session -t "=$session_name" 2>/dev/null

    # _tp_create derives the session directory from the current one, so run it
    # where the old session lived.
    set -l previous (pwd)
    cd "$session_path"
    _tp_create "$project" "$number" $restart_command
    set -l created $status
    cd "$previous"
    if test "$created" -ne 0
        echo "Could not recreate '$session_name'" >&2
        return 1
    end

    if test -n "$label"
        _tp_set_session_name "$session_name" "$label"
    end

    # The metadata cache describes the session that was just replaced.
    _tp_load_session_metadata
end

function _tp_restart_command --description "Rebuild a tp session's command to resume a Pi session"
    set -l original $argv[1]
    set -l session_target $argv[2]

    if test -z "$original"
        return 1
    end

    # TP_CMD was written by `_tp_serialize_command`, which is `string escape`.
    # Evaluating it into a variable is that function's exact inverse: it restores
    # the original argument boundaries, and a shell metacharacter inside a value
    # stays inside that value rather than becoming syntax. tp already evaluates
    # this same string to launch the session, so this reads no new input.
    set -l parts
    eval "set parts $original" 2>/dev/null
    or return 1
    if test (count $parts) -eq 0
        return 1
    end

    # `tp pi --update-first` wraps Pi as `fish -c '<updater>; and pi $argv' -- …`,
    # where the Pi arguments follow a `--` separator and everything before it
    # belongs to the wrapper. Rewriting the wrapper's own flags would eat the
    # `-c`, so only the part after the separator is treated as Pi's. Appending to
    # the end still reaches Pi, because the wrapper forwards `$argv`.
    set -l separator_index (contains --index -- -- $parts)
    set -l rebuilt
    set -l tail $parts
    if test -n "$separator_index"
        set rebuilt $parts[1..$separator_index]
        set tail $parts[(math $separator_index + 1)..]
    end

    set -l skip_next 0
    for part in $tail
        if test "$skip_next" -eq 1
            set skip_next 0
            continue
        end
        switch "$part"
            case --resume -r --continue -c
                # Session selection is now ours: --session supersedes a picker or
                # a most-recent lookup, so carrying these forward is misleading.
            case --session --fork
                # Drop the flag and the value that follows it.
                set skip_next 1
            case '--session=*' '--fork=*'
                # Same, in joined form.
            case '*'
                set -a rebuilt "$part"
        end
    end

    if test (count $rebuilt) -eq 0
        return 1
    end

    set -a rebuilt --session "$session_target"
    printf '%s\n' $rebuilt
end

function _tp_pi_session_id --description "Return the full Pi session id for a session, when one is live"
    set -l row (_tp_session_metadata_row "$argv[1]")
    or return 1
    set -l fields (_tp_metadata_fields "$row")
    set -l identity (_tp_live_pi_identity "$fields[2]" "$fields[3]")
    or return 1
    printf '%s\n' "$identity[1]"
end

function _tp_pi_session_label --description "Return the abbreviated Pi session id when one is live"
    # Pi ids are UUIDv7, whose leading hex digits are a millisecond timestamp
    # rather than randomness: 8 characters is only a 65-second window, and
    # sessions started together in that window share it. 13 characters reaches
    # past the timestamp into the random block, so the shown value identifies
    # one session. Use `tp sid <n>` when the exact full id is needed.
    set -l identity (_tp_live_pi_identity $argv)
    or return 1

    printf 'pi:%s\n' (string sub -l $__tp_pi_id_display_length -- "$identity[1]")
end

function _tp_session_suffix --description "Return the label, Pi id, and attached markers for a session"
    # Always print a line, even an empty one: a command substitution producing no
    # output expands to zero elements, which would delete the caller's whole
    # `echo`/`printf` argument rather than append nothing to it.
    set -l name $argv[1]
    set -l row (_tp_session_metadata_row "$name")
    or begin
        _tp_load_session_metadata
        set row (_tp_session_metadata_row "$name")
        or begin
            echo ""
            return 0
        end
    end

    set -l fields (_tp_metadata_fields "$row")
    set -l session_id "$fields[2]"
    set -l pi_pid "$fields[3]"
    set -l attached "$fields[4]"
    set -l label "$fields[10]"

    set -l suffix ""
    if test -n "$label"
        # The label is what a user scans for, so it stays the brightest thing
        # after the session name itself.
        set suffix "$suffix "(_tp_colour green "[$label]")
    end

    # The state is only shown for a Pi that is live: a SIGKILLed Pi leaves its
    # last state on the pane forever, and the pid is what tells them apart.
    set -l pi_live 0
    set -l pi_label (_tp_pi_session_label "$session_id" "$pi_pid")
    if test $status -eq 0
        set pi_live 1
        # An id is for copying, not reading: it should not compete with the
        # label or the state.
        set suffix "$suffix "(_tp_colour brblack "$pi_label")
    end
    if test "$attached" != 0
        set suffix "$suffix "(_tp_colour magenta "(attached)")
    end

    if test "$pi_live" -eq 1
        set -l state_fields (_tp_pi_state_fields \
            "$fields[5]" "$fields[6]" "$fields[7]" "$fields[8]" "$fields[9]")
        if test $status -eq 0; and test (count $state_fields) -gt 0
            # The caller's own prefix (indent, number, session name) is not known
            # here, so budget for it rather than overflowing the line.
            set -l width (_tp_terminal_width)
            set -l reserved (math (_tp_visible_length "$suffix") + $__tp_state_prefix_budget)
            set suffix "$suffix"(_tp_fit_fields "$width" "$reserved" $state_fields)
        end
    end

    printf '%s\n' "$suffix"
end

function _tp_list_sessions --description "List tmux sessions matching a project name"
    set -l project $argv[1]
    set -l sessions
    for line in (tmux list-sessions -F '#{session_name}' 2>/dev/null)
        if string match -qr '^'(string escape --style=regex $project)'_\\d+$' $line
            set -a sessions $line
        end
    end
    if test (count $sessions) -eq 0
        return 0
    end
    printf '%s\n' $sessions | sort -t_ -k2 -n
end

function _tp_list_global --description "List all tp-managed tmux sessions (project_number) across every project"
    set -l sessions
    for line in (tmux list-sessions -F '#{session_name}' 2>/dev/null)
        if string match -qr '^.+_\\d+$' $line
            set -a sessions $line
        end
    end
    if test (count $sessions) -eq 0
        return 0
    end
    # Sort by project name, then numerically by trailing number
    printf '%s\n' $sessions | sort -t_ -k1,1 -k2,2n
end

function _tp_decimal_number --description "Normalize a tp session number to decimal"
    set -l value $argv[1]
    if not string match -qr '^\d+$' -- "$value"
        return 1
    end

    # Fish treats a leading 0 as octal in numeric contexts. Strip padding so
    # session numbers such as 008 and 009 are always interpreted as decimal.
    set value (string replace -r '^0+' '' -- "$value")
    if test -z "$value"
        set value 0
    end
    printf '%s\n' "$value"
end

function _tp_format_number --description "Zero-pad a tp session number for lexical sorting"
    set -l num (_tp_decimal_number "$argv[1]")
    or return 1
    printf '%03d\n' "$num"
end

function _tp_next_number --description "Get next available session number for a project"
    set -l project $argv[1]
    set -l max 0
    for line in (tmux list-sessions -F '#{session_name}' 2>/dev/null)
        if string match -qr '^'(string escape --style=regex $project)'_\\d+$' $line
            set -l padded_num (string replace -- "$project"_ "" $line)
            set -l num (_tp_decimal_number "$padded_num")
            or continue
            if test "$num" -gt "$max"
                set max $num
            end
        end
    end
    math $max + 1
end

function _tp_create --description "Create a new tmux session (detached)"
    set -l project $argv[1]
    set -l num (_tp_format_number $argv[2])
    set -l session_name "$project"_"$num"
    set -l run_cmd $argv[3..]

    if test (count $run_cmd) -gt 0
        set -l cmd_str (_tp_serialize_command $run_cmd)
        # Wrapper: run the command under fish (so fish functions/abbrs like `piu`
        # still resolve), then save the final pane contents before tmux tears the
        # session down. _tp_attach replays those contents in the calling terminal,
        # so Pi's resume message remains visible without an extra ENTER prompt.
        # Environment variables keep command/path interpolation out of the wrapper.
        set -l close_output (mktemp -t tp-close.XXXXXX)
        tmux new-session -d -s "$session_name" -c (pwd) \
            -e TP_CMD="$cmd_str" -e TP_CLOSE_OUTPUT="$close_output" \
            'eval $TP_CMD; set -l __tp_st $status; if test $__tp_st -ne 0; printf "\n\e[1;31m[tp] \"%s\" exited with status %d\e[0m\n" "$TP_CMD" $__tp_st; end; tmux capture-pane -p -t "$TMUX_PANE" | string collect | string trim > "$TP_CLOSE_OUTPUT"; set -l __tp_wait (tmux show-option -t "$TMUX_PANE" -v @tp_wait_channel 2>/dev/null); set -l __tp_return (tmux show-option -t "$TMUX_PANE" -v @tp_return_session 2>/dev/null); set -l __tp_client (tmux show-option -t "$TMUX_PANE" -v @tp_return_client 2>/dev/null); if test -n "$__tp_return" -a -n "$__tp_client"; tmux switch-client -c "$__tp_client" -t "=$__tp_return"; end; if test -n "$__tp_wait"; tmux wait-for -S "$__tp_wait"; end'
        tmux set-option -t "$session_name" @tp_close_output "$close_output"
    else
        tmux new-session -d -s "$session_name" -c (pwd)
    end
    # Set terminal window title: use @tp_name if set, otherwise session name
    tmux set-option -t "$session_name" set-titles on
    tmux set-option -t "$session_name" set-titles-string '#{?@tp_name,#T · #{@tp_name},#T}'
end

function _tp_serialize_command --description "Serialize argv for evaluation by a nested Fish shell"
    string escape -- $argv | string join ' '
end

function _tp_sanitize_client_tty --description "Sanitize a tmux client TTY for use in an option name"
    if test (count $argv) -ne 1
        return 1
    end

    set -l client_tty (string trim -- "$argv[1]")
    if test -z "$client_tty"; or test (string length -- "$client_tty") -gt 255
        return 1
    end
    if string match -qr '[[:cntrl:]]' -- "$client_tty"
        return 1
    end

    set -l sanitized (string replace -ra '[^A-Za-z0-9]+' '_' -- "$client_tty" | string trim -c '_')
    if test -z "$sanitized"
        return 1
    end

    printf '%s\n' "$sanitized"
end

function _tp_ssh_connection_source --description "Return the source token from SSH_CONNECTION"
    if not set -q SSH_CONNECTION
        return 1
    end

    set -l connection (string trim -- "$SSH_CONNECTION")
    if test -z "$connection"
        return 1
    end

    set -l source (string match -r '^[^[:space:]]+' -- "$connection")
    if test (count $source) -ne 1; or test -z "$source"
        return 1
    end
    if string match -qr '[[:cntrl:][:space:]]' -- "$source"
        return 1
    end

    printf '%s\n' "$source"
end

function _tp_ssh_source_option --description "Return the tmux option for a client TTY"
    set -l sanitized (_tp_sanitize_client_tty "$argv")
    or return 1
    printf '@tp_ssh_source_%s\n' "$sanitized"
end

function _tp_prepare_ssh_source_for_attach --description "Update or preserve the current client's SSH source"
    set -l client_tty
    if set -q TMUX
        set client_tty (tmux display-message -p '#{client_tty}' 2>/dev/null)
        set -l option_name (_tp_ssh_source_option $client_tty)
        or return 0

        # Source mappings are server-global, so the current client's exact option
        # follows it across a session switch. Read it to reuse only trusted metadata;
        # never replace it with the pane's potentially stale SSH_CONNECTION value.
        tmux show-option -gqv "$option_name" >/dev/null 2>&1
        return 0
    end

    set client_tty (command tty 2>/dev/null)
    if test $status -ne 0
        return 0
    end
    set -l option_name (_tp_ssh_source_option $client_tty)
    or return 0

    set -l source (_tp_ssh_connection_source)
    if test $status -eq 0
        tmux set-option -gq "$option_name" "$source"
    else
        # Clear this exact mapping so a reused terminal cannot inherit its source.
        tmux set-option -guq "$option_name"
    end
end

function _tp_attach --description "Attach or switch to a tmux session"
    set -l session_name $argv[1]
    # show-option/set-option take a target-pane, where tmux's `=name` exact-
    # session syntax does not resolve; the plain full session name does.
    set -l close_output (tmux show-option -t "$session_name" -v @tp_close_output 2>/dev/null)

    _tp_prepare_ssh_source_for_attach

    if set -q TMUX
        if test -n "$close_output"
            # switch-client returns immediately. Wait in the original shell until
            # the target wrapper has saved its final pane, then print it before Fish
            # draws the next prompt. This makes nested tp sessions behave like a
            # normal, synchronous tmux attachment rather than only showing [exited].
            set -l wait_channel "tp-close-$session_name-"(random)"-"(random)
            set -l return_session (tmux display-message -p '#{session_name}')
            set -l return_client (tmux display-message -p '#{client_name}')
            tmux set-option -t "$session_name" @tp_wait_channel "$wait_channel"
            tmux set-option -t "$session_name" @tp_return_session "$return_session"
            tmux set-option -t "$session_name" @tp_return_client "$return_client"
            tmux switch-client -t "=$session_name"
            tmux wait-for "$wait_channel"
            _tp_replay_close_output "$close_output"
        else
            tmux switch-client -t "=$session_name"
        end
    else
        tmux attach-session -t "=$session_name"

        # A tmux client uses the alternate screen, so its final pane would normally
        # disappear when the session exits. Replay the snapshot after returning to
        # the ordinary terminal. Do nothing after a manual detach from a live session.
        if test -n "$close_output"; and not tmux has-session -t "=$session_name" 2>/dev/null
            _tp_replay_close_output "$close_output"
        end
    end
end

function _tp_replay_close_output --description "Print and remove a saved tp pane snapshot"
    set -l close_output $argv[1]
    if test -s "$close_output"
        set -l close_text (string collect < "$close_output")
        printf '\n%s\n' "$close_text"
    end
    rm -f "$close_output"
end
