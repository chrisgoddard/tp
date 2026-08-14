import { type Dirent, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { type CommandContext, registerCommandHandler } from "../lib/cli";
import { isProcessAlive } from "../lib/pi";
import { parseSessionName, projectName, sessionName } from "../lib/project";
import {
	attach,
	listSessions,
	newSession,
	setOption,
	tmuxCommand,
} from "../lib/tmux";

function liveSessionId(sessionNameValue: string): string | undefined {
	const session = listSessions().find((item) => item.name === sessionNameValue);
	return session?.pi?.sessionId;
}

function sessionFromCurrentPane(): string | undefined {
	if (!process.env.TMUX && !process.env.TMUX_PANE) return undefined;
	const target = process.env.TMUX_PANE;
	const args = ["display-message", "-p"];
	if (target) args.push("-t", target);
	args.push("#{session_name}");
	const name = tmuxCommand(args, true).trim();
	if (!name || !parseSessionName(name)) return undefined;
	return name;
}

function sid(context: CommandContext): number {
	const requested = context.args.positionals[0];
	let target: string | undefined;
	if (requested === undefined) {
		target = sessionFromCurrentPane();
		if (!target) {
			context.stderr("Usage: tp sid [n]");
			return 2;
		}
	} else {
		try {
			target = sessionName(projectName(), requested);
		} catch {
			context.stderr("Usage: tp sid [n]");
			return 2;
		}
	}

	const id = liveSessionId(target);
	if (!id) {
		context.stderr(`No live Pi session in '${target}'`);
		return 1;
	}
	context.stdout(`${id}\n`);
	return 0;
}

/** Split the shell-escaped command stored in TP_CMD without changing values. */
function shellSplit(value: string): string[] | undefined {
	const result: string[] = [];
	let current = "";
	let quote: "'" | '"' | undefined;
	let escaped = false;
	let started = false;

	for (const character of value) {
		if (escaped) {
			current += character;
			escaped = false;
			started = true;
			continue;
		}
		if (quote === "'") {
			if (character === "'") quote = undefined;
			else current += character;
			started = true;
			continue;
		}
		if (quote === '"') {
			if (character === '"') quote = undefined;
			else if (character === "\\") escaped = true;
			else current += character;
			started = true;
			continue;
		}
		if (character === "'" || character === '"') {
			quote = character;
			started = true;
		} else if (character === "\\") {
			escaped = true;
			started = true;
		} else if (/\s/.test(character)) {
			if (started) {
				result.push(current);
				current = "";
				started = false;
			}
		} else {
			current += character;
			started = true;
		}
	}
	if (quote || escaped) return undefined;
	if (started) result.push(current);
	return result;
}

function shellQuote(value: string): string {
	if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value;
	return `'${value.replaceAll("'", `'"'"'`)}'`;
}

/**
 * Rebuild TP_CMD while preserving its argument boundaries. The returned
 * command includes the exact saved session path, not only its id.
 */
export function rebuildRestartCommand(
	original: string,
	sessionTarget: string,
): string[] | undefined {
	if (!original.trim() || !sessionTarget) return undefined;
	const parts = shellSplit(original);
	if (!parts?.length) return undefined;

	const separator = parts.indexOf("--");
	const prefix = separator >= 0 ? parts.slice(0, separator + 1) : [];
	const tail = separator >= 0 ? parts.slice(separator + 1) : parts;
	const rebuilt = [...prefix];
	let skipNext = false;
	for (const part of tail) {
		if (skipNext) {
			skipNext = false;
			continue;
		}
		switch (part) {
			case "--resume":
			case "-r":
			case "--continue":
			case "-c":
				continue;
			case "--session":
			case "--fork":
				skipNext = true;
				continue;
			default:
				if (part.startsWith("--session=") || part.startsWith("--fork="))
					continue;
				rebuilt.push(part);
		}
	}
	if (!rebuilt.length) return undefined;
	return [...rebuilt, "--session", sessionTarget];
}

function piAgentDirectory(): string {
	// Pi's existing override is PI_CODING_AGENT_DIR; keep it for doctor/restore.
	return resolve(
		process.env.PI_CODING_AGENT_DIR ||
			join(process.env.HOME || homedir(), ".pi", "agent"),
	);
}

function sessionDirectory(cwd: string): string {
	const absolute = resolve(cwd);
	const safe = absolute.replace(/^\/+/, "").replaceAll("/", "-");
	return join(piAgentDirectory(), "sessions", `--${safe}--`);
}

function matchingFile(
	entries: readonly Dirent[],
	sessionId: string,
): string | undefined {
	return entries.find(
		(entry) => entry.isFile() && entry.name.endsWith(`_${sessionId}.jsonl`),
	)?.name;
}

/** Locate Pi's saved conversation, including Pi's first-level fork folders. */
export function findPiSessionFile(
	cwd: string,
	sessionId: string,
): string | undefined {
	const directory = sessionDirectory(cwd);
	let entries: Dirent[] | undefined;
	try {
		entries = readdirSync(directory, { withFileTypes: true });
	} catch {
		// A forked conversation may not have a working-directory folder.
	}
	const direct = entries && matchingFile(entries, sessionId);
	if (direct) return join(directory, direct);

	// Pi also searches immediate children of the sessions root, such as
	// ~/.pi/agent/sessions/forks. Do not recurse beyond that documented breadth.
	const sessionsRoot = join(piAgentDirectory(), "sessions");
	let children: Dirent[];
	try {
		children = readdirSync(sessionsRoot, { withFileTypes: true });
	} catch {
		return undefined;
	}
	for (const child of children) {
		if (!child.isDirectory()) continue;
		try {
			const nestedEntries = readdirSync(join(sessionsRoot, child.name), {
				withFileTypes: true,
			});
			const nested = matchingFile(nestedEntries, sessionId);
			if (nested) return join(sessionsRoot, child.name, nested);
		} catch {
			// A disappearing or unreadable fork folder is not a saved session.
		}
	}
	return undefined;
}

function waitForPiExit(pid: number): boolean {
	if (!isProcessAlive(pid)) return true;
	Bun.spawnSync({
		cmd: ["kill", "-TERM", String(pid)],
		stdout: "ignore",
		stderr: "ignore",
	});
	for (let attempt = 0; attempt < 50; attempt += 1) {
		if (!isProcessAlive(pid)) return true;
		Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
	}
	return !isProcessAlive(pid);
}

function readEnvironment(name: string, variable: string): string | undefined {
	const output = tmuxCommand(
		["show-environment", "-t", `=${name}`, variable],
		true,
	).trimEnd();
	const prefix = `${variable}=`;
	const line = output.split("\n").find((item) => item.startsWith(prefix));
	return line?.slice(prefix.length);
}

export function registerPiSessionCommands(): void {
	registerCommandHandler("sid", sid);
}

export function restartSession(
	sessionNameValue: string,
): Promise<number> | number {
	const refuse = (reason: string): number => {
		console.error(`tp: cannot restart '${sessionNameValue}': ${reason}`);
		return 1;
	};
	const session = listSessions().find((item) => item.name === sessionNameValue);
	if (!session) return refuse("session missing");
	const pi = session.pi;
	if (!pi?.pid || !pi.sessionId) return refuse("no live Pi metadata");

	const cwd =
		session.cwd && statSyncSafeDirectory(session.cwd)
			? session.cwd
			: process.cwd();
	const sessionFile = findPiSessionFile(cwd, pi.sessionId);
	if (!sessionFile) return refuse("no saved conversation");
	const original = readEnvironment(sessionNameValue, "TP_CMD");
	if (!original) return refuse("no TP_CMD recorded");
	const command = rebuildRestartCommand(original, sessionFile);
	if (!command) return refuse("recorded TP_CMD cannot be restarted");

	// Keep tmux's session alive while the Pi pane exits. Otherwise tmux may tear
	// down the last session before the replacement can be created.
	tmuxCommand(
		["set-option", "-w", "-t", sessionNameValue, "remain-on-exit", "on"],
		true,
	);
	// Always replace the tmux session. If SIGTERM did not finish within five
	// seconds, killing the session is the hard-stop fallback for the Pi process.
	waitForPiExit(pi.pid);
	// SIGTERM can make the last pane exit and tmux can remove the session before
	// this explicit hard-stop. Treat that already-completed stop as success.
	tmuxCommand(["kill-session", "-t", `=${sessionNameValue}`], true);

	const serialized = command.map(shellQuote).join(" ");
	try {
		newSession(sessionNameValue, {
			cwd,
			command,
			environment: { TP_CMD: serialized },
		});
		if (session.label) setOption(sessionNameValue, "@tp_name", session.label);
		// Tests and callers without a client still need the recreated session;
		// attach reports tmux's normal no-current-client status as operational
		// failure after the replacement has succeeded.
		return process.env.TMUX ? attach(sessionNameValue) : 0;
	} catch {
		return refuse("failed to recreate session");
	}
}

function statSyncSafeDirectory(path: string): boolean {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}
