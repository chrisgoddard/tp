import { expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

interface CommandResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

interface Fixture {
	root: string;
	seed: string;
	remote: string;
	clone: string;
	commitRemote(version: string): void;
	commitLocal(): void;
	cleanup(): void;
}

const decoder = new TextDecoder();
const tpEntry = resolve(import.meta.dir, "../../src/bin/tp.ts");

function command(
	cmd: string,
	args: readonly string[],
	cwd: string,
	allowFailure = false,
): CommandResult {
	const result = Bun.spawnSync({
		cmd: [cmd, ...args],
		cwd,
		stdout: "pipe",
		stderr: "pipe",
	});
	const output = {
		exitCode: result.exitCode,
		stdout: decoder.decode(result.stdout),
		stderr: decoder.decode(result.stderr),
	};
	if (!allowFailure && output.exitCode !== 0)
		throw new Error(`${cmd} ${args.join(" ")} failed: ${output.stderr}`);
	return output;
}

function git(
	args: readonly string[],
	cwd: string,
	allowFailure = false,
): CommandResult {
	return command("git", args, cwd, allowFailure);
}

function makeFixture(): Fixture {
	const root = mkdtempSync(join(tmpdir(), "tp-update-e2e-"));
	const seed = join(root, "seed");
	const remote = join(root, "remote.git");
	const clone = join(root, "clone");
	mkdirSync(seed);
	command("git", ["init", "--bare", remote], root);
	command("git", ["init", seed], root);
	git(["config", "user.email", "tp-tests@example.test"], seed);
	git(["config", "user.name", "tp tests"], seed);
	writePackage(seed, "0.2.0");
	command("bun", ["install"], seed);
	git(["add", "package.json"], seed);
	git(["commit", "-m", "initial"], seed);
	git(["branch", "-M", "main"], seed);
	git(["remote", "add", "origin", remote], seed);
	git(["push", "-u", "origin", "main"], seed);
	command("git", ["clone", "--branch", "main", remote, clone], root);
	git(["config", "user.email", "tp-tests@example.test"], clone);
	git(["config", "user.name", "tp tests"], clone);

	return {
		root,
		seed,
		remote,
		clone,
		commitRemote(version: string): void {
			writePackage(seed, version);
			git(["add", "package.json"], seed);
			git(["commit", "-m", `release ${version}`], seed);
			git(["push", "origin", "main"], seed);
		},
		commitLocal(): void {
			writeFileSync(join(clone, "local.txt"), "local change\n");
			git(["add", "local.txt"], clone);
			git(["commit", "-m", "local change"], clone);
		},
		cleanup(): void {
			rmSync(root, { recursive: true, force: true });
		},
	};
}

function writePackage(root: string, version: string): void {
	const packagePath = join(root, "package.json");
	const packageJson = (
		Bun.file(packagePath).size > 0
			? JSON.parse(readFileSync(packagePath, "utf8"))
			: {}
	) as Record<string, unknown>;
	packageJson.name = "@chrisgoddard/tp";
	packageJson.version = version;
	packageJson.private = true;
	writeFileSync(packagePath, `${JSON.stringify(packageJson, null, "\t")}\n`);
}

async function runUpdate(
	root: string,
	args: readonly string[] = [],
): Promise<CommandResult> {
	const child = Bun.spawn([process.execPath, tpEntry, "update", ...args], {
		cwd: root,
		env: { ...process.env, TP_UPDATE_ROOT: root },
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	return { stdout, stderr, exitCode };
}

function head(root: string): string {
	return git(["rev-parse", "HEAD"], root).stdout.trim();
}

test("update reports an up-to-date checkout", async () => {
	const fixture = makeFixture();
	try {
		const result = await runUpdate(fixture.clone);
		expect(result.exitCode).toBe(0);
		expect(result.stdout.trim()).toBe("already up to date");
	} finally {
		fixture.cleanup();
	}
});

test("update fast-forwards and prints the version transition", async () => {
	const fixture = makeFixture();
	try {
		fixture.commitRemote("0.2.1");
		const result = await runUpdate(fixture.clone);
		expect(result.exitCode).toBe(0);
		expect(result.stdout.trim()).toBe("0.2.0 → 0.2.1");
		expect(
			JSON.parse(readFileSync(join(fixture.clone, "package.json"), "utf8"))
				.version,
		).toBe("0.2.1");
	} finally {
		fixture.cleanup();
	}
});

test("update refuses a dirty working tree", async () => {
	const fixture = makeFixture();
	try {
		writeFileSync(join(fixture.clone, "uncommitted.txt"), "do not stash\n");
		const before = head(fixture.clone);
		const result = await runUpdate(fixture.clone);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("working tree is not clean");
		expect(head(fixture.clone)).toBe(before);
	} finally {
		fixture.cleanup();
	}
});

test("update refuses a diverged branch with git's fast-forward error", async () => {
	const fixture = makeFixture();
	try {
		fixture.commitLocal();
		fixture.commitRemote("0.2.1");
		const before = head(fixture.clone);
		const result = await runUpdate(fixture.clone);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toMatch(/fast-forward|diverg/iu);
		expect(head(fixture.clone)).toBe(before);
	} finally {
		fixture.cleanup();
	}
});

test("update reports a non-git install", async () => {
	const root = mkdtempSync(join(tmpdir(), "tp-update-not-git-"));
	try {
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify({ name: "@chrisgoddard/tp", version: "0.2.0" }),
		);
		const result = await runUpdate(root);
		expect(result.exitCode).toBe(1);
		expect(result.stderr.trim()).toBe(
			"not a git install; update via your package manager",
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("update --check reports divergence without changing HEAD", async () => {
	const fixture = makeFixture();
	try {
		fixture.commitRemote("0.2.1");
		git(["fetch", "origin", "main"], fixture.clone);
		const before = head(fixture.clone);
		const result = await runUpdate(fixture.clone, ["--check"]);
		expect(result.exitCode).toBe(0);
		expect(result.stdout.trim()).toBe("behind 1");
		expect(head(fixture.clone)).toBe(before);
	} finally {
		fixture.cleanup();
	}
});
