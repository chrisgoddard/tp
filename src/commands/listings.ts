import { type CommandContext, registerCommandHandler } from "../lib/cli";
import { resolveAttachedDevice, stampSshSource } from "../lib/origin";
import {
	type ColourName,
	type Segment,
	buildLine,
	colorEnabled,
	colorize,
} from "../lib/output";
import { PI_ID_LENGTH, type PiInfo, stateVisual } from "../lib/pi";
import { formatNumber, parseSessionName, projectName } from "../lib/project";
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

interface ParsedListingSession {
	session: TmuxSession;
	project: string;
	number: number;
}

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

function notImplemented(context: CommandContext): number {
	context.stderr(`tp ${context.command.name}: not implemented yet`);
	return 1;
}

function parseTpSession(
	session: TmuxSession,
): ParsedListingSession | undefined {
	const parsed = parseSessionName(session.name);
	if (!parsed) return undefined;
	return { session, project: parsed.project, number: parsed.number };
}

function byProjectAndNumber(
	left: ParsedListingSession,
	right: ParsedListingSession,
): number {
	return (
		left.project.localeCompare(right.project) || left.number - right.number
	);
}

function byRecent(
	left: ParsedListingSession,
	right: ParsedListingSession,
): number {
	const leftTime = left.session.activityAt
		? Date.parse(left.session.activityAt)
		: Number.NEGATIVE_INFINITY;
	const rightTime = right.session.activityAt
		? Date.parse(right.session.activityAt)
		: Number.NEGATIVE_INFINITY;
	return rightTime - leftTime || byProjectAndNumber(left, right);
}

function terminalWidth(): number {
	const configured = process.env.COLUMNS;
	if (configured && /^\d+$/.test(configured)) return Number(configured);
	const ttyWidth = process.stdout.columns;
	return ttyWidth && ttyWidth > 0 ? ttyWidth : 1000;
}

function formatDuration(seconds: number): string {
	if (seconds < 60) return `${seconds}s`;
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
	if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
	return `${Math.floor(seconds / 86400)}d`;
}

function stateSegment(pi: PiInfo): Segment | undefined {
	if (!pi.state) return undefined;
	const visual = stateVisual(pi.state);
	let text = `${visual.marker} ${pi.state}`;
	if (pi.tool && (pi.state === "tool" || pi.state === "blocked"))
		text += `:${pi.tool}`;
	if (pi.stateSince !== undefined) {
		const age = Math.floor(Date.now() / 1000) - pi.stateSince;
		if (age >= 0) text += ` ${formatDuration(age)}`;
	}
	return { text: `· ${text}`, colour: visual.colour as ColourName };
}

function ctxSegment(pi: PiInfo): Segment | undefined {
	if (pi.ctxPct === undefined) return undefined;
	const colour: ColourName =
		pi.ctxPct >= 85 ? "red" : pi.ctxPct >= 70 ? "yellow" : "brblack";
	return { text: `· ${pi.ctxPct}%`, colour };
}

function modelSegment(pi: PiInfo): Segment | undefined {
	return pi.model ? { text: `· ${pi.model}`, colour: "brblack" } : undefined;
}

function fixedPrefix(
	item: ParsedListingSession,
	kind: "project" | "global" | "all",
	index: number | undefined,
	attachedFrom: string | null,
	enabled: boolean,
): string {
	const { session } = item;
	let prefix: string;
	if (kind === "project")
		prefix = `  ${formatNumber(item.number)}  →  ${session.name}`;
	else if (kind === "global")
		prefix = `  ${String(index).padStart(2, " ")}  →  ${session.name}`;
	else prefix = `  ${session.name}`;
	if (session.label)
		prefix += ` ${colorize(`[${session.label}]`, "green", enabled)}`;
	if (session.pi)
		prefix += ` ${colorize(`pi:${session.pi.displayId.slice(0, PI_ID_LENGTH)}`, "brblack", enabled)}`;
	return prefix;
}

export function renderListingLine(
	item: ParsedListingSession,
	kind: "project" | "global" | "all",
	index: number | undefined,
	attachedFrom: string | null,
	width = terminalWidth(),
	enabled = colorEnabled(),
): string {
	let prefix = fixedPrefix(item, kind, index, attachedFrom, enabled);
	if (item.session.attached) {
		const attached = attachedFrom
			? `(attached: ${attachedFrom})`
			: "(attached)";
		prefix += ` ${colorize(attached, "magenta", enabled)}`;
	}
	const fields: Segment[] = [];
	if (item.session.pi) {
		const pi = item.session.pi;
		const state = stateSegment(pi);
		if (state) {
			fields.push(state);
			const ctx = ctxSegment(pi);
			if (ctx) fields.push(ctx);
			const model = modelSegment(pi);
			if (model) fields.push(model);
		}
	}
	return buildLine([prefix, ...fields], width, enabled);
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
	const items = listSessions()
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
	let items = listSessions()
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
	for (const command of ["w", "b", "status"])
		registerCommandHandler(command, notImplemented);
}

export const listingTestDependencies = defaultDependencies;
export { formatDuration, selectGlobal };
