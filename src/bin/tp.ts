#!/usr/bin/env bun

import {
	attachFirstProjectSession,
	attachProjectLabel,
	attachProjectNumber,
} from "../commands/core";
import { registerCommands } from "../commands/register";
import {
	CliUsageError,
	type CommandContext,
	type CommandSpec,
	type ParsedArgs,
	type Resolution,
	getCommand,
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

function syntheticContext(
	commandName: string,
	resolution: Resolution,
	argv: readonly string[],
): CommandContext {
	const command = getCommand(commandName);
	if (!command) throw new Error(`Unknown synthetic command '${commandName}'`);
	return makeContext(
		command,
		{
			options: {},
			positionals: [],
			passthrough: [],
			help: false,
			delimited: false,
		},
		resolution,
		argv,
	);
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
	if (argv.length === 1 && (argv[0] === "-h" || argv[0] === "--help")) {
		process.stdout.write(renderHelp());
		return 0;
	}
	if (argv.length === 1 && (argv[0] === "-V" || argv[0] === "--version")) {
		process.stdout.write(`tp ${VERSION}\n`);
		return 0;
	}
	try {
		if (argv.length === 0) {
			const command = getCommand("last");
			if (!command) throw new Error("Unknown synthetic command 'last'");
			const resolution: Resolution = {
				kind: "command",
				command,
				token: "",
			};
			return await attachFirstProjectSession(
				syntheticContext("last", resolution, argv),
			);
		}
		const invocation = resolveInvocation(argv);
		if (!invocation.resolution) throw new CliUsageError("Missing command");
		if (invocation.resolution.kind === "number") {
			const rest = invocation.rest;
			if (rest.length > 1 || (rest.length === 1 && rest[0] !== "--restart"))
				throw new CliUsageError("Usage: tp <n> [--restart]");
			return await attachProjectNumber(
				invocation.resolution.number,
				syntheticContext("last", invocation.resolution, argv),
				rest[0] === "--restart",
			);
		}
		if (invocation.resolution.kind === "label") {
			if (invocation.rest.length) throw new CliUsageError("Usage: tp <label>");
			return await attachProjectLabel(
				invocation.resolution.session.name,
				syntheticContext("last", invocation.resolution, argv),
			);
		}
		if (!invocation.command) {
			return await attachFirstProjectSession(
				syntheticContext("last", invocation.resolution, argv),
			);
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
