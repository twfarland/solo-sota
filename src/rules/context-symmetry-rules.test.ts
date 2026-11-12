import { test } from "node:test";
import assert from "node:assert/strict";
import { checkContextSymmetry } from "./context-symmetry-rules.ts";

const ports = "services/billing/checks/CheckPorts.ts";
const adapter = "services/billing/checks/postgres/PostgresCheckStore.ts";

test("outbound ports plus adapter require a contract with concrete remediation", () => {
  const findings = checkContextSymmetry([ports, adapter]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.path, ports);
  assert.match(findings[0]?.message ?? "", /services\/billing\/checks\/CheckContract\.test\.ts/);
  assert.match(findings[0]?.message ?? "", /InMemory.*real adapter/);
});

test("contract suites may be siblings or in the same context's test or adapter subtree", () => {
  for (const contract of ["CheckStoreContract.test.ts", "tests/CheckStoreContract.spec.ts", "postgres/CheckStoreContract.ts"]) {
    assert.deepEqual(checkContextSymmetry([ports, adapter, `services/billing/checks/${contract}`]), []);
  }
});

test("another context's contracts cannot hide a missing contract", () => {
  assert.equal(checkContextSymmetry([ports, adapter, "services/billing/payments/PaymentContract.test.ts"]).length, 1);
  assert.equal(checkContextSymmetry([ports, adapter, "services/billing/checks/nested/OtherContract.test.ts"]).length, 1);
});

test("ports alone, inbound HTTP, and adapter tests without production adapters do not trigger", () => {
  for (const files of [[ports], [adapter], [ports, "services/billing/checks/http/CheckRoutes.ts"],
    [ports, "services/billing/checks/postgres/PostgresCheckStore.test.ts"]]) {
    assert.deepEqual(checkContextSymmetry(files), []);
  }
});

test("path normalization and multiple contexts produce stable, deduplicated findings", () => {
  const other = ["orders/OrderPorts.ts", "orders/adapters/OrderStore.ts"];
  const files = [ports.replaceAll("/", "\\"), `./${adapter}`, ports, ...other];
  assert.deepEqual(checkContextSymmetry(files), checkContextSymmetry([...files].reverse()));
  assert.deepEqual(checkContextSymmetry(files).map(finding => finding.path), ["orders/OrderPorts.ts", ports]);
});

test("context symmetry supports TypeScript variants only", () => {
  for (const extension of ["ts", "mts", "cts", "tsx"]) {
    const files = [`checks/CheckPorts.${extension}`, `checks/outbound/CheckStore.${extension}`];
    const expected = `CheckContract.test.${extension}`;
    assert.match(checkContextSymmetry(files)[0]?.message ?? "", new RegExp(expected.replaceAll(".", "\\.")));
    assert.deepEqual(checkContextSymmetry([...files, `checks/${expected}`]), []);
  }
  for (const extension of ["kt", "rs"]) {
    assert.deepEqual(checkContextSymmetry([`checks/CheckPorts.${extension}`, `checks/outbound/Store.${extension}`]), []);
  }
});
