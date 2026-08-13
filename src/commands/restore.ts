import { readFileSync } from "node:fs";
import { type CommandContext, registerCommandHandler } from "../lib/cli";
import { type SessionSnapshot, sessionsSnapshotPath } from "../lib/snapshot";
import { hasSession, newSession, setOption } from "../lib/tmux";
import { findPiSessionFile, rebuildRestartCommand } from "./pi-session";

interface RestoreOutcome {
	status: "restored" | "resumed" | "exists" | "no-session-file";
	session: string;
}

function shellQuote(value: string): string {
	if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value;
	return `'${value.replaceAll("'", `\'"\'"\'`)}'`;
}

function snapshotEntry(value: unknown): SessionSnapshot | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value))
		return undefined;
	const record = value as Record<string, unknown>;
	if (
		typeof record.session !== "string" ||
		typeof record.project !== "string" ||
		typeof record.number !== "number" ||
		!Number.isSafeInteger(record.number)
	)
		return undefined;
	return {
		session: record.session,
		project: record.project,
		number: record.number,
		label: typeof record.label === "string" ? record.label : null,
		cwd: typeof record.cwd === "string" ? record.cwd : null,
		tpCmd: typeof record.tpCmd === "string" ? record.tpCmd : null,
		piSessionId:
			typeof record.piSessionId === "string" ? record.piSessionId : null,
		updatedAt:
			typeof record.updatedAt === "string"
				? record.updatedAt
				: new Date(0).toISOString(),
	};
}

function readSnapshot(): { entries?: SessionSnapshot[]; error?: string } {
	const path = sessionsSnapshotPath();
	let text: string;
	try {
		text = readFileSync(path, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT")
			return { entries: [] };
		return { error: `Unable to read session snapshot '${path}'` };
	}
	try {
		const parsed: unknown = JSON.parse(text);
		if (!Array.isArray(parsed)) throw new Error("snapshot is not an array");
		const entries = parsed.map(snapshotEntry);
		if (entries.some((entry) => entry === undefined))
			throw new Error("snapshot contains an invalid entry");
		return {
			entries: entries.filter(
				(entry): entry is SessionSnapshot => entry !== undefined,
			),
		};
	} catch {
		return { error: `Unable to parse session snapshot '${path}'` };
	}
}

function filteredEntries(
	entries: readonly SessionSnapshot[],
	project: string | undefined,
): SessionSnapshot[] {
	return entries.filter(
		(entry) => project === undefined || entry.project === project,
	);
}

function listSnapshot(
	context: CommandContext,
	entries: readonly SessionSnapshot[],
): number {
	context.stdout(`${JSON.stringify(entries, null, "\t")}\n`);
	return 0;
}

function restoreEntry(entry: SessionSnapshot): RestoreOutcome {
	if (hasSession(entry.session))
		return { status: "exists", session: entry.session };

	let command: string[] | undefined;
	let status: RestoreOutcome["status"] = "restored";
	if (entry.piSessionId && entry.tpCmd) {
		const sessionFile = findPiSessionFile(
			entry.cwd || process.cwd(),
			entry.piSessionId,
		);
		if (!sessionFile) status = "no-session-file";
		else {
			command = rebuildRestartCommand(entry.tpCmd, sessionFile);
			if (!command) throw new Error("recorded TP_CMD cannot be restarted");
			status = "resumed";
		}
	}

	const environment = command
		? { TP_CMD: command.map(shellQuote).join(" ") }
		: undefined;
	newSession(entry.session, {
		cwd: entry.cwd ?? undefined,
		command,
		environment,
	});
	if (entry.label !== null) setOption(entry.session, "@tp_name", entry.label);
	return { status, session: entry.session };
}

function restoreCommand(context: CommandContext): number {
	const snapshot = readSnapshot();
	if (snapshot.error) {
		context.stderr(snapshot.error);
		return 1;
	}
	const requestedProject = context.args.options.project;
	const project =
		typeof requestedProject === "string" ? requestedProject : undefined;
	const entries = filteredEntries(snapshot.entries ?? [], project);
	if (context.args.options.list === true) return listSnapshot(context, entries);
	if (!entries.length) {
		context.stdout("No saved sessions.\n");
		return 0;
	}

	const outcomes: RestoreOutcome[] = [];
	let failed = false;
	for (const entry of entries) {
		try {
			outcomes.push(restoreEntry(entry));
		} catch (error) {
			failed = true;
			context.stderr(
				`Failed ${entry.session}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
	context.stdout("Outcome\tSession\n");
	for (const outcome of outcomes)
		context.stdout(`${outcome.status}\t${outcome.session}\n`);
	return failed ? 1 : 0;
}

export function registerRestoreCommands(): void {
	registerCommandHandler("restore", restoreCommand);
}
