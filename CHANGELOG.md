# Changelog

## 0.2.0

The standalone Bun/TypeScript release. This release preserves the v0.1
session and Pi workflows while replacing the Fish plugin as the primary
installation.

- **Foundation and CLI — #12, #13, #14, #15:** added the Bun package, tmux
  session core, custom command parser, shell completion protocol, unit tests,
  and isolated tmux e2e harness.
- **Core parity — #16, #17, #18, #19, #20, #21:** ported session creation,
  labels, screenshots, listings, Pi ids and restart/resume, SSH-origin
  metadata, cmux socket integration, and `tp-shot` SSH uploads.
- **Watch and diagnostics — #22, #23:** added `tp w`, `tp b`, status counts,
  tmux status segments, and `tp doctor` environment checks.
- **Screenshot transport — #24:** added `tp-shot --transport taildrive` with
  private temporary files, atomic publication, sync/async parity, and no
  silent fallback to SSH.
- **Maintenance and tmux — #25, #26, #27:** added clone self-update checks,
  generated tmux bindings, state markers in window flags, and the popup session
  picker.
- **Layouts and recovery — #28, #29:** added configured multi-window layouts
  and reboot recovery with saved session snapshots and Pi conversation resume.
- **Documentation — #30:** rewrote the README for the standalone binary,
  documented configuration, protocols, completions, transports, migration,
  and the frozen legacy directory, and added README command/example checks.
- **Installation:** documented Bun's absolute `file:` global install for clone
  checkouts, with a symlink fallback and PATH guidance.
