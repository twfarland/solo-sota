import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, extractImports, formatViolation, lintSource } from "./lint-architecture.mjs";

const rulesOf = (violations) => violations.map((v) => v.rule);

test("classify recognises tiers and roles", () => {
  assert.deepEqual(classify("packages/model/Money.ts"), { tier: "packages", role: "unknown" });
  assert.deepEqual(classify("services/billing/checks/CheckRules.ts"), { tier: "services", role: "domain" });
  assert.deepEqual(classify("services/billing/checks/http/CheckRoutes.ts"), { tier: "services", role: "adapter" });
  assert.deepEqual(classify("services/billing/checks/ChecksVertical.ts"), { tier: "services", role: "composition" });
  assert.deepEqual(classify("services/billing/checks/CheckRulesTest.ts"), { tier: "services", role: "test" });
  assert.deepEqual(classify("src/rules/guardrail-rules.ts"), { tier: undefined, role: "domain" });
  assert.deepEqual(classify("extensions/solo-sota-harness.ts"), { tier: undefined, role: "adapter" });
});

test("extractImports finds static, type, re-export, dynamic and require specifiers with lines", () => {
  const source = [
    `import { a } from "./a.ts";`,
    `import type { B } from '../b';`,
    `export { c } from "./c";`,
    `const d = await import("./d");`,
    `const e = require("e");`,
    `import "./side-effect";`,
  ].join("\n");
  assert.deepEqual(extractImports(source).map((i) => [i.specifier, i.line]), [
    ["./a.ts", 1], ["../b", 2], ["./c", 3], ["./d", 4], ["e", 5], ["./side-effect", 6],
  ]);
});

test("upstream package importing a downstream service emits remediation", () => {
  const [v] = lintSource("packages/model/Money.ts", `import { x } from "../../services/billing/checks/CheckService";`);
  assert.equal(v?.rule, "monorepo-direction");
  assert.match(formatViolation(v), /REMEDIATION: Move the shared code into packages\//);
});

test("domain importing an adapter (downstream layer) emits remediation", () => {
  const [v] = lintSource("services/billing/checks/CheckService.ts", `import { PostgresCheckStore } from "./postgres/PostgresCheckStore";`);
  assert.equal(v?.rule, "hexagonal-direction");
  assert.match(v?.remediation ?? "", /Declare an outbound port in <Context>Ports/);
});

test("domain purity rejects I/O modules and vendor SDKs but allows std lib and packages/model", () => {
  const source = [`import * as fs from "node:fs";`, `import express from "express";`, `import * as path from "node:path";`, `import { Money } from "@acme/model";`].join("\n");
  const violations = lintSource("services/billing/checks/CheckRules.ts", source);
  assert.deepEqual(rulesOf(violations), ["domain-purity", "domain-purity"]);
  assert.match(violations[0]?.remediation ?? "", /Keep \*Rules pure/);
  assert.match(violations[1]?.remediation ?? "", /Parse, Don't Validate/);
});

test("domain code reading the clock or randomness is flagged", () => {
  const violations = lintSource("services/billing/checks/CheckRules.ts", "const now = Date.now();\nconst id = Math.random();");
  assert.deepEqual(rulesOf(violations), ["deterministic-domain", "deterministic-domain"]);
  assert.match(violations[0]?.remediation ?? "", /Inject a Clock.*TestClock/);
});

test("adapters, composition roots and tests may import inward and use I/O", () => {
  assert.deepEqual(lintSource("services/billing/checks/http/CheckRoutes.ts", `import express from "express";\nimport { CheckService } from "../CheckService";`), []);
  assert.deepEqual(lintSource("services/billing/checks/ChecksVertical.ts", `import { PostgresCheckStore } from "./postgres/PostgresCheckStore";`), []);
  assert.deepEqual(lintSource("services/billing/checks/CheckRules.test.ts", `import * as fs from "node:fs";`), []);
  assert.deepEqual(lintSource("extensions/x.ts", `import * as fs from "node:fs";\nimport { r } from "../src/rules/guardrail-rules.ts";`), []);
});
