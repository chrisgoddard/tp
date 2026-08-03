#!/usr/bin/env fish

set -g test_root (mktemp -d -t tp-shot-test.XXXXXX)
set -g test_log "$test_root/log"
set -g fake_bin "$test_root/bin"
set -g remote_dir "$test_root/remote shots"
mkdir -p "$test_log" "$fake_bin" "$remote_dir"

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
    '    set -l uploaded_path (cat "$TP_SHOT_TEST_LOG/uploaded-path")' \
    '    chmod 600 "$uploaded_path"' \
    'else if string match -q \'*rm -f*\' -- "$remote_command"' \
    '    set -l uploaded_path (cat "$TP_SHOT_TEST_LOG/uploaded-path")' \
    '    rm -f "$uploaded_path"' \
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

chmod +x "$fake_bin"/*
set -gx PATH "$fake_bin" $PATH
set -gx TP_SHOT_TEST_LOG "$test_log"
set -gx TP_SHOT_TEST_REMOTE "$remote_dir"
set -gx TP_SHOT_HOST ignored-default

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
set -l prompt (string collect < "$test_log/clipboard")
if not string match -q "Please inspect this screenshot: $remote_dir/tp-shot-*.png" -- "$prompt"
    fail "clipboard prompt has an unexpected shape: $prompt"
end
pass 'clipboard receives a Pi-ready prompt with the remote path'

set -l uploaded_path (string replace 'Please inspect this screenshot: ' '' -- "$prompt")
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
set prompt (string collect < "$test_log/clipboard")
set uploaded_path (string replace 'Please inspect this screenshot: ' '' -- "$prompt")
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

printf 'All tp-shot tests passed.\n'
