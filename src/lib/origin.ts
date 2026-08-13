import { isIP } from "node:net";
import { tmuxCommand } from "./tmux";

const SOURCE_PREFIX = "@tp_ssh_source_";
const PENDING_PREFIX = "@tp_ssh_source_pending_";
const PENDING_TTY_PREFIX = "@tp_ssh_tty_pending_";
const PENDING_OWNER_PREFIX = "@tp_ssh_owner_pending_";
const WHOIS_BUDGET_MS = 150;

/** Return the safe tmux-option suffix for a client TTY, or null if invalid. */
function hasControlCharacter(value: string): boolean {
	for (const character of value) {
		const code = character.codePointAt(0) ?? 0;
		if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return true;
	}
	return false;
}

export function sanitizeClientTty(value: string): string | null {
	const trimmed = value.trim();
	if (
		trimmed.length === 0 ||
		trimmed.length > 255 ||
		hasControlCharacter(trimmed)
	)
		return null;
	const sanitized = trimmed
		.replace(/[^A-Za-z0-9]+/gu, "_")
		.replace(/^_+|_+$/gu, "");
	return sanitized || null;
}

function sourceOption(clientTty: string): string | null {
	const sanitized = sanitizeClientTty(clientTty);
	return sanitized === null ? null : `${SOURCE_PREFIX}${sanitized}`;
}

function unsetOption(option: string): void {
	try {
		tmuxCommand(["set-option", "-guq", option], true);
	} catch {
		// Stamping is best effort. A missing tmux server must not break attach.
	}
}

function readOption(option: string): string {
	try {
		return tmuxCommand(["show-option", "-gqv", option], true).trim();
	} catch {
		return "";
	}
}

function sshSource(): string | null {
	const connection = process.env.SSH_CONNECTION?.trim();
	if (!connection || hasControlCharacter(connection)) return null;
	const source = connection.split(/\s+/u)[0];
	if (!source || /\s/u.test(source) || hasControlCharacter(source)) return null;
	return source;
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/gu, `'"'"'`)}'`;
}

function hookSlot(): string {
	let slot = String(process.pid);
	if (tmuxCommand(["show-hooks", "-g", `client-attached[${slot}]`], true)) {
		slot = `${process.pid}_${Math.floor(Math.random() * 1_000_000_000)}`;
	}
	return slot;
}

function installStampHook(
	option: string,
	clientTty: string,
	source: string,
): void {
	const hookTmux = process.env.TP_TMUX_SOCKET
		? `tmux -L ${shellQuote(process.env.TP_TMUX_SOCKET)}`
		: "tmux";
	const slot = hookSlot();
	const pendingId = `${process.pid}_${slot}`;
	const pendingSource = `${PENDING_PREFIX}${pendingId}`;
	const pendingTty = `${PENDING_TTY_PREFIX}${pendingId}`;
	const pendingOwner = `${PENDING_OWNER_PREFIX}${pendingId}`;
	const hookName = `client-attached[${slot}]`;
	const cleanup = [
		`${hookTmux} set-hook -gu ${shellQuote(hookName)}`,
		`${hookTmux} set-option -guq ${shellQuote(pendingSource)}`,
		`${hookTmux} set-option -guq ${shellQuote(pendingTty)}`,
		`${hookTmux} set-option -guq ${shellQuote(pendingOwner)}`,
	].join("; ");
	const script = [
		`source=$(${hookTmux} show-option -gqv ${shellQuote(pendingSource)})`,
		`expected_tty=$(${hookTmux} show-option -gqv ${shellQuote(pendingTty)})`,
		`owner=$(${hookTmux} show-option -gqv ${shellQuote(pendingOwner)})`,
		"actual_tty=#{client_tty}",
		"created=#{client_created}",
		`if test -n "$source" && kill -0 "$owner" 2>/dev/null && test "$actual_tty" = "$expected_tty"; then case "$created" in ""|*[!0-9]*) ;; *) if test "\${#created}" -le 15; then ${hookTmux} set-option -gq ${shellQuote(option)} "v1 ip=$source created=$created"; fi ;; esac; fi`,
		cleanup,
	].join("; ");

	try {
		tmuxCommand(["set-option", "-gq", pendingSource, source]);
		tmuxCommand(["set-option", "-gq", pendingTty, clientTty]);
		tmuxCommand(["set-option", "-gq", pendingOwner, String(process.pid)]);
		tmuxCommand([
			"set-hook",
			"-g",
			hookName,
			`run-shell ${shellQuote(script)}`,
		]);
	} catch {
		unsetOption(option);
		try {
			tmuxCommand(["set-hook", "-gu", hookName], true);
			tmuxCommand(["set-option", "-guq", pendingSource], true);
			tmuxCommand(["set-option", "-guq", pendingTty], true);
			tmuxCommand(["set-option", "-guq", pendingOwner], true);
		} catch {
			// Best-effort cleanup only.
		}
	}
}

/**
 * Prepare the per-client SSH source option before an outside attach.
 * Inside tmux, only the current client's already-recorded mapping is trusted.
 */
export function stampSshSource(clientTty: string): Promise<void> | void {
	if (process.env.TMUX) {
		try {
			const currentTty = tmuxCommand(
				["display-message", "-p", "#{client_tty}"],
				true,
			).trim();
			const option = sourceOption(currentTty);
			if (option) readOption(option);
		} catch {
			// Switching sessions must remain available when client metadata is absent.
		}
		return;
	}

	const option = sourceOption(clientTty);
	if (!option) return;
	const source = sshSource();
	if (!source) {
		unsetOption(option);
		return;
	}
	unsetOption(option);
	installStampHook(option, clientTty.trim(), source);
}

function parseWhoisHostname(value: unknown): string | null {
	if (!value || typeof value !== "object") return null;
	const root = value as Record<string, unknown>;
	const node =
		root.Node && typeof root.Node === "object"
			? (root.Node as Record<string, unknown>)
			: root;
	for (const key of ["DNSName", "Hostname", "HostName", "Name"]) {
		const candidate = node[key];
		if (typeof candidate === "string" && candidate.trim())
			return candidate.trim().replace(/\.+$/u, "");
	}
	return null;
}

async function whoisHostname(ip: string): Promise<string | null> {
	if (isIP(ip) === 0) return null;
	try {
		const child = Bun.spawn(["tailscale", "whois", "--json", ip], {
			stdout: "pipe",
			stderr: "ignore",
			killSignal: "SIGKILL",
		});
		const output = child.stdout
			? new Response(child.stdout).text()
			: Promise.resolve("");
		const timeout = new Promise<null>((resolve) =>
			setTimeout(() => {
				child.kill("SIGKILL");
				resolve(null);
			}, WHOIS_BUDGET_MS),
		);
		const stdout = await Promise.race([output, timeout]);
		if (stdout === null) return null;
		const exitCode = await child.exited;
		if (exitCode !== 0 || !stdout.trim()) return null;
		return parseWhoisHostname(JSON.parse(stdout) as unknown);
	} catch {
		return null;
	}
}

const attachedDeviceCache = new Map<string, Promise<string | null>>();

/** Resolve a Tailscale device without allowing a slow CLI to delay callers. */
export function resolveAttachedDevice(ip: string): Promise<string | null> {
	const cached = attachedDeviceCache.get(ip);
	if (cached) return cached;
	const result = whoisHostname(ip);
	attachedDeviceCache.set(ip, result);
	return result;
}

export type CurrentSshOrigin = {
	ip: string;
	created: string;
	clientCreated: string;
};

export type CurrentSshOriginState =
	| { kind: "missing" }
	| { kind: "invalid" }
	| { kind: "valid"; origin: CurrentSshOrigin };

/** Read and validate the current client's stamped origin mapping. */
export function readCurrentSshOriginState(): CurrentSshOriginState {
	try {
		if (!process.env.TMUX) return { kind: "missing" };
		const clientTty = tmuxCommand(
			["display-message", "-p", "#{client_tty}"],
			true,
		).trim();
		const option = sourceOption(clientTty);
		if (!option) return { kind: "invalid" };
		const value = readOption(option);
		if (!value) return { kind: "missing" };
		const match = /^v1 ip=(\S+) created=(\d+)$/u.exec(value);
		if (!match || isIP(match[1]) === 0) return { kind: "invalid" };
		const clientCreated = tmuxCommand(
			["display-message", "-p", "#{client_created}"],
			true,
		).trim();
		return {
			kind: "valid",
			origin: { ip: match[1], created: match[2], clientCreated },
		};
	} catch {
		return { kind: "missing" };
	}
}

export function readCurrentSshOrigin(): CurrentSshOrigin | null {
	const state = readCurrentSshOriginState();
	return state.kind === "valid" ? state.origin : null;
}

export interface WhoisDetails {
	hostname: string;
	user: string;
}

/** Resolve the user-facing fields from a Tailscale whois JSON document. */
export function parseWhoisDetails(value: unknown): WhoisDetails | null {
	const hostname = parseWhoisHostname(value);
	if (!hostname || !value || typeof value !== "object") return null;
	const root = value as Record<string, unknown>;
	const profile =
		root.UserProfile && typeof root.UserProfile === "object"
			? (root.UserProfile as Record<string, unknown>)
			: undefined;
	const node =
		root.Node && typeof root.Node === "object"
			? (root.Node as Record<string, unknown>)
			: undefined;
	const user = [profile?.LoginName, profile?.DisplayName, node?.User].find(
		(candidate): candidate is string =>
			typeof candidate === "string" && candidate.trim().length > 0,
	);
	return { hostname, user: user?.trim() ?? "unknown" };
}

export async function tailscaleWhois(
	ip: string,
): Promise<{ kind: "absent" | "error" | "found"; details?: WhoisDetails }> {
	if (isIP(ip) === 0) return { kind: "error" };
	if (!Bun.which("tailscale")) return { kind: "absent" };
	try {
		const child = Bun.spawn(["tailscale", "whois", "--json", ip], {
			stdout: "pipe",
			stderr: "ignore",
			timeout: 2000,
			killSignal: "SIGKILL",
		});
		const [stdout, exitCode] = await Promise.all([
			child.stdout ? new Response(child.stdout).text() : Promise.resolve(""),
			child.exited,
		]);
		if (exitCode !== 0 || !stdout.trim()) return { kind: "error" };
		const details = parseWhoisDetails(JSON.parse(stdout) as unknown);
		return details ? { kind: "found", details } : { kind: "error" };
	} catch {
		return { kind: "error" };
	}
}
