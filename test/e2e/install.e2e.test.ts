import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

interface CommandResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

interface InstallFixture {
	root: string;
	clone: string;
	outside: string;
	bunBin: string;
	env: Record<string, string | undefined>;
}

const decoder = new TextDecoder();
const repoRoot = resolve(import.meta.dir, "../..");

function command(
	cmd: string,
	args: readonly string[],
	cwd: string,
	env: Record<string, string | undefined>,
): CommandResult {
	const result = Bun.spawnSync({
		cmd: [cmd, ...args],
		cwd,
		env,
		stdout: "pipe",
		stderr: "pipe",
	});
	return {
		exitCode: result.exitCode,
		stdout: decoder.decode(result.stdout),
		stderr: decoder.decode(result.stderr),
	};
}

function requireSuccess(result: CommandResult, label: string): CommandResult {
	if (result.exitCode !== 0)
		throw new Error(`${label} failed: ${result.stderr || result.stdout}`);
	return result;
}

function makeFixture(): InstallFixture {
	const root = mkdtempSync(join(tmpdir(), "tp-install-e2e-"));
	const home = join(root, "home");
	const clone = join(root, "clone");
	const outside = join(root, "outside");
	const bunInstall = join(home, ".bun");
	const bunBin = join(bunInstall, "bin");
	const env = {
		...process.env,
		HOME: home,
		BUN_INSTALL: bunInstall,
		XDG_CACHE_HOME: join(home, ".cache"),
		XDG_CONFIG_HOME: join(home, ".config"),
		XDG_STATE_HOME: join(home, ".local", "state"),
		PATH: `${bunBin}:${process.env.PATH ?? ""}`,
	};

	requireSuccess(
		command(
			"git",
			["clone", "--quiet", "--no-local", repoRoot, clone],
			root,
			env,
		),
		"git clone",
	);
	mkdirSync(outside);
	return { root, clone, outside, bunBin, env };
}

function installDependencies(fixture: InstallFixture): void {
	requireSuccess(
		command(
			"bun",
			["install", "--offline", "--frozen-lockfile"],
			fixture.clone,
			fixture.env,
		),
		"bun install",
	);
}

function assertInstalled(fixture: InstallFixture): void {
	expect(realpathSync(join(fixture.bunBin, "tp"))).toBe(
		join(fixture.clone, "src/bin/tp.ts"),
	);
	expect(realpathSync(join(fixture.bunBin, "tp-shot"))).toBe(
		join(fixture.clone, "src/bin/tp-shot.ts"),
	);
	expect(
		requireSuccess(
			command("sh", ["-c", "command -v tp"], fixture.outside, fixture.env),
			"command -v tp",
		).stdout.trim(),
	).toBe(join(fixture.bunBin, "tp"));
	expect(
		requireSuccess(
			command("sh", ["-c", "command -v tp-shot"], fixture.outside, fixture.env),
			"command -v tp-shot",
		).stdout.trim(),
	).toBe(join(fixture.bunBin, "tp-shot"));
	expect(
		requireSuccess(
			command("tp", ["version"], fixture.outside, fixture.env),
			"tp version",
		).stdout,
	).toBe("tp 0.2.0\n");
	expect(
		requireSuccess(
			command("tp-shot", ["--version"], fixture.outside, fixture.env),
			"tp-shot --version",
		).stdout,
	).toBe("tp-shot 0.2.0\n");
}

function cleanup(fixture: InstallFixture): void {
	rmSync(fixture.root, { recursive: true, force: true });
}

test("documented Bun install exposes both binaries outside the clone", () => {
	const fixture = makeFixture();
	try {
		installDependencies(fixture);
		requireSuccess(
			command(
				"bun",
				["add", "-g", `file:${fixture.clone}`],
				fixture.clone,
				fixture.env,
			),
			"bun add -g file:$PWD",
		);
		assertInstalled(fixture);
	} finally {
		cleanup(fixture);
	}
});

test("manual symlink fallback exposes both binaries outside the clone", () => {
	const fixture = makeFixture();
	try {
		installDependencies(fixture);
		requireSuccess(
			command(
				"sh",
				[
					"-c",
					'export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"; BUN_BIN="$(bun pm bin -g 2>/dev/null || printf \'%s/bin\' "$BUN_INSTALL")"; mkdir -p "$BUN_BIN"; chmod +x src/bin/tp.ts src/bin/tp-shot.ts; ln -sf "$PWD/src/bin/tp.ts" "$BUN_BIN/tp"; ln -sf "$PWD/src/bin/tp-shot.ts" "$BUN_BIN/tp-shot"',
				],
				fixture.clone,
				fixture.env,
			),
			"manual symlink install",
		);
		assertInstalled(fixture);
	} finally {
		cleanup(fixture);
	}
});
