import { type CommandContext, registerCommandHandler } from "../lib/cli";

function notImplemented(context: CommandContext): number {
	context.stderr(`tp ${context.command.name}: not implemented yet`);
	return 1;
}

export function registerWatchStatusCommands(): void {
	for (const command of ["w", "b", "status"])
		registerCommandHandler(command, notImplemented);
}
