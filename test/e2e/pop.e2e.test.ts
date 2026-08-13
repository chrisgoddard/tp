import { expect, test } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { ptyCommand } from "./fixtures/pty";
import { ScratchTmuxServer, repoRoot, runTp, waitFor } from "./harness";

const tpEntry = join(repoRoot, "src/bin/tp.ts");

async function runPty(
	command: string,
	env: Record<string, string | undefined>,
	input: string,
	onStarted?: () => void,
	onReady?: () => void,
): Promise<string> {
	const logPath = join(repoRoot, `.pop-${process.pid}-${Date.now()}.log`);
	const child = Bun.spawn(ptyCommand(logPath, command), {
		cwd: repoRoot,
		env: { ...process.env, ...env },
		stdin: "pipe",
		stdout: "pipe",
		stderr: "pipe",
	});
	await new Promise((resolve) => setTimeout(resolve, 2500));
	onStarted?.();
	child.stdin?.write(input);
	if (onReady) {
		await new Promise((resolve) => setTimeout(resolve, 1000));
		onReady();
		child.kill();
	}
	await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	const output = readFileSync(logPath, "utf8");
	rmSync(logPath, { force: true });
	return output;
}

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", `\\'"'"'`)}'`;
}

async function runInsidePicker(
	server: ScratchTmuxServer,
	input: string,
): Promise<{
	log: string;
	clientSession: string;
	exitCode: number;
	before: string;
	after: string;
}> {
	const beforePath = join(server.root, `before-${Date.now()}`);
	const afterPath = join(server.root, `after-${Date.now()}`);
	const codePath = join(server.root, `code-${Date.now()}`);
	let clientSession = "";
	let initialSession = "";
	const script = [
		"sleep 1",
		`stty -g > ${shellQuote(beforePath)}`,
		`${shellQuote(process.execPath)} ${shellQuote(tpEntry)} pop`,
		"code=$?",
		`stty -g > ${shellQuote(afterPath)}`,
		`printf '%s' \"$code\" > ${shellQuote(codePath)}`,
		"exit 0",
	].join("; ");
	server.run([
		"new-session",
		"-d",
		"-s",
		"pop-runner",
		"-e",
		`TP_TMUX_SOCKET=${server.socket}`,
		"--",
		"/bin/sh",
		"-c",
		script,
	]);
	const command = `env -u TMUX -u TMUX_PANE TERM=xterm tmux -L ${shellQuote(server.socket)} -f /dev/null attach-session -t =pop-runner`;
	const currentClient = (): string =>
		server.run(["list-clients", "-F", "#{client_session}"], true).stdout.trim();
	const log = await runPty(
		command,
		server.env,
		input,
		() => {
			initialSession = currentClient();
		},
		() => {
			clientSession = currentClient() || initialSession;
			server.run(["detach-client", "-a"], true);
		},
	);
	waitFor(() => existsSync(beforePath));
	waitFor(() => existsSync(afterPath));
	waitFor(() => existsSync(codePath));
	return {
		log,
		clientSession,
		exitCode: Number(readFileSync(codePath, "utf8")),
		before: readFileSync(beforePath, "utf8"),
		after: readFileSync(afterPath, "utf8"),
	};
}

async function withServer(
	callback: (server: ScratchTmuxServer) => Promise<void>,
): Promise<void> {
	const server = new ScratchTmuxServer();
	server.start();
	try {
		await callback(server);
	} finally {
		server.teardown();
	}
}

test("pop filters and switches the tmux client to the selected session", async () => {
	await withServer(async (server) => {
		server.run(["new-session", "-d", "-s", "alpha_001", "--", "sleep", "30"]);
		server.run(["new-session", "-d", "-s", "beta_002", "--", "sleep", "30"]);
		const result = await runInsidePicker(server, "beta\r");
		expect(result.clientSession).toBe("beta_002");
		expect(result.before).toBe(result.after);
	});
}, 15000);

test("pop Esc leaves the active tmux session unchanged", async () => {
	await withServer(async (server) => {
		server.run(["new-session", "-d", "-s", "alpha_001", "--", "sleep", "30"]);
		server.run(["new-session", "-d", "-s", "beta_002", "--", "sleep", "30"]);
		const result = await runInsidePicker(server, "\u001b");
		expect(result.clientSession).toBe("pop-runner");
		expect(result.before).toBe(result.after);
	});
}, 15000);

test("pop q exits successfully without switching or changing terminal modes", async () => {
	await withServer(async (server) => {
		server.run(["new-session", "-d", "-s", "alpha_001", "--", "sleep", "30"]);
		const result = await runInsidePicker(server, "q");
		expect(result.exitCode).toBe(0);
		expect(result.clientSession).toBe("pop-runner");
		expect(result.before).toBe(result.after);
	});
}, 15000);

test("pop ctrl-c restores terminal modes without switching", async () => {
	await withServer(async (server) => {
		server.run(["new-session", "-d", "-s", "alpha_001", "--", "sleep", "30"]);
		const result = await runInsidePicker(server, "\u0003");
		expect(result.clientSession).toBe("pop-runner");
		expect(result.before).toBe(result.after);
	});
}, 15000);

test("pop puts blocked sessions before recent idle sessions", async () => {
	await withServer(async (server) => {
		const idle = server.createFakePi({
			sessionName: "idle_001",
			state: "idle",
		});
		const blocked = server.createFakePi({
			sessionName: "blocked_002",
			state: "blocked",
		});
		try {
			waitFor(
				() =>
					idle.options()["@pi_state"] === "idle" &&
					blocked.options()["@pi_state"] === "blocked",
			);
			const result = await runInsidePicker(server, "\u001b");
			const blockedAt = result.log.indexOf("blocked_002");
			const idleAt = result.log.indexOf("idle_001");
			expect(blockedAt).toBeGreaterThanOrEqual(0);
			expect(idleAt).toBeGreaterThan(blockedAt);
			expect(result.before).toBe(result.after);
		} finally {
			idle.stop();
			blocked.stop();
		}
	});
}, 15000);

test("pop reports an unsupported tmux version", async () => {
	const server = new ScratchTmuxServer();
	server.start();
	const directory = join(server.root, "old-tmux");
	const root = join(directory, "tmux");
	mkdirSync(directory, { recursive: true });
	writeFileSync(root, `#!/bin/sh\nprintf 'tmux 3.1\\n'\n`);
	chmodSync(root, 0o755);
	try {
		const result = await runTp(["pop"], {
			env: {
				...server.env,
				PATH: `${directory}:${process.env.PATH ?? ""}`,
			},
		});
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("tp pop requires tmux >= 3.2");
	} finally {
		server.teardown();
	}
});
