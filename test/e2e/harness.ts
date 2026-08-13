import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export interface CommandResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

export interface RunOptions {
	cwd?: string;
	env?: Record<string, string | undefined>;
	stdin?: string;
}

export interface ScratchTmuxOptions {
	root?: string;
}

export interface FakePiOptions {
	sessionName?: string;
	sessionId?: string;
	state?: string;
	tool?: string;
	stateSince?: string | number;
	ctxPct?: string | number;
	model?: string;
}

export interface FakePi {
	sessionName: string;
	paneId: string;
	pid: number;
	options(): Record<string, string>;
	stop(): void;
}

export interface StubInvocation {
	command: string;
	argv: string[];
	stdin: string;
}

export interface StubKit {
	directory: string;
	logPath: string;
	env: Record<string, string>;
	readInvocations(): StubInvocation[];
	cleanup(): void;
}

const repoRoot = resolve(import.meta.dir, "../..");
const fakePiPath = join(import.meta.dir, "fixtures", "fake-pi.ts");
const decoder = new TextDecoder();

function randomToken(): string {
	return Math.random().toString(36).slice(2, 10);
}

function mergedEnvironment(
	env: Record<string, string | undefined> | undefined,
): Record<string, string> {
	const result: Record<string, string> = {};
	for (const [key, value] of Object.entries(process.env)) {
		if (value !== undefined) result[key] = value;
	}
	for (const [key, value] of Object.entries(env ?? {})) {
		if (value === undefined) delete result[key];
		else result[key] = value;
	}
	return result;
}

async function runEntry(
	entrypoint: string,
	args: readonly string[],
	options: RunOptions = {},
): Promise<CommandResult> {
	const child = Bun.spawn([process.execPath, entrypoint, ...args], {
		cwd: options.cwd ?? repoRoot,
		env: mergedEnvironment(options.env),
		stdin: options.stdin === undefined ? "ignore" : "pipe",
		stdout: "pipe",
		stderr: "pipe",
	});
	if (options.stdin !== undefined) {
		child.stdin?.write(options.stdin);
		child.stdin?.end();
	}
	const stdout = new Response(child.stdout).text();
	const stderr = new Response(child.stderr).text();
	const [stdoutText, stderrText, exitCode] = await Promise.all([
		stdout,
		stderr,
		child.exited,
	]);
	return { stdout: stdoutText, stderr: stderrText, exitCode };
}

/** Run the real TypeScript tp entrypoint under the current Bun executable. */
export function runTp(
	args: readonly string[] = [],
	options: RunOptions = {},
): Promise<CommandResult> {
	return runEntry(join(repoRoot, "src/bin/tp.ts"), args, options);
}

/** Run the real TypeScript tp-shot entrypoint under the current Bun executable. */
export function runTpShot(
	args: readonly string[] = [],
	options: RunOptions = {},
): Promise<CommandResult> {
	return runEntry(join(repoRoot, "src/bin/tp-shot.ts"), args, options);
}

function socketPath(name: string): string {
	const uid = typeof process.getuid === "function" ? process.getuid() : 0;
	return join(process.env.TMUX_TMPDIR ?? "/tmp", `tmux-${uid}`, name);
}

function tmuxResult(
	socket: string,
	args: readonly string[],
	options: {
		allowFailure?: boolean;
		env?: Record<string, string | undefined>;
	} = {},
): CommandResult {
	const child = Bun.spawnSync({
		cmd: ["tmux", "-L", socket, "-f", "/dev/null", ...args],
		env: mergedEnvironment(options.env),
		stdout: "pipe",
		stderr: "pipe",
	});
	const result = {
		stdout: decoder.decode(child.stdout),
		stderr: decoder.decode(child.stderr),
		exitCode: child.exitCode,
	};
	if (result.exitCode !== 0 && !options.allowFailure)
		throw new Error(`tmux ${args.join(" ")} failed: ${result.stderr.trim()}`);
	return result;
}

/** A throwaway tmux server whose name is safe to use from parallel test suites. */
export class ScratchTmuxServer {
	readonly socket: string;
	readonly socketFile: string;
	readonly root: string;
	readonly env: Record<string, string>;
	private started = false;

	constructor(options: ScratchTmuxOptions = {}) {
		this.socket = `tp-test-${process.pid}-${randomToken()}`;
		this.socketFile = socketPath(this.socket);
		this.root = options.root ?? mkdtempSync(join(tmpdir(), "tp-e2e-"));
		this.env = { TP_TMUX_SOCKET: this.socket };
	}

	start(): void {
		if (this.started) return;
		tmuxResult(this.socket, ["start-server"]);
		this.started = true;
	}

	run(args: readonly string[], allowFailure = false): CommandResult {
		if (!this.started) throw new Error("scratch tmux server is not started");
		return tmuxResult(this.socket, args, { allowFailure });
	}

	isRunning(): boolean {
		return (
			tmuxResult(this.socket, ["list-sessions"], { allowFailure: true })
				.exitCode === 0
		);
	}

	socketExists(): boolean {
		try {
			return (
				statSync(this.socketFile).isSocket() ||
				statSync(this.socketFile).size > 0
			);
		} catch {
			return false;
		}
	}

	startFakePi(options: FakePiOptions = {}): FakePi {
		return this.createFakePi(options);
	}

	createFakePi(options: FakePiOptions = {}): FakePi {
		if (!this.started) this.start();
		const sessionName = options.sessionName ?? `fake-pi-${randomToken()}`;
		const args = [
			process.execPath,
			fakePiPath,
			"--socket",
			this.socket,
			"--session-id",
			options.sessionId ?? "019ff650-ac6d-7641-bb90-4475b973cc82",
			"--state",
			options.state ?? "idle",
			"--tool",
			options.tool ?? "bash",
			"--state-since",
			String(options.stateSince ?? Math.floor(Date.now() / 1000)),
			"--ctx-pct",
			String(options.ctxPct ?? 24),
			"--model",
			options.model ?? "test-model",
		];
		this.run(["new-session", "-d", "-s", sessionName, "--", ...args]);
		const paneId = this.run([
			"display-message",
			"-p",
			"-t",
			`${sessionName}:0.0`,
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
			throw new Error(
				`fake Pi pane did not start (pane=${paneId}, pid=${pidText})`,
			);
		return {
			sessionName,
			paneId,
			pid,
			options: () => {
				const names = [
					"@pi_session_id",
					"@pi_pid",
					"@pi_state",
					"@pi_tool",
					"@pi_state_since",
					"@pi_ctx_pct",
					"@pi_model",
				];
				return Object.fromEntries(
					names.map((name) => [
						name,
						this.run(
							["show-option", "-p", "-t", paneId, "-v", name],
							true,
						).stdout.trim(),
					]),
				) as Record<string, string>;
			},
			stop: () => {
				if (this.isRunning())
					this.run(["kill-session", "-t", `=${sessionName}`], true);
			},
		};
	}

	teardown(): void {
		if (this.started)
			tmuxResult(this.socket, ["kill-server"], { allowFailure: true });
		this.started = false;
		for (let attempt = 0; attempt < 20; attempt += 1) {
			try {
				unlinkSync(this.socketFile);
				break;
			} catch {
				if (!this.socketExists()) break;
			}
		}
		rmSync(this.root, { recursive: true, force: true });
	}
}

/** Build isolated command stubs and return their PATH/log wiring. */
export function createStubKit(
	root = mkdtempSync(join(tmpdir(), "tp-stubs-")),
): StubKit {
	const directory = join(root, "bin");
	const logPath = join(root, "invocations.jsonl");
	mkdirSync(root, { recursive: true });
	mkdirSync(directory, { recursive: true });
	writeFileSync(logPath, "");
	const stubSource = `#!/usr/bin/env bun\nimport { appendFileSync } from "node:fs";\nconst data = await new Response(Bun.stdin.stream()).text();\nappendFileSync(process.env.TP_STUB_LOG!, JSON.stringify({ command: process.env.TP_STUB_COMMAND, argv: process.argv.slice(2), stdin: data }) + "\\n");\n`;
	writeFileSync(join(root, "stub.ts"), stubSource);
	for (const command of [
		"ssh",
		"scp",
		"screencapture",
		"pbcopy",
		"osascript",
		"terminal-notifier",
		"tailscale",
		"nohup",
		"uuidgen",
	]) {
		const path = join(directory, command);
		writeFileSync(
			path,
			stubSource.replace("#!/usr/bin/env bun", `#!${process.execPath}`),
		);
		chmodSync(path, 0o755);
	}
	return {
		directory,
		logPath,
		env: {
			PATH: `${directory}:${process.env.PATH ?? ""}`,
			TP_STUB_LOG: logPath,
		},
		readInvocations: () => {
			const text = readFileSync(logPath, "utf8");
			return text
				.split("\n")
				.filter(Boolean)
				.map((line) => JSON.parse(line) as StubInvocation);
		},
		cleanup: () => rmSync(root, { recursive: true, force: true }),
	};
}

export function waitFor(
	predicate: () => boolean,
	attempts = 40,
	intervalMs = 25,
): void {
	for (let attempt = 0; attempt < attempts; attempt += 1) {
		if (predicate()) return;
		Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, intervalMs);
	}
	throw new Error("condition did not become true before timeout");
}

export function runStub(
	kit: StubKit,
	command: string,
	args: readonly string[] = [],
	stdin = "",
): CommandResult {
	const child = Bun.spawnSync({
		cmd: [join(kit.directory, command), ...args],
		env: { ...mergedEnvironment(kit.env), TP_STUB_COMMAND: command },
		stdin: new TextEncoder().encode(stdin),
		stdout: "pipe",
		stderr: "pipe",
	});
	return {
		stdout: decoder.decode(child.stdout),
		stderr: decoder.decode(child.stderr),
		exitCode: child.exitCode,
	};
}

export { repoRoot };
