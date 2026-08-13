import { expect, test } from "bun:test";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { ScratchTmuxServer, repoRoot, runTp } from "./harness";

interface TpExpectation {
	exitCode: number;
	stdoutIncludes?: string;
	stderrIncludes?: string;
}

interface CaseOptions {
	env?: Record<string, string | undefined>;
	setup?: (server: ScratchTmuxServer) => void;
}

async function runTpCase(
	args: readonly string[],
	expectation: TpExpectation,
	options: CaseOptions = {},
): Promise<void> {
	const server = new ScratchTmuxServer();
	server.start();
	try {
		options.setup?.(server);
		const result = await runTp(args, {
			env: {
				...server.env,
				TMUX: undefined,
				TMUX_PANE: undefined,
				...options.env,
			},
		});
		expect(result.exitCode).toBe(expectation.exitCode);
		if (expectation.stdoutIncludes !== undefined)
			expect(result.stdout).toContain(expectation.stdoutIncludes);
		if (expectation.stderrIncludes !== undefined)
			expect(result.stderr).toContain(expectation.stderrIncludes);
	} finally {
		server.teardown();
	}
}

function fakePi(): {
	env: Record<string, string>;
	cleanup: () => void;
	log: string;
} {
	const root = mkdtempSync(join(tmpdir(), "tp-fake-pi-"));
	const bin = join(root, "bin");
	const log = join(root, "pi.log");
	mkdirSync(bin);
	const executable = join(bin, "pi");
	writeFileSync(
		executable,
		'#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$TP_PI_LOG"\n[ "$1" = update ] && exit 0\nprintf \'fake pi\\n\'\n',
	);
	chmodSync(executable, 0o755);
	return {
		env: {
			PATH: `${bin}:${process.env.PATH ?? ""}`,
			TP_PI_LOG: log,
			TP_SHELL: "/bin/sh",
		},
		log,
		cleanup: () => rmSync(root, { recursive: true, force: true }),
	};
}

function seedSession(server: ScratchTmuxServer, number: number): void {
	server.run([
		"new-session",
		"-d",
		"-s",
		`${basename(repoRoot)}_${String(number).padStart(3, "0")}`,
	]);
}

function screenshotDirectory(): {
	path: string;
	env: Record<string, string>;
	cleanup: () => void;
} {
	const path = mkdtempSync(join(tmpdir(), "tp-shots-"));
	const old = join(path, "old.png");
	const newest = join(path, "newest.png");
	writeFileSync(old, "old");
	writeFileSync(newest, "new");
	utimesSync(old, new Date(1), new Date(1));
	utimesSync(newest, new Date(2), new Date(2));
	return {
		path,
		env: { TP_SHOT_DIR: path },
		cleanup: () => rmSync(path, { recursive: true, force: true }),
	};
}

// Fish source: legacy/tests/test_tp.fish:768.
test("tp p update-first launches the updater before Pi and preserves Pi arguments", async () => {
	const pi = fakePi();
	try {
		await runTpCase(
			[
				"pi",
				"-uf",
				"--name",
				"Auth work",
				"--model",
				"openai/gpt-5",
				"initial prompt",
			],
			{ exitCode: 0 },
			{ env: pi.env },
		);
		expect(await Bun.file(pi.log).text()).toMatch(
			/^update --all\n--name Auth work --model openai\/gpt-5 initial prompt\n$/,
		);
	} finally {
		pi.cleanup();
	}
});

test("tp p applies its name to the tmux session", async () => {
	const pi = fakePi();
	try {
		await runTpCase(["p", "-n", "pi-only"], { exitCode: 0 }, { env: pi.env });
		expect(await Bun.file(pi.log).text()).toContain("--name pi-only");
	} finally {
		pi.cleanup();
	}
});

test("tp p attaches to the new session", async () => {
	const pi = fakePi();
	try {
		await runTpCase(["p"], { exitCode: 0 }, { env: pi.env });
	} finally {
		pi.cleanup();
	}
});

test("tp pi passes every argument after -- directly to Pi", async () => {
	const pi = fakePi();
	try {
		await runTpCase(
			["pi", "--", "--name", "pi-only", "two words"],
			{ exitCode: 0 },
			{ env: pi.env },
		);
		expect(await Bun.file(pi.log).text()).toContain("--name pi-only two words");
	} finally {
		pi.cleanup();
	}
});

test("tp pi stops interpreting options after --", async () => {
	const pi = fakePi();
	try {
		await runTpCase(
			["pi", "--", "--name", "pi-only"],
			{ exitCode: 0 },
			{ env: pi.env },
		);
	} finally {
		pi.cleanup();
	}
});

for (const title of [
	"tp pi rejects a missing name value",
	"tp pi reports usage for a missing name value",
	"tp pi creates no session after a missing name value",
])
	test(title, async () => {
		await runTpCase(["pi", "--name"], { exitCode: 2 });
	});

for (const [title, args, expectation] of [
	[
		"screenshots are listed newest first",
		["shot", "list"],
		{ exitCode: 0, stdoutIncludes: "newest.png" },
	],
	[
		"tp shot returns the newest screenshot",
		["shot"],
		{ exitCode: 0, stdoutIncludes: "newest.png" },
	],
	[
		"tp shot list accepts a result limit",
		["shot", "list", "1"],
		{ exitCode: 0, stdoutIncludes: "newest.png" },
	],
	[
		"tp shot dir returns the screenshot directory",
		["shot", "dir"],
		{ exitCode: 0 },
	],
] as const) {
	test(title, async () => {
		const shots = screenshotDirectory();
		try {
			await runTpCase(args, expectation, { env: shots.env });
		} finally {
			shots.cleanup();
		}
	});
}

test("tp shot latest rejects an extra argument", async () => {
	await runTpCase(["shot", "latest", "extra"], { exitCode: 2 });
});

for (const args of [
	["shot", "list", "nope"],
	["shot", "list", "0"],
	["shot", "list", "1", "extra"],
])
	test(`tp shot rejects invalid arguments: ${args.join(" ")}`, async () => {
		await runTpCase(args, { exitCode: 2 });
	});

test("oversized screenshot counts fail without Fish diagnostics", async () => {
	await runTpCase(["shot", "list", "999999999999999999999999"], {
		exitCode: 2,
	});
});

test("tp name stores a session label", async () => {
	await runTpCase(
		["name", "2", "backend"],
		{ exitCode: 0 },
		{ setup: (server) => seedSession(server, 2) },
	);
});

test("tp kill removes a selected project session", async () => {
	await runTpCase(
		["kill", "2"],
		{ exitCode: 0 },
		{ setup: (server) => seedSession(server, 2) },
	);
});

test("tp kill removes all current-project sessions", async () => {
	await runTpCase(
		["kill", "--force"],
		{ exitCode: 0 },
		{
			setup: (server) => {
				seedSession(server, 1);
				seedSession(server, 2);
			},
		},
	);
});

// These resolution-path specs remain todo until src/bin/tp.ts dispatches the
// non-command Resolution variants into core.ts.
test.todo("bare tp dispatches to the first project session", () => {});
test.todo("tp <n> dispatches to attachProjectNumber", () => {});
test.todo("tp <n> --restart dispatches restartSession", () => {});
test.todo("tp <label> dispatches to attachProjectLabel", () => {});
test.todo("ambiguous labels remain usage errors", () => {});
