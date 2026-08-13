import { COMMANDS, type CommandSpec, getCommand } from "./cli";
import { loadConfig } from "./config";
import { compareSessionNames, parseSessionName, projectName } from "./project";
import { type TmuxSession, listSessions } from "./tmux";

export interface CompletionSuggestion {
	value: string;
	description?: string;
}

const shells = ["fish", "bash", "zsh"] as const;

function suggestion(value: string, description?: string): CompletionSuggestion {
	return description ? { value, description } : { value };
}

function unique(
	suggestions: readonly CompletionSuggestion[],
): CompletionSuggestion[] {
	const seen = new Set<string>();
	return suggestions.filter((item) => {
		if (seen.has(item.value)) return false;
		seen.add(item.value);
		return true;
	});
}

function matching(
	suggestions: readonly CompletionSuggestion[],
	current: string,
): CompletionSuggestion[] {
	return unique(suggestions).filter((item) => item.value.startsWith(current));
}

function commandSuggestions(): CompletionSuggestion[] {
	return COMMANDS.filter((command) => !command.hidden).flatMap((command) => [
		suggestion(command.name, command.help),
		...command.aliases.map((alias) =>
			suggestion(alias, `${command.name}: ${command.help}`),
		),
	]);
}

function flagSuggestions(command: CommandSpec): CompletionSuggestion[] {
	return command.flags.flatMap((flag) => {
		const description = flag.description;
		const values = [suggestion(`--${flag.long}`, description)];
		if (flag.short) values.push(suggestion(`-${flag.short}`, description));
		return values;
	});
}

function projectSessions(sessions: readonly TmuxSession[]): TmuxSession[] {
	const project = projectName();
	return sessions
		.filter((session) => parseSessionName(session.name)?.project === project)
		.sort((left, right) => {
			const a = parseSessionName(left.name);
			const b = parseSessionName(right.name);
			return (a?.number ?? 0) - (b?.number ?? 0);
		});
}

function sessionSuggestions(
	sessions: readonly TmuxSession[],
): CompletionSuggestion[] {
	return projectSessions(sessions).flatMap((session) => {
		const parsed = parseSessionName(session.name);
		if (!parsed) return [];
		return [
			suggestion(
				String(parsed.number).padStart(3, "0"),
				session.label ? `${session.name} [${session.label}]` : session.name,
			),
			...(session.label ? [suggestion(session.label, session.name)] : []),
		];
	});
}

function globalSessions(sessions: readonly TmuxSession[]): TmuxSession[] {
	return sessions
		.filter((session) => parseSessionName(session.name) !== undefined)
		.sort((left, right) => compareSessionNames(left.name, right.name));
}

function globalSuggestions(
	sessions: readonly TmuxSession[],
): CompletionSuggestion[] {
	return globalSessions(sessions).flatMap((session, index) => [
		suggestion(
			String(index + 1),
			session.label ? `${session.name} [${session.label}]` : session.name,
		),
	]);
}

function projectPrefixSuggestions(
	sessions: readonly TmuxSession[],
): CompletionSuggestion[] {
	const prefixes = new Set<string>();
	for (const session of sessions) {
		const parsed = parseSessionName(session.name);
		if (parsed) prefixes.add(parsed.project);
	}
	return [...prefixes]
		.sort()
		.map((prefix) => suggestion(prefix, "Project prefix"));
}

function layoutSuggestions(): CompletionSuggestion[] {
	try {
		return Object.keys(loadConfig().layouts)
			.sort()
			.map((name) => suggestion(name, "Configured layout"));
	} catch {
		return [];
	}
}

function commandForWords(words: readonly string[]): CommandSpec | undefined {
	const first = words[1];
	return first ? getCommand(first) : undefined;
}

function nestedSuggestions(
	words: readonly string[],
	current: string,
	sessions: readonly TmuxSession[],
): CompletionSuggestion[] {
	const command = commandForWords(words);
	if (!command)
		return commandSuggestions().concat(sessionSuggestions(sessions));
	const prior = words.slice(2);
	const suggestions = flagSuggestions(command);
	if (command.name === "completions" && prior.length === 0)
		return suggestions.concat(
			shells.map((shell) => suggestion(shell, "Shell")),
		);
	if (command.name === "new" && prior.includes("--layout"))
		return layoutSuggestions();
	if (["kill", "name", "sid"].includes(command.name))
		return suggestions.concat(sessionSuggestions(sessions));
	if (["global", "cmux"].includes(command.name))
		return suggestions.concat(
			globalSuggestions(sessions),
			projectPrefixSuggestions(sessions),
		);
	if (command.name === "shot" && prior.length === 0)
		return suggestions.concat(
			["latest", "list", "dir"].map((item) => suggestion(item)),
		);
	return suggestions;
}

/**
 * Compute protocol suggestions. This function deliberately catches all errors:
 * completion must never make the interactive command line fail.
 */
export function complete(
	shell: string,
	argv: readonly string[],
): CompletionSuggestion[] {
	try {
		if (!shells.includes(shell as (typeof shells)[number])) return [];
		if (argv.length < 1) return [];
		const current = argv[argv.length - 1] ?? "";
		const words = argv.slice(0, -1);
		if (words[0] !== "tp") return [];
		const sessions = listSessions();
		return matching(nestedSuggestions(words, current, sessions), current);
	} catch {
		return [];
	}
}

export function renderCompletionOutput(
	shell: string,
	argv: readonly string[],
): string {
	return complete(shell, argv)
		.map((item) =>
			item.description ? `${item.value}\t${item.description}` : item.value,
		)
		.join("\n");
}

export function supportedCompletionShells(): readonly string[] {
	return shells;
}
