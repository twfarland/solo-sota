import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { setup, FEATURES, write, blocked, gateResult, type ExecResult } from "./recording-pi.fixture.ts";

const mark = { toolName: "edit", toolCallId: "approve", input: { path: "feature_list.json", edits: [{ oldText: '"passes": false', newText: '"passes": true' }] } };
const greenResult: ExecResult = { stdout: "ok", stderr: "", code: 0, killed: false };

test("later failing or successful tool gates revoke prior QA approval", async () => {
  for (const isError of [true, false]) {
    const { pi, ctx, cwd } = setup();
    fs.writeFileSync(path.join(cwd, "feature_list.json"), FEATURES);
    await pi.run("qa", "BOOT-001", ctx);
    assert.equal(await pi.emit("tool_call", mark, ctx), undefined);
    const result = gateResult(isError);
    await pi.emit("tool_call", result, ctx);
    await pi.emit("tool_result", result, ctx);
    assert.ok(blocked(await pi.emit("tool_call", mark, ctx)));
  }
});

test("QA evidence is revoked by a successful mutation, backlog change or session restart", async () => {
  for (const event of ["mutation", "backlog", "restart", "tree"]) {
    const { pi, ctx, cwd } = setup();
    fs.writeFileSync(path.join(cwd, "feature_list.json"), FEATURES);
    await pi.run("qa", "BOOT-001", ctx);
    if (event === "mutation") await pi.emit("tool_result", { ...write("checks/CheckRules.ts", "x"), isError: false, content: [] }, ctx);
    if (event === "backlog") fs.writeFileSync(path.join(cwd, "feature_list.json"), FEATURES.replace('"seed"', '"changed"'));
    if (event === "restart") await pi.emit("session_start", {}, ctx);
    if (event === "tree") await pi.emit("session_tree", {}, ctx);
    assert.ok(blocked(await pi.emit("tool_call", mark, ctx)), event);
    if (event === "backlog") {
      fs.writeFileSync(path.join(cwd, "feature_list.json"), FEATURES);
      assert.ok(blocked(await pi.emit("tool_call", mark, ctx)), "restoring old backlog text must not resurrect observed-stale proof");
    }
  }
});

test("slash commands and self-verification share strikes; duplicates do not count twice", async () => {
  const { pi, ctx } = setup();
  pi.nextExec = { ...greenResult, code: 1 };
  await pi.run("init-harness", "", ctx);
  assert.match(ctx.statuses.get("solo-sota") ?? "", /strikes 1\/2/);
  const tool = pi.tools.get("verify_and_reload_harness");
  assert.ok(tool);
  await tool.execute("verify", { summaryOfChange: "gate evidence" }, undefined, undefined, ctx);
  assert.match(ctx.statuses.get("solo-sota") ?? "", /HALTED/);
  assert.ok(blocked(await pi.emit("tool_call", write("checks/CheckRules.ts", "x"), ctx)));
  await pi.emit("session_start", {}, ctx);
  assert.match(ctx.statuses.get("solo-sota") ?? "", /HALTED/);
  await pi.emit("input", { source: "extension", text: "keep going" }, ctx);
  assert.ok(blocked(await pi.emit("tool_call", write("checks/CheckRules.ts", "x"), ctx)));
  await pi.emit("input", { source: "rpc", text: "try another approach" }, ctx);
  assert.equal(await pi.emit("tool_call", write("checks/CheckRules.ts", "x"), ctx), undefined);
  const result = gateResult(true, "once");
  await pi.emit("tool_call", result, ctx);
  await pi.emit("tool_result", result, ctx);
  await pi.emit("tool_result", result, ctx);
  assert.match(ctx.statuses.get("solo-sota") ?? "", /strikes 1\/2/);
});

test("killed QA or self-verification never approves or queues a reload", async () => {
  const { pi, ctx, cwd } = setup();
  fs.writeFileSync(path.join(cwd, "feature_list.json"), FEATURES);
  pi.nextExec = { ...greenResult, killed: true };
  await pi.run("qa", "BOOT-001", ctx);
  assert.ok(blocked(await pi.emit("tool_call", mark, ctx)));
  const tool = pi.tools.get("verify_and_reload_harness");
  assert.ok(tool);
  const result = await tool.execute("killed", { summaryOfChange: "cancelled" }, undefined, undefined, ctx);
  assert.deepEqual(result.details, { verified: false });
  assert.equal(pi.sentMessages.includes("/reload-harness"), false);
});

test("a mutation during an awaited QA gate prevents late approval", async () => {
  const { pi, ctx, cwd } = setup();
  fs.writeFileSync(path.join(cwd, "feature_list.json"), FEATURES);
  await pi.emit("session_start", {}, ctx);
  let complete: (result: ExecResult) => void = () => { throw new Error("gate not started"); };
  let started: () => void = () => {};
  const entered = new Promise<void>(resolve => { started = resolve; });
  pi.execOperation = () => { started(); return new Promise<ExecResult>(resolve => { complete = resolve; }); };
  const pending = pi.run("qa", "BOOT-001", ctx);
  await entered;
  await pi.emit("tool_result", { ...write("checks/CheckRules.ts", "x"), isError: false, content: [] }, ctx);
  complete(greenResult);
  await pending;
  assert.ok(blocked(await pi.emit("tool_call", mark, ctx)));
});

test("a gate completing after tree navigation cannot change restored branch strikes", async () => {
  for (const code of [0, 1]) {
    const { pi, ctx } = setup();
    pi.nextExec = { ...greenResult, code: 1 };
    await pi.run("init-harness", "", ctx);
    let complete: (result: ExecResult) => void = () => { throw new Error("gate not started"); };
    pi.execOperation = () => new Promise<ExecResult>(resolve => { complete = resolve; });
    const pending = pi.run("init-harness", "", ctx);
    await pi.emit("session_tree", {}, ctx);
    assert.match(ctx.statuses.get("solo-sota") ?? "", /strikes 1\/2/);
    complete({ ...greenResult, code });
    await pending;
    assert.match(ctx.statuses.get("solo-sota") ?? "", /strikes 1\/2/);
  }
});

test("pre-aborted and late-aborted self-verification count once without queuing reload", async () => {
  for (const late of [false, true]) {
    const { pi, ctx } = setup();
    await pi.emit("session_start", {}, ctx);
    const controller = new AbortController();
    if (!late) controller.abort();
    else pi.execOperation = async () => { controller.abort(); return greenResult; };
    const tool = pi.tools.get("verify_and_reload_harness");
    assert.ok(tool);
    const result = await tool.execute("aborted", { summaryOfChange: "x" }, controller.signal, undefined, ctx);
    assert.deepEqual(result.details, { verified: false });
    assert.equal(pi.execCalls.length, late ? 1 : 0);
    assert.match(ctx.statuses.get("solo-sota") ?? "", /strikes 1\/2/);
    assert.equal(pi.sentMessages.includes("/reload-harness"), false);
  }
});

test("thrown command executions count as failures and a subsequent successful gate resets one strike", async () => {
  const { pi, ctx } = setup();
  pi.execOperation = async () => { throw new Error("executor unavailable"); };
  await assert.rejects(pi.run("init-harness", "", ctx), /executor unavailable/);
  assert.match(ctx.statuses.get("solo-sota") ?? "", /strikes 1\/2/);
  pi.execOperation = undefined;
  await pi.run("init-harness", "", ctx);
  assert.match(ctx.statuses.get("solo-sota") ?? "", /strikes 0\/2/);
});

test("cancellation after verification still blocks the queued reload", async () => {
  const { pi, ctx } = setup();
  await pi.emit("session_start", {}, ctx);
  const controller = new AbortController();
  const tool = pi.tools.get("verify_and_reload_harness");
  assert.ok(tool);
  await tool.execute("verify", { summaryOfChange: "x" }, controller.signal, undefined, ctx);
  assert.ok(pi.sentMessages.includes("/reload-harness"));
  controller.abort();
  await pi.run("reload-harness", "", ctx);
  assert.equal(ctx.reloads, 0);
});

test("reload rechecks current evidence instead of trusting a queued command", async () => {
  const { pi, ctx } = setup();
  await pi.emit("session_start", {}, ctx);
  const tool = pi.tools.get("verify_and_reload_harness");
  assert.ok(tool);
  await tool.execute("verify", { summaryOfChange: "x" }, undefined, undefined, ctx);
  assert.ok(pi.sentMessages.includes("/reload-harness"));
  const result = gateResult(true, "later");
  await pi.emit("tool_call", result, ctx);
  await pi.emit("tool_result", result, ctx);
  await pi.run("reload-harness", "", ctx);
  assert.equal(ctx.reloads, 0);
});
