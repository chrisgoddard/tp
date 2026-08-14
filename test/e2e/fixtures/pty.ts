export function ptyCommand(logPath: string, command: string): string[] {
	return process.platform === "darwin"
		? ["/usr/bin/script", "-q", logPath, "/bin/sh", "-c", command]
		: ["/usr/bin/script", "-qefc", command, logPath];
}
