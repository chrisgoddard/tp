import { afterAll, beforeAll, expect, test } from "bun:test";
import { decodePaneOptions } from "../../src/lib/pi";
import {
	ScratchTmuxServer,
	createStubKit,
	runStub,
	runTp,
	runTpShot,
	waitFor,
} from "./harness";

let suiteServer: ScratchTmuxServer;

beforeAll(() => {
	suiteServer = new ScratchTmuxServer();
	suiteServer.start();
});

afterAll(() => {
	suiteServer.teardown();
});

test("runTp and runTpShot capture each stream and exit code", async () => {
	const tp = await runTp(["--version"]);
	expect(tp).toEqual({ stdout: "tp 0.2.0\n", stderr: "", exitCode: 0 });
	const shot = await runTpShot(["--version"]);
	expect(shot).toEqual({ stdout: "tp-shot 0.2.0\n", stderr: "", exitCode: 0 });
});

test("scratch tmux servers use unique parallel-safe sockets", () => {
	const first = new ScratchTmuxServer();
	const second = new ScratchTmuxServer();
	try {
		expect(first.socket).not.toBe(second.socket);
		expect(first.socket).toMatch(new RegExp(`^tp-test-${process.pid}-`));
		expect(second.socket).toMatch(new RegExp(`^tp-test-${process.pid}-`));
	} finally {
		first.teardown();
		second.teardown();
	}
});

test("scratch tmux teardown kills the server and removes its socket", () => {
	const server = new ScratchTmuxServer();
	server.start();
	expect(server.isRunning()).toBe(false);
	server.run(["new-session", "-d", "-s", "teardown-check", "sleep", "30"]);
	expect(server.isRunning()).toBe(true);
	server.teardown();
	expect(server.isRunning()).toBe(false);
	expect(server.socketExists()).toBe(false);
	// `isRunning()` queries only this isolated socket, so a true value here
	// would prove that a stray server survived teardown.
});

test("fake Pi publishes pane options and dead pids hide all Pi state", () => {
	const fake = suiteServer.createFakePi({
		state: "thinking",
		tool: "bash",
		ctxPct: 91,
	});
	try {
		waitFor(() => fake.options()["@pi_session_id"] !== "");
		const published = fake.options();
		expect(published).toEqual(
			expect.objectContaining({
				"@pi_session_id": "019ff650-ac6d-7641-bb90-4475b973cc82",
				"@pi_pid": String(fake.pid),
				"@pi_state": "thinking",
				"@pi_tool": "bash",
				"@pi_state_since": expect.any(String),
				"@pi_ctx_pct": "91",
				"@pi_model": "test-model",
			}),
		);
		expect(decodePaneOptions(published)).toMatchObject({
			sessionId: "019ff650-ac6d-7641-bb90-4475b973cc82",
			state: "thinking",
			ctxPct: 91,
		});
		process.kill(fake.pid, "SIGKILL");
		waitFor(() => decodePaneOptions(fake.options()) === null);
		expect(decodePaneOptions(fake.options())).toBeNull();
	} finally {
		fake.stop();
	}
});

test("PATH stubs record argv and stdin for every integration dependency", () => {
	const kit = createStubKit();
	try {
		for (const command of [
			"ssh",
			"scp",
			"screencapture",
			"pbcopy",
			"osascript",
			"terminal-notifier",
			"tailscale",
			"nohup",
			"uuidgen",
		]) {
			expect(
				runStub(kit, command, ["--flag", command], `input for ${command}`),
			).toMatchObject({
				exitCode: 0,
			});
		}
		expect(kit.readInvocations()).toEqual(
			[
				"ssh",
				"scp",
				"screencapture",
				"pbcopy",
				"osascript",
				"terminal-notifier",
				"tailscale",
				"nohup",
				"uuidgen",
			].map((command) => ({
				command,
				argv: ["--flag", command],
				stdin: `input for ${command}`,
			})),
		);
	} finally {
		kit.cleanup();
	}
});
