import { expect, test } from "bun:test";
import { COMMANDS } from "../../src/lib/cli";
import { ScratchTmuxServer, runTp, runTpShot } from "./harness";

const publicCommands = COMMANDS.filter((command) => !command.hidden);

test("every public command accepts -h and prints help", async () => {
	const server = new ScratchTmuxServer();
	server.start();
	try {
		for (const command of publicCommands) {
			const result = await runTp([command.name, "-h"], { env: server.env });
			expect(result.exitCode, command.name).toBe(0);
			expect(result.stdout, command.name).toContain(
				`Usage: tp ${command.name}`,
			);
			expect(result.stderr, command.name).toBe("");
		}
	} finally {
		server.teardown();
	}
});

test("tp-shot uses the same usage text for help and parser errors", async () => {
	const help = await runTpShot(["--help"]);
	const error = await runTpShot(["--unknown"]);
	const helpUsage = help.stdout.split("\n\n", 1)[0];
	expect(help.exitCode).toBe(0);
	expect(error.exitCode).toBe(2);
	expect(error.stderr.trim()).toBe(helpUsage);
});
