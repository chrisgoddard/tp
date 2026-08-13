import { type CommandContext, registerCommandHandler } from "../lib/cli";

function bindCommand(context: CommandContext): number {
	context.stderr(`tp ${context.command.name}: not implemented yet`);
	return 1;
}

export function registerBindCommands(): void {
	registerCommandHandler("bind", bindCommand);
}
