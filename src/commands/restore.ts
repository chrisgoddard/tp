import { type CommandContext, registerCommandHandler } from "../lib/cli";

function restoreCommand(context: CommandContext): number {
	context.stderr(`tp ${context.command.name}: not implemented yet`);
	return 1;
}

export function registerRestoreCommands(): void {
	registerCommandHandler("restore", restoreCommand);
}
