import { describe, expect, test } from "bun:test";
import {
	COMMANDS,
	CliUsageError,
	parseCommandArgs,
	resolveCommand,
} from "../../src/lib/cli";

const sessions = [
	{ name: "demo_001", label: "api", attached: false, pi: null },
	{ name: "demo_002", label: "app", attached: false, pi: null },
];

describe("CLI resolution", () => {
	test("prefers an exact command over a number or label", () => {
		const result = resolveCommand("kill", [
			...sessions,
			{ name: "demo_003", label: "kill", attached: false, pi: null },
		]);
		expect(result.kind).toBe("command");
	});

	test("resolves numbers before label prefixes", () => {
		expect(resolveCommand("12", sessions)).toMatchObject({
			kind: "number",
			number: 12,
		});
		expect(resolveCommand("api", sessions)).toMatchObject({
			kind: "label",
			session: { name: "demo_001" },
		});
	});

	test("reports every candidate for an ambiguous label prefix", () => {
		expect(() => resolveCommand("ap", sessions)).toThrow(
			"Ambiguous session label 'ap'; candidates: demo_001 [api], demo_002 [app]",
		);
		try {
			resolveCommand("ap", sessions);
		} catch (error) {
			expect(error).toBeInstanceOf(CliUsageError);
			expect((error as CliUsageError).exitCode).toBe(2);
		}
	});
});

describe("CLI argument boundaries", () => {
	test("-- ends option parsing and keeps Pi argument boundaries", () => {
		const pi = COMMANDS.find((command) => command.name === "pi");
		if (!pi) throw new Error("pi command missing");
		const parsed = parseCommandArgs(pi, [
			"--name",
			"session with spaces",
			"--",
			"--model",
			"model with spaces",
		]);
		expect(parsed.options).toEqual({ name: "session with spaces" });
		expect(parsed.passthrough).toEqual(["--model", "model with spaces"]);
		expect(parsed.delimited).toBe(true);
	});
});
