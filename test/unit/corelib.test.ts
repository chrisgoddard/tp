import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, loadConfigOrExit } from "../../src/lib/config";
import {
	buildLine,
	colorMode,
	colorize,
	stripAnsi,
} from "../../src/lib/output";
import {
	decodePaneOptions,
	mapPiState,
	stateVisual,
	truncatePiId,
} from "../../src/lib/pi";
import {
	formatNumber,
	nextNumber,
	parseNumber,
	parseSessionName,
	projectName,
	sortSessionNames,
} from "../../src/lib/project";

const temporaryDirectories: string[] = [];
afterEach(() => {
	for (const path of temporaryDirectories.splice(0))
		rmSync(path, { recursive: true, force: true });
});

describe("config", () => {
	test("resolves flag over env over file over default across every layer", () => {
		const directory = mkdtempSync(join(tmpdir(), "tp-config-"));
		temporaryDirectories.push(directory);
		const path = join(directory, "config.toml");
		writeFileSync(
			path,
			'shell = "file-shell"\ncolor = "file-color"\n[shot]\nhost = "file-host"\nremote_dir = "file-dir"\nnotifier = "file-notifier"\ntransport = "file-transport"\n',
		);
		const config = loadConfig({
			configPath: path,
			env: {
				SHELL: "default-shell",
				TP_SHELL: "env-shell",
				TP_COLOR: "env-color",
				TP_SHOT_HOST: "env-host",
			},
			flags: { shell: "flag-shell", shot: { notifier: "flag-notifier" } },
		});
		expect(config.shell).toBe("flag-shell"); // flag > env > file > default
		expect(config.color).toBe("env-color");
		expect(config.shot.host).toBe("env-host");
		expect(config.shot.remote_dir).toBe("file-dir");
		expect(config.shot.notifier).toBe("flag-notifier");
		expect(config.shot.transport).toBe("file-transport");

		const defaults = loadConfig({
			configPath: join(directory, "missing.toml"),
			env: {},
		});
		expect(defaults.shell).toBe("fish");
		expect(defaults.color).toBe("auto");
		expect(defaults.shot.transport).toBe("ssh");
	});

	test("missing file uses defaults and invalid TOML is clear", () => {
		const directory = mkdtempSync(join(tmpdir(), "tp-config-"));
		temporaryDirectories.push(directory);
		const missing = loadConfig({
			configPath: join(directory, "missing.toml"),
			env: { SHELL: "/bin/zsh" },
		});
		expect(missing.shell).toBe("/bin/zsh");
		const path = join(directory, "bad.toml");
		writeFileSync(path, "shell = [");
		expect(() => loadConfig({ configPath: path })).toThrow(
			/Invalid TOML configuration/,
		);

		const messages: string[] = [];
		let exitCode: number | undefined;
		const originalError = console.error;
		console.error = (...parts: unknown[]) => messages.push(parts.join(" "));
		try {
			loadConfigOrExit({ configPath: path }, (code) => {
				exitCode = code;
				throw new Error("terminated");
			});
		} catch (error) {
			expect(error).toEqual(new Error("terminated"));
		}
		console.error = originalError;
		expect(exitCode).toBe(1);
		expect(messages[0]).toMatch(/Invalid TOML configuration/);
		expect(messages[0]).toContain(path);
	});

	test("warns once for each unknown key and continues", () => {
		const directory = mkdtempSync(join(tmpdir(), "tp-config-"));
		temporaryDirectories.push(directory);
		const path = join(directory, "unknown.toml");
		writeFileSync(path, "corelib_unique_unknown = true\n");
		const warnings: string[] = [];
		const originalError = console.error;
		console.error = (...parts: unknown[]) => warnings.push(parts.join(" "));
		try {
			loadConfig({ configPath: path });
			loadConfig({ configPath: path });
		} finally {
			console.error = originalError;
		}
		expect(warnings).toEqual([
			"Warning: unknown config key 'corelib_unique_unknown'",
		]);
	});
});

describe("project numbering", () => {
	test("strips leading dots and preserves Unicode", () => {
		expect(projectName("/tmp/...hidden")).toBe("hidden");
		expect(projectName("/tmp/.")).toBe("");
		expect(projectName("/tmp/東京")).toBe("東京");
	});

	test("formats decimal numbers and rejects suffixes", () => {
		expect(parseNumber("2")).toBe(2);
		expect(formatNumber("2")).toBe("002");
		expect(() => parseNumber("2x")).toThrow();
		expect(parseSessionName("web_009")).toEqual({ project: "web", number: 9 });
		expect(nextNumber(["web_001", "web_009", "other_100"], "web")).toBe(10);
		expect(sortSessionNames(["web_010", "web_002", "api_001"])).toEqual([
			"api_001",
			"web_002",
			"web_010",
		]);
	});
});

describe("Pi metadata", () => {
	test("maps state markers and hides dead panes", () => {
		expect(mapPiState("blocked")).toBe("blocked");
		expect(stateVisual("blocked")).toEqual({ marker: "⏸", colour: "yellow" });
		expect(stateVisual("tool")).toEqual({ marker: "●", colour: "cyan" });
		expect(stateVisual("thinking")).toEqual({ marker: "●", colour: "blue" });
		expect(stateVisual("idle")).toEqual({ marker: "○", colour: "brblack" });
		const options = {
			sessionId: "123456789012345678",
			pid: "123",
			state: "tool",
			tool: "bash",
			ctxPct: "85",
			model: "model",
		};
		expect(decodePaneOptions(options, () => false)).toBeNull();
		expect(decodePaneOptions(options, () => true)).toMatchObject({
			displayId: "1234567890123",
			state: "tool",
			ctxPct: 85,
		});
		expect(truncatePiId(options.sessionId)).toHaveLength(13);
	});
});

describe("output", () => {
	test("NO_COLOR wins over TP_COLOR=always and plain mode strips ANSI", () => {
		expect(
			colorMode({ env: { NO_COLOR: "", TP_COLOR: "always" }, isTTY: true }),
		).toBe("never");
		expect(colorMode({ env: { TP_COLOR: "always" }, isTTY: false })).toBe(
			"always",
		);
		expect(colorMode({ env: {}, isTTY: true })).toBe("always");
		expect(colorMode({ env: {}, isTTY: false })).toBe("never");
		expect(stripAnsi(colorize("x", "red"))).toBe("x");
		expect(colorize("x", "red", false)).toBe("x");
	});

	test("drops fields from the right in order", () => {
		const fields = [{ text: "state" }, { text: "ctx" }, { text: "model" }];
		expect(buildLine(fields, 20, false)).toBe("state ctx model");
		expect(buildLine(fields, 10, false)).toBe("state ctx");
		expect(buildLine(fields, 6, false)).toBe("state");
	});
});
