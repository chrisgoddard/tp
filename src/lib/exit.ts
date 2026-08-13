export const EXIT_SUCCESS = 0;
export const EXIT_FAILURE = 1;
export const EXIT_USAGE = 2;

export type Exit = (code: number) => never;

const terminate: Exit = (code) => process.exit(code);

export function usageError(message: string, exit: Exit = terminate): never {
	console.error(message);
	return exit(EXIT_USAGE);
}

export function fail(message: string, exit: Exit = terminate): never {
	console.error(message);
	return exit(EXIT_FAILURE);
}
