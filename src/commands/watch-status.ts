import { type CommandContext, registerCommandHandler } from "../lib/cli";
import { loadConfig } from "../lib/config";
import {
	type ParsedListingSession,
	byProjectAndNumber,
	parseTpSession,
	renderListingLine,
	terminalWidth,
} from "../lib/listing-render";
import { stampSshSource } from "../lib/origin";
import { colorEnabled } from "../lib/output";
import { projectName } from "../lib/project";
import { withRawMode } from "../lib/raw-mode";
import { attach, listSessions } from "../lib/tmux";
import { listingHandlers } from "./listings";

const CURSOR_HOME = "\u001b[H";
const CLEAR_TO_END = "\u001b[0J";

interface StatusCounts {
	blocked: number;
	busy: number;
	idle: number;
	total: number;
}

type Scope = "project" | "global";

function parsedSessions(scope: Scope): ParsedListingSession[] {
	const parsed = listSessions()
		.map(parseTpSession)
		.filter((item): item is ParsedListingSession => item !== undefined);
	if (scope === "project") {
		const project = projectName();
		return parsed
			.filter((item) => item.project === project)
			.sort((left, right) => left.number - right.number);
	}
	return parsed.sort(byProjectAndNumber);
}

function statusCounts(items: readonly ParsedListingSession[]): StatusCounts {
	const counts: StatusCounts = {
		blocked: 0,
		busy: 0,
		idle: 0,
		total: items.length,
	};
	for (const item of items) {
		switch (item.session.pi?.state) {
			case "blocked":
				counts.blocked += 1;
				break;
			case "tool":
			case "thinking":
				counts.busy += 1;
				break;
			case "idle":
				counts.idle += 1;
				break;
		}
	}
	return counts;
}

function plainStatus(counts: StatusCounts): string {
	if (counts.total === 0) return "no sessions";
	return (
		[
			counts.blocked ? `${counts.blocked} blocked` : "",
			counts.busy ? `${counts.busy} busy` : "",
			counts.idle ? `${counts.idle} idle` : "",
		] as const
	)
		.filter(Boolean)
		.join(" · ");
}

function tmuxStatus(counts: StatusCounts): string {
	if (counts.total === 0) return "no sessions";
	return (
		[
			counts.blocked ? `#[fg=yellow]⏸${counts.blocked}#[default]` : "",
			counts.busy ? `#[fg=cyan]●${counts.busy}#[default]` : "",
			counts.idle ? `#[fg=brblack]○${counts.idle}#[default]` : "",
		] as const
	)
		.filter(Boolean)
		.join(" ");
}

function renderListing(
	items: readonly ParsedListingSession[],
	scope: Scope,
	redraw = false,
): string {
	const enabled = colorEnabled({ configColor: loadConfig().color });
	const lines: string[] = [];
	if (items.length === 0) {
		lines.push(
			scope === "project"
				? `No tmux sessions for '${projectName()}'`
				: "No tp sessions",
		);
	} else {
		lines.push(
			scope === "project"
				? `Sessions for '${projectName()}':`
				: "All tp sessions:",
		);
		items.forEach((item, index) =>
			lines.push(
				renderListingLine(
					item,
					scope === "project" ? "project" : "global",
					scope === "project" ? undefined : index + 1,
					null,
					terminalWidth(),
					enabled,
				),
			),
		);
	}
	return `${redraw ? `${CURSOR_HOME}${CLEAR_TO_END}` : ""}${lines.join("\n")}\n`;
}

function filteredBlocked(
	items: readonly ParsedListingSession[],
): ParsedListingSession[] {
	return items.filter((item) => item.session.pi?.state === "blocked");
}

async function blockedCommand(context: CommandContext): Promise<number> {
	const scope: Scope =
		context.args.options.global === true ? "global" : "project";
	const blocked = filteredBlocked(parsedSessions(scope));
	if (blocked.length === 0) {
		context.stderr("nothing blocked");
		return 1;
	}
	if (blocked.length === 1) {
		if (!process.env.TMUX) await stampSshSource(process.env.TTY ?? "");
		return attach(blocked[0].session.name);
	}
	context.stdout(renderListing(blocked, scope));
	return 1;
}

function sleep(milliseconds: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function watchCommand(
	context: CommandContext,
	global = context.args.options.global === true,
): Promise<number> {
	if (!process.stdin.isTTY || !process.stdout.isTTY) {
		context.stderr("watch needs a terminal");
		return 2;
	}
	const scope: Scope = global ? "global" : "project";
	let stopped = false;
	await withRawMode(async () => {
		const input = process.stdin as NodeJS.ReadStream;
		let wake: (() => void) | undefined;
		const keypress = (): void => {
			stopped = true;
			wake?.();
		};
		input.on("data", keypress);
		try {
			while (!stopped) {
				context.stdout(renderListing(parsedSessions(scope), scope, true));
				if (stopped) break;
				const key = new Promise<void>((resolve) => {
					wake = resolve;
				});
				if (stopped) break;
				await Promise.race([sleep(2000), key]);
			}
		} finally {
			input.off("data", keypress);
		}
	}, process.stdin as NodeJS.ReadStream);
	return 0;
}

function statusCommand(context: CommandContext): number {
	const scope: Scope =
		context.args.options.global === true ? "global" : "project";
	const counts = statusCounts(parsedSessions(scope));
	if (context.args.options.json === true) {
		context.stdout(`${JSON.stringify(counts)}\n`);
		return 0;
	}
	context.stdout(
		`${context.args.options.tmux === true ? tmuxStatus(counts) : plainStatus(counts)}\n`,
	);
	return 0;
}

async function globalCommand(context: CommandContext): Promise<number> {
	if (context.args.options.watch === true) return watchCommand(context, true);
	return (await listingHandlers.global(context)) ?? 0;
}

export const watchStatusInternals = {
	filteredBlocked,
	plainStatus,
	statusCounts,
	tmuxStatus,
};

export function registerWatchStatusCommands(): void {
	registerCommandHandler("global", globalCommand);
	registerCommandHandler("w", watchCommand);
	registerCommandHandler("b", blockedCommand);
	registerCommandHandler("status", statusCommand);
}
