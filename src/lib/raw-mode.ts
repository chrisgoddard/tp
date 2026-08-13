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

/** Run a callback with raw mode enabled and restore it on completion or SIGINT. */
export async function withRawMode<T>(
	callback: () => T | Promise<T>,
	input: RawModeInput = defaultInput(),
): Promise<T> {
	enterRawMode(input);
	const onSigint = (): never => {
		exitRawMode(input);
		process.exit(130);
	};
	process.once("SIGINT", onSigint);
	try {
		return await callback();
	} finally {
		process.off("SIGINT", onSigint);
		exitRawMode(input);
	}
}
