export type ColourName =
	| "yellow"
	| "cyan"
	| "blue"
	| "brblack"
	| "green"
	| "magenta"
	| "red"
	| "normal";
export type ColourMode = "always" | "never";

export interface ColourOptions {
	env?: Record<string, string | undefined>;
	configColor?: string;
	isTTY?: boolean;
}

export interface Segment {
	text: string;
	colour?: ColourName;
	separator?: string;
}

const ANSI: Record<ColourName, string> = {
	yellow: "\u001b[33m",
	cyan: "\u001b[36m",
	blue: "\u001b[34m",
	brblack: "\u001b[90m",
	green: "\u001b[32m",
	magenta: "\u001b[35m",
	red: "\u001b[31m",
	normal: "\u001b[m",
};
function requestedColour(value: string | undefined): ColourMode | undefined {
	const requested = value?.toLowerCase();
	if (
		requested === "always" ||
		requested === "1" ||
		requested === "yes" ||
		requested === "true"
	)
		return "always";
	if (
		requested === "never" ||
		requested === "0" ||
		requested === "no" ||
		requested === "false"
	)
		return "never";
	return undefined;
}

export function colourMode(options: ColourOptions = {}): ColourMode {
	const env = options.env ?? process.env;
	if (Object.prototype.hasOwnProperty.call(env, "NO_COLOR")) return "never";
	const environmentColour = requestedColour(env.TP_COLOR);
	if (environmentColour !== undefined) return environmentColour;
	const configColour = requestedColour(options.configColor);
	if (configColour !== undefined) return configColour;
	if (env.TERM === "dumb") return "never";
	return (options.isTTY ?? Boolean(process.stdout.isTTY)) ? "always" : "never";
}

export const colorMode = colourMode;

export function colorEnabled(options: ColourOptions = {}): boolean {
	return colourMode(options) === "always";
}

export function stripAnsi(text: string): string {
	let result = "";
	for (let index = 0; index < text.length; index += 1) {
		if (text.charCodeAt(index) !== 27) {
			result += text[index];
			continue;
		}
		const kind = text[index + 1];
		if (kind === "[") {
			index += 2;
			while (
				index < text.length &&
				(text.charCodeAt(index) < 0x40 || text.charCodeAt(index) > 0x7e)
			)
				index += 1;
		} else if (kind === "]") {
			index += 2;
			while (index < text.length && text.charCodeAt(index) !== 7) {
				if (text.charCodeAt(index) === 27 && text[index + 1] === "\\") {
					index += 1;
					break;
				}
				index += 1;
			}
		} else if (kind === "(") {
			index += 2;
		}
	}
	return result;
}

export function visibleLength(text: string): number {
	return Array.from(stripAnsi(text)).length;
}

export function colorize(
	text: string,
	colour: ColourName | undefined,
	enabled = true,
): string {
	if (!colour || !enabled) return stripAnsi(text);
	return `${ANSI[colour]}${text}${ANSI.normal}`;
}

export function renderSegment(
	segment: Segment | string,
	enabled = true,
): string {
	if (typeof segment === "string")
		return enabled ? segment : stripAnsi(segment);
	const separator = segment.separator ?? "";
	return `${separator}${colorize(segment.text, segment.colour, enabled)}`;
}

/** Build a line, discarding the least important (rightmost) fields first. */
export function buildLine(
	segments: readonly (Segment | string)[],
	width: number,
	enabled = true,
): string {
	if (!Number.isFinite(width) || width < 1) return "";
	const kept = segments.map((segment) => renderSegment(segment, enabled));
	while (kept.length > 1 && visibleLength(kept.join(" ")) > width) kept.pop();
	return enabled ? kept.join(" ") : stripAnsi(kept.join(" "));
}

export class OutputEngine {
	readonly enabled: boolean;

	constructor(options: ColourOptions = {}) {
		this.enabled = colorEnabled(options);
	}

	colour(text: string, colour?: ColourName): string {
		return colorize(text, colour, this.enabled);
	}

	line(segments: readonly (Segment | string)[], width: number): string {
		return buildLine(segments, width, this.enabled);
	}
}
