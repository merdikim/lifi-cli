import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerComposerCommand } from "./composer.js";

vi.mock("../core/http-client.js", () => ({
  api: { get: vi.fn() },
  earnApi: { get: vi.fn() },
}));

vi.mock("ora", () => ({
  default: () => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
  }),
}));

vi.mock("@inquirer/prompts", () => ({
  input: vi.fn(),
  select: vi.fn(),
}));

import { input, select } from "@inquirer/prompts";
import { api, earnApi } from "../core/http-client.js";

const mockedApi = vi.mocked(api);
const mockedEarnApi = vi.mocked(earnApi);
const mockedInput = vi.mocked(input);
const mockedSelect = vi.mocked(select);

const COMPOSER_QUOTE_FIXTURE = {
  tool: "composer",
  toolDetails: { key: "composer", name: "Composer" },
  action: {
    fromAmount: "1000000",
    fromChainId: 8453,
    toChainId: 8453,
    fromToken: { symbol: "USDC", address: "0xfrom", decimals: 6 },
    toToken: { symbol: "sparkUSDC", address: "0xto", decimals: 18 },
  },
  estimate: {
    toAmount: "946832715862427",
    toAmountMin: "942098552283115",
    approvalAddress: "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE",
    executionDuration: 0,
    gasCosts: [{ amountUSD: "0.04" }],
  },
  transactionRequest: {
    to: "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE",
    data: "0xabc",
  },
  includedSteps: [{ type: "protocol", tool: "composer", toolDetails: { key: "composer", name: "Composer" } }],
};

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  program.option("--json", "Output raw JSON");
  program.configureOutput({ writeOut: () => {}, writeErr: () => {} });
  registerComposerCommand(program);
  return program;
}

describe("composer command", () => {
  let consoleOutput: string[];
  let consoleError: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env["LIFI_NO_INPUT"];
    consoleOutput = [];
    consoleError = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      consoleOutput.push(args.join(" "));
    });
    vi.spyOn(console, "error").mockImplementation((...args) => {
      consoleError.push(args.join(" "));
    });
  });

  it("fetches a Composer quote with standard LI.FI quote params", async () => {
    mockedApi.get.mockResolvedValue({ data: COMPOSER_QUOTE_FIXTURE });
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "composer",
      "quote",
      "--from",
      "8453",
      "--to",
      "8453",
      "--from-token",
      "0xfrom",
      "--to-token",
      "0xto",
      "--amount",
      "1000000",
      "--from-address",
      "0xabc",
      "--json",
    ]);

    expect(mockedApi.get).toHaveBeenCalledWith(
      "/quote",
      expect.objectContaining({
        params: expect.objectContaining({
          fromChain: "8453",
          toChain: "8453",
          fromToken: "0xfrom",
          toToken: "0xto",
          fromAmount: "1000000",
          fromAddress: "0xabc",
          toAddress: "0xabc",
          slippage: "0.005",
        }),
      }),
    );
    expect(mockedEarnApi.get).not.toHaveBeenCalled();
  });

  it("detects Composer in included steps for cross-chain routes", async () => {
    mockedApi.get.mockResolvedValue({
      data: {
        ...COMPOSER_QUOTE_FIXTURE,
        tool: "stargateV2",
        toolDetails: { key: "stargateV2", name: "Stargate V2" },
      },
    });
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "composer",
      "quote",
      "--from",
      "1",
      "--to",
      "8453",
      "--from-token",
      "ETH",
      "--to-token",
      "0xto",
      "--amount",
      "100000000000000000",
      "--from-address",
      "0xabc",
      "--json",
    ]);

    const parsed = JSON.parse(consoleOutput.join(""));
    expect(parsed.tool).toBe("stargateV2");
  });

  it("rejects non-Composer quotes by default", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit");
    }) as never);
    mockedApi.get.mockResolvedValue({
      data: {
        tool: "1inch",
        toolDetails: { key: "1inch", name: "1inch" },
        action: { fromChainId: 1, toChainId: 1 },
        estimate: { toAmount: "1" },
      },
    });
    const program = createProgram();

    await expect(
      program.parseAsync([
        "node",
        "test",
        "composer",
        "quote",
        "--from",
        "1",
        "--to",
        "1",
        "--from-token",
        "USDC",
        "--to-token",
        "USDC",
        "--amount",
        "1000000",
        "--from-address",
        "0xabc",
        "--json",
      ]),
    ).rejects.toThrow("process.exit");

    expect(consoleError.join("\n")).toContain("LI.FI did not return a Composer route");
    exit.mockRestore();
  });

  it("lists Composer-supported vaults from Earn", async () => {
    mockedEarnApi.get.mockResolvedValue({
      data: {
        data: [
          {
            chainId: 8453,
            protocol: { name: "Morpho", logoUri: "", url: "" },
            name: "Spark USDC",
            address: "0xvault",
            asset: { symbol: "USDC" },
            tags: [],
            isComposerSupported: true,
          },
        ],
      },
    });
    const program = createProgram();

    await program.parseAsync(["node", "test", "composer", "vaults", "--chain", "8453", "--asset", "USDC", "--json"]);

    expect(mockedEarnApi.get).toHaveBeenCalledWith(
      "/vaults",
      expect.objectContaining({
        params: expect.objectContaining({
          isComposerSupported: true,
          chainId: "8453",
          asset: "USDC",
        }),
      }),
    );
  });

  it("fetches vaults first and uses the selected vault in interactive mode", async () => {
    const vault = {
      chainId: 8453,
      protocol: { name: "Morpho", logoUri: "", url: "" },
      name: "Spark USDC",
      address: "0xvault",
      apy: 0.0425,
      asset: { symbol: "USDC" },
      tags: [],
      isComposerSupported: true,
    };
    mockedEarnApi.get.mockResolvedValue({ data: { data: [vault] } });
    mockedSelect.mockResolvedValue(vault);
    mockedInput
      .mockResolvedValueOnce("8453")
      .mockResolvedValueOnce("USDC")
      .mockResolvedValueOnce("1000000")
      .mockResolvedValueOnce("0xabc");
    mockedApi.get.mockResolvedValue({ data: COMPOSER_QUOTE_FIXTURE });
    const program = createProgram();

    await program.parseAsync(["node", "test", "composer", "quote", "--json"]);

    expect(mockedEarnApi.get).toHaveBeenCalledWith(
      "/vaults",
      expect.objectContaining({
        params: expect.objectContaining({
          isComposerSupported: true,
          limit: "20",
        }),
      }),
    );
    expect(mockedSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Select Composer vault:",
        choices: expect.arrayContaining([
          expect.objectContaining({
            name: "8453, Spark USDC, 0xvault, 4.25%",
          }),
        ]),
      }),
    );
    expect(mockedEarnApi.get.mock.invocationCallOrder[0]).toBeLessThan(mockedApi.get.mock.invocationCallOrder[0] ?? 0);
    expect(mockedInput).toHaveBeenCalledTimes(4);
    expect(mockedApi.get).toHaveBeenCalledWith(
      "/quote",
      expect.objectContaining({
        params: expect.objectContaining({
          fromChain: "8453",
          toChain: "8453",
          toToken: "0xvault",
        }),
      }),
    );
  });
});
