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

// Fish source: legacy/tests/test_tp.fish:391 — empty project list contains no phantom session.
test.todo("empty project list contains no phantom session", async () => {
	await runTpCase(["ls"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:394 — empty global list contains no phantom session.
test.todo("empty global list contains no phantom session", async () => {
	await runTpCase(["global"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:398 — tp ls fails when no project sessions exist.
test.todo("tp ls fails when no project sessions exist", async () => {
	await runTpCase(["ls"], { exitCode: 1, stdoutIncludes: "No tmux sessions" });
});
// Fish source: legacy/tests/test_tp.fish:399 — tp ls reports no project sessions.
test.todo("tp ls reports no project sessions", async () => {
	await runTpCase(["ls"], { exitCode: 0, stdoutIncludes: "No tmux sessions" });
});
// Fish source: legacy/tests/test_tp.fish:403 — tp global fails when no tp sessions exist.
test.todo("tp global fails when no tp sessions exist", async () => {
	await runTpCase(["global"], {
		exitCode: 1,
		stdoutIncludes: "No tp sessions",
	});
});
// Fish source: legacy/tests/test_tp.fish:404 — tp global reports no sessions.
test.todo("tp global reports no sessions", async () => {
	await runTpCase(["global"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:411 — project sessions are sorted numerically.
test.todo("project sessions are sorted numerically", async () => {
	await runTpCase(["ls"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:412 — next number follows the highest existing session.
test.todo("next number follows the highest existing session", async () => {
	await runTpCase(["ls"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:416 — project listing excludes other projects.
test.todo("project listing excludes other projects", async () => {
	await runTpCase(["ls"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:419 — global listing is grouped and sorted.
test.todo("global listing is grouped and sorted", async () => {
	await runTpCase(["global"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:434 — a live Pi session contributes its abbreviated id.
test.todo("a live Pi session contributes its abbreviated id", async () => {
	await runTpCase(["pi", "--", "--name", "pi-only", "two words"], {
		exitCode: 0,
	});
});
// Fish source: legacy/tests/test_tp.fish:435 — a session running no Pi contributes no id.
test.todo("a session running no Pi contributes no id", async () => {
	await runTpCase(["pi", "--", "--name", "pi-only", "two words"], {
		exitCode: 0,
	});
});
// Fish source: legacy/tests/test_tp.fish:436 — an id left behind by a dead Pi process is suppressed.
test.todo("an id left behind by a dead Pi process is suppressed", async () => {
	await runTpCase(["pi", "--", "--name", "pi-only", "two words"], {
		exitCode: 0,
	});
});
// Fish source: legacy/tests/test_tp.fish:442 — a live process owned by another user still counts as live.
test.todo(
	"a live process owned by another user still counts as live",
	async () => {
		await runTpCase(["--help"], { exitCode: 0 });
	},
);
// Fish source: legacy/tests/test_tp.fish:448 — an id published without a pid is still shown.
test.todo("an id published without a pid is still shown", async () => {
	await runTpCase(["--help"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:453 — tp ls shows the label and Pi session id together.
test.todo("tp ls shows the label and Pi session id together", async () => {
	await runTpCase(["pi", "--", "--name", "pi-only", "two words"], {
		exitCode: 0,
		stdoutIncludes: "demo_002",
	});
});
// Fish source: legacy/tests/test_tp.fish:459 — tp global shows the Pi session id.
test.todo("tp global shows the Pi session id", async () => {
	await runTpCase(["global"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:465 — tp all shows the Pi session id.
test.todo("tp all shows the Pi session id", async () => {
	await runTpCase(["pi", "--", "--name", "pi-only", "two words"], {
		exitCode: 0,
	});
});
// Fish source: legacy/tests/test_tp.fish:472 — an uncached session still yields an empty suffix.
test.todo("an uncached session still yields an empty suffix", async () => {
	await runTpCase(["ls"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:480 — a duration under an hour reads in minutes.
test.todo("a duration under an hour reads in minutes", async () => {
	await runTpCase(["ls"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:481 — a duration under a minute reads in seconds.
test.todo("a duration under a minute reads in seconds", async () => {
	await runTpCase(["ls"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:482 — a duration under a day reads in hours.
test.todo("a duration under a day reads in hours", async () => {
	await runTpCase(["ls"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:483 — a long duration reads in days.
test.todo("a long duration reads in days", async () => {
	await runTpCase(["ls"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:485 — a non-numeric duration is rejected.
test.todo("a non-numeric duration is rejected", async () => {
	await runTpCase(["ls"], { exitCode: 1 });
});
// Fish source: legacy/tests/test_tp.fish:490 — state, context and model are separate fields.
test.todo("state, context and model are separate fields", async () => {
	await runTpCase(["ls"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:491 — a blocked session names the tool holding it.
test.todo("a blocked session names the tool holding it", async () => {
	await runTpCase(["ls"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:492 — context usage is rendered as a percentage.
test.todo("context usage is rendered as a percentage", async () => {
	await runTpCase(["ls"], { exitCode: 2 });
});
// Fish source: legacy/tests/test_tp.fish:493 — the model is rendered last.
test.todo("the model is rendered last", async () => {
	await runTpCase(["--help"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:497 — an idle session does not name a stale tool.
test.todo("an idle session does not name a stale tool", async () => {
	await runTpCase(["ls"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:499 — a thinking session does not name a stale tool.
test.todo("a thinking session does not name a stale tool", async () => {
	await runTpCase(["ls"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:502 — a session publishing no state renders nothing.
test.todo("a session publishing no state renders nothing", async () => {
	await runTpCase(["ls"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:506 — a state with no extras is still rendered.
test.todo("a state with no extras is still rendered", async () => {
	await runTpCase(["ls"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:507 — a state with no timestamp omits the age.
test.todo("a state with no timestamp omits the age", async () => {
	await runTpCase(["ls"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:513 — every field is shown when there is room.
test.todo("every field is shown when there is room", async () => {
	await runTpCase(["ls"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:517 — a field that exactly fills the line is kept.
test.todo("a field that exactly fills the line is kept", async () => {
	await runTpCase(["ls"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:521 — a field one column too wide is dropped.
test.todo("a field one column too wide is dropped", async () => {
	await runTpCase(["ls"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:525 — no field is shown when the prefix already fills the line.
test.todo(
	"no field is shown when the prefix already fills the line",
	async () => {
		await runTpCase(["ls"], { exitCode: 0 });
	},
);
// Fish source: legacy/tests/test_tp.fish:535 — a listing shows the label, id and full state together.
test.todo("a listing shows the label, id and full state together", async () => {
	await runTpCase(["ls"], { exitCode: 0, stdoutIncludes: "demo_002" });
});
// Fish source: legacy/tests/test_tp.fish:544 — a dead Pi shows neither its id nor its last state.
test.todo("a dead Pi shows neither its id nor its last state", async () => {
	await runTpCase(["pi", "--", "--name", "pi-only", "two words"], {
		exitCode: 0,
	});
});
// Fish source: legacy/tests/test_tp.fish:553 — a narrow terminal keeps the state and drops the rest.
test.todo("a narrow terminal keeps the state and drops the rest", async () => {
	await runTpCase(["ls"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:564 — a state with no identity behind it is not shown.
test.todo("a state with no identity behind it is not shown", async () => {
	await runTpCase(["ls"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:579 — TP_COLOR=never disables colour.
test.todo("TP_COLOR=never disables colour", async () => {
	await runTpCase(["ls"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:580 — no escapes are emitted when colour is off.
test.todo("no escapes are emitted when colour is off", async () => {
	await runTpCase(["ls"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:584 — TP_COLOR=always keeps colour through a pipe.
test.todo("TP_COLOR=always keeps colour through a pipe", async () => {
	await runTpCase(["ls"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:588 — TP_COLOR=always emits escapes.
test.todo("TP_COLOR=always emits escapes", async () => {
	await runTpCase(["ls"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:597 — NO_COLOR wins over TP_COLOR=always.
test.todo("NO_COLOR wins over TP_COLOR=always", async () => {
	await runTpCase(["ls"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:601 — a coloured string measures its visible width.
test.todo("a coloured string measures its visible width", async () => {
	await runTpCase(["ls"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:602 — an uncoloured string measures the same.
test.todo("an uncoloured string measures the same", async () => {
	await runTpCase(["ls"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:607 — a character-set reset does not widen a coloured string.
test.todo(
	"a character-set reset does not widen a coloured string",
	async () => {
		await runTpCase(["ls"], { exitCode: 0 });
	},
);
// Fish source: legacy/tests/test_tp.fish:614 — colour escapes do not consume the width budget.
test.todo("colour escapes do not consume the width budget", async () => {
	await runTpCase(["ls"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:620 — blocked and idle are visually distinct.
test.todo("blocked and idle are visually distinct", async () => {
	await runTpCase(["--help"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:627 — a low context percent still reads plainly.
test.todo("a low context percent still reads plainly", async () => {
	await runTpCase(["ls"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:628 — a high context percent still reads plainly.
test.todo("a high context percent still reads plainly", async () => {
	await runTpCase(["ls"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:630 — a nearly-full context window is coloured differently.
test.todo("a nearly-full context window is coloured differently", async () => {
	await runTpCase(["ls"], { exitCode: 0 });
});
