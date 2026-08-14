export const listingKeys = [
	"project",
	"number",
	"session",
	"label",
	"attached",
	"attachedFrom",
	"activityAt",
	"cwd",
	"pi",
] as const;

export const piKeys = [
	"sessionId",
	"pid",
	"state",
	"tool",
	"stateSince",
	"ctxPct",
	"model",
] as const;

export function assertListingSchema(
	value: unknown,
): asserts value is Record<string, unknown>[] {
	if (!Array.isArray(value)) throw new Error("listing JSON must be an array");
	for (const record of value) {
		if (!record || typeof record !== "object")
			throw new Error("listing record must be an object");
		const keys = Object.keys(record);
		if (keys.join("\0") !== listingKeys.join("\0"))
			throw new Error(`listing keys differ: ${keys.join(",")}`);
		const item = record as Record<string, unknown>;
		if (item.pi !== null) {
			if (!item.pi || typeof item.pi !== "object")
				throw new Error("pi must be null or an object");
			const piObject = item.pi as Record<string, unknown>;
			const piObjectKeys = Object.keys(piObject);
			if (piObjectKeys.join("\0") !== piKeys.join("\0"))
				throw new Error(`pi keys differ: ${piObjectKeys.join(",")}`);
		}
	}
}
