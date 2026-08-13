import { expect, test } from "bun:test";
import { withRawMode } from "../../src/lib/raw-mode";

type FakeInput = NodeJS.ReadStream & {
	calls: boolean[];
};

function fakeInput(): FakeInput {
	const calls: boolean[] = [];
	const input = {
		isTTY: true,
		calls,
		setRawMode(mode: boolean) {
			calls.push(mode);
			return this;
		},
		resume() {},
		pause() {},
	} as unknown as FakeInput;
	return input;
}

test("withRawMode restores the terminal once after success", async () => {
	const input = fakeInput();
	await expect(withRawMode(() => "done", input)).resolves.toBe("done");
	expect(input.calls).toEqual([true, false]);
});

test("withRawMode restores the terminal once after a callback failure", async () => {
	const input = fakeInput();
	await expect(
		withRawMode(() => {
			throw new Error("callback failed");
		}, input),
	).rejects.toThrow("callback failed");
	expect(input.calls).toEqual([true, false]);
});
