import { type CommandContext, registerCommandHandler } from "../lib/cli";
import {
	type ParsedListingSession,
	byProjectAndNumber,
	byRecent,
	formatDuration,
	parseTpSession,
	renderListingLine,
	terminalWidth,
} from "../lib/listing-render";
import { resolveAttachedDevice, stampSshSource } from "../lib/origin";
import { buildLine, colorEnabled } from "../lib/output";
import { projectName } from "../lib/project";
import { recordSessionsSnapshot } from "../lib/snapshot";
import { type TmuxSession, attach, listSessions } from "../lib/tmux";
import { restartSession } from "./pi-session";

export interface ListingDependencies {
	resolveDevice: (source: string) => Promise<string | null> | string | null;
	stampSource: (clientTty: string) => Promise<void> | void;
	attach: (sessionName: string) => number;
	restart: (sessionName: string) => Promise<number> | number;
}

const defaultDependencies: ListingDependencies = {
	resolveDevice: resolveAttachedDevice,
	stampSource: stampSshSource,
	attach,
	restart: restartSession,
};

interface JsonPi {
	sessionId: string;
	pid: number | null;
	state: string | null;
	tool: string | null;
	stateSince: string | null;
	ctxPct: number | null;
	model: string | null;
}

export interface ListingJsonRecord {
	project: string;
	number: number;
	session: string;
	label: string | null;
	attached: boolean;
	attachedFrom: string | null;
	activityAt: string | null;
	cwd: string | null;
	pi: JsonPi | null;
}

async function attachedDevices(
	items: readonly ParsedListingSession[],
	dependencies: ListingDependencies,
): Promise<Map<string, string | null>> {
	const pairs = await Promise.all(
		items.map(async ({ session }) => {
			if (!session.attached) return [session.name, null] as const;
			try {
				return [
					session.name,
					(await dependencies.resolveDevice(session.attachedFrom ?? "")) ??
						null,
				] as const;
			} catch {
				return [session.name, null] as const;
			}
		}),
	);
	return new Map(pairs);
}

function isoTimestamp(seconds: number | undefined): string | null {
	return seconds === undefined ? null : new Date(seconds * 1000).toISOString();
}

function jsonRecord(
	item: ParsedListingSession,
	attachedFrom: string | null,
): ListingJsonRecord {
	const { session } = item;
	const pi = session.pi;
	return {
		project: item.project,
		number: item.number,
		session: session.name,
		label: session.label ?? null,
		attached: session.attached,
		attachedFrom,
		activityAt: session.activityAt ?? null,
		cwd: session.cwd ?? null,
		pi: pi
			? {
					sessionId: pi.sessionId,
					pid: pi.pid ?? null,
					state: pi.state ?? null,
					tool: pi.tool ?? null,
					stateSince: isoTimestamp(pi.stateSince),
					ctxPct: pi.ctxPct ?? null,
					model: pi.model ?? null,
				}
			: null,
	};
}

function writeEmpty(
	context: CommandContext,
	message: string,
	json: boolean,
	zeroExit = false,
): number {
	if (json) context.stdout("[]\n");
	else context.stdout(`${message}\n`);
	return json || zeroExit ? 0 : 1;
}

async function attachSelected(
	context: CommandContext,
	item: ParsedListingSession,
	dependencies: ListingDependencies,
): Promise<number> {
	if (!process.env.TMUX) await dependencies.stampSource(process.env.TTY ?? "");
	if (context.args.options.restart === true) {
		const restarted = await dependencies.restart(item.session.name);
		return restarted;
	}
	return dependencies.attach(item.session.name);
}

async function lsCommand(
	context: CommandContext,
	dependencies: ListingDependencies = defaultDependencies,
): Promise<number> {
	const json = context.args.options.json === true;
	const project = projectName();
	const sessions = listSessions();
	try {
		recordSessionsSnapshot(sessions);
	} catch {
		context.stderr("Warning: failed to record session snapshot");
	}
	const items = sessions
		.map(parseTpSession)
		.filter(
			(item): item is ParsedListingSession =>
				item !== undefined && item.project === project,
		)
		.sort((left, right) => left.number - right.number);
	if (items.length === 0)
		return writeEmpty(context, `No tmux sessions for '${project}'`, json, true);
	const devices = await attachedDevices(items, dependencies);
	if (json) {
		context.stdout(
			`${JSON.stringify(items.map((item) => jsonRecord(item, devices.get(item.session.name) ?? null)))}\n`,
		);
		return 0;
	}
	const enabled = colorEnabled();
	context.stdout(`Sessions for '${project}':\n`);
	for (const item of items)
		context.stdout(
			`${renderListingLine(item, "project", undefined, devices.get(item.session.name) ?? null, terminalWidth(), enabled)}\n`,
		);
	return 0;
}

function selectGlobal(
	items: ParsedListingSession[],
	selectors: readonly string[],
): { items: ParsedListingSession[]; index?: number; error?: string } {
	if (selectors.length === 0) return { items };
	const prefix = selectors[0];
	if (/^\d+$/.test(prefix)) {
		if (selectors.length !== 1)
			return { items, error: "Usage: tp global [<index>] [--restart]" };
		const index = Number(prefix);
		if (!Number.isSafeInteger(index) || index < 1 || index > items.length)
			return { items, error: `Index out of range (1-${items.length})` };
		return { items: [items[index - 1]], index };
	}
	const filtered = items.filter((item) => item.project.startsWith(prefix));
	if (filtered.length === 0)
		return { items, error: `No tp sessions start with '${prefix}'` };
	if (selectors.length === 1) return { items: filtered };
	if (selectors.length !== 2 || !/^\d+$/.test(selectors[1]))
		return {
			items,
			error: "Usage: tp global [<prefix>] [<index>] [--restart]",
		};
	const index = Number(selectors[1]);
	if (!Number.isSafeInteger(index) || index < 1 || index > filtered.length)
		return { items, error: `Index out of range (1-${filtered.length})` };
	return { items: [filtered[index - 1]], index };
}

async function globalCommand(
	context: CommandContext,
	dependencies: ListingDependencies = defaultDependencies,
): Promise<number> {
	const json = context.args.options.json === true;
	const recent = context.args.options.recent === true;
	const sessions = listSessions();
	try {
		recordSessionsSnapshot(sessions);
	} catch {
		context.stderr("Warning: failed to record session snapshot");
	}
	let items = sessions
		.map(parseTpSession)
		.filter((item): item is ParsedListingSession => item !== undefined)
		.sort(recent ? byRecent : byProjectAndNumber);
	if (items.length === 0) return writeEmpty(context, "No tp sessions", json);
	const selection = selectGlobal(items, context.args.positionals);
	if (selection.error) {
		context.stderr(selection.error);
		return 1;
	}
	if (selection.index !== undefined)
		return attachSelected(context, selection.items[0], dependencies);
	items = selection.items;
	const devices = await attachedDevices(items, dependencies);
	if (json) {
		context.stdout(
			`${JSON.stringify(items.map((item) => jsonRecord(item, devices.get(item.session.name) ?? null)))}\n`,
		);
		return 0;
	}
	const prefix = context.args.positionals[0];
	context.stdout(
		`${prefix ? `Tp sessions for '${prefix}':` : "All tp sessions:"}\n`,
	);
	const enabled = colorEnabled();
	items.forEach((item, offset) =>
		context.stdout(
			`${renderListingLine(item, "global", offset + 1, devices.get(item.session.name) ?? null, terminalWidth(), enabled)}\n`,
		),
	);
	context.stdout("\nAttach with: tp g <index>\n");
	return 0;
}

async function allCommand(
	_context: CommandContext,
	dependencies: ListingDependencies = defaultDependencies,
): Promise<number> {
	const context = _context;
	const items = listSessions();
	if (items.length === 0) return writeEmpty(context, "No tmux sessions", false);
	const parsed = items.map(parseTpSession);
	const devices = await attachedDevices(
		parsed.filter((item): item is ParsedListingSession => item !== undefined),
		dependencies,
	);
	const enabled = colorEnabled();
	for (const [offset, session] of items.entries()) {
		const item = parsed[offset];
		if (item)
			context.stdout(
				`${renderListingLine(item, "all", undefined, devices.get(session.name) ?? null, terminalWidth(), enabled)}\n`,
			);
		else {
			const prefix = `  ${session.name}`;
			context.stdout(`${buildLine([prefix], terminalWidth(), enabled)}\n`);
		}
	}
	return 0;
}

export const listingHandlers = {
	ls: lsCommand,
	global: globalCommand,
	all: allCommand,
};

export function registerListingsCommands(): void {
	registerCommandHandler("ls", lsCommand);
	registerCommandHandler("global", globalCommand);
	registerCommandHandler("all", allCommand);
}

export const listingTestDependencies = defaultDependencies;
export {
	byProjectAndNumber,
	byRecent,
	formatDuration,
	parseTpSession,
	renderListingLine,
	selectGlobal,
	terminalWidth,
};
