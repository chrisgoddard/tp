import { expect, test } from "bun:test";
import { parseArgs } from "../../src/bin/tp-shot";
import { renderCompletionShim } from "../../src/commands/completions";

function fishShotFlags(shim: string): Set<string> {
	const flags = new Set<string>();
	for (const line of shim.split("\n")) {
		if (!line.startsWith("complete -c tp-shot")) continue;
		const short = / -s ([^ ]+)/u.exec(line)?.[1];
		const long = / -l ([^ ]+)/u.exec(line)?.[1];
		if (short) flags.add(`-${short}`);
		if (long) flags.add(`--${long}`);
	}
	return flags;
}

test("fish tp-shot flags are accepted by the tp-shot parser", () => {
	const candidates = [
		"-h",
		"--help",
		"--async",
		"--notify-test",
		"--host",
		"--transport",
		"-V",
		"--version",
	] as const;
	const parserAccepted = new Set<string>(
		candidates.filter((flag) => {
			const args =
				flag === "--host"
					? [flag, "host"]
					: flag === "--transport"
						? [flag, "ssh"]
						: [flag];
			try {
				parseArgs(args);
				return true;
			} catch {
				return false;
			}
		}),
	);
	for (const flag of fishShotFlags(renderCompletionShim("fish")))
		expect(parserAccepted.has(flag), flag).toBe(true);
});

test("completion shims describe their dynamic and static sources", () => {
	const shim = renderCompletionShim("fish");
	expect(shim).toContain("tp suggestions come from tp __complete");
	expect(shim).toContain("tp-shot flags are static");
	expect(shim).toContain("mkdir -p ~/.config/fish/completions");
});
