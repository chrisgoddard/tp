import { type CommandContext, registerCommandHandler } from "../lib/cli";

function notImplemented(context: CommandContext): number {
	context.stderr(`tp ${context.command.name}: not implemented yet`);
	return 1;
}

export function registerListingsCommands(): void {
	for (const command of ["ls", "global", "all", "w", "b", "status"])
		registerCommandHandler(command, notImplemented);
}
