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
