import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse } from "smol-toml";
import { type Exit, fail } from "./exit";

export interface ShotConfig {
	host?: string;
	remote_dir?: string;
	taildrive_dir?: string;
	notifier?: string;
	transport: string;
}

export interface LayoutWindow {
	name: string;
	cmd?: string;
	split?: "h" | "v";
}

export interface Layout {
	windows: LayoutWindow[];
}

export type LayoutsConfig = Record<string, Layout>;

export interface TpConfig {
	shell: string;
	color: string;
	shot: ShotConfig;
	layouts: LayoutsConfig;
}

export type ConfigOverrides = Partial<Omit<TpConfig, "shot" | "layouts">> & {
	shot?: Partial<ShotConfig>;
	layouts?: LayoutsConfig;
	shotHost?: string;
	shotRemoteDir?: string;
	shotNotifier?: string;
	shotTransport?: string;
};

export function isLayoutWindow(value: unknown): value is LayoutWindow {
	if (typeof value !== "object" || value === null || Array.isArray(value))
		return false;
	const window = value as Record<string, unknown>;
	return (
		typeof window.name === "string" &&
		(window.cmd === undefined || typeof window.cmd === "string") &&
		(window.split === undefined || window.split === "h" || window.split === "v")
	);
}

export function isLayout(value: unknown): value is Layout {
	if (typeof value !== "object" || value === null || Array.isArray(value))
		return false;
	const layout = value as Record<string, unknown>;
	return Array.isArray(layout.windows) && layout.windows.every(isLayoutWindow);
}

export function isLayouts(value: unknown): value is LayoutsConfig {
	if (typeof value !== "object" || value === null || Array.isArray(value))
		return false;
	return Object.values(value).every(isLayout);
}

export interface LoadConfigOptions {
	flags?: ConfigOverrides;
	env?: Record<string, string | undefined>;
	configPath?: string;
	warn?: (message: string) => void;
}

export class ConfigError extends Error {
	readonly exitCode = 1;

	constructor(path: string, cause: unknown) {
		const detail = cause instanceof Error ? cause.message : String(cause);
		super(`Invalid TOML configuration in ${path}: ${detail}`);
		this.name = "ConfigError";
	}
}

const warnedKeys = new Set<string>();

export function configPath(
	env: Record<string, string | undefined> = process.env,
): string {
	const root = env.XDG_CONFIG_HOME || join(env.HOME || homedir(), ".config");
	return join(root, "tp", "config.toml");
}

function record(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function stringValue(
	value: unknown,
	fallback: string | undefined,
): string | undefined {
	return typeof value === "string" ? value : fallback;
}

function warnUnknown(key: string, warn: (message: string) => void): void {
	if (warnedKeys.has(key)) return;
	warnedKeys.add(key);
	warn(`Warning: unknown config key '${key}'`);
}

function inspectKeys(
	source: Record<string, unknown>,
	warn: (message: string) => void,
): void {
	for (const key of Object.keys(source)) {
		if (
			key !== "shell" &&
			key !== "color" &&
			key !== "shot" &&
			key !== "layouts"
		)
			warnUnknown(key, warn);
	}
	const shot = source.shot;
	if (shot !== undefined) {
		for (const key of Object.keys(record(shot))) {
			if (
				!"host remote_dir taildrive_dir notifier transport"
					.split(" ")
					.includes(key)
			)
				warnUnknown(`shot.${key}`, warn);
		}
	}
}

function fromSource(source: Record<string, unknown>): ConfigOverrides {
	const shot = record(source.shot);
	return {
		shell: stringValue(source.shell, undefined),
		color: stringValue(source.color, undefined),
		shot: {
			host: stringValue(shot.host, undefined),
			remote_dir: stringValue(shot.remote_dir, undefined),
			taildrive_dir: stringValue(shot.taildrive_dir, undefined),
			notifier: stringValue(shot.notifier, undefined),
			transport: stringValue(shot.transport, undefined),
		},
		layouts: record(source.layouts) as LayoutsConfig,
	};
}

function apply(config: TpConfig, overrides: ConfigOverrides): void {
	if (overrides.shell !== undefined) config.shell = overrides.shell;
	if (overrides.color !== undefined) config.color = overrides.color;
	const shot = overrides.shot;
	if (shot) {
		if (shot.host !== undefined) config.shot.host = shot.host;
		if (shot.remote_dir !== undefined) config.shot.remote_dir = shot.remote_dir;
		if (shot.taildrive_dir !== undefined)
			config.shot.taildrive_dir = shot.taildrive_dir;
		if (shot.notifier !== undefined) config.shot.notifier = shot.notifier;
		if (shot.transport !== undefined) config.shot.transport = shot.transport;
	}
	if (overrides.shotHost !== undefined) config.shot.host = overrides.shotHost;
	if (overrides.shotRemoteDir !== undefined)
		config.shot.remote_dir = overrides.shotRemoteDir;
	if (overrides.shotNotifier !== undefined)
		config.shot.notifier = overrides.shotNotifier;
	if (overrides.shotTransport !== undefined)
		config.shot.transport = overrides.shotTransport;
	if (overrides.layouts !== undefined)
		config.layouts = { ...config.layouts, ...overrides.layouts };
}

function envOverrides(
	env: Record<string, string | undefined>,
): ConfigOverrides {
	return {
		shell: env.TP_SHELL,
		color: env.TP_COLOR,
		shot: {
			host: env.TP_SHOT_HOST,
			remote_dir: env.TP_SHOT_REMOTE_DIR,
			notifier: env.TP_SHOT_NOTIFIER,
			transport: env.TP_SHOT_TRANSPORT,
		},
	};
}

const defaults = (env: Record<string, string | undefined>): TpConfig => ({
	shell: env.SHELL || "fish",
	color: "auto",
	shot: { transport: "ssh" },
	layouts: {},
});

export function loadConfig(options: LoadConfigOptions = {}): TpConfig {
	const env = options.env ?? process.env;
	const path = options.configPath ?? configPath(env);
	const warn = options.warn ?? ((message: string) => console.error(message));
	const config = defaults(env);
	let file: ConfigOverrides = {};
	try {
		const text = readFileSync(path, "utf8");
		try {
			const parsed = record(parse(text));
			inspectKeys(parsed, warn);
			file = fromSource(parsed);
		} catch (error) {
			throw new ConfigError(path, error);
		}
	} catch (error) {
		if (error instanceof ConfigError) throw error;
		// A missing config is equivalent to an empty config.
		if ((error as NodeJS.ErrnoException).code !== "ENOENT")
			throw new ConfigError(path, error);
	}
	apply(config, file);
	apply(config, envOverrides(env));
	apply(config, options.flags ?? {});
	return config;
}

export function loadConfigOrExit(
	options: LoadConfigOptions = {},
	exit?: Exit,
): TpConfig {
	try {
		return loadConfig(options);
	} catch (error) {
		return fail(error instanceof Error ? error.message : String(error), exit);
	}
}
