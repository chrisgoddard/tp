import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
	findPiSessionFile,
	rebuildRestartCommand,
	restartSession,
} from "../../src/commands/pi-session";
import { isProcessAlive } from "../../src/lib/pi";
import { ScratchTmuxServer, runTp, waitFor } from "./harness";

const SESSION_ID = "019ff650-ac6d-7641-bb90-4475b973cc82";

function withAgentDirectory<T>(callback: (directory: string) => T): T {
	const previous = process.env.PI_CODING_AGENT_DIR;
	const directory = mkdtempSync(join(tmpdir(), "tp-pi-sessions-"));
	process.env.PI_CODING_AGENT_DIR = directory;
	try {
		return callback(directory);
	} finally {
		if (previous === undefined) process.env.PI_CODING_AGENT_DIR = undefined;
		else process.env.PI_CODING_AGENT_DIR = previous;
		rmSync(directory, { recursive: true, force: true });
	}
}

// Fish source: legacy/tests/test_tp.fish:652 — tp sid prints the full, not
// truncated, Pi session id.
test("tp sid prints the full untruncated Pi session id", async () => {
	const server = new ScratchTmuxServer();
	server.start();
	const project = basename(server.root);
	const fake = server.createFakePi({
		sessionName: `${project}_002`,
		sessionId: SESSION_ID,
	});
	try {
		waitFor(() => fake.options()["@pi_session_id"] === SESSION_ID);
		const result = await runTp(["sid", "2"], {
			cwd: server.root,
			env: server.env,
		});
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toBe(`${SESSION_ID}\n`);
	} finally {
		server.teardown();
	}
});

// Fish source: legacy/tests/test_tp.fish:659 — tp sid fails without a live Pi.
test("tp sid fails on a session running no Pi", async () => {
	const server = new ScratchTmuxServer();
	server.start();
	const project = basename(server.root);
	server.run(["new-session", "-d", "-s", `${project}_002`, "sleep", "30"]);
	try {
		const result = await runTp(["sid", "2"], {
			cwd: server.root,
			env: server.env,
		});
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("No live Pi session");
	} finally {
		server.teardown();
	}
});

// Fish source: legacy/tests/test_tp.fish:660 — tp sid fails for an unknown session.
test("tp sid fails on a session that does not exist", async () => {
	const server = new ScratchTmuxServer();
	server.start();
	try {
		const result = await runTp(["sid", "99"], {
			cwd: server.root,
			env: server.env,
		});
		expect(result.exitCode).toBe(1);
	} finally {
		server.teardown();
	}
});

// Fish source: legacy/tests/test_tp.fish:664 — invalid sid arguments are usage errors.
test("tp sid rejects invalid arguments with usage status", async () => {
	const server = new ScratchTmuxServer();
	server.start();
	try {
		const noArgument = await runTp(["sid"], {
			cwd: server.root,
			env: server.env,
		});
		const extraArgument = await runTp(["sid", "1", "extra"], {
			cwd: server.root,
			env: server.env,
		});
		expect(noArgument.exitCode).toBe(2);
		expect(extraArgument.exitCode).toBe(2);
	} finally {
		server.teardown();
	}
});

test("tp sid with no argument uses the current tp pane", async () => {
	const server = new ScratchTmuxServer();
	server.start();
	const project = basename(server.root);
	const fake = server.createFakePi({
		sessionName: `${project}_002`,
		sessionId: SESSION_ID,
	});
	try {
		waitFor(() => fake.options()["@pi_session_id"] === SESSION_ID);
		const result = await runTp(["sid"], {
			cwd: server.root,
			env: { ...server.env, TMUX_PANE: fake.paneId },
		});
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toBe(`${SESSION_ID}\n`);
	} finally {
		server.teardown();
	}
});

test("tp sid with no argument outside tmux is a usage error", async () => {
	const server = new ScratchTmuxServer();
	server.start();
	try {
		const result = await runTp(["sid"], {
			cwd: server.root,
			env: server.env,
		});
		expect(result.exitCode).toBe(2);
	} finally {
		server.teardown();
	}
});

// Fish source: legacy/tests/test_tp.fish:674 — restart drops stale session
// selection and appends the exact saved path.
test("restart drops resume and appends the recorded session path", () => {
	expect(
		rebuildRestartCommand("pi --name issue-filer --resume", SESSION_ID),
	).toEqual(["pi", "--name", "issue-filer", "--session", SESSION_ID]);
});

test("restart drops continue and keeps other Pi flags", () => {
	expect(
		rebuildRestartCommand("pi --continue --model sonnet:high", SESSION_ID),
	).toEqual(["pi", "--model", "sonnet:high", "--session", SESSION_ID]);
});

test("restart replaces a separate session and fork value", () => {
	expect(
		rebuildRestartCommand(
			"pi --session old-session --fork old-fork --name keep",
			SESSION_ID,
		),
	).toEqual(["pi", "--name", "keep", "--session", SESSION_ID]);
});

test("restart replaces joined session and fork values", () => {
	expect(
		rebuildRestartCommand(
			"pi --session=old-session --fork=old-fork --name keep",
			SESSION_ID,
		),
	).toEqual(["pi", "--name", "keep", "--session", SESSION_ID]);
});

// Fish source: legacy/tests/test_tp.fish:696 — quoted argument boundaries survive.
test("restart preserves quoted argument boundaries", () => {
	expect(
		rebuildRestartCommand(
			"pi --name 'two words' --model openai/gpt-5",
			SESSION_ID,
		),
	).toEqual([
		"pi",
		"--name",
		"two words",
		"--model",
		"openai/gpt-5",
		"--session",
		SESSION_ID,
	]);
});

// Fish source: legacy/tests/test_tp.fish:704 — wrapper options are not parsed as
// Pi options.
test("restart keeps an update-first wrapper intact", () => {
	expect(
		rebuildRestartCommand(
			"fish -c 'pi update --all; and pi $argv' -- --name upgrade",
			SESSION_ID,
		),
	).toEqual([
		"fish",
		"-c",
		"pi update --all; and pi $argv",
		"--",
		"--name",
		"upgrade",
		"--session",
		SESSION_ID,
	]);
});

test("restart rejects an empty recorded command", () => {
	expect(rebuildRestartCommand("", SESSION_ID)).toBeUndefined();
});

// Fish source: legacy/tests/test_tp.fish:715 — the session directory mirrors
// Pi's path-to-dashes rule, and legacy/tests/test_tp.fish:732 — a saved log is
// found before restart acts.
test("restart locates a saved session in the working-directory folder", () =>
	withAgentDirectory((agentDirectory) => {
		const directory = join(agentDirectory, "sessions", "--tmp-demo--");
		mkdirSync(directory, { recursive: true });
		const file = join(
			directory,
			`2026-01-01T00-00-00-000Z_${SESSION_ID}.jsonl`,
		);
		writeFileSync(file, "");
		expect(findPiSessionFile("/tmp/demo", SESSION_ID)).toBe(file);
	}));

// Fish source: legacy/tests/test_tp.fish:740 — a saved conversation in a
// custom first-level session directory is resumable.
test("restart locates a saved session in the forks folder", () =>
	withAgentDirectory((agentDirectory) => {
		const directory = join(agentDirectory, "sessions", "forks");
		mkdirSync(directory, { recursive: true });
		const file = join(
			directory,
			`2026-01-02T00-00-00-000Z_${SESSION_ID}.jsonl`,
		);
		writeFileSync(file, "");
		expect(findPiSessionFile("/tmp/demo", SESSION_ID)).toBe(file);
	}));

// Fish source: legacy/tests/test_tp.fish:763 — restart reopens the exact saved
// conversation instead of invoking global ID lookup.
test("restart passes the exact fork log path to the recreated Pi", () =>
	withAgentDirectory((agentDirectory) => {
		const server = new ScratchTmuxServer();
		server.start();
		const name = `${basename(server.root)}_001`;
		const sessionId = "019ff6ca-d2be-7455-a16b-3847839264fc";
		const directory = join(agentDirectory, "sessions", "forks");
		const file = join(directory, `2026-01-02T00-00-00-000Z_${sessionId}.jsonl`);
		mkdirSync(directory, { recursive: true });
		writeFileSync(file, "");
		server.run([
			"new-session",
			"-d",
			"-s",
			name,
			"-c",
			server.root,
			"--",
			"tail",
			"-f",
			"/dev/null",
			"--",
		]);
		const pane = server
			.run(["display-message", "-p", "-t", `${name}:0.0`, "#{pane_id}"])
			.stdout.trim();
		const pid = Number(
			server
				.run(["display-message", "-p", "-t", pane, "#{pane_pid}"])
				.stdout.trim(),
		);
		server.run(["set-option", "-p", "-t", pane, "@pi_session_id", sessionId]);
		server.run(["set-option", "-p", "-t", pane, "@pi_pid", String(pid)]);
		server.run([
			"set-environment",
			"-t",
			`=${name}`,
			"TP_CMD",
			"tail -f /dev/null --",
		]);

		const previousSocket = process.env.TP_TMUX_SOCKET;
		const previousTmux = process.env.TMUX;
		process.env.TP_TMUX_SOCKET = server.socket;
		process.env.TMUX = undefined;
		try {
			expect(isProcessAlive(pid)).toBe(true);
			expect(restartSession(name)).toBe(0);
			expect(isProcessAlive(pid)).toBe(false);
			expect(
				server
					.run(["show-environment", "-t", `=${name}`, "TP_CMD"])
					.stdout.trim(),
			).toBe(`TP_CMD=tail -f /dev/null -- --session ${file}`);
		} finally {
			if (previousSocket === undefined) process.env.TP_TMUX_SOCKET = undefined;
			else process.env.TP_TMUX_SOCKET = previousSocket;
			if (previousTmux === undefined) process.env.TMUX = undefined;
			else process.env.TMUX = previousTmux;
			server.teardown();
		}
	}));

// The refusal checks deliberately call the exported restart primitive. Core and
// listings own the numeric/global command routing, while this lane owns the
// kill-before-lookup safety contract.
test("restart refuses no Pi without killing the tmux session", () => {
	const server = new ScratchTmuxServer();
	server.start();
	const project = basename(server.root);
	const name = `${project}_001`;
	server.run(["new-session", "-d", "-s", name, "sleep", "30"]);
	try {
		expect(restartSession(name)).toBe(1);
		expect(server.run(["has-session", "-t", `=${name}`], true).exitCode).toBe(
			0,
		);
	} finally {
		server.teardown();
	}
});

test("restart refuses a stale id without killing the tmux session", () => {
	const server = new ScratchTmuxServer();
	server.start();
	const project = basename(server.root);
	const name = `${project}_001`;
	server.run(["new-session", "-d", "-s", name, "sleep", "30"]);
	const pane = server
		.run(["display-message", "-p", "-t", `${name}:0.0`, "#{pane_id}"])
		.stdout.trim();
	server.run(["set-option", "-p", "-t", pane, "@pi_session_id", SESSION_ID]);
	server.run(["set-option", "-p", "-t", pane, "@pi_pid", "999999"]);
	try {
		expect(restartSession(name)).toBe(1);
		expect(server.run(["has-session", "-t", `=${name}`], true).exitCode).toBe(
			0,
		);
	} finally {
		server.teardown();
	}
});

test("restart refuses an id without a saved file without killing Pi", () => {
	const server = new ScratchTmuxServer();
	server.start();
	const project = basename(server.root);
	const name = `${project}_001`;
	const fake = server.createFakePi({
		sessionName: name,
		sessionId: SESSION_ID,
	});
	try {
		waitFor(() => fake.options()["@pi_session_id"] === SESSION_ID);
		withAgentDirectory(() => {
			expect(restartSession(name)).toBe(1);
			expect(server.run(["has-session", "-t", `=${name}`], true).exitCode).toBe(
				0,
			);
		});
	} finally {
		server.teardown();
	}
});

test("tp <n> --restart routes through restartSession", async () => {
	const server = new ScratchTmuxServer();
	server.start();
	const project = basename(server.root);
	const name = `${project}_002`;
	server.run(["new-session", "-d", "-s", name]);
	try {
		const result = await runTp(["2", "--restart"], {
			cwd: server.root,
			env: server.env,
		});
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toBe("");
		expect(server.run(["has-session", "-t", `=${name}`], true).exitCode).toBe(
			0,
		);
	} finally {
		server.teardown();
	}
});
test("tp global <i> --restart routes through restartSession", async () => {
	const server = new ScratchTmuxServer();
	server.start();
	const project = basename(server.root);
	const name = `${project}_001`;
	server.run(["new-session", "-d", "-s", name]);
	try {
		const result = await runTp(["global", "1", "--restart"], {
			cwd: server.root,
			env: server.env,
		});
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toBe("");
		expect(server.run(["has-session", "-t", `=${name}`], true).exitCode).toBe(
			0,
		);
	} finally {
		server.teardown();
	}
});
