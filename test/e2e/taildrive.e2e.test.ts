import { expect, test } from "bun:test";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStubKit, runTpShot } from "./harness";

function writeConfig(home: string, body: string): void {
	const directory = join(home, ".config", "tp");
	mkdirSync(directory, { recursive: true });
	writeFileSync(join(directory, "config.toml"), body);
}

function writeClipboardStub(kit: ReturnType<typeof createStubKit>): string {
	const clipboard = join(kit.directory, "clipboard");
	const path = join(kit.directory, "pbcopy");
	writeFileSync(
		path,
		`#!${process.execPath}\nconst value = await new Response(Bun.stdin.stream()).text();\nawait Bun.write(process.env.TP_CLIPBOARD!, value);\n`,
	);
	chmodSync(path, 0o755);
	return clipboard;
}

async function runSelectionCase(options: {
	config?: string;
	envTransport?: string;
	flagTransport?: string;
}): Promise<string[]> {
	const kit = createStubKit();
	try {
		if (options.config) writeConfig(kit.directory, options.config);
		const input = join(kit.directory, "input.png");
		writeFileSync(input, "image");
		const result = await runTpShot(
			[
				...(options.flagTransport
					? ["--transport", options.flagTransport]
					: []),
				input,
			],
			{
				env: {
					...kit.env,
					HOME: kit.directory,
					XDG_CONFIG_HOME: undefined,
					TP_SHOT_NOTIFIER: "none",
					TP_SHOT_REMOTE_DIR: "/pi/screenshots",
					TP_SHOT_TRANSPORT: options.envTransport,
				},
			},
		);
		expect(result.exitCode).toBe(0);
		return kit.readInvocations().map((entry) => entry.command);
	} finally {
		kit.cleanup();
	}
}

const taildriveConfig = (share: string): string =>
	`[shot]\ntransport = "taildrive"\ntaildrive_dir = "${share}"\nremote_dir = "/pi/screenshots"\n`;

test("transport selection is flag over env over config over default", async () => {
	const share = mkdtempSync(join(tmpdir(), "tp-taildrive-selection-"));
	try {
		const flagWins = await runSelectionCase({
			config: taildriveConfig(share),
			envTransport: "ssh",
			flagTransport: "taildrive",
		});
		expect(flagWins).not.toContain("ssh");

		const envWins = await runSelectionCase({
			config: taildriveConfig(share),
			envTransport: "ssh",
		});
		expect(envWins).toContain("ssh");

		const configWins = await runSelectionCase({
			config: taildriveConfig(share),
		});
		expect(configWins).not.toContain("ssh");

		const defaultWins = await runSelectionCase({});
		expect(defaultWins).toContain("ssh");
	} finally {
		rmSync(share, { recursive: true, force: true });
	}
});

test("invalid transport is a usage error", async () => {
	const kit = createStubKit();
	try {
		const input = join(kit.directory, "input.png");
		writeFileSync(input, "image");
		const result = await runTpShot(["--transport", "nfs", input], {
			env: {
				...kit.env,
				HOME: kit.directory,
				TP_SHOT_NOTIFIER: "none",
			},
		});
		expect(result.exitCode).toBe(2);
		expect(result.stderr).toContain("invalid transport");
		expect(kit.readInvocations()).toHaveLength(0);
	} finally {
		kit.cleanup();
	}
});

test("taildrive copies sync output to the remote clipboard path", async () => {
	const kit = createStubKit();
	try {
		const share = join(kit.directory, "mounted-share");
		mkdirSync(share);
		writeConfig(
			kit.directory,
			`[shot]\ntransport = "taildrive"\ntaildrive_dir = "${share}"\nremote_dir = "/pi-host/screenshots"\n`,
		);
		const clipboard = writeClipboardStub(kit);
		const input = join(kit.directory, "input.png");
		writeFileSync(input, "image");
		const result = await runTpShot([input], {
			env: {
				...kit.env,
				HOME: kit.directory,
				XDG_CONFIG_HOME: undefined,
				TP_SHOT_NOTIFIER: "none",
				TP_CLIPBOARD: clipboard,
			},
		});

		expect(result.exitCode).toBe(0);
		const copied = readFileSync(clipboard, "utf8");
		expect(copied).toMatch(/^\/pi-host\/screenshots\/tp-shot-/);
		expect(copied).not.toContain(share);
	} finally {
		kit.cleanup();
	}
});

test("missing taildrive mount fails, logs the transport, and notifies", async () => {
	const kit = createStubKit();
	try {
		const missing = join(kit.directory, "missing-share");
		writeConfig(
			kit.directory,
			`[shot]\ntransport = "taildrive"\ntaildrive_dir = "${missing}"\nremote_dir = "/pi-host/screenshots"\n`,
		);
		const input = join(kit.directory, "input.png");
		writeFileSync(input, "image");
		const logs = join(kit.directory, "logs");
		mkdirSync(logs);
		const result = await runTpShot([input], {
			env: {
				...kit.env,
				HOME: kit.directory,
				XDG_CONFIG_HOME: undefined,
				TP_SHOT_LOG_DIR: logs,
				TP_SHOT_NOTIFIER: "osascript",
			},
		});

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("taildrive transport");
		const invocations = kit.readInvocations();
		expect(invocations.map((entry) => entry.command)).toContain("osascript");
		expect(invocations.map((entry) => entry.command)).not.toContain("ssh");
		expect(
			invocations
				.filter((entry) => entry.command === "osascript")
				.some((entry) =>
					entry.argv.some((value) => value.includes("taildrive")),
				),
		).toBe(true);
		const log = readFileSync(join(logs, readdirSync(logs)[0] ?? ""), "utf8");
		expect(log).toContain("taildrive transport");
	} finally {
		kit.cleanup();
	}
});
