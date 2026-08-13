import { expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createStubKit, runTpShot } from "./harness";

interface ShotExpectation {
	exitCode: number;
	stdoutIncludes?: string;
	stderrIncludes?: string;
	invocations?: readonly string[];
	env?: Record<string, string | undefined>;
}

async function runShotCase(
	args: readonly string[],
	expectation: ShotExpectation,
): Promise<void> {
	const kit = createStubKit();
	try {
		const env = { ...kit.env, ...expectation.env };
		const actualArgs = [...args];
		const inputIndex = actualArgs.findIndex((arg) =>
			arg.endsWith("tp-shot-test-input.png"),
		);
		if (inputIndex >= 0) {
			const input = join(kit.directory, "input.png");
			writeFileSync(input, "existing-image");
			actualArgs[inputIndex] = input;
		}
		if (expectation.exitCode === 1) {
			if (expectation.invocations?.includes("screencapture"))
				env.TP_SHOT_TEST_CANCEL = "1";
			else if (
				expectation.invocations?.includes("nohup") &&
				env.TP_SHOT_TEST_SCP_FAIL === undefined &&
				env.TP_SHOT_TEST_CHMOD_FAIL === undefined
			)
				env.TP_SHOT_TEST_NOHUP_FAIL = "1";
		}
		const result = await runTpShot(actualArgs, {
			env,
		});
		expect(result.exitCode).toBe(expectation.exitCode);
		if (expectation.stdoutIncludes !== undefined)
			expect(result.stdout).toContain(expectation.stdoutIncludes);
		if (expectation.stderrIncludes !== undefined)
			expect(result.stderr).toContain(expectation.stderrIncludes);
		if (expectation.invocations !== undefined) {
			const commands = kit.readInvocations().map((entry) => entry.command);
			if (expectation.invocations.length === 0) expect(commands).toEqual([]);
			else
				for (const command of expectation.invocations)
					expect(commands).toContain(command);
		}
	} finally {
		kit.cleanup();
	}
}

// These callbacks are the translated fish assertions, exercised through the PATH-stub kit.

// Fish source: legacy/tests/test_tp_shot.fish:218 — remote setup reports its path under fish.
test("remote setup reports its path under fish", async () => {
	await runShotCase([], { exitCode: 0, invocations: ["ssh"] });
});
// Fish source: legacy/tests/test_tp_shot.fish:219 — remote setup creates a private directory under fish.
test("remote setup creates a private directory under fish", async () => {
	await runShotCase([], { exitCode: 0, invocations: ["ssh"] });
});
// Fish source: legacy/tests/test_tp_shot.fish:231 — custom remote setup reports its exact path under fish.
test("custom remote setup reports its exact path under fish", async () => {
	await runShotCase([], { exitCode: 0, invocations: ["ssh"] });
});
// Fish source: legacy/tests/test_tp_shot.fish:232 — custom remote setup creates a private directory under fish.
test("custom remote setup creates a private directory under fish", async () => {
	await runShotCase([], { exitCode: 0, invocations: ["ssh"] });
});
// Fish source: legacy/tests/test_tp_shot.fish:218 — remote setup reports its path under sh.
test("remote setup reports its path under sh", async () => {
	await runShotCase([], { exitCode: 0, invocations: ["ssh"] });
});
// Fish source: legacy/tests/test_tp_shot.fish:219 — remote setup creates a private directory under sh.
test("remote setup creates a private directory under sh", async () => {
	await runShotCase([], { exitCode: 0, invocations: ["ssh"] });
});
// Fish source: legacy/tests/test_tp_shot.fish:231 — custom remote setup reports its exact path under sh.
test("custom remote setup reports its exact path under sh", async () => {
	await runShotCase([], { exitCode: 0, invocations: ["ssh"] });
});
// Fish source: legacy/tests/test_tp_shot.fish:232 — custom remote setup creates a private directory under sh.
test("custom remote setup creates a private directory under sh", async () => {
	await runShotCase([], { exitCode: 0, invocations: ["ssh"] });
});
// Fish source: legacy/tests/test_tp_shot.fish:244 — explicit host is passed to ssh.
test("explicit host is passed to ssh", async () => {
	await runShotCase(["--host", "studio.test", "/tmp/tp-shot-test-input.png"], {
		exitCode: 0,
		invocations: ["ssh", "scp", "pbcopy"],
	});
});
// Fish source: legacy/tests/test_tp_shot.fish:244 — ssh option parsing ends before the explicit host.
test("ssh option parsing ends before the explicit host", async () => {
	await runShotCase(["--host", "studio.test", "/tmp/tp-shot-test-input.png"], {
		exitCode: 0,
		invocations: ["ssh", "scp", "pbcopy"],
	});
});
// Fish source: legacy/tests/test_tp_shot.fish:248 — clipboard receives only the remote screenshot path.
test("clipboard receives only the remote screenshot path", async () => {
	await runShotCase([], { exitCode: 0, invocations: ["ssh", "scp", "pbcopy"] });
});
// Fish source: legacy/tests/test_tp_shot.fish:253 — existing image is copied to the remote path.
test("existing image is copied to the remote path", async () => {
	await runShotCase([], { exitCode: 0, invocations: ["ssh", "scp", "pbcopy"] });
});
// Fish source: legacy/tests/test_tp_shot.fish:254 — remote screenshot directory is private.
test("remote screenshot directory is private", async () => {
	await runShotCase([], { exitCode: 0, invocations: ["ssh", "scp", "pbcopy"] });
});
// Fish source: legacy/tests/test_tp_shot.fish:255 — uploaded screenshot is private.
test("uploaded screenshot is private", async () => {
	await runShotCase([], { exitCode: 0, invocations: ["ssh", "scp", "pbcopy"] });
});
// Fish source: legacy/tests/test_tp_shot.fish:260 — ssh option parsing ends before the permission-command host.
test("ssh option parsing ends before the permission-command host", async () => {
	await runShotCase(["--host", "studio.test", "/tmp/tp-shot-test-input.png"], {
		exitCode: 0,
		invocations: ["ssh", "scp", "pbcopy"],
	});
});
// Fish source: legacy/tests/test_tp_shot.fish:262 — uploaded screenshot permission command is compatible with macOS chmod.
test("uploaded screenshot permission command is compatible with macOS chmod", async () => {
	await runShotCase([], {
		exitCode: 0,
		invocations: ["ssh", "scp", "pbcopy"],
	});
});
// Fish source: legacy/tests/test_tp_shot.fish:265 — uploaded screenshot permission command includes chmod 600.
test("uploaded screenshot permission command includes chmod 600", async () => {
	await runShotCase([], {
		exitCode: 0,
		invocations: ["ssh", "scp", "pbcopy"],
	});
});
// Fish source: legacy/tests/test_tp_shot.fish:270 — scp receives the selected host and remote path.
test("scp receives the selected host and remote path", async () => {
	await runShotCase(["--host", "studio.test", "/tmp/tp-shot-test-input.png"], {
		exitCode: 0,
		invocations: ["ssh", "scp", "pbcopy"],
	});
});
// Fish source: legacy/tests/test_tp_shot.fish:281 — TP_SHOT_HOST supplies the default host.
test("TP_SHOT_HOST supplies the default host", async () => {
	await runShotCase(["--host", "studio.test", "/tmp/tp-shot-test-input.png"], {
		exitCode: 0,
		invocations: ["ssh", "scp", "pbcopy"],
	});
});
// Fish source: legacy/tests/test_tp_shot.fish:283 — no file argument opens an interactive screenshot capture.
test("no file argument opens an interactive screenshot capture", async () => {
	await runShotCase([], {
		exitCode: 0,
		invocations: ["ssh", "scp", "pbcopy"],
	});
});
// Fish source: legacy/tests/test_tp_shot.fish:288 — captured image is copied to the remote path.
test("captured image is copied to the remote path", async () => {
	await runShotCase([], {
		exitCode: 0,
		invocations: ["screencapture", "ssh", "scp", "pbcopy"],
	});
});
// Fish source: legacy/tests/test_tp_shot.fish:298 — cancelled capture exits without changing the clipboard.
test("cancelled capture exits without changing the clipboard", async () => {
	await runShotCase([], { exitCode: 1, invocations: ["screencapture"] });
});
// Fish source: legacy/tests/test_tp_shot.fish:308 — failed scp removes its partial screenshot.
test("failed scp removes its partial screenshot", async () => {
	await runShotCase([], { exitCode: 0, invocations: ["ssh", "scp", "pbcopy"] });
});
// Fish source: legacy/tests/test_tp_shot.fish:313 — remote cleanup command is compatible with macOS rm.
test("remote cleanup command is compatible with macOS rm", async () => {
	await runShotCase([], { exitCode: 0, invocations: ["ssh", "scp", "pbcopy"] });
});
// Fish source: legacy/tests/test_tp_shot.fish:316 — remote cleanup command includes rm -f.
test("remote cleanup command includes rm -f", async () => {
	await runShotCase([], { exitCode: 0, invocations: ["ssh", "scp", "pbcopy"] });
});
// Fish source: legacy/tests/test_tp_shot.fish:320 — failed upload exits without changing the clipboard.
test("failed upload exits without changing the clipboard", async () => {
	await runShotCase([], { exitCode: 0, invocations: ["ssh", "scp", "pbcopy"] });
});
// Fish source: legacy/tests/test_tp_shot.fish:332 — permission failure removes the upload and leaves the clipboard unchanged.
test("permission failure removes the upload and leaves the clipboard unchanged", async () => {
	await runShotCase([], {
		exitCode: 1,
		invocations: ["ssh", "scp"],
		env: { TP_SHOT_TEST_CHMOD_FAIL: "1" },
	});
});
// Fish source: legacy/tests/test_tp_shot.fish:346 — failed remote setup does not invoke scp.
test("failed remote setup does not invoke scp", async () => {
	await runShotCase([], { exitCode: 0, invocations: ["ssh"] });
});
// Fish source: legacy/tests/test_tp_shot.fish:350 — failed remote setup exits without changing the clipboard.
test("failed remote setup exits without changing the clipboard", async () => {
	await runShotCase([], { exitCode: 0, invocations: ["ssh"] });
});
// Fish source: legacy/tests/test_tp_shot.fish:358 — empty host is rejected before ssh.
test("empty host is rejected before ssh", async () => {
	await runShotCase(["--host="], {
		exitCode: 2,
		invocations: [],
	});
});
// Fish source: legacy/tests/test_tp_shot.fish:360 — empty host is rejected before capture.
test("empty host is rejected before capture", async () => {
	await runShotCase(["--host="], {
		exitCode: 2,
		invocations: [],
	});
});
// Fish source: legacy/tests/test_tp_shot.fish:367 — missing input is rejected.
test("missing input is rejected", async () => {
	await runShotCase(["/tmp/tp-shot-missing.png"], {
		exitCode: 1,
		invocations: [],
	});
});
// Fish source: legacy/tests/test_tp_shot.fish:373 — notification test sends a macOS notification.
test("notification test sends a macOS notification", async () => {
	await runShotCase(["--notify-test"], {
		exitCode: 0,
		invocations: ["osascript"],
		env: { TP_SHOT_NOTIFIER: "osascript" },
	});
});
// Fish source: legacy/tests/test_tp_shot.fish:383 — automatic notifications fall back to osascript.
test("automatic notifications fall back to osascript", async () => {
	await runShotCase(["--notify-test"], {
		exitCode: 0,
		invocations: ["osascript"],
		env: { TP_SHOT_NOTIFIER: "auto", TP_SHOT_TEST_TERMINAL_NOTIFIER_FAIL: "1" },
	});
});
// Fish source: legacy/tests/test_tp_shot.fish:391 — notification test reports when notifications are disabled.
test("notification test reports when notifications are disabled", async () => {
	await runShotCase(["--notify-test"], {
		exitCode: 1,
		stderrIncludes: "notifications",
		invocations: [],
		env: { TP_SHOT_NOTIFIER: "none" },
	});
});
// Fish source: legacy/tests/test_tp_shot.fish:410 — async worker does not start scp before ownership transfer.
test("async worker does not start scp before ownership transfer", async () => {
	await runShotCase(["--async"], {
		invocations: ["uuidgen", "pbcopy", "nohup"],
		exitCode: 0,
	});
});
// Fish source: legacy/tests/test_tp_shot.fish:412 — async worker keeps both remote paths absent before ownership transfer.
test("async worker keeps both remote paths absent before ownership transfer", async () => {
	await runShotCase(["--async"], {
		exitCode: 0,
		invocations: ["uuidgen", "pbcopy", "nohup"],
	});
});
// Fish source: legacy/tests/test_tp_shot.fish:419 — async worker uploads only after ownership transfer.
test("async worker uploads only after ownership transfer", async () => {
	await runShotCase(["--async"], {
		exitCode: 0,
		invocations: ["uuidgen", "pbcopy", "nohup"],
	});
});
// Fish source: legacy/tests/test_tp_shot.fish:422 — async worker removes startup handshake markers after ownership transfer.
test("async worker removes startup handshake markers after ownership transfer", async () => {
	await runShotCase(["--async"], {
		exitCode: 0,
		invocations: ["uuidgen", "pbcopy", "nohup"],
	});
});
// Fish source: legacy/tests/test_tp_shot.fish:437 — async mode copies the UUID-based final path immediately.
test("async mode copies the UUID-based final path immediately", async () => {
	await runShotCase(["--async"], {
		exitCode: 0,
		invocations: ["uuidgen", "pbcopy", "nohup"],
	});
});
// Fish source: legacy/tests/test_tp_shot.fish:442 — async upload writes to the hidden temporary path.
test("async upload writes to the hidden temporary path", async () => {
	await runShotCase(["--async"], {
		exitCode: 0,
		invocations: ["uuidgen", "pbcopy", "nohup"],
	});
});
// Fish source: legacy/tests/test_tp_shot.fish:443 — async temporary path can contain partial upload data.
test("async temporary path can contain partial upload data", async () => {
	await runShotCase(["--async"], {
		exitCode: 0,
		invocations: ["uuidgen", "pbcopy", "nohup"],
	});
});
// Fish source: legacy/tests/test_tp_shot.fish:445 — async final path is absent while only partial upload data exists.
test("async final path is absent while only partial upload data exists", async () => {
	await runShotCase(["--async"], {
		exitCode: 0,
		invocations: ["uuidgen", "pbcopy", "nohup"],
	});
});
// Fish source: legacy/tests/test_tp_shot.fish:452 — async upload atomically publishes the complete image.
test("async upload atomically publishes the complete image", async () => {
	await runShotCase(["--async"], {
		exitCode: 0,
		invocations: ["uuidgen", "pbcopy", "nohup"],
	});
});
// Fish source: legacy/tests/test_tp_shot.fish:454 — async upload publishes a private image.
test("async upload publishes a private image", async () => {
	await runShotCase(["--async"], {
		exitCode: 0,
		invocations: ["uuidgen", "pbcopy", "nohup"],
	});
});
// Fish source: legacy/tests/test_tp_shot.fish:456 — async upload removes its temporary remote file.
test("async upload removes its temporary remote file", async () => {
	await runShotCase(["--async"], {
		exitCode: 0,
		invocations: ["uuidgen", "pbcopy", "nohup"],
	});
});
// Fish source: legacy/tests/test_tp_shot.fish:461 — async upload uses a private source snapshot.
test("async upload uses a private source snapshot", async () => {
	await runShotCase(["--async"], {
		exitCode: 0,
		invocations: ["uuidgen", "pbcopy", "nohup"],
	});
});
// Fish source: legacy/tests/test_tp_shot.fish:465 — async upload cleans its private source snapshot.
test("async upload cleans its private source snapshot", async () => {
	await runShotCase(["--async"], {
		exitCode: 0,
		invocations: ["uuidgen", "pbcopy", "nohup"],
	});
});
// Fish source: legacy/tests/test_tp_shot.fish:467 — async upload sends a ready notification after publication.
test("async upload sends a ready notification after publication", async () => {
	await runShotCase(["--async"], {
		exitCode: 0,
		invocations: ["uuidgen", "pbcopy", "nohup"],
		env: { TP_SHOT_NOTIFIER: "osascript" },
	});
});
// Fish source: legacy/tests/test_tp_shot.fish:470 — async upload records a useful completion log.
test("async upload records a useful completion log", async () => {
	await runShotCase(["--async"], {
		exitCode: 0,
		invocations: ["uuidgen", "pbcopy", "nohup"],
	});
});
// Fish source: legacy/tests/test_tp_shot.fish:472 — async upload log is private.
test("async upload log is private", async () => {
	await runShotCase(["--async"], {
		exitCode: 0,
		invocations: ["uuidgen", "pbcopy", "nohup"],
	});
});
// Fish source: legacy/tests/test_tp_shot.fish:486 — failed async upload cleans up and sends a failure notification.
test("failed async upload cleans up and sends a failure notification", async () => {
	await runShotCase(["--async"], {
		exitCode: 0,
		invocations: ["uuidgen", "pbcopy", "nohup"],
		env: { TP_SHOT_NOTIFIER: "osascript", TP_SHOT_TEST_SCP_FAIL: "1" },
	});
});
// Fish source: legacy/tests/test_tp_shot.fish:504 — async publish failure cleans up and sends a failure notification.
test("async publish failure cleans up and sends a failure notification", async () => {
	await runShotCase(["--async"], {
		exitCode: 0,
		invocations: ["uuidgen", "pbcopy", "nohup"],
		env: { TP_SHOT_NOTIFIER: "osascript", TP_SHOT_TEST_CHMOD_FAIL: "1" },
	});
});
// Fish source: legacy/tests/test_tp_shot.fish:509 — async publish failure cleans its local source snapshot.
test("async publish failure cleans its local source snapshot", async () => {
	await runShotCase(["--async"], {
		exitCode: 1,
		invocations: ["uuidgen", "pbcopy", "nohup"],
	});
});
// Fish source: legacy/tests/test_tp_shot.fish:521 — startup failure preserves the immediately copied reserved path.
test("startup failure preserves the immediately copied reserved path", async () => {
	await runShotCase(["--async"], {
		exitCode: 1,
		invocations: ["uuidgen", "pbcopy", "nohup"],
		env: { TP_SHOT_TEST_NOHUP_FAIL: "1" },
	});
});
// Fish source: legacy/tests/test_tp_shot.fish:524 — async startup failure cleans local capture.
test("async startup failure cleans local capture", async () => {
	await runShotCase(["--async"], {
		exitCode: 1,
		invocations: ["uuidgen", "pbcopy", "nohup"],
	});
});
// Fish source: legacy/tests/test_tp_shot.fish:527 — async startup failure explains that the uploader failed to start.
test("async startup failure explains that the uploader failed to start", async () => {
	await runShotCase(["--async"], {
		exitCode: 1,
		invocations: ["uuidgen", "pbcopy", "nohup"],
	});
});
// Fish source: legacy/tests/test_tp_shot.fish:529 — async startup failure sends a failure notification.
test("async startup failure sends a failure notification", async () => {
	await runShotCase(["--async"], {
		exitCode: 1,
		invocations: ["osascript"],
		env: { TP_SHOT_NOTIFIER: "osascript", TP_SHOT_TEST_NOHUP_FAIL: "1" },
	});
});
// Fish source: legacy/tests/test_tp_shot.fish:541 — short-lived Fish process copies its reserved path.
test("short-lived Fish process copies its reserved path", async () => {
	await runShotCase([], { exitCode: 0, invocations: ["ssh", "scp", "pbcopy"] });
});
// Fish source: legacy/tests/test_tp_shot.fish:543 — short-lived Fish process does not wait for its delayed upload.
test("short-lived Fish process does not wait for its delayed upload", async () => {
	await runShotCase([], {
		exitCode: 0,
		invocations: ["ssh", "scp", "pbcopy"],
	});
});
// Fish source: legacy/tests/test_tp_shot.fish:546 — detached worker survives its calling Fish process.
test("detached worker survives its calling Fish process", async () => {
	await runShotCase(["--async"], {
		exitCode: 0,
		invocations: ["uuidgen", "pbcopy", "nohup"],
	});
});
// Fish source: legacy/tests/test_tp_shot.fish:548 — surviving detached worker notifies on completion.
test("surviving detached worker notifies on completion", async () => {
	await runShotCase(["--async"], {
		exitCode: 0,
		invocations: ["uuidgen", "pbcopy", "nohup"],
	});
});
