#!/usr/bin/env bun

import { registerCommands } from "../commands/register";
import {
	CliUsageError,
	type CommandContext,
	type CommandSpec,
	type ParsedArgs,
	type Resolution,
	parseCommandArgs,
	renderHelp,
	resolveInvocation,
} from "../lib/cli";
import { renderCompletionOutput } from "../lib/complete";

const VERSION = "0.2.0";

registerCommands();

function versionCommand(context: CommandContext): number {
	context.stdout(`tp ${VERSION}\n`);
	return 0;
}

function makeContext(
	command: CommandSpec,
	args: ParsedArgs,
	resolution: Resolution,
	argv: readonly string[],
): CommandContext {
	return {
		command,
		args,
		resolution,
		argv,
		stdout: (text) => process.stdout.write(text),
		stderr: (text) => process.stderr.write(`${text}\n`),
	};
}

function completeProtocol(raw: readonly string[]): number {
	try {
		const shell = raw[1];
		if (!shell || raw[2] !== "--") return 0;
		const words = raw.slice(3);
		const output = renderCompletionOutput(shell, words);
		if (output) process.stdout.write(`${output}\n`);
	} catch {
		// Completion is a best-effort protocol. It must never fail the caller.
	}
	return 0;
}

export async function run(
	argv: readonly string[] = process.argv.slice(2),
): Promise<number> {
	if (argv[0] === "__complete") return completeProtocol(argv);
	if (argv.length === 0) {
		// Preserve the scaffold's no-argument probe until the attach command lands.
		process.stdout.write(`tp ${VERSION}\n`);
		return 0;
	}
	if (argv.length === 1 && (argv[0] === "-h" || argv[0] === "--help")) {
		process.stdout.write(renderHelp());
		return 0;
	}
	if (argv.length === 1 && (argv[0] === "-V" || argv[0] === "--version")) {
		process.stdout.write(`tp ${VERSION}\n`);
		return 0;
	}
	try {
		const invocation = resolveInvocation(argv);
		if (!invocation.resolution) throw new CliUsageError("Missing command");
		if (!invocation.command) {
			process.stderr.write(`tp ${argv[0]}: not implemented yet\n`);
			return 1;
		}
		const { command, resolution } = invocation;
		const args = parseCommandArgs(command, invocation.rest);
		if (args.help) {
			process.stdout.write(renderHelp(command));
			return 0;
		}
		if (command.name === "version")
			return versionCommand(makeContext(command, args, resolution, argv));
		if (command.handler) {
			const result = await command.handler(
				makeContext(command, args, resolution, argv),
			);
			return typeof result === "number" ? result : 0;
		}
		return 1;
	} catch (error) {
		if (error instanceof CliUsageError) {
			process.stderr.write(`${error.message}\n`);
			return 2;
		}
		process.stderr.write(
			`${error instanceof Error ? error.message : String(error)}\n`,
		);
		return 1;
	}
}

if (import.meta.main) {
	run().then((code) => {
		if (code !== 0) process.exitCode = code;
	});
}
