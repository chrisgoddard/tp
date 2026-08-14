import { expect, test } from "bun:test";
import {
	chmodSync,
	mkdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { createStubKit, repoRoot, runTpShot } from "./harness";

function writeBlockingStubs(kit: ReturnType<typeof createStubKit>): void {
	const executable = `#!${process.execPath}`;
	const record = `
import { appendFileSync } from "node:fs";
const argv = process.argv.slice(2);
appendFileSync(process.env.TP_STUB_LOG!, JSON.stringify({ command: process.env.TP_STUB_COMMAND!, argv, stdin: "" }) + "\\n");
`;
	const write = (name: string, source: string): void => {
		const path = join(kit.directory, name);
		writeFileSync(path, `${executable}\n${source}`);
		chmodSync(path, 0o755);
	};
	write(
		"ssh",
		`${record}
import { chmodSync, mkdirSync, renameSync, rmSync } from "node:fs";
const command = argv.at(-1) ?? "";
const remote = process.env.TP_SHOT_REMOTE_DIR!;
if (command.includes("mkdir -p")) {
  mkdirSync(remote, { recursive: true });
  chmodSync(remote, 0o700);
  process.stdout.write(remote + "\\n");
} else if (command.includes("&& mv")) {
  const paths = [...command.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  chmodSync(paths[1], 0o600);
  renameSync(paths[1], paths[2]);
} else if (command.startsWith("rm -f")) {
  for (const path of command.matchAll(/'([^']+)'/g)) rmSync(path[1], { force: true });
}
`,
	);
	write(
		"scp",
		`${record}
import { copyFileSync, existsSync, writeFileSync } from "node:fs";
const source = argv.at(-2)!;
const destination = argv.at(-1)!;
const remotePath = destination.slice(destination.indexOf(":") + 1);
copyFileSync(source, remotePath);
writeFileSync(process.env.TP_SCP_STARTED!, remotePath);
while (!existsSync(process.env.TP_SCP_RELEASE!)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
`,
	);
	write(
		"pbcopy",
		`${record}
await Bun.write(process.env.TP_CLIPBOARD!, await new Response(Bun.stdin.stream()).text());
`,
	);
	write(
		"uuidgen",
		`${record}
process.stdout.write("00000000-0000-4000-8000-000000000001\\n");
`,
	);
	write("nohup", `${record}\n`);
}

function writeRemoteSetupStub(
	kit: ReturnType<typeof createStubKit>,
	resolvedDirectory: string,
): string {
	const commandLog = join(kit.directory, "ssh-commands.log");
	const path = join(kit.directory, "ssh");
	writeFileSync(
		path,
		`#!${process.execPath}
import { appendFileSync } from "node:fs";
const command = process.argv.at(-1) ?? "";
appendFileSync(${JSON.stringify(commandLog)}, command + "\\n");
if (command.includes("mkdir -p")) process.stdout.write(${JSON.stringify(resolvedDirectory)} + "\\n");
`,
	);
	chmodSync(path, 0o755);
	return commandLog;
}

function writeClipboardStub(
	kit: ReturnType<typeof createStubKit>,
	clipboardPath: string,
): void {
	const path = join(kit.directory, "pbcopy");
	writeFileSync(
		path,
		`#!${process.execPath}\nimport { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(clipboardPath)}, await new Response(Bun.stdin.stream()).text());\n`,
	);
	chmodSync(path, 0o755);
}

function exists(path: string): boolean {
	try {
		statSync(path);
		return true;
	} catch {
		return false;
	}
}

async function waitForFile(path: string, timeoutMs = 5_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!exists(path)) {
		if (Date.now() >= deadline)
			throw new Error(`timed out waiting for ${path}`);
		await Bun.sleep(10);
	}
}

async function waitForText(
	path: string,
	text: string,
	timeoutMs = 5_000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!exists(path) || !readFileSync(path, "utf8").includes(text)) {
		if (Date.now() >= deadline)
			throw new Error(`timed out waiting for ${text} in ${path}`);
		await Bun.sleep(10);
	}
}

test("async reserves the clipboard before starting transport", async () => {
	const kit = createStubKit();
	try {
		const input = join(kit.directory, "input.png");
		const logs = join(kit.directory, "logs");
		mkdirSync(logs);
		writeFileSync(input, "image");
		const result = await runTpShot(["--async", input], {
			env: {
				...kit.env,
				HOME: kit.directory,
				TP_SHOT_LOG_DIR: logs,
				TP_SHOT_REMOTE_DIR: join(kit.directory, "remote"),
				TP_SHOT_NOTIFIER: "none",
			},
		});

		expect(result.exitCode).toBe(0);
		const commands = kit.readInvocations().map((entry) => entry.command);
		expect(commands.indexOf("pbcopy")).toBeGreaterThanOrEqual(0);
		expect(commands.indexOf("nohup")).toBeGreaterThan(
			commands.indexOf("pbcopy"),
		);
	} finally {
		kit.cleanup();
	}
});

test("ssh remote tilde paths are expanded by the remote shell safely", async () => {
	const kit = createStubKit();
	try {
		const input = join(kit.directory, "input.png");
		writeFileSync(input, "image");
		const commandLog = writeRemoteSetupStub(kit, "/remote-home/screenshots");
		const result = await runTpShot([input], {
			env: {
				...kit.env,
				HOME: join(kit.directory, "local-home"),
				TP_SHOT_REMOTE_DIR: `~/folder with "quotes" $() $VAR`,
				TP_SHOT_NOTIFIER: "none",
			},
		});

		expect(result.exitCode).toBe(0);
		const setupCommand = readFileSync(commandLog, "utf8").split("\n")[0];
		expect(setupCommand).toBe(
			`umask 077; mkdir -p "$HOME"/'folder with "quotes" $() $VAR' && chmod 700 "$HOME"/'folder with "quotes" $() $VAR' && printf "%s\\n" "$HOME"/'folder with "quotes" $() $VAR'`,
		);
		expect(setupCommand).not.toContain(join(kit.directory, "local-home"));
	} finally {
		kit.cleanup();
	}
});

test("async ssh copies the remote-resolved directory, not the local home", async () => {
	const kit = createStubKit();
	try {
		const input = join(kit.directory, "input.png");
		const clipboard = join(kit.directory, "clipboard");
		const logs = join(kit.directory, "logs");
		mkdirSync(logs);
		writeFileSync(input, "image");
		writeClipboardStub(kit, clipboard);
		writeRemoteSetupStub(kit, "/remote-home/screenshots");
		const result = await runTpShot(["--async", input], {
			env: {
				...kit.env,
				HOME: join(kit.directory, "local-home"),
				TP_SHOT_LOG_DIR: logs,
				TP_SHOT_REMOTE_DIR: "~/screenshots",
				TP_SHOT_NOTIFIER: "none",
			},
		});

		expect(result.exitCode).toBe(0);
		expect(readFileSync(clipboard, "utf8")).toMatch(
			/^\/remote-home\/screenshots\/tp-shot-/,
		);
		expect(readFileSync(clipboard, "utf8")).not.toContain("local-home");
		const logPath = result.stdout.match(/^Log: (.+)$/m)?.[1];
		if (!logPath) throw new Error("async output did not include a log path");
		await waitForText(logPath, "Ready:");
	} finally {
		kit.cleanup();
	}
});

test("detached async worker survives parent kill and publishes its upload", async () => {
	const kit = createStubKit();
	try {
		writeBlockingStubs(kit);
		const remote = join(kit.directory, "remote");
		const logs = join(kit.directory, "logs");
		const input = join(kit.directory, "input.png");
		const clipboard = join(kit.directory, "clipboard");
		const started = join(kit.directory, "scp.started");
		const release = join(kit.directory, "scp.release");
		mkdirSync(logs);
		writeFileSync(input, "snapshot-before-kill");
		const child = Bun.spawn(
			[
				process.execPath,
				join(repoRoot, "src/bin/tp-shot.ts"),
				"--async",
				input,
			],
			{
				env: {
					...kit.env,
					HOME: kit.directory,
					TP_SHOT_LOG_DIR: logs,
					TP_SHOT_REMOTE_DIR: remote,
					TP_SHOT_NOTIFIER: "none",
					TP_CLIPBOARD: clipboard,
					TP_SCP_STARTED: started,
					TP_SCP_RELEASE: release,
				},
				stdout: "pipe",
				stderr: "pipe",
			},
		);

		await waitForFile(clipboard);
		await waitForFile(started);
		const reservedPath = readFileSync(clipboard, "utf8");
		const filename = reservedPath.split("/").at(-1);
		expect(filename).toBeDefined();
		if (!filename) throw new Error("clipboard did not contain a filename");
		const tempPath = `${remote}/.${filename}.uploading`;
		expect(exists(tempPath)).toBe(true);
		expect(exists(reservedPath)).toBe(false);
		try {
			process.kill(child.pid, "SIGKILL");
		} catch {
			// The foreground may have exited immediately after ownership transfer.
		}
		writeFileSync(release, "release");
		await waitForFile(reservedPath);
		const uploadLog = readFileSync(kit.logPath, "utf8");
		expect(uploadLog).toContain("&& mv");
		expect(readFileSync(reservedPath, "utf8")).toBe("snapshot-before-kill");
		const id = filename.slice("tp-shot-".length).split(".")[0];
		await waitForText(join(logs, `${id}.log`), "Ready:");
		await child.exited;
	} finally {
		kit.cleanup();
	}
});
