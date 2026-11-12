// Real Pi SDK, real event bus, real shell and built-in edit tool. No model requests.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  createAgentSession, createEventBus, DefaultResourceLoader, ModelRuntime,
  SessionManager, SettingsManager,
} from "@earendil-works/pi-coding-agent";
import soloSotaHarness from "./solo-sota-harness.ts";
import planQuintQaModes from "./plan-quint-qa-modes.ts";
import selfRatchet from "./self-ratchet.ts";
import { GATE_QUERY } from "./gate-runtime.ts";
import { qaIsAuthorized, type GateState } from "../src/rules/gate-evidence-rules.ts";

for (const boundHost of [true, false]) test(`real Pi gate accounting and halt restoration (bound host: ${boundHost})`, { timeout: 30_000 }, async t => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "sota-pi-gates-"));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const agentDir = path.join(cwd, "agent");
  const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false } });
  const eventBus = createEventBus();
  let providerRequests = 0;
  const resourceLoader = new DefaultResourceLoader({
    cwd, agentDir, settingsManager, eventBus,
    noExtensions: true, noSkills: true, noThemes: true, noPromptTemplates: true, noContextFiles: true,
    extensionFactories: [soloSotaHarness, planQuintQaModes, selfRatchet, pi => {
      // Consume command-generated agent prompts at the real input boundary.
      pi.on("input", async event => event.source === "extension" ? { action: "handled" } : undefined);
      pi.on("before_provider_request", async () => { providerRequests++; throw new Error("Integration test forbids model requests"); });
    }],
  });
  const modelRuntime = await ModelRuntime.create({
    authPath: path.join(agentDir, "auth.json"), modelsPath: null,
    allowModelNetwork: false, refreshOnCreate: false,
  });
  await resourceLoader.reload();
  assert.deepEqual(resourceLoader.getExtensions().errors, []);
  const sessionManager = SessionManager.inMemory(cwd);
  // A persisted assistant fixture supplies the real nested-tool pipeline's caller.
  // No provider is invoked; timestamp and usage are deterministic fixture values.
  sessionManager.appendMessage({
    role: "assistant", content: [], api: "openai-responses", provider: "fixture", model: "fixture",
    stopReason: "stop", timestamp: 0,
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
  });
  const { session } = await createAgentSession({
    cwd, agentDir, modelRuntime, resourceLoader, settingsManager, sessionManager,
  });
  t.after(() => session.dispose());
  const runtimeErrors: string[] = [];
  await session.bindExtensions(boundHost ? { onError: error => { runtimeErrors.push(error.error); } } : {});

  const state = (): GateState => {
    let current: GateState | undefined;
    eventBus.emit(GATE_QUERY, (value: GateState) => { current = value; });
    assert.ok(current, "real event bus reaches the gate owner");
    return current;
  };
  const command = async (name: string, args = "") => {
    const runner = session.extensionRunner;
    const registered = runner.getCommand(name);
    assert.ok(registered);
    await registered.handler(args, runner.createCommandContext());
  };
  const edit = () => session.extensionRunner.createToolContext("approval", undefined).executeTool("edit", {
    path: "feature_list.json", edits: [{ oldText: '"passes":false', newText: '"passes":true' }],
  });
  const list = JSON.stringify([{ id: "A", description: "fixture", steps: [], passes: false }]);
  fs.writeFileSync(path.join(cwd, "feature_list.json"), list);
  fs.writeFileSync(path.join(cwd, "init.sh"), "#!/usr/bin/env bash\nexit 0\n");
  fs.writeFileSync(path.join(cwd, "check.sh"), "#!/usr/bin/env bash\nexit 7\n");

  await command("qa", "A");
  assert.equal(qaIsAuthorized(state(), "A", list), true);
  assert.equal(state().completed.length, 1, "direct QA exec reports one completion");
  const failure = await session.extensionRunner.createToolContext("gate", undefined).executeTool("bash", { command: "bash ./check.sh" });
  assert.equal(failure.isError, true);
  assert.deepEqual(state().shift, { kind: "building", strikes: 1 });
  assert.equal(state().completed.length, 2, "nested tool gate reports one completion");
  assert.equal(qaIsAuthorized(state(), "A", list), false);
  assert.equal((await edit()).isError, true);
  assert.equal(fs.readFileSync(path.join(cwd, "feature_list.json"), "utf8"), list);

  const verify = session.extensionRunner.getToolDefinition("verify_and_reload_harness");
  assert.ok(verify);
  const cancelled = new AbortController();
  cancelled.abort();
  const verification = await verify.execute("cancelled", { summaryOfChange: "cancelled check" }, cancelled.signal, undefined,
    session.extensionRunner.createToolContext("cancelled", cancelled.signal));
  assert.deepEqual(verification.details, { verified: false });
  assert.equal(state().completed.length, 3, "self-verification reports one completion");
  assert.equal(state().shift.kind, "haltedForHuman");
  await session.reload();
  if (!boundHost) {
    // SDK skips session_start after reload without UI/command/error bindings.
    // Withhold all verification until a real context can restore branch state.
    assert.throws(state, /real event bus reaches the gate owner/);
    await assert.rejects(command("init-harness"), /gate owner unavailable/);
    const denied = await edit();
    assert.equal(denied.isError, true);
    assert.match(JSON.stringify(denied), /2-STRIKE CAP/);
  }
  assert.equal(state().shift.kind, "haltedForHuman", "actual reload restores persisted strikes");
  assert.equal(qaIsAuthorized(state(), "A", list), false);

  await session.extensionRunner.emitInput("operator recovery", undefined, "rpc");
  assert.deepEqual(state().shift, { kind: "building", strikes: 0 });
  await command("qa", "A");
  assert.equal(qaIsAuthorized(state(), "A", list), true);
  assert.equal((await edit()).isError, false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(cwd, "feature_list.json"), "utf8"))[0].passes, true);
  assert.equal(qaIsAuthorized(state(), "A", list), false, "approval consumes its proof");
  await session.waitForIdle();
  assert.equal(providerRequests, 0);
  assert.deepEqual(runtimeErrors, []);
});
