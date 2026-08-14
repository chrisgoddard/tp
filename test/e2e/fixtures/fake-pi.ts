#!/usr/bin/env bun

import { spawnSync } from "node:child_process";

interface FixtureOptions {
	socket: string;
	sessionId: string;
	state: string;
	tool: string;
	stateSince: string;
	ctxPct: string;
	model: string;
}

function argument(name: string, fallback: string): string {
	const index = process.argv.indexOf(name);
	return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const options: FixtureOptions = {
	socket: argument("--socket", ""),
	sessionId: argument("--session-id", "fake-pi-session"),
	state: argument("--state", "idle"),
	tool: argument("--tool", "bash"),
	stateSince: argument("--state-since", String(Math.floor(Date.now() / 1000))),
	ctxPct: argument("--ctx-pct", "24"),
	model: argument("--model", "test-model"),
};

if (!options.socket || !process.env.TMUX_PANE) {
	console.error("fake-pi: --socket and TMUX_PANE are required");
	process.exit(2);
}

const tmux = (args: string[]) =>
	spawnSync("tmux", ["-L", options.socket, "-f", "/dev/null", ...args], {
		stdio: ["ignore", "ignore", "inherit"],
	});

for (const [name, value] of Object.entries({
	"@pi_session_id": options.sessionId,
	"@pi_pid": String(process.pid),
	"@pi_state": options.state,
	"@pi_tool": options.tool,
	"@pi_state_since": options.stateSince,
	"@pi_ctx_pct": options.ctxPct,
	"@pi_model": options.model,
})) {
	const result = tmux([
		"set-option",
		"-p",
		"-t",
		process.env.TMUX_PANE,
		name,
		value,
	]);
	if (result.status !== 0) process.exit(result.status ?? 1);
}

// Keep the pane alive while leaving all published options behind if this
// process is killed. tp's decoder must verify @pi_pid with `ps -p`.
await new Promise<void>(() => undefined);
