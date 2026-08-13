function tp-shot --description "Capture or upload a screenshot for a remote Pi session"
    argparse h/help 'H/host=' a/async N/notify-test -- $argv
    or return 2

    if set -q _flag_help
        echo "Usage: tp-shot [--async] [--host HOST] [IMAGE]"
        echo "       tp-shot --notify-test"
        echo ""
        echo "Without IMAGE, open macOS's interactive screenshot picker."
        echo "Upload the image to Good Studio, then copy its remote path"
        echo "to this Mac's clipboard."
        echo ""
        echo "Options:"
        echo "  --async         Copy a UUID-based path immediately and upload in the background"
        echo "  --notify-test   Send a test completion notification without taking a screenshot"
        echo ""
        echo "Environment:"
        echo "  TP_SHOT_HOST         SSH host or alias (default: good-studio)"
        echo "  TP_SHOT_REMOTE_DIR   Async destination on the SSH host (default: matching ~/.cache/pi/screenshots path)"
        echo "  TP_SHOT_NOTIFIER     auto, terminal-notifier, osascript, or none (default: auto)"
        return
    end

    if set -q _flag_notify_test
        if set -q _flag_async; or set -q _flag_host; or test (count $argv) -gt 0
            echo "Usage: tp-shot --notify-test" >&2
            return 2
        end
        if set -q TP_SHOT_NOTIFIER; and test "$TP_SHOT_NOTIFIER" = none
            echo "tp-shot: notifications are disabled by TP_SHOT_NOTIFIER=none" >&2
            return 1
        end
        _tp_shot_notify ready "tp-shot test notification"
        or begin
            echo "tp-shot: no working macOS notification command was found" >&2
            return 1
        end
        echo "Sent a tp-shot test notification."
        return
    end

    if test (count $argv) -gt 1
        echo "Usage: tp-shot [--async] [--host HOST] [IMAGE]" >&2
        return 2
    end

    set -l host good-studio
    if set -q TP_SHOT_HOST; and test -n "$TP_SHOT_HOST"
        set host "$TP_SHOT_HOST"
    end
    if set -q _flag_host
        set host "$_flag_host"
    end
    if test -z "$host"
        echo "tp-shot: SSH host cannot be empty" >&2
        return 2
    end

    if not command -sq ssh
        echo "tp-shot: ssh is not available" >&2
        return 1
    end
    if not command -sq scp
        echo "tp-shot: scp is not available" >&2
        return 1
    end
    if set -q _flag_async
        for dependency in uuidgen nohup fish pbcopy
            if not command -sq "$dependency"
                echo "tp-shot: $dependency is required for --async" >&2
                return 1
            end
        end
    end

    set -l source_path
    set -l remove_source false
    set -l extension

    if test (count $argv) -eq 0
        if not command -sq screencapture
            echo "tp-shot: screencapture is not available; pass an existing image instead" >&2
            return 1
        end

        set -l temp_root /tmp
        if set -q TMPDIR; and test -n "$TMPDIR"
            set temp_root (string replace -r '/$' '' -- "$TMPDIR")
        end
        set source_path (mktemp "$temp_root/tp-shot.XXXXXX")
        or begin
            echo "tp-shot: could not create a temporary file" >&2
            return 1
        end
        set remove_source true
        set extension png

        command screencapture -i -t png "$source_path"
        set -l capture_status $status
        if test $capture_status -ne 0; or not test -s "$source_path"
            rm -f "$source_path"
            echo "tp-shot: screenshot cancelled" >&2
            return 1
        end
    else
        set source_path (path resolve -- "$argv[1]" 2>/dev/null)
        if test -z "$source_path"; or not test -f "$source_path"; or not test -r "$source_path"
            echo "tp-shot: cannot read '$argv[1]'" >&2
            return 1
        end

        set extension (path extension -- "$source_path" | string trim -l -c '.' | string lower)
        if not contains -- "$extension" png jpg jpeg gif webp bmp
            echo "tp-shot: unsupported image type '$extension'" >&2
            return 1
        end
    end

    if set -q _flag_async
        if test "$remove_source" = false
            set -l temp_root /tmp
            if set -q TMPDIR; and test -n "$TMPDIR"
                set temp_root (string replace -r '/$' '' -- "$TMPDIR")
            end
            set -l staged_path (mktemp "$temp_root/tp-shot.XXXXXX")
            or begin
                echo "tp-shot: could not create a private staging file" >&2
                return 1
            end
            chmod 600 "$staged_path" 2>/dev/null
            or begin
                rm -f "$staged_path"
                echo "tp-shot: could not secure the private staging file" >&2
                return 1
            end
            command cp "$source_path" "$staged_path"
            or begin
                rm -f "$staged_path"
                echo "tp-shot: could not stage '$source_path'" >&2
                return 1
            end
            set source_path "$staged_path"
            set remove_source true
        end
        _tp_shot_queue_async "$host" "$source_path" "$extension" "$remove_source"
        return $status
    end

    set -l ssh_options -o BatchMode=yes -o ConnectTimeout=10
    set -l setup_command (_tp_shot_remote_setup_command)
    set -l remote_dir (command ssh $ssh_options -- "$host" "$setup_command")
    set -l ssh_status $status
    if test $ssh_status -ne 0; or test (count $remote_dir) -ne 1; or not string match -q '/*' -- "$remote_dir"
        if test "$remove_source" = true
            rm -f "$source_path"
        end
        echo "tp-shot: could not prepare the screenshot directory on '$host'" >&2
        return 1
    end

    set -l source_host (hostname -s 2>/dev/null | string lower | string replace -ra '[^a-z0-9._-]' '-')
    if test -z "$source_host"
        set source_host laptop
    end
    set -l stamp (date -u '+%Y%m%dT%H%M%SZ')
    set -l filename "tp-shot-$stamp-$source_host-"(random)".$extension"
    set -l remote_path "$remote_dir/$filename"
    set -l escaped_remote_path (string escape -- "$remote_path")

    command scp -q $ssh_options -- "$source_path" "$host:$remote_path"
    set -l scp_status $status
    if test "$remove_source" = true
        rm -f "$source_path"
    end
    if test $scp_status -ne 0
        command ssh $ssh_options -- "$host" "rm -f $escaped_remote_path" >/dev/null 2>&1
        echo "tp-shot: upload to '$host' failed" >&2
        return 1
    end

    command ssh $ssh_options -- "$host" "chmod 600 $escaped_remote_path"
    if test $status -ne 0
        command ssh $ssh_options -- "$host" "rm -f $escaped_remote_path" >/dev/null 2>&1
        echo "tp-shot: could not make the uploaded screenshot private" >&2
        return 1
    end

    set -l clipboard_text "$remote_path"
    if not command -sq pbcopy
        printf '%s\n' "$clipboard_text"
        echo "tp-shot: pbcopy is not available; copy the path above manually" >&2
        return 1
    end

    printf '%s' "$clipboard_text" | command pbcopy
    or begin
        printf '%s\n' "$clipboard_text"
        echo "tp-shot: could not copy the path; copy it from above manually" >&2
        return 1
    end

    _tp_shot_notify ready "Screenshot ready to paste" >/dev/null 2>&1

    printf 'Uploaded: %s\n' "$remote_path"
    echo "Copied the remote path to the clipboard."
end

function _tp_shot_queue_async --description "Reserve a screenshot path and launch a detached uploader"
    set -l host $argv[1]
    set -l source_path $argv[2]
    set -l extension $argv[3]
    set -l remove_source $argv[4]

    set -l remote_dir "$HOME/.cache/pi/screenshots"
    if set -q TP_SHOT_REMOTE_DIR; and test -n "$TP_SHOT_REMOTE_DIR"
        set remote_dir (string replace -r '/$' '' -- "$TP_SHOT_REMOTE_DIR")
    end
    if not string match -q '/*' -- "$remote_dir"
        if test "$remove_source" = true
            rm -f "$source_path"
        end
        echo "tp-shot: TP_SHOT_REMOTE_DIR must be an absolute path" >&2
        return 2
    end

    set -l uuid (command uuidgen)
    set -l uuid_status $status
    set uuid (string lower -- "$uuid")
    if test $uuid_status -ne 0; or not string match -qr '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' -- "$uuid"
        if test "$remove_source" = true
            rm -f "$source_path"
        end
        echo "tp-shot: could not generate a UUID" >&2
        return 1
    end

    set -l remote_path "$remote_dir/tp-shot-$uuid.$extension"
    printf '%s' "$remote_path" | command pbcopy
    or begin
        if test "$remove_source" = true
            rm -f "$source_path"
        end
        echo "tp-shot: could not copy the reserved path to the clipboard" >&2
        return 1
    end

    set -l log_dir "$HOME/.cache/tp-shot"
    if set -q TP_SHOT_LOG_DIR; and test -n "$TP_SHOT_LOG_DIR"
        set log_dir (string replace -r '/$' '' -- "$TP_SHOT_LOG_DIR")
    end
    mkdir -p "$log_dir"
    or begin
        if test "$remove_source" = true
            rm -f "$source_path"
        end
        _tp_shot_notify failed "Screenshot upload failed: could not create its local log directory" >/dev/null 2>&1
        echo "tp-shot: could not create '$log_dir'" >&2
        return 1
    end
    chmod 700 "$log_dir" 2>/dev/null
    or begin
        if test "$remove_source" = true
            rm -f "$source_path"
        end
        _tp_shot_notify failed "Screenshot upload failed: could not secure its local log directory" >/dev/null 2>&1
        echo "tp-shot: could not make '$log_dir' private" >&2
        return 1
    end
    set -l log_path "$log_dir/$uuid.log"
    touch "$log_path"
    or begin
        if test "$remove_source" = true
            rm -f "$source_path"
        end
        _tp_shot_notify failed "Screenshot upload failed: could not create its local log" >/dev/null 2>&1
        echo "tp-shot: could not create '$log_path'" >&2
        return 1
    end
    chmod 600 "$log_path" 2>/dev/null
    or begin
        rm -f "$log_path"
        if test "$remove_source" = true
            rm -f "$source_path"
        end
        _tp_shot_notify failed "Screenshot upload failed: could not secure its local log" >/dev/null 2>&1
        echo "tp-shot: could not make '$log_path' private" >&2
        return 1
    end

    set -l helper_file (functions --details tp-shot 2>/dev/null)
    set -l fish_bin (command -s fish)
    if test -z "$helper_file"; or not test -f "$helper_file"; or test -z "$fish_bin"
        if test "$remove_source" = true
            rm -f "$source_path"
        end
        _tp_shot_notify failed "Screenshot upload failed: uploader could not start" >/dev/null 2>&1
        echo "tp-shot: could not locate the uploader implementation" >&2
        return 1
    end

    set -l start_marker "$log_dir/$uuid.started"
    set -l ownership_marker "$log_dir/$uuid.owned"
    rm -f "$start_marker" "$ownership_marker"
    command nohup "$fish_bin" --no-config -c 'source "$argv[1]"; and _tp_shot_async_entry $argv[2..]' -- \
        "$helper_file" "$start_marker" "$ownership_marker" "$host" "$source_path" "$remote_dir" "$remote_path" "$remove_source" </dev/null >>"$log_path" 2>&1 &
    set -l launch_status $status
    set -l worker_pid $last_pid
    if test $launch_status -ne 0; or test -z "$worker_pid"
        if test "$remove_source" = true
            rm -f "$source_path"
        end
        _tp_shot_notify failed "Screenshot upload failed: uploader could not start" >/dev/null 2>&1
        echo "tp-shot: could not start the background uploader" >&2
        return 1
    end

    set -l worker_started false
    set -l start_attempt 0
    while test $start_attempt -lt 40
        if test -s "$start_marker"
            set worker_started true
            break
        end
        if not command kill -0 "$worker_pid" 2>/dev/null
            break
        end
        sleep 0.025
        set start_attempt (math "$start_attempt + 1")
    end
    if test -s "$start_marker"
        set worker_started true
    end
    if test "$worker_started" = false
        command kill "$worker_pid" 2>/dev/null
        wait "$worker_pid" 2>/dev/null
        rm -f "$start_marker" "$ownership_marker"
        if test "$remove_source" = true
            rm -f "$source_path"
        end
        _tp_shot_notify failed "Screenshot upload failed: uploader could not start" >/dev/null 2>&1
        echo "tp-shot: background uploader did not start; inspect '$log_path'" >&2
        return 1
    end

    printf '%s\n' "$fish_pid" >"$ownership_marker"
    or begin
        command kill "$worker_pid" 2>/dev/null
        wait "$worker_pid" 2>/dev/null
        rm -f "$start_marker" "$ownership_marker"
        if test "$remove_source" = true
            rm -f "$source_path"
        end
        _tp_shot_notify failed "Screenshot upload failed: uploader ownership could not transfer" >/dev/null 2>&1
        echo "tp-shot: could not transfer ownership to the background uploader" >&2
        return 1
    end
    rm -f "$start_marker"
    disown "$worker_pid" >/dev/null 2>&1

    printf 'Queued: %s\n' "$remote_path"
    if set -q TP_SHOT_NOTIFIER; and test "$TP_SHOT_NOTIFIER" = none
        echo "Copied the reserved path immediately. Notifications are disabled; inspect the log for the outcome."
    else
        echo "Copied the reserved path immediately. A notification will report upload success or failure."
    end
    printf 'Log: %s\n' "$log_path"
end

function _tp_shot_async_entry --description "Wait for the parent to transfer cleanup ownership before uploading"
    if test (count $argv) -ne 7
        echo "tp-shot worker: expected startup and ownership markers plus five upload arguments" >&2
        return 2
    end

    set -l start_marker $argv[1]
    set -l ownership_marker $argv[2]
    printf '%s\n' "$fish_pid" >"$start_marker"
    or begin
        echo "tp-shot worker: could not write startup marker '$start_marker'" >&2
        return 1
    end

    # Give a briefly suspended parent time to finish the handoff without allowing an orphaned worker to wait forever.
    set -l ownership_attempt 0
    while test $ownership_attempt -lt 2400
        if test -s "$ownership_marker"
            rm -f "$start_marker" "$ownership_marker"
            _tp_shot_async_worker $argv[3..]
            return $status
        end
        sleep 0.025
        set ownership_attempt (math "$ownership_attempt + 1")
    end

    rm -f "$start_marker" "$ownership_marker"
    if test "$argv[7]" = true
        rm -f "$argv[4]"
    end
    echo "tp-shot worker: parent did not transfer cleanup ownership" >&2
    _tp_shot_notify failed "Screenshot upload failed before the uploader took ownership" >/dev/null 2>&1
    return 1
end

function _tp_shot_async_worker --description "Upload one screenshot and atomically publish its final path"
    if test (count $argv) -ne 5
        echo "tp-shot worker: expected host, source, remote directory, remote path, and cleanup flag" >&2
        return 2
    end

    set -l host $argv[1]
    set -l source_path $argv[2]
    set -l remote_dir $argv[3]
    set -l remote_path $argv[4]
    set -l remove_source $argv[5]
    set -l ssh_options -o BatchMode=yes -o ConnectTimeout=10
    set -l remote_temp "$remote_dir/."(path basename "$remote_path")".uploading"
    set -l escaped_temp (_tp_shot_posix_quote "$remote_temp")
    set -l escaped_final (_tp_shot_posix_quote "$remote_path")

    set -l setup_command (_tp_shot_remote_setup_command "$remote_dir")
    set -l prepared_dir (command ssh $ssh_options -- "$host" "$setup_command")
    set -l setup_status $status
    if test $setup_status -ne 0; or test (count $prepared_dir) -ne 1; or test "$prepared_dir" != "$remote_dir"
        if test "$remove_source" = true
            rm -f "$source_path"
        end
        echo "tp-shot worker: could not prepare '$remote_dir' on '$host'" >&2
        _tp_shot_notify failed "Screenshot upload failed while preparing Good Studio" >/dev/null 2>&1
        return 1
    end

    command scp -q $ssh_options -- "$source_path" "$host:$remote_temp"
    set -l scp_status $status
    if test $scp_status -ne 0
        if not command ssh $ssh_options -- "$host" "rm -f $escaped_temp" >/dev/null
            echo "tp-shot worker: warning: could not remove the remote temporary file" >&2
        end
        if test "$remove_source" = true
            rm -f "$source_path"
        end
        echo "tp-shot worker: upload failed" >&2
        _tp_shot_notify failed "Screenshot upload failed; the copied path is not available" >/dev/null 2>&1
        return 1
    end

    command ssh $ssh_options -- "$host" "chmod 600 $escaped_temp && mv $escaped_temp $escaped_final"
    set -l publish_status $status
    if test "$remove_source" = true
        rm -f "$source_path"
    end
    if test $publish_status -ne 0
        if not command ssh $ssh_options -- "$host" "rm -f $escaped_temp $escaped_final" >/dev/null
            echo "tp-shot worker: warning: could not remove failed remote upload files" >&2
        end
        echo "tp-shot worker: could not publish the final path" >&2
        _tp_shot_notify failed "Screenshot upload failed; the copied path is not available" >/dev/null 2>&1
        return 1
    end

    printf 'Ready: %s\n' "$remote_path"
    _tp_shot_notify ready "Screenshot ready to paste" >/dev/null 2>&1
end

function _tp_shot_notify --description "Send a macOS screenshot completion notification"
    set -l state $argv[1]
    set -l message $argv[2]
    set -l title "tp-shot ready"
    set -l sound Glass
    if test "$state" = failed
        set title "tp-shot failed"
        set sound Basso
    end

    set -l notifier auto
    if set -q TP_SHOT_NOTIFIER; and test -n "$TP_SHOT_NOTIFIER"
        set notifier "$TP_SHOT_NOTIFIER"
    end

    if test "$notifier" = none
        return
    end

    if test "$notifier" = auto -o "$notifier" = terminal-notifier
        if command -sq terminal-notifier
            if command terminal-notifier -group tp-shot -title "$title" -message "$message" -sound default >/dev/null 2>&1
                return
            else if test "$notifier" = terminal-notifier
                return 1
            end
        else if test "$notifier" = terminal-notifier
            return 1
        end
    end

    if test "$notifier" = auto -o "$notifier" = osascript
        if command -sq osascript
            command osascript \
                -e 'on run argv' \
                -e 'display notification (item 2 of argv) with title (item 1 of argv) sound name (item 3 of argv)' \
                -e 'end run' \
                "$title" "$message" "$sound" >/dev/null 2>&1
            return $status
        end
    end

    return 1
end

function _tp_shot_remote_setup_command --description "Return the shell-neutral remote setup command"
    if test (count $argv) -eq 0
        echo 'umask 077; mkdir -p "$HOME/.cache/pi/screenshots" && chmod 700 "$HOME/.cache/pi/screenshots" && printf "%s\n" "$HOME/.cache/pi/screenshots"'
        return
    end

    set -l remote_dir $argv[1]
    set -l escaped_dir (_tp_shot_posix_quote "$remote_dir")
    string join '' 'umask 077; mkdir -p ' "$escaped_dir" ' && chmod 700 ' "$escaped_dir" ' && printf "%s\n" ' "$escaped_dir"
end

function _tp_shot_posix_quote --description "Quote one path for both POSIX sh and Fish"
    if test (count $argv) -ne 1
        return 2
    end
    set -l escaped (string replace -a "'" "'\"'\"'" -- "$argv[1]")
    printf "'%s'\n" "$escaped"
end
