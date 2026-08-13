import {
	type ColourName,
	type Segment,
	buildLine,
	colorEnabled,
	colorize,
} from "./output";
import { PI_ID_LENGTH, type PiInfo, stateVisual } from "./pi";
import { formatNumber, parseSessionName } from "./project";
import type { TmuxSession } from "./tmux";

export interface ParsedListingSession {
	session: TmuxSession;
	project: string;
	number: number;
}

export function parseTpSession(
	session: TmuxSession,
): ParsedListingSession | undefined {
	const parsed = parseSessionName(session.name);
	if (!parsed) return undefined;
	return { session, project: parsed.project, number: parsed.number };
}

export function byProjectAndNumber(
	left: ParsedListingSession,
	right: ParsedListingSession,
): number {
	return (
		left.project.localeCompare(right.project) || left.number - right.number
	);
}

export function byRecent(
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

export function terminalWidth(): number {
	const configured = process.env.COLUMNS;
	if (configured && /^\d+$/.test(configured)) return Number(configured);
	const ttyWidth = process.stdout.columns;
	return ttyWidth && ttyWidth > 0 ? ttyWidth : 1000;
}

export function formatDuration(seconds: number): string {
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
	_attachedFrom: string | null,
	width = terminalWidth(),
	enabled = colorEnabled(),
): string {
	let prefix = fixedPrefix(item, kind, index, enabled);
	if (item.session.attached) {
		const attached = _attachedFrom
			? `(attached: ${_attachedFrom})`
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
