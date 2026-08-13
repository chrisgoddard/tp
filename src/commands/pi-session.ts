import { type CommandContext, registerCommandHandler } from "../lib/cli";

function notImplemented(context: CommandContext): number {
	context.stderr(`tp ${context.command.name}: not implemented yet`);
	return 1;
}

export function registerPiSessionCommands(): void {
	registerCommandHandler("sid", notImplemented);
}

export function restartSession(_sessionName: string): Promise<number> | number {
	throw new Error("not implemented yet");
}
