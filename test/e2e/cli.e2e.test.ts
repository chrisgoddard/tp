import { afterAll, beforeAll, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

const bin = join(import.meta.dir, "../../src/bin/tp.ts");
const socket = `tp-cli-${process.pid}`;
const project = basename(process.cwd()).replace(/^\.+/, "");
const scratch = mkdtempSync(join(tmpdir(), "tp-cli-e2e-"));
const wrapper = join(scratch, "tp");

function tmux(args: readonly string[]): void {
	const result = Bun.spawnSync(["tmux", "-L", socket, ...args], {
		stdout: "ignore",
		stderr: "pipe",
	});
	if (result.exitCode !== 0)
		throw new Error(new TextDecoder().decode(result.stderr));
}

async function runTp(
	args: readonly string[],
	extraEnv: Record<string, string> = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
	const child = Bun.spawn([process.execPath, bin, ...args], {
		cwd: process.cwd(),
		env: { ...process.env, TP_TMUX_SOCKET: socket, ...extraEnv },
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	return { code: await child.exited, stdout, stderr };
}

beforeAll(() => {
	writeFileSync(wrapper, `#!/bin/sh\nexec ${process.execPath} ${bin} "$@"\n`);
	chmodSync(wrapper, 0o755);
	tmux(["new-session", "-d", "-s", `${project}_001`, "-c", process.cwd()]);
	tmux(["set-option", "-t", `${project}_001`, "@tp_name", "api"]);
});

afterAll(() => {
	tmux(["kill-server"]);
	rmSync(scratch, { recursive: true, force: true });
});

test("__complete lists commands and live project sessions", async () => {
	const commands = await runTp(["__complete", "fish", "--", "tp", ""]);
	expect(commands.code).toBe(0);
	expect(commands.stdout).toContain("kill\t");
	expect(commands.stdout).toContain("completions\t");

	const sessions = await runTp(["__complete", "fish", "--", "tp", "kill", ""]);
	expect(sessions.code).toBe(0);
	expect(sessions.stdout).toContain("001\t");
	expect(sessions.stdout).toContain("api\t");
});

test("help and version use stdout while unimplemented commands fail", async () => {
	await expect(runTp(["version"])).resolves.toMatchObject({
		code: 0,
		stdout: "tp 0.2.0\n",
		stderr: "",
	});
	await expect(
		runTp(["pi", "--", "--model", "model with spaces"]),
	).resolves.toMatchObject({
		code: 1,
		stdout: "",
		stderr: "tp pi: not implemented yet\n",
	});
});

test("generated fish shim delegates to the protocol", async () => {
	const shim = await runTp(["completions", "fish"]);
	expect(shim.code).toBe(0);
	const path = join(scratch, "tp.fish");
	writeFileSync(path, shim.stdout);
	const fish = Bun.spawn(["fish", "-c", `source ${path}; complete -C 'tp '`], {
		cwd: process.cwd(),
		env: {
			...process.env,
			PATH: `${scratch}:${process.env.PATH}`,
			TP_TMUX_SOCKET: socket,
		},
		stdout: "pipe",
		stderr: "pipe",
	});
	const output = await new Response(fish.stdout).text();
	expect(await fish.exited).toBe(0);
	expect(output).toContain("kill");
});
