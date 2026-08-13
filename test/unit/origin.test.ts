import { expect, test } from "bun:test";
import { sanitizeClientTty } from "../../src/lib/origin";

test("origin TTY sanitization follows the SSH metadata contract", () => {
	expect(sanitizeClientTty(" /dev/pts/7 ")).toBe("dev_pts_7");
	expect(sanitizeClientTty("/dev/ttys003")).toBe("dev_ttys003");
	expect(sanitizeClientTty("a---b...c")).toBe("a_b_c");
	expect(sanitizeClientTty("bad\u0001tty")).toBeNull();
	expect(sanitizeClientTty("x".repeat(256))).toBeNull();
	expect(sanitizeClientTty("!!!")).toBeNull();
});
