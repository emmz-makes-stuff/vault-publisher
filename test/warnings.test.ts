import { describe, expect, it, vi } from "vitest";
import { reportWarnings, WarningCollector } from "../src/warnings.js";

describe("WarningCollector", () => {
  it("returns every pushed warning with its note identity", () => {
    const collector = new WarningCollector();

    collector.push("Handbook/Index.md", 'link to "Missing Note" could not be resolved');
    collector.push("publish.config.yaml", 'no path in the vault matches "Ghost.md"');

    expect(collector.all()).toStrictEqual([
      { note: "Handbook/Index.md", message: 'link to "Missing Note" could not be resolved' },
      { note: "publish.config.yaml", message: 'no path in the vault matches "Ghost.md"' },
    ]);
  });

  it("starts empty", () => {
    expect(new WarningCollector().all()).toStrictEqual([]);
  });
});

describe("reportWarnings", () => {
  it("writes one [WARNING] line per collected warning to stderr, naming the note", () => {
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    reportWarnings([
      { note: "Handbook/Index.md", message: 'link to "Missing Note" could not be resolved' },
    ]);

    expect(write).toHaveBeenCalledExactlyOnceWith(
      '[WARNING] Handbook/Index.md: link to "Missing Note" could not be resolved\n',
    );
    write.mockRestore();
  });

  it("writes nothing when there are no warnings", () => {
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    reportWarnings([]);

    expect(write).not.toHaveBeenCalled();
    write.mockRestore();
  });

  it("never touches process.exitCode — warnings never fail a publish", () => {
    const before = process.exitCode;
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    reportWarnings([{ note: "a.md", message: "problem" }]);

    expect(process.exitCode).toBe(before);
    write.mockRestore();
  });
});
