import {
	CliUsageError,
	type CommandContext,
	getCommand,
	renderHelp,
} from "../lib/cli";

export function helpCommand(context: CommandContext): number {
	const requested = context.args.positionals[0];
	if (context.args.positionals.length > 1)
		throw new Error("Usage: tp help [command]");
	const command = requested ? getCommand(requested) : undefined;
	if (requested && !command)
		throw new CliUsageError(`Unknown command '${requested}'`);
	context.stdout(renderHelp(command));
	return 0;
}
