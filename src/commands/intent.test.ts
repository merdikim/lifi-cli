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
  const approvalTx = {
    wait: vi.fn(),
  };
  const openTx = {
    hash: "0xopen",
    wait: vi.fn(),
  };
  const erc20Contract = {
    allowance: vi.fn(),
    approve: vi.fn(),
  };
  const escrowContract = {
    open: vi.fn(),
  };

  return {
    approvalTx,
    openTx,
    erc20Contract,
    escrowContract,
    JsonRpcProvider: vi.fn((url) => ({ url })),
    Wallet: vi.fn((privateKey, provider) => ({
      privateKey,
      provider,
      address: testAddress,
    })),
    Contract: vi.fn((address) =>
      address === "0x000025c3226C00B2Cdc200005a1600509f4e00C0" ? escrowContract : erc20Contract,
    ),
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
      JsonRpcProvider: ethersMock.JsonRpcProvider,
      Wallet: ethersMock.Wallet,
      Contract: ethersMock.Contract,
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
    mockedInput.mockResolvedValue("https://base.example");
    consoleOutput = [];
    ethersMock.approvalTx.wait.mockReset();
    ethersMock.openTx.wait.mockReset();
    ethersMock.erc20Contract.allowance.mockReset();
    ethersMock.erc20Contract.approve.mockReset();
    ethersMock.escrowContract.open.mockReset();
    axiosMock.create.mockReturnValue(axiosMock.client);
    axiosMock.client.get.mockImplementation(async (url) => ({
      data:
        url === "/orders/status"
          ? {
              meta: {
                orderStatus: "Settled",
              },
            }
          : [
              {
                id: 8453,
                chainId: "8453",
                chainType: "eip155",
                name: "Base",
                rpcUrls: ["https://base.example"],
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
    ethersMock.erc20Contract.allowance.mockResolvedValue(0n);
    ethersMock.erc20Contract.approve.mockResolvedValue(ethersMock.approvalTx);
    ethersMock.openTx.wait.mockResolvedValue({
      logs: [
        {
          address: "0x000025c3226C00B2Cdc200005a1600509f4e00C0",
          topics: ["0xopen", "0xabc"],
        },
      ],
    });
    ethersMock.escrowContract.open.mockResolvedValue(ethersMock.openTx);
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
    expect(mockedInput).toHaveBeenCalledWith({ message: "--rpc-url (Base RPC URL):" });
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

  it("approves, opens, and tracks the selected escrow quote", async () => {
    axiosMock.client.post.mockResolvedValueOnce({
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

    expect(ethersMock.JsonRpcProvider).toHaveBeenCalledWith("https://base.example");
    expect(ethersMock.Wallet).toHaveBeenCalledWith(
      `0x${TEST_PRIVATE_KEY}`,
      expect.objectContaining({ url: "https://base.example" }),
    );
    expect(ethersMock.erc20Contract.approve).toHaveBeenCalledWith(
      "0x000025c3226C00B2Cdc200005a1600509f4e00C0",
      1000000n,
    );
    expect(ethersMock.approvalTx.wait).toHaveBeenCalled();
    expect(ethersMock.escrowContract.open).toHaveBeenCalledWith(expect.stringMatching(/^0x/));
    expect(ethersMock.openTx.wait).toHaveBeenCalled();
    expect(ethersMock.Contract).toHaveBeenCalledWith(
      "0x000025c3226C00B2Cdc200005a1600509f4e00C0",
      expect.arrayContaining(["function open(bytes order) external"]),
      expect.objectContaining({ address: TEST_ADDRESS }),
    );
    expect(axiosMock.client.get).toHaveBeenCalledWith("/orders/status", {
      params: { onChainOrderId: "0xabc" },
    });
    expect(consoleOutput).toContain("Order opened! Tx: 0xopen");
    expect(consoleOutput).toContain("Final status: Settled");
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
