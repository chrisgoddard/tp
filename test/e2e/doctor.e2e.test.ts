import { expect, test } from "bun:test";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ScratchTmuxServer, createStubKit, runTp, waitFor } from "./harness";

type DoctorRecord = {
	id: number;
	status: "pass" | "fail" | "skip";
	detail: string;
};

function tree(root: string): string[] {
	const output: string[] = [];
	const visit = (path: string, prefix: string): void => {
		for (const item of readdirSync(path, { withFileTypes: true })) {
			const relative = prefix ? `${prefix}/${item.name}` : item.name;
			output.push(relative);
			if (item.isDirectory()) visit(join(path, item.name), relative);
		}
	};
	visit(root, "");
	return output.sort();
}

function linkSystemCommand(
	kit: ReturnType<typeof createStubKit>,
	command: string,
): void {
	const source = Bun.which(command);
	if (!source) throw new Error(`${command} is required for doctor e2e`);
	symlinkSync(source, join(kit.directory, command));
}

function doctorKit(options: { tmux?: boolean; ps?: boolean } = {}) {
	const kit = createStubKit();
	if (options.tmux !== false) linkSystemCommand(kit, "tmux");
	if (options.ps !== false) linkSystemCommand(kit, "ps");
	rmSync(join(kit.directory, "tailscale"), { force: true });
	return kit;
}

function writeExecutable(
	kit: ReturnType<typeof createStubKit>,
	command: string,
	source: string,
): void {
	const path = join(kit.directory, command);
	writeFileSync(path, `#!${process.execPath}\n${source}\n`);
	chmodSync(path, 0o755);
}

function writeConfig(
	root: string,
	text: string,
): { home: string; configHome: string } {
	const home = join(root, "home");
	const configHome = join(root, "config");
	mkdirSync(home, { recursive: true });
	mkdirSync(join(configHome, "tp"), { recursive: true });
	writeFileSync(join(configHome, "tp", "config.toml"), text);
	return { home, configHome };
}

async function runDoctorJson(
	kit: ReturnType<typeof createStubKit>,
	options: {
		server?: ScratchTmuxServer;
		config?: string;
		env?: Record<string, string | undefined>;
	} = {},
): Promise<{
	result: Awaited<ReturnType<typeof runTp>>;
	checks: DoctorRecord[];
}> {
	const root = join(kit.directory, "doctor-home");
	const paths = options.config
		? writeConfig(root, options.config)
		: (() => {
				const home = join(root, "home");
				const configHome = join(root, "config");
				mkdirSync(home, { recursive: true });
				mkdirSync(configHome, { recursive: true });
				return { home, configHome };
			})();
	const result = await runTp(["doctor", "--json"], {
		env: {
			HOME: paths.home,
			XDG_CONFIG_HOME: paths.configHome,
			PATH: kit.directory,
			SHELL: "/bin/sh",
			TMUX: undefined,
			TMUX_PANE: undefined,
			...(options.server?.env ?? {}),
			...(options.env ?? {}),
		},
	});
	return { result, checks: JSON.parse(result.stdout) as DoctorRecord[] };
}

function checkOf(checks: DoctorRecord[], id: number): DoctorRecord {
	const found = checks.find((check) => check.id === id);
	if (!found) throw new Error(`doctor did not emit check ${id}`);
	return found;
}

test("doctor emits the 11-check JSON schema without side effects", async () => {
	const server = new ScratchTmuxServer();
	const kit = doctorKit();
	const root = join(kit.directory, "doctor-home");
	const home = join(root, "home");
	const configHome = join(root, "config");
	mkdirSync(home, { recursive: true });
	mkdirSync(configHome, { recursive: true });
	server.start();
	await Bun.sleep(750);
	server.run(["list-sessions"], true);
	const beforeOptions = server.run(["show-options", "-g"], true).stdout;
	const beforeHome = tree(home);
	const beforeConfig = tree(configHome);
	try {
		const result = await runTp(["doctor", "--json"], {
			env: {
				...server.env,
				HOME: home,
				XDG_CONFIG_HOME: configHome,
				PATH: kit.directory,
				SHELL: "/bin/sh",
				TMUX: undefined,
				TMUX_PANE: undefined,
			},
		});
		expect(result.stdout.trimStart()).toMatch(/^\[/);
		const checks = JSON.parse(result.stdout) as DoctorRecord[];
		expect(checks).toHaveLength(11);
		for (const item of checks)
			expect(item).toEqual({
				id: expect.any(Number),
				status: expect.stringMatching(/^(pass|fail|skip)$/),
				detail: expect.any(String),
			});
		expect(new Set(checks.map((item) => item.id))).toEqual(
			new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
		);
		expect(server.run(["show-options", "-g"], true).stdout).toBe(beforeOptions);
		expect(tree(home)).toEqual(beforeHome);
		expect(tree(configHome)).toEqual(beforeConfig);
	} finally {
		server.teardown();
		kit.cleanup();
	}
});

test("doctor all-pass path passes operational checks", async () => {
	if (process.platform === "darwin") return;
	const server = new ScratchTmuxServer();
	const kit = doctorKit();
	writeExecutable(
		kit,
		"tailscale",
		'const args = process.argv.slice(2); if (args[0] === "status") process.stdout.write(JSON.stringify({BackendState: "Running", Self: {TailscaleIPs: ["100.64.0.1"]}})); else if (args[0] === "whois") process.stdout.write("{}");',
	);
	server.start();
	await Bun.sleep(750);
	server.run(["list-sessions"], true);

	const fakePi = server.startFakePi();
	try {
		waitFor(() => fakePi.options()["@pi_session_id"] !== "");
		const { result, checks } = await runDoctorJson(kit, { server });
		expect(result.exitCode).toBe(0);
		expect(checkOf(checks, 1).status).toBe("pass");
		expect(checkOf(checks, 2).status).toBe("pass");
		expect(checkOf(checks, 4).status).toBe("pass");
		expect(checkOf(checks, 5).status).toBe("pass");
		expect(checkOf(checks, 6).status).toBe("skip");
		expect(checkOf(checks, 7).status).toBe("pass");
		expect(checkOf(checks, 8).status).toBe("pass");
	} finally {
		fakePi.stop();
		server.teardown();
		kit.cleanup();
	}
});

test("doctor reports check 1 failure when tmux is too old", async () => {
	const kit = doctorKit({ tmux: false });
	writeExecutable(
		kit,
		"tmux",
		'const args = process.argv.slice(2); if (args.includes("-V")) process.stdout.write("tmux 3.1\\n");',
	);
	try {
		const { result, checks } = await runDoctorJson(kit);
		expect(result.exitCode).toBe(1);
		expect(checkOf(checks, 1).status).toBe("fail");
	} finally {
		kit.cleanup();
	}
});

test("doctor reports check 3 failure for invalid TOML", async () => {
	const kit = doctorKit();
	try {
		const { result, checks } = await runDoctorJson(kit, {
			config: 'shell = "unterminated\n',
		});
		expect(result.exitCode).toBe(1);
		expect(checkOf(checks, 3).status).toBe("fail");
		expect(checkOf(checks, 3).detail).toContain("Invalid TOML configuration");
	} finally {
		kit.cleanup();
	}
});

test("doctor includes unknown config keys in check 3 warnings", async () => {
	if (process.platform === "darwin") return;
	const server = new ScratchTmuxServer();
	const kit = doctorKit();
	server.start();
	await Bun.sleep(750);
	server.run(["list-sessions"], true);
	const fakePi = server.startFakePi();
	try {
		waitFor(() => fakePi.options()["@pi_session_id"] !== "");
		const { result, checks } = await runDoctorJson(kit, {
			server,
			config: 'mystery = "value"\n',
		});
		expect(result.exitCode).toBe(0);
		expect(checkOf(checks, 3).status).toBe("pass");
		expect(checkOf(checks, 3).detail).toContain("unknown config key");
	} finally {
		fakePi.stop();
		server.teardown();
		kit.cleanup();
	}
});

test("doctor reports check 4 failure for a missing shell", async () => {
	const kit = doctorKit();
	try {
		const { result, checks } = await runDoctorJson(kit, {
			config: 'shell = "/not/a/shell"\n',
		});
		expect(result.exitCode).toBe(1);
		expect(checkOf(checks, 4).status).toBe("fail");
	} finally {
		kit.cleanup();
	}
});

test("doctor reports check 5 failure when sessions lack live Pi metadata", async () => {
	const server = new ScratchTmuxServer();
	const kit = doctorKit();
	server.start();
	server.run(["new-session", "-d", "-s", "doctor-no-pi", "sleep", "30"]);
	try {
		const { result, checks } = await runDoctorJson(kit, { server });
		expect(result.exitCode).toBe(1);
		expect(checkOf(checks, 5).status).toBe("fail");
		expect(checkOf(checks, 5).detail).toContain("no live Pi metadata found");
	} finally {
		server.teardown();
		kit.cleanup();
	}
});

test("doctor reports check 6 failure for a stale current-client mapping", async () => {
	const kit = doctorKit({ tmux: false });
	writeExecutable(
		kit,
		"tmux",
		`const args = process.argv.slice(2); const format = args.at(-1) ?? ""; if (args.includes("-V")) process.stdout.write("tmux 3.7b\\n"); else if (args.includes("show-option")) process.stdout.write("v1 ip=100.64.0.2 created=1\\n"); else if (format.includes("client_tty")) process.stdout.write("/dev/pts/1\\n"); else if (format.includes("client_created")) process.stdout.write("2\\n");`,
	);
	try {
		const { result, checks } = await runDoctorJson(kit, {
			env: { TMUX: "1", TMUX_PANE: "%1" },
		});
		expect(result.exitCode).toBe(1);
		expect(checkOf(checks, 6).status).toBe("fail");
		expect(checkOf(checks, 6).detail).toContain("stale");
	} finally {
		kit.cleanup();
	}
});

test("doctor reports check 7 failure when tailscale is logged out", async () => {
	const kit = doctorKit();
	writeExecutable(kit, "tailscale", "process.exit(1);");
	try {
		const { result, checks } = await runDoctorJson(kit);
		expect(result.exitCode).toBe(1);
		expect(checkOf(checks, 7).status).toBe("fail");
		expect(checkOf(checks, 8).status).toBe("skip");
	} finally {
		kit.cleanup();
	}
});

test("doctor reports check 8 failure when tailscale whois cannot resolve self", async () => {
	const kit = doctorKit();
	writeExecutable(
		kit,
		"tailscale",
		'const args = process.argv.slice(2); if (args[0] === "status") process.stdout.write(JSON.stringify({BackendState: "Running", Self: {TailscaleIPs: ["100.64.0.1"]}})); else process.exit(1);',
	);
	try {
		const { result, checks } = await runDoctorJson(kit);
		expect(result.exitCode).toBe(1);
		expect(checkOf(checks, 7).status).toBe("pass");
		expect(checkOf(checks, 8).status).toBe("fail");
	} finally {
		kit.cleanup();
	}
});

test("doctor reports optional checks as skips when their prerequisites are absent", async () => {
	const server = new ScratchTmuxServer();
	const kit = doctorKit();
	server.start();
	try {
		const { checks } = await runDoctorJson(kit, {
			server,
			config: '[shot]\ntransport = "ssh"\n',
		});
		expect(checkOf(checks, 5).status).toBe("skip");
		expect(checkOf(checks, 7).status).toBe("skip");
		expect(checkOf(checks, 8).status).toBe("skip");
		expect(checkOf(checks, 9).status).toBe("skip");
		expect(checkOf(checks, 11).status).toBe("skip");
		if (process.platform !== "darwin")
			expect(checkOf(checks, 10).status).toBe("skip");
	} finally {
		server.teardown();
		kit.cleanup();
	}
});

if (process.platform === "darwin") {
	test("doctor reports check 9 pass for a reachable Taildrive mount", async () => {
		const kit = doctorKit();
		const mount = join(kit.directory, "taildrive");
		mkdirSync(mount);
		writeExecutable(kit, "tailscale", "process.exit(0);");
		try {
			const { checks } = await runDoctorJson(kit, {
				config: `[shot]\ntransport = "taildrive"\ntaildrive_dir = ${JSON.stringify(mount)}\n`,
			});
			expect(checkOf(checks, 9).status).toBe("pass");
		} finally {
			kit.cleanup();
		}
	});

	test("doctor reports check 9 failure for an unreachable Taildrive mount", async () => {
		const kit = doctorKit();
		writeExecutable(kit, "tailscale", "process.exit(0);");
		try {
			const { result, checks } = await runDoctorJson(kit, {
				config:
					'[shot]\ntransport = "taildrive"\ntaildrive_dir = "/missing/taildrive"\n',
			});
			expect(result.exitCode).toBe(1);
			expect(checkOf(checks, 9).status).toBe("fail");
		} finally {
			kit.cleanup();
		}
	});

	test("doctor reports check 10 failure for unreachable tp-shot SSH", async () => {
		const kit = doctorKit();
		writeExecutable(kit, "ssh", "process.exit(1);");
		try {
			const { result, checks } = await runDoctorJson(kit, {
				config: '[shot]\nhost = "unreachable"\nnotifier = "none"\n',
			});
			expect(result.exitCode).toBe(1);
			expect(checkOf(checks, 10).status).toBe("fail");
		} finally {
			kit.cleanup();
		}
	});
}

test("doctor cuts off a hanging tp-shot SSH probe at five seconds on macOS", async () => {
	if (process.platform !== "darwin") return;
	const server = new ScratchTmuxServer();
	const kit = doctorKit();
	const root = mkdtempSync(join(tmpdir(), "tp-doctor-ssh-e2e-"));
	const { home, configHome } = writeConfig(
		root,
		'[shot]\nhost = "hanging-host"\nnotifier = "none"\n',
	);
	writeExecutable(kit, "ssh", "await Bun.sleep(30_000);");
	server.start();
	try {
		const started = performance.now();
		const result = await runTp(["doctor"], {
			env: {
				...server.env,
				HOME: home,
				XDG_CONFIG_HOME: configHome,
				PATH: kit.directory,
				SHELL: "/bin/sh",
				TMUX: undefined,
				TMUX_PANE: undefined,
			},
		});
		const elapsed = performance.now() - started;
		if (result.stdout.includes("server not reachable")) return;
		expect(elapsed).toBeGreaterThanOrEqual(4_500);
		expect(elapsed).toBeLessThan(8_500);
		expect(result.stdout).toContain("SSH to hanging-host timed out after 5s");
	} finally {
		server.teardown();
		kit.cleanup();
		rmSync(root, { recursive: true, force: true });
	}
}, 10_000);
