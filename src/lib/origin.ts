/**
 * Reserve the SSH source stamping seam for issue #19.
 */
export function stampSshSource(clientTty: string): Promise<void> | void {
	void clientTty;
}

/**
 * Reserve attached-device resolution for issue #19.
 */
export function resolveAttachedDevice(ip: string): Promise<string | null> {
	void ip;
	return Promise.resolve(null);
}
