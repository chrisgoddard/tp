import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { ScratchTmuxServer, runTp } from "./harness";

function configRoot(text: string): {
	root: string;
	env: Record<string, string>;
} {
	const root = mkdtempSync(join(tmpdir(), "tp-layout-config-"));
	const directory = join(root, "tp");
	mkdirSync(directory);
	writeFileSync(join(directory, "config.toml"), text);
	return { root, env: { XDG_CONFIG_HOME: root } };
}

async function runLayout(
	server: ScratchTmuxServer,
	config: { root: string; env: Record<string, string> },
	args: string[],
) {
	return runTp(args, {
		env: {
			...server.env,
			...config.env,
			TMUX: undefined,
			TMUX_PANE: undefined,
			TP_SHELL: "/bin/sh",
		},
	});
}

test("tp new --layout builds named windows and panes", async () => {
	const server = new ScratchTmuxServer();
	const config = configRoot(`[layouts.dev]\nwindows = [
  { name = "edit", cmd = "sleep 30" },
  { name = "server", cmd = "sleep 30" },
  { name = "shell" },
  { name = "logs", split = "h", cmd = "sleep 30" },
]\n`);
	try {
		server.start();
		const result = await runLayout(server, config, ["new", "--layout", "dev"]);
		expect(result.exitCode).toBe(1);
		const session = `${basename(process.cwd())}_001`;
		const windows = server
			.run([
				"list-windows",
				"-t",
				session,
				"-F",
				"#{window_index}:#{window_name}:#{pane_current_path}:#{pane_current_command}",
			])
			.stdout.trim()
			.split("\n");
		expect(windows).toHaveLength(3);
		expect(windows[0]).toContain(":edit:");
		expect(windows[1]).toContain(":server:");
		expect(windows[2]).toContain(":shell:");
		expect(windows[0]).toContain(`:${process.cwd()}:`);
		expect(windows[1]).toContain(`:${process.cwd()}:`);
		expect(windows[2]).toContain(`:${process.cwd()}:`);
		const panes = server
			.run([
				"list-panes",
				"-t",
				`${session}:2`,
				"-F",
				"#{window_index}.#{pane_index}:#{pane_title}:#{pane_current_path}:#{pane_current_command}",
			])
			.stdout.trim()
			.split("\n");
		expect(panes).toHaveLength(2);
		expect(panes[1]).toContain(":logs:");
		expect(panes[1]).toContain(`:${process.cwd()}:`);
		expect(
			server
				.run(["display-message", "-p", "-t", session, "#{window_index}"])
				.stdout.trim(),
		).toBe("0");
	} finally {
		server.teardown();
		rmSync(config.root, { recursive: true, force: true });
	}
});

for (const [label, windows, entry] of [
	["bad split", `[{ name = "logs", split = "diagonal" }]`, "entry 0 ('logs')"],
	["missing name", `[{ cmd = "echo nope" }]`, "entry 0"],
] as const)
	test(`layout validation names the offending entry (${label})`, async () => {
		const server = new ScratchTmuxServer();
		const config = configRoot(`[layouts.bad]\nwindows = ${windows}\n`);
		try {
			server.start();
			const result = await runLayout(server, config, [
				"new",
				"--layout",
				"bad",
			]);
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain(entry);
		} finally {
			server.teardown();
			rmSync(config.root, { recursive: true, force: true });
		}
	});

test("unknown layout lists available names", async () => {
	const server = new ScratchTmuxServer();
	const config = configRoot(
		`[layouts.dev]\nwindows = [{ name = "shell" }]\n[layouts.ops]\nwindows = [{ name = "ops" }]\n`,
	);
	try {
		server.start();
		const result = await runLayout(server, config, [
			"new",
			"--layout",
			"missing",
		]);
		expect(result.exitCode).toBe(2);
		expect(result.stderr).toContain("dev, ops");
	} finally {
		server.teardown();
		rmSync(config.root, { recursive: true, force: true });
	}
});

test("layout rejects trailing commands and pi rejects layout", async () => {
	const server = new ScratchTmuxServer();
	const config = configRoot(`[layouts.dev]\nwindows = [{ name = "shell" }]\n`);
	try {
		server.start();
		const conflict = await runLayout(server, config, [
			"new",
			"--layout",
			"dev",
			"echo",
		]);
		expect(conflict.exitCode).toBe(2);
		const pi = await runLayout(server, config, ["pi", "--layout", "dev"]);
		expect(pi.exitCode).toBe(2);
		expect(pi.stderr).toContain("not supported");
	} finally {
		server.teardown();
		rmSync(config.root, { recursive: true, force: true });
	}
});
