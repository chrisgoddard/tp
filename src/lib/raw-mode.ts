type RawModeInput = NodeJS.ReadStream & {
	setRawMode?: (mode: boolean) => RawModeInput;
	isTTY?: boolean;
};

const defaultInput = (): RawModeInput => process.stdin as RawModeInput;

/** Put a terminal input stream into character-at-a-time mode. */
export function enterRawMode(input: RawModeInput = defaultInput()): void {
	if (!input.isTTY || typeof input.setRawMode !== "function")
		throw new Error("raw mode needs a terminal");
	input.setRawMode(true);
	input.resume();
}

/** Restore ordinary line-buffered terminal input. */
export function exitRawMode(input: RawModeInput = defaultInput()): void {
	if (typeof input.setRawMode === "function") input.setRawMode(false);
	input.pause();
}

/** Run a callback with raw mode enabled and restore it on completion or signal. */
export async function withRawMode<T>(
	callback: () => T | Promise<T>,
	input: RawModeInput = defaultInput(),
): Promise<T> {
	enterRawMode(input);
	let cleaned = false;
	const signals = ["SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT"] as const;
	const cleanup = (): void => {
		if (cleaned) return;
		cleaned = true;
		exitRawMode(input);
	};
	const handlers = new Map(
		signals.map((signal) => [
			signal,
			(): void => {
				cleanup();
				for (const candidate of signals) {
					const handler = handlers.get(candidate);
					if (handler) process.off(candidate, handler);
				}
				process.kill(process.pid, signal);
			},
		]),
	);
	for (const signal of signals) {
		const handler = handlers.get(signal);
		if (handler) process.once(signal, handler);
	}
	try {
		return await callback();
	} finally {
		for (const signal of signals) {
			const handler = handlers.get(signal);
			if (handler) process.off(signal, handler);
		}
		cleanup();
	}
}
