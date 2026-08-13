import { constants, accessSync, existsSync, statSync } from "node:fs";
import { isIP } from "node:net";
import { basename, join } from "node:path";
import { type CommandContext, registerCommandHandler } from "../lib/cli";
import {
	ConfigError,
	type TpConfig,
	configPath,
	loadConfig,
} from "../lib/config";
import { readCurrentSshOriginState } from "../lib/origin";
import { listSessions, tmuxCommand } from "../lib/tmux";

export type DoctorStatus = "pass" | "fail" | "skip";

export interface DoctorCheck {
	id: number;
	status: DoctorStatus;
	detail: string;
}

interface ProcessResult {
	exitCode: number;
	stdout: string;
	stderr: string;
	timedOut: boolean;
}

interface ConfigState {
	config?: TpConfig;
	path: string;
	status: "absent" | "valid" | "invalid";
	detail?: string;
	warnings: string[];
}

interface TailscaleState {
	available: boolean;
	status: ProcessResult | undefined;
	statusPass: boolean;
}

function check(id: number, status: DoctorStatus, detail: string): DoctorCheck {
	return { id, status, detail };
}

function commandExists(command: string): boolean {
	return Bun.which(command) !== null;
}

function readableError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

async function runProcess(
	command: string,
	args: readonly string[],
	timeoutMs?: number,
): Promise<ProcessResult> {
	let child: ReturnType<typeof Bun.spawn>;
	try {
		child = Bun.spawn([command, ...args], {
			env: { ...process.env, TP_STUB_COMMAND: command },
			stdout: "pipe",
			stderr: "pipe",
		});
	} catch (error) {
		return {
			exitCode: 127,
			stdout: "",
			stderr: readableError(error),
			timedOut: false,
		};
	}

	const stdoutPromise =
		child.stdout && typeof child.stdout !== "number"
			? new Response(child.stdout).text()
			: Promise.resolve("");
	const stderrPromise =
		child.stderr && typeof child.stderr !== "number"
			? new Response(child.stderr).text()
			: Promise.resolve("");
	const completed = Promise.all([
		stdoutPromise,
		stderrPromise,
		child.exited,
	]).then(([stdout, stderr, exitCode]) => ({
		stdout,
		stderr,
		exitCode,
		timedOut: false,
	}));
	if (timeoutMs === undefined) return completed;

	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<ProcessResult>((resolve) => {
		timer = setTimeout(() => {
			child.kill("SIGKILL");
			void Promise.all([stdoutPromise, stderrPromise, child.exited]).then(
				([stdout, stderr, exitCode]) =>
					resolve({ stdout, stderr, exitCode, timedOut: true }),
			);
		}, timeoutMs);
	});
	const result = await Promise.race([completed, timeout]);
	if (timer !== undefined) clearTimeout(timer);
	return result;
}

function configState(): ConfigState {
	const path = configPath();
	const warnings: string[] = [];
	try {
		const config = loadConfig({ warn: (message) => warnings.push(message) });
		if (!existsSync(path)) return { config, path, status: "absent", warnings };
		return { config, path, status: "valid", warnings };
	} catch (error) {
		return {
			path,
			status: "invalid",
			detail:
				error instanceof ConfigError
					? error.message
					: `could not read configuration: ${readableError(error)}`,
			warnings,
		};
	}
}

function tmuxChecks(): {
	result: DoctorCheck;
	reachable: boolean;
} {
	if (!commandExists("tmux"))
		return {
			result: check(1, "fail", "tmux is not on PATH"),
			reachable: false,
		};

	let versionOutput = "";
	let versionError = "";
	try {
		versionOutput = tmuxCommand(["-V"], true).trim();
	} catch (error) {
		versionError = readableError(error);
	}
	const versionMatch = /(?:^|\s)(\d+)\.(\d+)/u.exec(versionOutput);
	const versionOk =
		versionMatch !== null &&
		(Number(versionMatch[1]) > 3 ||
			(Number(versionMatch[1]) === 3 && Number(versionMatch[2]) >= 2));

	let reachable = false;
	try {
		tmuxCommand(["list-sessions"], false);
		reachable = true;
	} catch {
		// list-sessions is intentionally used instead of start-server: doctor is
		// read-only and must not create a tmux server.
	}

	if (versionOk && reachable)
		return {
			result: check(1, "pass", `${versionOutput}; server reachable`),
			reachable,
		};
	const reasons: string[] = [];
	if (!versionOk)
		reasons.push(
			versionOutput
				? `${versionOutput}; requires version >= 3.2`
				: versionError || "could not determine tmux version",
		);
	if (!reachable) reasons.push("server not reachable");
	return { result: check(1, "fail", reasons.join("; ")), reachable };
}

function insideTmuxCheck(): DoctorCheck {
	if (!process.env.TMUX)
		return check(2, "pass", "outside tmux (informational)");
	try {
		const current = tmuxCommand(
			["display-message", "-p", "#{client_tty} #{session_name}"],
			false,
		).trim();
		if (current) return check(2, "pass", `${current} (informational)`);
	} catch {
		// This check is informational; an unavailable client is not an
		// operational doctor failure.
	}
	return check(2, "skip", "tmux client details unavailable (informational)");
}

function configCheck(state: ConfigState): DoctorCheck {
	if (state.status === "invalid")
		return check(3, "fail", state.detail ?? "invalid configuration");
	if (state.status === "absent")
		return check(3, "pass", "configuration absent (ok)");
	const warning = state.warnings.length ? `; ${state.warnings.join("; ")}` : "";
	return check(3, "pass", `valid configuration${warning}`);
}

function shellCheck(state: ConfigState): DoctorCheck {
	if (!state.config) return check(4, "skip", "configuration unavailable");
	const shell = state.config.shell;
	try {
		const path = shell.includes("/") ? shell : Bun.which(shell);
		if (!path) return check(4, "fail", `shell '${shell}' is not on PATH`);
		accessSync(path, constants.X_OK);
		if (!statSync(path).isFile())
			return check(4, "fail", `shell '${shell}' is not an executable file`);
		return check(4, "pass", `${shell} is executable`);
	} catch {
		return check(4, "fail", `shell '${shell}' is not executable`);
	}
}

function piPublishingCheck(reachable: boolean): DoctorCheck {
	if (!reachable) return check(5, "skip", "tmux server unavailable");
	let sessions: ReturnType<typeof listSessions>;
	try {
		sessions = listSessions();
	} catch {
		return check(5, "skip", "could not inspect tmux sessions");
	}
	if (sessions.length === 0) return check(5, "skip", "no tmux sessions");
	const live = sessions.some(
		(session) => session.pi?.sessionId && session.pi.pid !== undefined,
	);
	return live
		? check(5, "pass", "a live session publishes a Pi session id")
		: check(5, "fail", "no live session publishes a Pi session id");
}

function originCheck(): DoctorCheck {
	if (!process.env.TMUX)
		return check(6, "skip", "not inside tmux; no current client");
	const state = readCurrentSshOriginState();
	if (state.kind === "missing")
		return check(6, "fail", "current client has no SSH origin mapping");
	if (state.kind === "invalid")
		return check(6, "fail", "current client SSH origin mapping is invalid");
	if (state.origin.created !== state.origin.clientCreated)
		return check(6, "fail", "SSH origin mapping is stale");
	return check(6, "pass", `SSH origin mapping is fresh (${state.origin.ip})`);
}

function statusBackendState(value: string): string | undefined {
	try {
		const parsed: unknown = JSON.parse(value);
		if (typeof parsed !== "object" || parsed === null) return undefined;
		const state = (parsed as Record<string, unknown>).BackendState;
		return typeof state === "string" ? state : undefined;
	} catch {
		return undefined;
	}
}

function extractFirstIp(value: string): string | undefined {
	return value.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/u)?.[0];
}

function extractSelfIp(value: string): string | undefined {
	try {
		const parsed: unknown = JSON.parse(value);
		if (typeof parsed !== "object" || parsed === null) return undefined;
		const root = parsed as Record<string, unknown>;
		const self =
			root.Self && typeof root.Self === "object"
				? (root.Self as Record<string, unknown>)
				: root;
		const ips = self.TailscaleIPs;
		if (!Array.isArray(ips)) return undefined;
		return ips.find(
			(candidate): candidate is string =>
				typeof candidate === "string" && isIP(candidate) !== 0,
		);
	} catch {
		return undefined;
	}
}

async function tailscaleChecks(): Promise<{
	checks: DoctorCheck[];
	state: TailscaleState;
	selfIp?: string;
}> {
	if (!commandExists("tailscale"))
		return {
			checks: [
				check(7, "skip", "tailscale is not installed"),
				check(8, "skip", "tailscale is not installed"),
			],
			state: { available: false, status: undefined, statusPass: false },
		};
	const status = await runProcess("tailscale", ["status", "--json"], 2_000);
	const statusText = `${status.stdout}\n${status.stderr}`.toLowerCase();
	const backendState = statusBackendState(status.stdout);
	const loggedOut =
		/needslogin|logged\s*out|not\s+logged\s+in|stopped/u.test(statusText) ||
		(backendState !== undefined && backendState !== "Running");
	const statusPass = status.exitCode === 0 && !status.timedOut && !loggedOut;
	const statusCheck = statusPass
		? check(7, "pass", "tailscale is installed and logged in")
		: check(
				7,
				"fail",
				status.timedOut
					? "tailscale status timed out"
					: "tailscale status reports that tailscale is not logged in",
			);
	if (!statusPass)
		return {
			checks: [
				statusCheck,
				check(8, "skip", "tailscale status is unavailable"),
			],
			state: { available: true, status, statusPass },
		};

	const selfIp = extractSelfIp(status.stdout);
	const target = selfIp ?? extractFirstIp(status.stdout);
	if (!target) {
		return {
			checks: [
				statusCheck,
				check(8, "fail", "could not determine the local tailscale IP"),
			],
			state: { available: true, status, statusPass },
		};
	}
	const whois = await runProcess(
		"tailscale",
		["whois", "--json", target],
		2_000,
	);
	const whoisPass = whois.exitCode === 0 && !whois.timedOut;
	return {
		checks: [
			statusCheck,
			whoisPass
				? check(8, "pass", `tailscale whois resolves self (${target})`)
				: check(8, "fail", "tailscale whois could not resolve self"),
		],
		state: { available: true, status, statusPass },
		selfIp: target,
	};
}

function taildriveCheck(
	state: ConfigState,
	tailscale: TailscaleState,
): DoctorCheck {
	if (process.platform !== "darwin")
		return check(9, "skip", "bridge share is macOS-only");
	if (!state.config || state.status === "invalid")
		return check(9, "skip", "configuration unavailable");
	if (state.config.shot.transport !== "taildrive")
		return check(9, "skip", "taildrive transport is not configured");
	if (!tailscale.available)
		return check(9, "skip", "tailscale is not installed");
	const path = state.config.shot.taildrive_dir;
	if (!path) return check(9, "fail", "shot.taildrive_dir is not configured");
	try {
		accessSync(path, constants.R_OK);
		return check(9, "pass", `taildrive mount is reachable (${path})`);
	} catch {
		return check(9, "fail", `taildrive mount is not reachable (${path})`);
	}
}

function notifierAvailable(notifier: string): boolean {
	if (notifier === "none") return true;
	if (notifier === "terminal-notifier")
		return commandExists("terminal-notifier");
	if (notifier === "osascript") return commandExists("osascript");
	if (notifier === "auto")
		return commandExists("terminal-notifier") || commandExists("osascript");
	return false;
}

async function shotCheck(state: ConfigState): Promise<DoctorCheck> {
	if (process.platform !== "darwin")
		return check(10, "skip", "tp-shot SSH check is macOS-only");
	if (!state.config || state.status === "invalid")
		return check(10, "skip", "configuration unavailable");
	const host = state.config.shot.host || "good-studio";
	const ssh = await runProcess(
		"ssh",
		["-o", "BatchMode=yes", "-o", "ConnectTimeout=5", "--", host, "true"],
		5_000,
	);
	const notifier = state.config.shot.notifier || "auto";
	const notifierOk = notifierAvailable(notifier);
	const sshOk = ssh.exitCode === 0 && !ssh.timedOut;
	if (sshOk && notifierOk)
		return check(10, "pass", `SSH reachable (${host}); notifier available`);
	const details: string[] = [];
	if (!sshOk)
		details.push(
			ssh.timedOut
				? `SSH to ${host} timed out after 5s`
				: `SSH to ${host} failed`,
		);
	if (!notifierOk) details.push(`notifier '${notifier}' is unavailable`);
	return check(10, "fail", details.join("; "));
}

function completionsCheck(): DoctorCheck {
	const shell = process.env.SHELL ? basename(process.env.SHELL) : "";
	const home = process.env.HOME;
	if (!home || !shell)
		return check(11, "skip", "current shell is unavailable (informational)");
	const configHome = process.env.XDG_CONFIG_HOME || join(home, ".config");
	const candidates: string[] =
		shell === "fish"
			? [join(configHome, "fish", "completions", "tp.fish")]
			: shell === "bash"
				? [
						join(
							home,
							".local",
							"share",
							"bash-completion",
							"completions",
							"tp",
						),
						join(home, ".bash_completion.d", "tp"),
					]
				: shell === "zsh"
					? [
							join(home, ".zfunc", "_tp"),
							join(configHome, "zsh", "completions", "_tp"),
						]
					: [];
	if (candidates.length === 0)
		return check(
			11,
			"skip",
			`completion detection is unavailable for ${shell} (informational)`,
		);
	if (candidates.some((path) => existsSync(path)))
		return check(
			11,
			"pass",
			`${shell} completions shim is installed (informational)`,
		);
	return check(
		11,
		"skip",
		`${shell} completions shim not detected (informational)`,
	);
}

async function doctorCommand(context: CommandContext): Promise<number> {
	const tmux = tmuxChecks();
	const config = configState();
	const results: DoctorCheck[] = [
		tmux.result,
		insideTmuxCheck(),
		configCheck(config),
		shellCheck(config),
		piPublishingCheck(tmux.reachable),
		originCheck(),
	];
	const tailscale = await tailscaleChecks();
	results.push(...tailscale.checks);
	results.push(taildriveCheck(config, tailscale.state));
	results.push(await shotCheck(config));
	results.push(completionsCheck());

	if (context.args.options.json === true)
		context.stdout(`${JSON.stringify(results)}\n`);
	else
		context.stdout(
			`${results.map((item) => `${item.id} ${item.status === "pass" ? "✓" : item.status === "fail" ? "✗" : "–"} ${item.detail}`).join("\n")}\n`,
		);
	return results.some((item) => item.status === "fail") ? 1 : 0;
}

export function registerDoctorCommands(): void {
	registerCommandHandler("doctor", doctorCommand);
}
