function stripAnsi(text: string): string {
	let result = "";
	for (let index = 0; index < text.length; index += 1) {
		if (text.charCodeAt(index) !== 27) {
			result += text[index];
			continue;
		}
		const kind = text[index + 1];
		if (kind === "[") {
			index += 2;
			while (
				index < text.length &&
				(text.charCodeAt(index) < 0x40 || text.charCodeAt(index) > 0x7e)
			)
				index += 1;
		} else if (kind === "]") {
			index += 2;
			while (index < text.length && text.charCodeAt(index) !== 7) {
				if (text.charCodeAt(index) === 27 && text[index + 1] === "\\") {
					index += 1;
					break;
				}
				index += 1;
			}
		} else if (kind === "(") {
			index += 2;
		}
	}
	return result;
}

export function listingBreakpointWidths(
	output: string,
	lineMarker: string,
): { state: number; context: number; model: number } {
	const line = output
		.split("\n")
		.find((value) => stripAnsi(value).includes(lineMarker));
	if (line === undefined)
		throw new Error(`listing line not found for ${lineMarker}`);
	const plain = stripAnsi(line);
	const starts = {
		state: plain.indexOf(" · ⏸ blocked:bash"),
		context: plain.indexOf(" · 61%"),
		model: plain.indexOf(" · model"),
	};
	if (Object.values(starts).some((start) => start < 1))
		throw new Error(`listing fields not found in ${plain}`);
	if (!(starts.state < starts.context && starts.context < starts.model))
		throw new Error(`listing fields are out of order in ${plain}`);

	// buildLine joins fields with one space. At this width the named field is
	// exactly the first field that no longer fits, while earlier fields remain.
	const visibleStart = (start: number): number =>
		Array.from(plain.slice(0, start)).length;
	return {
		state: visibleStart(starts.state),
		context: visibleStart(starts.context),
		model: visibleStart(starts.model),
	};
}
