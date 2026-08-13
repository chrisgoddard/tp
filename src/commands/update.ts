import { readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { type CommandContext, registerCommandHandler } from "../lib/cli";

interface PackageInfo {
	name: string;
	version: string;
}

interface ProcessResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

const decoder = new TextDecoder();
const NOT_GIT_INSTALL = "not a git install; update via your package manager";

function readPackage(root: string): PackageInfo | undefined {
	try {
		const value: unknown = JSON.parse(
			readFileSync(join(root, "package.json"), "utf8"),
		);
		if (typeof value !== "object" || value === null) return undefined;
		const record = value as Record<string, unknown>;
		if (typeof record.name !== "string" || typeof record.version !== "string")
			return undefined;
		return { name: record.name, version: record.version };
	} catch {
		return undefined;
	}
}

function isGitInstallRoot(path: string): PackageInfo | undefined {
	try {
		statSync(join(path, ".git"));
	} catch {
		return undefined;
	}
	const packageInfo = readPackage(path);
	return packageInfo?.name === "@chrisgoddard/tp" ? packageInfo : undefined;
}

function findInstallRoot():
	| { path: string; packageInfo: PackageInfo }
	| undefined {
	let current: string;
	try {
		current = process.env.TP_UPDATE_ROOT
			? resolve(process.env.TP_UPDATE_ROOT)
			: dirname(realpathSync(import.meta.path));
	} catch {
		return undefined;
	}

	while (true) {
		const packageInfo = isGitInstallRoot(current);
		if (packageInfo) return { path: current, packageInfo };
		const parent = dirname(current);
		if (parent === current) return undefined;
		current = parent;
	}
}

function run(
	command: string,
	args: readonly string[],
	cwd: string,
): ProcessResult {
	try {
		const result = Bun.spawnSync({
			cmd: [command, ...args],
			cwd,
			stdout: "pipe",
			stderr: "pipe",
		});
		return {
			exitCode: result.exitCode,
			stdout: decoder.decode(result.stdout),
			stderr: decoder.decode(result.stderr),
		};
	} catch (error) {
		return {
			exitCode: 1,
			stdout: "",
			stderr: error instanceof Error ? error.message : String(error),
		};
	}
}

function reportFailure(context: CommandContext, result: ProcessResult): void {
	const message = (result.stderr || result.stdout).trimEnd();
	if (message) context.stderr(message);
}

function git(root: string, args: readonly string[]): ProcessResult {
	return run("git", args, root);
}

function upstream(root: string): string | undefined {
	const result = git(root, [
		"rev-parse",
		"--abbrev-ref",
		"--symbolic-full-name",
		"@{upstream}",
	]);
	if (result.exitCode !== 0) return undefined;
	const value = result.stdout.trim();
	return value || undefined;
}

function head(root: string): string | undefined {
	const result = git(root, ["rev-parse", "HEAD"]);
	if (result.exitCode !== 0) return undefined;
	const value = result.stdout.trim();
	return value || undefined;
}

function checkStatus(
	root: string,
	trackingBranch: string,
): { ahead: number; behind: number } | undefined {
	const result = git(root, [
		"rev-list",
		"--left-right",
		"--count",
		`HEAD...${trackingBranch}`,
	]);
	if (result.exitCode !== 0) return undefined;
	const values = result.stdout.trim().split(/\s+/).map(Number);
	if (
		values.length !== 2 ||
		!values.every((value) => Number.isSafeInteger(value) && value >= 0)
	)
		return undefined;
	return { ahead: values[0], behind: values[1] };
}

function renderCheckStatus(
	context: CommandContext,
	status: { ahead: number; behind: number },
): void {
	if (status.ahead === 0 && status.behind === 0) {
		context.stdout("up to date with upstream\n");
		return;
	}
	const parts: string[] = [];
	if (status.ahead > 0) parts.push(`ahead ${status.ahead}`);
	if (status.behind > 0) parts.push(`behind ${status.behind}`);
	context.stdout(`${parts.join(", ")}\n`);
}

function updateCommand(context: CommandContext): number {
	const install = findInstallRoot();
	if (!install) {
		context.stderr(NOT_GIT_INSTALL);
		return 1;
	}

	const { path: root, packageInfo } = install;
	const clean = git(root, ["status", "--porcelain", "--untracked-files=all"]);
	if (clean.exitCode !== 0) {
		reportFailure(context, clean);
		return 1;
	}
	if (clean.stdout.trim()) {
		context.stderr("tp update: working tree is not clean");
		return 1;
	}

	const trackingBranch = upstream(root);
	if (!trackingBranch) {
		context.stderr("tp update: current branch has no upstream");
		return 1;
	}

	if (context.args.options.check === true) {
		const status = checkStatus(root, trackingBranch);
		if (!status) {
			context.stderr("tp update: could not determine status against upstream");
			return 1;
		}
		renderCheckStatus(context, status);
		return 0;
	}

	const oldHead = head(root);
	if (!oldHead) {
		context.stderr("tp update: could not determine current revision");
		return 1;
	}

	const pull = git(root, ["pull", "--ff-only"]);
	if (pull.exitCode !== 0) {
		reportFailure(context, pull);
		return 1;
	}

	const frozenInstall = run("bun", ["install", "--frozen-lockfile"], root);
	if (frozenInstall.exitCode !== 0) {
		const regularInstall = run("bun", ["install"], root);
		if (regularInstall.exitCode !== 0) {
			reportFailure(context, regularInstall);
			return 1;
		}
	}

	const newHead = head(root);
	if (!newHead) {
		context.stderr("tp update: could not determine updated revision");
		return 1;
	}
	if (newHead === oldHead) {
		context.stdout("already up to date\n");
		return 0;
	}

	const updatedPackage = readPackage(root);
	if (!updatedPackage) {
		context.stderr("tp update: package.json has no valid version");
		return 1;
	}
	context.stdout(`${packageInfo.version} → ${updatedPackage.version}\n`);
	return 0;
}

export function registerUpdateCommands(): void {
	registerCommandHandler("update", updateCommand);
}
