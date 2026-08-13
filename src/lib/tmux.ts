import { type PaneOptions, type PiInfo, decodePaneOptions } from "./pi";

export interface TmuxSession {
	name: string;
	label?: string;
	attached: boolean;
	attachedFrom?: string;
	activityAt?: string;
	cwd?: string;
	pi: PiInfo | null;
}

export interface NewSessionOptions {
	cwd?: string;
	command?: readonly string[];
	environment?: Record<string, string>;
	detached?: boolean;
}

export interface PopupOptions {
	command?: readonly string[];
	target?: string;
	width?: string | number;
	height?: string | number;
	cwd?: string;
}

export class TmuxError extends Error {
	readonly exitCode: number;

	constructor(args: readonly string[], exitCode: number, stderr: string) {
		super(
			`tmux ${args.join(" ")} failed (${exitCode})${stderr ? `: ${stderr.trim()}` : ""}`,
		);
		this.name = "TmuxError";
		this.exitCode = exitCode;
	}
}

function tmuxArgs(args: readonly string[]): string[] {
	const socket = process.env.TP_TMUX_SOCKET;
	return socket ? ["tmux", "-L", socket, ...args] : ["tmux", ...args];
}

function runTmux(args: readonly string[], allowFailure = false): string {
	const result = Bun.spawnSync({
		cmd: tmuxArgs(args),
		stdout: "pipe",
		stderr: "pipe",
	});
	const stdout = new TextDecoder().decode(result.stdout);
	if (result.exitCode !== 0 && !allowFailure) {
		const stderr = new TextDecoder().decode(result.stderr);
		throw new TmuxError(args, result.exitCode, stderr);
	}
	return stdout;
}

function exactTarget(name: string): string {
	return `=${name}`;
}

const LIST_FORMAT = [
	"#{session_name}",
	"#{session_attached}",
	"#{client_name}",
	"#{session_activity}",
	"#{session_path}",
	"#{@pi_session_id}",
	"#{@pi_pid}",
	"#{@pi_state}",
	"#{@pi_tool}",
	"#{@pi_state_since}",
	"#{@pi_ctx_pct}",
	"#{@pi_model}",
	"#{@tp_name}",
].join("\t");

function parseActivity(value: string): string | undefined {
	if (!/^\d+$/.test(value)) return undefined;
	return new Date(Number(value) * 1000).toISOString();
}

function parseRow(row: string): TmuxSession | undefined {
	// Keep the final field intact: labels are free-form and may contain tabs.
	const fields = row.split("\t");
	if (fields.length < 13 || !fields[0]) return undefined;
	const fixed = fields.slice(0, 12);
	const label = fields.slice(12).join("\t").trim();
	const options: PaneOptions = {
		sessionId: fixed[5],
		pid: fixed[6],
		state: fixed[7],
		tool: fixed[8],
		stateSince: fixed[9],
		ctxPct: fixed[10],
		model: fixed[11],
	};
	return {
		name: fixed[0],
		...(label ? { label } : {}),
		attached: fixed[1] === "1",
		...(fixed[2] ? { attachedFrom: fixed[2] } : {}),
		...(parseActivity(fixed[3]) ? { activityAt: parseActivity(fixed[3]) } : {}),
		...(fixed[4] ? { cwd: fixed[4] } : {}),
		pi: decodePaneOptions(options),
	};
}

/** Read every session and its active-pane metadata with one tmux invocation. */
export function listSessions(): TmuxSession[] {
	const output = runTmux(["list-sessions", "-F", LIST_FORMAT], true);
	return output
		.split("\n")
		.map(parseRow)
		.filter((session): session is TmuxSession => session !== undefined);
}

export function hasSession(name: string): boolean {
	const result = Bun.spawnSync({
		cmd: tmuxArgs(["has-session", "-t", exactTarget(name)]),
		stdout: "ignore",
		stderr: "ignore",
	});
	return result.exitCode === 0;
}

export function newSession(
	name: string,
	options: NewSessionOptions = {},
): string {
	const args = ["new-session"];
	if (options.detached !== false) args.push("-d");
	args.push("-s", name);
	if (options.cwd) args.push("-c", options.cwd);
	for (const [key, value] of Object.entries(options.environment ?? {}))
		args.push("-e", `${key}=${value}`);
	if (options.command?.length) args.push("--", ...options.command);
	runTmux(args);
	return name;
}

export function killSession(name: string): void {
	runTmux(["kill-session", "-t", exactTarget(name)]);
}

/** Set a session option. tmux's option target syntax takes the full name here. */
export function setOption(name: string, option: string, value?: string): void {
	const args = ["set-option"];
	// Pi publishes pane options. Session labels remain session options, matching
	// the legacy layer and avoiding a per-session lookup when listing.
	if (option.startsWith("@pi_")) args.push("-p");
	args.push("-t", name, option);
	if (value !== undefined) args.push(value);
	runTmux(args);
}

export function attach(name: string): number {
	const command = process.env.TMUX ? "switch-client" : "attach-session";
	const result = Bun.spawnSync({
		cmd: tmuxArgs([command, "-t", exactTarget(name)]),
		stdin: "inherit",
		stdout: "inherit",
		stderr: "inherit",
	});
	return result.exitCode;
}

export function displayPopup(options: PopupOptions = {}): void {
	const args = ["display-popup"];
	if (options.target) args.push("-t", exactTarget(options.target));
	if (options.width !== undefined) args.push("-w", String(options.width));
	if (options.height !== undefined) args.push("-h", String(options.height));
	if (options.cwd) args.push("-d", options.cwd);
	if (options.command?.length) args.push("--", ...options.command);
	runTmux(args);
}

export function setHook(name: string, command: string, global = true): void {
	runTmux(["set-hook", ...(global ? ["-g"] : []), name, command]);
}

export function unsetHook(name: string, global = true): void {
	runTmux(["set-hook", ...(global ? ["-g"] : []), "-u", name]);
}

export const hooks = { set: setHook, unset: unsetHook };
export const tmuxCommand = runTmux;
