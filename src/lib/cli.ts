import { tryParseNumber } from "./project";
import { type TmuxSession, listSessions } from "./tmux";

export interface FlagSpec {
	/** Long spelling without the leading dashes. */
	long: string;
	/** Short spelling without the leading dash. May be multi-character (for -uf). */
	short?: string;
	value?: boolean;
	description?: string;
}

export interface PositionalSpec {
	name: string;
	required?: boolean;
	rest?: boolean;
	description?: string;
}

export interface ParsedArgs {
	options: Record<string, string | boolean>;
	positionals: string[];
	passthrough: string[];
	help: boolean;
	/** Arguments after the explicit -- delimiter, including their boundaries. */
	delimited: boolean;
}

export interface CommandContext {
	command: CommandSpec;
	args: ParsedArgs;
	resolution: Resolution;
	argv: readonly string[];
	stdout: (text: string) => void;
	stderr: (text: string) => void;
}

export type CommandHandler = (
	context: CommandContext,
) => number | undefined | Promise<number | undefined>;

export interface CommandSpec {
	name: string;
	aliases: readonly string[];
	positionals: readonly PositionalSpec[];
	flags: readonly FlagSpec[];
	help: string;
	/** Optional concise syntax for nested or variadic arguments. */
	usage?: string;
	hidden?: boolean;
	handler?: CommandHandler;
}

const helpFlag: FlagSpec = {
	long: "help",
	short: "h",
	description: "Show help",
};
const restartFlag: FlagSpec = {
	long: "restart",
	description: "Restart Pi and resume its conversation",
};

/** The complete v0.2 surface. Later lanes attach handlers; entries stay stable. */
export const COMMANDS: CommandSpec[] = [
	{
		name: "new",
		aliases: ["n"],
		positionals: [{ name: "command", rest: true }],
		usage: "[command ...]",
		flags: [
			{
				long: "name",
				short: "n",
				value: true,
				description: "Label the session",
			},
			{ long: "layout", value: true, description: "Use a configured layout" },
			helpFlag,
		],
		help: "Create the next numbered project session",
	},
	{
		name: "pi",
		aliases: ["p"],
		positionals: [{ name: "pi-args", rest: true }],
		usage: "[pi-args ...]",
		flags: [
			{
				long: "name",
				short: "n",
				value: true,
				description: "Name the sessions",
			},
			{ long: "update-first", short: "uf", description: "Update Pi first" },
			helpFlag,
		],
		help: "Create the next session and run Pi",
	},
	{
		name: "last",
		aliases: ["l", "-"],
		positionals: [],
		flags: [helpFlag],
		help: "Attach to the last project session",
	},
	{
		name: "ls",
		aliases: ["list"],
		positionals: [],
		flags: [{ long: "json", description: "Print JSON" }, helpFlag],
		help: "List sessions for the current project",
	},
	{
		name: "kill",
		aliases: ["k"],
		positionals: [{ name: "number" }],
		flags: [
			{ long: "force", short: "f", description: "Skip confirmation" },
			helpFlag,
		],
		help: "Kill one or all project sessions",
	},
	{
		name: "name",
		aliases: [],
		positionals: [
			{ name: "number", required: true },
			{ name: "label", required: true },
		],
		flags: [helpFlag],
		help: "Set a session label",
	},
	{
		name: "sid",
		aliases: [],
		positionals: [{ name: "number" }],
		flags: [helpFlag],
		help: "Print a Pi session id",
	},
	{
		name: "shot",
		aliases: [],
		positionals: [{ name: "action", rest: true }],
		usage: "[latest|list [count]|dir]",
		flags: [helpFlag],
		help: "Find uploaded screenshots",
	},
	{
		name: "global",
		aliases: ["g"],
		positionals: [{ name: "selector", rest: true }],
		usage: "[prefix [index]|index]",
		flags: [
			restartFlag,
			{ long: "watch", short: "w", description: "Watch the global listing" },
			{ long: "json", description: "Print JSON" },
			{ long: "recent", description: "Sort by recent activity" },
			helpFlag,
		],
		help: "List or attach to sessions across projects",
	},
	{
		name: "all",
		aliases: ["a"],
		positionals: [],
		flags: [helpFlag],
		help: "List every tmux session",
	},
	{
		name: "cmux",
		aliases: ["c"],
		positionals: [{ name: "selector" }],
		usage: "[index|prefix|all]",
		flags: [helpFlag],
		help: "Open or focus sessions in cmux",
	},
	{
		name: "w",
		aliases: [],
		positionals: [],
		flags: [
			{ long: "global", short: "g", description: "Include every project" },
			helpFlag,
		],
		help: "Watch sessions live",
	},
	{
		name: "b",
		aliases: [],
		positionals: [],
		flags: [
			{ long: "global", short: "g", description: "Include every project" },
			helpFlag,
		],
		help: "Attach to a blocked session",
	},
	{
		name: "status",
		aliases: [],
		positionals: [],
		flags: [
			{ long: "global", short: "g", description: "Include every project" },
			{ long: "tmux", description: "Print a tmux format segment" },
			{ long: "json", description: "Print JSON" },
			helpFlag,
		],
		help: "Show session status counts",
	},
	{
		name: "origin",
		aliases: [],
		positionals: [],
		flags: [helpFlag],
		help: "Show the current SSH origin",
	},
	{
		name: "doctor",
		aliases: [],
		positionals: [],
		flags: [{ long: "json", description: "Print JSON" }, helpFlag],
		help: "Check the tp environment",
	},
	{
		name: "update",
		aliases: [],
		positionals: [],
		flags: [{ long: "check", description: "Check for updates" }, helpFlag],
		help: "Update tp from its git clone",
	},
	{
		name: "bind",
		aliases: [],
		positionals: [],
		flags: [
			{ long: "print", description: "Print config without writing" },
			helpFlag,
		],
		help: "Install tp tmux bindings",
	},
	{
		name: "pop",
		aliases: [],
		positionals: [],
		flags: [helpFlag],
		help: "Open the session picker",
	},
	{
		name: "restore",
		aliases: [],
		positionals: [],
		flags: [
			{ long: "list", description: "List saved sessions" },
			{ long: "project", value: true, description: "Limit to a project" },
			helpFlag,
		],
		help: "Restore sessions after reboot",
	},
	{
		name: "completions",
		aliases: [],
		positionals: [{ name: "shell", required: true }],
		flags: [helpFlag],
		help: "Print a shell completion shim",
	},
	{
		name: "__complete",
		aliases: [],
		positionals: [{ name: "shell" }, { name: "words", rest: true }],
		flags: [],
		hidden: true,
		help: "Internal completion protocol",
	},
	{
		name: "help",
		aliases: [],
		positionals: [{ name: "command" }],
		flags: [],
		help: "Show help",
	},
	{
		name: "version",
		aliases: [],
		positionals: [],
		flags: [],
		help: "Show the version",
	},
];

/** Backward-friendly name for consumers that call the table COMMAND_TABLE. */
export const COMMAND_TABLE = COMMANDS;

export class CliUsageError extends Error {
	readonly exitCode = 2;

	constructor(message: string) {
		super(message);
		this.name = "CliUsageError";
	}
}

export type Resolution =
	| { kind: "command"; command: CommandSpec; token: string }
	| { kind: "number"; number: number; token: string }
	| { kind: "label"; session: TmuxSession; token: string };

function commandMap(): Map<string, CommandSpec> {
	const result = new Map<string, CommandSpec>();
	for (const command of COMMANDS) {
		result.set(command.name, command);
		for (const alias of command.aliases) result.set(alias, command);
	}
	return result;
}

export function getCommand(nameOrAlias: string): CommandSpec | undefined {
	return commandMap().get(nameOrAlias);
}

export function registerCommandHandler(
	nameOrAlias: string,
	handler: CommandHandler,
): CommandSpec {
	const command = getCommand(nameOrAlias);
	if (!command) throw new Error(`Unknown command '${nameOrAlias}'`);
	command.handler = handler;
	return command;
}

export const attachCommandHandler = registerCommandHandler;

function sessionDescription(session: TmuxSession): string {
	return session.label ? `${session.name} [${session.label}]` : session.name;
}

export function ambiguousLabelMessage(
	token: string,
	matches: readonly TmuxSession[],
): string {
	return `Ambiguous session label '${token}'; candidates: ${matches
		.map(sessionDescription)
		.join(", ")}`;
}

/** Resolve exact command/alias, then a number, then a unique label prefix. */
export function resolveCommand(
	token: string,
	sessions: readonly TmuxSession[] = listSessions(),
): Resolution {
	const command = getCommand(token);
	if (command) return { kind: "command", command, token };
	const number = tryParseNumber(token);
	if (number !== undefined) return { kind: "number", number, token };
	const matches = sessions.filter((session) =>
		session.label?.startsWith(token),
	);
	if (matches.length === 1)
		return { kind: "label", session: matches[0], token };
	if (matches.length > 1)
		throw new CliUsageError(ambiguousLabelMessage(token, matches));
	throw new CliUsageError(`Unknown command or session label '${token}'`);
}

export function resolveInvocation(
	argv: readonly string[],
	sessions?: readonly TmuxSession[],
): { resolution?: Resolution; command?: CommandSpec; rest: string[] } {
	const first = argv[0];
	if (first === undefined) return { rest: [] };
	const resolution = resolveCommand(first, sessions);
	if (resolution.kind === "command")
		return {
			resolution,
			command: resolution.command,
			rest: [...argv.slice(1)],
		};
	return { resolution, rest: [...argv.slice(1)] };
}

function findFlag(
	command: CommandSpec,
	spelling: string,
): FlagSpec | undefined {
	return command.flags.find(
		(flag) => flag.long === spelling || flag.short === spelling,
	);
}

function addOption(
	options: Record<string, string | boolean>,
	flag: FlagSpec,
	value: string | boolean,
): void {
	options[flag.long] = value;
}

/** Parse a command's options without ever splitting positional values. */
export function parseCommandArgs(
	command: CommandSpec,
	argv: readonly string[],
): ParsedArgs {
	const options: Record<string, string | boolean> = {};
	const positionals: string[] = [];
	const passthrough: string[] = [];
	let help = false;
	let delimited = false;
	let index = 0;
	while (index < argv.length) {
		const argument = argv[index];
		if (delimited) {
			if (command.name === "pi") passthrough.push(argument);
			else positionals.push(argument);
			index += 1;
			continue;
		}
		if (argument === "--") {
			delimited = true;
			index += 1;
			continue;
		}
		if (argument === "-h" || argument === "--help") {
			help = true;
			addOption(options, helpFlag, true);
			index += 1;
			continue;
		}
		const longMatch = /^--([^=]+)(?:=(.*))?$/.exec(argument);
		const shortMatch =
			argument.startsWith("-") && !argument.startsWith("--")
				? argument.slice(1)
				: undefined;
		const spelling = longMatch?.[1] ?? shortMatch;
		const flag = spelling ? findFlag(command, spelling) : undefined;
		if (flag) {
			if (flag.value) {
				const value = longMatch?.[2] ?? argv[index + 1];
				if (value === undefined)
					throw new CliUsageError(`Option '--${flag.long}' needs a value`);
				addOption(options, flag, value);
				index += longMatch?.[2] !== undefined ? 1 : 2;
				continue;
			}
			addOption(options, flag, true);
			index += 1;
			continue;
		}
		if (command.name === "pi") passthrough.push(argument);
		else if (argument.startsWith("-"))
			throw new CliUsageError(`Unknown option '${argument}'`);
		else positionals.push(argument);
		index += 1;
	}
	if (command.name === "pi" && delimited) {
		// The explicit delimiter is a parser boundary, not an argument to Pi.
		passthrough.push(...positionals);
		positionals.length = 0;
	}
	if (help) return { options, positionals, passthrough, help, delimited };
	const positionalSpec = command.positionals;
	const restSpec = positionalSpec.find((item) => item.rest);
	const max = restSpec ? Number.POSITIVE_INFINITY : positionalSpec.length;
	if (positionals.length > max)
		throw new CliUsageError(`Too many arguments for 'tp ${command.name}'`);
	for (
		let requiredIndex = 0;
		requiredIndex < positionalSpec.length;
		requiredIndex += 1
	) {
		if (
			positionalSpec[requiredIndex].required &&
			positionals[requiredIndex] === undefined
		)
			throw new CliUsageError(
				`Missing argument '<${positionalSpec[requiredIndex].name}>'`,
			);
	}
	return { options, positionals, passthrough, help, delimited };
}

function usageLine(command: CommandSpec): string {
	if (command.usage) return `Usage: tp ${command.name} ${command.usage}`;
	const positional = command.positionals
		.map((item) => (item.required ? `<${item.name}>` : `[${item.name}]`))
		.join(" ");
	return `Usage: tp ${command.name}${positional ? ` ${positional}` : ""}`;
}

export function renderHelp(command?: CommandSpec): string {
	if (command) {
		const lines = [usageLine(command), command.help];
		for (const flag of command.flags) {
			const short = flag.short ? `-${flag.short}, ` : "    ";
			const value = flag.value ? " <value>" : "";
			lines.push(
				`  ${short}--${flag.long}${value} ${flag.description ?? ""}`.trimEnd(),
			);
		}
		return `${lines.join("\n")}\n`;
	}
	const lines = ["Usage: tp [command|number]", "", "Commands:"];
	for (const item of COMMANDS) {
		if (item.hidden) continue;
		const aliases = item.aliases.length ? ` (${item.aliases.join(", ")})` : "";
		lines.push(`  ${item.name}${aliases}  ${item.help}`);
	}
	lines.push("", "Use 'tp help <command>' for details.");
	return `${lines.join("\n")}\n`;
}
