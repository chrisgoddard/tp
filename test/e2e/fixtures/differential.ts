import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import type { CommandResult, RunOptions } from "../harness";
import { runTp } from "../harness";

const decoder = new TextDecoder();
const repoRoot = resolve(import.meta.dir, "../../..");
const fishEntrypoint = join(repoRoot, "legacy/functions/tp.fish");
const fakePiEntrypoint = join(import.meta.dir, "fake-pi.ts");
const tmuxBinary = Bun.which("tmux") ?? "/usr/bin/tmux";

export interface DifferentialRunOptions {
	cwd: string;
	env?: Record<string, string | undefined>;
}

export interface FakePiOptions {
	sessionName: string;
	sessionId: string;
	state: string;
	tool: string;
	stateSince: number;
	ctxPct: number;
	model: string;
}

export interface FakePiProcess {
	sessionName: string;
	paneId: string;
	pid: number;
	stop(): void;
}

function inheritedEnvironment(
	env: Record<string, string | undefined> = {},
): Record<string, string> {
	const result: Record<string, string> = {};
	for (const [key, value] of Object.entries(process.env)) {
		if (value !== undefined) result[key] = value;
	}
	for (const [key, value] of Object.entries(env)) {
		if (value === undefined) delete result[key];
		else result[key] = value;
	}
	return result;
}

function randomToken(): string {
	return Math.random().toString(36).slice(2, 10);
}

function socketPath(socket: string): string {
	const uid = typeof process.getuid === "function" ? process.getuid() : 0;
	return join(process.env.TMUX_TMPDIR ?? "/tmp", `tmux-${uid}`, socket);
}

export class DifferentialTmuxServer {
	readonly socket = `tp-parity-${process.pid}-${randomToken()}`;
	readonly socketFile = socketPath(this.socket);
	readonly root = mkdtempSync(join(tmpdir(), "tp-parity-server-"));
	readonly env = {
		TP_TMUX_SOCKET: this.socket,
		TMUX: undefined,
		TMUX_PANE: undefined,
	};
	private started = false;

	constructor(readonly cwd: string) {}

	private invoke(args: readonly string[], allowFailure = false): CommandResult {
		const child = Bun.spawnSync({
			cmd: [tmuxBinary, "-L", this.socket, "-f", "/dev/null", ...args],
			env: inheritedEnvironment({ TMUX: undefined }),
			stdout: "pipe",
			stderr: "pipe",
		});
		const result = {
			stdout: decoder.decode(child.stdout),
			stderr: decoder.decode(child.stderr),
			exitCode: child.exitCode,
		};
		if (result.exitCode !== 0 && !allowFailure)
			throw new Error(`tmux ${args.join(" ")} failed: ${result.stderr.trim()}`);
		return result;
	}

	start(): void {
		if (this.started) return;
		this.invoke(["start-server"]);
		this.started = true;
	}

	run(args: readonly string[], allowFailure = false): CommandResult {
		if (!this.started)
			throw new Error("differential tmux server is not started");
		return this.invoke(args, allowFailure);
	}

	newSession(name: string): void {
		this.run(["new-session", "-d", "-s", name, "-c", this.cwd]);
	}

	setSessionOption(name: string, option: string, value: string): void {
		this.run(["set-option", "-t", name, option, value]);
	}

	setPaneOption(name: string, option: string, value: string): void {
		this.run(["set-option", "-p", "-t", `${name}:0.0`, option, value]);
	}

	showPaneOption(name: string, option: string): string {
		return this.run(
			["show-option", "-p", "-t", `${name}:0.0`, "-v", option],
			true,
		).stdout.trim();
	}

	startFakePi(options: FakePiOptions): FakePiProcess {
		const args = [
			process.execPath,
			fakePiEntrypoint,
			"--socket",
			this.socket,
			"--session-id",
			options.sessionId,
			"--state",
			options.state,
			"--tool",
			options.tool,
			"--state-since",
			String(options.stateSince),
			"--ctx-pct",
			String(options.ctxPct),
			"--model",
			options.model,
		];
		this.run([
			"new-session",
			"-d",
			"-s",
			options.sessionName,
			"-c",
			this.cwd,
			"--",
			...args,
		]);
		const paneId = this.run([
			"display-message",
			"-p",
			"-t",
			`${options.sessionName}:0.0`,
			"#{pane_id}",
		]).stdout.trim();
		const pidText = this.run([
			"display-message",
			"-p",
			"-t",
			paneId,
			"#{pane_pid}",
		]).stdout.trim();
		const pid = Number(pidText);
		if (!paneId || !Number.isInteger(pid) || pid <= 0)
			throw new Error(`fake Pi did not start (pane=${paneId}, pid=${pidText})`);
		for (let attempt = 0; attempt < 100; attempt += 1) {
			if (
				this.showPaneOption(options.sessionName, "@pi_session_id") ===
					options.sessionId &&
				this.showPaneOption(options.sessionName, "@pi_state") ===
					options.state &&
				this.showPaneOption(options.sessionName, "@pi_model") === options.model
			)
				break;
			Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
		}
		return {
			sessionName: options.sessionName,
			paneId,
			pid,
			stop: () => {
				if (this.started)
					this.run(["kill-session", "-t", `=${options.sessionName}`], true);
			},
		};
	}

	verifyFishShim(): CommandResult {
		const probe = "shim_probe_001";
		this.newSession(probe);
		try {
			return runFishRaw({
				cwd: this.cwd,
				env: { ...this.env, TP_TMUX_SOCKET: undefined },
				socket: this.socket,
			});
		} finally {
			this.run(["kill-session", "-t", `=${probe}`], true);
		}
	}

	teardown(): void {
		if (this.started) this.invoke(["kill-server"], true);
		this.started = false;
		try {
			rmSync(this.socketFile, { force: true });
		} catch {
			// tmux may remove its socket asynchronously.
		}
		rmSync(this.root, { recursive: true, force: true });
	}
}

function fishEnvironment(
	env: Record<string, string | undefined> = {},
): Record<string, string> {
	const shimRoot = env.TP_PARITY_SHIM_ROOT;
	if (!shimRoot) throw new Error("fish runner is missing its tmux shim root");
	return inheritedEnvironment({
		...env,
		PATH: `${shimRoot}:${process.env.PATH ?? ""}`,
		TMUX: undefined,
		TMUX_PANE: undefined,
		TP_TMUX_SOCKET: undefined,
		TP_PARITY_SHIM_ROOT: undefined,
	});
}

export function makeFishShim(serverSocket: string): {
	root: string;
	cleanup: () => void;
} {
	const root = mkdtempSync(join(tmpdir(), "tp-parity-shim-"));
	const directory = join(root, "bin");
	mkdirSync(directory, { recursive: true });
	writeFileSync(
		join(directory, "tmux"),
		`#!/bin/sh\nexec env -u TMUX ${tmuxBinary} -L ${serverSocket} -f /dev/null "$@"\n`,
	);
	chmodSync(join(directory, "tmux"), 0o755);
	return {
		root: directory,
		cleanup: () => rmSync(root, { recursive: true, force: true }),
	};
}

interface FishRawOptions extends DifferentialRunOptions {
	socket: string;
}

function runFishRaw(options: FishRawOptions): CommandResult {
	const shim = makeFishShim(options.socket);
	try {
		const script = `source ${fishEntrypoint}; tmux list-sessions`;
		const child = Bun.spawnSync({
			cmd: ["fish", "--no-config", "-c", script],
			cwd: options.cwd,
			env: fishEnvironment({
				...options.env,
				TP_PARITY_SHIM_ROOT: shim.root,
			}),
			stdout: "pipe",
			stderr: "pipe",
		});
		return {
			stdout: decoder.decode(child.stdout),
			stderr: decoder.decode(child.stderr),
			exitCode: child.exitCode,
		};
	} finally {
		shim.cleanup();
	}
}

export async function runFishTp(
	args: readonly string[],
	options: DifferentialRunOptions & { socket: string },
): Promise<CommandResult> {
	const shim = makeFishShim(options.socket);
	try {
		const script = `source ${fishEntrypoint}; tp $argv`;
		const child = Bun.spawn(
			["fish", "--no-config", "-c", script, "--", ...args],
			{
				cwd: options.cwd,
				env: fishEnvironment({
					...options.env,
					TP_PARITY_SHIM_ROOT: shim.root,
				}),
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
			child.exited,
		]);
		return { stdout, stderr, exitCode };
	} finally {
		shim.cleanup();
	}
}

export function runTypeScriptTp(
	args: readonly string[],
	options: DifferentialRunOptions & { socket: string },
): Promise<CommandResult> {
	return runTp(args, {
		cwd: options.cwd,
		env: {
			...options.env,
			TP_TMUX_SOCKET: options.socket,
			TMUX: undefined,
			TMUX_PANE: undefined,
		},
	});
}

export function normalizeStderr(
	value: string,
	options: { roots: readonly string[]; sockets: readonly string[] },
): string {
	let result = value;
	for (const root of options.roots) {
		// Scratch roots and the shared project path differ between the two runs.
		result = result.replaceAll(root, "<scratch-path>");
	}
	for (const socket of options.sockets) {
		// tmux names its per-run socket with the process id and random token.
		result = result.replaceAll(socket, "<tmux-socket>");
	}
	// tmux/fish diagnostics can include the child pid, but command output must
	// never be made equal by a broad digit scrub: only a labelled pid is dynamic.
	result = result.replace(/(?<=\bpid[=: ])\d+/gi, "<pid>");
	return result;
}

export function describeBytes(value: string): string {
	return JSON.stringify(value);
}

export function projectName(cwd: string): string {
	return basename(cwd).replace(/^\.+/, "");
}

export interface IntentionalDivergence {
	id: string;
	field: "stdout" | "stderr" | "exitCode";
	reason: string;
}

// This is the exhaustive v0.2 exception list. Each row is asserted as a
// difference by the differential test; no output is silently exempted.
export const intentionalDivergences: IntentionalDivergence[] = [
	{
		id: "empty/ls",
		field: "exitCode",
		reason: "epic #11/#17 normalizes an empty project listing to success",
	},
	{
		id: "empty/sid",
		field: "stderr",
		reason: "epic #11 normalizes sid usage spelling",
	},
	{
		id: "empty/kill-3",
		field: "stdout",
		reason: "epic #11 routes v0.2 command diagnostics to stderr",
	},
	{
		id: "empty/kill-3",
		field: "stderr",
		reason: "epic #11 routes v0.2 command diagnostics to stderr",
	},
	{
		id: "empty/name-1",
		field: "stdout",
		reason: "epic #11 routes v0.2 command diagnostics to stderr",
	},
	{
		id: "empty/name-1",
		field: "stderr",
		reason: "epic #11 routes v0.2 command diagnostics to stderr",
	},
	{
		id: "three/g-prefix",
		field: "stdout",
		reason: "epic #11 adds global project-prefix selection",
	},
	{
		id: "three/g-prefix",
		field: "exitCode",
		reason: "epic #11 adds global project-prefix selection",
	},
	{
		id: "three/name-2",
		field: "stdout",
		reason: "epic #11 routes v0.2 naming diagnostics to stderr",
	},
	{
		id: "three/name-2",
		field: "stderr",
		reason: "epic #11 routes v0.2 naming diagnostics to stderr",
	},
	{
		id: "three/bad-99x",
		field: "stdout",
		reason: "epic #11 normalizes unknown-command usage to exit 2",
	},
	{
		id: "three/bad-99x",
		field: "stderr",
		reason: "epic #11 normalizes unknown-command usage to exit 2",
	},
	{
		id: "three/bad-99x",
		field: "exitCode",
		reason: "epic #11 normalizes unknown-command usage to exit 2",
	},
	{
		id: "three/bad-kill",
		field: "stdout",
		reason: "epic #11 normalizes invalid numeric arguments to usage",
	},
	{
		id: "three/bad-kill",
		field: "stderr",
		reason: "epic #11 normalizes invalid numeric arguments to usage",
	},
	{
		id: "three/bad-kill",
		field: "exitCode",
		reason: "epic #11 normalizes invalid numeric arguments to usage",
	},
	{
		id: "kill-non-tty/kill",
		field: "stdout",
		reason: "epic #11 makes non-TTY kill confirmation explicit",
	},
	{
		id: "kill-non-tty/kill",
		field: "stderr",
		reason: "epic #11 makes non-TTY kill confirmation explicit",
	},
	{
		id: "kill-non-tty/kill",
		field: "exitCode",
		reason: "epic #11 makes non-TTY kill confirmation explicit",
	},
	{
		id: "errors/ambiguous-label",
		field: "stdout",
		reason: "epic #11 adds label-prefix attachment resolution",
	},
	{
		id: "errors/ambiguous-label",
		field: "stderr",
		reason: "epic #11 adds label-prefix attachment resolution",
	},
	{
		id: "errors/ambiguous-label",
		field: "exitCode",
		reason: "epic #11 adds label-prefix attachment resolution",
	},
	{
		id: "errors/global-out-of-range",
		field: "stdout",
		reason: "epic #11 routes global selector diagnostics to stderr",
	},
	{
		id: "errors/global-out-of-range",
		field: "stderr",
		reason: "epic #11 routes global selector diagnostics to stderr",
	},
];
