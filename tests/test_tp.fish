#!/usr/bin/env fish

set -g test_socket "tp-test-"(random)"-"(random)
set -g test_root (mktemp -d -t tp-test.XXXXXX)

function __tp_test_cleanup --on-event fish_exit
    command tmux -L "$test_socket" kill-server >/dev/null 2>&1
    rm -rf "$test_root"
end

# Keep the tests isolated from the user's real tmux server.
function tmux
    command tmux -L "$test_socket" $argv
end

function fail
    printf 'not ok - %s\n' (string join ' ' $argv) >&2
    exit 1
end

function assert_equal
    set -l expected $argv[1]
    set -l actual $argv[2]
    set -l description $argv[3]

    if test "$expected" != "$actual"
        fail "$description (expected '$expected', got '$actual')"
    end
    printf 'ok - %s\n' "$description"
end

set -l repo_root (path resolve (dirname (status filename))/..)
source "$repo_root/functions/tp.fish"
source "$repo_root/completions/tp.fish"

assert_equal 8 (_tp_decimal_number 008) 'leading zeroes are parsed as decimal'
assert_equal 0 (_tp_decimal_number 000) 'all-zero input is normalized'
assert_equal 008 (_tp_format_number 8) 'session numbers are padded'
assert_equal 1234 (_tp_format_number 1234) 'large session numbers are preserved'

if _tp_decimal_number nope >/dev/null 2>&1
    fail 'non-numeric session numbers must be rejected'
end
printf 'ok - non-numeric session numbers are rejected\n'

mkdir -p "$test_root/demo"
cd "$test_root/demo"

set -l empty_project_sessions (_tp_list_sessions demo)
assert_equal 0 (count $empty_project_sessions) 'empty project list contains no phantom session'

set -l empty_global_sessions (_tp_list_global)
assert_equal 0 (count $empty_global_sessions) 'empty global list contains no phantom session'

set -l empty_ls_output (tp ls)
set -l empty_ls_status $status
assert_equal 1 $empty_ls_status 'tp ls fails when no project sessions exist'
assert_equal "No tmux sessions for 'demo'" (string join ' ' $empty_ls_output) 'tp ls reports no project sessions'

set -l empty_global_output (tp global)
set -l empty_global_status $status
assert_equal 1 $empty_global_status 'tp global fails when no tp sessions exist'
assert_equal 'No tp sessions' (string join ' ' $empty_global_output) 'tp global reports no sessions'

_tp_create demo 10; or fail 'could not create demo_010'
_tp_create demo 2; or fail 'could not create demo_002'
_tp_create demo 1; or fail 'could not create demo_001'

set -l sessions (_tp_list_sessions demo)
assert_equal 'demo_001 demo_002 demo_010' (string join ' ' $sessions) 'project sessions are sorted numerically'
assert_equal 11 (_tp_next_number demo) 'next number follows the highest existing session'

_tp_create other 1; or fail 'could not create other_001'
set sessions (_tp_list_sessions demo)
assert_equal 'demo_001 demo_002 demo_010' (string join ' ' $sessions) 'project listing excludes other projects'

set -l global_sessions (_tp_list_global)
assert_equal 'demo_001 demo_002 demo_010 other_001' (string join ' ' $global_sessions) 'global listing is grouped and sorted'

tp name 2 backend >/dev/null; or fail 'tp name failed'
assert_equal backend (tmux show-option -t demo_002 -v @tp_name) 'tp name stores a session label'

set -l project_completion_values (__tp_complete_project_sessions | string replace -r '\t.*$' '')
assert_equal '001 002 010' (string join ' ' $project_completion_values) 'project completions contain sorted session numbers'
set -l project_completions (__tp_complete_project_sessions)
if not contains -- (printf '002\tdemo_002 [backend]') $project_completions
    fail 'project completion does not include the session label'
end
printf 'ok - project completion includes the session label\n'

set -l global_completion_values (__tp_complete_global_session_indexes | string replace -r '\t.*$' '')
assert_equal '1 2 3 4' (string join ' ' $global_completion_values) 'global completions contain one-based indexes'
set -l global_completion_sessions (__tp_complete_global_session_indexes | string replace -r '^[^\t]+\t' '')
assert_equal 'demo_001 demo_002 demo_010 other_001' (string join ' ' $global_completion_sessions) 'global completion indexes match list order'

tp kill 2 >/dev/null; or fail 'tp kill 2 failed'
if tmux has-session -t '=demo_002' 2>/dev/null
    fail 'tp kill 2 left demo_002 running'
end
printf 'ok - tp kill removes a selected project session\n'

tp kill >/dev/null; or fail 'tp kill failed'
set -l sessions_after_kill (_tp_list_sessions demo)
assert_equal 0 (count $sessions_after_kill) 'tp kill removes all current-project sessions'

printf 'All tp tests passed.\n'
