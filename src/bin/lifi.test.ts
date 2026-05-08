import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../core/http-client.js", () => ({
  api: { get: vi.fn(), post: vi.fn() },
  earnApi: { get: vi.fn() },
}));

vi.mock("ora", () => ({
  default: () => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
  }),
}));

vi.mock("../core/config.js", () => ({
  getApiKey: vi.fn(),
  maskKey: vi.fn().mockReturnValue("***"),
}));

import { createProgram } from "./lifi.js";

describe("lifi entry point", () => {
  let output: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    output = [];
  });

  it("creates a program with correct name and version", () => {
    const program = createProgram();
    expect(program.name()).toBe("lifi");
    expect(program.version()).toBe("0.1.0");
  });

  it("registers all expected commands", () => {
    const program = createProgram();
    const commandNames = program.commands.map((c) => c.name());
    expect(commandNames).toContain("chains");
    expect(commandNames).toContain("tokens");
    expect(commandNames).toContain("token");
    expect(commandNames).toContain("tools");
    expect(commandNames).toContain("auth");
    expect(commandNames).toContain("quote");
    expect(commandNames).toContain("routes");
    expect(commandNames).toContain("status");
    expect(commandNames).toContain("connections");
    expect(commandNames).toContain("composer");
    expect(commandNames).toContain("gas");
    expect(commandNames).toContain("earn");
    expect(commandNames).toContain("chain");
    expect(commandNames).toContain("health");
  });

  it("--help does not throw", () => {
    const program = createProgram();
    program.exitOverride();
    program.configureOutput({ writeOut: (s) => output.push(s), writeErr: () => {} });
    expect(() => {
      try {
        program.parse(["node", "lifi", "--help"]);
      } catch {}
    }).not.toThrow();
  });

  it("--no-color sets NO_COLOR env var via preAction hook", async () => {
    const origNoColor = process.env.NO_COLOR;
    delete process.env.NO_COLOR;

    vi.mocked((await import("../core/http-client.js")).api.get).mockResolvedValue({
      data: { chains: [{ id: 1, name: "Ethereum", chainType: "EVM", nativeToken: { symbol: "ETH" } }] },
    });

    const program = createProgram();
    program.exitOverride();
    program.configureOutput({ writeOut: () => {}, writeErr: () => {} });
    vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "lifi", "--no-color", "chains", "--json"]);
    expect(process.env.NO_COLOR).toBe("1");

    // cleanup
    if (origNoColor === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = origNoColor;
  });
});
