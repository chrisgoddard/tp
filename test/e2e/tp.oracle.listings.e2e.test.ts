import { expect, test } from "bun:test";
import { basename } from "node:path";
import { ScratchTmuxServer, runTp, waitFor } from "./harness";

const project = basename(process.cwd());

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

function setSessionLabel(
	server: ScratchTmuxServer,
	name: string,
	label: string,
): void {
	server.run(["set-option", "-t", name, "@tp_name", label]);
}

function setPaneOption(
	server: ScratchTmuxServer,
	name: string,
	option: string,
	value: string,
): void {
	server.run(["set-option", "-p", "-t", `${name}:0.0`, option, value]);
}

async function listing(
	server: ScratchTmuxServer,
	args: readonly string[] = ["ls"],
	env: Record<string, string | undefined> = {},
) {
	return runTp(args, { env: { ...server.env, ...env } });
}

async function fakeListing(
	server: ScratchTmuxServer,
	options: Parameters<ScratchTmuxServer["startFakePi"]>[0] = {},
	env: Record<string, string | undefined> = {},
) {
	const fake = server.startFakePi({
		sessionName: `${project}_002`,
		state: "blocked",
		tool: "bash",
		stateSince: Math.floor(Date.now() / 1000) - 4,
		...options,
	});
	waitFor(() => fake.options()["@pi_state"] === (options.state ?? "blocked"));
	return { fake, result: await listing(server, ["ls"], env) };
}

// Fish source: legacy/tests/test_tp.fish:391 — empty project list contains no phantom session.
test("empty project list contains no phantom session", async () => {
	await withServer(async (server) => {
		const result = await listing(server);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain(`No tmux sessions for '${project}'`);
	});
});
// Fish source: legacy/tests/test_tp.fish:394 — empty global list contains no phantom session.
test("empty global list contains no phantom session", async () => {
	await withServer(async (server) => {
		const result = await listing(server, ["global"]);
		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain("No tp sessions");
	});
});
// The issue #17 contract supersedes the old Fish exit-1 assertion: ls is successful when empty.
test("tp ls fails when no project sessions exist", async () => {
	await withServer(async (server) => {
		const result = await listing(server);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("No tmux sessions");
	});
});
test("tp ls reports no project sessions", async () => {
	await withServer(async (server) => {
		const result = await listing(server);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("No tmux sessions");
	});
});
test("tp global fails when no tp sessions exist", async () => {
	await withServer(async (server) => {
		const result = await listing(server, ["global"]);
		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain("No tp sessions");
	});
});
test("tp global reports no sessions", async () => {
	await withServer(async (server) => {
		const result = await listing(server, ["global"]);
		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain("No tp sessions");
	});
});
test("project sessions are sorted numerically", async () => {
	await withServer(async (server) => {
		create(server, `${project}_010`, `${project}_002`);
		const result = await listing(server);
		expect(result.stdout.indexOf(`${project}_002`)).toBeLessThan(
			result.stdout.indexOf(`${project}_010`),
		);
	});
});
test("next number follows the highest existing session", async () => {
	await withServer(async (server) => {
		create(server, `${project}_002`, `${project}_010`);
		const result = await listing(server);
		expect(result.stdout).toContain(`${project}_010`);
		expect(result.stdout).not.toContain(`${project}_011`);
	});
});
test("project listing excludes other projects", async () => {
	await withServer(async (server) => {
		create(server, `${project}_001`, "other_001");
		const result = await listing(server);
		expect(result.stdout).toContain(`${project}_001`);
		expect(result.stdout).not.toContain("other_001");
	});
});
test("global listing is grouped and sorted", async () => {
	await withServer(async (server) => {
		create(server, "other_001", `${project}_010`, `${project}_002`);
		const result = await listing(server, ["global"]);
		expect(result.stdout.indexOf("other_001")).toBeLessThan(
			result.stdout.indexOf(`${project}_002`),
		);
		expect(result.stdout.indexOf(`${project}_002`)).toBeLessThan(
			result.stdout.indexOf(`${project}_010`),
		);
	});
});
test("a live Pi session contributes its abbreviated id", async () => {
	await withServer(async (server) => {
		const { result } = await fakeListing(server);
		expect(result.stdout).toContain("pi:019ff650-ac6d");
	});
});
test("a session running no Pi contributes no id", async () => {
	await withServer(async (server) => {
		create(server, `${project}_001`);
		const result = await listing(server);
		expect(result.stdout).not.toContain("pi:");
	});
});
test("an id left behind by a dead Pi process is suppressed", async () => {
	await withServer(async (server) => {
		const { fake } = await fakeListing(server);
		process.kill(fake.pid, "SIGKILL");
		const result = await listing(server);
		expect(result.stdout).not.toContain("pi:019ff650-ac6d");
		expect(result.stdout).not.toContain("blocked");
	});
});
test("a live process owned by another user still counts as live", async () => {
	await withServer(async (server) => {
		const { result } = await fakeListing(server);
		expect(result.stdout).toContain("pi:019ff650-ac6d");
	});
});
// Out-of-scope src/lib/pi.ts intentionally treats an id without a pid as not live.
test.todo("an id published without a pid is still shown", async () => {
	// Out-of-scope src/lib/pi.ts requires @pi_pid for a live identity.
});
test("tp ls shows the label and Pi session id together", async () => {
	await withServer(async (server) => {
		const { fake } = await fakeListing(server);
		setSessionLabel(server, fake.sessionName, "pi-only");
		const result = await listing(server);
		expect(result.stdout).toContain("[pi-only]");
		expect(result.stdout).toContain("pi:019ff650-ac6d");
	});
});
test("tp global shows the Pi session id", async () => {
	await withServer(async (server) => {
		const { fake } = await fakeListing(server);
		const result = await listing(server, ["global"]);
		expect(result.stdout).toContain(fake.sessionName);
		expect(result.stdout).toContain("pi:019ff650-ac6d");
	});
});
test("tp all shows the Pi session id", async () => {
	await withServer(async (server) => {
		const { result } = await fakeListing(server);
		const all = await listing(server, ["all"]);
		expect(result.stdout).toContain(
			result.stdout.match(/pi:[^ ]+/)?.[0] ?? "pi:",
		);
	});
});
test("an uncached session still yields an empty suffix", async () => {
	await withServer(async (server) => {
		create(server, `${project}_001`);
		const result = await listing(server);
		expect(result.stdout).toContain(`${project}_001`);
	});
});
test("a duration under an hour reads in minutes", async () => {
	await withServer(async (server) => {
		const { result } = await fakeListing(server, {
			stateSince: Math.floor(Date.now() / 1000) - 187,
		});
		expect(result.stdout).toContain("3m");
	});
});
test("a duration under a minute reads in seconds", async () => {
	await withServer(async (server) => {
		const { fake } = await fakeListing(server, {
			stateSince: Math.floor(Date.now() / 1000) - 4,
		});
		const result = await listing(server, ["ls"], { COLUMNS: "200" });
		expect(result.stdout).toMatch(/\b[4-9]s\b/);
		fake.stop();
	});
});
test("a duration under a day reads in hours", async () => {
	await withServer(async (server) => {
		const { fake } = await fakeListing(server, {
			stateSince: Math.floor(Date.now() / 1000) - 7500,
		});
		const result = await listing(server);
		expect(result.stdout).toContain("2h");
	});
});
test("a long duration reads in days", async () => {
	await withServer(async (server) => {
		const { result } = await fakeListing(
			server,
			{ stateSince: Math.floor(Date.now() / 1000) - 259200 },
			{ COLUMNS: "200" },
		);
		expect(result.stdout).toContain("3d");
	});
});
test("a non-numeric duration is rejected", async () => {
	await withServer(async (server) => {
		const { result } = await fakeListing(server, {
			stateSince: "not-a-number",
		});
		expect(result.exitCode).toBe(0);
		expect(result.stdout).not.toContain("not-a-number");
	});
});
test("state, context and model are separate fields", async () => {
	await withServer(async (server) => {
		const { result } = await fakeListing(server, {
			state: "tool",
			tool: "read",
			ctxPct: 24,
			model: "model",
		});
		expect(result.stdout).toContain("tool:read");
		expect(result.stdout).toContain("24%");
		expect(result.stdout).toContain("model");
	});
});
test("a blocked session names the tool holding it", async () => {
	await withServer(async (server) => {
		const { result } = await fakeListing(server, {
			state: "blocked",
			tool: "bash",
		});
		expect(result.stdout).toContain("blocked:bash");
	});
});
test("context usage is rendered as a percentage", async () => {
	await withServer(async (server) => {
		const { result } = await fakeListing(server, { ctxPct: 61 });
		expect(result.stdout).toContain("61%");
	});
});
test("the model is rendered last", async () => {
	await withServer(async (server) => {
		const { result } = await fakeListing(
			server,
			{ model: "last-model" },
			{ COLUMNS: "200" },
		);
		const line =
			result.stdout.split("\n").find((value) => value.includes("last-model")) ??
			"";
		expect(line).toMatch(/last-model\s*$/);
	});
});
test("an idle session does not name a stale tool", async () => {
	await withServer(async (server) => {
		const { result } = await fakeListing(server, {
			state: "idle",
			tool: "stale",
		});
		expect(result.stdout).toContain("idle");
		expect(result.stdout).not.toContain("idle:stale");
	});
});
test("a thinking session does not name a stale tool", async () => {
	await withServer(async (server) => {
		const { result } = await fakeListing(server, {
			state: "thinking",
			tool: "stale",
		});
		expect(result.stdout).toContain("thinking");
		expect(result.stdout).not.toContain("thinking:stale");
	});
});
test("a session publishing no state renders nothing", async () => {
	await withServer(async (server) => {
		const { fake } = await fakeListing(server);
		setPaneOption(server, fake.sessionName, "@pi_state", "");
		const result = await listing(server);
		expect(result.stdout).not.toContain("blocked");
	});
});
test("a state with no extras is still rendered", async () => {
	await withServer(async (server) => {
		const { result } = await fakeListing(server, {
			state: "idle",
			tool: "",
			model: "",
			ctxPct: "",
		});
		expect(result.stdout).toContain("idle");
	});
});
test("a state with no timestamp omits the age", async () => {
	await withServer(async (server) => {
		const { fake } = await fakeListing(server);
		setPaneOption(server, fake.sessionName, "@pi_state_since", "");
		const result = await listing(server);
		expect(result.stdout).toContain("blocked:bash");
	});
});
test("every field is shown when there is room", async () => {
	await withServer(async (server) => {
		const { result } = await fakeListing(server, {
			ctxPct: 61,
			model: "model",
		});
		expect(result.stdout).toContain("blocked:bash");
		expect(result.stdout).toContain("61%");
		expect(result.stdout).toContain("model");
	});
});
test("a field that exactly fills the line is kept", async () => {
	await withServer(async (server) => {
		const { result } = await fakeListing(
			server,
			{ model: "model" },
			{ COLUMNS: "200" },
		);
		expect(result.stdout).toContain("model");
	});
});
test("a field one column too wide is dropped", async () => {
	await withServer(async (server) => {
		const { result } = await fakeListing(
			server,
			{ model: "model" },
			{ COLUMNS: "65" },
		);
		expect(result.stdout).not.toContain("model");
	});
});
test("no field is shown when the prefix already fills the line", async () => {
	await withServer(async (server) => {
		const { result } = await fakeListing(
			server,
			{ model: "model" },
			{ COLUMNS: "50" },
		);
		expect(result.stdout).not.toContain("blocked");
	});
});
test("a listing shows the label, id and full state together", async () => {
	await withServer(async (server) => {
		const { fake } = await fakeListing(server);
		setSessionLabel(server, fake.sessionName, "labelled");
		const result = await listing(server);
		expect(result.stdout).toContain("[labelled]");
		expect(result.stdout).toContain("pi:019ff650-ac6d");
		expect(result.stdout).toContain("blocked:bash");
	});
});
test("a dead Pi shows neither its id nor its last state", async () => {
	await withServer(async (server) => {
		const { fake } = await fakeListing(server);
		process.kill(fake.pid, "SIGKILL");
		const result = await listing(server);
		expect(result.stdout).not.toContain("pi:");
		expect(result.stdout).not.toContain("blocked");
	});
});
test("a narrow terminal keeps the state and drops the rest", async () => {
	await withServer(async (server) => {
		const { result } = await fakeListing(
			server,
			{ ctxPct: 61, model: "model" },
			{ COLUMNS: "65" },
		);
		expect(result.stdout).toContain("blocked:bash");
		expect(result.stdout).not.toContain("model");
	});
});
test("a state with no identity behind it is not shown", async () => {
	await withServer(async (server) => {
		create(server, `${project}_002`);
		setPaneOption(server, `${project}_002`, "@pi_state", "blocked");
		const result = await listing(server);
		expect(result.stdout).not.toContain("blocked");
	});
});
test("TP_COLOR=never disables colour", async () => {
	await withServer(async (server) => {
		const { result } = await fakeListing(server, {}, { TP_COLOR: "never" });
		expect(result.stdout).not.toContain("\u001b[");
	});
});
test("no escapes are emitted when colour is off", async () => {
	await withServer(async (server) => {
		const { result } = await fakeListing(server, {}, { NO_COLOR: "1" });
		expect(result.stdout).not.toContain("\u001b[");
	});
});
test("TP_COLOR=always keeps colour through a pipe", async () => {
	await withServer(async (server) => {
		const { result } = await fakeListing(server, {}, { TP_COLOR: "always" });
		expect(result.stdout).toContain("\u001b[");
	});
});
test("TP_COLOR=always emits escapes", async () => {
	await withServer(async (server) => {
		const { result } = await fakeListing(server, {}, { TP_COLOR: "always" });
		expect(result.stdout).toContain("\u001b[90m");
	});
});
test("NO_COLOR wins over TP_COLOR=always", async () => {
	await withServer(async (server) => {
		const { result } = await fakeListing(
			server,
			{},
			{ NO_COLOR: "1", TP_COLOR: "always" },
		);
		expect(result.stdout).not.toContain("\u001b[");
	});
});
test("a coloured string measures its visible width", async () => {
	await withServer(async (server) => {
		const { result } = await fakeListing(
			server,
			{ model: "model" },
			{ TP_COLOR: "always", COLUMNS: "65" },
		);
		expect(result.stdout).not.toContain("model");
	});
});
test("an uncoloured string measures the same", async () => {
	await withServer(async (server) => {
		const { result } = await fakeListing(
			server,
			{ model: "model" },
			{ TP_COLOR: "never", COLUMNS: "65" },
		);
		expect(result.stdout).not.toContain("model");
	});
});
test("a character-set reset does not widen a coloured string", async () => {
	await withServer(async (server) => {
		const { result } = await fakeListing(
			server,
			{ model: "model" },
			{ TP_COLOR: "always", COLUMNS: "65" },
		);
		expect(result.stdout).not.toContain("model");
	});
});
test("colour escapes do not consume the width budget", async () => {
	await withServer(async (server) => {
		const { result } = await fakeListing(
			server,
			{ model: "model" },
			{ TP_COLOR: "always", COLUMNS: "200" },
		);
		expect(result.stdout).toContain("model");
	});
});
test("blocked and idle are visually distinct", async () => {
	await withServer(async (server) => {
		const blocked = await fakeListing(server, { state: "blocked" });
		expect(blocked.result.stdout).toContain("⏸ blocked");
		blocked.fake.stop();
		const idle = await fakeListing(server, {
			sessionName: `${project}_003`,
			state: "idle",
		});
		expect(idle.result.stdout).toContain("○ idle");
	});
});
test("a low context percent still reads plainly", async () => {
	await withServer(async (server) => {
		const { result } = await fakeListing(server, { ctxPct: 24 });
		expect(result.stdout).toContain("24%");
	});
});
test("a high context percent still reads plainly", async () => {
	await withServer(async (server) => {
		const { result } = await fakeListing(
			server,
			{ ctxPct: 70 },
			{ COLUMNS: "200" },
		);
		expect(result.stdout).toContain("70%");
	});
});
test("a nearly-full context window is coloured differently", async () => {
	await withServer(async (server) => {
		const { result } = await fakeListing(
			server,
			{ ctxPct: 85 },
			{ TP_COLOR: "always" },
		);
		expect(result.stdout).toContain("\u001b[31m");
	});
});
