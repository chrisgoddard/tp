import { isIP } from "node:net";
import { type CommandContext, registerCommandHandler } from "../lib/cli";
import {
	type CurrentSshOrigin,
	readCurrentSshOriginState,
	tailscaleWhois,
} from "../lib/origin";

function originCommand(context: CommandContext): Promise<number> | number {
	const state = readCurrentSshOriginState();
	if (state.kind === "missing") {
		context.stderr("no SSH origin mapping");
		return 1;
	}
	if (state.kind === "invalid") {
		context.stderr("invalid SSH origin mapping");
		return 1;
	}
	const origin = state.origin;
	if (isIP(origin.ip) === 0) {
		context.stderr("invalid SSH origin mapping");
		return 1;
	}

	return tailscaleWhois(origin.ip).then((result) => {
		const json = context.args.options.json === true;
		if (result.kind === "absent") {
			context.stderr("tailscale is not installed");
			return 1;
		}
		const fresh = origin.created === origin.clientCreated;
		if (result.kind !== "found" || !result.details) {
			if (json) {
				context.stdout(
					`${JSON.stringify({
						hostname: null,
						user: null,
						ip: origin.ip,
						createdFresh: fresh,
					})}\n`,
				);
			} else {
				context.stdout(`${origin.ip}\n`);
			}
			return 0;
		}

		const output = {
			hostname: result.details.hostname,
			user: result.details.user,
			ip: origin.ip,
			createdFresh: fresh,
		};
		if (json) context.stdout(`${JSON.stringify(output)}\n`);
		else {
			context.stdout(
				`hostname: ${output.hostname}\nuser: ${output.user}\nip: ${output.ip}\ncreated: ${output.createdFresh ? "fresh" : "stale"}\n`,
			);
		}
		return 0;
	});
}

export function registerTailscaleCommands(): void {
	const command = registerCommandHandler("origin", originCommand);
	if (!command.flags.some((flag) => flag.long === "json"))
		(command.flags as Array<{ long: string; description?: string }>).unshift({
			long: "json",
			description: "Print JSON",
		});
}
