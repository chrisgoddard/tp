import { registerCommandHandler } from "../lib/cli";
import { registerCmuxCommands } from "./cmux";
import { completionsCommand } from "./completions";
import { registerCoreCommands } from "./core";
import { helpCommand } from "./help";
import { registerListingsCommands } from "./listings";
import { registerMiscCommands } from "./misc";
import { registerPiSessionCommands } from "./pi-session";
import { registerTailscaleCommands } from "./tailscale";

export function registerCommands(): void {
	registerCoreCommands();
	registerListingsCommands();
	registerPiSessionCommands();
	registerTailscaleCommands();
	registerCmuxCommands();
	registerMiscCommands();
	registerCommandHandler("help", helpCommand);
	registerCommandHandler("completions", completionsCommand);
}
