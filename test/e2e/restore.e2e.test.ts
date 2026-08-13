import { expect, test } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { ScratchTmuxServer, runTp, waitFor } from "./harness";

const SESSION_ID = "019ff650-ac6d-7641-bb90-4475b973cc82";

function piSessionDirectory(agent: string, cwd: string): string {
	const safe = cwd.replace(/^\/+/, "").replaceAll("/", "-");
	return join(agent, "sessions", `--${safe}--`);
}

test("tp ls snapshots sessions and restore recreates and resumes them", async () => {
	const root = mkdtempSync(join(tmpdir(), "tp-restore-project-"));
	const state = mkdtempSync(join(tmpdir(), "tp-restore-state-"));
	const agent = mkdtempSync(join(tmpdir(), "tp-restore-agent-"));
	const fakeBin = mkdtempSync(join(tmpdir(), "tp-restore-bin-"));
	const invocationLog = join(fakeBin, "invocations.log");
	const fakePi = join(fakeBin, "pi");
	writeFileSync(
		fakePi,
		`#!/bin/sh\nprintf '%s\\n' "$*" >> "${invocationLog}"\nsleep 30\n`,
	);
	chmodSync(fakePi, 0o755);
	const expectedCwd = process.cwd();
	const sessionFileDirectory = piSessionDirectory(agent, expectedCwd);
	mkdirSync(sessionFileDirectory, { recursive: true });
	writeFileSync(
		join(sessionFileDirectory, `saved_${SESSION_ID}.jsonl`),
		"{}\n",
	);

	const server = new ScratchTmuxServer({ root });
	let serverStopped = false;
	let fresh: ScratchTmuxServer | undefined;
	let freshStopped = false;
	server.start();
	const project = basename(root);
	const env = {
		...server.env,
		XDG_STATE_HOME: state,
		PI_CODING_AGENT_DIR: agent,
		TMUX: undefined,
		TMUX_PANE: undefined,
	};
	const names = [1, 2, 3].map(
		(number) => `${project}_${String(number).padStart(3, "0")}`,
	);
	const fakeTwo = server.createFakePi({
		sessionName: names[1],
		sessionId: SESSION_ID,
	});
	const missingId = "019ff650-6d6d-7641-bb90-4475b973cc82";
	const fakeThree = server.createFakePi({
		sessionName: names[2],
		sessionId: missingId,
	});
	server.run(["new-session", "-d", "-s", names[0]]);
	for (const [name, label] of [
		[names[0], "shell"],
		[names[1], "resume me"],
		[names[2], "missing file"],
	] as const)
		server.run(["set-option", "-t", name, "@tp_name", label]);
	server.run([
		"set-environment",
		"-t",
		`=${names[1]}`,
		"TP_CMD",
		`${fakePi} --resume --model test-model`,
	]);
	server.run([
		"set-environment",
		"-t",
		`=${names[2]}`,
		"TP_CMD",
		`${fakePi} --continue`,
	]);
	try {
		waitFor(() => fakeTwo.options()["@pi_session_id"] === SESSION_ID);
		waitFor(() => fakeThree.options()["@pi_session_id"] === missingId);
		const listing = await runTp(["ls"], { cwd: root, env });
		expect(listing.exitCode).toBe(0);
		const snapshotPath = join(state, "tp", "sessions.json");
		const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as Array<{
			session: string;
			label: string | null;
			cwd: string | null;
			tpCmd: string | null;
		}>;
		expect(snapshot).toHaveLength(3);
		expect(snapshot.map((entry) => entry.session)).toEqual(names);
		expect(snapshot.every((entry) => entry.cwd === expectedCwd)).toBe(true);
		expect(snapshot.find((entry) => entry.session === names[1])?.tpCmd).toBe(
			`${fakePi} --resume --model test-model`,
		);

		server.teardown();
		serverStopped = true;
		mkdirSync(root, { recursive: true });
		fresh = new ScratchTmuxServer({ root });
		fresh.start();
		fresh.run(["new-session", "-d", "-s", names[0]]);
		fresh.run(["set-option", "-t", names[0], "@tp_name", "keep me"]);
		const listBefore = fresh.run([
			"list-sessions",
			"-F",
			"#{session_name}",
		]).stdout;
		const listed = await runTp(["restore", "--list"], {
			cwd: root,
			env: { ...env, ...fresh.env },
		});
		expect(listed.exitCode).toBe(0);
		expect(JSON.parse(listed.stdout)).toHaveLength(3);
		expect(fresh.run(["list-sessions", "-F", "#{session_name}"]).stdout).toBe(
			listBefore,
		);

		const restored = await runTp(["restore"], {
			cwd: root,
			env: { ...env, ...fresh.env },
		});
		expect(restored.exitCode).toBe(0);
		expect(restored.stdout).toContain(`exists\t${names[0]}`);
		expect(restored.stdout).toContain(`resumed\t${names[1]}`);
		expect(restored.stdout).toContain(`no-session-file\t${names[2]}`);
		const restoredListing = fresh.run([
			"list-sessions",
			"-F",
			"#{session_name}:#{session_path}:#{@tp_name}",
		]).stdout;
		expect(restoredListing).toContain(`${names[1]}:${expectedCwd}:resume me`);
		expect(restoredListing).toContain(
			`${names[2]}:${expectedCwd}:missing file`,
		);
		waitFor(() =>
			readFileSync(invocationLog, "utf8").includes("--model test-model"),
		);
		expect(readFileSync(invocationLog, "utf8")).toContain(
			`--model test-model --session ${join(sessionFileDirectory, `saved_${SESSION_ID}.jsonl`)}`,
		);
		fresh.teardown();
		freshStopped = true;
	} finally {
		if (!serverStopped) server.teardown();
		if (fresh && !freshStopped) fresh.teardown();
		rmSync(state, { recursive: true, force: true });
		rmSync(agent, { recursive: true, force: true });
		rmSync(fakeBin, { recursive: true, force: true });
		rmSync(root, { recursive: true, force: true });
	}
});

test("snapshot replacement never exposes partial JSON", async () => {
	const state = mkdtempSync(join(tmpdir(), "tp-restore-atomic-"));
	const previous = process.env.XDG_STATE_HOME;
	process.env.XDG_STATE_HOME = state;
	const path = join(state, "tp", "sessions.json");
	mkdirSync(join(state, "tp"), { recursive: true });
	writeFileSync(path, '[{"session":"old_001"}]\n');
	const modulePath = join(process.cwd(), "src/lib/snapshot.ts");
	const writer = Bun.spawn(
		[
			process.execPath,
			"-e",
			`import { recordSessionsSnapshot } from ${JSON.stringify(modulePath)}; for (let i = 0; i < 1000; i++) recordSessionsSnapshot([{ name: "unmanaged", attached: false, pi: null }]);`,
		],
		{
			env: { ...process.env, XDG_STATE_HOME: state },
			stdout: "ignore",
			stderr: "ignore",
		},
	);
	let parseFailure: unknown;
	try {
		for (let attempt = 0; attempt < 2000; attempt += 1) {
			if (!existsSync(path)) continue;
			try {
				const value = JSON.parse(readFileSync(path, "utf8"));
				if (!Array.isArray(value)) parseFailure = value;
			} catch (error) {
				parseFailure = error;
				break;
			}
		}
		await writer.exited;
		expect(parseFailure).toBeUndefined();
		expect(Array.isArray(JSON.parse(readFileSync(path, "utf8")))).toBe(true);
	} finally {
		if (previous === undefined) process.env.XDG_STATE_HOME = undefined;
		else process.env.XDG_STATE_HOME = previous;
		rmSync(state, { recursive: true, force: true });
	}
});
