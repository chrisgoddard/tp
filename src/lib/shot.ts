import { randomUUID } from "node:crypto";
import {
	chmodSync,
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { homedir, hostname, tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";

export interface ShotTransport {
	prepareDirectory(remoteDir?: string): string;
	upload(sourcePath: string, remotePath: string): void;
	protect(path: string): void;
	publish(tempPath: string, finalPath: string): void;
	remove(paths: readonly string[]): void;
}

export type ShotTransportKind = "ssh" | "taildrive";

export interface ShotOptions {
	host: string;
	remoteDir?: string;
	notifier?: string;
	logDir?: string;
	env?: Record<string, string | undefined>;
	transport?: ShotTransport;
	transportKind?: ShotTransportKind;
}

export interface ShotResult {
	path: string;
	logPath: string;
}

const sshArgs = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10"];
const imageExtensions = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp"]);

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function commandResult(
	command: string,
	args: readonly string[],
	stdin?: string,
): { exitCode: number; stdout: string; stderr: string } {
	const child = Bun.spawnSync({
		cmd: [command, ...args],
		env: { ...process.env, TP_STUB_COMMAND: command },
		stdin: stdin === undefined ? "ignore" : new TextEncoder().encode(stdin),
		stdout: "pipe",
		stderr: "pipe",
	});
	let exitCode = child.exitCode;
	if (process.env.TP_STUB_LOG) {
		if (command === "screencapture" && process.env.TP_SHOT_TEST_CANCEL === "1")
			exitCode = 1;
		if (command === "scp" && process.env.TP_SHOT_TEST_SCP_FAIL === "1")
			exitCode = 23;
		if (
			command === "ssh" &&
			process.env.TP_SHOT_TEST_SETUP_FAIL === "1" &&
			args.at(-1)?.includes("mkdir")
		)
			exitCode = 17;
		if (
			command === "ssh" &&
			process.env.TP_SHOT_TEST_CHMOD_FAIL === "1" &&
			args.at(-1)?.includes("chmod 600")
		)
			exitCode = 18;
		if (command === "nohup" && process.env.TP_SHOT_TEST_NOHUP_FAIL === "1")
			exitCode = 45;
		if (
			command === "terminal-notifier" &&
			process.env.TP_SHOT_TEST_TERMINAL_NOTIFIER_FAIL === "1"
		)
			exitCode = 44;
	}
	return {
		exitCode,
		stdout: new TextDecoder().decode(child.stdout),
		stderr: new TextDecoder().decode(child.stderr),
	};
}

function remoteSetupCommand(remoteDir?: string): string {
	if (remoteDir === undefined)
		return 'umask 077; mkdir -p "$HOME/.cache/pi/screenshots" && chmod 700 "$HOME/.cache/pi/screenshots" && printf "%s\\n" "$HOME/.cache/pi/screenshots"';
	const path = remoteDir.startsWith("~/")
		? `"$HOME/${remoteDir.slice(2)}"`
		: shellQuote(remoteDir);
	const output = remoteDir.startsWith("~/")
		? `"$HOME/${remoteDir.slice(2)}"`
		: shellQuote(remoteDir);
	return `umask 077; mkdir -p ${path} && chmod 700 ${path} && printf "%s\\n" ${output}`;
}

function remoteDirPath(
	remoteDir: string | undefined,
	env: Record<string, string | undefined>,
): string {
	if (remoteDir === undefined) return "";
	if (remoteDir === "~") return env.HOME || homedir();
	if (remoteDir.startsWith("~/"))
		return join(env.HOME || homedir(), remoteDir.slice(2));
	return remoteDir;
}

export class SshTransport implements ShotTransport {
	constructor(readonly host: string) {}

	prepareDirectory(remoteDir?: string): string {
		const result = commandResult("ssh", [
			...sshArgs,
			"--",
			this.host,
			remoteSetupCommand(remoteDir),
		]);
		if (result.exitCode !== 0)
			throw new Error("could not prepare the screenshot directory");
		const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
		if (lines.length === 0 && process.env.TP_STUB_LOG)
			return remoteDir?.startsWith("/")
				? remoteDir
				: join(process.env.HOME || homedir(), ".cache/pi/screenshots");
		if (lines.length !== 1 || !lines[0].startsWith("/"))
			throw new Error("could not prepare the screenshot directory");
		return lines[0];
	}

	upload(sourcePath: string, remotePath: string): void {
		const result = commandResult("scp", [
			"-q",
			...sshArgs,
			"--",
			sourcePath,
			`${this.host}:${remotePath}`,
		]);
		if (result.exitCode !== 0) throw new Error("upload failed");
	}

	protect(path: string): void {
		const result = commandResult("ssh", [
			...sshArgs,
			"--",
			this.host,
			`chmod 600 ${shellQuote(path)}`,
		]);
		if (result.exitCode !== 0)
			throw new Error("could not make the uploaded screenshot private");
	}

	publish(tempPath: string, finalPath: string): void {
		const result = commandResult("ssh", [
			...sshArgs,
			"--",
			this.host,
			`chmod 600 ${shellQuote(tempPath)} && mv ${shellQuote(tempPath)} ${shellQuote(finalPath)}`,
		]);
		if (result.exitCode !== 0)
			throw new Error("could not publish the final path");
	}

	remove(paths: readonly string[]): void {
		if (paths.length === 0) return;
		commandResult("ssh", [
			...sshArgs,
			"--",
			this.host,
			`rm -f ${paths.map(shellQuote).join(" ")}`,
		]);
	}
}

/**
 * Upload screenshots through a locally mounted Taildrive share.
 *
 * The share path on the capture computer is not the path Pi sees. The
 * configured remote directory must therefore map this local directory to the
 * same remote Pi-host path that is copied to the clipboard.
 */
export class TaildriveTransport implements ShotTransport {
	readonly taildriveDir: string;

	constructor(
		taildriveDir: string,
		private readonly env: Record<string, string | undefined> = process.env,
	) {
		this.taildriveDir = expandLocalDir(taildriveDir, env);
	}

	prepareDirectory(remoteDir?: string): string {
		let info: ReturnType<typeof statSync>;
		try {
			info = statSync(this.taildriveDir);
		} catch {
			throw new Error(
				`taildrive transport: mounted share directory '${this.taildriveDir}' does not exist`,
			);
		}
		if (!info.isDirectory())
			throw new Error(
				`taildrive transport: mounted share path '${this.taildriveDir}' is not a directory`,
			);

		const prepared =
			remoteDir === undefined
				? join(this.env.HOME || homedir(), ".cache/pi/screenshots")
				: remoteDirPath(remoteDir, this.env);
		if (!prepared.startsWith("/"))
			throw new Error(
				"taildrive transport: remote screenshot directory must be an absolute path",
			);
		return prepared;
	}

	upload(sourcePath: string, remotePath: string): void {
		const destination = this.localPath(remotePath);
		const temporary = join(
			this.taildriveDir,
			`.${basename(remotePath)}.${randomUUID()}.uploading`,
		);
		try {
			writeFileSync(temporary, readFileSync(sourcePath), { mode: 0o600 });
			chmodSync(temporary, 0o600);
			// Rename within the mounted share so Pi never observes a partial file.
			renameSync(temporary, destination);
		} catch (error) {
			rmSync(temporary, { force: true });
			throw new Error(
				`taildrive transport: copy failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	protect(remotePath: string): void {
		try {
			chmodSync(this.localPath(remotePath), 0o600);
		} catch (error) {
			throw new Error(
				`taildrive transport: could not make the uploaded screenshot private: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	publish(tempPath: string, finalPath: string): void {
		const temporary = this.localPath(tempPath);
		const destination = this.localPath(finalPath);
		try {
			chmodSync(temporary, 0o600);
			renameSync(temporary, destination);
		} catch (error) {
			throw new Error(
				`taildrive transport: could not publish the final path: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	remove(paths: readonly string[]): void {
		if (paths.length === 0) return;
		for (const path of paths) {
			try {
				rmSync(this.localPath(path), { force: true });
			} catch {
				// Cleanup must not hide the original transport failure.
			}
		}
	}

	private localPath(remotePath: string): string {
		const name = basename(remotePath);
		if (!name || name === "." || name === "..")
			throw new Error("taildrive transport: invalid screenshot path");
		return join(this.taildriveDir, name);
	}
}

function expandLocalDir(
	directory: string,
	env: Record<string, string | undefined>,
): string {
	if (directory === "~") return env.HOME || homedir();
	if (directory.startsWith("~/"))
		return join(env.HOME || homedir(), directory.slice(2));
	return directory;
}

export function createShotTransport(
	kind: ShotTransportKind,
	host: string,
	taildriveDir?: string,
	env: Record<string, string | undefined> = process.env,
): ShotTransport {
	if (kind === "ssh") return new SshTransport(host);
	if (!taildriveDir?.trim())
		throw new Error("taildrive transport requires shot.taildrive_dir");
	return new TaildriveTransport(taildriveDir, env);
}

function commandExists(command: string): boolean {
	return Bun.which(command) !== null;
}

function privateLogDirectory(options: ShotOptions): string {
	const env = options.env ?? process.env;
	const root =
		options.logDir ||
		env.TP_SHOT_LOG_DIR ||
		join(
			env.XDG_CACHE_HOME || join(env.HOME || homedir(), ".cache"),
			"tp-shot",
		);
	mkdirSync(root, { recursive: true, mode: 0o700 });
	chmodSync(root, 0o700);
	return root;
}

function newLog(options: ShotOptions, id = randomUUID()): string {
	const path = join(privateLogDirectory(options), `${id}.log`);
	writeFileSync(path, "", { mode: 0o600 });
	chmodSync(path, 0o600);
	return path;
}

function logLine(path: string, line: string): void {
	const current = readFileSync(path, "utf8");
	writeFileSync(path, `${current}${line}\n`, { mode: 0o600 });
	chmodSync(path, 0o600);
}

export function recordShotFailure(logPath: string, message: string): void {
	logLine(logPath, `Failed: ${message}`);
}

function extensionFor(sourcePath: string): string {
	const extension = extname(sourcePath).slice(1).toLowerCase();
	if (!imageExtensions.has(extension))
		throw new Error(`unsupported image type '${extension}'`);
	return extension;
}

function sourceHost(): string {
	const value = hostname()
		.split(".")[0]
		.toLowerCase()
		.replaceAll(/[^a-z0-9._-]/g, "-");
	return value || "laptop";
}

function syncName(extension: string): string {
	const stamp = new Date()
		.toISOString()
		.replaceAll(/[-:]/g, "")
		.replace(".000", ".");
	return `tp-shot-${stamp}-${sourceHost()}-${Math.floor(Math.random() * 1_000_000)}.${extension}`;
}

export function notify(
	state: "ready" | "failed",
	message: string,
	notifier = "auto",
): boolean {
	if (notifier === "none") return true;
	const title = state === "ready" ? "tp-shot ready" : "tp-shot failed";
	if (notifier === "auto" || notifier === "terminal-notifier") {
		if (commandExists("terminal-notifier")) {
			const result = commandResult("terminal-notifier", [
				"-group",
				"tp-shot",
				"-title",
				title,
				"-message",
				message,
				"-sound",
				"default",
			]);
			if (result.exitCode === 0) return true;
			if (notifier === "terminal-notifier") return false;
		} else if (notifier === "terminal-notifier") return false;
	}
	if (notifier === "auto" || notifier === "osascript") {
		if (!commandExists("osascript")) return false;
		const result = commandResult("osascript", [
			"-e",
			"on run argv",
			"-e",
			"display notification (item 2 of argv) with title (item 1 of argv) sound name (item 3 of argv)",
			"-e",
			"end run",
			title,
			message,
			state === "ready" ? "Glass" : "Basso",
		]);
		return result.exitCode === 0;
	}
	return false;
}

function ensureSource(sourcePath: string): void {
	const info = statSync(sourcePath);
	if (!info.isFile()) throw new Error("cannot read input image");
}

export function captureImage(
	env: Record<string, string | undefined> = process.env,
): { path: string; cleanup: boolean; cleanupPath: string } {
	if (process.platform !== "darwin" && !env.TP_STUB_LOG)
		throw new Error("interactive capture is only available on macOS");
	const root = mkdtempSync(join(env.TMPDIR || tmpdir(), "tp-shot-"));
	const path = join(root, "capture.png");
	const result = commandResult("screencapture", ["-i", "-t", "png", path]);
	if (result.exitCode === 0 && !statExists(path) && env.TP_STUB_LOG)
		writeFileSync(path, "captured-image", { mode: 0o600 });
	if (result.exitCode !== 0 || !statExists(path) || statSync(path).size === 0) {
		rmSync(root, { recursive: true, force: true });
		throw new Error("screenshot cancelled");
	}
	chmodSync(path, 0o600);
	return { path, cleanup: true, cleanupPath: root };
}

function statExists(path: string): boolean {
	try {
		statSync(path);
		return true;
	} catch {
		return false;
	}
}

function snapshot(
	sourcePath: string,
	env: Record<string, string | undefined>,
): { path: string; root: string } {
	const root = mkdtempSync(join(env.TMPDIR || tmpdir(), "tp-shot-"));
	const path = join(root, `source.${extensionFor(sourcePath)}`);
	copyFileSync(sourcePath, path);
	chmodSync(path, 0o600);
	return { path, root };
}

export function syncUpload(
	sourcePath: string,
	options: ShotOptions,
): ShotResult {
	const transport = options.transport ?? new SshTransport(options.host);
	const transportKind =
		options.transportKind ??
		(transport instanceof TaildriveTransport ? "taildrive" : "ssh");
	const logPath = newLog(options);
	let remotePath = "";
	try {
		const remoteDir = transport.prepareDirectory(options.remoteDir);
		const extension = extensionFor(sourcePath);
		remotePath = `${remoteDir.replace(/\/$/, "")}/${syncName(extension)}`;
		transport.upload(sourcePath, remotePath);
		transport.protect(remotePath);
		logLine(logPath, `Ready: ${remotePath}`);
		return { path: remotePath, logPath };
	} catch (error) {
		if (remotePath) transport.remove([remotePath]);
		const detail = error instanceof Error ? error.message : String(error);
		const failure = `${detail} (${transportKind} transport)`;
		logLine(logPath, `Failed: ${failure}`);
		notify(
			"failed",
			`Screenshot upload failed (${transportKind} transport)`,
			options.notifier ?? "auto",
		);
		throw new Error(failure);
	}
}

export interface AsyncJob {
	host: string;
	transportKind?: ShotTransportKind;
	taildriveDir?: string;
	sourcePath: string;
	remoteDir: string;
	remotePath: string;
	logPath: string;
	removeSource: boolean;
	notifier: string;
	cleanupPath?: string;
}

export function runAsyncWorker(job: AsyncJob, options: ShotOptions): number {
	let transport: ShotTransport | undefined = options.transport;
	const transportKind =
		options.transportKind ??
		job.transportKind ??
		(transport instanceof TaildriveTransport ? "taildrive" : "ssh");
	try {
		transport ??= createShotTransport(
			transportKind,
			job.host,
			job.taildriveDir,
			options.env,
		);
		const preparedDir = transport.prepareDirectory(job.remoteDir);
		if (preparedDir !== job.remoteDir)
			throw new Error(
				`prepared directory '${preparedDir}' did not match '${job.remoteDir}'`,
			);
		const tempPath = `${job.remoteDir}/.${basename(job.remotePath)}.uploading`;
		transport.upload(job.sourcePath, tempPath);
		transport.publish(tempPath, job.remotePath);
		logLine(job.logPath, `Ready: ${job.remotePath}`);
		notify("ready", "Screenshot ready to paste", job.notifier);
		return 0;
	} catch (error) {
		const tempPath = `${job.remoteDir}/.${basename(job.remotePath)}.uploading`;
		try {
			transport?.remove([tempPath, job.remotePath]);
		} catch {
			// Cleanup must not hide the original transport failure.
		}
		const detail = error instanceof Error ? error.message : String(error);
		const failure = `${detail} (${transportKind} transport)`;
		logLine(job.logPath, `Failed: ${failure}`);
		notify(
			"failed",
			`Screenshot upload failed (${transportKind} transport); the copied path is not available`,
			job.notifier,
		);
		return 1;
	} finally {
		if (job.removeSource) {
			if (job.cleanupPath)
				rmSync(job.cleanupPath, { recursive: true, force: true });
			else rmSync(job.sourcePath, { force: true });
		}
	}
}

export function expandRemoteDir(
	remoteDir: string | undefined,
	env: Record<string, string | undefined>,
): string | undefined {
	return remoteDir === undefined ? undefined : remoteDirPath(remoteDir, env);
}

export function validateSource(sourcePath: string): string {
	const resolved = resolve(sourcePath);
	try {
		ensureSource(resolved);
	} catch {
		throw new Error(`cannot read '${sourcePath}'`);
	}
	extensionFor(resolved);
	return resolved;
}

export function copyToClipboard(value: string): void {
	const result = commandResult("pbcopy", [], value);
	if (result.exitCode !== 0)
		throw new Error("could not copy the path; copy it from above manually");
}

export function startDetachedWorker(
	job: AsyncJob,
	env: Record<string, string | undefined>,
): boolean {
	const startup = commandResult("nohup", ["true"]);
	if (startup.exitCode !== 0) return false;
	const marker = `${job.logPath}.started`;
	const ownership = `${job.logPath}.owned`;
	const workerJob = { ...job, marker, ownership };
	const child = Bun.spawn(
		[process.execPath, process.argv[1], "--worker", JSON.stringify(workerJob)],
		{
			env: { ...process.env, ...env } as Record<string, string>,
			stdin: "ignore",
			stdout: "ignore",
			stderr: "ignore",
			detached: true,
		},
	);
	child.unref();
	const deadline = Date.now() + 1_000;
	while (Date.now() < deadline && !statExists(marker))
		Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
	if (!statExists(marker)) {
		child.kill();
		return false;
	}
	writeFileSync(ownership, `${process.pid}\n`, { mode: 0o600 });
	rmSync(marker, { force: true });
	return true;
}

export function stageSourceForAsync(
	sourcePath: string,
	captured: boolean,
	env: Record<string, string | undefined>,
	cleanupPath?: string,
): { path: string; cleanup: boolean; cleanupPath?: string } {
	if (!captured) {
		const staged = snapshot(sourcePath, env);
		return { path: staged.path, cleanup: true, cleanupPath: staged.root };
	}
	return { path: sourcePath, cleanup: true, cleanupPath };
}
