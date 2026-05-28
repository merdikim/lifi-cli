import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchIntentQuotes, registerIntentCommand } from "./intent.js";

const axiosMock = vi.hoisted(() => {
  const client = {
    get: vi.fn(),
    post: vi.fn(),
    interceptors: {
      response: {
        use: vi.fn(),
      },
    },
  };
  return {
    client,
    create: vi.fn(() => client),
  };
});

vi.mock("axios", () => ({
  default: {
    create: axiosMock.create,
  },
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

vi.mock("./tokens.js", () => ({
  getTokens: vi.fn(),
}));

import { getTokens } from "./tokens.js";

const mockedGetTokens = vi.mocked(getTokens);

const USDC_BASE = {
  address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  chainId: 8453,
  symbol: "USDC",
  decimals: 6,
  name: "USD Coin",
};

const USDC_ARBITRUM = {
  address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  chainId: 42161,
  symbol: "USDC",
  decimals: 6,
  name: "USD Coin",
};

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  program.option("--json", "Output raw JSON");
  program.option("--no-input", "Disable interactive prompts");
  program.configureOutput({ writeOut: () => {}, writeErr: () => {} });
  registerIntentCommand(program);
  return program;
}

describe("intent command", () => {
  let consoleOutput: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    consoleOutput = [];
    axiosMock.create.mockReturnValue(axiosMock.client);
    axiosMock.client.get.mockResolvedValue({
      data: [
        {
          id: 8453,
          chainId: "8453",
          chainType: "eip155",
          name: "Base",
          rpcUrls: [],
          isActive: true,
        },
        {
          id: 42161,
          chainId: "42161",
          chainType: "eip155",
          name: "Arbitrum",
          rpcUrls: [],
          isActive: true,
        },
      ],
    });
    axiosMock.client.post.mockResolvedValue({
      data: {
        quotes: [
          {
            order: null,
            validUntil: 1_800_000_000,
            quoteId: "quote_test",
            preview: {
              inputs: [{ user: "user", asset: "input", amount: "1000000" }],
              outputs: [{ receiver: "receiver", asset: "output", amount: "999000" }],
            },
            metadata: { exclusiveFor: null },
            partialFill: false,
            failureHandling: "refund-automatic",
          },
        ],
      },
    });
    mockedGetTokens.mockImplementation(async (chainId) => (chainId === "8453" ? [USDC_BASE] : [USDC_ARBITRUM]));
    vi.spyOn(console, "log").mockImplementation((...args) => {
      consoleOutput.push(args.join(" "));
    });
  });

  it("requests intent quotes with an oif swap payload", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "intent",
      "--from-chain",
      "8453",
      "--to-chain",
      "42161",
      "--from-token",
      "USDC",
      "--to-token",
      "USDC",
      "--amount",
      "1",
      "--type",
      "exact-input",
      "--json",
    ]);

    expect(axiosMock.client.post).toHaveBeenCalledWith(
      "/quote/request",
      expect.objectContaining({
        intent: expect.objectContaining({
          intentType: "oif-swap",
          swapType: "exact-input",
          inputs: [
            expect.objectContaining({
              amount: "1000000",
              user: expect.stringMatching(/^0x/),
            }),
          ],
          outputs: [
            expect.objectContaining({
              amount: null,
              receiver: expect.stringMatching(/^0x/),
            }),
          ],
        }),
        supportedTypes: ["oif-escrow-v0"],
      }),
    );
  });

  it("returns an empty array when no intent quotes are found", async () => {
    axiosMock.client.post.mockResolvedValueOnce({ data: { quotes: [] } });

    await expect(
      fetchIntentQuotes({
        fromChain: "8453",
        toChain: "42161",
        fromToken: USDC_BASE,
        toToken: USDC_ARBITRUM,
        amount: "1000000",
        type: "exact-input",
      }),
    ).resolves.toEqual([]);
  });

  it("prints a useful message when no intent quotes are found", async () => {
    axiosMock.client.post.mockResolvedValueOnce({ data: { quotes: [] } });

    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "intent",
      "--from-chain",
      "8453",
      "--to-chain",
      "42161",
      "--from-token",
      "USDC",
      "--to-token",
      "USDC",
      "--amount",
      "1",
      "--type",
      "exact-input",
      "--json",
    ]);

    expect(consoleOutput).toContain("No intent quotes found for the selected tokens and amount.");
  });
});
