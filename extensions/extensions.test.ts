// Drives the real extension factories against RecordingPi, a hand-written in-memory fake of the
// subset of Pi's ExtensionAPI the harness uses. No mocking library.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import soloSotaHarness from "./solo-sota-harness.ts";
import planQuintQaModes from "./plan-quint-qa-modes.ts";
import selfRatchet from "./self-ratchet.ts";

type Handler = (event: Record<string, unknown>, ctx: FakeContext) => Promise<unknown>;
type ExecResult = { stdout: string; stderr: string; code: number; killed: boolean };
type Command = { description: string; handler: (args: string, ctx: FakeContext) => Promise<void> };
type Tool = {
  name: string;
  execute: (id: string, params: Record<string, unknown>, signal: undefined, onUpdate: undefined, ctx: FakeContext) => Promise<{ details: unknown }>;
};

class FakeContext {
  readonly statuses = new Map<string, string | undefined>();
  readonly notifications: string[] = [];
  readonly hasUI = true;
  readonly mode = "tui";
  confirmAnswer = false;
  reloads = 0;
  readonly cwd: string;
  constructor(cwd: string) {
    this.cwd = cwd;
  }
  readonly ui = {
    setStatus: (key: string, text: string | undefined) => void this.statuses.set(key, text),
    notify: (message: string) => void this.notifications.push(message),
    confirm: async () => this.confirmAnswer,
  };
  reload = async () => void this.reloads++;
}

class RecordingPi {
  readonly handlers = new Map<string, Handler[]>();
  readonly commands = new Map<string, Command>();
  readonly tools = new Map<string, Tool>();
  readonly sentMessages: string[] = [];
  activeTools: string[] = [];
  thinkingLevel = "";
  nextExec: ExecResult = { stdout: "", stderr: "", code: 0, killed: false };
  readonly execCalls: string[][] = [];

  on(event: string, handler: Handler) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    return () => undefined;
  }
  registerCommand(name: string, command: Command) {
    this.commands.set(name, command);
  }
  registerTool(tool: Tool) {
    this.tools.set(tool.name, tool);
  }
  setActiveTools(tools: string[]) {
    this.activeTools = tools;
  }
  setThinkingLevel(level: string) {
    this.thinkingLevel = level;
  }
  sendUserMessage(content: string) {
    this.sentMessages.push(content);
  }
  async exec(command: string, args: string[]) {
    this.execCalls.push([command, ...args]);
    return this.nextExec;
  }

  /** Emits like Pi: handlers run in order; the first defined result wins. */
  async emit(event: string, payload: Record<string, unknown>, ctx: FakeContext): Promise<unknown> {
    for (const handler of this.handlers.get(event) ?? []) {
      const result = await handler({ type: event, ...payload }, ctx);
      if (result !== undefined && !(event === "input" && (result as { action?: string }).action === "continue")) return result;
    }
    return undefined;
  }
  async run(command: string, args: string, ctx: FakeContext) {
    const registered = this.commands.get(command);
    assert.ok(registered, `command /${command} registered`);
    await registered.handler(args, ctx);
  }
}

const tempDirs: string[] = [];
after(() => tempDirs.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

function setup() {
  const pi = new RecordingPi();
  // RecordingPi implements only the surface the harness touches; the cast is confined to this test seam.
  const api = pi as unknown as ExtensionAPI;
  soloSotaHarness(api);
  planQuintQaModes(api);
  selfRatchet(api);
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-sota-"));
  tempDirs.push(cwd);
  return { pi, ctx: new FakeContext(cwd), cwd };
}

const FEATURES = JSON.stringify([{ id: "BOOT-001", description: "seed", steps: ["s"], passes: false }], null, 2);
const write = (p: string, content: string) => ({ toolName: "write", toolCallId: "t", input: { path: p, content } });
const blocked = (result: unknown) => (result as { block?: boolean } | undefined)?.block === true;
const gateResult = (isError: boolean) => ({ toolName: "bash", toolCallId: "g", input: { command: "bash ./init.sh" }, content: [], isError });

test("all extensions register the harness commands and tools", () => {
  const { pi } = setup();
  for (const name of ["init-harness", "plan", "shift", "qa", "quint-sync", "quint-check", "quint-prove", "ratchet", "reload-harness"]) {
    assert.ok(pi.commands.has(name), name);
  }
  assert.ok(pi.tools.has("verify_and_reload_harness"));
});

test("session_start shows the Solo-SOTA status", async () => {
  const { pi, ctx } = setup();
  await pi.emit("session_start", {}, ctx);
  assert.match(ctx.statuses.get("solo-sota") ?? "", /Solo-SOTA.*strikes 0\/2/);
});

test("guards block banned paths and mocking libraries but allow good files", async () => {
  const { pi, ctx } = setup();
  assert.ok(blocked(await pi.emit("tool_call", write("src/utils/strings.ts", "x"), ctx)));
  assert.ok(blocked(await pi.emit("tool_call", write("checks/CheckTest.ts", ["vi", ".mock('./s')"].join("")), ctx)));
  assert.equal(await pi.emit("tool_call", write("checks/CheckRules.ts", "export {}"), ctx), undefined);
});

test("two failing gates halt mutation until a human steers", async () => {
  const { pi, ctx } = setup();
  await pi.emit("tool_result", gateResult(true), ctx);
  await pi.emit("tool_result", gateResult(true), ctx);
  assert.match(ctx.statuses.get("solo-sota") ?? "", /HALTED/);
  const result = await pi.emit("tool_call", write("checks/CheckRules.ts", "x"), ctx);
  assert.ok(blocked(result));
  assert.match((result as { reason: string }).reason, /2-STRIKE CAP/);

  await pi.emit("input", { text: "try X instead", source: "extension" }, ctx);
  assert.ok(blocked(await pi.emit("tool_call", write("checks/CheckRules.ts", "x"), ctx)), "extension input is not human steering");
  await pi.emit("input", { text: "try X instead", source: "interactive" }, ctx);
  assert.equal(await pi.emit("tool_call", write("checks/CheckRules.ts", "x"), ctx), undefined);
});

test("LocalContextMiddleware appends a nested AGENTS.md once per subtree", async () => {
  const { pi, ctx, cwd } = setup();
  fs.mkdirSync(path.join(cwd, "billing", "checks"), { recursive: true });
  fs.writeFileSync(path.join(cwd, "billing", "AGENTS.md"), "Billing rules: amounts are Money.");
  const read = { toolName: "read", toolCallId: "r", input: { path: "billing/checks/CheckRules.ts" }, content: [{ type: "text", text: "src" }], isError: false };
  const first = (await pi.emit("tool_result", read, ctx)) as { content: { text: string }[] };
  assert.equal(first.content.length, 2);
  assert.match(first.content[1]?.text ?? "", /\[Local context: billing\/AGENTS.md\]\nBilling rules/);
  assert.equal(await pi.emit("tool_result", read, ctx), undefined);
});

test("plan mode restricts writes to the plan file and blocks mutating shell", async () => {
  const { pi, ctx } = setup();
  await pi.run("plan", "Add symmetry checker", ctx);
  assert.match(ctx.statuses.get("mode") ?? "", /PLAN/);
  assert.equal(pi.thinkingLevel, "high");
  assert.equal(await pi.emit("tool_call", write("plans/add-symmetry-checker.md", "# plan"), ctx), undefined);
  assert.ok(blocked(await pi.emit("tool_call", write("src/rules/x.ts", "x"), ctx)));
  assert.ok(blocked(await pi.emit("tool_call", { toolName: "bash", toolCallId: "b", input: { command: "rm -rf src" } }, ctx)));
});

test("feature passes can only be marked from a green /qa", async () => {
  const { pi, ctx, cwd } = setup();
  fs.writeFileSync(path.join(cwd, "feature_list.json"), FEATURES);
  const markPass = { toolName: "edit", toolCallId: "e", input: { path: "feature_list.json", edits: [{ oldText: '"passes": false', newText: '"passes": true' }] } };

  await pi.run("shift", "", ctx);
  assert.match(pi.sentMessages.at(-1) ?? "", /^\[SHIFT BOOT-001\]/);
  assert.ok(blocked(await pi.emit("tool_call", markPass, ctx)), "shift may not mark passes");

  pi.nextExec = { stdout: "", stderr: "boom", code: 1, killed: false };
  await pi.run("qa", "", ctx);
  assert.match(pi.sentMessages.at(-1) ?? "", /QA REJECTED/);
  assert.ok(blocked(await pi.emit("tool_call", markPass, ctx)), "red QA may not mark passes");

  pi.nextExec = { stdout: "ok", stderr: "", code: 0, killed: false };
  await pi.run("qa", "BOOT-001", ctx);
  assert.deepEqual(pi.execCalls.at(-1), ["bash", "./init.sh"]);
  assert.equal(await pi.emit("tool_call", markPass, ctx), undefined, "green QA may mark passes");
  assert.ok(blocked(await pi.emit("tool_call", write("src/a.ts", "x"), ctx)), "QA may not edit code");
});

test("architecture sensor edits require operator confirmation", async () => {
  const { pi, ctx } = setup();
  const edit = write("overlays/ts-node/lint-architecture.mjs", "// weaker");
  assert.ok(blocked(await pi.emit("tool_call", edit, ctx)));
  ctx.confirmAnswer = true;
  assert.equal(await pi.emit("tool_call", edit, ctx), undefined);
});

test("verify_and_reload_harness reloads only after a green init.sh", async () => {
  const { pi, ctx } = setup();
  const tool = pi.tools.get("verify_and_reload_harness");
  assert.ok(tool);

  pi.nextExec = { stdout: "", stderr: "tests failed", code: 1, killed: false };
  const red = await tool.execute("1", { summaryOfChange: "x" }, undefined, undefined, ctx);
  assert.deepEqual(red.details, { verified: false });
  assert.equal(pi.sentMessages.length, 0);

  pi.nextExec = { stdout: "ok", stderr: "", code: 0, killed: false };
  const green = await tool.execute("2", { summaryOfChange: "TODO rule" }, undefined, undefined, ctx);
  assert.deepEqual(green.details, { verified: true, summary: "TODO rule" });
  assert.deepEqual(pi.sentMessages, ["/reload-harness"]);

  await pi.run("reload-harness", "", ctx);
  assert.equal(ctx.reloads, 1);
});

test("/ratchet requires a description and dispatches the ratchet protocol", async () => {
  const { pi, ctx } = setup();
  await pi.run("ratchet", "  ", ctx);
  assert.equal(pi.sentMessages.length, 0);
  await pi.run("ratchet", "Block TODOs without owner", ctx);
  assert.match(pi.sentMessages.at(-1) ?? "", /RATCHET[\s\S]*"Block TODOs without owner"[\s\S]*verify_and_reload_harness/);
});
