import { expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
	type ShotTransport,
	TaildriveTransport,
	type TaildriveUploadStep,
	runAsyncWorker,
	stageSourceForAsync,
	syncUpload,
} from "../../src/lib/shot";

class RecordingTransport implements ShotTransport {
	readonly calls: string[] = [];
	constructor(
		private readonly root: string,
		private readonly failAt?: string,
	) {}

	prepareDirectory(remoteDir?: string): string {
		this.calls.push("prepare");
		if (this.failAt === "prepare") throw new Error("setup failed");
		return this.failAt === "mismatch" ? this.root : (remoteDir ?? this.root);
	}

	upload(sourcePath: string, remotePath: string): void {
		this.calls.push(`upload:${remotePath}`);
		if (this.failAt === "upload") throw new Error("upload failed");
		writeFileSync(remotePath, readFileSync(sourcePath));
	}

	protect(path: string): void {
		this.calls.push(`protect:${path}`);
	}

	publish(tempPath: string, finalPath: string): void {
		this.calls.push(`publish:${tempPath}->${finalPath}`);
		if (this.failAt === "publish") throw new Error("publish failed");
		writeFileSync(finalPath, readFileSync(tempPath));
	}

	remove(paths: readonly string[]): void {
		this.calls.push(`remove:${paths.join(",")}`);
	}
}

function jobFiles(): { root: string; source: string; log: string } {
	const root = mkdtempSync(join(tmpdir(), "tp-shot-unit-"));
	mkdirSync(join(root, "remote"));
	const source = join(root, "source.png");
	const log = join(root, "upload.log");
	writeFileSync(source, "before");
	writeFileSync(log, "");
	return { root, source, log };
}

test("async worker uploads to a hidden temporary path before publishing", () => {
	const files = jobFiles();
	const transport = new RecordingTransport(join(files.root, "remote"));
	const finalPath = join(files.root, "remote", "final.png");
	const status = runAsyncWorker(
		{
			host: "test",
			sourcePath: files.source,
			remoteDir: join(files.root, "remote"),
			remotePath: finalPath,
			logPath: files.log,
			removeSource: false,
			notifier: "none",
		},
		{ host: "test", notifier: "none", transport },
	);

	expect(status).toBe(0);
	expect(transport.calls[1]).toBe(
		`upload:${join(files.root, "remote", ".final.png.uploading")}`,
	);
	expect(transport.calls[2]).toContain("publish:");
	expect(readFileSync(finalPath, "utf8")).toBe("before");
});

test("async explicit input is isolated in a private snapshot", () => {
	const files = jobFiles();
	const staged = stageSourceForAsync(files.source, false, {
		TMPDIR: files.root,
	});
	writeFileSync(files.source, "after");

	expect(staged.cleanup).toBe(true);
	expect(readFileSync(staged.path, "utf8")).toBe("before");
});

test("async worker rejects a transport directory mismatch", () => {
	const files = jobFiles();
	const transport = new RecordingTransport(
		join(files.root, "other"),
		"mismatch",
	);
	const status = runAsyncWorker(
		{
			host: "test",
			sourcePath: files.source,
			remoteDir: join(files.root, "remote"),
			remotePath: join(files.root, "remote", "final.png"),
			logPath: files.log,
			removeSource: false,
			notifier: "none",
		},
		{ host: "test", notifier: "none", transport },
	);

	expect(status).toBe(1);
	expect(transport.calls[0]).toBe("prepare");
	expect(transport.calls[1]).toContain("remove:");
	expect(readFileSync(files.log, "utf8")).toContain("did not match");
});

test("async worker records failure and cleans remote paths", () => {
	const files = jobFiles();
	const transport = new RecordingTransport(
		join(files.root, "remote"),
		"upload",
	);
	const status = runAsyncWorker(
		{
			host: "test",
			sourcePath: files.source,
			remoteDir: join(files.root, "remote"),
			remotePath: join(files.root, "remote", "final.png"),
			logPath: files.log,
			removeSource: false,
			notifier: "none",
		},
		{ host: "test", notifier: "none", transport },
	);

	expect(status).toBe(1);
	expect(readFileSync(files.log, "utf8")).toContain("Failed: upload failed");
	expect(transport.calls.at(-1)).toContain("remove:");
});

test("taildrive sync and async uploads publish private files in the share", async () => {
	const files = jobFiles();
	const share = join(files.root, "taildrive");
	mkdirSync(share);
	const transport = new TaildriveTransport(share, { HOME: files.root });

	const sync = syncUpload(files.source, {
		host: "test",
		remoteDir: "/pi/.cache/pi/screenshots",
		notifier: "none",
		env: { HOME: files.root },
		transport,
		transportKind: "taildrive",
	});
	const syncPath = join(share, sync.path.split("/").at(-1) ?? "");
	expect(readFileSync(syncPath, "utf8")).toBe("before");
	expect(statSync(syncPath).mode & 0o777).toBe(0o600);

	const asyncPath = "/pi/.cache/pi/screenshots/async.png";
	const asyncFinalPath = join(share, "async.png");
	const asyncSteps: TaildriveUploadStep[] = [];
	const asyncFinalPresence: boolean[] = [];
	const asyncContents: string[] = [];
	const transportWithObserver = new TaildriveTransport(
		share,
		{ HOME: files.root },
		(step) => {
			asyncSteps.push(step);
			asyncFinalPresence.push(existsSync(asyncFinalPath));
			asyncContents.push(
				readFileSync(step.type === "write" ? step.path : step.from, "utf8"),
			);
		},
	);
	const status = runAsyncWorker(
		{
			host: "test",
			transportKind: "taildrive",
			sourcePath: files.source,
			remoteDir: "/pi/.cache/pi/screenshots",
			remotePath: asyncPath,
			logPath: files.log,
			removeSource: false,
			notifier: "none",
		},
		{ host: "test", notifier: "none", transport: transportWithObserver },
	);

	expect(status).toBe(0);
	expect(asyncSteps).toHaveLength(3);
	expect(asyncSteps[0]).toMatchObject({ type: "write" });
	expect(
		basename(asyncSteps[0].type === "write" ? asyncSteps[0].path : ""),
	).toMatch(/^\.\.async\.png\.uploading\..+\.uploading$/);
	expect(asyncSteps[1]).toMatchObject({
		type: "rename",
		to: join(share, ".async.png.uploading"),
	});
	expect(asyncSteps[2]).toEqual({
		type: "rename",
		from: join(share, ".async.png.uploading"),
		to: asyncFinalPath,
	});
	expect(asyncFinalPresence).toEqual([false, false, false]);
	expect(asyncContents).toEqual(["before", "before", "before"]);
	expect(readFileSync(asyncFinalPath, "utf8")).toBe("before");
	expect(statSync(asyncFinalPath).mode & 0o777).toBe(0o600);
	expect(readdirSync(share).filter((name) => name.startsWith(".")).length).toBe(
		0,
	);
});

test("taildrive upload exposes only the atomic rename result", () => {
	const files = jobFiles();
	const share = join(files.root, "taildrive");
	mkdirSync(share);
	const finalPath = join(share, "observed.png");
	const steps: TaildriveUploadStep[] = [];
	const finalPresence: boolean[] = [];
	const contents: string[] = [];
	const transport = new TaildriveTransport(share, process.env, (step) => {
		steps.push(step);
		finalPresence.push(existsSync(finalPath));
		contents.push(
			readFileSync(step.type === "write" ? step.path : step.from, "utf8"),
		);
	});

	transport.upload(files.source, "/pi/screenshots/observed.png");

	expect(steps).toHaveLength(2);
	expect(steps[0]).toMatchObject({ type: "write" });
	expect(basename(steps[0].type === "write" ? steps[0].path : "")).toMatch(
		/^\.observed\.png\..+\.uploading$/,
	);
	expect(steps[1]).toEqual({
		type: "rename",
		from: steps[0].type === "write" ? steps[0].path : "",
		to: finalPath,
	});
	expect(finalPresence).toEqual([false, false]);
	expect(contents).toEqual(["before", "before"]);
	expect(readFileSync(finalPath, "utf8")).toBe("before");
	expect(statSync(finalPath).mode & 0o777).toBe(0o600);
	expect(readdirSync(share).filter((name) => name.startsWith(".")).length).toBe(
		0,
	);
});

test("taildrive reports a missing mounted share without creating it", () => {
	const files = jobFiles();
	const missing = join(files.root, "not-mounted");
	const transport = new TaildriveTransport(missing);

	expect(() => transport.prepareDirectory("/pi/screenshots")).toThrow(
		`taildrive transport: mounted share directory '${missing}' does not exist`,
	);
});
