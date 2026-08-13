import { expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { FakeCmuxSocket } from "./fixtures/cmux-socket";
import { ScratchTmuxServer, runTp } from "./harness";

function makeSessions(
	server: ScratchTmuxServer,
	entries: readonly { name: string; label?: string }[],
): void {
	const cwd = join(server.root, "project");
	mkdirSync(cwd, { recursive: true });
	for (const entry of entries) {
		server.run([
			"new-session",
			"-d",
			"-s",
			entry.name,
			"-c",
			cwd,
			"sleep",
			"30",
		]);
		if (entry.label)
			server.run(["set-option", "-t", entry.name, "@tp_name", entry.label]);
	}
}

async function runCmux(
	server: ScratchTmuxServer,
	cmux: FakeCmuxSocket,
	selector?: string,
) {
	return runTp(selector ? ["cmux", selector] : ["cmux"], {
		env: { ...server.env, CMUX_SOCKET_PATH: cmux.path },
	});
}

test("tp cmux lists global tp sessions and marks open workspaces", async () => {
	const server = new ScratchTmuxServer();
	const cmux = new FakeCmuxSocket([
		{ title: "tp:alpha_001", ref: "workspace:7" },
	]);
	server.start();
	cmux.start();
	try {
		makeSessions(server, [
			{ name: "alpha_001", label: "api" },
			{ name: "alpha_002" },
		]);
		const result = await runCmux(server, cmux);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("All tp sessions:");
		expect(result.stdout).toContain("alpha_001 [api] (open in cmux)");
		expect(result.stdout).toContain("alpha_002");
		expect(result.stdout).toContain("Open with: tp c <index|prefix>");
		expect(cmux.requests.map((request) => request.method)).toEqual([
			"system.ping",
			"workspace.list",
		]);
	} finally {
		cmux.stop();
		server.teardown();
	}
});

test("tp cmux focuses an existing workspace", async () => {
	const server = new ScratchTmuxServer();
	const cmux = new FakeCmuxSocket([
		{ title: "tp:alpha_001", ref: "workspace:4" },
	]);
	server.start();
	cmux.start();
	try {
		makeSessions(server, [{ name: "alpha_001" }]);
		const result = await runCmux(server, cmux, "1");
		expect(result).toMatchObject({
			exitCode: 0,
			stdout: "Focused cmux workspace for alpha_001\n",
		});
		expect(cmux.requests.map((request) => request.method)).toEqual([
			"system.ping",
			"workspace.list",
			"workspace.select",
		]);
		expect(cmux.requests[2]?.params).toEqual({ workspace_id: "workspace:4" });
	} finally {
		cmux.stop();
		server.teardown();
	}
});

test("tp cmux opens a new workspace and starts the tmux session", async () => {
	const server = new ScratchTmuxServer();
	const cmux = new FakeCmuxSocket();
	server.start();
	cmux.start();
	try {
		makeSessions(server, [{ name: "alpha_001" }]);
		const result = await runCmux(server, cmux, "1");
		expect(result).toMatchObject({
			exitCode: 0,
			stdout: "Opened alpha_001 in cmux\n",
		});

		const create = cmux.requests.find(
			(request) => request.method === "workspace.create",
		);
		expect(create?.params).toMatchObject({
			title: "tp:alpha_001",
			workspace_env: { TP_CMUX_SESSION: "alpha_001" },
		});
		expect(cmux.requests.map((request) => request.method)).toEqual([
			"system.ping",
			"workspace.list",
			"workspace.create",
			"surface.send_text",
		]);
		expect(cmux.requests[3]?.params).toMatchObject({
			workspace_id: "workspace:1",
			text: 'exec tmux attach-session -t "=$TP_CMUX_SESSION"\n',
		});
	} finally {
		cmux.stop();
		server.teardown();
	}
});

test("tp cmux reports workspace protocol failures with the session", async () => {
	const server = new ScratchTmuxServer();
	const cmux = new FakeCmuxSocket([], {
		failure: { method: "workspace.create", response: "error" },
	});
	server.start();
	cmux.start();
	try {
		makeSessions(server, [{ name: "alpha_001" }]);
		const result = await runCmux(server, cmux, "1");
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain(
			"cmux workspace.create failed for session 'alpha_001': fixture rejected request",
		);
	} finally {
		cmux.stop();
		server.teardown();
	}
});

test("tp cmux opens sessions matching a name prefix", async () => {
	const server = new ScratchTmuxServer();
	const cmux = new FakeCmuxSocket();
	server.start();
	cmux.start();
	try {
		makeSessions(server, [
			{ name: "alpha_001" },
			{ name: "alpha_002" },
			{ name: "beta_001" },
		]);
		const result = await runCmux(server, cmux, "alpha");
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("Opened alpha_001 in cmux");
		expect(result.stdout).toContain("Opened alpha_002 in cmux");
		expect(result.stdout).not.toContain("beta_001");
		expect(
			cmux.requests.filter((request) => request.method === "workspace.create"),
		).toHaveLength(2);
	} finally {
		cmux.stop();
		server.teardown();
	}
});

test("tp cmux all opens new sessions and focuses existing ones", async () => {
	const server = new ScratchTmuxServer();
	const cmux = new FakeCmuxSocket([
		{ title: "tp:alpha_001", ref: "workspace:9" },
	]);
	server.start();
	cmux.start();
	try {
		makeSessions(server, [{ name: "alpha_001" }, { name: "beta_001" }]);
		const result = await runCmux(server, cmux, "all");
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("Focused cmux workspace for alpha_001");
		expect(result.stdout).toContain("Opened beta_001 in cmux");
		expect(
			cmux.requests.some(
				(request) =>
					request.method === "workspace.select" &&
					request.params.workspace_id === "workspace:9",
			),
		).toBe(true);
	} finally {
		cmux.stop();
		server.teardown();
	}
});

test("tp cmux gives socket automation guidance when the socket is missing", async () => {
	const server = new ScratchTmuxServer();
	const cmux = new FakeCmuxSocket();
	server.start();
	try {
		makeSessions(server, [{ name: "alpha_001" }]);
		const result = await runTp(["cmux"], {
			env: {
				...server.env,
				CMUX_SOCKET_PATH: join(server.root, "missing.sock"),
			},
		});
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain(
			"Cannot connect to cmux. Run this inside a cmux terminal, or enable",
		);
		expect(result.stderr).toContain(
			"Settings → Automation → Socket Control Mode → Automation.",
		);
	} finally {
		cmux.stop();
		server.teardown();
	}
});

test("tp cmux gives socket automation guidance when the socket refuses requests", async () => {
	const server = new ScratchTmuxServer();
	const cmux = new FakeCmuxSocket([], { rejectRequests: true });
	server.start();
	cmux.start();
	try {
		makeSessions(server, [{ name: "alpha_001" }]);
		const result = await runTp(["cmux"], {
			env: { ...server.env, CMUX_SOCKET_PATH: cmux.path },
		});
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Cannot connect to cmux");
		expect(result.stderr).toContain(
			"Settings → Automation → Socket Control Mode → Automation.",
		);
	} finally {
		server.teardown();
	}
});
