import { type CommandContext, registerCommandHandler } from "../lib/cli";
import { loadConfig } from "../lib/config";
import {
	type ParsedListingSession,
	byRecent,
	parseTpSession,
	renderListingLine,
	terminalWidth,
} from "../lib/listing-render";
import { stampSshSource } from "../lib/origin";
import { colorEnabled } from "../lib/output";
import { withRawMode } from "../lib/raw-mode";
import { attach, listSessions, tmuxCommand } from "../lib/tmux";

const POPUP_ENV = "TP_POP";
const MIN_TMUX_MAJOR = 3;
const MIN_TMUX_MINOR = 2;
const COMPACT_WIDTH = 96;
type PopResult = ParsedListingSession | null;
type Output = (text: string) => void;

function tmuxVersionSupported(output: string): boolean {
	const match = /(?:^|\s)tmux\s+(\d+)\.(\d+)/u.exec(output);
	if (!match) return false;
	const major = Number(match[1]);
	const minor = Number(match[2]);
	return (
		major > MIN_TMUX_MAJOR ||
		(major === MIN_TMUX_MAJOR && minor >= MIN_TMUX_MINOR)
	);
}

function requireTmuxVersion(context: CommandContext): boolean {
	let version = "";
	try {
		version = tmuxCommand(["-V"], true).trim();
	} catch {
		// The version check below reports a useful message for missing or broken
		// tmux binaries as well as for versions that predate display-popup.
	}
	if (tmuxVersionSupported(version)) return true;
	context.stderr(
		`tp pop requires tmux >= 3.2${version ? ` (found ${version})` : ""}`,
	);
	return false;
}

function sortPopSessions(
	items: readonly ParsedListingSession[],
): ParsedListingSession[] {
	return [...items].sort(
		(left, right) =>
			Number(right.session.pi?.state === "blocked") -
				Number(left.session.pi?.state === "blocked") || byRecent(left, right),
	);
}

function popSessions(): ParsedListingSession[] {
	return sortPopSessions(
		listSessions()
			.map(parseTpSession)
			.filter((item): item is ParsedListingSession => item !== undefined),
	);
}

function matchesQuery(item: ParsedListingSession, query: string): boolean {
	if (!query) return true;
	const needle = query.toLocaleLowerCase();
	return [item.project, item.session.label ?? "", String(item.number)].some(
		(value) => value.toLocaleLowerCase().includes(needle),
	);
}

function filteredPopSessions(
	items: readonly ParsedListingSession[],
	query: string,
): ParsedListingSession[] {
	return items.filter((item) => matchesQuery(item, query));
}

function draw(
	write: Output,
	items: readonly ParsedListingSession[],
	query: string,
	selected: number,
): void {
	const enabled = colorEnabled({ configColor: loadConfig().color });
	const width = Math.max(20, Math.min(terminalWidth(), COMPACT_WIDTH));
	write("\u001b[2J\u001b[H");
	write(`tp pop${query ? `  filter: ${query}` : ""}\n`);
	if (items.length === 0) {
		write("No matching tp sessions.\n");
		return;
	}
	items.forEach((item, index) => {
		const line = renderListingLine(
			item,
			"global",
			index + 1,
			null,
			width,
			enabled,
		);
		write(`${index === selected ? ">" : " "}${line.slice(1)}\n`);
	});
	write(
		"\nType to filter · ↑/↓ or ctrl-n/ctrl-p · Enter select · Esc/q quit\n",
	);
}

function ansiSequenceLength(value: string): number | undefined {
	if (!value.startsWith("\u001b[")) return undefined;
	for (let index = 2; index < value.length; index += 1) {
		const code = value.charCodeAt(index);
		if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122))
			return index + 1;
	}
	return undefined;
}

function moveSelection(current: number, count: number, delta: number): number {
	if (count === 0) return 0;
	return (current + delta + count) % count;
}

/**
 * Read one popup key at a time. The returned null means that the picker was
 * dismissed without selecting a session.
 */
async function pickSession(
	items: readonly ParsedListingSession[],
	write: Output,
): Promise<PopResult> {
	let query = "";
	let selected = 0;
	let visible = filteredPopSessions(items, query);
	draw(write, visible, query, selected);

	return withRawMode(
		() =>
			new Promise<PopResult>((resolve) => {
				const input = process.stdin as NodeJS.ReadStream;
				let pending = "";
				let escapeTimer: ReturnType<typeof setTimeout> | undefined;
				let settled = false;

				const finish = (result: PopResult): void => {
					if (settled) return;
					settled = true;
					if (escapeTimer !== undefined) clearTimeout(escapeTimer);
					input.off("data", onData);
					resolve(result);
				};

				const redraw = (): void => draw(write, visible, query, selected);
				const accept = (): void => {
					finish(visible[selected] ?? null);
				};

				const consume = (text: string): void => {
					pending += text;
					while (pending) {
						if (pending === "\u001b") {
							escapeTimer = setTimeout(() => finish(null), 30);
							return;
						}
						if (pending.startsWith("\u001b[")) {
							const sequenceLength = ansiSequenceLength(pending);
							if (sequenceLength === undefined) return;
							const sequence = pending.slice(0, sequenceLength);
							pending = pending.slice(sequenceLength);
							if (sequence.endsWith("A")) {
								selected = moveSelection(selected, visible.length, -1);
								redraw();
							} else if (sequence.endsWith("B")) {
								selected = moveSelection(selected, visible.length, 1);
								redraw();
							}
							continue;
						}

						const character = pending[0];
						pending = pending.slice(1);
						switch (character) {
							case "\u0003":
							case "\u001b":
							case "q":
								finish(null);
								return;
							case "\r":
							case "\n":
								accept();
								return;
							case "\u000e":
								selected = moveSelection(selected, visible.length, 1);
								redraw();
								break;
							case "\u0010":
								selected = moveSelection(selected, visible.length, -1);
								redraw();
								break;
							case "\u0008":
							case "\u007f":
								query = query.slice(0, -1);
								visible = filteredPopSessions(items, query);
								selected = 0;
								redraw();
								break;
							default:
								if (character >= " " && character !== "\u007f") {
									query += character;
									visible = filteredPopSessions(items, query);
									selected = 0;
									redraw();
								}
						}
					}
				};

				function onData(data: Buffer | string): void {
					if (escapeTimer !== undefined) {
						clearTimeout(escapeTimer);
						escapeTimer = undefined;
					}
					consume(typeof data === "string" ? data : data.toString("utf8"));
				}

				input.on("data", onData);
			}),
		process.stdin as NodeJS.ReadStream,
	);
}

async function selectAndAttach(item: ParsedListingSession): Promise<number> {
	if (!process.env.TMUX) await stampSshSource(process.env.TTY ?? "");
	return attach(item.session.name);
}

async function runPicker(context: CommandContext): Promise<number> {
	if (!process.stdin.isTTY || !process.stdout.isTTY) {
		context.stderr("tp pop needs a terminal");
		return 2;
	}
	const items = popSessions();
	if (items.length === 0) {
		context.stderr("No tp sessions");
		return 0;
	}
	const selected = await pickSession(items, (text) =>
		process.stderr.write(text),
	);
	return selected ? selectAndAttach(selected) : 0;
}

function openPopup(): number {
	const entrypoint = process.argv[1] ?? "tp";
	const popupEnvironment = [`${POPUP_ENV}=1`, `TMUX=${process.env.TMUX}`];
	if (process.env.TMUX_PANE)
		popupEnvironment.push(`TMUX_PANE=${process.env.TMUX_PANE}`);
	tmuxCommand([
		"display-popup",
		"-E",
		"--",
		"env",
		...popupEnvironment,
		process.execPath,
		entrypoint,
		"pop",
	]);
	return 0;
}

async function popCommand(context: CommandContext): Promise<number> {
	if (!requireTmuxVersion(context)) return 1;
	if (process.env.TMUX && process.env[POPUP_ENV] !== "1") return openPopup();
	return runPicker(context);
}

export const popInternals = {
	filteredPopSessions,
	moveSelection,
	sortPopSessions,
	tmuxVersionSupported,
};

export function registerPopCommands(): void {
	registerCommandHandler("pop", popCommand);
}
