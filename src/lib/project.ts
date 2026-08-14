import { basename } from "node:path";

export interface ParsedSessionName {
	project: string;
	number: number;
}

/** Derive the tmux project prefix from a directory path. */
export function projectName(cwd = process.cwd()): string {
	const name = basename(cwd);
	return name.replace(/^\.+/, "");
}

export function parseNumber(value: string | number): number {
	const text = String(value);
	if (!/^\d+$/.test(text)) {
		throw new RangeError(`Invalid session number: ${text}`);
	}
	const number = Number.parseInt(text, 10);
	if (!Number.isSafeInteger(number)) {
		throw new RangeError(`Session number is too large: ${text}`);
	}
	return number;
}

export function tryParseNumber(value: string | number): number | undefined {
	try {
		return parseNumber(value);
	} catch {
		return undefined;
	}
}

export function formatNumber(value: string | number): string {
	return parseNumber(value).toString().padStart(3, "0");
}

export function sessionName(project: string, number: string | number): string {
	return `${project}_${formatNumber(number)}`;
}

export function parseSessionName(name: string): ParsedSessionName | undefined {
	const match = /^(.*)_(\d+)$/.exec(name);
	if (!match || !match[1]) return undefined;
	return { project: match[1], number: parseNumber(match[2]) };
}

export function nextNumber(names: Iterable<string>, project: string): number {
	let highest = 0;
	for (const name of names) {
		const parsed = parseSessionName(name);
		if (parsed?.project === project && parsed.number > highest)
			highest = parsed.number;
	}
	return highest + 1;
}

export function compareSessionNames(left: string, right: string): number {
	const a = parseSessionName(left);
	const b = parseSessionName(right);
	if (!a || !b) return left.localeCompare(right);
	return a.project.localeCompare(b.project) || a.number - b.number;
}

export function sortSessionNames(names: readonly string[]): string[] {
	return [...names].sort(compareSessionNames);
}
