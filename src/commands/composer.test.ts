import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerComposerCommand } from "./composer.js";

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

vi.mock("@inquirer/prompts", () => ({
  input: vi.fn(),
  select: vi.fn(),
}));

vi.mock("../core/evm-execution.js", () => ({
  createWallet: vi.fn(() => ({
    address: "0xabc",
  })),
  ensureAllowance: vi.fn().mockResolvedValue({ approved: false }),
  sendTransactionRequest: vi.fn().mockResolvedValue({ hash: "0xtxhash", blockNumber: 123 }),
}));

import { input, select } from "@inquirer/prompts";
import { createWallet, ensureAllowance, sendTransactionRequest } from "../core/evm-execution.js";
import { api, earnApi } from "../core/http-client.js";

const mockedApi = vi.mocked(api);
const mockedEarnApi = vi.mocked(earnApi);
const mockedInput = vi.mocked(input);
const mockedSelect = vi.mocked(select);
const mockedCreateWallet = vi.mocked(createWallet);
const mockedEnsureAllowance = vi.mocked(ensureAllowance);
const mockedSendTransactionRequest = vi.mocked(sendTransactionRequest);

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

const COMPOSER_ROUTES_FIXTURE = {
  routes: [
    { steps: [{ tool: "stargate" }, { tool: "composer" }], toAmountUSD: "100.42", gasCostUSD: "0.24" },
    { steps: [{ tool: "across" }, { tool: "composer" }], toAmountUSD: "99.50", gasCostUSD: "0.18" },
  ],
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
    expect(mockedSendTransactionRequest).toHaveBeenCalledWith(
      expect.anything(),
      COMPOSER_QUOTE_FIXTURE.transactionRequest,
    );
    const parsed = JSON.parse(consoleOutput.join(""));
    expect(parsed.transactionHash).toBe("0xtxhash");
  });

  it("accepts Composer in included steps for cross-chain routes", async () => {
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
      "--json",
    ]);

    const parsed = JSON.parse(consoleOutput.join(""));
    expect(parsed.transactionHash).toBe("0xtxhash");
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
        "--json",
      ]),
    ).rejects.toThrow("process.exit");

    expect(consoleError.join("\n")).toContain("LI.FI did not return a Composer route");
    exit.mockRestore();
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
    mockedInput.mockResolvedValueOnce("8453").mockResolvedValueOnce("USDC").mockResolvedValueOnce("1000000");
    mockedApi.get.mockResolvedValue({ data: COMPOSER_QUOTE_FIXTURE });
    const program = createProgram();

    await program.parseAsync(["node", "test", "composer", "--json"]);

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
    expect(mockedInput).toHaveBeenCalledTimes(3);
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
    expect(mockedSendTransactionRequest).toHaveBeenCalledWith(
      expect.anything(),
      COMPOSER_QUOTE_FIXTURE.transactionRequest,
    );
  });

  it("uses routes instead of quote when --routes is passed", async () => {
    const vault = {
      chainId: 8453,
      protocol: { name: "Morpho", logoUri: "", url: "" },
      name: "Spark USDC",
      address: "0xvault",
      asset: { symbol: "USDC" },
      tags: [],
      isComposerSupported: true,
    };
    mockedEarnApi.get.mockResolvedValue({ data: { data: [vault] } });
    mockedSelect.mockResolvedValueOnce(vault).mockResolvedValueOnce(COMPOSER_ROUTES_FIXTURE.routes[0]);
    mockedInput.mockResolvedValueOnce("8453").mockResolvedValueOnce("USDC").mockResolvedValueOnce("1000000");
    mockedApi.post.mockResolvedValueOnce({ data: COMPOSER_ROUTES_FIXTURE }).mockResolvedValueOnce({
      data: {
        ...COMPOSER_ROUTES_FIXTURE.routes[0].steps[0],
        action: COMPOSER_QUOTE_FIXTURE.action,
        estimate: COMPOSER_QUOTE_FIXTURE.estimate,
        transactionRequest: COMPOSER_QUOTE_FIXTURE.transactionRequest,
      },
    });
    const program = createProgram();

    await program.parseAsync(["node", "test", "composer", "--routes", "--json"]);

    expect(mockedApi.post).toHaveBeenCalledWith(
      "/advanced/routes",
      expect.objectContaining({
        fromChainId: "8453",
        toChainId: "8453",
        fromTokenAddress: "USDC",
        toTokenAddress: "0xvault",
        fromAmount: "1000000",
        fromAddress: "0xabc",
      }),
    );
    expect(mockedApi.get).not.toHaveBeenCalledWith("/quote", expect.anything());
    const parsed = JSON.parse(consoleOutput.join(""));
    expect(parsed.transactionHash).toBe("0xtxhash");
  });

  it("allows selecting a returned route in interactive routes mode", async () => {
    const originalIsTTY = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });

    const vault = {
      chainId: 8453,
      protocol: { name: "Morpho", logoUri: "", url: "" },
      name: "Spark USDC",
      address: "0xvault",
      asset: { symbol: "USDC" },
      tags: [],
      isComposerSupported: true,
    };
    const selectedRoute = COMPOSER_ROUTES_FIXTURE.routes[1];
    mockedEarnApi.get.mockResolvedValue({ data: { data: [vault] } });
    mockedSelect.mockResolvedValueOnce(vault).mockResolvedValueOnce(selectedRoute);
    mockedInput.mockResolvedValueOnce("8453").mockResolvedValueOnce("USDC").mockResolvedValueOnce("1000000");
    mockedApi.post.mockResolvedValue({ data: COMPOSER_ROUTES_FIXTURE });
    const program = createProgram();

    try {
      await program.parseAsync(["node", "test", "composer", "--routes"]);
    } finally {
      if (originalIsTTY) Object.defineProperty(process.stdout, "isTTY", originalIsTTY);
      else Reflect.deleteProperty(process.stdout, "isTTY");
    }

    expect(mockedSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Select route:",
        choices: expect.arrayContaining([
          expect.objectContaining({
            name: "2. across -> composer | receive $99.50 | gas $0.18",
          }),
        ]),
      }),
    );
    expect(consoleOutput.join("\n")).toContain("Selected route");
    expect(consoleOutput.join("\n")).toContain("2. across -> composer | receive $99.50 | gas $0.18");
  });

  it("executes a Composer quote by default", async () => {
    const originalIsTTY = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    mockedApi.get.mockResolvedValue({ data: COMPOSER_QUOTE_FIXTURE });
    const program = createProgram();

    try {
      await program.parseAsync([
        "node",
        "test",
        "composer",
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
        "--wallet-path",
        "/tmp/wallet-key",
        "--rpc-url",
        "https://rpc.example",
      ]);
    } finally {
      if (originalIsTTY) Object.defineProperty(process.stdout, "isTTY", originalIsTTY);
      else Reflect.deleteProperty(process.stdout, "isTTY");
    }

    expect(mockedCreateWallet).toHaveBeenCalledWith(
      expect.objectContaining({ walletPath: "/tmp/wallet-key", rpcUrl: "https://rpc.example" }),
      "8453",
    );
    expect(mockedEnsureAllowance).toHaveBeenCalledWith(
      expect.anything(),
      COMPOSER_QUOTE_FIXTURE.action,
      COMPOSER_QUOTE_FIXTURE.estimate,
    );
    expect(mockedSendTransactionRequest).toHaveBeenCalledWith(
      expect.anything(),
      COMPOSER_QUOTE_FIXTURE.transactionRequest,
    );
    expect(consoleOutput.join("\n")).toContain("0xtxhash");
  });

  it("uses --from-wallet as quote sender and WalletConnect execution without private key lookup", async () => {
    mockedApi.get.mockResolvedValue({ data: COMPOSER_QUOTE_FIXTURE });
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "composer",
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
      "--from-wallet",
      "0xabc",
      "--wallet-connect-project-id",
      "wc-project",
      "--json",
    ]);

    expect(mockedApi.get).toHaveBeenCalledWith(
      "/quote",
      expect.objectContaining({
        params: expect.objectContaining({
          fromAddress: "0xabc",
          toAddress: "0xabc",
        }),
      }),
    );
    expect(mockedApi.get.mock.invocationCallOrder[0]).toBeLessThan(mockedCreateWallet.mock.invocationCallOrder[0] ?? 0);
    expect(mockedCreateWallet).toHaveBeenCalledWith(
      expect.objectContaining({
        walletConnect: true,
        walletConnectProjectId: "wc-project",
      }),
      "8453",
    );
    expect(mockedSendTransactionRequest).toHaveBeenCalledWith(
      expect.anything(),
      COMPOSER_QUOTE_FIXTURE.transactionRequest,
    );
  });

  it("fetches step transaction and executes the selected route by default in routes mode", async () => {
    const originalIsTTY = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    const vault = {
      chainId: 8453,
      protocol: { name: "Morpho", logoUri: "", url: "" },
      name: "Spark USDC",
      address: "0xvault",
      asset: { symbol: "USDC" },
      tags: [],
      isComposerSupported: true,
    };
    const selectedRoute = COMPOSER_ROUTES_FIXTURE.routes[0];
    const stepWithTransaction = {
      ...selectedRoute.steps[0],
      action: COMPOSER_QUOTE_FIXTURE.action,
      estimate: COMPOSER_QUOTE_FIXTURE.estimate,
      transactionRequest: COMPOSER_QUOTE_FIXTURE.transactionRequest,
    };
    mockedEarnApi.get.mockResolvedValue({ data: { data: [vault] } });
    mockedSelect.mockResolvedValueOnce(vault).mockResolvedValueOnce(selectedRoute);
    mockedInput.mockResolvedValueOnce("8453").mockResolvedValueOnce("USDC").mockResolvedValueOnce("1000000");
    mockedApi.post
      .mockResolvedValueOnce({ data: COMPOSER_ROUTES_FIXTURE })
      .mockResolvedValueOnce({ data: stepWithTransaction });
    const program = createProgram();

    try {
      await program.parseAsync(["node", "test", "composer", "--routes"]);
    } finally {
      if (originalIsTTY) Object.defineProperty(process.stdout, "isTTY", originalIsTTY);
      else Reflect.deleteProperty(process.stdout, "isTTY");
    }

    expect(mockedApi.post).toHaveBeenCalledWith("/advanced/stepTransaction", selectedRoute.steps[0]);
    expect(mockedSendTransactionRequest).toHaveBeenCalledWith(
      expect.anything(),
      COMPOSER_QUOTE_FIXTURE.transactionRequest,
    );
    expect(consoleOutput.join("\n")).toContain("0xtxhash");
  });
});
