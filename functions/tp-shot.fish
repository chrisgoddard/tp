function tp-shot --description "Capture or upload a screenshot for a remote Pi session"
    argparse h/help 'H/host=' -- $argv
    or return 2

    if set -q _flag_help
        echo "Usage: tp-shot [--host HOST] [IMAGE]"
        echo ""
        echo "Without IMAGE, open macOS's interactive screenshot picker."
        echo "Upload the image to Good Studio, then copy its remote path"
        echo "to this Mac's clipboard."
        echo ""
        echo "Environment:"
        echo "  TP_SHOT_HOST   SSH host or alias (default: good-studio)"
        return
    end

    if test (count $argv) -gt 1
        echo "Usage: tp-shot [--host HOST] [IMAGE]" >&2
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

    set -l ssh_options -o BatchMode=yes -o ConnectTimeout=10

    if not command -sq ssh
        echo "tp-shot: ssh is not available" >&2
        return 1
    end
    if not command -sq scp
        echo "tp-shot: scp is not available" >&2
        return 1
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

    if command -sq osascript
        command osascript \
            -e 'display notification "Paste into Pi with Command-V" with title "tp-shot uploaded"' >/dev/null 2>&1
    end

    printf 'Uploaded: %s\n' "$remote_path"
    echo "Copied the remote path to the clipboard."
end

function _tp_shot_remote_setup_command --description "Return the shell-neutral remote setup command"
    echo 'umask 077; mkdir -p "$HOME/.cache/pi/screenshots" && chmod 700 "$HOME/.cache/pi/screenshots" && printf "%s\n" "$HOME/.cache/pi/screenshots"'
end
