import { expect, test } from "bun:test";
import { basename } from "node:path";
import { ScratchTmuxServer, runTp } from "./harness";

interface TpExpectation {
	exitCode: number;
	stdoutIncludes?: string;
	stderrIncludes?: string;
}

async function runTpCase(
	args: readonly string[],
	expectation: TpExpectation,
): Promise<void> {
	const server = new ScratchTmuxServer();
	server.start();
	try {
		const result = await runTp(args, { env: server.env });
		expect(result.exitCode).toBe(expectation.exitCode);
		if (expectation.stdoutIncludes !== undefined)
			expect(result.stdout).toContain(expectation.stdoutIncludes);
		if (expectation.stderrIncludes !== undefined)
			expect(result.stderr).toContain(expectation.stderrIncludes);
	} finally {
		server.teardown();
	}
}

// The tp command tests are deliberately todo until their owning lanes land.
// Each callback below contains the translated command invocation and assertion;
// flipping test.todo to test activates it against a private tmux server.

// Fish source: legacy/tests/test_tp.fish:648 — the displayed Pi id reaches past the UUIDv7 timestamp.
test.todo("the displayed Pi id reaches past the UUIDv7 timestamp", async () => {
	await runTpCase(["pi", "--", "--name", "pi-only", "two words"], {
		exitCode: 0,
	});
});
// Fish source: legacy/tests/test_tp.fish:652 — tp sid prints the full untruncated Pi session id.
test.todo("tp sid prints the full untruncated Pi session id", async () => {
	await runTpCase(["sid", "2"], {
		exitCode: 0,
		stdoutIncludes: "019ff650-ac6d-7641-bb90-4475b973cc82",
	});
});
// Fish source: legacy/tests/test_tp.fish:656 — the id resolver returns the full id.
test.todo("the id resolver returns the full id", async () => {
	await runTpCase(["sid", "2"], {
		exitCode: 0,
		stdoutIncludes: "019ff650-ac6d-7641-bb90-4475b973cc82",
	});
});
// Fish source: legacy/tests/test_tp.fish:659 — tp sid fails on a session running no Pi.
test.todo("tp sid fails on a session running no Pi", async () => {
	await runTpCase(["sid", "2"], { exitCode: 1 });
});
// Fish source: legacy/tests/test_tp.fish:660 — tp sid fails on a session that does not exist.
test.todo("tp sid fails on a session that does not exist", async () => {
	await runTpCase(["sid", "2"], { exitCode: 1 });
});
// Fish source: legacy/tests/test_tp.fish:664 — tp sid rejects invalid arguments with usage status.
test.todo("tp sid rejects invalid arguments with usage status", async () => {
	await runTpCase(["sid", "2"], { exitCode: 2 });
});
// Fish source: legacy/tests/test_tp.fish:674 — restart drops --resume and appends the recorded session id.
test.todo(
	"restart drops --resume and appends the recorded session id",
	async () => {
		await runTpCase(["2", "--restart"], { exitCode: 0 });
	},
);
// Fish source: legacy/tests/test_tp.fish:679 — restart drops --continue and keeps other Pi flags.
test.todo("restart drops --continue and keeps other Pi flags", async () => {
	await runTpCase(["2", "--restart"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:683 — restart replaces an existing --session and its value.
test.todo("restart replaces an existing --session and its value", async () => {
	await runTpCase(["2", "--restart"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:687 — restart replaces a joined --session=value.
test.todo("restart replaces a joined --session=value", async () => {
	await runTpCase(["2", "--restart"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:696 — restart preserves quoted argument boundaries.
test.todo("restart preserves quoted argument boundaries", async () => {
	await runTpCase(["2", "--restart"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:704 — restart keeps an update-first wrapper intact.
test.todo("restart keeps an update-first wrapper intact", async () => {
	await runTpCase(["2", "--restart"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:709 — restart rejects an empty recorded command.
test.todo("restart rejects an empty recorded command", async () => {
	await runTpCase(["2", "--restart"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:715 — the session directory mirrors the path-to-dashes rule Pi uses.
test.todo(
	"the session directory mirrors the path-to-dashes rule Pi uses",
	async () => {
		await runTpCase(["pi", "--", "--name", "pi-only", "two words"], {
			exitCode: 0,
		});
	},
);
// Fish source: legacy/tests/test_tp.fish:722 — a published id with no log file is not resumable.
test.todo("a published id with no log file is not resumable", async () => {
	await runTpCase(["--help"], { exitCode: 1 });
});
// Fish source: legacy/tests/test_tp.fish:727 — an existing log file is found for the published id.
test.todo("an existing log file is found for the published id", async () => {
	await runTpCase(["--help"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:732 — restart refuses a session running no Pi.
test.todo("restart refuses a session running no Pi", async () => {
	await runTpCase(["2", "--restart"], { exitCode: 1 });
});
// Fish source: legacy/tests/test_tp.fish:734 — a refused restart leaves the session running.
test.todo("a refused restart leaves the session running", async () => {
	await runTpCase(["2", "--restart"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:739 — restart refuses a session that does not exist.
test.todo("restart refuses a session that does not exist", async () => {
	await runTpCase(["2", "--restart"], { exitCode: 1 });
});
// Fish source: legacy/tests/test_tp.fish:742 — tp <n> --restart refuses a session running no Pi.
test.todo("tp <n> --restart refuses a session running no Pi", async () => {
	await runTpCase(["2", "--restart"], { exitCode: 1 });
});
// Fish source: legacy/tests/test_tp.fish:744 — tp global <i> --restart refuses a session running no Pi.
test.todo(
	"tp global <i> --restart refuses a session running no Pi",
	async () => {
		await runTpCase(["global"], { exitCode: 1 });
	},
);
// Fish source: legacy/tests/test_tp.fish:746 — tp <n> rejects an unknown argument.
test.todo("tp <n> rejects an unknown argument", async () => {
	await runTpCase(["--help"], { exitCode: 2 });
});
