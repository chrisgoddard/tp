import { type CommandContext, registerCommandHandler } from "../lib/cli";

function updateCommand(context: CommandContext): number {
	context.stderr(`tp ${context.command.name}: not implemented yet`);
	return 1;
}

export function registerUpdateCommands(): void {
	registerCommandHandler("update", updateCommand);
}
