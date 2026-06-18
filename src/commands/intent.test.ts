import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createIntentSignerFromPrivateKey, fetchIntentQuotes, registerIntentCommand } from "./intent.js";

const axiosMock = vi.hoisted(() => {
  const client = {
    get: vi.fn(),
    post: vi.fn(),
    interceptors: {
      request: {
        use: vi.fn(),
      },
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

const ethersMock = vi.hoisted(() => {
  const testAddress = "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf";

  return {
    Wallet: vi.fn((privateKey, provider) => ({
      privateKey,
      provider,
      address: testAddress,
    })),
  };
});

vi.mock("axios", () => ({
  default: {
    create: axiosMock.create,
  },
}));

vi.mock("ethers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ethers")>();
  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      Wallet: ethersMock.Wallet,
    },
  };
});

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

import { input } from "@inquirer/prompts";
import { getTokens } from "./tokens.js";

const mockedGetTokens = vi.mocked(getTokens);
const mockedInput = vi.mocked(input);
const TEST_PRIVATE_KEY = "0000000000000000000000000000000000000000000000000000000000000001";
const TEST_ADDRESS = "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf";
const TEST_BASE_INTEROP_ADDRESS = "0x00010000022105147e5f4552091a69125d5dfcb7b8c2659029395bdf";
const TEST_ARBITRUM_INTEROP_ADDRESS = "0x0001000002a4b1147e5f4552091a69125d5dfcb7b8c2659029395bdf";

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
    vi.unstubAllEnvs();
    vi.stubEnv("PRIVATE_KEY", TEST_PRIVATE_KEY);
    mockedInput.mockResolvedValue("https://sepolia.base.org");
    consoleOutput = [];
    axiosMock.create.mockReturnValue(axiosMock.client);
    axiosMock.client.get.mockImplementation(async (url) => ({
      data:
        url === "/chains"
          ? {
              chains: [
                {
                  id: 8453,
                  key: "base",
                  name: "Base",
                  chainType: "EVM",
                  coin: "ETH",
                  mainnet: true,
                  nativeToken: {
                    address: "0x0000000000000000000000000000000000000000",
                    chainId: 8453,
                    symbol: "ETH",
                    decimals: 18,
                    name: "Ether",
                  },
                  metamask: { chainName: "Base", rpcUrls: ["https://sepolia.base.org"] },
                },
                {
                  id: 42161,
                  key: "arbitrum",
                  name: "Arbitrum",
                  chainType: "EVM",
                  coin: "ETH",
                  mainnet: true,
                  nativeToken: {
                    address: "0x0000000000000000000000000000000000000000",
                    chainId: 42161,
                    symbol: "ETH",
                    decimals: 18,
                    name: "Ether",
                  },
                  metamask: { chainName: "Arbitrum One", rpcUrls: ["https://arbitrum.example"] },
                },
              ],
            }
          : [
              {
                id: 8453,
                chainId: "8453",
                chainType: "eip155",
                name: "Base",
                rpcUrls: ["https://sepolia.base.org"],
                isActive: true,
              },
              {
                id: 42161,
                chainId: "42161",
                chainType: "eip155",
                name: "Arbitrum",
                rpcUrls: ["https://arbitrum.example"],
                isActive: true,
              },
            ],
    }));
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
      "base",
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
        user: TEST_BASE_INTEROP_ADDRESS,
        intent: expect.objectContaining({
          intentType: "oif-swap",
          swapType: "exact-input",
          inputs: [
            expect.objectContaining({
              amount: "1000000",
              user: TEST_BASE_INTEROP_ADDRESS,
            }),
          ],
          outputs: [
            expect.objectContaining({
              amount: null,
              receiver: TEST_ARBITRUM_INTEROP_ADDRESS,
            }),
          ],
        }),
        supportedTypes: ["oif-escrow-v0"],
      }),
    );
    expect(axiosMock.client.get).toHaveBeenCalledWith("/chains");
    expect(mockedInput).not.toHaveBeenCalled();
    expect(consoleOutput).toContain("You will pay 1 USDC on Base and receive 0.999 USDC on Arbitrum.");
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

  it("creates a signer and address from PRIVATE_KEY", () => {
    const { address, signer } = createIntentSignerFromPrivateKey();

    expect(address).toBe(TEST_ADDRESS);
    expect(signer.address).toBe(address);
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
