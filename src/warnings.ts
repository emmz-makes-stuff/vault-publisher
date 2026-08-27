/**
 * One degraded-or-noteworthy event surfaced during a publish. `note` is the
 * identity the `[WARNING]` line names — the config file for a
 * selection-level warning, the note's vault-relative path for anything
 * discovered while rendering a page.
 */
export interface Warning {
  readonly note: string;
  readonly message: string;
}

/**
 * Collects warnings during a publish for later reporting. A plain array
 * wrapped for its call sites' sake — `push` is the only mutation, so the
 * pipeline can pass this into any stage without granting it read access to
 * what earlier stages collected.
 */
export class WarningCollector {
  private readonly warnings: Warning[] = [];

  push(note: string, message: string): void {
    this.warnings.push({ note, message });
  }

  all(): readonly Warning[] {
    return this.warnings;
  }
}

/**
 * Emits one `[WARNING]` line per collected warning to stderr and nothing
 * else. Never touches `process.exitCode` — warnings never fail a publish,
 * so the reporter has no exit-code opinion to express.
 */
export function reportWarnings(warnings: readonly Warning[]): void {
  for (const warning of warnings) {
    process.stderr.write(`[WARNING] ${warning.note}: ${warning.message}\n`);
  }
}
