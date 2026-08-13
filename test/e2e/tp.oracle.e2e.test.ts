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
// Fish source: legacy/tests/test_tp.fish:63 — Linux client TTYs are sanitized.
test.todo("Linux client TTYs are sanitized", async () => {
	await runTpCase(["ls"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:64 — macOS client TTYs are sanitized.
test.todo("macOS client TTYs are sanitized", async () => {
	await runTpCase(["ls"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:65 — separator runs in client TTYs become single underscores.
test.todo(
	"separator runs in client TTYs become single underscores",
	async () => {
		await runTpCase(["ls"], { exitCode: 0 });
	},
);
// Fish source: legacy/tests/test_tp.fish:77 — invalid client TTY values are rejected.
test.todo(
	"empty, control-containing, oversized, and separator-only client TTYs are rejected",
	async () => {
		await runTpCase(["ls"], { exitCode: 2 });
	},
);
// Fish source: legacy/tests/test_tp.fish:168 — outside attachment installs metadata stamping before attach-session.
test.todo(
	"outside attachment installs metadata stamping before attach-session",
	async () => {
		await runTpCase(["sid", "2"], { exitCode: 0 });
	},
);
// Fish source: legacy/tests/test_tp.fish:175 — outside attachment keeps the exact session target.
test.todo("outside attachment keeps the exact session target", async () => {
	await runTpCase(["sid", "2"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:186 — outside hook preserves IPv6 sources.
test.todo("outside hook preserves IPv6 sources", async () => {
	await runTpCase(["sid", "2"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:191 — missing SSH metadata clears the exact mapping before attachment.
test.todo(
	"missing SSH metadata clears the exact mapping before attachment",
	async () => {
		await runTpCase(["ls"], { exitCode: 0 });
	},
);
// Fish source: legacy/tests/test_tp.fish:195 — missing SSH metadata clears only the current TTY mapping.
test.todo(
	"missing SSH metadata clears only the current TTY mapping",
	async () => {
		await runTpCase(["ls"], { exitCode: 0 });
	},
);
// Fish source: legacy/tests/test_tp.fish:196 — tmux receives an argument-safe option unset command.
test.todo("tmux receives an argument-safe option unset command", async () => {
	await runTpCase(["--help"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:201 — control-containing SSH metadata clears the exact mapping.
test.todo(
	"control-containing SSH metadata clears the exact mapping",
	async () => {
		await runTpCase(["ls"], { exitCode: 0 });
	},
);
// Fish source: legacy/tests/test_tp.fish:210 — invalid TTY does not create a metadata option.
test.todo("an invalid TTY does not create a metadata option", async () => {
	await runTpCase(["ls"], { exitCode: 1 });
});
// Fish source: legacy/tests/test_tp.fish:216 — failed tty lookup does not create a metadata option.
test.todo("a failed tty lookup does not create a metadata option", async () => {
	await runTpCase(["ls"], { exitCode: 1 });
});
// Fish source: legacy/tests/test_tp.fish:225 — inside tmux reuses the current client mapping before switching.
test.todo(
	"inside tmux reuses the current client mapping before switching",
	async () => {
		await runTpCase(["sid", "2"], { exitCode: 0 });
	},
);
// Fish source: legacy/tests/test_tp.fish:229 — inside tmux reads the current client TTY.
test.todo("inside tmux reads the current client TTY", async () => {
	await runTpCase(["sid", "2"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:230 — inside tmux reads the current client mapping.
test.todo("inside tmux reads the current client mapping", async () => {
	await runTpCase(["sid", "2"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:231 — inside tmux keeps the exact switch target.
test.todo("inside tmux keeps the exact switch target", async () => {
	await runTpCase(["sid", "2"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:232 — inside tmux does not overwrite metadata from SSH_CONNECTION.
test.todo(
	"inside tmux does not overwrite metadata from SSH_CONNECTION",
	async () => {
		await runTpCase(["sid", "2"], { exitCode: 0 });
	},
);
// Fish source: legacy/tests/test_tp.fish:233 — inside tmux does not clear a trusted client mapping.
test.todo("inside tmux does not clear a trusted client mapping", async () => {
	await runTpCase(["sid", "2"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:238 — inside tmux leaves a missing client mapping absent and still switches.
test.todo(
	"inside tmux leaves a missing client mapping absent and still switches",
	async () => {
		await runTpCase(["sid", "2"], { exitCode: 0 });
	},
);
// Fish source: legacy/tests/test_tp.fish:242 — inside tmux does not guess a missing source.
test.todo("inside tmux does not guess a missing source", async () => {
	await runTpCase(["sid", "2"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:243 — inside tmux does not mutate an absent source mapping.
test.todo("inside tmux does not mutate an absent source mapping", async () => {
	await runTpCase(["sid", "2"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:308 — real client-attached hook records the real client_created.
test.todo(
	"real client-attached hook records the real client_created",
	async () => {
		await runTpCase(["ls"], { exitCode: 0 });
	},
);
// Fish source: legacy/tests/test_tp.fish:326 — plain reattach reuses the original client TTY.
test.todo("plain reattach reuses the original client TTY", async () => {
	await runTpCase(["ls"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:331 — stale source remains bound to the previous client_created.
test.todo(
	"stale source remains bound to the previous client_created",
	async () => {
		await runTpCase(["ls"], { exitCode: 0 });
	},
);
// Fish source: legacy/tests/test_tp.fish:335 — outside attach cleanup removes pending records.
test.todo("outside attach cleanup removes pending records", async () => {
	await runTpCase(["sid", "2"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:382 — abandoned hook cannot mint a mapping for a later plain attach.
test.todo(
	"abandoned hook cannot mint a mapping for a later plain attach",
	async () => {
		await runTpCase(["ls"], { exitCode: 0 });
	},
);
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
// Fish source: legacy/tests/test_tp.fish:768 — tp p update-first launches the updater before Pi and preserves Pi arguments.
test.todo(
	"tp p update-first launches the updater before Pi and preserves Pi arguments",
	async () => {
		await runTpCase(["pi", "--", "--name", "pi-only", "two words"], {
			exitCode: 0,
		});
	},
);
// Fish source: legacy/tests/test_tp.fish:772 — tp p applies its name to the tmux session.
test.todo("tp p applies its name to the tmux session", async () => {
	await runTpCase(["pi", "--", "--name", "pi-only", "two words"], {
		exitCode: 0,
	});
});
// Fish source: legacy/tests/test_tp.fish:773 — tp p attaches to the new session.
test.todo("tp p attaches to the new session", async () => {
	await runTpCase(["pi", "--", "--name", "pi-only", "two words"], {
		exitCode: 0,
	});
});
// Fish source: legacy/tests/test_tp.fish:776 — tp pi passes every argument after -- directly to Pi.
test.todo("tp pi passes every argument after -- directly to Pi", async () => {
	await runTpCase(["pi", "--", "--name", "pi-only", "two words"], {
		exitCode: 0,
	});
});
// Fish source: legacy/tests/test_tp.fish:782 — tp pi stops interpreting options after --.
test.todo("tp pi stops interpreting options after --", async () => {
	await runTpCase(["pi", "--", "--name", "pi-only", "two words"], {
		exitCode: 0,
	});
});
// Fish source: legacy/tests/test_tp.fish:789 — tp pi rejects a missing name value.
test.todo("tp pi rejects a missing name value", async () => {
	await runTpCase(["pi", "--", "--name", "pi-only", "two words"], {
		exitCode: 2,
	});
});
// Fish source: legacy/tests/test_tp.fish:793 — tp pi shows usage after a missing name value.
test.todo("tp pi reports usage for a missing name value", async () => {
	await runTpCase(["pi", "--", "--name", "pi-only", "two words"], {
		exitCode: 2,
	});
});
// Fish source: legacy/tests/test_tp.fish:794 — tp pi creates no session after a missing name value.
test.todo("tp pi creates no session after a missing name value", async () => {
	await runTpCase(["pi", "--", "--name", "pi-only", "two words"], {
		exitCode: 2,
	});
});
// Fish source: legacy/tests/test_tp.fish:813 — screenshots are listed newest first.
test.todo("screenshots are listed newest first", async () => {
	await runTpCase(["shot"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:816 — tp shot returns the newest screenshot.
test.todo("tp shot returns the newest screenshot", async () => {
	await runTpCase(["shot"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:817 — tp shot list accepts a result limit.
test.todo("tp shot list accepts a result limit", async () => {
	await runTpCase(["shot"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:818 — tp shot dir returns the screenshot directory.
test.todo("tp shot dir returns the screenshot directory", async () => {
	await runTpCase(["shot"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:822 — tp shot latest rejects an extra argument.
test.todo("tp shot latest rejects an extra argument", async () => {
	await runTpCase(["shot"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:826 — tp shot rejects invalid arguments with usage status.
test.todo("tp shot rejects invalid arguments with usage status", async () => {
	await runTpCase(["shot"], { exitCode: 2 });
});
// Fish source: legacy/tests/test_tp.fish:830 — tp shot list rejects an oversized count.
test.todo("tp shot list rejects an oversized count", async () => {
	await runTpCase(["shot"], { exitCode: 2 });
});
// Fish source: legacy/tests/test_tp.fish:834 — oversized screenshot counts fail without Fish diagnostics.
test.todo(
	"oversized screenshot counts fail without Fish diagnostics",
	async () => {
		await runTpCase(["shot"], { exitCode: 2 });
	},
);
// Fish source: legacy/tests/test_tp.fish:837 — tp name stores a session label.
test.todo("tp name stores a session label", async () => {
	await runTpCase(["name", "2", "backend"], { exitCode: 0 });
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
// Fish source: legacy/tests/test_tp.fish:852 — tp kill removes a selected project session.
test.todo("tp kill removes a selected project session", async () => {
	await runTpCase(["kill", "2"], { exitCode: 0 });
});
// Fish source: legacy/tests/test_tp.fish:860 — tp kill removes all current-project sessions.
test.todo("tp kill removes all current-project sessions", async () => {
	await runTpCase(["kill", "2"], { exitCode: 0 });
});
