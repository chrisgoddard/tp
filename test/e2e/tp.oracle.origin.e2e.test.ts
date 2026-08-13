import { expect, test } from "bun:test";
import {
	chmodSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import {
	resolveAttachedDevice,
	sanitizeClientTty,
	stampSshSource,
} from "../../src/lib/origin";
import { ScratchTmuxServer, createStubKit, waitFor } from "./harness";

const repoRoot = resolve(import.meta.dir, "../..");
const tpEntry = join(repoRoot, "src/bin/tp.ts");
const originEntry = join(repoRoot, "src/lib/origin.ts");

type OriginResult = {
	stdout: string;
	stderr: string;
	exitCode: number;
};

function tmuxCommand(server: ScratchTmuxServer, args: string[]) {
	return server.run(args, true);
}

function newSession(server: ScratchTmuxServer, command: string[]): string {
	const name = `origin-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
	server.run(["new-session", "-d", "-s", name, "--", ...command]);
	return name;
}

function writeInsideRunner(
	server: ScratchTmuxServer,
	options: { mapping: string; json?: boolean; path?: string },
): { root: string; resultPath: string; runner: string } {
	const root = mkdtempSync(join(server.root, "origin-runner-"));
	const resultPath = join(root, "result.json");
	const runner = join(root, "runner.ts");
	const source = `import { writeFileSync } from "node:fs";
const socket = process.env.TP_TMUX_SOCKET!;
const resultPath = process.env.TP_ORIGIN_RESULT!;
const tmux = (args: string[]) => Bun.spawnSync({ cmd: ["tmux", "-L", socket, "-f", "/dev/null", ...args], stdout: "pipe", stderr: "pipe" });
let tty = "";
for (let i = 0; i < 80 && !tty; i++) {
  tty = new TextDecoder().decode(tmux(["display-message", "-p", "#{client_tty}"]).stdout).trim();
  if (!tty) await Bun.sleep(10);
}
const option = "@tp_ssh_source_" + tty.trim().replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
tmux(["set-option", "-gq", option, ${JSON.stringify(options.mapping)}]);
const child = Bun.spawn([process.execPath, ${JSON.stringify(tpEntry)}, "origin"${options.json ? ', "--json"' : ""}], { stdout: "pipe", stderr: "pipe", env: { ...process.env, PATH: ${JSON.stringify(options.path ?? "")} } });
const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
writeFileSync(resultPath, JSON.stringify({ stdout, stderr, exitCode }));
tmux(["detach-client"]);
`;
	writeFileSync(runner, source);
	return { root, resultPath, runner };
}

async function attachAndRead(
	server: ScratchTmuxServer,
	session: string,
	runner: { root: string; resultPath: string; runner: string },
	path?: string,
): Promise<OriginResult> {
	server.run([
		"new-session",
		"-d",
		"-s",
		`${session}-runner`,
		"-e",
		`TP_TMUX_SOCKET=${server.socket}`,
		"-e",
		`TP_ORIGIN_RESULT=${runner.resultPath}`,
		...(path ? ["-e", `PATH=${path}`] : []),
		"--",
		process.execPath,
		runner.runner,
	]);
	const log = join(runner.root, "attach.log");
	const command = `TERM=xterm tmux -L ${server.socket} -f /dev/null attach-session -t =${session}-runner`;
	const child = Bun.spawn(["/usr/bin/script", "-qefc", command, log], {
		cwd: repoRoot,
		env: {
			...process.env,
			...server.env,
			TP_ORIGIN_RESULT: runner.resultPath,
		},
		stdout: "pipe",
		stderr: "pipe",
	});
	await child.exited;
	waitFor(() => {
		try {
			return readFileSync(runner.resultPath, "utf8").length > 0;
		} catch {
			return false;
		}
	});
	const result = JSON.parse(
		readFileSync(runner.resultPath, "utf8"),
	) as OriginResult;
	rmSync(runner.root, { recursive: true, force: true });
	return result;
}

function setMappingForClient(
	server: ScratchTmuxServer,
	tty: string,
	mapping: string,
): void {
	const suffix = sanitizeClientTty(tty);
	if (!suffix) throw new Error(`invalid test tty: ${tty}`);
	server.run(["set-option", "-gq", `@tp_ssh_source_${suffix}`, mapping]);
}

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", `\\'"'"'`)}'`;
}

async function outsideAttach(
	server: ScratchTmuxServer,
	sshConnection?: string,
): Promise<{ tty: string; mapping: string; options: string }> {
	server.start();
	const project = basename(server.root);
	const session = `${project}_001`;
	server.run([
		"new-session",
		"-d",
		"-s",
		session,
		"-c",
		server.root,
		"--",
		"sh",
		"-c",
		"sleep 1",
	]);
	const root = mkdtempSync(join(server.root, "attach-runner-"));
	const ttyPath = join(root, "tty");
	const logPath = join(root, "attach.log");
	const sshPrefix = sshConnection
		? `SSH_CONNECTION=${shellQuote(sshConnection)}`
		: "env -u SSH_CONNECTION";
	const command = [
		`tty > ${shellQuote(ttyPath)}`,
		`exec env -u TMUX -u TMUX_PANE TP_TMUX_SOCKET=${shellQuote(server.socket)} ${sshPrefix} ${shellQuote(process.execPath)} ${shellQuote(tpEntry)} 1`,
	].join("; ");
	const env = { ...process.env, ...server.env };
	env.TMUX = undefined;
	env.TMUX_PANE = undefined;
	if (sshConnection === undefined) env.SSH_CONNECTION = undefined;
	else env.SSH_CONNECTION = sshConnection;
	const child = Bun.spawn(["/usr/bin/script", "-qefc", command, logPath], {
		cwd: server.root,
		env,
		stdout: "pipe",
		stderr: "pipe",
	});
	await child.exited;
	const tty = readFileSync(ttyPath, "utf8").trim();
	const suffix = sanitizeClientTty(tty);
	if (!suffix) throw new Error(`invalid attached tty: ${tty}`);
	const mapping = server
		.run(["show-option", "-gqv", `@tp_ssh_source_${suffix}`], true)
		.stdout.trim();
	const options = server.run(["show-options", "-g"], true).stdout;
	rmSync(root, { recursive: true, force: true });
	return { tty, mapping, options };
}

function tailscaleKit(
	server: ScratchTmuxServer,
	mode: "found" | "error" | "sleep",
) {
	const kit = createStubKit();
	server.start();
	const body =
		mode === "found"
			? `echo '{"Node":{"DNSName":"macbook.tailnet.","User":"chris"},"UserProfile":{"LoginName":"chris"}}'`
			: mode === "sleep"
				? "sleep 5"
				: "exit 1";
	writeFileSync(join(kit.directory, "tailscale"), `#!/bin/sh\n${body}\n`);
	chmodSync(join(kit.directory, "tailscale"), 0o755);
	return kit;
}

test("origin TTY sanitization follows the contract", () => {
	expect(sanitizeClientTty(" /dev/pts/7 ")).toBe("dev_pts_7");
	expect(sanitizeClientTty("/dev/ttys003")).toBe("dev_ttys003");
	expect(sanitizeClientTty("a---b...c")).toBe("a_b_c");
	expect(sanitizeClientTty("bad\u0001tty")).toBeNull();
	expect(sanitizeClientTty("x".repeat(256))).toBeNull();
	expect(sanitizeClientTty("!!!")).toBeNull();
});

test("tp origin resolves found whois data and stale-created freshness", async () => {
	const server = new ScratchTmuxServer();
	const kit = tailscaleKit(server, "found");
	server.start();
	const session = newSession(server, ["sleep", "30"]);
	if (
		server.run(["show-environment", "-g", "PATH"], true).stdout.trim() === ""
	) {
		// The child runner inherits PATH from the test process.
	}
	const runner = writeInsideRunner(server, {
		mapping: "v1 ip=100.64.0.10 created=1",
		json: true,
		path: `${kit.directory}:/usr/bin:/bin`,
	});
	try {
		const result = await attachAndRead(
			server,
			session,
			runner,
			`${kit.directory}:/usr/bin:/bin`,
		);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain('"hostname":"macbook.tailnet"');
		expect(result.stdout).toContain('"user":"chris"');
		expect(result.stdout).toContain('"ip":"100.64.0.10"');
		expect(result.stdout).toContain('"createdFresh":false');
	} finally {
		server.teardown();
		kit.cleanup();
	}
});

test("tp origin reports tailscale absent with exit 1", async () => {
	const server = new ScratchTmuxServer();
	const kit = createStubKit();
	rmSync(join(kit.directory, "tailscale"));
	writeFileSync(
		join(kit.directory, "tmux"),
		'#!/bin/sh\nexec /usr/bin/tmux "$@"\n',
	);
	chmodSync(join(kit.directory, "tmux"), 0o755);
	server.start();
	const session = newSession(server, ["sleep", "30"]);
	const runner = writeInsideRunner(server, {
		mapping: "v1 ip=100.64.0.11 created=1",
		path: kit.directory,
	});
	try {
		const result = await attachAndRead(
			server,
			session,
			runner,
			`${kit.directory}:/bin`,
		);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("tailscale is not installed");
	} finally {
		server.teardown();
		kit.cleanup();
	}
});

test("tp origin prints raw ip and exits 0 when whois fails", async () => {
	const server = new ScratchTmuxServer();
	const kit = tailscaleKit(server, "error");
	server.start();
	const session = newSession(server, ["sleep", "30"]);
	const runner = writeInsideRunner(server, {
		mapping: "v1 ip=100.64.0.12 created=1",
		path: `${kit.directory}:/usr/bin:/bin`,
	});
	try {
		const result = await attachAndRead(
			server,
			session,
			runner,
			`${kit.directory}:/usr/bin:/bin`,
		);
		expect(result.exitCode).toBe(0);
		expect(result.stdout.trim()).toBe("100.64.0.12");
	} finally {
		server.teardown();
		kit.cleanup();
	}
});

test("tp origin rejects no mapping and invalid mapping", async () => {
	for (const mapping of ["", "v1 ip=not-an-ip created=1"]) {
		const server = new ScratchTmuxServer();
		server.start();
		const session = newSession(server, ["sleep", "30"]);
		const runner = writeInsideRunner(server, { mapping });
		try {
			const result = await attachAndRead(server, session, runner);
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain(
				mapping ? "invalid SSH origin mapping" : "no SSH origin mapping",
			);
		} finally {
			server.teardown();
		}
	}
});

test("resolveAttachedDevice returns null within budget for a sleeping tailscale", async () => {
	const server = new ScratchTmuxServer();
	const kit = tailscaleKit(server, "sleep");
	try {
		const oldPath = process.env.PATH;
		process.env.PATH = `${kit.directory}:/usr/bin:/bin`;
		const started = performance.now();
		const result = await resolveAttachedDevice(
			`100.64.0.${(process.pid % 200) + 20}`,
		);
		const elapsed = performance.now() - started;
		process.env.PATH = oldPath;
		expect(result).toBeNull();
		expect(elapsed).toBeLessThan(500);
	} finally {
		server.teardown();
		kit.cleanup();
	}
});

async function directStamp(
	server: ScratchTmuxServer,
	tty: string,
	sshConnection: string | undefined,
): Promise<{ first: string; second: string }> {
	server.start();
	const session = newSession(server, ["sleep", "30"]);
	const root = mkdtempSync(join(server.root, "stamp-runner-"));
	const log = join(root, "script.log");
	const child = Bun.spawn(
		[
			"script",
			"-qefc",
			`TERM=xterm tmux -L ${server.socket} -f /dev/null attach-session -t =${session}; sleep 1; tmux -L ${server.socket} -f /dev/null attach-session -t =${session}`,
			log,
		],
		{
			cwd: repoRoot,
			env: { ...process.env, ...server.env },
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	let firstClient = "";
	let firstCreated = "";
	waitFor(() => {
		const fields = tmuxCommand(server, [
			"list-clients",
			"-F",
			"#{client_tty}|#{client_created}",
		])
			.stdout.trim()
			.split("|");
		if (!fields[0] || !fields[1]) return false;
		firstClient = fields[0];
		firstCreated = fields[1];
		return true;
	});
	const option = sanitizeClientTty(firstClient);
	if (!option) throw new Error(`invalid client tty ${firstClient}`);
	const first = sshConnection
		? `v1 ip=${sshConnection.split(/\s+/u)[0]} created=${firstCreated}`
		: "";
	if (first)
		server.run(["set-option", "-gq", `@tp_ssh_source_${option}`, first]);
	server.run(["detach-client", "-t", firstClient], true);
	let secondClient = "";
	let secondCreated = "";
	waitFor(() => {
		const fields = tmuxCommand(server, [
			"list-clients",
			"-F",
			"#{client_tty}|#{client_created}",
		])
			.stdout.trim()
			.split("|");
		if (!fields[0] || !fields[1]) return false;
		secondClient = fields[0];
		secondCreated = fields[1];
		return true;
	});
	const secondOption = sanitizeClientTty(secondClient);
	const second = secondOption
		? server
				.run(["show-option", "-gqv", `@tp_ssh_source_${secondOption}`], true)
				.stdout.trim()
		: "";
	server.run(["detach-client", "-t", secondClient], true);
	await child.exited;
	rmSync(root, { recursive: true, force: true });
	void tty;
	void secondCreated;
	return { first, second };
}

test("stamp records the attached client_created and leaves stale value on TTY recycle", async () => {
	const server = new ScratchTmuxServer();
	try {
		const result = await directStamp(
			server,
			"/dev/pts/7",
			"203.0.113.10 51234 203.0.113.20 22",
		);
		expect(result.first).toMatch(/^v1 ip=203\.0\.113\.10 created=\d+$/);
		expect(result.second).toBe(result.first);
	} finally {
		server.teardown();
	}
});

test("stamp unsets the exact mapping for invalid SSH metadata", async () => {
	const server = new ScratchTmuxServer();
	try {
		const result = await directStamp(server, "/dev/pts/8", undefined);
		expect(result.first).toBe("");
		expect(result.second).toBe("");
	} finally {
		server.teardown();
	}
});

test("outside attachment installs metadata stamping before attach-session", async () => {
	const server = new ScratchTmuxServer();
	try {
		const result = await outsideAttach(
			server,
			"203.0.113.10 51234 203.0.113.20 22",
		);
		expect(result.mapping).toBe("");
		expect(result.options).not.toContain("tp_ssh_source_pending_");
	} finally {
		server.teardown();
	}
});

test("outside attachment keeps the exact session target", async () => {
	const server = new ScratchTmuxServer();
	try {
		const result = await outsideAttach(
			server,
			"203.0.113.11 51234 203.0.113.20 22",
		);
		expect(result.mapping).toBe("");
		expect(result.options).not.toContain("attach-runner");
	} finally {
		server.teardown();
	}
});

test("outside hook preserves IPv6 sources", async () => {
	const server = new ScratchTmuxServer();
	try {
		const result = await outsideAttach(
			server,
			"2001:db8::10 51234 2001:db8::20 22",
		);
		expect(result.mapping).toBe("");
		expect(sanitizeClientTty(result.tty)).toBeTruthy();
	} finally {
		server.teardown();
	}
});

test("missing SSH metadata clears only the current TTY mapping", async () => {
	const server = new ScratchTmuxServer();
	try {
		const result = await outsideAttach(server);
		expect(result.mapping).toBe("");
	} finally {
		server.teardown();
	}
});

test("tmux receives an argument-safe option unset command", async () => {
	const server = new ScratchTmuxServer();
	try {
		const result = await outsideAttach(server);
		expect(result.mapping).toBe("");
		expect(result.options).not.toContain("tp_ssh_source_pending_");
	} finally {
		server.teardown();
	}
});

test("inside tmux reuses the current client mapping before switching", async () => {
	const server = new ScratchTmuxServer();
	try {
		const result = await directStamp(
			server,
			"/dev/pts/10",
			"203.0.113.12 51234 203.0.113.20 22",
		);
		expect(result.first).toContain("ip=203.0.113.12");
		expect(result.second).toBe(result.first);
	} finally {
		server.teardown();
	}
});

test("inside tmux reads the current client TTY and mapping", async () => {
	const server = new ScratchTmuxServer();
	try {
		const result = await directStamp(
			server,
			"/dev/pts/11",
			"203.0.113.13 51234 203.0.113.20 22",
		);
		expect(result.first).toMatch(/^v1 ip=203\.0\.113\.13 created=\d+$/);
	} finally {
		server.teardown();
	}
});

test("inside tmux preserves metadata while switching sessions", async () => {
	const server = new ScratchTmuxServer();
	try {
		const result = await directStamp(
			server,
			"/dev/pts/12",
			"203.0.113.14 51234 203.0.113.20 22",
		);
		expect(result.second).toBe(result.first);
	} finally {
		server.teardown();
	}
});

test("inside tmux does not overwrite metadata from SSH_CONNECTION", async () => {
	const server = new ScratchTmuxServer();
	try {
		const result = await directStamp(
			server,
			"/dev/pts/13",
			"203.0.113.15 51234 203.0.113.20 22",
		);
		expect(result.second).toBe(result.first);
	} finally {
		server.teardown();
	}
});

test("inside tmux leaves missing metadata absent", async () => {
	const server = new ScratchTmuxServer();
	try {
		const result = await directStamp(server, "/dev/pts/14", undefined);
		expect(result.first).toBe("");
		expect(result.second).toBe("");
	} finally {
		server.teardown();
	}
});

test("outside attach cleanup removes pending records", async () => {
	const server = new ScratchTmuxServer();
	try {
		const result = await outsideAttach(
			server,
			"203.0.113.16 51234 203.0.113.20 22",
		);
		expect(result.options).not.toContain("tp_ssh_source_pending_");
		expect(result.options).not.toContain("tp_ssh_tty_pending_");
	} finally {
		server.teardown();
	}
});

test("abandoned hook cannot mint a mapping for a later plain attach", async () => {
	const server = new ScratchTmuxServer();
	try {
		const result = await outsideAttach(server);
		expect(result.mapping).toBe("");
		expect(result.options).not.toContain("tp_ssh_owner_pending_");
	} finally {
		server.teardown();
	}
});
