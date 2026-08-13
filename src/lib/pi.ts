export type PiState = "blocked" | "tool" | "thinking" | "idle";
export type PiMarker = "⏸" | "●" | "○" | "·";
export type PiColour = "yellow" | "cyan" | "blue" | "brblack" | "normal";

export interface PaneOptions {
	sessionId?: string;
	pid?: string | number;
	state?: string;
	tool?: string;
	stateSince?: string | number;
	ctxPct?: string | number;
	model?: string;
	"@pi_session_id"?: string;
	"@pi_pid"?: string | number;
	"@pi_state"?: string;
	"@pi_tool"?: string;
	"@pi_state_since"?: string | number;
	"@pi_ctx_pct"?: string | number;
	"@pi_model"?: string;
}

export interface PiInfo {
	sessionId: string;
	displayId: string;
	pid?: number;
	state?: PiState;
	tool?: string;
	stateSince?: number;
	ctxPct?: number;
	model?: string;
}

export interface PiStateVisual {
	marker: PiMarker;
	colour: PiColour;
}

export const PI_ID_LENGTH = 13;

export function truncatePiId(sessionId: string, length = PI_ID_LENGTH): string {
	return sessionId.slice(0, length);
}

export function mapPiState(value: string | undefined): PiState | undefined {
	if (
		value === "blocked" ||
		value === "tool" ||
		value === "thinking" ||
		value === "idle"
	) {
		return value;
	}
	return undefined;
}

export function stateVisual(state: PiState | string): PiStateVisual {
	switch (state) {
		case "blocked":
			return { marker: "⏸", colour: "yellow" };
		case "tool":
			return { marker: "●", colour: "cyan" };
		case "thinking":
			return { marker: "●", colour: "blue" };
		case "idle":
			return { marker: "○", colour: "brblack" };
		default:
			return { marker: "·", colour: "normal" };
	}
}

export function isProcessAlive(pid: string | number): boolean {
	const value = String(pid);
	if (!/^\d+$/.test(value) || value === "0") return false;
	const result = Bun.spawnSync({
		cmd: ["ps", "-p", value],
		stdout: "ignore",
		stderr: "ignore",
	});
	return result.exitCode === 0;
}

function option(
	options: PaneOptions,
	name: keyof PaneOptions,
	protocolName: keyof PaneOptions,
): unknown {
	return options[name] ?? options[protocolName];
}

function optionalNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value.trim()))
		return Number(value);
	return undefined;
}

/** Decode the options Pi publishes on the active pane. Stale options are hidden. */
export function decodePaneOptions(
	options: PaneOptions,
	alive: (pid: string | number) => boolean = isProcessAlive,
): PiInfo | null {
	const rawId = option(options, "sessionId", "@pi_session_id");
	if (typeof rawId !== "string" || !rawId.trim()) return null;
	const rawPid = option(options, "pid", "@pi_pid");
	if (rawPid === undefined || !alive(rawPid as string | number)) return null;

	const pid = optionalNumber(rawPid);
	const state = mapPiState(
		String(option(options, "state", "@pi_state") ?? "").trim(),
	);
	const stateSince = optionalNumber(
		option(options, "stateSince", "@pi_state_since"),
	);
	const ctxPct = optionalNumber(option(options, "ctxPct", "@pi_ctx_pct"));
	const tool =
		String(option(options, "tool", "@pi_tool") ?? "").trim() || undefined;
	const model =
		String(option(options, "model", "@pi_model") ?? "").trim() || undefined;
	const sessionId = rawId.trim();
	return {
		sessionId,
		displayId: truncatePiId(sessionId),
		...(pid === undefined ? {} : { pid }),
		...(state === undefined ? {} : { state }),
		...(tool ? { tool } : {}),
		...(stateSince === undefined ? {} : { stateSince }),
		...(ctxPct === undefined ? {} : { ctxPct }),
		...(model ? { model } : {}),
	};
}
