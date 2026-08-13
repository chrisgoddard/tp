import { expect, test } from "bun:test";
import { basename } from "node:path";
import { assertListingSchema } from "./fixtures/listings-json-schema";
import { ScratchTmuxServer, runTp } from "./harness";

const project = basename(process.cwd()).replace(/^\.+/, "");

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

function create(server: ScratchTmuxServer, ...names: string[]): void {
	for (const name of names) server.run(["new-session", "-d", "-s", name]);
}

test("--recent orders by tmux session_activity descending", async () => {
	await withServer(async (server) => {
		create(server, "old_001", "new_001");
		server.run(["kill-session", "-t", "=new_001"]);
		await Bun.sleep(1100);
		create(server, "new_001");
		const recent = await runTp(["g", "--recent"], { env: server.env });
		expect(recent.exitCode).toBe(0);
		expect(recent.stdout.indexOf("new_001")).toBeLessThan(
			recent.stdout.indexOf("old_001"),
		);
	});
});

test("listing rendering breakpoints drop rightmost fields", async () => {
	await withServer(async (server) => {
		create(server, `${project}_001`);
		const pane = `${project}_001:0.0`;
		for (const [option, value] of [
			["@pi_session_id", "breakpoint-id"],
			["@pi_pid", String(process.pid)],
			["@pi_state", "blocked"],
			["@pi_tool", "bash"],
			["@pi_state_since", String(Math.floor(Date.now() / 1000) - 4)],
			["@pi_ctx_pct", "61"],
			["@pi_model", "model"],
		])
			server.run(["set-option", "-p", "-t", pane, option, value]);
		const narrow = await runTp(["ls"], {
			env: { ...server.env, COLUMNS: "65" },
		});
		expect(narrow.stdout).toContain("blocked:bash");
		expect(narrow.stdout).not.toContain("model");
		const wide = await runTp(["ls"], {
			env: { ...server.env, COLUMNS: "200" },
		});
		expect(wide.stdout).toContain("blocked:bash");
		expect(wide.stdout).toContain("61%");
		expect(wide.stdout).toContain("model");
	});
});

test("NO_COLOR wins over TP_COLOR=always", async () => {
	await withServer(async (server) => {
		create(server, `${project}_001`);
		const result = await runTp(["ls"], {
			env: { ...server.env, NO_COLOR: "1", TP_COLOR: "always" },
		});
		expect(result.stdout).not.toContain("\u001b[");
	});
});

test("piped listing output has no ANSI by default", async () => {
	await withServer(async (server) => {
		create(server, `${project}_001`);
		const result = await runTp(["ls"], { env: server.env });
		expect(result.stdout).not.toContain("\u001b[");
	});
});

test("--json round-trips against the checked-in schema fixture", async () => {
	await withServer(async (server) => {
		create(server, `${project}_001`);
		const result = await runTp(["ls", "--json"], { env: server.env });
		expect(result.exitCode).toBe(0);
		const parsed: unknown = JSON.parse(result.stdout);
		assertListingSchema(parsed);
		expect(parsed).toHaveLength(1);
	});
});
