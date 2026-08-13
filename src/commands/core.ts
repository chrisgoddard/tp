import {
	existsSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	statSync,
	unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { type CommandContext, registerCommandHandler } from "../lib/cli";
import { configPath, loadConfig } from "../lib/config";
import { stampSshSource } from "../lib/origin";
import {
	nextNumber,
	parseSessionName,
	projectName,
	sessionName,
} from "../lib/project";
import { recordSessionsSnapshot } from "../lib/snapshot";
import {
	attach,
	hasSession,
	killSession,
	listSessions,
	newSession,
	setOption,
	tmuxCommand,
} from "../lib/tmux";
import { restartSession } from "./pi-session";

const decoder = new TextDecoder();

function recordSnapshot(): void {
	try {
		recordSessionsSnapshot(listSessions());
	} catch {
		console.error("Warning: failed to record session snapshot");
	}
}

function shellQuote(value: string): string {
	if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value;
	return `'${value.replaceAll("'", `\'"\'"\'`)}'`;
}

/** The same shell-escaped representation used for TP_CMD by the restart lane. */
export function serializeCommand(command: readonly string[]): string {
	return command.map(shellQuote).join(" ");
}

function currentProjectSessions(): ReturnType<typeof listSessions> {
	const project = projectName();
	return listSessions()
		.filter((item) => parseSessionName(item.name)?.project === project)
		.sort(
			(left, right) =>
				(parseSessionName(left.name)?.number ?? 0) -
				(parseSessionName(right.name)?.number ?? 0),
		);
}

function clientTty(): string {
	const result = Bun.spawnSync({
		cmd: ["tty"],
		stdin: "inherit",
		stdout: "pipe",
		stderr: "ignore",
	});
	return result.exitCode === 0 ? decoder.decode(result.stdout).trim() : "";
}

function waitForSessionOutput(
	path: string,
	attempts = 100,
): string | undefined {
	for (let attempt = 0; attempt < attempts; attempt += 1) {
		if (existsSync(path)) {
			try {
				const value = readFileSync(path, "utf8").trim();
				return value || undefined;
			} catch {
				// The capture file is still being written.
			}
		}
		Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
	}
	try {
		const value = readFileSync(path, "utf8").trim();
		return value || undefined;
	} catch {
		return undefined;
	}
}

function waitForSessionExit(name: string, attempts = 100): boolean {
	for (let attempt = 0; attempt < attempts; attempt += 1) {
		if (!hasSession(name)) return true;
		Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
	}
	return !hasSession(name);
}

function replayOutput(path: string, stdout: (text: string) => void): void {
	try {
		const output = readFileSync(path, "utf8").trim();
		if (output) stdout(`\n${output}\n`);
	} catch {
		// A command with no pane output has nothing to replay.
	}
	try {
		unlinkSync(path);
	} catch {
		// The temporary file may have been removed by a previous replay.
	}
}

function fishWrapper(script: string, outputPath: string): string {
	return `${script}; set -l __tp_status $status; tmux capture-pane -p -t \"$TMUX_PANE\" > ${shellQuote(outputPath)}; set -l __tp_wait (tmux show-option -t \"$TMUX_PANE\" -v @tp_wait_channel 2>/dev/null); if test -n \"$__tp_wait\"; tmux wait-for -S \"$__tp_wait\"; end; exit $__tp_status`;
}

function posixWrapper(script: string, outputPath: string): string {
	return `${script}; __tp_status=$?; tmux capture-pane -p -t "$TMUX_PANE" > ${shellQuote(outputPath)}; __tp_wait=$(tmux show-option -t "$TMUX_PANE" -v @tp_wait_channel 2>/dev/null); if [ -n "$__tp_wait" ]; then tmux wait-for -S "$__tp_wait"; fi; exit "$__tp_status"`;
}

function isFish(shell: string): boolean {
	return basename(shell).toLowerCase().includes("fish");
}

function shellForCommand(): string {
	const env = process.env;
	const config = loadConfig();
	if (env.TP_SHELL) return env.TP_SHELL;
	// The shared config seam predates the v0.2 default-shell contract and uses
	// fish as its internal fallback. Use $SHELL when no config file selected one.
	return existsSync(configPath(env))
		? config.shell || env.SHELL || "sh"
		: env.SHELL || "sh";
}

interface CreatedSession {
	name: string;
	outputPath?: string;
}

function createSession(
	command: readonly string[],
	options: {
		label?: string;
		recordCommand?: readonly string[];
		shell?: string;
		number?: number;
	} = {},
): CreatedSession {
	const project = projectName();
	const number =
		options.number ??
		nextNumber(
			listSessions().map((item) => item.name),
			project,
		);
	const name = sessionName(project, number);
	const environment: Record<string, string> = {};
	let outputPath: string | undefined;
	let tmuxCommandArgs: readonly string[] | undefined;
	if (command.length) {
		const shell = options.shell ?? shellForCommand();
		const directory = mkdtempSync(join(tmpdir(), "tp-close-"));
		outputPath = join(directory, "output");
		const commandText = command.map(shellQuote).join(" ");
		const wrapper = isFish(shell)
			? fishWrapper(commandText, outputPath)
			: posixWrapper(commandText, outputPath);
		tmuxCommandArgs = [shell, "-c", wrapper];
		environment.TP_CLOSE_OUTPUT = outputPath;
		environment.TP_CMD = serializeCommand(options.recordCommand ?? command);
	}
	newSession(name, {
		cwd: process.cwd(),
		command: tmuxCommandArgs,
		environment,
	});
	if (options.label !== undefined) {
		try {
			setOption(name, "@tp_name", options.label);
		} catch {
			// A short-lived command can remove its session before its label is set.
		}
	}
	recordSnapshot();
	return { name, outputPath };
}

async function attachSession(
	name: string,
	context: CommandContext,
	outputPath?: string,
): Promise<number> {
	const outside = !process.env.TMUX;
	if (outside) await stampSshSource(clientTty());
	let waitChannel: string | undefined;
	if (outside && outputPath && !(process.stdin as NodeJS.ReadStream).isTTY) {
		waitForSessionOutput(outputPath);
		const completed = waitForSessionExit(name);
		replayOutput(outputPath, context.stdout);
		return completed ? 0 : 1;
	}
	if (!hasSession(name) && outputPath) {
		waitForSessionOutput(outputPath);
		replayOutput(outputPath, context.stdout);
		return 0;
	}
	if (!outside && outputPath) {
		const candidate = `tp-close-${process.pid}-${Date.now()}`;
		const current = tmuxCommand(
			["display-message", "-p", "#{session_name}"],
			true,
		).trim();
		const client = tmuxCommand(
			["display-message", "-p", "#{client_name}"],
			true,
		).trim();
		try {
			setOption(name, "@tp_wait_channel", candidate);
			if (current) setOption(name, "@tp_return_session", current);
			if (client) setOption(name, "@tp_return_client", client);
			if (hasSession(name)) waitChannel = candidate;
		} catch {
			waitChannel = undefined;
		}
	}
	if (!hasSession(name) && outputPath) {
		waitForSessionOutput(outputPath);
		replayOutput(outputPath, context.stdout);
		return 0;
	}
	const code = attach(name);
	if (waitChannel) tmuxCommand(["wait-for", waitChannel], true);
	if (outside && outputPath && code !== 0) waitForSessionOutput(outputPath);
	const completed = outputPath !== undefined && !hasSession(name);
	if (outputPath && (outside ? completed : true)) {
		waitForSessionOutput(outputPath);
		replayOutput(outputPath, context.stdout);
	}
	// A detached test runner has no terminal for tmux to attach to. The command
	// still ran and its final pane was replayed, so report the command operation's
	// success rather than tmux's expected "not a terminal" status.
	return completed && outside ? 0 : code;
}

function nextSession(context: CommandContext): number | Promise<number> {
	const label =
		typeof context.args.options.name === "string"
			? context.args.options.name
			: undefined;
	const command = context.args.positionals;
	const created = createSession(command, { label });
	return attachSession(created.name, context, created.outputPath);
}

function piCommand(context: CommandContext): number | Promise<number> {
	const label =
		typeof context.args.options.name === "string"
			? context.args.options.name
			: undefined;
	const piArgs = [...context.args.passthrough];
	if (label !== undefined) piArgs.unshift("--name", label);
	const command = ["pi", ...piArgs];
	if (context.args.options["update-first"] === true) {
		const update = Bun.spawnSync({
			cmd: ["pi", "update", "--all"],
			stdin: "inherit",
			stdout: "inherit",
			stderr: "inherit",
		});
		if (update.exitCode !== 0) return 1;
	}
	const created = createSession(command, {
		label,
		recordCommand: command,
	});
	return attachSession(created.name, context, created.outputPath);
}

function lastCommand(context: CommandContext): number | Promise<number> {
	const sessions = currentProjectSessions();
	if (!sessions.length) {
		const created = createSession([]);
		return attachSession(created.name, context);
	}
	return attachSession(sessions[sessions.length - 1].name, context);
}

export function attachFirstProjectSession(
	context: CommandContext,
): number | Promise<number> {
	const sessions = currentProjectSessions();
	if (!sessions.length) {
		const created = createSession([]);
		return attachSession(created.name, context);
	}
	return attachSession(sessions[0].name, context);
}

export function attachProjectNumber(
	number: number,
	context: CommandContext,
	restart = false,
): number | Promise<number> {
	let target: string;
	try {
		target = sessionName(projectName(), number);
	} catch {
		context.stderr("Usage: tp <n> [--restart]");
		return 2;
	}
	if (restart) return restartSession(target);
	if (!hasSession(target)) {
		context.stderr(`Session '${target}' doesn't exist. Creating it...`);
		const created = createSession([], { number });
		return attachSession(created.name, context);
	}
	return attachSession(target, context);
}

export function attachProjectLabel(
	name: string,
	context: CommandContext,
): number | Promise<number> {
	return attachSession(name, context);
}

function killCommand(context: CommandContext): number {
	const number = context.args.positionals[0];
	const project = projectName();
	if (number !== undefined) {
		let target: string;
		try {
			target = sessionName(project, number);
		} catch {
			context.stderr("Usage: tp kill [n]");
			return 2;
		}
		if (!hasSession(target)) {
			context.stderr(`No session '${target}'`);
			return 1;
		}
		killSession(target);
		context.stderr(`Killed ${target}`);
		recordSnapshot();
		return 0;
	}
	const sessions = currentProjectSessions();
	if (!sessions.length) {
		context.stderr(`No sessions to kill for '${project}'`);
		return 1;
	}
	const force = context.args.options.force === true;
	if (!force) {
		if (!(process.stdin as NodeJS.ReadStream).isTTY) {
			context.stderr("tp kill: confirmation requires a TTY (use --force)");
			return 2;
		}
		context.stderr(`Kill ${sessions.length} sessions for '${project}'? [y/N]`);
		let answer = "";
		try {
			answer = readFileSync(0, "utf8").trim();
		} catch {
			return 2;
		}
		if (!/^y(?:es)?$/i.test(answer)) return 0;
	}
	for (const session of sessions) {
		killSession(session.name);
		context.stderr(`Killed ${session.name}`);
	}
	recordSnapshot();
	return 0;
}

function nameCommand(context: CommandContext): number {
	const number = context.args.positionals[0];
	const label = context.args.positionals[1];
	if (number === undefined || label === undefined) {
		context.stderr("Usage: tp name <n> <label>");
		return 2;
	}
	let target: string;
	try {
		target = sessionName(projectName(), number);
	} catch {
		context.stderr("Usage: tp name <n> <label>");
		return 2;
	}
	if (!hasSession(target)) {
		context.stderr(`No session '${target}'`);
		return 1;
	}
	setOption(target, "@tp_name", label);
	tmuxCommand(["set-option", "-t", target, "set-titles", "on"]);
	tmuxCommand([
		"set-option",
		"-t",
		target,
		"set-titles-string",
		"#{?@tp_name,#T · #{@tp_name},#T}",
	]);
	context.stderr(`Named ${target} → ${label}`);
	recordSnapshot();
	return 0;
}

function screenshotDirectory(): string {
	if (process.env.TP_SHOT_DIR) return process.env.TP_SHOT_DIR;
	const config = loadConfig();
	return (
		config.shot.remote_dir ||
		join(process.env.HOME || process.cwd(), ".cache", "pi", "screenshots")
	);
}

function screenshots(directory: string): string[] {
	try {
		return readdirSync(directory, { withFileTypes: true })
			.filter((entry) => /\.(?:png|jpe?g|gif|webp|bmp)$/i.test(entry.name))
			.map((entry) => {
				const path = join(directory, entry.name);
				try {
					return {
						path,
						mtime: statSync(path).mtimeMs,
						file: statSync(path).isFile(),
					};
				} catch {
					return { path, mtime: 0, file: false };
				}
			})
			.filter((entry) => entry.file)
			.sort(
				(left, right) =>
					right.mtime - left.mtime || right.path.localeCompare(left.path),
			)
			.map((entry) => entry.path);
	} catch {
		return [];
	}
}

function shotCommand(context: CommandContext): number {
	const action = context.args.positionals[0] ?? "latest";
	const rest = context.args.positionals.slice(1);
	const directory = screenshotDirectory();
	if (action === "dir") {
		if (rest.length) {
			context.stderr("Usage: tp shot dir");
			return 2;
		}
		context.stdout(`${directory}\n`);
		return 0;
	}
	if (action === "list" || action === "ls") {
		if (rest.length > 1) {
			context.stderr("Usage: tp shot list [count]");
			return 2;
		}
		let limit = 10;
		if (rest[0] !== undefined) {
			if (!/^\d+$/.test(rest[0]) || rest[0].length > 6) {
				context.stderr("tp shot list: invalid count");
				return 2;
			}
			limit = Number(rest[0]);
			if (limit < 1) {
				context.stderr("tp shot list: count must be at least 1");
				return 2;
			}
		}
		const paths = screenshots(directory);
		if (!paths.length) {
			context.stderr(`No uploaded screenshots in ${directory}`);
			return 1;
		}
		context.stdout(`${paths.slice(0, limit).join("\n")}\n`);
		return 0;
	}
	if (action !== "latest" || rest.length) {
		context.stderr("Usage: tp shot [latest|list [count]|dir]");
		return 2;
	}
	const paths = screenshots(directory);
	if (!paths.length) {
		context.stderr(`No uploaded screenshots in ${directory}`);
		return 1;
	}
	context.stdout(`${paths[0]}\n`);
	return 0;
}

export function registerCoreCommands(): void {
	registerCommandHandler("new", nextSession);
	registerCommandHandler("pi", piCommand);
	registerCommandHandler("last", lastCommand);
	registerCommandHandler("kill", killCommand);
	registerCommandHandler("name", nameCommand);
	registerCommandHandler("shot", shotCommand);
}
