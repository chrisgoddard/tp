#!/usr/bin/env bun

import { chmodSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { type TpConfig, loadConfig } from "../lib/config";
import {
	type AsyncJob,
	type ShotTransportKind,
	captureImage,
	copyToClipboard,
	createShotTransport,
	notify,
	recordShotFailure,
	runAsyncWorker,
	stageSourceForAsync,
	startDetachedWorker,
	syncUpload,
	validateSource,
} from "../lib/shot";

export interface ParsedArgs {
	async: boolean;
	notifyTest: boolean;
	version: boolean;
	host?: string;
	transport?: string;
	input?: string;
	help: boolean;
}

export const USAGE = [
	"Usage: tp-shot [--async] [--host HOST] [--transport ssh|taildrive] [IMAGE]",
	"       tp-shot --notify-test",
	"       tp-shot -V | --version",
].join("\n");

function usage(): string {
	return [
		USAGE,
		"",
		"Capture or upload an image for a remote Pi session.",
	].join("\n");
}

export function parseArgs(args: readonly string[]): ParsedArgs {
	const parsed: ParsedArgs = {
		async: false,
		notifyTest: false,
		version: false,
		help: false,
	};
	const positional: string[] = [];
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "--") {
			positional.push(...args.slice(index + 1));
			break;
		}
		if (arg === "--async") parsed.async = true;
		else if (arg === "--notify-test") parsed.notifyTest = true;
		else if (arg === "--help" || arg === "-h") parsed.help = true;
		else if (arg === "--version" || arg === "-V") {
			if (args.length !== 1) throw new Error(USAGE);
			parsed.version = true;
		} else if (arg === "--host") parsed.host = args[++index] ?? "";
		else if (arg.startsWith("--host="))
			parsed.host = arg.slice("--host=".length);
		else if (arg === "--transport") parsed.transport = args[++index] ?? "";
		else if (arg.startsWith("--transport="))
			parsed.transport = arg.slice("--transport=".length);
		else if (arg.startsWith("-")) throw new Error(USAGE);
		else positional.push(arg);
	}
	if (positional.length > 1) throw new Error(USAGE);
	parsed.input = positional[0];
	return parsed;
}

function mergedEnv(): Record<string, string | undefined> {
	return { ...process.env };
}

function runWorker(raw: string): number {
	const job = JSON.parse(raw) as AsyncJob & {
		marker: string;
		ownership: string;
	};
	writeFileSync(job.marker, `${process.pid}\n`, { mode: 0o600 });
	const deadline = Date.now() + 60_000;
	while (!fileExists(job.ownership)) {
		if (Date.now() > deadline) {
			rmSync(job.marker, { force: true });
			rmSync(job.ownership, { force: true });
			if (job.cleanupPath)
				rmSync(job.cleanupPath, { recursive: true, force: true });
			recordShotFailure(
				job.logPath,
				"parent did not transfer cleanup ownership",
			);
			notify(
				"failed",
				"Screenshot upload failed before the uploader took ownership",
				job.notifier,
			);
			return 1;
		}
		Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
	}
	const result = runAsyncWorker(job, {
		host: job.host,
		notifier: job.notifier,
		env: { ...process.env },
	});
	rmSync(job.marker, { force: true });
	rmSync(job.ownership, { force: true });
	return result;
}

function fileExists(path: string): boolean {
	try {
		return statSync(path).size > 0;
	} catch {
		return false;
	}
}

async function main(): Promise<number> {
	const args = process.argv.slice(2);
	if (args[0] === "--worker") return runWorker(args[1] ?? "{}");
	if (args.length === 1 && (args[0] === "-V" || args[0] === "--version")) {
		console.log("tp-shot 0.2.0");
		return 0;
	}
	// Keep the no-argument probe useful on non-macOS development hosts.
	// Real capture still takes the macOS-only path below.
	if (
		args.length === 0 &&
		process.platform !== "darwin" &&
		!process.env.TP_STUB_LOG
	) {
		console.log("tp-shot 0.2.0");
		return 0;
	}
	let parsed: ParsedArgs;
	try {
		parsed = parseArgs(args);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		return 2;
	}
	if (parsed.help) {
		console.log(usage());
		return 0;
	}
	if (parsed.version) {
		console.log("tp-shot 0.2.0");
		return 0;
	}
	const env = mergedEnv();
	let config: TpConfig;
	try {
		config = loadConfig({
			flags: { shotHost: parsed.host, shotTransport: parsed.transport },
			env,
		});
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		return 1;
	}
	const host = config.shot.host ?? "good-studio";
	if (!host) {
		console.error("tp-shot: SSH host cannot be empty");
		return 2;
	}
	if (
		config.shot.transport !== "ssh" &&
		config.shot.transport !== "taildrive"
	) {
		console.error(
			`tp-shot: invalid transport '${config.shot.transport}' (expected ssh or taildrive)`,
		);
		return 2;
	}
	const transportKind = config.shot.transport as ShotTransportKind;
	if (transportKind === "taildrive" && !config.shot.taildrive_dir?.trim()) {
		console.error("tp-shot: taildrive transport requires shot.taildrive_dir");
		return 2;
	}
	const transport = createShotTransport(
		transportKind,
		host,
		config.shot.taildrive_dir,
		env,
	);
	const notifier = config.shot.notifier || "auto";
	if (parsed.notifyTest) {
		if (
			parsed.async ||
			parsed.host !== undefined ||
			parsed.transport !== undefined ||
			parsed.input !== undefined
		) {
			console.error("Usage: tp-shot --notify-test");
			return 2;
		}
		if (notifier === "none") {
			console.error(
				"tp-shot: notifications are disabled by TP_SHOT_NOTIFIER=none",
			);
			return 1;
		}
		if (!notify("ready", "tp-shot test notification", notifier)) {
			console.error("tp-shot: no working macOS notification command was found");
			return 1;
		}
		console.log("Sent a tp-shot test notification.");
		return 0;
	}
	if (
		parsed.async &&
		parsed.input === undefined &&
		process.platform !== "darwin" &&
		!env.TP_STUB_LOG
	) {
		console.error("tp-shot: interactive capture is only available on macOS");
		return 1;
	}
	let sourcePath = parsed.input;
	let cleanupSource = false;
	let cleanupPath: string | undefined;
	try {
		if (sourcePath === undefined) {
			const captured = captureImage(env);
			sourcePath = captured.path;
			cleanupSource = captured.cleanup;
			cleanupPath = captured.cleanupPath;
		} else {
			sourcePath = validateSource(sourcePath);
		}
		if (parsed.async) {
			const staged = stageSourceForAsync(
				sourcePath,
				cleanupSource,
				env,
				cleanupPath,
			);
			sourcePath = staged.path;
			cleanupSource = staged.cleanup;
			cleanupPath = staged.cleanupPath;
			const remoteDir = transport.prepareDirectory(config.shot.remote_dir);
			if (!remoteDir.startsWith("/")) {
				console.error("tp-shot: TP_SHOT_REMOTE_DIR must be an absolute path");
				if (cleanupSource)
					rmSync(cleanupPath ?? sourcePath, { recursive: true, force: true });
				return 2;
			}
			const id = await uuid();
			const extension = sourcePath.split(".").pop()?.toLowerCase() ?? "png";
			const remotePath = `${remoteDir.replace(/\/$/, "")}/tp-shot-${id}.${extension}`;
			const logPath = createLogPath(env, id);
			try {
				copyToClipboard(remotePath);
			} catch (error) {
				if (cleanupSource)
					rmSync(cleanupPath ?? sourcePath, { recursive: true, force: true });
				console.error(
					`tp-shot: ${error instanceof Error ? error.message : String(error)}`,
				);
				return 1;
			}
			const job: AsyncJob = {
				host,
				transportKind,
				taildriveDir: config.shot.taildrive_dir,
				sourcePath,
				remoteDir,
				remotePath,
				logPath,
				removeSource: cleanupSource,
				notifier,
				cleanupPath,
			};
			if (!startDetachedWorker(job, env)) {
				if (cleanupSource)
					rmSync(cleanupPath ?? sourcePath, { recursive: true, force: true });
				recordShotFailure(logPath, "uploader could not start");
				notify(
					"failed",
					"Screenshot upload failed: uploader could not start",
					notifier,
				);
				console.error(
					`tp-shot: background uploader did not start; inspect '${logPath}'`,
				);
				return 1;
			}
			console.log(`Queued: ${remotePath}`);
			console.log(
				notifier === "none"
					? "Copied the reserved path immediately. Notifications are disabled; inspect the log for the outcome."
					: "Copied the reserved path immediately. A notification will report upload success or failure.",
			);
			console.log(`Log: ${logPath}`);
			return 0;
		}
		const result = syncUpload(sourcePath, {
			host,
			remoteDir: config.shot.remote_dir,
			notifier,
			env,
			transport,
			transportKind,
		});
		copyToClipboard(result.path);
		notify("ready", "Screenshot ready to paste", notifier);
		console.log(`Uploaded: ${result.path}`);
		console.error("Copied the remote path to the clipboard.");
		if (cleanupSource && sourcePath)
			rmSync(cleanupPath ?? sourcePath, { recursive: true, force: true });
		return 0;
	} catch (error) {
		if (cleanupSource && sourcePath)
			rmSync(cleanupPath ?? sourcePath, { recursive: true, force: true });
		console.error(
			`tp-shot: ${error instanceof Error ? error.message : String(error)}`,
		);
		return error instanceof Error && error.message.startsWith("Usage:") ? 2 : 1;
	}
}

async function uuid(): Promise<string> {
	const result = Bun.spawnSync(["uuidgen"], {
		env: { ...process.env, TP_STUB_COMMAND: "uuidgen" },
		stdout: "pipe",
		stderr: "pipe",
	});
	const value = new TextDecoder().decode(result.stdout).trim().toLowerCase();
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
		value,
	)
		? value
		: crypto.randomUUID();
}

function createLogPath(
	env: Record<string, string | undefined>,
	id: string,
): string {
	const root =
		env.TP_SHOT_LOG_DIR ||
		`${env.XDG_CACHE_HOME || `${env.HOME || "/tmp"}/.cache`}/tp-shot`;
	mkdirSync(root, { recursive: true, mode: 0o700 });
	chmodSync(root, 0o700);
	const path = `${root}/${id}.log`;
	writeFileSync(path, "", { mode: 0o600 });
	chmodSync(path, 0o600);
	return path;
}

if (import.meta.main) {
	const exitCode = await main();
	process.exitCode = exitCode;
}
