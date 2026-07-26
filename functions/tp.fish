function tp --description "Manage tmux sessions for the current project directory"
    set -l project (basename (pwd) | string trim -l -c '.')
    set -l cmd $argv[1]

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
                tmux set-option -t "$project"_"$next" @tp_name "$name"
            end
            _tp_attach "$project"_"$next"

        case ls list
            set -l existing (_tp_list_sessions $project)
            if test (count $existing) -eq 0
                echo "No tmux sessions for '$project'"
                return 1
            end
            echo "Sessions for '$project':"
            for s in $existing
                set -l num (string replace -- "$project"_ "" $s)
                set -l label ""
                set -l raw_name (tmux show-option -t "$s" -v @tp_name 2>/dev/null)
                if test -n "$raw_name"
                    set label " [$raw_name]"
                end
                set -l attached ""
                if tmux list-clients -t "$s" 2>/dev/null | string length -q
                    set attached " (attached)"
                end
                echo "  $num  →  $s$label$attached"
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
                set -l idx $argv[2]
                if not string match -qr '^\d+$' $idx
                    echo "Usage: tp global [<index>]"
                    return 1
                end
                if test $idx -lt 1 -o $idx -gt (count $sessions)
                    echo "Index out of range (1-"(count $sessions)")"
                    return 1
                end
                _tp_attach $sessions[$idx]
                return
            end
            echo "All tp sessions:"
            set -l i 1
            for s in $sessions
                set -l label ""
                set -l raw_name (tmux show-option -t "$s" -v @tp_name 2>/dev/null)
                if test -n "$raw_name"
                    set label " [$raw_name]"
                end
                set -l attached ""
                if tmux list-clients -t "$s" 2>/dev/null | string length -q
                    set attached " (attached)"
                end
                printf '  %2d  →  %s%s%s\n' $i $s $label $attached
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
            for s in $sessions
                set -l label ""
                set -l raw_name (tmux show-option -t "$s" -v @tp_name 2>/dev/null)
                if test -n "$raw_name"
                    set label " [$raw_name]"
                end
                set -l attached ""
                if tmux list-clients -t "$s" 2>/dev/null | string length -q
                    set attached " (attached)"
                end
                echo "  $s$label$attached"
            end

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
            tmux set-option -t "$target" @tp_name "$argv[3]"
            tmux set-option -t "$target" set-titles on
            tmux set-option -t "$target" set-titles-string '#{?@tp_name,#T · #{@tp_name},#T}'
            echo "Named $target → $argv[3]"

        case '*'
            if string match -qr '^\d+$' $cmd
                set -l id (_tp_format_number "$cmd")
                set -l target "$project"_$id
                if tmux has-session -t "=$target" 2>/dev/null
                    _tp_attach $target
                else
                    echo "Session '$target' doesn't exist. Creating it..."
                    _tp_create $project $id
                    _tp_attach $target
                end
            else
                echo "Usage: tp [new [-n name] [cmd...]|ls|last|kill [n]|name <n> <label>|global [i]|cmux [i|prefix|all]|all|<number>]"
                echo ""
                echo "  tp                       Attach to first session (or create _1)"
                echo "  tp new [-n name] [cmd..] Create next numbered session"
                echo "  tp name <n> <label>      Set/update a session's name"
                echo "  tp <n>                   Attach to session _n (creates if missing)"
                echo "  tp last                  Attach to last-created session here (alias: l, -)"
                echo "  tp ls                    List sessions for current project"
                echo "  tp kill                  Kill all project sessions"
                echo "  tp kill <n>              Kill session _n"
                echo "  tp global                List all tp sessions everywhere (alias: g)"
                echo "  tp global <i>            Attach to global tp session by index"
                echo "  tp cmux                  List global sessions and cmux state (alias: c)"
                echo "  tp cmux <i>              Open/focus global session <i> in cmux"
                echo "  tp cmux <prefix>         Open/focus sessions whose names start with prefix"
                echo "  tp cmux all              Open/focus every global session in cmux"
                echo "  tp all                   List all tmux sessions"
                return 1
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

function _tp_list_sessions --description "List tmux sessions matching a project name"
    set -l project $argv[1]
    set -l sessions
    for line in (tmux list-sessions -F '#{session_name}' 2>/dev/null)
        if string match -qr '^'(string escape --style=regex $project)'_\\d+$' $line
            set -a sessions $line
        end
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
        set -l cmd_str (string join -- " " $run_cmd)
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

function _tp_attach --description "Attach or switch to a tmux session"
    set -l session_name $argv[1]
    # show-option/set-option take a target-pane, where tmux's `=name` exact-
    # session syntax does not resolve; the plain full session name does.
    set -l close_output (tmux show-option -t "$session_name" -v @tp_close_output 2>/dev/null)

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
