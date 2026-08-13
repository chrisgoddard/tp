import { expect, test } from "bun:test";
import { join } from "node:path";

const tpBin = join(import.meta.dir, "../../src/bin/tp.ts");

test("tp stub prints its version and exits successfully", async () => {
	const child = Bun.spawn([process.execPath, tpBin], {
		stdout: "pipe",
	});
	const output = await new Response(child.stdout).text();

	expect(await child.exited).toBe(0);
	expect(output.trim()).toBe("tp 0.2.0");
});
