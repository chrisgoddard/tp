import { type Layout, isLayout } from "./config";
import { newSession, tmuxCommand } from "./tmux";

export class LayoutError extends Error {
	readonly exitCode = 1;
}

function entryDescription(index: number, value: unknown): string {
	if (typeof value === "object" && value !== null && !Array.isArray(value)) {
		const name = (value as Record<string, unknown>).name;
		if (typeof name === "string" && name) return `entry ${index} ('${name}')`;
	}
	return `entry ${index}`;
}

function validateLayout(layoutName: string, value: unknown): Layout {
	if (!isLayout(value)) {
		const windows =
			typeof value === "object" && value !== null && !Array.isArray(value)
				? (value as Record<string, unknown>).windows
				: undefined;
		if (!Array.isArray(windows))
			throw new LayoutError(
				`Invalid layout '${layoutName}': windows must be an array`,
			);
		for (const [index, entry] of windows.entries()) {
			const description = entryDescription(index, entry);
			if (
				typeof entry !== "object" ||
				entry === null ||
				Array.isArray(entry) ||
				typeof (entry as Record<string, unknown>).name !== "string" ||
				!(entry as Record<string, unknown>).name
			)
				throw new LayoutError(
					`Invalid layout '${layoutName}' ${description}: missing name`,
				);
			const raw = entry as Record<string, unknown>;
			if (raw.split !== undefined && raw.split !== "h" && raw.split !== "v")
				throw new LayoutError(
					`Invalid layout '${layoutName}' ${description}: invalid split '${String(raw.split)}'`,
				);
			if (raw.cmd !== undefined && typeof raw.cmd !== "string")
				throw new LayoutError(
					`Invalid layout '${layoutName}' ${description}: invalid cmd`,
				);
		}
		throw new LayoutError(`Invalid layout '${layoutName}'`);
	}
	for (const [index, entry] of value.windows.entries()) {
		if (!entry.name.trim())
			throw new LayoutError(
				`Invalid layout '${layoutName}' entry ${index}: missing name`,
			);
		if (entry.split && index === 0)
			throw new LayoutError(
				`Invalid layout '${layoutName}' ${entryDescription(index, entry)}: split requires a previous window`,
			);
	}
	return value;
}

function command(shell: string, value: string | undefined): readonly string[] {
	return value === undefined ? [] : [shell, "-c", value];
}

/** Create a detached tmux session from one validated configured layout. */
export function createLayoutSession(
	session: string,
	layoutName: string,
	value: unknown,
	options: { cwd: string; shell: string },
): void {
	const layout = validateLayout(layoutName, value);
	const first = layout.windows[0];
	if (!first)
		throw new LayoutError(`Invalid layout '${layoutName}': windows is empty`);

	newSession(session, {
		cwd: options.cwd,
		command: command(options.shell, first.cmd),
	});
	tmuxCommand(["rename-window", "-t", `${session}:0`, first.name]);
	tmuxCommand(["select-pane", "-t", `${session}:0.0`, "-T", first.name]);

	let windowIndex = 0;
	for (const entry of layout.windows.slice(1)) {
		if (entry.split) {
			const pane = tmuxCommand([
				"split-window",
				`-${entry.split}`,
				"-t",
				`${session}:${windowIndex}`,
				"-P",
				"-F",
				"#{pane_id}",
				"-c",
				options.cwd,
				...(entry.cmd ? ["--", ...command(options.shell, entry.cmd)] : []),
			]).trim();
			if (pane) tmuxCommand(["select-pane", "-t", pane, "-T", entry.name]);
			continue;
		}
		windowIndex += 1;
		tmuxCommand([
			"new-window",
			"-t",
			session,
			"-n",
			entry.name,
			"-c",
			options.cwd,
			...(entry.cmd ? ["--", ...command(options.shell, entry.cmd)] : []),
		]);
	}

	// Creating a later window selects it even for a detached session.
	tmuxCommand(["select-window", "-t", `${session}:0`]);
}
