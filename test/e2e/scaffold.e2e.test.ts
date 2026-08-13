import { expect, test } from "bun:test";
import { join } from "node:path";

const binDirectory = join(import.meta.dir, "../../src/bin");

const runBin = async (name: string) => {
	const child = Bun.spawn([process.execPath, join(binDirectory, name)], {
		stdout: "pipe",
	});
	const output = await new Response(child.stdout).text();

	return { exitCode: await child.exited, output: output.trim() };
};

test("both command stubs are runnable", async () => {
	await expect(runBin("tp.ts")).resolves.toEqual({
		exitCode: 0,
		output: "tp 0.2.0",
	});
	await expect(runBin("tp-shot.ts")).resolves.toEqual({
		exitCode: 0,
		output: "tp-shot 0.2.0",
	});
});
