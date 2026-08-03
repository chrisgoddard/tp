# Generate numbered sessions for the project represented by the current directory.
function __tp_complete_project_sessions
    set -l project (basename (pwd) | string trim -l -c '.')
    set -l sessions

    for session in (tmux list-sessions -F '#{session_name}' 2>/dev/null)
        if string match -qr '^'(string escape --style=regex "$project")'_\d+$' "$session"
            set -a sessions "$session"
        end
    end

    for session in (printf '%s\n' $sessions | sort)
        set -l number (string replace -- "$project"_ '' "$session")
        set -l label (tmux show-option -t "$session" -v @tp_name 2>/dev/null)
        if test -n "$label"
            printf '%s\t%s [%s]\n' "$number" "$session" "$label"
        else
            printf '%s\t%s\n' "$number" "$session"
        end
    end
end

# Match the ordering used by `tp global`, then expose its one-based indexes.
function __tp_complete_global_session_indexes
    set -l sessions
    for session in (tmux list-sessions -F '#{session_name}' 2>/dev/null)
        if string match -qr '^.+_\d+$' "$session"
            set -a sessions "$session"
        end
    end

    set sessions (printf '%s\n' $sessions | sort -t_ -k1,1 -k2,2n)
    set -l index 1
    for session in $sessions
        printf '%s\t%s\n' "$index" "$session"
        set index (math "$index + 1")
    end
end

# Every tp argument is a command, selector, label, or nested command rather than
# an ordinary path. `tp new` opts back into completion for its nested command.
complete -c tp -f

# Primary commands.
complete -c tp -n '__fish_use_subcommand' -a new -d 'Create the next numbered project session'
complete -c tp -n '__fish_use_subcommand' -a ls -d 'List sessions for the current project'
complete -c tp -n '__fish_use_subcommand' -a list -d 'List sessions for the current project'
complete -c tp -n '__fish_use_subcommand' -a last -d 'Attach to the last-created project session'
complete -c tp -n '__fish_use_subcommand' -a kill -d 'Kill one or all project sessions'
complete -c tp -n '__fish_use_subcommand' -a name -d 'Set a session label'
complete -c tp -n '__fish_use_subcommand' -a shot -d 'Find screenshots uploaded by tp-shot'
complete -c tp -n '__fish_use_subcommand' -a global -d 'List or attach to tp sessions across projects'
complete -c tp -n '__fish_use_subcommand' -a cmux -d 'Open or focus tp sessions in cmux'
complete -c tp -n '__fish_use_subcommand' -a all -d 'List all tmux sessions'

# Short aliases.
complete -c tp -n '__fish_use_subcommand' -a n -d 'Create the next numbered project session'
complete -c tp -n '__fish_use_subcommand' -a l -d 'Attach to the last-created project session'
complete -c tp -n '__fish_use_subcommand' -a k -d 'Kill one or all project sessions'
complete -c tp -n '__fish_use_subcommand' -a g -d 'List or attach to tp sessions across projects'
complete -c tp -n '__fish_use_subcommand' -a c -d 'Open or focus tp sessions in cmux'
complete -c tp -n '__fish_use_subcommand' -a a -d 'List all tmux sessions'

# Existing project session numbers can be used directly or with kill/name.
complete -c tp -n '__fish_use_subcommand' -a '(__tp_complete_project_sessions)'
complete -c tp -n '__fish_seen_subcommand_from kill k name' -a '(__tp_complete_project_sessions)'

# Options and nested-command completion for `tp new` and `tp n`.
complete -c tp -n '__fish_seen_subcommand_from new n' -s n -l name -r -d 'Label the new session'
complete -c tp -n '__fish_seen_subcommand_from new n' \
    -a '(__fish_complete_subcommand --fcs-skip=2 --name -n)'

# Screenshot lookup actions.
complete -c tp -n '__fish_seen_subcommand_from shot; and not __fish_seen_subcommand_from latest list ls dir' -a latest -d 'Print the newest uploaded screenshot path'
complete -c tp -n '__fish_seen_subcommand_from shot; and not __fish_seen_subcommand_from latest list ls dir' -a list -d 'List recent uploaded screenshot paths'
complete -c tp -n '__fish_seen_subcommand_from shot; and not __fish_seen_subcommand_from latest list ls dir' -a dir -d 'Print the screenshot upload directory'

# Global and cmux selectors are one-based indexes into the displayed global list.
complete -c tp -n '__fish_seen_subcommand_from global g' -a '(__tp_complete_global_session_indexes)'
complete -c tp -n '__fish_seen_subcommand_from cmux c' -a '(__tp_complete_global_session_indexes)'
complete -c tp -n '__fish_seen_subcommand_from cmux c' -a all -d 'Open or focus every tp session in cmux'
