import { type CommandContext, registerCommandHandler } from "../lib/cli";

function notImplemented(context: CommandContext): number {
	context.stderr(`tp ${context.command.name}: not implemented yet`);
	return 1;
}

export function registerMiscCommands(): void {
	for (const command of ["doctor", "update", "bind", "pop", "restore"])
		registerCommandHandler(command, notImplemented);
}
