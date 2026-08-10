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

function __tp_print_arguments
    for argument in $argv
        printf '<%s>\n' "$argument"
    end
end

set -l serialized_command (_tp_serialize_command __tp_print_arguments 'two words' 'semi;colon' 'dollar$sign')
set -l serialized_output (eval "$serialized_command")
assert_equal \
    '<two words>|<semi;colon>|<dollar$sign>' \
    (string join '|' $serialized_output) \
    'nested command serialization preserves argument boundaries'

if _tp_decimal_number nope >/dev/null 2>&1
    fail 'non-numeric session numbers must be rejected'
end
printf 'ok - non-numeric session numbers are rejected\n'

assert_equal dev_pts_7 (_tp_sanitize_client_tty '/dev/pts/7') 'Linux client TTYs are sanitized'
assert_equal dev_ttys003 (_tp_sanitize_client_tty '/dev/ttys003') 'macOS client TTYs are sanitized'
assert_equal \
    dev_pts_7_remote_tty \
    (_tp_sanitize_client_tty '  /dev//pts---7 @ remote!tty  ') \
    'separator runs in client TTYs become single underscores'

set -l control_tty (printf '/dev/pts/\x017')
set -l oversized_tty "/dev/"(string repeat -n 251 x)
for invalid_tty in '' '   ' '///' "$control_tty" "$oversized_tty"
    if _tp_sanitize_client_tty "$invalid_tty" >/dev/null 2>&1
        fail 'invalid client TTY was accepted'
    end
end
printf 'ok - empty, control-containing, oversized, and separator-only client TTYs are rejected\n'

# Exercise _tp_attach with a fully mocked tmux client. These checks must not
# create or attach a real tmux client, including when the test itself runs in tmux.
set -l fake_tty_bin "$test_root/fake-tty-bin"
mkdir -p "$fake_tty_bin"
printf '%s\n' \
    '#!/usr/bin/env fish' \
    'printf "%s" "$TP_TEST_CLIENT_TTY"' \
    'if set -q TP_TEST_TTY_STATUS' \
    '    exit "$TP_TEST_TTY_STATUS"' \
    'end' \
    >"$fake_tty_bin/tty"
chmod +x "$fake_tty_bin/tty"

set -l original_path $PATH
set -gx PATH "$fake_tty_bin" $PATH
set -l had_tmux 0
set -l original_tmux
if set -q TMUX
    set had_tmux 1
    set original_tmux "$TMUX"
end
set -l had_ssh_connection 0
set -l original_ssh_connection
if set -q SSH_CONNECTION
    set had_ssh_connection 1
    set original_ssh_connection "$SSH_CONNECTION"
end

functions -c tmux __tp_test_real_tmux
function tmux
    switch "$argv[1]"
        case show-option
            if test "$argv[-1]" = @tp_close_output
                set -ga __tp_mock_events read-close
            else
                set -ga __tp_mock_events read-source
                set -g __tp_mock_last_read_option "$argv[-1]"
                if set -q __tp_mock_option_value
                    printf '%s\n' "$__tp_mock_option_value"
                end
            end
        case set-option
            if string match -q '*u*' -- "$argv[2]"
                set -ga __tp_mock_events clear
                set -ga __tp_mock_clear_history "$argv[-1]"
                set -g __tp_mock_last_clear_argc (count $argv)
            else
                set -ga __tp_mock_events set
                set -ga __tp_mock_set_history "$argv[-2]=$argv[-1]"
                set -g __tp_mock_last_set_option "$argv[-2]"
                set -g __tp_mock_last_set_source "$argv[-1]"
                set -g __tp_mock_last_set_argc (count $argv)
            end
        case display-message
            set -ga __tp_mock_events display-tty
            set -g __tp_mock_last_display_format "$argv[-1]"
            printf '%s\n' "$__tp_mock_client_tty"
        case attach-session
            set -ga __tp_mock_events attach
            set -g __tp_mock_last_target "$argv[-1]"
        case switch-client
            set -ga __tp_mock_events switch
            set -g __tp_mock_last_target "$argv[-1]"
        case '*'
            fail "unexpected mocked tmux command: "(string join ' ' $argv)
    end
    return 0
end

function __tp_reset_attach_mock
    set -e __tp_mock_events __tp_mock_set_history __tp_mock_clear_history
    set -e __tp_mock_last_read_option __tp_mock_last_set_option __tp_mock_last_set_source
    set -e __tp_mock_last_set_argc __tp_mock_last_clear_argc __tp_mock_last_display_format
    set -e __tp_mock_last_target __tp_mock_client_tty __tp_mock_option_value
end

set -e TMUX
set -gx TP_TEST_CLIENT_TTY /dev/pts/7
set -gx SSH_CONNECTION '203.0.113.10 51234 203.0.113.20 22'
__tp_reset_attach_mock
_tp_attach demo_001; or fail 'outside attachment with SSH metadata failed'
assert_equal \
    'read-close set attach' \
    (string join ' ' $__tp_mock_events) \
    'outside attachment writes metadata before attach-session'
assert_equal @tp_ssh_source_dev_pts_7 "$__tp_mock_last_set_option" 'outside attachment keys metadata by the sanitized TTY'
assert_equal 203.0.113.10 "$__tp_mock_last_set_source" 'outside attachment records the first SSH_CONNECTION field'
assert_equal 4 "$__tp_mock_last_set_argc" 'tmux receives the option and source as separate arguments'
assert_equal '=demo_001' "$__tp_mock_last_target" 'outside attachment keeps the exact session target'

set -gx SSH_CONNECTION '2001:db8::7 51234 2001:db8::20 22'
__tp_reset_attach_mock
_tp_attach demo_001; or fail 'outside attachment overwrite failed'
assert_equal \
    '@tp_ssh_source_dev_pts_7=2001:db8::7' \
    (string join ' ' $__tp_mock_set_history) \
    'a later valid attachment overwrites the exact TTY mapping'

set -e SSH_CONNECTION
__tp_reset_attach_mock
_tp_attach demo_001; or fail 'outside attachment without SSH metadata failed'
assert_equal \
    'read-close clear attach' \
    (string join ' ' $__tp_mock_events) \
    'missing SSH metadata clears the exact mapping before attachment'
assert_equal @tp_ssh_source_dev_pts_7 "$__tp_mock_clear_history[1]" 'missing SSH metadata clears only the current TTY mapping'
assert_equal 3 "$__tp_mock_last_clear_argc" 'tmux receives an argument-safe option unset command'

set -gx SSH_CONNECTION (printf 'bad\x01source 51234 203.0.113.20 22')
__tp_reset_attach_mock
_tp_attach demo_001; or fail 'outside attachment with invalid SSH metadata failed'
assert_equal \
    '@tp_ssh_source_dev_pts_7' \
    (string join ' ' $__tp_mock_clear_history) \
    'control-containing SSH metadata clears the exact mapping'

set -gx TP_TEST_CLIENT_TTY '///'
set -gx SSH_CONNECTION '203.0.113.10 51234 203.0.113.20 22'
__tp_reset_attach_mock
_tp_attach demo_001; or fail 'outside attachment with an invalid TTY failed'
assert_equal 'read-close attach' (string join ' ' $__tp_mock_events) 'an invalid TTY does not create a metadata option'

set -gx TP_TEST_CLIENT_TTY 'not a tty'
set -gx TP_TEST_TTY_STATUS 1
__tp_reset_attach_mock
_tp_attach demo_001; or fail 'outside attachment after tty failure failed'
assert_equal 'read-close attach' (string join ' ' $__tp_mock_events) 'a failed tty lookup does not create a metadata option'
set -e TP_TEST_TTY_STATUS

set -gx TMUX mocked-tmux
set -gx SSH_CONNECTION '198.51.100.99 51234 203.0.113.20 22'
__tp_reset_attach_mock
set -g __tp_mock_client_tty /dev/ttys003
set -g __tp_mock_option_value 203.0.113.40
_tp_attach demo_002; or fail 'inside tmux switch with trusted metadata failed'
assert_equal \
    'read-close display-tty read-source switch' \
    (string join ' ' $__tp_mock_events) \
    'inside tmux reuses the current client mapping before switching'
assert_equal '#{client_tty}' "$__tp_mock_last_display_format" 'inside tmux reads the current client TTY'
assert_equal @tp_ssh_source_dev_ttys003 "$__tp_mock_last_read_option" 'inside tmux reads the current client mapping'
assert_equal '=demo_002' "$__tp_mock_last_target" 'inside tmux keeps the exact switch target'
assert_equal 0 (count $__tp_mock_set_history) 'inside tmux does not overwrite metadata from SSH_CONNECTION'
assert_equal 0 (count $__tp_mock_clear_history) 'inside tmux does not clear a trusted client mapping'

__tp_reset_attach_mock
set -g __tp_mock_client_tty /dev/ttys003
_tp_attach demo_003; or fail 'inside tmux switch without trusted metadata failed'
assert_equal \
    'read-close display-tty read-source switch' \
    (string join ' ' $__tp_mock_events) \
    'inside tmux leaves a missing client mapping absent and still switches'
assert_equal 0 (count $__tp_mock_set_history) 'inside tmux does not guess a missing source'
assert_equal 0 (count $__tp_mock_clear_history) 'inside tmux does not mutate an absent source mapping'

functions --erase tmux __tp_reset_attach_mock
functions -c __tp_test_real_tmux tmux
functions --erase __tp_test_real_tmux
set -gx PATH $original_path
set -e TP_TEST_CLIENT_TTY TP_TEST_TTY_STATUS
if test "$had_tmux" -eq 1
    set -gx TMUX "$original_tmux"
else
    set -e TMUX
end
if test "$had_ssh_connection" -eq 1
    set -gx SSH_CONNECTION "$original_ssh_connection"
else
    set -e SSH_CONNECTION
end

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

# Exercise the public Pi command without creating or attaching to a real pane.
functions -c _tp_create __tp_real_create
functions -c _tp_set_session_name __tp_real_set_session_name
functions -c _tp_attach __tp_real_attach
function _tp_create
    set -g __tp_create_arguments $argv
end
function _tp_set_session_name
    set -g __tp_name_arguments $argv
end
function _tp_attach
    set -g __tp_attach_arguments $argv
end

set -e __tp_create_arguments __tp_name_arguments __tp_attach_arguments
tp p -uf -n 'Auth work' --model openai/gpt-5 'initial prompt'; or fail 'tp p failed'
assert_equal \
    'demo|011|fish|-c|pi update --all; and pi $argv|--|--name|Auth work|--model|openai/gpt-5|initial prompt' \
    (string join -- '|' $__tp_create_arguments) \
    'tp p update-first launches the updater before Pi and preserves Pi arguments'
assert_equal 'demo_011|Auth work' (string join '|' $__tp_name_arguments) 'tp p applies its name to the tmux session'
assert_equal 'demo_011' (string join '|' $__tp_attach_arguments) 'tp p attaches to the new session'

set -e __tp_create_arguments __tp_name_arguments __tp_attach_arguments
tp pi -- --update-first --name pi-only --tools read 'two words'; or fail 'tp pi passthrough failed'
assert_equal \
    'demo|011|pi|--update-first|--name|pi-only|--tools|read|two words' \
    (string join -- '|' $__tp_create_arguments) \
    'tp pi passes every argument after -- directly to Pi'
if set -q __tp_name_arguments
    fail 'tp pi treated a Pi-only --name after -- as a tmux name'
end
printf 'ok - tp pi stops interpreting options after --\n'

set -e __tp_create_arguments __tp_name_arguments __tp_attach_arguments
set -l missing_name_output (tp pi --name 2>&1)
set -l missing_name_status $status
assert_equal 2 $missing_name_status 'tp pi rejects a missing name value'
if set -q __tp_create_arguments
    fail 'tp pi created a session after rejecting a missing name value'
end
if not string match -q 'Usage: tp pi *' -- (string join ' ' $missing_name_output)
    fail 'tp pi did not show usage after a missing name value'
end
printf 'ok - tp pi reports usage for a missing name value\n'

functions --erase _tp_create _tp_set_session_name _tp_attach
functions -c __tp_real_create _tp_create
functions -c __tp_real_set_session_name _tp_set_session_name
functions -c __tp_real_attach _tp_attach
functions --erase __tp_real_create __tp_real_set_session_name __tp_real_attach

set -gx TP_SHOT_DIR "$test_root/screenshots"
mkdir -p "$TP_SHOT_DIR"
printf old > "$TP_SHOT_DIR/tp-shot-20260101T000000Z-studio-1.png"
printf new > "$TP_SHOT_DIR/tp-shot-20260102T000000Z-laptop-2.png"
touch -t 202601010000 "$TP_SHOT_DIR/tp-shot-20260101T000000Z-studio-1.png"
touch -t 202601020000 "$TP_SHOT_DIR/tp-shot-20260102T000000Z-laptop-2.png"

set -l shots (_tp_list_shots)
assert_equal \
    "$TP_SHOT_DIR/tp-shot-20260102T000000Z-laptop-2.png $TP_SHOT_DIR/tp-shot-20260101T000000Z-studio-1.png" \
    (string join ' ' $shots) \
    'screenshots are listed newest first'
assert_equal "$TP_SHOT_DIR/tp-shot-20260102T000000Z-laptop-2.png" (tp shot) 'tp shot returns the newest screenshot'
assert_equal "$TP_SHOT_DIR/tp-shot-20260102T000000Z-laptop-2.png" (tp shot list 1) 'tp shot list accepts a result limit'
assert_equal "$TP_SHOT_DIR" (tp shot dir) 'tp shot dir returns the screenshot directory'
if tp shot latest extra >/dev/null 2>&1
    fail 'tp shot latest accepted an extra argument'
end
printf 'ok - tp shot latest rejects extra arguments\n'
for invalid_args in 'list nope' 'list 0' 'list 1 extra'
    set -l parts (string split ' ' "$invalid_args")
    tp shot $parts >/dev/null 2>&1
    assert_equal 2 "$status" "tp shot $invalid_args returns a usage error"
end
set -l oversized_output (tp shot list 999999999999999999999999 2>&1)
set -l oversized_status $status
assert_equal 2 "$oversized_status" 'tp shot list rejects an oversized count'
if string match -qr 'Result too large|Invalid index' -- "$oversized_output"
    fail 'tp shot list exposed a Fish numeric error for an oversized count'
end
printf 'ok - oversized screenshot counts fail without Fish diagnostics\n'

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
