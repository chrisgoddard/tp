import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import {
	type DifferentialRunOptions,
	DifferentialTmuxServer,
	describeBytes,
	intentionalDivergences,
	normalizeStderr,
	projectName,
	runFishTp,
	runTypeScriptTp,
} from "./fixtures/differential";
import type { CommandResult } from "./harness";

interface Pair {
	fish: DifferentialTmuxServer;
	ts: DifferentialTmuxServer;
}

interface Command {
	id: string;
	args: string[];
	env?: Record<string, string | undefined>;
}

const projectRoot = mkdtempSync(join("/tmp", "tp-parity-project-"));
const homeRoot = mkdtempSync(join("/tmp", "tp-parity-home-"));
const project = projectName(projectRoot);
const commonEnv: Record<string, string> = {
	HOME: homeRoot,
	XDG_CONFIG_HOME: join(homeRoot, "config"),
	XDG_STATE_HOME: join(homeRoot, "state"),
	TP_SHOT_DIR: join(homeRoot, "screenshots"),
	TERM: "xterm-256color",
	COLUMNS: "1000",
};
mkdirSync(commonEnv.XDG_CONFIG_HOME, { recursive: true });
mkdirSync(commonEnv.XDG_STATE_HOME, { recursive: true });
mkdirSync(commonEnv.TP_SHOT_DIR, { recursive: true });

const counts = {
	scenarios: 0,
	commands: 0,
	exact: 0,
	intentional: new Map<string, number>(),
};

function createPair(): Pair {
	return {
		fish: new DifferentialTmuxServer(projectRoot),
		ts: new DifferentialTmuxServer(projectRoot),
	};
}

function createSession(pair: Pair, number: number): string {
	const name = `${project}_${String(number).padStart(3, "0")}`;
	pair.fish.newSession(name);
	pair.ts.newSession(name);
	return name;
}

function setSessionLabel(pair: Pair, name: string, label: string): void {
	pair.fish.setSessionOption(name, "@tp_name", label);
	pair.ts.setSessionOption(name, "@tp_name", label);
}

function setPiOptions(
	pair: Pair,
	name: string,
	options: {
		sessionId: string;
		pid: string;
		state?: string;
		tool?: string;
		stateSince?: string;
		ctxPct?: string;
		model?: string;
	},
): void {
	const values: Record<string, string> = {
		"@pi_session_id": options.sessionId,
		"@pi_pid": options.pid,
		"@pi_state": options.state ?? "idle",
		"@pi_tool": options.tool ?? "bash",
		"@pi_state_since": options.stateSince ?? "1700000000",
		"@pi_ctx_pct": options.ctxPct ?? "24",
		"@pi_model": options.model ?? "test-model",
	};
	for (const [option, value] of Object.entries(values)) {
		pair.fish.setPaneOption(name, option, value);
		pair.ts.setPaneOption(name, option, value);
	}
}

function findIntentional(id: string): typeof intentionalDivergences {
	return intentionalDivergences.filter((item) => item.id === id);
}

function compareField(
	id: string,
	field: keyof CommandResult,
	fish: CommandResult,
	ts: CommandResult,
	roots: readonly string[],
	sockets: readonly string[],
): void {
	const fishValue =
		field === "stderr"
			? normalizeStderr(fish[field], { roots, sockets })
			: fish[field];
	const tsValue =
		field === "stderr"
			? normalizeStderr(ts[field], { roots, sockets })
			: ts[field];
	const intentional = findIntentional(id).find((item) => item.field === field);
	if (intentional) {
		expect(
			fishValue,
			`${id}: expected intentional ${field} divergence (${intentional.reason})`,
		).not.toBe(tsValue);
		counts.intentional.set(
			`${id} [${field}] — ${intentional.reason}`,
			(counts.intentional.get(`${id} [${field}] — ${intentional.reason}`) ??
				0) + 1,
		);
		return;
	}
	expect(
		fishValue,
		`${id}: ${field} differs\nfish=${describeBytes(String(fishValue))}\nts=${describeBytes(String(tsValue))}`,
	).toBe(tsValue);
}

async function compare(pair: Pair, command: Command): Promise<void> {
	const env = { ...commonEnv, ...command.env } as Record<
		string,
		string | undefined
	>;
	const fishOptions: DifferentialRunOptions & { socket: string } = {
		cwd: projectRoot,
		env,
		socket: pair.fish.socket,
	};
	const tsOptions: DifferentialRunOptions & { socket: string } = {
		cwd: projectRoot,
		env,
		socket: pair.ts.socket,
	};
	const [fish, ts] = await Promise.all([
		runFishTp(command.args, fishOptions),
		runTypeScriptTp(command.args, tsOptions),
	]);
	const roots = [projectRoot, homeRoot, pair.fish.root, pair.ts.root];
	const sockets = [pair.fish.socket, pair.ts.socket];
	compareField(command.id, "stdout", fish, ts, roots, sockets);
	compareField(command.id, "stderr", fish, ts, roots, sockets);
	compareField(command.id, "exitCode", fish, ts, roots, sockets);
	counts.commands += 1;
	const intentional = findIntentional(command.id);
	if (intentional.length === 0) counts.exact += 1;
}

async function scenario(
	name: string,
	setup: (pair: Pair) => void | Promise<void>,
	commands: Command[],
): Promise<void> {
	const pair = createPair();
	pair.fish.start();
	pair.ts.start();
	counts.scenarios += 1;
	try {
		for (const server of [pair.fish, pair.ts]) {
			const probe = server.verifyFishShim();
			expect(probe.exitCode, `${name}: fish tmux shim failed`).toBe(0);
			expect(
				probe.stdout,
				`${name}: shim did not see its scratch server`,
			).toContain("shim_probe_001");
			expect(
				probe.stdout.trim().split("\n"),
				`${name}: shim leaked another server`,
			).toHaveLength(1);
		}
		await setup(pair);
		for (const command of commands) await compare(pair, command);
	} finally {
		pair.fish.teardown();
		pair.ts.teardown();
	}
}

function commands(
	prefix: string,
	entries: Array<[string, string[]]>,
	env?: Record<string, string | undefined>,
): Command[] {
	return entries.map(([suffix, args]) => ({
		id: `${prefix}/${suffix}`,
		args,
		env,
	}));
}

function fakePiStateCommands(prefix: string): Command[] {
	return [
		...commands(prefix, [
			["ls", ["ls"]],
			["g", ["g"]],
		]),
		...[1, 2, 3, 4].map((number) => ({
			id: `${prefix}/sid-${number}`,
			args: ["sid", String(number)],
		})),
	];
}

afterAll(() => {
	rmSync(projectRoot, { recursive: true, force: true });
	rmSync(homeRoot, { recursive: true, force: true });
});

test(
	"legacy Fish and TypeScript are byte-level differential peers",
	async () => {
		await scenario(
			"empty",
			() => undefined,
			commands("empty", [
				["ls", ["ls"]],
				["g", ["g"]],
				["sid", ["sid"]],
				["kill-3", ["kill", "3"]],
				["name-1", ["name", "1", "x"]],
				["shot-dir", ["shot", "dir"]],
			]),
		);

		await scenario(
			"three",
			(pair) => {
				createSession(pair, 1);
				createSession(pair, 2);
				createSession(pair, 3);
				setSessionLabel(pair, `${project}_001`, "alpha");
				setSessionLabel(pair, `${project}_002`, "g");
				setSessionLabel(pair, `${project}_003`, "alpine");
			},
			commands("three", [
				["ls", ["ls"]],
				["g", ["g"]],
				["g-prefix", ["g", project.slice(0, 4)]],
				["sid-2", ["sid", "2"]],
				["name-2", ["name", "2", "newlabel"]],
				["ls-after-name", ["ls"]],
				["bad-99x", ["99x"]],
				["bad-kill", ["kill", "nope"]],
			]),
		);

		await scenario(
			"fake-pi",
			(pair) => {
				const states = ["blocked", "tool", "thinking", "idle"];
				for (const [offset, state] of states.entries()) {
					const name = `${project}_${String(offset + 1).padStart(3, "0")}`;
					const fish = pair.fish.startFakePi({
						sessionName: name,
						sessionId: `fake-${offset + 1}-session-id`,
						state,
						tool: state === "tool" ? "read" : "bash",
						stateSince: 1700000000,
						ctxPct: 24,
						model: "test-model",
					});
					const ts = pair.ts.startFakePi({
						sessionName: name,
						sessionId: `fake-${offset + 1}-session-id`,
						state,
						tool: state === "tool" ? "read" : "bash",
						stateSince: 1700000000,
						ctxPct: 24,
						model: "test-model",
					});
					setSessionLabel(pair, name, `state-${state}`);
					if (fish.pid <= 0 || ts.pid <= 0)
						throw new Error("fake Pi pid missing");
				}
			},
			fakePiStateCommands("fake-pi"),
		);

		await scenario(
			"liveness",
			(pair) => {
				const dead = `${project}_001`;
				const fish = pair.fish.startFakePi({
					sessionName: dead,
					sessionId: "dead-session-id",
					state: "blocked",
					tool: "bash",
					stateSince: 1700000000,
					ctxPct: 24,
					model: "test-model",
				});
				const ts = pair.ts.startFakePi({
					sessionName: dead,
					sessionId: "dead-session-id",
					state: "blocked",
					tool: "bash",
					stateSince: 1700000000,
					ctxPct: 24,
					model: "test-model",
				});
				// The fixture publishes its pid; killing it leaves the tmux options behind.
				process.kill(fish.pid, "SIGKILL");
				process.kill(ts.pid, "SIGKILL");
				const withoutPid = createSession(pair, 2);
				setPiOptions(pair, withoutPid, {
					sessionId: "id-without-pid",
					pid: "",
					state: "idle",
					stateSince: "1700000000",
				});
			},
			commands("liveness", [["ls", ["ls"]]]),
		);

		for (const width of [200, 100, 80, 60, 40]) {
			await scenario(
				`width-${width}`,
				(pair) => {
					const name = `${project}_001`;
					const fish = pair.fish.startFakePi({
						sessionName: name,
						sessionId: "width-session-id",
						state: "blocked",
						tool: "bash",
						stateSince: 1700000000,
						ctxPct: 61,
						model: "width-model",
					});
					const ts = pair.ts.startFakePi({
						sessionName: name,
						sessionId: "width-session-id",
						state: "blocked",
						tool: "bash",
						stateSince: 1700000000,
						ctxPct: 61,
						model: "width-model",
					});
					setSessionLabel(pair, name, "width-label");
					if (fish.pid <= 0 || ts.pid <= 0)
						throw new Error("fake Pi pid missing");
				},
				commands(`width-${width}`, [["ls", ["ls"]]], {
					COLUMNS: String(width),
				}),
			);
		}

		for (const [name, env] of [
			["always", { TP_COLOR: "always" }],
			["no-color", { TP_COLOR: "always", NO_COLOR: "1" }],
			["never", { TP_COLOR: "never" }],
		] as const) {
			await scenario(
				`color-${name}`,
				(pair) => {
					const session = `${project}_001`;
					const fish = pair.fish.startFakePi({
						sessionName: session,
						sessionId: "color-session-id",
						state: "blocked",
						tool: "bash",
						stateSince: 1700000000,
						ctxPct: 70,
						model: "color-model",
					});
					const ts = pair.ts.startFakePi({
						sessionName: session,
						sessionId: "color-session-id",
						state: "blocked",
						tool: "bash",
						stateSince: 1700000000,
						ctxPct: 70,
						model: "color-model",
					});
					setSessionLabel(pair, session, "color-label");
					if (fish.pid <= 0 || ts.pid <= 0)
						throw new Error("fake Pi pid missing");
				},
				commands(`color-${name}`, [["ls", ["ls"]]], env),
			);
		}

		await scenario(
			"kill-non-tty",
			(pair) => {
				createSession(pair, 1);
			},
			commands("kill-non-tty", [["kill", ["kill"]]]),
		);

		await scenario(
			"errors",
			(pair) => {
				createSession(pair, 1);
				createSession(pair, 2);
				createSession(pair, 3);
				setSessionLabel(pair, `${project}_001`, "alpha");
				setSessionLabel(pair, `${project}_002`, "alpine");
			},
			commands("errors", [
				["ambiguous-label", ["al"]],
				["global-out-of-range", ["g", "99"]],
			]),
		);

		console.log(
			`parity summary: scenarios=${counts.scenarios} commands=${counts.commands} exact=${counts.exact} intentional=${counts.intentional.size}`,
		);
		for (const [name, count] of counts.intentional)
			console.log(`  intentional ${count}x ${name}`);
	},
	{ timeout: 300_000 },
);
