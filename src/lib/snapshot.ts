import type { TmuxSession } from "./tmux";

/**
 * Record the current session state for `tp restore` (GitHub issue #29).
 *
 * Snapshot persistence is intentionally not implemented in this seam-prep
 * lane; the function is the stable boundary for the restore lane.
 */
export function recordSessionsSnapshot(sessions: TmuxSession[]): void {
	void sessions;
}
