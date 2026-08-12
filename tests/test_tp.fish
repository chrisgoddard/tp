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

# Pi publishes @pi_session_id and @pi_pid as pane options on the pane it runs in.
# Listings read them from one list-sessions call, so these checks set them the
# same way Pi does.
_tp_set_session_name demo_002 'labelled work'
tmux set-option -p -t demo_002 @pi_session_id 019ff650-ac6d-7641-bb90-4475b973cc82
tmux set-option -p -t demo_002 @pi_pid $fish_pid
tmux set-option -p -t demo_010 @pi_session_id aaaaaaaa-dead-beef-0000-000000000000
tmux set-option -p -t demo_010 @pi_pid 2147483646

_tp_load_session_metadata
assert_equal \
    ' pi:019ff650-ac6d' \
    (_tp_session_suffix demo_002 | string replace -- ' [labelled work]' '') \
    'a live Pi session contributes its abbreviated id'
assert_equal '' (_tp_session_suffix demo_001) 'a session running no Pi contributes no id'
assert_equal '' (_tp_session_suffix demo_010) 'an id left behind by a dead Pi process is suppressed'

# Liveness must not depend on owning the process. `kill -0` fails with EPERM for
# another user's live process, so a root-owned pid stands in for that case.
tmux set-option -p -t demo_010 @pi_pid 1
_tp_load_session_metadata
assert_equal ' pi:aaaaaaaa-dead' (_tp_session_suffix demo_010) 'a live process owned by another user still counts as live'

# An older Pi publishes an id with no pid. The id is still shown: without a pid
# there is nothing to disprove, and hiding it would lose real information.
tmux set-option -p -t demo_010 -u @pi_pid
_tp_load_session_metadata
assert_equal ' pi:aaaaaaaa-dead' (_tp_session_suffix demo_010) 'an id published without a pid is still shown'
tmux set-option -p -t demo_010 -u @pi_session_id

set -l ls_output (tp ls)
if not contains -- '  002  →  demo_002 [labelled work] pi:019ff650-ac6d' $ls_output
    fail 'tp ls does not show the label and Pi session id together'
end
printf 'ok - tp ls shows the label and Pi session id together\n'

set -l global_output (tp global)
if not contains -- '   2  →  demo_002 [labelled work] pi:019ff650-ac6d' $global_output
    fail 'tp global does not show the Pi session id'
end
printf 'ok - tp global shows the Pi session id\n'

set -l all_output (tp all)
if not contains -- '  demo_002 [labelled work] pi:019ff650-ac6d' $all_output
    fail 'tp all does not show the Pi session id'
end
printf 'ok - tp all shows the Pi session id\n'

# A session name absent from the cache must not delete the caller's line: in
# Fish, a command substitution that prints nothing expands to zero elements.
set -g __tp_session_metadata
assert_equal '' (_tp_session_suffix demo_001) 'an uncached session still yields an empty suffix'
_tp_load_session_metadata

# ── Session state ───────────────────────────────────────────────────────────
#
# Pi publishes what it is doing alongside its identity, so a listing can show a
# session waiting on a prompt without anyone attaching to it.

assert_equal '3m' (_tp_format_duration 187) 'a duration under an hour reads in minutes'
assert_equal '45s' (_tp_format_duration 45) 'a duration under a minute reads in seconds'
assert_equal '2h' (_tp_format_duration 7500) 'a duration under a day reads in hours'
assert_equal '3d' (_tp_format_duration 259200) 'a long duration reads in days'
_tp_format_duration 'not-a-number' >/dev/null 2>&1
assert_equal 1 "$status" 'a non-numeric duration is rejected'

# The fields are returned one per line, most important first, so a caller can
# drop trailing ones to fit the terminal without re-deciding what matters.
set -l state_fields (_tp_pi_state_fields blocked bash (math (date +%s) - 187) 24 gpt-5.6-sol)
assert_equal 3 (count $state_fields) 'state, context and model are separate fields'
assert_equal '⏸ blocked:bash 3m' "$state_fields[1]" 'a blocked session names the tool holding it'
assert_equal '24%' "$state_fields[2]" 'context usage is rendered as a percentage'
assert_equal 'gpt-5.6-sol' "$state_fields[3]" 'the model is rendered last'

# A tool name outliving the tool would read as nonsense ("idle:bash").
set -l idle_fields (_tp_pi_state_fields idle bash (date +%s) '' '')
assert_equal '○ idle 0s' "$idle_fields[1]" 'an idle session does not name a stale tool'
set -l thinking_fields (_tp_pi_state_fields thinking bash (date +%s) '' '')
assert_equal '● thinking 0s' "$thinking_fields[1]" 'a thinking session does not name a stale tool'

_tp_pi_state_fields '' '' '' '' '' >/dev/null 2>&1
assert_equal 1 "$status" 'a session publishing no state renders nothing'

# A Pi too old to publish state still lists; only the state is missing.
set -l partial (_tp_pi_state_fields idle '' '' '' '')
assert_equal 1 (count $partial) 'a state with no extras is still rendered'
assert_equal '○ idle' "$partial[1]" 'a state with no timestamp omits the age'

# Fields are dropped from the end, so the state survives a narrow terminal.
assert_equal \
    ' · one · two' \
    (_tp_fit_fields 40 0 one two) \
    'every field is shown when there is room'
assert_equal \
    ' · one · two' \
    (_tp_fit_fields 12 0 one two) \
    'a field that exactly fills the line is kept'
assert_equal \
    ' · one' \
    (_tp_fit_fields 11 0 one two) \
    'a field one column too wide is dropped'
assert_equal \
    '' \
    (_tp_fit_fields 10 9 one two) \
    'no field is shown when the prefix already fills the line'

# End to end through the listing, against a live pid.
tmux set-option -p -t demo_002 @pi_state blocked
tmux set-option -p -t demo_002 @pi_tool ask
tmux set-option -p -t demo_002 @pi_state_since (math (date +%s) - 90)
tmux set-option -p -t demo_002 @pi_ctx_pct 24
tmux set-option -p -t demo_002 @pi_model gpt-5.6-sol
set -gx COLUMNS 200
_tp_load_session_metadata
assert_equal \
    ' [labelled work] pi:019ff650-ac6d · ⏸ blocked:ask 1m · 24% · gpt-5.6-sol' \
    (_tp_session_suffix demo_002) \
    'a listing shows the label, id and full state together'

# A SIGKILLed Pi leaves its last state on the pane forever, so a state is only
# trustworthy while the process that published it is alive.
tmux set-option -p -t demo_002 @pi_pid 999999
_tp_load_session_metadata
assert_equal \
    ' [labelled work]' \
    (_tp_session_suffix demo_002) \
    'a dead Pi shows neither its id nor its last state'
tmux set-option -p -t demo_002 @pi_pid $fish_pid

# A narrow terminal keeps the state and drops what follows it.
set -gx COLUMNS 90
_tp_load_session_metadata
assert_equal \
    ' [labelled work] pi:019ff650-ac6d · ⏸ blocked:ask 1m' \
    (_tp_session_suffix demo_002) \
    'a narrow terminal keeps the state and drops the rest'
set -gx COLUMNS 200

# command-guard publishes `blocked` on its own, but the liveness check needs the
# identity that pi-caair-dev-tools publishes. Without it there is no process to
# verify against, so no state is claimed.
tmux set-option -p -t demo_001 @pi_state blocked
_tp_load_session_metadata
assert_equal '' (_tp_session_suffix demo_001) 'a state with no identity behind it is not shown'
tmux set-option -p -t demo_001 -u @pi_state

# ── Colour ──────────────────────────────────────────────────────────────────
#
# Colour is decided once at `tp` entry: `isatty stdout` is only truthful at the
# top level, and every listing line is built inside a command substitution whose
# stdout is a pipe even on a terminal.

set -l saved_no_color_set 0
set -q NO_COLOR; and set saved_no_color_set 1
set -e NO_COLOR

set -gx TP_COLOR never
_tp_set_colour_enabled
assert_equal 0 "$__tp_colour" 'TP_COLOR=never disables colour'
assert_equal 'plain' (_tp_colour red plain) 'no escapes are emitted when colour is off'

set -gx TP_COLOR always
_tp_set_colour_enabled
assert_equal 1 "$__tp_colour" 'TP_COLOR=always keeps colour through a pipe'
# set_color writes escapes unconditionally, so the wrapper is what suppresses
# them; when it does not, the text must still be intact between them.
set -l coloured (_tp_colour red plain)
assert_equal 'plain' (string replace -ra '\e\[[0-9;]*m|\e\(.' '' -- "$coloured") 'colour wraps the text without altering it'
if test "$coloured" = plain
    fail 'TP_COLOR=always emitted no escapes'
end
printf 'ok - TP_COLOR=always emits escapes\n'

# NO_COLOR is honoured over everything: it is the convention users already have.
set -gx NO_COLOR 1
_tp_set_colour_enabled
assert_equal 0 "$__tp_colour" 'NO_COLOR wins over TP_COLOR=always'
set -e NO_COLOR

# A width decision must not change because a field carries colour escapes.
assert_equal 7 (_tp_visible_length (_tp_colour red blocked)) 'a coloured string measures its visible width'
assert_equal 7 (_tp_visible_length blocked) 'an uncoloured string measures the same'
# Fish 3.7's `set_color normal` appends a character-set reset (ESC ( B) that
# older stripping missed, so a coloured field measured three columns too wide
# and the layout dropped fields that actually fit. Build the sequence directly
# rather than depending on the running Fish version's set_color output.
assert_equal 7 (_tp_visible_length (printf '\e[31mblocked\e[m\e(B')) 'a character-set reset does not widen a coloured string'

set -gx TP_COLOR always
_tp_set_colour_enabled
assert_equal \
    ' · one · two' \
    (string replace -ra '\e\[[0-9;]*m|\e\(.' '' -- (_tp_fit_fields 12 0 (_tp_colour red one) (_tp_colour red two))) \
    'colour escapes do not consume the width budget'

# The states a user acts on must be visually distinct from each other.
set -l blocked_line (_tp_pi_state_fields blocked bash (date +%s) '' '')
set -l idle_line (_tp_pi_state_fields idle '' (date +%s) '' '')
if test "$blocked_line[1]" = "$idle_line[1]"
    fail 'blocked and idle render identically'
end
printf 'ok - blocked and idle are visually distinct\n'

# Context usage is coloured only when it is worth acting on.
set -l low (_tp_pi_state_fields idle '' (date +%s) 24 '')
set -l high (_tp_pi_state_fields idle '' (date +%s) 91 '')
assert_equal '24%' (string replace -ra '\e\[[0-9;]*m|\e\(.' '' -- "$low[2]") 'a low context percent still reads plainly'
assert_equal '91%' (string replace -ra '\e\[[0-9;]*m|\e\(.' '' -- "$high[2]") 'a high context percent still reads plainly'
if test "$low[2]" = "$high[2]"
    fail 'a nearly-full context window is not distinguished'
end
printf 'ok - a nearly-full context window is coloured differently\n'

set -gx TP_COLOR never
_tp_set_colour_enabled
if test "$saved_no_color_set" -eq 1
    set -gx NO_COLOR 1
end

for state_option in @pi_state @pi_tool @pi_state_since @pi_ctx_pct @pi_model
    tmux set-option -p -t demo_002 -u $state_option
end
_tp_load_session_metadata

# The displayed id must reach past the UUIDv7 timestamp into the random block.
# Eight characters is only a 65-second window, which sessions started together
# in that window share. `tp sid` remains the source of the exact full id.
assert_equal 13 $__tp_pi_id_display_length 'the displayed Pi id reaches past the UUIDv7 timestamp'
assert_equal \
    019ff650-ac6d-7641-bb90-4475b973cc82 \
    (tp sid 2) \
    'tp sid prints the full untruncated Pi session id'
assert_equal \
    019ff650-ac6d-7641-bb90-4475b973cc82 \
    (_tp_pi_session_id demo_002) \
    'the id resolver returns the full id'

tp sid 1 >/dev/null 2>&1
assert_equal 1 "$status" 'tp sid fails on a session running no Pi'
tp sid 99 >/dev/null 2>&1
assert_equal 1 "$status" 'tp sid fails on a session that does not exist'
for invalid_sid_args in '' '1 extra'
    set -l parts (string split ' ' -- "$invalid_sid_args" | string match -v '')
    tp sid $parts >/dev/null 2>&1
    assert_equal 2 "$status" "tp sid rejects '$invalid_sid_args'"
end

# --restart rebuilds the recorded command rather than inventing a new one, so
# model/thinking flags survive while stale session selection is dropped.
set -l SID 019ff650-ac6d-7641-bb90-4475b973cc82
assert_equal \
    'pi --name issue-filer --session '$SID \
    (string join -- ' ' (_tp_restart_command 'pi --name issue-filer --resume' $SID)) \
    'restart drops --resume and appends the recorded session id'
assert_equal \
    'pi --model sonnet:high --session '$SID \
    (string join -- ' ' (_tp_restart_command 'pi --continue --model sonnet:high' $SID)) \
    'restart drops --continue and keeps other Pi flags'
assert_equal \
    'pi --name keep --session '$SID \
    (string join -- ' ' (_tp_restart_command "pi --session 019aaaaa-1111-2222-3333-444444444444 --name keep" $SID)) \
    'restart replaces an existing --session and its value'
assert_equal \
    'pi --name keep --session '$SID \
    (string join -- ' ' (_tp_restart_command 'pi --session=019aaaaa-1111 --name keep' $SID)) \
    'restart replaces a joined --session=value'

# Argument boundaries must survive the round trip through TP_CMD.
set -l quoted_command (_tp_serialize_command pi --name 'two words' --model openai/gpt-5)
set -l quoted_parts (_tp_restart_command "$quoted_command" $SID)
assert_equal \
    'pi|--name|two words|--model|openai/gpt-5|--session|'$SID \
    (string join -- '|' $quoted_parts) \
    'restart preserves quoted argument boundaries'

# `tp pi --update-first` wraps Pi as `fish -c '<updater>' -- <pi args>`. The
# wrapper's own -c must not be mistaken for Pi's --continue.
set -l wrapped (_tp_restart_command "fish -c 'pi update --all; and pi \$argv' -- --name upgrade" $SID)
assert_equal \
    'fish|-c|pi update --all; and pi $argv|--|--name|upgrade|--session|'$SID \
    (string join -- '|' $wrapped) \
    'restart keeps an update-first wrapper intact'

_tp_restart_command '' $SID >/dev/null 2>&1
assert_equal 1 "$status" 'restart rejects an empty recorded command'

# Pi's session directory name is derived from the working directory. Getting it
# wrong would make every restart look like it had nothing to resume.
assert_equal \
    "$HOME/.pi/agent/sessions/--tmp-demo--" \
    (_tp_pi_session_dir /tmp/demo) \
    'the session directory mirrors the path-to-dashes rule Pi uses'

# Pi publishes its id at startup but writes the log only on the first message,
# so an id alone does not mean there is a conversation to resume.
set -l fake_session_root "$test_root/fake-pi-home"
set -l fake_session_dir "$fake_session_root/.pi/agent/sessions/--tmp-demo--"
mkdir -p "$fake_session_dir"
set -l original_home "$HOME"
set -gx HOME "$fake_session_root"
_tp_pi_session_log /tmp/demo $SID >/dev/null 2>&1
assert_equal 1 "$status" 'a published id with no log file is not resumable'
touch "$fake_session_dir/2026-01-01T00-00-00-000Z_$SID.jsonl"
assert_equal \
    "$fake_session_dir/2026-01-01T00-00-00-000Z_$SID.jsonl" \
    (_tp_pi_session_log /tmp/demo $SID) \
    'an existing log file is found for the published id'
set -gx HOME "$original_home"

# --restart refuses a session with no live Pi rather than acting on it.
_tp_restart_session demo_001 >/dev/null 2>&1
assert_equal 1 "$status" 'restart refuses a session running no Pi'
if not tmux has-session -t '=demo_001' 2>/dev/null
    fail 'restart killed a session it had refused'
end
printf 'ok - a refused restart leaves the session running\n'

_tp_restart_session demo_404 >/dev/null 2>&1
assert_equal 1 "$status" 'restart refuses a session that does not exist'

tp 1 --restart >/dev/null 2>&1
assert_equal 1 "$status" 'tp <n> --restart refuses a session running no Pi'
tp global 1 --restart >/dev/null 2>&1
assert_equal 1 "$status" 'tp global <i> --restart refuses a session running no Pi'
tp 1 --restart extra >/dev/null 2>&1
assert_equal 2 "$status" 'tp <n> rejects an unknown argument'

_tp_set_session_name demo_002 ''
tmux set-option -p -t demo_002 -u @pi_session_id
tmux set-option -p -t demo_002 -u @pi_pid

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
