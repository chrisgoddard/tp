import { expect, test } from "bun:test";
import { basename } from "node:path";
import { ScratchTmuxServer, runTp } from "./harness";

async function withServer(
	callback: (server: ScratchTmuxServer) => Promise<void> | void,
): Promise<void> {
	const server = new ScratchTmuxServer();
	server.start();
	try {
		await callback(server);
	} finally {
		server.teardown();
	}
}

function projectSession(server: ScratchTmuxServer, number: string): string {
	const name = `${basename(server.root)}_${number}`;
	server.run(["new-session", "-d", "-s", name, "sleep", "30"]);
	return name;
}

function completionRows(output: string): string[] {
	return output.trim().split("\n").filter(Boolean);
}

// Fish source: legacy/tests/test_tp.fish:40 — leading zeroes are parsed as decimal.
test("leading zeroes are parsed as decimal", async () => {
	await withServer(async (server) => {
		const name = projectSession(server, "008");
		const result = await runTp(["008", "--restart"], {
			cwd: server.root,
			env: server.env,
		});
		expect(result.exitCode).toBe(1);
		expect(result.stderr).not.toContain("Unknown command");
		expect(server.run(["has-session", "-t", `=${name}`], true).exitCode).toBe(
			0,
		);
	});
});

// Fish source: legacy/tests/test_tp.fish:41 — all-zero input is normalized.
test("all-zero input is normalized", async () => {
	await withServer(async (server) => {
		const name = projectSession(server, "000");
		const result = await runTp(["000", "--restart"], {
			cwd: server.root,
			env: server.env,
		});
		expect(result.exitCode).toBe(1);
		expect(result.stderr).not.toContain("Unknown command");
		expect(server.run(["has-session", "-t", `=${name}`], true).exitCode).toBe(
			0,
		);
	});
});

// Fish source: legacy/tests/test_tp.fish:42 — session numbers are padded.
test("session numbers are padded", async () => {
	await withServer(async (server) => {
		const name = projectSession(server, "2");
		const result = await runTp(["ls"], { cwd: server.root, env: server.env });
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain(`002  →  ${name}`);
	});
});

// Fish source: legacy/tests/test_tp.fish:43 — large session numbers are preserved.
test("large session numbers are preserved", async () => {
	await withServer(async (server) => {
		const name = projectSession(server, "1234");
		const result = await runTp(["ls"], { cwd: server.root, env: server.env });
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain(`1234  →  ${name}`);
	});
});

// Fish source: legacy/tests/test_tp.fish:57 — nested command serialization preserves argument boundaries.
test("nested command serialization preserves argument boundaries", async () => {
	await withServer(async (server) => {
		const result = await runTp(
			[
				"new",
				"--",
				"printf",
				"<%s>|<%s>|<%s>\n",
				"two words",
				"semi;colon",
				"dollar$sign",
			],
			{
				cwd: server.root,
				env: {
					...server.env,
					TP_SHELL: "/bin/sh",
					TMUX: undefined,
					TMUX_PANE: undefined,
				},
			},
		);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("<two words>|<semi;colon>|<dollar$sign>");
	});
});

// Fish source: legacy/tests/test_tp.fish:60 — non-numeric session numbers are rejected.
test("non-numeric session numbers are rejected", async () => {
	await withServer(async (server) => {
		const result = await runTp(["nope"], { cwd: server.root, env: server.env });
		expect(result.exitCode).toBe(2);
		expect(result.stderr).toContain("Unknown command or session label 'nope'");
	});
});

// Fish source: legacy/tests/test_tp.fish:840 — project completions contain sorted session numbers.
test("project completions contain sorted session numbers", async () => {
	await withServer(async (server) => {
		projectSession(server, "010");
		projectSession(server, "002");
		projectSession(server, "001");
		const result = await runTp(["__complete", "fish", "--", "tp", "kill", ""], {
			cwd: server.root,
			env: server.env,
		});
		expect(result.exitCode).toBe(0);
		const values = completionRows(result.stdout)
			.filter((row) => /^\d{3}\t/u.test(row))
			.map((row) => row.split("\t", 1)[0]);
		expect(values).toEqual(["001", "002", "010"]);
	});
});

// Fish source: legacy/tests/test_tp.fish:843 — project completion includes the session label.
test("project completion includes the session label", async () => {
	await withServer(async (server) => {
		const name = projectSession(server, "002");
		server.run(["set-option", "-t", name, "@tp_name", "backend"]);
		const result = await runTp(["__complete", "fish", "--", "tp", "kill", ""], {
			cwd: server.root,
			env: server.env,
		});
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain(`002\t${name} [backend]`);
	});
});

// Fish source: legacy/tests/test_tp.fish:848 — global completions contain one-based indexes.
test("global completions contain one-based indexes", async () => {
	await withServer(async (server) => {
		projectSession(server, "001");
		projectSession(server, "002");
		projectSession(server, "010");
		server.run(["new-session", "-d", "-s", "other_001", "sleep", "30"]);
		const result = await runTp(
			["__complete", "fish", "--", "tp", "global", ""],
			{ cwd: server.root, env: server.env },
		);
		expect(result.exitCode).toBe(0);
		const indexes = completionRows(result.stdout)
			.filter((row) => /^\d+\t/u.test(row))
			.map((row) => row.split("\t", 1)[0]);
		expect(indexes).toEqual(["1", "2", "3", "4"]);
	});
});

// Fish source: legacy/tests/test_tp.fish:850 — global completion indexes match list order.
test("global completion indexes match list order", async () => {
	await withServer(async (server) => {
		const names = [
			projectSession(server, "001"),
			projectSession(server, "002"),
			`${basename(server.root)}-other_001`,
		];
		server.run(["new-session", "-d", "-s", names[2], "sleep", "30"]);
		const listing = await runTp(["global"], {
			cwd: server.root,
			env: server.env,
		});
		const listedNames = [
			...listing.stdout.matchAll(/^\s+\d+\s+→\s+(\S+)/gmu),
		].map((match) => match[1]);
		const completion = await runTp(
			["__complete", "fish", "--", "tp", "global", ""],
			{ cwd: server.root, env: server.env },
		);
		const completedNames = completionRows(completion.stdout)
			.filter((row) => /^\d+\t/u.test(row))
			.map((row) => row.split("\t", 2)[1]);
		expect(completedNames).toEqual(listedNames);
	});
});
