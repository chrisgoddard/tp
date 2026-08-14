import { afterAll, expect, test } from "bun:test";
import {
	hasSession,
	killSession,
	listSessions,
	newSession,
	setOption,
	tmuxCommand,
} from "../../src/lib/tmux";

const socket = `tp-corelib-${process.pid}`;
const oldSocket = process.env.TP_TMUX_SOCKET;
process.env.TP_TMUX_SOCKET = socket;

afterAll(() => {
	tmuxCommand(["kill-server"], true);
	if (oldSocket === undefined) process.env.TP_TMUX_SOCKET = undefined;
	else process.env.TP_TMUX_SOCKET = oldSocket;
});

test("tmux round-trips a session and active-pane Pi options", () => {
	const name = "corelib project_001";
	try {
		newSession(name, { cwd: process.cwd() });
		setOption(name, "@tp_name", "round trip");
		setOption(name, "@pi_session_id", "abcdef0123456789");
		setOption(name, "@pi_pid", String(process.pid));
		setOption(name, "@pi_state", "thinking");
		setOption(name, "@pi_model", "test-model");
		expect(hasSession(name)).toBe(true);
		const session = listSessions().find((item) => item.name === name);
		expect(session).toMatchObject({
			name,
			label: "round trip",
			pi: {
				sessionId: "abcdef0123456789",
				displayId: "abcdef0123456",
				state: "thinking",
				model: "test-model",
			},
		});
	} finally {
		if (hasSession(name)) killSession(name);
	}
});
