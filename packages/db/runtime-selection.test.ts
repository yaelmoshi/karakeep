import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageDir = dirname(fileURLToPath(import.meta.url));

describe("database runtime selection", () => {
  it("keeps SQLite native imports out of neutral database entrypoints", () => {
    for (const fileName of ["drizzle.ts", "index.ts", "migrate.ts"]) {
      const source = readFileSync(join(packageDir, fileName), "utf8");

      expect(source, fileName).not.toMatch(/from "better-sqlite3"/);
      expect(source, fileName).not.toMatch(/from "drizzle-orm\/better-sqlite3/);
    }
  });
});
