import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerEarnCommand } from "./earn.js";

vi.mock("../core/http-client.js", () => ({
  earnApi: {
    get: vi.fn(),
  },
}));

vi.mock("ora", () => ({
  default: () => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
  }),
}));

import { earnApi } from "../core/http-client.js";

const mockedEarnApi = vi.mocked(earnApi);

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  program.option("--json", "Output raw JSON");
  program.configureOutput({
    writeOut: () => {},
    writeErr: () => {},
  });
  registerEarnCommand(program);
  return program;
}

describe("earn command", () => {
  let consoleOutput: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(process.stdout, "isTTY", {
      configurable: true,
      value: true,
    });
    consoleOutput = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      consoleOutput.push(args.join(" "));
    });
  });

  it("lists vaults with filters", async () => {
    const response = {
      data: [
        {
          chainId: 8453,
          protocol: { id: "aave", name: "Aave" },
          name: "USDC Vault",
          underlyingTokens: [{ symbol: "USDC" }],
          analytics: { apy: { total: 0.0525 }, tvl: { usd: "123456" } },
        },
      ],
    };

    mockedEarnApi.get.mockResolvedValue({
      data: response,
    });

    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "earn",
      "vaults",
      "--chain",
      "8453",
      "--asset",
      "USDC",
      "--composer-supported",
      "--json",
    ]);

    expect(mockedEarnApi.get).toHaveBeenCalledWith("/vaults", {
      params: { chainId: "8453", asset: "USDC", isComposerSupported: true },
    });
    const parsed = JSON.parse(consoleOutput.join(""));
    expect(parsed.data[0].name).toBe("USDC Vault");
  });

  it("renders vaults as a table", async () => {
    const response = {
      data: [
        {
          chainId: 8453,
          protocol: { id: "aave", name: "Aave" },
          name: "USDC Vault",
          underlyingTokens: [{ symbol: "USDC" }],
          analytics: { apy: { total: 0.0525 }, tvl: { usd: "123456" } },
        },
      ],
      nextCursor: "next-page",
      total: 1,
    };

    mockedEarnApi.get.mockResolvedValue({ data: response });

    const program = createProgram();
    await program.parseAsync(["node", "test", "earn", "vaults"]);

    const output = consoleOutput.join("");
    expect(output).toContain("USDC Vault");
    expect(output).toContain("USDC");
    expect(output).toContain("5.25%");
    expect(output).toContain("$123,456");
    expect(output).toContain("Next page cursor: next-page");
  });

  it("passes numeric vault filters after parsing them", async () => {
    const response = {
      data: [],
    };

    mockedEarnApi.get.mockResolvedValue({
      data: response,
    });

    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "earn",
      "vaults",
      "--limit",
      "10",
      "--min-tvl",
      "1",
      "--cursor",
      "next-page",
      "--json",
    ]);

    expect(mockedEarnApi.get).toHaveBeenCalledWith("/vaults", {
      params: { minTvlUsd: 1, limit: 10, cursor: "next-page" },
    });
  });

  it("rejects a non-positive vault limit", async () => {
    const program = createProgram();

    await expect(program.parseAsync(["node", "test", "earn", "vaults", "--limit", "0"])).rejects.toMatchObject({
      code: "commander.invalidArgument",
    });
    expect(mockedEarnApi.get).not.toHaveBeenCalled();
  });

  it("gets a single vault", async () => {
    const vault = {
      chainId: 8453,
      address: "0xvault",
      protocol: { name: "Aave" },
      name: "USDC Vault",
      underlyingTokens: [{ symbol: "USDC" }],
    };

    mockedEarnApi.get.mockResolvedValue({
      data: vault,
    });

    const program = createProgram();
    await program.parseAsync(["node", "test", "earn", "vault", "8453", "0xvault", "--json"]);

    expect(mockedEarnApi.get).toHaveBeenCalledWith("/vaults/8453/0xvault");
    const parsed = JSON.parse(consoleOutput.join(""));
    expect(parsed.name).toBe("USDC Vault");
  });

  it("renders a single vault as a table", async () => {
    const vault = {
      chainId: 8453,
      address: "0xvault",
      protocol: { name: "Aave" },
      name: "USDC Vault",
      underlyingTokens: [{ symbol: "USDC" }],
      analytics: { apy: { total: 0.0525 }, tvl: { usd: "123456" } },
      isTransactional: true,
      isRedeemable: false,
    };

    mockedEarnApi.get.mockResolvedValue({ data: vault });

    const program = createProgram();
    await program.parseAsync(["node", "test", "earn", "vault", "8453", "0xvault"]);

    const output = consoleOutput.join("");
    expect(output).toContain("USDC Vault");
    expect(output).toContain("Aave");
    expect(output).toContain("5.25%");
    expect(output).toContain("$123,456");
    expect(output).toContain("Transactional");
    expect(output).toContain("Yes");
  });

  it("lists Earn chains", async () => {
    const chains = [{ chainId: 8453, name: "Base", networkCaip: "eip155:8453" }];

    mockedEarnApi.get.mockResolvedValue({
      data: chains,
    });

    const program = createProgram();
    await program.parseAsync(["node", "test", "earn", "chains", "--json"]);

    expect(mockedEarnApi.get).toHaveBeenCalledWith("/chains");
    const parsed = JSON.parse(consoleOutput.join(""));
    expect(parsed[0].name).toBe("Base");
  });

  it("renders Earn chains as a table", async () => {
    const chains = [{ chainId: 8453, name: "Base", networkCaip: "eip155:8453" }];

    mockedEarnApi.get.mockResolvedValue({ data: chains });

    const program = createProgram();
    await program.parseAsync(["node", "test", "earn", "chains"]);

    const output = consoleOutput.join("");
    expect(output).toContain("8453");
    expect(output).toContain("Base");
    expect(output).toContain("eip155:8453");
  });

  it("lists Earn protocols", async () => {
    const protocols = [{ id: "aave", name: "Aave" }];

    mockedEarnApi.get.mockResolvedValue({ data: protocols });

    const program = createProgram();
    await program.parseAsync(["node", "test", "earn", "protocols", "--json"]);

    expect(mockedEarnApi.get).toHaveBeenCalledWith("/protocols");
    const parsed = JSON.parse(consoleOutput.join(""));
    expect(parsed[0].id).toBe("aave");
  });

  it("renders Earn protocols as a table", async () => {
    const protocols = [{ id: "aave", name: "Aave", url: "https://aave.com" }];

    mockedEarnApi.get.mockResolvedValue({ data: protocols });

    const program = createProgram();
    await program.parseAsync(["node", "test", "earn", "protocols"]);

    const output = consoleOutput.join("");
    expect(output).toContain("Aave");
    expect(output).toContain("https://aave.com");
  });

  it("lists wallet positions", async () => {
    const response = {
      positions: [
        {
          chainId: 1,
          address: "0xa17581a9e3356d9a858b789d68b4d866e593ae94",
          protocolName: "aave-v3",
          asset: {
            address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
            name: "USD Coin",
            symbol: "USDC",
            decimals: 6,
          },
          balanceUsd: "1523.45",
          balanceNative: "1523450000",
        },
      ],
    };

    mockedEarnApi.get.mockResolvedValue({
      data: response,
    });

    const program = createProgram();
    await program.parseAsync(["node", "test", "earn", "positions", "0xabc", "--json"]);

    expect(mockedEarnApi.get).toHaveBeenCalledWith("/portfolio/0xabc/positions");
    const parsed = JSON.parse(consoleOutput.join(""));
    expect(parsed.positions[0].balanceNative).toBe("1523450000");
  });

  it("renders wallet positions as a table", async () => {
    const response = {
      positions: [
        {
          chainId: 1,
          address: "0xa17581a9e3356d9a858b789d68b4d866e593ae94",
          protocolName: "aave-v3",
          asset: {
            address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
            name: "USD Coin",
            symbol: "USDC",
            decimals: 6,
          },
          balanceUsd: "1523.45",
          balanceNative: "1523450000",
        },
      ],
    };

    mockedEarnApi.get.mockResolvedValue({ data: response });

    const program = createProgram();
    await program.parseAsync(["node", "test", "earn", "positions", "0xabc"]);

    const output = consoleOutput.join("");
    expect(output).toContain("aave-v3");
    expect(output).toContain("USDC");
    expect(output).toContain("1523450000");
    expect(output).toContain("$1,523.45");
  });
});
