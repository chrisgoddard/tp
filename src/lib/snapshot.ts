import { mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { parseSessionName } from "./project";
import type { TmuxSession } from "./tmux";
import { tmuxCommand } from "./tmux";

export interface SessionSnapshot {
	session: string;
	project: string;
	number: number;
	label: string | null;
	cwd: string | null;
	tpCmd: string | null;
	piSessionId: string | null;
	updatedAt: string;
}

let warned = false;

function warnFailure(): void {
	if (warned) return;
	warned = true;
	console.error("Warning: failed to record session snapshot");
}

/** Return the state file path, using the XDG state directory when configured. */
export function sessionsSnapshotPath(
	env: Record<string, string | undefined> = process.env,
): string {
	const root =
		env.XDG_STATE_HOME || join(env.HOME || homedir(), ".local", "state");
	return join(root, "tp", "sessions.json");
}

function recordedEnvironment(
	session: TmuxSession,
	variable: string,
): string | undefined {
	try {
		const output = tmuxCommand(
			["show-environment", "-t", `=${session.name}`, variable],
			true,
		).trimEnd();
		const prefix = `${variable}=`;
		const line = output.split("\n").find((item) => item.startsWith(prefix));
		return line?.slice(prefix.length);
	} catch {
		return undefined;
	}
}

function snapshotRecord(
	session: TmuxSession,
	updatedAt: string,
): SessionSnapshot | undefined {
	const parsed = parseSessionName(session.name);
	if (!parsed) return undefined;
	return {
		session: session.name,
		project: parsed.project,
		number: parsed.number,
		label: session.label ?? null,
		cwd: session.cwd ?? null,
		tpCmd: recordedEnvironment(session, "TP_CMD") ?? null,
		piSessionId: session.pi?.sessionId ?? null,
		updatedAt,
	};
}

/**
 * Persist the current tp sessions for `tp restore`.
 *
 * TP_CMD is a tmux session environment variable rather than part of the
 * listing shape, so it is read once per tp session while building the record.
 * Every write uses a same-directory temporary file and rename, so readers see
 * either the previous complete JSON or the new complete JSON.
 */
export function recordSessionsSnapshot(sessions: TmuxSession[]): void {
	let temporary: string | undefined;
	try {
		const path = sessionsSnapshotPath();
		mkdirSync(dirname(path), { recursive: true });
		const updatedAt = new Date().toISOString();
		const records = sessions
			.map((session) => snapshotRecord(session, updatedAt))
			.filter((record): record is SessionSnapshot => record !== undefined)
			.sort(
				(left, right) =>
					left.project.localeCompare(right.project) ||
					left.number - right.number,
			);
		const text = `${JSON.stringify(records, null, "\t")}\n`;
		temporary = `${path}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
		writeFileSync(temporary, text, { encoding: "utf8", mode: 0o600 });
		renameSync(temporary, path);
		temporary = undefined;
	} catch {
		if (temporary) {
			try {
				unlinkSync(temporary);
			} catch {
				// The temporary file may already have been removed.
			}
		}
		warnFailure();
	}
}
