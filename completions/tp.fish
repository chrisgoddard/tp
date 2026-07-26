# Disable path completion: every tp argument is a command, session selector, or label.
complete -c tp -f

# Primary commands.
complete -c tp -n '__fish_use_subcommand' -a new -d 'Create the next numbered project session'
complete -c tp -n '__fish_use_subcommand' -a ls -d 'List sessions for the current project'
complete -c tp -n '__fish_use_subcommand' -a last -d 'Attach to the last-created project session'
complete -c tp -n '__fish_use_subcommand' -a kill -d 'Kill one or all project sessions'
complete -c tp -n '__fish_use_subcommand' -a name -d 'Set a session label'
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

# Options accepted by `tp new` and `tp n`.
complete -c tp -n '__fish_seen_subcommand_from new n' -s n -l name -r -d 'Label the new session'
