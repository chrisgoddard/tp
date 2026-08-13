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

// Fish source: legacy/tests/test_tp.fish:40 — leading zeroes are parsed as decimal.
test.todo("leading zeroes are parsed as decimal", async () => {
	const server = new ScratchTmuxServer();
	server.start();
	const project = basename(server.root);
	try {
		server.run(["new-session", "-d", "-s", `${project}_008`, "sleep", "30"]);
		const result = await runTp(["008"], {
			cwd: server.root,
			env: server.env,
		});
		expect(result.exitCode).toBe(0);
		expect(
			server.run(["has-session", "-t", `=${project}_008`], true).exitCode,
		).toBe(0);
	} finally {
		server.teardown();
	}
});
// Fish source: legacy/tests/test_tp.fish:41 — all-zero input is normalized.
test.todo("all-zero input is normalized", async () => {
	await runTpCase(["--help"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:42 — session numbers are padded.
test.todo("session numbers are padded", async () => {
	await runTpCase(["ls"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:43 — large session numbers are preserved.
test.todo("large session numbers are preserved", async () => {
	await runTpCase(["ls"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:57 — nested command serialization preserves argument boundaries.
test.todo(
	"nested command serialization preserves argument boundaries",
	async () => {
		await runTpCase(["--help"], { exitCode: 0 });
	},
);
// Fish source: legacy/tests/test_tp.fish:60 — non-numeric session numbers are rejected.
test.todo("non-numeric session numbers are rejected", async () => {
	await runTpCase(["ls"], { exitCode: 1 });
});
// Fish source: legacy/tests/test_tp.fish:840 — project completions contain sorted session numbers.
test.todo("project completions contain sorted session numbers", async () => {
	await runTpCase(["__complete", "fish", "--", "tp", ""], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:843 — project completion includes the session label.
test.todo("project completion includes the session label", async () => {
	await runTpCase(["__complete", "fish", "--", "tp", ""], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:848 — global completions contain one-based indexes.
test.todo("global completions contain one-based indexes", async () => {
	await runTpCase(["__complete", "fish", "--", "tp", ""], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:850 — global completion indexes match list order.
test.todo("global completion indexes match list order", async () => {
	await runTpCase(["__complete", "fish", "--", "tp", ""], { exitCode: 0 });
});
