import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { registerCommands } from "../../src/commands/register";
import {
	COMMANDS,
	CliUsageError,
	getCommand,
	parseCommandArgs,
	renderHelp,
	resolveInvocation,
} from "../../src/lib/cli";

const README = readFileSync(join(import.meta.dir, "../../README.md"), "utf8");

function helpCommandNames(): Set<string> {
	const names = new Set<string>();
	for (const match of renderHelp().matchAll(/^ {2}(\S+)(?: \([^)]*\))? {2}/gmu))
		names.add(match[1]);
	return names;
}

function readmeCommandNames(): Set<string> {
	const names = new Set<string>();
	// The command-reference table is the canonical README list. This keeps
	// prose examples such as `tp <label>` out of the command-set comparison.
	for (const match of README.matchAll(/^\| `tp ([a-z]+)`/gmu))
		names.add(match[1]);
	return names;
}

/**
 * Tokenize the literal tp part of a shell example. Shell operators belong to
 * the surrounding shell, not tp, so parsing stops at |, >, or >>. This is the
 * documented convention for completion examples such as `tp completions fish
 * | source`. Placeholder examples containing `<...>` are skipped below.
 */
function shellWords(line: string): string[] {
	const words: string[] = [];
	let word = "";
	let quote: '"' | "'" | undefined;
	for (let index = 0; index < line.length; index += 1) {
		const character = line[index];
		if (quote) {
			if (character === quote) quote = undefined;
			else if (character === "\\" && quote === '"') word += line[++index] ?? "";
			else word += character;
			continue;
		}
		if (character === '"' || character === "'") {
			quote = character;
			continue;
		}
		if (character === "#" && (index === 0 || /\s/u.test(line[index - 1])))
			break;
		if (character === "|" || character === ">") break;
		if (/\s/u.test(character)) {
			if (word) {
				words.push(word);
				word = "";
			}
		} else if (character === "\\") {
			word += line[++index] ?? "";
		} else word += character;
	}
	if (word) words.push(word);
	return words;
}

function documentedTpLines(): string[] {
	const lines: string[] = [];
	for (const block of README.matchAll(/```[^\n]*\n([\s\S]*?)```/gu)) {
		for (const line of block[1].split("\n")) {
			const trimmed = line.trim();
			if (trimmed.startsWith("tp ")) lines.push(trimmed);
		}
	}
	return lines;
}

// `origin --json` is added to the stable command table by the command
// registration layer, just as it is when the binary starts.
registerCommands();

test("README command reference matches tp help", () => {
	const expected = helpCommandNames();
	const documented = readmeCommandNames();
	expect([...documented].sort()).toEqual([...expected].sort());
	expect(
		COMMANDS.find((command) => command.name === "__complete")?.hidden,
	).toBe(true);
	expect(documented.has("__complete")).toBe(false);
});

test("README tp examples parse without usage errors", () => {
	const fakeSessions = [
		{ name: "demo_001", label: "project-api", attached: false, pi: null },
	];
	const failures: string[] = [];
	for (const line of documentedTpLines()) {
		const words = shellWords(line);
		// Placeholder lines are non-literal documentation and are intentionally
		// excluded. All literal examples in this README use concrete values.
		if (words.some((word) => /^<[^>]+>$/u.test(word))) continue;
		if (words[0] !== "tp") continue;
		const argv = words.slice(1);
		try {
			const invocation = resolveInvocation(argv, fakeSessions);
			if (!invocation.resolution) throw new CliUsageError("missing command");
			if (invocation.resolution.kind === "number") {
				if (
					invocation.rest.length > 1 ||
					(invocation.rest.length === 1 && invocation.rest[0] !== "--restart")
				)
					throw new CliUsageError("invalid numeric invocation");
				continue;
			}
			if (invocation.resolution.kind === "label") {
				if (invocation.rest.length)
					throw new CliUsageError("label takes no arguments");
				continue;
			}
			const command = invocation.command ?? getCommand("last");
			if (!command) throw new Error("missing command spec");
			parseCommandArgs(command, invocation.rest);
		} catch (error) {
			if (error instanceof CliUsageError)
				failures.push(`${line}: ${error.message}`);
			else throw error;
		}
	}
	expect(failures).toEqual([]);
	expect(documentedTpLines().length).toBeGreaterThan(20);
});
