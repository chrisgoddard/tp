import { describe, expect, test } from "bun:test";
import {
	formatDuration,
	renderListingLine,
	selectGlobal,
} from "../../src/commands/listings";
import type { TmuxSession } from "../../src/lib/tmux";

function item(
	name: string,
	label?: string,
): Parameters<typeof renderListingLine>[0] {
	const underscore = name.lastIndexOf("_");
	return {
		session: {
			name,
			...(label ? { label } : {}),
			attached: false,
			pi: {
				sessionId: "123456789012345678",
				displayId: "1234567890123",
				state: "blocked",
				tool: "bash",
				stateSince: Math.floor(Date.now() / 1000) - 4,
				ctxPct: 85,
				model: "model",
			},
		},
		project: name.slice(0, underscore),
		number: Number(name.slice(underscore + 1)),
	};
}

describe("listing rendering", () => {
	test("keeps the stable prefix when there is room", () => {
		const full = renderListingLine(
			item("demo_002", "api"),
			"project",
			undefined,
			null,
			200,
			false,
		);
		expect(full).toContain("  002  →  demo_002 [api] pi:1234567890123");
	});

	test("renders state fields and drops them from the right", () => {
		const session = item("demo_002", "api");
		session.session.attached = false;
		const full = renderListingLine(
			session,
			"project",
			undefined,
			null,
			200,
			false,
		);
		expect(full).toContain("· ⏸ blocked:bash 4s · 85% · model");
		const stateOnly = renderListingLine(
			session,
			"project",
			undefined,
			null,
			65,
			false,
		);
		expect(stateOnly).toContain("· ⏸ blocked:bash 4s");
		expect(stateOnly).not.toContain("85%");
	});

	test("does not emit ANSI when colour is disabled", () => {
		const session = item("demo_002", "api");
		session.session.attached = true;
		expect(
			renderListingLine(session, "project", undefined, "mac", 200, false),
		).toContain("(attached: mac)");
		expect(
			renderListingLine(session, "project", undefined, "mac", 200, false),
		).not.toContain("\u001b[");
	});
});

describe("listing selectors and durations", () => {
	test("formats compact durations", () => {
		expect(formatDuration(4)).toBe("4s");
		expect(formatDuration(187)).toBe("3m");
		expect(formatDuration(7500)).toBe("2h");
	});

	test("distinguishes an index from a project prefix", () => {
		const sessions = ["api_001", "demo_001", "demo_002"].map((name) => ({
			session: { name, attached: false, pi: null } as TmuxSession,
			project: name.slice(0, name.lastIndexOf("_")),
			number: Number(name.slice(name.lastIndexOf("_") + 1)),
		}));
		expect(selectGlobal(sessions, ["2"])).toMatchObject({
			index: 2,
			items: [sessions[1]],
		});
		expect(selectGlobal(sessions, ["demo"]).items).toEqual(sessions.slice(1));
		expect(selectGlobal(sessions, ["demo", "2"]).items).toEqual([sessions[2]]);
		expect(selectGlobal(sessions, ["missing"]).error).toContain(
			"No tp sessions",
		);
	});
});
