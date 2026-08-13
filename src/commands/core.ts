import { type CommandContext, registerCommandHandler } from "../lib/cli";

function notImplemented(context: CommandContext): number {
	context.stderr(`tp ${context.command.name}: not implemented yet`);
	return 1;
}

export function registerCoreCommands(): void {
	for (const command of ["new", "pi", "last", "kill", "name", "shot"])
		registerCommandHandler(command, notImplemented);
}
