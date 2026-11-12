// Hand-written in-process Pi port for adapter tests; no mocking library.
import assert from "node:assert/strict";
import { after } from "node:test";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import soloSotaHarness from "./solo-sota-harness.ts";
import planQuintQaModes from "./plan-quint-qa-modes.ts";
import selfRatchet from "./self-ratchet.ts";

type Handler = (event: Record<string, unknown>, ctx: FakeContext) => Promise<unknown>;
export type ExecResult = { stdout: string; stderr: string; code: number; killed: boolean };
type Command = { description: string; handler: (args: string, ctx: FakeContext) => Promise<void> };
type Tool = {
  name: string;
  execute: (id: string, params: Record<string, unknown>, signal: AbortSignal | undefined, onUpdate: undefined, ctx: FakeContext) => Promise<{ details: unknown }>;
};

class FakeContext {
  readonly statuses = new Map<string, string | undefined>();
  readonly notifications: string[] = [];
  readonly hasUI = true;
  readonly mode = "tui";
  confirmAnswer = false;
  reloads = 0;
  readonly cwd: string;
  readonly sessionManager: { getBranch: () => readonly unknown[] };
  constructor(cwd: string, entries: readonly unknown[]) {
    this.cwd = cwd;
    this.sessionManager = { getBranch: () => entries };
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
  readonly entries: unknown[] = [];
  activeTools: string[] = [];
  thinkingLevel = "";
  nextExec: ExecResult = { stdout: "", stderr: "", code: 0, killed: false };
  execOperation: (() => Promise<ExecResult>) | undefined;
  readonly execCalls: string[][] = [];
  private started = false;
  private readonly bus = new EventEmitter();
  readonly events = {
    emit: (channel: string, data: unknown) => { this.bus.emit(channel, data); },
    on: (channel: string, handler: (data: unknown) => void) => {
      this.bus.on(channel, handler);
      return () => { this.bus.off(channel, handler); };
    },
  };

  on(event: string, handler: Handler) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    return () => undefined;
  }
  registerCommand(name: string, command: Command) { this.commands.set(name, command); }
  registerTool(tool: Tool) { this.tools.set(tool.name, tool); }
  setActiveTools(tools: string[]) { this.activeTools = tools; }
  setThinkingLevel(level: string) { this.thinkingLevel = level; }
  sendUserMessage(content: string) { this.sentMessages.push(content); }
  appendEntry(customType: string, data: unknown) { this.entries.push({ type: "custom", customType, data }); }
  async exec(command: string, args: string[]) {
    this.execCalls.push([command, ...args]);
    return this.execOperation ? this.execOperation() : this.nextExec;
  }

  /** Starts the session before dispatch; tool_result transforms compose like Pi's. */
  async emit(event: string, payload: Record<string, unknown>, ctx: FakeContext): Promise<unknown> {
    if (!this.started && event !== "session_start") await this.emit("session_start", {}, ctx);
    if (event === "session_start") this.started = true;
    let transformed: unknown;
    for (const handler of this.handlers.get(event) ?? []) {
      const result = await handler({ type: event, ...payload }, ctx);
      if (result === undefined) continue;
      if (event === "tool_result") {
        assert.ok(typeof result === "object" && result !== null);
        payload = { ...payload, ...result };
        transformed = result;
      } else if (!(event === "input" && (result as { action?: string }).action === "continue")) return result;
    }
    return transformed;
  }
  async run(command: string, args: string, ctx: FakeContext) {
    if (!this.started) await this.emit("session_start", {}, ctx);
    const registered = this.commands.get(command);
    assert.ok(registered, `command /${command} registered`);
    await registered.handler(args, ctx);
  }
}

const tempDirs: string[] = [];
after(() => tempDirs.forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));

export function setup() {
  const pi = new RecordingPi();
  const api = pi as unknown as ExtensionAPI; // Narrow test port, never production state.
  soloSotaHarness(api);
  planQuintQaModes(api);
  selfRatchet(api);
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-sota-"));
  tempDirs.push(cwd);
  return { pi, ctx: new FakeContext(cwd, pi.entries), cwd };
}

export const FEATURES = JSON.stringify([{ id: "BOOT-001", description: "seed", steps: ["s"], passes: false }], null, 2);
export const write = (p: string, content: string) => ({ toolName: "write", toolCallId: "t", input: { path: p, content } });
export const blocked = (result: unknown) => (result as { block?: boolean } | undefined)?.block === true;
export const gateResult = (isError: boolean, toolCallId = "g") => ({ toolName: "bash", toolCallId, input: { command: "bash ./init.sh" }, content: [], isError });
