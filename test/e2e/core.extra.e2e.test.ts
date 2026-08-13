import { expect, test } from "bun:test";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { ScratchTmuxServer, repoRoot, runTp } from "./harness";

function mergedEnvironment(
	env: Record<string, string | undefined>,
): Record<string, string> {
	const result: Record<string, string> = {};
	for (const [key, value] of Object.entries(process.env))
		if (value !== undefined) result[key] = value;
	for (const [key, value] of Object.entries(env)) {
		if (value === undefined) delete result[key];
		else result[key] = value;
	}
	return result;
}

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", `\'"\'"\'`)}'`;
}

async function runTpWithTty(
	args: readonly string[],
	env: Record<string, string | undefined>,
	input: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	const command = [process.execPath, join(repoRoot, "src/bin/tp.ts"), ...args]
		.map(shellQuote)
		.join(" ");
	const child = Bun.spawn(["script", "-qefc", command, "/dev/null"], {
		cwd: repoRoot,
		env: mergedEnvironment({ ...env, TMUX: undefined, TMUX_PANE: undefined }),
		stdin: "pipe",
		stdout: "pipe",
		stderr: "pipe",
	});
	child.stdin?.write(input);
	child.stdin?.end();
	const stdout = await new Response(child.stdout).text();
	const stderr = await new Response(child.stderr).text();
	return { stdout, stderr, exitCode: await child.exited };
}

function projectSession(server: ScratchTmuxServer, number: number): string {
	const name = `${basename(repoRoot)}_${String(number).padStart(3, "0")}`;
	server.run(["new-session", "-d", "-s", name]);
	return name;
}

function shellFixture(): { shell: string; log: string; root: string } {
	const root = mkdtempSync(join(tmpdir(), "tp-shell-"));
	const log = join(root, "shell.log");
	const shell = join(root, "custom-shell");
	writeFileSync(
		shell,
		`#!/bin/sh\nprintf '%s\\n' custom-shell >> ${shellQuote(log)}\nexec /bin/sh -c "$2"\n`,
	);
	chmodSync(shell, 0o755);
	return { shell, log, root };
}

test("kill confirmation accepts y on a TTY", async () => {
	const server = new ScratchTmuxServer();
	server.start();
	try {
		projectSession(server, 1);
		const result = await runTpWithTty(["kill"], server.env, "y\n");
		expect(result.exitCode).toBe(0);
		expect(server.run(["list-sessions"], true).exitCode).not.toBe(0);
		expect(result.stderr + result.stdout).toContain("Kill 1 sessions");
	} finally {
		server.teardown();
	}
});

test("kill confirmation keeps sessions on TTY default N", async () => {
	const server = new ScratchTmuxServer();
	server.start();
	try {
		const name = projectSession(server, 1);
		const result = await runTpWithTty(["kill"], server.env, "n\n");
		expect(result.exitCode).toBe(0);
		expect(server.run(["has-session", "-t", `=${name}`], true).exitCode).toBe(
			0,
		);
	} finally {
		server.teardown();
	}
});

test("kill --force skips confirmation", async () => {
	const server = new ScratchTmuxServer();
	server.start();
	try {
		projectSession(server, 1);
		const result = await runTp(["kill", "--force"], {
			env: { ...server.env, TMUX: undefined, TMUX_PANE: undefined },
		});
		expect(result.exitCode).toBe(0);
	} finally {
		server.teardown();
	}
});

test("bare kill without a TTY exits 2", async () => {
	const server = new ScratchTmuxServer();
	server.start();
	try {
		projectSession(server, 1);
		const result = await runTp(["kill"], {
			env: { ...server.env, TMUX: undefined, TMUX_PANE: undefined },
		});
		expect(result.exitCode).toBe(2);
	} finally {
		server.teardown();
	}
});

for (const [name, extraEnv] of [
	["TP_SHELL override", {}],
	["$SHELL default", { SHELL: "/bin/sh" }],
] as const) {
	test(`${name} selects the configured command shell`, async () => {
		const fixture = shellFixture();
		try {
			const result = await runTp(["new", "--", "printf", "shell-ok"], {
				env: {
					...extraEnv,
					TMUX: undefined,
					TMUX_PANE: undefined,
					TP_SHELL: name === "TP_SHELL override" ? fixture.shell : undefined,
				},
			});
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("shell-ok");
			if (name === "TP_SHELL override")
				expect(await Bun.file(fixture.log).text()).toContain("custom-shell");
		} finally {
			rmSync(fixture.root, { recursive: true, force: true });
		}
	});
}

test("config shell overrides the default shell", async () => {
	const fixture = shellFixture();
	const configRoot = mkdtempSync(join(tmpdir(), "tp-config-shell-"));
	const server = new ScratchTmuxServer();
	server.start();
	try {
		const configDir = join(configRoot, "tp");
		mkdirSync(configDir);
		writeFileSync(
			join(configDir, "config.toml"),
			`shell = ${JSON.stringify(fixture.shell)}\n`,
		);
		const result = await runTp(["new", "--", "printf", "config-ok"], {
			env: {
				...server.env,
				TMUX: undefined,
				TMUX_PANE: undefined,
				XDG_CONFIG_HOME: configRoot,
			},
		});
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("config-ok");
		expect(await Bun.file(fixture.log).text()).toContain("custom-shell");
	} finally {
		server.teardown();
		rmSync(fixture.root, { recursive: true, force: true });
		rmSync(configRoot, { recursive: true, force: true });
	}
});

test("tp new replays final output to the caller stdout", async () => {
	const result = await runTp(
		["new", "--", "sh", "-c", "sleep 0.1; echo done"],
		{
			env: { TP_SHELL: "/bin/sh", TMUX: undefined, TMUX_PANE: undefined },
		},
	);
	expect(result.exitCode).toBe(0);
	expect(result.stdout).toContain("done");
});

test("label attach: unique label", async () => {
	const server = new ScratchTmuxServer();
	server.start();
	try {
		const name = projectSession(server, 1);
		server.run(["set-option", "-t", name, "@tp_name", "backend"]);
		const result = await runTp(["backend"], { env: server.env });
		expect(result.exitCode).toBe(1);
		expect(result.stderr).not.toContain("Unknown command");
	} finally {
		server.teardown();
	}
});

test("label attach: ambiguous prefix", async () => {
	const server = new ScratchTmuxServer();
	server.start();
	try {
		for (const [number, label] of [
			[1, "backend-api"],
			[2, "backend-web"],
		] as const) {
			const name = projectSession(server, number);
			server.run(["set-option", "-t", name, "@tp_name", label]);
		}
		const result = await runTp(["backend"], { env: server.env });
		expect(result.exitCode).toBe(2);
		expect(result.stderr).toContain("Ambiguous session label 'backend'");
	} finally {
		server.teardown();
	}
});

test("label attach: subcommand shadow remains unreachable", async () => {
	const server = new ScratchTmuxServer();
	server.start();
	try {
		const labeled = projectSession(server, 1);
		server.run(["set-option", "-t", labeled, "@tp_name", "pi"]);
		const result = await runTp(["pi", "--help"], { env: server.env });
		expect(result.exitCode).toBe(0);
		expect(
			server.run(["has-session", "-t", `=${labeled}`], true).exitCode,
		).toBe(0);
		expect(
			server.run(["has-session", "-t", `=${basename(repoRoot)}_002`], true)
				.exitCode,
		).not.toBe(0);
	} finally {
		server.teardown();
	}
});
