import { registerCommandHandler } from "../lib/cli";
import { registerBindCommands } from "./bind";
import { registerCmuxCommands } from "./cmux";
import { completionsCommand } from "./completions";
import { registerCoreCommands } from "./core";
import { registerDoctorCommands } from "./doctor";
import { helpCommand } from "./help";
import { registerListingsCommands } from "./listings";
import { registerPiSessionCommands } from "./pi-session";
import { registerPopCommands } from "./pop";
import { registerRestoreCommands } from "./restore";
import { registerTailscaleCommands } from "./tailscale";
import { registerUpdateCommands } from "./update";
import { registerWatchStatusCommands } from "./watch-status";

export function registerCommands(): void {
	registerCoreCommands();
	registerListingsCommands();
	registerPiSessionCommands();
	registerTailscaleCommands();
	registerCmuxCommands();
	registerDoctorCommands();
	registerUpdateCommands();
	registerBindCommands();
	registerPopCommands();
	registerRestoreCommands();
	registerWatchStatusCommands();
	registerCommandHandler("help", helpCommand);
	registerCommandHandler("completions", completionsCommand);
}
