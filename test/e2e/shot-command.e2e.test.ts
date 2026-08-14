import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runTp } from "./harness";

test("tp shot dir expands configured ~ and keeps TP_SHOT_DIR precedence", async () => {
	const root = mkdtempSync(
		join(process.env.TMPDIR ?? "/tmp", "tp-shot-command-"),
	);
	const configHome = join(root, "config");
	const home = join(root, "home");
	mkdirSync(join(configHome, "tp"), { recursive: true });
	mkdirSync(home, { recursive: true });
	writeFileSync(
		join(configHome, "tp", "config.toml"),
		'[shot]\nremote_dir = "~/.configured-screenshots"\n',
	);
	try {
		const configured = await runTp(["shot", "dir"], {
			env: {
				HOME: home,
				XDG_CONFIG_HOME: configHome,
				TP_SHOT_DIR: undefined,
			},
		});
		expect(configured.exitCode).toBe(0);
		expect(configured.stdout).toBe(
			`${join(home, ".configured-screenshots")}\n`,
		);

		const overridden = await runTp(["shot", "dir"], {
			env: {
				HOME: home,
				XDG_CONFIG_HOME: configHome,
				TP_SHOT_DIR: join(root, "environment-screenshots"),
			},
		});
		expect(overridden.exitCode).toBe(0);
		expect(overridden.stdout).toBe(
			`${join(root, "environment-screenshots")}\n`,
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
