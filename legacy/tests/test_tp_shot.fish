#!/usr/bin/env fish

set -g test_root (mktemp -d -t tp-shot-test.XXXXXX)
set -g test_log "$test_root/log"
set -g fake_bin "$test_root/bin"
set -g remote_dir "$test_root/remote shots"
mkdir -p "$test_log" "$fake_bin" "$remote_dir"
set -gx TP_SHOT_TEST_REAL_NOHUP (command -s nohup)

function __tp_shot_test_cleanup --on-event fish_exit
    rm -rf "$test_root"
end

function fail
    printf 'not ok - %s\n' (string join ' ' $argv) >&2
    exit 1
end

function pass
    printf 'ok - %s\n' (string join ' ' $argv)
end

function assert_equal
    set -l expected $argv[1]
    set -l actual $argv[2]
    set -l description $argv[3]

    if test "$expected" != "$actual"
        fail "$description (expected '$expected', got '$actual')"
    end
    pass "$description"
end

function assert_file_contains
    set -l expected $argv[1]
    set -l file $argv[2]
    set -l description $argv[3]

    if not test -f "$file"
        fail "$description (missing '$file')"
    end

    set -l actual (string collect < "$file")
    assert_equal "$expected" "$actual" "$description"
end

function file_mode
    set -l mode (stat -c '%a' "$argv[1]" 2>/dev/null)
    or set mode (stat -f '%Lp' "$argv[1]" 2>/dev/null)
    printf '%s\n' "$mode"
end

function wait_for_file
    set -l path $argv[1]
    set -l attempts $argv[2]
    set -l attempt 0
    while test "$attempt" -lt "$attempts"
        if test -f "$path"
            return
        end
        sleep 0.05
        set attempt (math "$attempt + 1")
    end
    return 1
end

function wait_for_absent
    set -l path $argv[1]
    set -l attempts $argv[2]
    set -l attempt 0
    while test "$attempt" -lt "$attempts"
        if not test -e "$path"
            return
        end
        sleep 0.05
        set attempt (math "$attempt + 1")
    end
    return 1
end

function wait_for_log_match
    set -l path $argv[1]
    set -l pattern $argv[2]
    set -l attempts $argv[3]
    set -l attempt 0
    while test "$attempt" -lt "$attempts"
        if test -f "$path"; and string match -qi "$pattern" -- (string collect < "$path")
            return
        end
        sleep 0.05
        set attempt (math "$attempt + 1")
    end
    return 1
end

function write_mock
    string join \n $argv[2..] >"$argv[1]"
end

write_mock "$fake_bin/ssh" \
    '#!/usr/bin/env fish' \
    'set -l count 0' \
    'if test -f "$TP_SHOT_TEST_LOG/ssh-count"' \
    '    set count (cat "$TP_SHOT_TEST_LOG/ssh-count")' \
    end \
    'set count (math "$count + 1")' \
    'printf \'%s\n\' "$count" > "$TP_SHOT_TEST_LOG/ssh-count"' \
    'printf \'%s\n\' $argv > "$TP_SHOT_TEST_LOG/ssh-args-$count"' \
    'set -l remote_command $argv[-1]' \
    'if string match -q \'*mkdir -p*\' -- "$remote_command"' \
    '    if test "$TP_SHOT_TEST_SETUP_FAIL" = 1' \
    '        exit 17' \
    '    end' \
    '    mkdir -p "$TP_SHOT_TEST_REMOTE"' \
    '    chmod 700 "$TP_SHOT_TEST_REMOTE"' \
    '    printf \'%s\n\' "$TP_SHOT_TEST_REMOTE"' \
    'else if string match -q \'*chmod 600*\' -- "$remote_command"' \
    '    if test "$TP_SHOT_TEST_CHMOD_FAIL" = 1' \
    '        exit 18' \
    '    end' \
    '    fish --no-config -c "$remote_command"' \
    'else if string match -q \'*rm -f*\' -- "$remote_command"' \
    '    fish --no-config -c "$remote_command"' \
    end

write_mock "$fake_bin/scp" \
    '#!/usr/bin/env fish' \
    'set -l count 0' \
    'if test -f "$TP_SHOT_TEST_LOG/scp-count"' \
    '    set count (cat "$TP_SHOT_TEST_LOG/scp-count")' \
    end \
    'set count (math "$count + 1")' \
    'printf \'%s\n\' "$count" > "$TP_SHOT_TEST_LOG/scp-count"' \
    'printf \'%s\n\' $argv > "$TP_SHOT_TEST_LOG/scp-args"' \
    'set -l source $argv[-2]' \
    'set -l destination $argv[-1]' \
    'set -l remote_path (string replace -r \'^[^:]+:\' \'\' -- "$destination")' \
    'if test -n "$TP_SHOT_TEST_SCP_STARTED"' \
    '    printf partial-image > "$remote_path"' \
    '    printf \'%s\n\' "$remote_path" > "$TP_SHOT_TEST_SCP_STARTED"' \
    '    while not test -f "$TP_SHOT_TEST_SCP_RELEASE"' \
    '        sleep 0.01' \
    '    end' \
    end \
    'if test -n "$TP_SHOT_TEST_SCP_DELAY"' \
    '    sleep "$TP_SHOT_TEST_SCP_DELAY"' \
    end \
    'if test "$TP_SHOT_TEST_SCP_FAIL" = 1' \
    '    printf \'partial-image\' > "$remote_path"' \
    '    printf \'%s\n\' "$remote_path" > "$TP_SHOT_TEST_LOG/uploaded-path"' \
    '    exit 23' \
    end \
    'cp "$source" "$remote_path"' \
    'printf \'%s\n\' "$remote_path" > "$TP_SHOT_TEST_LOG/uploaded-path"'

write_mock "$fake_bin/pbcopy" \
    '#!/usr/bin/env fish' \
    'cat > "$TP_SHOT_TEST_LOG/clipboard"'

write_mock "$fake_bin/screencapture" \
    '#!/usr/bin/env fish' \
    'printf \'%s\n\' $argv > "$TP_SHOT_TEST_LOG/screencapture-args"' \
    'if test "$TP_SHOT_TEST_CANCEL" = 1' \
    '    exit 0' \
    end \
    'printf \'captured-image\' > "$argv[-1]"'

write_mock "$fake_bin/osascript" \
    '#!/usr/bin/env fish' \
    'printf \'%s\n\' $argv > "$TP_SHOT_TEST_LOG/osascript-args"'

write_mock "$fake_bin/terminal-notifier" \
    '#!/usr/bin/env fish' \
    'printf \'%s\n\' $argv > "$TP_SHOT_TEST_LOG/terminal-notifier-args"' \
    'if test "$TP_SHOT_TEST_TERMINAL_NOTIFIER_FAIL" = 1' \
    '    exit 44' \
    end

write_mock "$fake_bin/nohup" \
    '#!/usr/bin/env fish' \
    'if test "$TP_SHOT_TEST_NOHUP_FAIL" = 1' \
    '    echo "mock nohup startup failure" >&2' \
    '    exit 45' \
    end \
    'command "$TP_SHOT_TEST_REAL_NOHUP" $argv'

write_mock "$fake_bin/uuidgen" \
    '#!/usr/bin/env fish' \
    'set -l count 0' \
    'if test -f "$TP_SHOT_TEST_LOG/uuid-count"' \
    '    set count (cat "$TP_SHOT_TEST_LOG/uuid-count")' \
    end \
    'set count (math "$count + 1")' \
    'printf \'%s\n\' "$count" > "$TP_SHOT_TEST_LOG/uuid-count"' \
    'printf \'00000000-0000-4000-8000-%012d\n\' "$count"'

chmod +x "$fake_bin"/*
set -gx PATH "$fake_bin" $PATH
set -gx TP_SHOT_TEST_LOG "$test_log"
set -gx TP_SHOT_TEST_REMOTE "$remote_dir"
set -gx TP_SHOT_HOST ignored-default
set -gx TP_SHOT_NOTIFIER osascript

set -l repo_root (path resolve (dirname (status filename))/..)
source "$repo_root/functions/tp-shot.fish"

set -l setup_command (_tp_shot_remote_setup_command)
for remote_shell in fish sh
    set -l shell_home "$test_root/$remote_shell-home"
    mkdir -p "$shell_home"
    set -l shell_args -c
    if test "$remote_shell" = fish
        set shell_args --no-config -c
    end
    set -l setup_output (env HOME="$shell_home" "$remote_shell" $shell_args "$setup_command" 2>&1)
    or fail "$remote_shell could not run the remote setup command: $setup_output"
    set -l expected_dir "$shell_home/.cache/pi/screenshots"
    assert_equal "$expected_dir" "$setup_output" "remote setup reports its path under $remote_shell"
    assert_equal 700 (file_mode "$expected_dir") "remote setup creates a private directory under $remote_shell"
end

set -l custom_remote_dir (string join '' "$test_root/" "custom remote dir's " '$cash;\slash"quote')
set setup_command (_tp_shot_remote_setup_command "$custom_remote_dir")
for remote_shell in fish sh
    set -l shell_args -c
    if test "$remote_shell" = fish
        set shell_args --no-config -c
    end
    set -l setup_output ("$remote_shell" $shell_args "$setup_command" 2>&1)
    or fail "$remote_shell could not run the custom remote setup command: $setup_output"
    assert_equal "$custom_remote_dir" "$setup_output" "custom remote setup reports its exact path under $remote_shell"
    assert_equal 700 (file_mode "$custom_remote_dir") "custom remote setup creates a private directory under $remote_shell"
end

set -l input "$test_root/source image.png"
printf existing-image >"$input"
set -l output (tp-shot --host studio.test "$input" 2>&1)
or fail "existing image upload failed: $output"

set -l ssh_args (cat "$test_log/ssh-args-1")
set -l host_index (contains -i -- studio.test $ssh_args)
or fail 'explicit host is not passed to ssh'
set -l previous_index (math "$host_index - 1")
assert_equal -- "$ssh_args[$previous_index]" 'ssh option parsing ends before the explicit host'
pass 'explicit host is passed to ssh'
set -l clipboard_text (string collect < "$test_log/clipboard")
if not string match -q "$remote_dir/tp-shot-*.png" -- "$clipboard_text"
    fail "clipboard path has an unexpected shape: $clipboard_text"
end
pass 'clipboard receives only the remote screenshot path'

set -l uploaded_path "$clipboard_text"
assert_file_contains existing-image "$uploaded_path" 'existing image is copied to the remote path'
assert_equal 700 (file_mode "$remote_dir") 'remote screenshot directory is private'
assert_equal 600 (file_mode "$uploaded_path") 'uploaded screenshot is private'
set -l chmod_args (cat "$test_log/ssh-args-2")
set host_index (contains -i -- studio.test $chmod_args)
or fail 'explicit host is not passed to the permission command'
set previous_index (math "$host_index - 1")
assert_equal -- "$chmod_args[$previous_index]" 'ssh option parsing ends before the permission-command host'
if string match -q '*chmod 600 -- *' -- "$chmod_args[-1]"
    fail 'uploaded screenshot permission command uses GNU-only -- syntax'
end
if not string match -q '*chmod 600 *' -- "$chmod_args[-1]"
    fail 'uploaded screenshot permission command is missing chmod 600'
end
pass 'uploaded screenshot permission command is compatible with macOS chmod'
set -l scp_args (cat "$test_log/scp-args")
if not string match -q "studio.test:$uploaded_path" -- "$scp_args[-1]"
    fail 'scp destination does not use the selected host and remote path'
end
pass 'scp receives the selected host and remote path'

rm -f "$test_log/clipboard" "$test_log/screencapture-args"
set output (tp-shot 2>&1)
or fail "interactive capture upload failed: $output"
set ssh_args (cat "$test_log/ssh-args-3")
if not contains -- ignored-default $ssh_args
    fail 'TP_SHOT_HOST is not passed to ssh'
end
pass 'TP_SHOT_HOST supplies the default host'
if not test -s "$test_log/screencapture-args"
    fail 'interactive capture did not call screencapture'
end
pass 'no file argument opens an interactive screenshot capture'
set clipboard_text (string collect < "$test_log/clipboard")
set uploaded_path "$clipboard_text"
assert_file_contains captured-image "$uploaded_path" 'captured image is copied to the remote path'

set -gx TP_SHOT_TEST_CANCEL 1
rm -f "$test_log/clipboard"
if tp-shot >/dev/null 2>&1
    fail 'cancelled capture unexpectedly succeeded'
end
if test -e "$test_log/clipboard"
    fail 'cancelled capture changed the clipboard'
end
pass 'cancelled capture exits without changing the clipboard'
set -e TP_SHOT_TEST_CANCEL

set -gx TP_SHOT_TEST_SCP_FAIL 1
rm -f "$test_log/clipboard"
if tp-shot "$input" >/dev/null 2>&1
    fail 'failed scp unexpectedly succeeded'
end
set uploaded_path (cat "$test_log/uploaded-path")
if test -e "$uploaded_path"
    fail 'failed scp left a partial screenshot behind'
end
pass 'failed scp removes its partial screenshot'
set -l cleanup_args (cat "$test_log/ssh-args-"(cat "$test_log/ssh-count"))
if string match -q '*rm -f -- *' -- "$cleanup_args[-1]"
    fail 'remote cleanup command uses GNU-only -- syntax'
end
if not string match -q '*rm -f *' -- "$cleanup_args[-1]"
    fail 'remote cleanup command is missing rm -f'
end
pass 'remote cleanup command is compatible with macOS rm'
if test -e "$test_log/clipboard"
    fail 'failed upload changed the clipboard'
end
pass 'failed upload exits without changing the clipboard'
set -e TP_SHOT_TEST_SCP_FAIL

set -gx TP_SHOT_TEST_CHMOD_FAIL 1
rm -f "$test_log/clipboard"
if tp-shot "$input" >/dev/null 2>&1
    fail 'failed permission hardening unexpectedly succeeded'
end
set uploaded_path (cat "$test_log/uploaded-path")
if test -e "$uploaded_path"
    fail 'permission failure left the uploaded screenshot behind'
end
if test -e "$test_log/clipboard"
    fail 'permission failure changed the clipboard'
end
pass 'permission failure removes the upload and leaves the clipboard unchanged'
set -e TP_SHOT_TEST_CHMOD_FAIL

set -l scp_count (cat "$test_log/scp-count")
set -gx TP_SHOT_TEST_SETUP_FAIL 1
rm -f "$test_log/clipboard"
if tp-shot "$input" >/dev/null 2>&1
    fail 'failed remote setup unexpectedly succeeded'
end
assert_equal "$scp_count" (cat "$test_log/scp-count") 'failed remote setup does not invoke scp'
if test -e "$test_log/clipboard"
    fail 'failed remote setup changed the clipboard'
end
pass 'failed remote setup exits without changing the clipboard'
set -e TP_SHOT_TEST_SETUP_FAIL

set -l ssh_count (cat "$test_log/ssh-count")
rm -f "$test_log/screencapture-args"
if tp-shot --host= >/dev/null 2>&1
    fail 'empty host unexpectedly succeeded'
end
assert_equal "$ssh_count" (cat "$test_log/ssh-count") 'empty host is rejected before ssh'
if test -e "$test_log/screencapture-args"
    fail 'empty host opened the screenshot picker'
end
pass 'empty host is rejected before capture'

if tp-shot "$test_root/missing.png" >/dev/null 2>&1
    fail 'missing input unexpectedly succeeded'
end
pass 'missing input is rejected'

rm -f "$test_log/osascript-args"
tp-shot --notify-test >/dev/null 2>&1
or fail 'notification test failed'
if not string match -qi '*test notification*' -- (string collect < "$test_log/osascript-args")
    fail 'notification test did not send a macOS notification'
end
pass 'notification test sends a macOS notification'

set -gx TP_SHOT_NOTIFIER auto
set -gx TP_SHOT_TEST_TERMINAL_NOTIFIER_FAIL 1
rm -f "$test_log/terminal-notifier-args" "$test_log/osascript-args"
tp-shot --notify-test >/dev/null 2>&1
or fail 'automatic notification fallback failed'
if not test -s "$test_log/terminal-notifier-args"; or not test -s "$test_log/osascript-args"
    fail 'automatic notifier did not fall back from terminal-notifier to osascript'
end
pass 'automatic notifications fall back to osascript'
set -e TP_SHOT_TEST_TERMINAL_NOTIFIER_FAIL

set -gx TP_SHOT_NOTIFIER none
set output (tp-shot --notify-test 2>&1)
if test $status -eq 0; or not string match -qi '*notifications are disabled*' -- "$output"
    fail 'notification test claimed success while notifications were disabled'
end
pass 'notification test reports when notifications are disabled'
set -gx TP_SHOT_NOTIFIER osascript

set -l handshake_source "$test_root/handshake-source.png"
set -l handshake_start "$test_log/handshake-started"
set -l handshake_ownership "$test_log/handshake-owned"
set -l handshake_final "$remote_dir/handshake.png"
set -l handshake_uploading "$remote_dir/.handshake.png.uploading"
printf handshake-image >"$handshake_source"
rm -f "$handshake_start" "$handshake_ownership" "$handshake_final" "$handshake_uploading"
set -l scp_before_handshake (cat "$test_log/scp-count")
fish --no-config -c 'source "$argv[1]"; and _tp_shot_async_entry $argv[2..]' -- \
    "$repo_root/functions/tp-shot.fish" "$handshake_start" "$handshake_ownership" ignored-host "$handshake_source" "$remote_dir" "$handshake_final" false &
set -l handshake_pid $last_pid
wait_for_file "$handshake_start" 40
or fail 'async worker did not announce startup before ownership transfer'
sleep 0.1
assert_equal "$scp_before_handshake" (cat "$test_log/scp-count") 'async worker does not start scp before ownership transfer'
if test -e "$handshake_final"; or test -e "$handshake_uploading"
    fail 'async worker created a remote path before ownership transfer'
end
pass 'async worker keeps both remote paths absent before ownership transfer'
printf '%s\n' test-parent >"$handshake_ownership"
wait_for_file "$handshake_final" 40
or fail 'async worker did not upload after ownership transfer'
wait "$handshake_pid"
or fail 'async worker failed after ownership transfer'
assert_file_contains handshake-image "$handshake_final" 'async worker uploads only after ownership transfer'
if test -e "$handshake_start"; or test -e "$handshake_ownership"
    fail 'async worker left startup handshake markers behind'
end
pass 'async worker removes startup handshake markers after ownership transfer'
rm -f "$handshake_final"

set -gx TP_SHOT_REMOTE_DIR "$remote_dir"
set -gx TP_SHOT_LOG_DIR "$test_root/async logs"
set -gx TP_SHOT_TEST_SCP_STARTED "$test_log/scp-paused"
set -gx TP_SHOT_TEST_SCP_RELEASE "$test_log/scp-release"
rm -f "$TP_SHOT_TEST_SCP_STARTED" "$TP_SHOT_TEST_SCP_RELEASE"
rm -f "$test_log/clipboard" "$test_log/osascript-args"
set output (tp-shot --async "$input" 2>&1)
or fail "async upload could not be queued: $output"
set -l async_path (string collect < "$test_log/clipboard")
set -l expected_async_path "$remote_dir/tp-shot-00000000-0000-4000-8000-000000000001.png"
assert_equal "$expected_async_path" "$async_path" 'async mode copies the UUID-based final path immediately'
wait_for_file "$TP_SHOT_TEST_SCP_STARTED" 40
or fail 'async upload did not reach its paused partial transfer'
set -l uploading_path (string collect < "$TP_SHOT_TEST_SCP_STARTED")
set -l expected_uploading_path "$remote_dir/.tp-shot-00000000-0000-4000-8000-000000000001.png.uploading"
assert_equal "$expected_uploading_path" "$uploading_path" 'async upload writes to the hidden temporary path'
assert_file_contains partial-image "$uploading_path" 'async temporary path can contain partial upload data'
if test -e "$async_path"
    fail 'async final path appeared while only partial upload data existed'
end
pass 'async mode returns before the upload completes'
printf changed-after-queue >"$input"
touch "$TP_SHOT_TEST_SCP_RELEASE"
wait_for_file "$async_path" 100
or fail 'async upload did not publish its final path'
assert_file_contains existing-image "$async_path" 'async upload atomically publishes the complete image'
printf existing-image >"$input"
assert_equal 600 (file_mode "$async_path") 'async upload publishes a private image'
if test -e "$expected_uploading_path"
    fail 'async upload left its temporary remote file behind'
end
set -l async_scp_args (cat "$test_log/scp-args")
set -l staged_source "$async_scp_args[-2]"
if test "$staged_source" = "$input"
    fail 'async upload did not use a private source snapshot'
end
wait_for_absent "$staged_source" 40
or fail 'async upload did not clean its private source snapshot'
pass 'async upload snapshots explicit input before returning'
wait_for_log_match "$test_log/osascript-args" '*ready to paste*' 40
or fail 'async upload did not send a ready notification'
set -l success_log "$TP_SHOT_LOG_DIR/00000000-0000-4000-8000-000000000001.log"
wait_for_log_match "$success_log" '*Ready:*' 40
or fail 'async upload did not record a useful completion log'
pass 'async upload records a useful completion log'
assert_equal 600 (file_mode "$success_log") 'async upload log is private'
pass 'async upload sends a ready notification after publication'

set -e TP_SHOT_TEST_SCP_STARTED TP_SHOT_TEST_SCP_RELEASE
set -gx TP_SHOT_TEST_SCP_FAIL 1
rm -f "$test_log/clipboard" "$test_log/osascript-args"
set output (tp-shot --async 2>&1)
or fail "failed async upload could not be queued: $output"
set async_path (string collect < "$test_log/clipboard")
set -l failed_async_path "$remote_dir/tp-shot-00000000-0000-4000-8000-000000000002.png"
assert_equal "$failed_async_path" "$async_path" 'failed async upload still exposes its reserved final path'
set -l captured_source (string split '\n' < "$test_log/screencapture-args")[-1]
wait_for_log_match "$test_log/osascript-args" '*upload failed*' 100
or fail 'failed async upload did not send a failure notification'
if test -e "$failed_async_path"; or test -e "$remote_dir/.tp-shot-00000000-0000-4000-8000-000000000002.png.uploading"
    fail 'failed async upload left a remote file behind'
end
if test -e "$captured_source"
    fail 'failed async upload left its captured local image behind'
end
pass 'failed async upload cleans up and sends a failure notification'
set -e TP_SHOT_TEST_SCP_FAIL

set -gx TP_SHOT_TEST_CHMOD_FAIL 1
rm -f "$test_log/clipboard" "$test_log/osascript-args"
set output (tp-shot --async "$input" 2>&1)
or fail "async publish failure could not be queued: $output"
set -l publish_failed_path "$remote_dir/tp-shot-00000000-0000-4000-8000-000000000003.png"
assert_equal "$publish_failed_path" (string collect < "$test_log/clipboard") 'publish failure still exposes its reserved final path'
wait_for_log_match "$test_log/osascript-args" '*upload failed*' 100
or fail 'async publish failure did not send a failure notification'
if test -e "$publish_failed_path"; or test -e "$remote_dir/.tp-shot-00000000-0000-4000-8000-000000000003.png.uploading"
    fail 'async publish failure left a remote file behind'
end
set async_scp_args (cat "$test_log/scp-args")
set staged_source "$async_scp_args[-2]"
if test -e "$staged_source"
    fail 'async publish failure left its local source snapshot behind'
end
pass 'async publish failure cleans up and sends a failure notification'
set -e TP_SHOT_TEST_CHMOD_FAIL

set -gx TP_SHOT_TEST_NOHUP_FAIL 1
rm -f "$test_log/clipboard" "$test_log/osascript-args" "$test_log/screencapture-args"
set output (tp-shot --async 2>&1)
if test $status -eq 0
    fail 'async startup failure was incorrectly reported as queued'
end
set -l startup_failed_path "$remote_dir/tp-shot-00000000-0000-4000-8000-000000000004.png"
assert_equal "$startup_failed_path" (string collect < "$test_log/clipboard") 'startup failure preserves the immediately copied reserved path'
set captured_source (string split '\n' < "$test_log/screencapture-args")[-1]
if test -e "$captured_source"
    fail 'async startup failure left its captured local image behind'
end
if not string match -qi '*did not start*' -- "$output"
    fail 'async startup failure did not explain that the uploader failed to start'
end
if not string match -qi '*upload failed*' -- (string collect < "$test_log/osascript-args")
    fail 'async startup failure did not send a failure notification'
end
pass 'async startup handshake detects failure and cleans local capture'
set -e TP_SHOT_TEST_NOHUP_FAIL

set -gx TP_SHOT_TEST_SCP_DELAY 1
rm -f "$test_log/clipboard" "$test_log/osascript-args"
set output (fish --no-config -c 'source "$argv[1]"; and tp-shot --async "$argv[2]"' -- "$repo_root/functions/tp-shot.fish" "$input" 2>&1)
or fail "short-lived Fish process could not queue async upload: $output"
set async_path (string collect < "$test_log/clipboard")
set -l detached_async_path "$remote_dir/tp-shot-00000000-0000-4000-8000-000000000005.png"
assert_equal "$detached_async_path" "$async_path" 'short-lived Fish process copies its reserved path'
if test -e "$detached_async_path"
    fail 'short-lived Fish process waited for its delayed upload'
end
wait_for_file "$detached_async_path" 100
or fail 'detached worker did not survive its calling Fish process'
wait_for_log_match "$test_log/osascript-args" '*ready to paste*' 40
or fail 'surviving detached worker did not notify on completion'
pass 'detached worker survives its calling Fish process'

set -e TP_SHOT_TEST_SCP_DELAY TP_SHOT_REMOTE_DIR TP_SHOT_LOG_DIR

printf 'All tp-shot tests passed.\n'
