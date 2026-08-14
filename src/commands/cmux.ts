import { type CommandContext, registerCommandHandler } from "../lib/cli";
import { type TmuxSession, listSessions } from "../lib/tmux";

const CMUX_SOCKET_PATH = "/tmp/cmux.sock";
const ATTACH_COMMAND = 'exec tmux attach-session -t "=$TP_CMUX_SESSION"\n';
let requestNumber = 0;

interface JsonObject {
	[key: string]: unknown;
}

interface Workspace {
	title?: string;
	name?: string;
	ref?: string;
	id?: string;
}

class CmuxTransportError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "CmuxTransportError";
	}
}

class CmuxProtocolError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CmuxProtocolError";
	}
}

async function requestForSession(
	method: string,
	sessionName: string,
	params: JsonObject = {},
): Promise<unknown> {
	try {
		return await request(method, params);
	} catch (error) {
		if (error instanceof CmuxTransportError) throw error;
		const detail = error instanceof Error ? error.message : String(error);
		throw new CmuxProtocolError(
			`cmux ${method} failed for session '${sessionName}': ${detail}`,
		);
	}
}

function asObject(value: unknown): JsonObject | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as JsonObject)
		: undefined;
}

function socketPath(): string {
	return process.env.CMUX_SOCKET_PATH || CMUX_SOCKET_PATH;
}

function nextRequestId(): string {
	requestNumber += 1;
	return `tp-cmux-${process.pid}-${requestNumber}`;
}

/** Send one newline-delimited v2 request, matching cmux's socket protocol. */
async function request(
	method: string,
	params: JsonObject = {},
): Promise<unknown> {
	const payload = `${JSON.stringify({
		id: nextRequestId(),
		method,
		params,
	})}\n`;
	const path = socketPath();

	return new Promise((resolve, reject) => {
		let settled = false;
		let responseText = "";
		const finish = (callback: () => void): void => {
			if (settled) return;
			settled = true;
			callback();
		};
		const failTransport = (error: unknown): void => {
			const detail = error instanceof Error ? error.message : String(error);
			finish(() => reject(new CmuxTransportError(detail, { cause: error })));
		};

		void Bun.connect({
			unix: path,
			socket: {
				open(socket) {
					socket.timeout(2);
					if (socket.write(payload) < 0) failTransport("socket write failed");
				},
				data(socket, data) {
					responseText += new TextDecoder().decode(data);
					const end = responseText.indexOf("\n");
					if (end < 0) return;
					const line = responseText.slice(0, end).trim();
					finish(() => {
						socket.end();
						try {
							const envelope = asObject(JSON.parse(line));
							if (!envelope)
								throw new CmuxProtocolError(
									"cmux returned a non-object response",
								);
							if (envelope.ok !== true) {
								const error = asObject(envelope.error);
								throw new CmuxProtocolError(
									String(error?.message ?? "cmux request failed"),
								);
							}
							resolve(envelope.result);
						} catch (error) {
							reject(
								error instanceof CmuxProtocolError
									? error
									: new CmuxProtocolError(
											`invalid cmux response: ${error instanceof Error ? error.message : String(error)}`,
										),
							);
						}
					});
				},
				connectError(_socket, error) {
					failTransport(error);
				},
				error(_socket, error) {
					failTransport(error);
				},
				end(socket) {
					socket.end();
					failTransport("socket closed before response");
				},
				timeout(socket) {
					socket.end();
					failTransport("socket request timed out");
				},
			},
		}).catch(failTransport);
	});
}

function workspaceEntries(value: unknown): Workspace[] {
	if (Array.isArray(value)) return value.filter(asObject) as Workspace[];
	const object = asObject(value);
	if (!object) return [];
	const entries = object.workspaces ?? object.data;
	return Array.isArray(entries)
		? (entries.filter(asObject) as Workspace[])
		: [];
}

function workspaceRef(workspace: Workspace): string | undefined {
	const ref = workspace.ref ?? workspace.id;
	return typeof ref === "string" && ref.length > 0 ? ref : undefined;
}

function findWorkspaceRef(
	value: unknown,
	sessionName: string,
): string | undefined {
	const title = `tp:${sessionName}`;
	for (const workspace of workspaceEntries(value)) {
		const workspaceTitle = workspace.title ?? workspace.name;
		if (workspaceTitle === title) return workspaceRef(workspace);
	}
	return undefined;
}

function globalSessions(): TmuxSession[] {
	return listSessions()
		.filter((session) => /^.+_\d+$/.test(session.name))
		.sort((left, right) => {
			const leftProject = left.name.replace(/_\d+$/, "");
			const rightProject = right.name.replace(/_\d+$/, "");
			const projectOrder = leftProject.localeCompare(rightProject);
			if (projectOrder !== 0) return projectOrder;
			return (
				Number(left.name.match(/\d+$/)?.[0] ?? 0) -
				Number(right.name.match(/\d+$/)?.[0] ?? 0)
			);
		});
}

function printConnectionGuidance(context: CommandContext): void {
	context.stderr(
		"Cannot connect to cmux. Run this inside a cmux terminal, or enable\nSettings → Automation → Socket Control Mode → Automation.",
	);
}

async function openSession(
	context: CommandContext,
	session: TmuxSession,
): Promise<void> {
	const workspaces = await requestForSession("workspace.list", session.name);
	const existingRef = findWorkspaceRef(workspaces, session.name);
	if (existingRef) {
		await requestForSession("workspace.select", session.name, {
			workspace_id: existingRef,
		});
		context.stdout(`Focused cmux workspace for ${session.name}\n`);
		return;
	}

	const created = await requestForSession("workspace.create", session.name, {
		title: `tp:${session.name}`,
		cwd: session.cwd || process.env.HOME || "/",
		workspace_env: { TP_CMUX_SESSION: session.name },
	});
	const createdObject = asObject(created);
	const createdRef = createdObject
		? typeof createdObject.workspace_ref === "string"
			? createdObject.workspace_ref
			: typeof createdObject.workspace_id === "string"
				? createdObject.workspace_id
				: undefined
		: undefined;
	if (!createdRef)
		throw new CmuxProtocolError(
			`cmux workspace.create failed for session '${session.name}': response returned no workspace id`,
		);
	await requestForSession("surface.send_text", session.name, {
		workspace_id: createdRef,
		text: ATTACH_COMMAND,
	});
	context.stdout(`Opened ${session.name} in cmux\n`);
}

async function cmuxCommand(context: CommandContext): Promise<number> {
	try {
		await request("system.ping");
	} catch {
		printConnectionGuidance(context);
		return 1;
	}

	const sessions = globalSessions();
	if (sessions.length === 0) {
		context.stdout("No tp sessions\n");
		return 1;
	}

	const selection = context.args.positionals[0];
	try {
		if (!selection) {
			const workspaces = await requestForSession(
				"workspace.list",
				"all sessions",
			);
			context.stdout("All tp sessions:\n");
			for (const [index, session] of sessions.entries()) {
				const state = findWorkspaceRef(workspaces, session.name)
					? " (open in cmux)"
					: "";
				const label = session.label ? ` [${session.label}]` : "";
				context.stdout(
					`  ${String(index + 1).padStart(2, " ")}  →  ${session.name}${label}${state}\n`,
				);
			}
			context.stdout(
				"\nOpen with: tp c <index|prefix>   Open all with: tp c all\n",
			);
			return 0;
		}

		if (selection === "all" || selection === "a") {
			let result = 0;
			for (const session of sessions) {
				try {
					await openSession(context, session);
				} catch (error) {
					if (error instanceof CmuxTransportError) {
						printConnectionGuidance(context);
						result = 1;
						continue;
					}
					context.stderr(
						error instanceof Error ? error.message : String(error),
					);
					result = 1;
				}
			}
			return result;
		}

		if (!/^\d+$/.test(selection)) {
			const matches = sessions.filter((session) =>
				session.name.startsWith(selection),
			);
			if (matches.length === 0) {
				context.stderr(`No tp sessions start with '${selection}'`);
				return 1;
			}
			let result = 0;
			for (const session of matches) {
				try {
					await openSession(context, session);
				} catch (error) {
					if (error instanceof CmuxTransportError)
						printConnectionGuidance(context);
					else
						context.stderr(
							error instanceof Error ? error.message : String(error),
						);
					result = 1;
				}
			}
			return result;
		}

		const index = Number(selection);
		if (!Number.isSafeInteger(index) || index < 1 || index > sessions.length) {
			context.stderr(`Index out of range (1-${sessions.length})`);
			return 1;
		}
		try {
			await openSession(context, sessions[index - 1]);
		} catch (error) {
			if (error instanceof CmuxTransportError) printConnectionGuidance(context);
			else
				context.stderr(error instanceof Error ? error.message : String(error));
			return 1;
		}
		return 0;
	} catch (error) {
		if (error instanceof CmuxTransportError) printConnectionGuidance(context);
		else context.stderr(error instanceof Error ? error.message : String(error));
		return 1;
	}
}

export function registerCmuxCommands(): void {
	registerCommandHandler("cmux", cmuxCommand);
}
