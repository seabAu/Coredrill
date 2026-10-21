import { describe, expect, it } from "vitest";

import { JsonLineFramer } from "./helpers/json-line-framer.js";

describe("native proof JSON-line framing", () => {
  it("preserves every character and FIFO order at every possible two-chunk boundary", () => {
    const records = ['{"ok":true,"response":"café 🦉"}', "", '{"ok":false}\r'];
    const wire = `${records.join("\n")}\n`;
    for (let split = 0; split <= wire.length; split += 1) {
      const framer = new JsonLineFramer();
      const lines: string[] = [];
      framer.consume(wire.slice(0, split), (line) => lines.push(line));
      framer.consume(wire.slice(split), (line) => lines.push(line));
      expect(lines).toEqual(records);
    }
  });

  it("does not dispatch an unterminated record or turn empty chunks into records", () => {
    const framer = new JsonLineFramer();
    const lines: string[] = [];
    const collect = (line: string) => lines.push(line);
    framer.consume('{"ok":true}', collect);
    framer.consume("", collect);
    expect(lines).toEqual([]);
    framer.consume("\n\npartial", collect);
    expect(lines).toEqual(['{"ok":true}', ""]);
    framer.consume(" record\n", collect);
    expect(lines).toEqual(['{"ok":true}', "", "partial record"]);
  });

  it("reassembles a multi-megabyte numeric-array response across small pipe chunks exactly", () => {
    const record = JSON.stringify({
      ok: true,
      response: { bytes: Array.from({ length: 1_048_576 }, (_, index) => index % 256) },
    });
    const wire = `${record}\n{"ok":false}\nunfinished`;
    for (const size of [4096, 8192, 65536]) {
      const framer = new JsonLineFramer();
      const lines: string[] = [];
      for (let offset = 0; offset < wire.length; offset += size) {
        framer.consume(wire.slice(offset, offset + size), (line) => lines.push(line));
      }
      expect(lines).toEqual([record, '{"ok":false}']);
    }
  });
});
