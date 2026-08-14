import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { ScratchTmuxServer, repoRoot, runTp, waitFor } from "./harness";

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

test("status counts project and global Pi states", async () => {
	await withServer(async (server) => {
		const blocked = server.createFakePi({
			sessionName: `${project}_001`,
			state: "blocked",
		});
		const busy = server.createFakePi({
			sessionName: `${project}_002`,
			state: "thinking",
		});
		const idle = server.createFakePi({
			sessionName: `${project}_003`,
			state: "idle",
		});
		const other = server.createFakePi({
			sessionName: "other_001",
			state: "idle",
		});
		try {
			waitFor(() =>
				[blocked, busy, idle, other].every(
					(fake) => fake.options()["@pi_state"] !== "",
				),
			);
			const projectStatus = await runTp(["status"], { env: server.env });
			expect(projectStatus).toEqual({
				stdout: "1 blocked · 1 busy · 1 idle\n",
				stderr: "",
				exitCode: 0,
			});
			const globalStatus = await runTp(["status", "-g", "--json"], {
				env: server.env,
			});
			expect(globalStatus.exitCode).toBe(0);
			expect(JSON.parse(globalStatus.stdout)).toEqual({
				blocked: 1,
				busy: 1,
				idle: 2,
				total: 4,
			});
			const tmuxStatus = await runTp(["status", "-g", "--tmux"], {
				env: server.env,
			});
			expect(tmuxStatus.stdout).toBe(
				"#[fg=yellow]⏸1#[default] #[fg=cyan]●1#[default] #[fg=brblack]○2#[default]\n",
			);
		} finally {
			blocked.stop();
			busy.stop();
			idle.stop();
			other.stop();
		}
	});
});

test("status omits zero groups and reports an empty server", async () => {
	await withServer(async (server) => {
		const idle = server.createFakePi({
			sessionName: `${project}_001`,
			state: "idle",
		});
		try {
			waitFor(() => idle.options()["@pi_state"] === "idle");
			const status = await runTp(["status"], { env: server.env });
			expect(status.stdout).toBe("1 idle\n");
		} finally {
			idle.stop();
		}
		const empty = await runTp(["status", "--json"], { env: server.env });
		expect(empty.stdout).toBe('{"blocked":0,"busy":0,"idle":0,"total":0}\n');
		const emptyTmux = await runTp(["status", "--tmux"], { env: server.env });
		expect(emptyTmux.stdout).toBe("no sessions\n");
	});
});

test("blocked attaches the only project match", async () => {
	await withServer(async (server) => {
		const blocked = server.createFakePi({
			sessionName: `${project}_001`,
			state: "blocked",
		});
		const resultPath = join(server.root, "attach-result");
		const codePath = join(server.root, "attach-code");
		try {
			waitFor(() => blocked.options()["@pi_state"] === "blocked");
			const runner = `
${process.execPath} ${join(repoRoot, "src/bin/tp.ts")} b > ${resultPath}
code=$?
printf '%s' "$code" > ${codePath}
tmux -L ${server.socket} detach-client
`;
			server.run([
				"new-session",
				"-d",
				"-s",
				"b-runner",
				"-e",
				`TP_TMUX_SOCKET=${server.socket}`,
				"--",
				"/bin/sh",
				"-c",
				runner,
			]);
			const command = `TERM=xterm tmux -L ${server.socket} -f /dev/null attach-session -t =b-runner`;
			const pty =
				process.platform === "darwin"
					? [
							"/usr/bin/script",
							"-q",
							join(server.root, "attach-log"),
							"/bin/sh",
							"-c",
							command,
						]
					: [
							"/usr/bin/script",
							"-qefc",
							command,
							join(server.root, "attach-log"),
						];
			const child = Bun.spawn(pty, {
				env: { ...process.env, ...server.env },
				stdout: "pipe",
				stderr: "pipe",
			});
			await child.exited;
			waitFor(() => existsSync(codePath));
			expect(readFileSync(codePath, "utf8")).toBe("0");
			expect(readFileSync(resultPath, "utf8")).toBe("");
		} finally {
			blocked.stop();
			server.run(["kill-session", "-t", "=b-runner"], true);
		}
	});
});

test("blocked sessions list when more than one matches and report none", async () => {
	await withServer(async (server) => {
		const first = server.createFakePi({
			sessionName: `${project}_001`,
			state: "blocked",
		});
		const second = server.createFakePi({
			sessionName: `${project}_002`,
			state: "blocked",
		});
		const other = server.createFakePi({
			sessionName: "other_001",
			state: "blocked",
		});
		try {
			waitFor(() =>
				[first, second, other].every(
					(fake) => fake.options()["@pi_state"] === "blocked",
				),
			);
			const many = await runTp(["b"], { env: server.env });
			expect(many.exitCode).toBe(1);
			expect(many.stdout).toContain(`${project}_001`);
			expect(many.stdout).toContain(`${project}_002`);
			expect(many.stdout).not.toContain("other_001");
			const globalMany = await runTp(["b", "-g"], { env: server.env });
			expect(globalMany.exitCode).toBe(1);
			expect(globalMany.stdout).toContain("other_001");
		} finally {
			first.stop();
			second.stop();
			other.stop();
		}
		const none = await runTp(["b", "-g"], { env: server.env });
		expect(none.exitCode).toBe(1);
		expect(none.stderr).toContain("nothing blocked");
	});
});

test("watch needs a terminal when invoked through pipes", async () => {
	const server = new ScratchTmuxServer();
	server.start();
	try {
		const result = await runTp(["w"], { env: server.env });
		expect(result).toEqual({
			stdout: "",
			stderr: "watch needs a terminal\n",
			exitCode: 2,
		});
	} finally {
		server.teardown();
	}
});

test("SIGINT during watch restores terminal modes", async () => {
	await withServer(async (server) => {
		const fake = server.createFakePi({
			sessionName: `${project}_001`,
			state: "idle",
		});
		const before = join(server.root, "sigint-before");
		const after = join(server.root, "sigint-after");
		const pidPath = join(server.root, "sigint-pid");
		try {
			waitFor(() => fake.options()["@pi_state"] === "idle");
			const script = `stty -g > ${before}; ${process.execPath} ${join(repoRoot, "src/bin/tp.ts")} w & child=$!; printf '%s' "$child" > ${pidPath}; wait "$child"; code=$?; stty -g > ${after}; exit $code`;
			server.run([
				"new-session",
				"-d",
				"-s",
				"sigint-watcher",
				"-e",
				`TP_TMUX_SOCKET=${server.socket}`,
				"--",
				"/bin/sh",
				"-c",
				script,
			]);
			waitFor(() => existsSync(pidPath));
			const watcherPid = Number(readFileSync(pidPath, "utf8"));
			try {
				process.kill(watcherPid, "SIGINT");
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
			}
			waitFor(
				() =>
					server.run(["has-session", "-t", "=sigint-watcher"], true)
						.exitCode !== 0,
				200,
				25,
			);
			expect(await Bun.file(before).text()).toBe(await Bun.file(after).text());
		} finally {
			fake.stop();
			server.run(["kill-session", "-t", "=sigint-watcher"], true);
		}
	});
});

test("SIGTERM during watch restores terminal modes", async () => {
	await withServer(async (server) => {
		const fake = server.createFakePi({
			sessionName: `${project}_001`,
			state: "idle",
		});
		const before = join(server.root, "sigterm-before");
		const after = join(server.root, "sigterm-after");
		const pidPath = join(server.root, "sigterm-pid");
		try {
			waitFor(() => fake.options()["@pi_state"] === "idle");
			const script = `stty -g > ${before}; ${process.execPath} ${join(repoRoot, "src/bin/tp.ts")} w & child=$!; printf '%s' "$child" > ${pidPath}; wait "$child"; code=$?; stty -g > ${after}; exit $code`;
			server.run([
				"new-session",
				"-d",
				"-s",
				"sigterm-watcher",
				"-e",
				`TP_TMUX_SOCKET=${server.socket}`,
				"--",
				"/bin/sh",
				"-c",
				script,
			]);
			waitFor(() => existsSync(pidPath));
			const watcherPid = Number(readFileSync(pidPath, "utf8"));
			try {
				process.kill(watcherPid, "SIGTERM");
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
			}
			waitFor(
				() =>
					server.run(["has-session", "-t", "=sigterm-watcher"], true)
						.exitCode !== 0,
				200,
				25,
			);
			expect(await Bun.file(before).text()).toBe(await Bun.file(after).text());
		} finally {
			fake.stop();
			server.run(["kill-session", "-t", "=sigterm-watcher"], true);
		}
	});
});

test("watch redraws after a state change and exits on a key", async () => {
	await withServer(async (server) => {
		const fake = server.createFakePi({
			sessionName: `${project}_001`,
			state: "idle",
		});
		const before = join(server.root, "stty-before");
		const after = join(server.root, "stty-after");
		try {
			waitFor(() => fake.options()["@pi_state"] === "idle");
			const script = `stty -g > ${before}; ${process.execPath} ${join(repoRoot, "src/bin/tp.ts")} w; code=$?; stty -g > ${after}; exit $code`;
			server.run([
				"new-session",
				"-d",
				"-s",
				"watcher",
				"-e",
				`TP_TMUX_SOCKET=${server.socket}`,
				"--",
				"/bin/sh",
				"-c",
				script,
			]);
			waitFor(
				() =>
					server
						.run(["capture-pane", "-e", "-p", "-t", "watcher:0.0"], true)
						.stdout.includes("idle"),
				200,
				25,
			);
			const first = server.run([
				"capture-pane",
				"-e",
				"-p",
				"-t",
				"watcher:0.0",
			]).stdout;
			server.run([
				"set-option",
				"-p",
				"-t",
				fake.paneId,
				"@pi_state",
				"blocked",
			]);
			waitFor(
				() =>
					server
						.run(["capture-pane", "-e", "-p", "-t", "watcher:0.0"], true)
						.stdout.includes("blocked"),
				200,
				25,
			);
			const second = server.run([
				"capture-pane",
				"-e",
				"-p",
				"-t",
				"watcher:0.0",
			]).stdout;
			expect(second).not.toBe(first);
			server.run(["send-keys", "-t", "watcher:0.0", "q"]);
			waitFor(
				() =>
					server.run(["has-session", "-t", "=watcher"], true).exitCode !== 0,
				200,
				25,
			);
			expect(await Bun.file(before).text()).toBe(await Bun.file(after).text());
		} finally {
			fake.stop();
			server.run(["kill-session", "-t", "=watcher"], true);
		}
	});
});
