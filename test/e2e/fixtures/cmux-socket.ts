import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface CmuxWorkspace {
	title?: string;
	name?: string;
	ref?: string;
	id?: string;
	selected?: boolean;
}

export interface CmuxRequest {
	id: string;
	method: string;
	params: Record<string, unknown>;
}

export interface FakeCmuxSocketOptions {
	rejectRequests?: boolean;
}

export class FakeCmuxSocket {
	readonly root = mkdtempSync(join(tmpdir(), "tp-cmux-e2e-"));
	readonly path = join(this.root, "cmux.sock");
	readonly requests: CmuxRequest[] = [];
	private readonly workspaces: CmuxWorkspace[];
	private readonly rejectRequests: boolean;
	private listener?: Bun.UnixSocketListener<unknown>;
	private nextWorkspace = 1;

	constructor(
		workspaces: CmuxWorkspace[] = [],
		options: FakeCmuxSocketOptions = {},
	) {
		this.workspaces = workspaces.map((workspace) => ({ ...workspace }));
		this.rejectRequests = options.rejectRequests ?? false;
		for (const workspace of this.workspaces) {
			const ref = workspace.ref ?? workspace.id;
			const match = ref?.match(/^workspace:(\d+)$/);
			if (match)
				this.nextWorkspace = Math.max(this.nextWorkspace, Number(match[1]) + 1);
		}
	}

	start(): void {
		this.listener = Bun.listen({
			unix: this.path,
			socket: {
				data: (socket, data) => {
					if (this.rejectRequests) {
						socket.end();
						return;
					}
					const lines = new TextDecoder()
						.decode(data)
						.split("\n")
						.filter(Boolean);
					for (const line of lines) this.respond(socket, line);
				},
			},
		});
	}

	stop(): void {
		this.listener?.stop(true);
		this.listener = undefined;
		rmSync(this.root, { recursive: true, force: true });
	}

	private respond(socket: Bun.Socket<unknown>, line: string): void {
		let request: CmuxRequest;
		try {
			request = JSON.parse(line) as CmuxRequest;
		} catch {
			return;
		}
		this.requests.push(request);
		let result: Record<string, unknown> = {};
		switch (request.method) {
			case "system.ping":
				result = { pong: true };
				break;
			case "workspace.list":
				result = { workspaces: this.workspaces };
				break;
			case "workspace.select":
				result = { workspace_id: request.params.workspace_id };
				break;
			case "workspace.create": {
				const ref = `workspace:${this.nextWorkspace++}`;
				this.workspaces.push({
					title: String(request.params.title ?? ""),
					ref,
				});
				result = { workspace_id: ref, workspace_ref: ref };
				break;
			}
			case "surface.send_text":
				break;
		}
		socket.write(`${JSON.stringify({ id: request.id, ok: true, result })}\n`);
		socket.end();
	}
}
