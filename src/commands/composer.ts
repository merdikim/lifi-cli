import { select } from "@inquirer/prompts";
import { type Command, Option } from "commander";
import { COMPOSER_TOOL, ExitCode } from "../core/constants.js";
import { CliError, handleError } from "../core/errors.js";
import { createWallet, ensureAllowance, sendTransactionRequest } from "../core/evm-execution.js";
import { formatAmount, formatDuration, formatTable, isJsonMode, jsonOutput } from "../core/formatter.js";
import { earnApi } from "../core/http-client.js";
import { withSpinner } from "../core/interactive.js";
import { promptIfMissing } from "../core/prompt-if-missing.js";
import type {
  EarnVault,
  EarnVaultsResponse,
  ExecutionConfig,
  ExecutionWallet,
  QuoteParams,
  QuoteResponse,
  Route,
  RouteOrder,
  RoutesParams,
  SendTransactionResult,
  Step,
} from "../types/index.js";
import { fetchQuote } from "./quote.js";
import { fetchRoutes, fetchStepTransaction, routeRows } from "./routes.js";

function includesComposerStep(quote: QuoteResponse): boolean {
  if (quote.tool === COMPOSER_TOOL || quote.toolDetails?.key === COMPOSER_TOOL) return true;
  return (
    quote.includedSteps?.some((step: Step) => step.tool === COMPOSER_TOOL || step.toolDetails?.key === COMPOSER_TOOL) ??
    false
  );
}

function vaultApy(vault: EarnVault): string {
  const value = vault.apy ?? vault.analytics?.apy?.total;
  if (value === undefined || value === null || !Number.isFinite(Number(value))) return "N/A";
  const normalized = Math.abs(value) <= 1 ? value * 100 : value;
  return `${normalized.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
}

function vaultLabel(vault: EarnVault): string {
  return [String(vault.chainId), vault.name ?? vault.slug ?? "N/A", vault.address ?? "N/A", vaultApy(vault)].join(", ");
}

async function fetchComposerVaults(params: Record<string, string | boolean>): Promise<EarnVault[]> {
  const { data } = await withSpinner("Fetching Composer vaults...", () =>
    earnApi.get<EarnVaultsResponse>("/vaults", { params }),
  );
  return data.data;
}

async function selectComposerVault(options: { to?: string; vaultLimit?: string }) {
  const params: Record<string, string | boolean> = {
    isComposerSupported: true,
    isTransactional: true,
    limit: options.vaultLimit ?? "20",
  };
  if (options.to) params["chainId"] = options.to;

  const vaults = await fetchComposerVaults(params);
  if (vaults.length === 0) {
    throw new CliError("No Composer-supported vaults found", ExitCode.General, "Try a different destination chain");
  }

  return select<EarnVault>({
    message: "Select Composer vault:",
    choices: vaults.map((vault) => {
      const choice = {
        name: vaultLabel(vault),
        value: vault,
      };
      return vault.address ? { ...choice, description: vault.address } : choice;
    }),
  });
}

function quoteRows(quote: QuoteResponse, slippage: string): string[][] {
  const estimate = quote.estimate;
  const toToken = quote.action?.toToken;
  const fromToken = quote.action?.fromToken;
  const steps =
    quote.includedSteps
      ?.map((step) => step.toolDetails?.name ?? step.tool)
      .filter(Boolean)
      .join(" -> ") ||
    quote.toolDetails?.name ||
    quote.tool;

  return [
    ["Route", includesComposerStep(quote) ? "Composer" : (quote.toolDetails?.name ?? quote.tool ?? "N/A")],
    ["Steps", steps],
    [
      "You receive",
      `${formatAmount(estimate?.toAmount ?? "0", estimate?.toAmountDecimals ?? toToken?.decimals ?? 18)} ${toToken?.symbol ?? ""}`,
    ],
    [
      "Minimum",
      estimate?.toAmountMin
        ? `${formatAmount(estimate.toAmountMin, estimate.toAmountDecimals ?? toToken?.decimals ?? 18)} ${toToken?.symbol ?? ""}`
        : "N/A",
    ],
    ["From", `${quote.action?.fromAmount ?? "N/A"} ${fromToken?.symbol ?? ""}`],
    ["Approval", estimate?.approvalAddress ?? "N/A"],
    ["Est. time", estimate?.executionDuration ? formatDuration(estimate.executionDuration) : "N/A"],
    ["Gas cost", estimate?.gasCosts?.[0]?.amountUSD ? `~$${estimate.gasCosts[0].amountUSD}` : "N/A"],
    ["Slippage", `${Number(slippage) * 100}%`],
  ];
}

function routeLabel(route: Route, index: number): string {
  const steps = route.steps.map((step) => step.tool).join(" -> ");
  const receive = route.toAmountUSD ? `$${route.toAmountUSD}` : "N/A";
  const gas = route.gasCostUSD ? `$${route.gasCostUSD}` : "N/A";
  return `${index + 1}. ${steps} | receive ${receive} | gas ${gas}`;
}

async function selectRoute(routes: Route[]): Promise<Route> {
  if (routes.length === 0) {
    throw new CliError("No routes returned", ExitCode.General, "Try a different vault, token, amount, or route order.");
  }

  return select<Route>({
    message: "Select route:",
    choices: routes.map((route, index) => ({
      name: routeLabel(route, index),
      value: route,
    })),
  });
}

function firstRouteStep(route: Route): Step {
  const step = route.steps[0];
  if (!step) {
    throw new CliError("Selected route does not include an executable step", ExitCode.General);
  }
  return step;
}

function executionRows(result: SendTransactionResult, approvalHash?: string): string[][] {
  return [
    ["Approval tx", approvalHash ?? "N/A"],
    ["Transaction hash", result.hash],
    ["Block", result.blockNumber !== undefined ? String(result.blockNumber) : "Pending"],
  ];
}

export function registerComposerCommand(program: Command): void {
  const composer = program
    .command("composer")
    .description("Prepare LI.FI Composer deposit quotes for vault, staking, and lending tokens")
    .addHelpText(
      "after",
      `
Examples:
  $ lifi composer --to 8453
  $ lifi composer --from 8453 --to 8453 --from-token 0x8335... --to-token 0x7BfA... --amount 1000000
  $ lifi composer --from 1 --to 8453 --from-token ETH --to-token 0x7BfA... --amount 100000000000000000 --json`,
    );

  composer
    .description("Execute LI.FI Composer deposits")
    .option("--from <chain>", "Source chain name or ID (e.g. base, 8453)")
    .option("--to <chain>", "Destination chain name or ID. Same as --from for same-chain deposits")
    .option("--from-token <token>", "Token to deposit from — symbol or address")
    .option("--to-token <token>", "Composer target token address")
    .option("--amount <amount>", "Amount in from-token smallest unit (e.g. 1000000 for 1 USDC)")
    .option("--from-wallet <address>", "Sender wallet address. Enables WalletConnect signing")
    .option("--to-address <address>", "Recipient wallet address. Defaults to signer wallet address")
    .option("--vault-limit <count>", "Interactive mode: maximum vaults to show", "20")
    .option("--routes", "Fetch Composer route options instead of a single quote")
    .option("--wallet-connect", "Use WalletConnect QR signing instead of a private key")
    .option(
      "--wallet-connect-project-id <id>",
      "WalletConnect project ID. Defaults to WALLETCONNECT_PROJECT_ID or WC_PROJECT_ID",
    )
    .option("--wallet-path <path>", "Path to a file containing the private key. Defaults to PRIVATE_KEY env var")
    .option("--rpc-url <url>", "RPC URL used for transaction execution. Defaults to bundled public RPC by chain ID")
    .option("--slippage <slippage>", "Max slippage as decimal (e.g. 0.005 for 0.5%)", "0.005")
    .addOption(
      new Option("--order <order>", "Route preference").choices([
        "CHEAPEST",
        "FASTEST",
        "SAFEST",
        "RECOMMENDED",
      ] satisfies RouteOrder[]),
    )
    .action(async (options, command) => {
      const opts = command.optsWithGlobals();
      try {
        const selectedVault =
          options.toToken || process.env["LIFI_NO_INPUT"] === "1"
            ? undefined
            : await selectComposerVault({
                to: options.to,
                vaultLimit: options.vaultLimit,
              });
        const selectedVaultAddress = options.toToken || selectedVault?.address;
        if (!selectedVaultAddress) {
          throw new CliError(
            "No valid selected vault",
            ExitCode.General,
            "Run lifi earn vaults --json to inspect vaults payloads.",
          );
        }

        const fromChain = await promptIfMissing(options.from, "--from (source chain)");
        const toChain = await promptIfMissing(
          options.to ?? (selectedVault ? String(selectedVault.chainId) : undefined),
          "--to (destination chain)",
        );
        const fromToken = await promptIfMissing(options.fromToken, "--from-token");
        const fromAmount = await promptIfMissing(options.amount, "--amount");
        const useWalletConnect = Boolean(options.walletConnect || options.fromWallet);
        const executionConfig: ExecutionConfig = {
          walletPath: options.walletPath,
          rpcUrl: options.rpcUrl,
          walletConnect: useWalletConnect,
          walletConnectProjectId: '37d39d9a3b9eb46fd7c703c77c72b31b' //options.walletConnectProjectId,
        };
        let wallet: ExecutionWallet | undefined;
        const getWallet = async (): Promise<ExecutionWallet> => {
          wallet ??= await createWallet(executionConfig, fromChain);
          if (options.fromWallet && wallet.address.toLowerCase() !== options.fromWallet.toLowerCase()) {
            throw new CliError(
              "WalletConnect account does not match --from-wallet",
              ExitCode.InvalidArgs,
              `Connected wallet ${wallet.address}, but quote was requested for ${options.fromWallet}.`,
            );
          }
          return wallet;
        };
        const fromAddress = options.fromWallet || (await getWallet()).address;
        const toAddress = options.toAddress || fromAddress;

        if (options.routes) {
          const body: RoutesParams = {
            fromChainId: fromChain,
            toChainId: toChain,
            fromTokenAddress: fromToken,
            toTokenAddress: selectedVaultAddress,
            fromAmount,
            fromAddress,
          };
          if (options.order) body.options = { order: options.order as RouteOrder };

          const data = await fetchRoutes(body, "Fetching Composer routes...");

          const routes: Route[] = data.routes ?? [];
          if (!isJsonMode(opts)) {
            console.log(formatTable(["#", "Steps", "You Receive (USD)", "Gas Cost"], routeRows(routes)));
          }
          const selectedRoute = await selectRoute(routes);
          if (!isJsonMode(opts)) {
            console.log(
              formatTable(
                ["Field", "Value"],
                [["Selected route", routeLabel(selectedRoute, routes.indexOf(selectedRoute))]],
              ),
            );
          }
          const step = firstRouteStep(selectedRoute);
          let executableStep = await fetchStepTransaction(step);
          const executionWallet = await getWallet();
          const approval = await ensureAllowance(
            executionWallet,
            executableStep.action ?? step.action,
            executableStep.estimate ?? step.estimate,
          );
          if (approval.approved) {
            executableStep = await fetchStepTransaction(step, "Refreshing route transaction...");
          }
          const result = await sendTransactionRequest(executionWallet, executableStep.transactionRequest);
          if (isJsonMode(opts)) {
            console.log(
              jsonOutput({
                approvalHash: approval.hash,
                transactionHash: result.hash,
                blockNumber: result.blockNumber,
              }),
            );
          } else {
            console.log(formatTable(["Field", "Value"], executionRows(result, approval.hash)));
          }
          return;
        }

        const params: QuoteParams = {
          fromChain,
          toChain,
          fromToken,
          toToken: selectedVaultAddress,
          fromAmount,
          fromAddress,
          toAddress,
          slippage: options.slippage,
        };

        if (options.order) params.order = options.order as RouteOrder;

        const data = await fetchQuote(params, "Fetching Composer quote...");
        const isComposer = includesComposerStep(data);

        if (!isComposer) {
          throw new CliError(
            "LI.FI did not return a Composer route for this to-token",
            ExitCode.General,
            "Use a Composer-supported vault/staking/deposit token address.",
          );
        }

        if (!isJsonMode(opts)) {
          console.log(formatTable(["Field", "Value"], quoteRows(data, options.slippage)));
        }
        const executionWallet = await getWallet();
        const approval = await ensureAllowance(executionWallet, data.action, data.estimate);
        const result = await sendTransactionRequest(executionWallet, data.transactionRequest);
        if (isJsonMode(opts)) {
          console.log(
            jsonOutput({
              approvalHash: approval.hash,
              transactionHash: result.hash,
              blockNumber: result.blockNumber,
            }),
          );
        } else {
          console.log(formatTable(["Field", "Value"], executionRows(result, approval.hash)));
        }
      } catch (error) {
        handleError(error);
      }
    });
}
