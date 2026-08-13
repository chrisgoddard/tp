import { type CommandContext, registerCommandHandler } from "../lib/cli";

function doctorCommand(context: CommandContext): number {
	context.stderr(`tp ${context.command.name}: not implemented yet`);
	return 1;
}

export function registerDoctorCommands(): void {
	registerCommandHandler("doctor", doctorCommand);
}
