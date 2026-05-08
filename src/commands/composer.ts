import { select } from "@inquirer/prompts";
import { type Command, Option } from "commander";
import { ExitCode } from "../core/constants.js";
import { CliError, handleError } from "../core/errors.js";
import { formatAmount, formatDuration, formatTable, isJsonMode, jsonOutput } from "../core/formatter.js";
import { earnApi } from "../core/http-client.js";
import { withSpinner } from "../core/interactive.js";
import type { EarnVault, EarnVaultsResponse, QuoteParams, QuoteResponse, RouteOrder, Step } from "../types/index.js";
import { fetchQuote } from "./quote.js";
import { promptIfMissing } from "../core/prompt-if-missing.js";

const COMPOSER_TOOL = "composer";

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

async function selectComposerVault(options: {
  to?: string;
  vaultAsset?: string;
  vaultProtocol?: string;
  vaultLimit?: string;
}) {
  const params: Record<string, string | boolean> = {
    isComposerSupported: true,
    isTransactional: true,
    limit: options.vaultLimit ?? "20",
  };
  if (options.to) params["chainId"] = options.to;
  if (options.vaultAsset) params["asset"] = options.vaultAsset;
  if (options.vaultProtocol) params["protocol"] = options.vaultProtocol;

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

export function registerComposerCommand(program: Command): void {
  const composer = program
    .command("composer")
    .description("Prepare LI.FI Composer deposit quotes for vault, staking, and lending tokens")
    .addHelpText(
      "after",
      `
Examples:
  $ lifi composer vaults --chain 8453 --asset USDC
  $ lifi composer quote --from 8453 --to 8453 --from-token 0x8335... --to-token 0x7BfA... --amount 1000000 --from-address 0xd8dA...
  $ lifi composer quote --from 1 --to 8453 --from-token ETH --to-token 0x7BfA... --amount 100000000000000000 --json`,
    );

  composer
    .description("execute composer")
    .option("--from <chain>", "Source chain name or ID (e.g. base, 8453)")
    .option("--to <chain>", "Destination chain name or ID. Same as --from for same-chain deposits")
    .option("--from-token <token>", "Token to deposit from — symbol or address")
    .option("--to-token <token>", "Composer target token address, such as a vault/staking/deposit token")
    .option("--amount <amount>", "Amount in from-token smallest unit (e.g. 1000000 for 1 USDC)")
    .option("--from-address <address>", "Sender wallet address (0x...)")
    .option("--to-address <address>", "Recipient wallet address. Defaults to --from-address")
    .option("--vault-limit <count>", "Interactive mode: maximum vaults to show", "20")
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
        const fromChain = await promptIfMissing(options.from, "--from (source chain)");
        const toChain = await promptIfMissing(options.to, "--to (destination chain)");
        const fromToken = await promptIfMissing(options.fromToken, "--from-token");
        const fromAmount = await promptIfMissing(options.amount, "--amount");
        const fromAddress = await promptIfMissing(options.fromAddress, "--from-address");
        const toAddress = options.toAddress || fromAddress;

        const selectedVaultAddress = options.toToken || (await selectComposerVault({to: toChain, vaultLimit: options.vaultLimit})).address
        if (!selectedVaultAddress) {
          throw new CliError(
            "No valid selelcted vault",
            ExitCode.General,
            "Run lifi earn vaults --json to inspect vaults payloads.",
          );
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

        if (!isComposer && !options.allowStandardRoute) {
          throw new CliError(
            "LI.FI did not return a Composer route for this to-token",
            ExitCode.General,
            "Use a Composer-supported vault/staking/deposit token address, or pass --allow-standard-route to inspect the returned quote.",
          );
        }

        if (isJsonMode(opts)) {
          console.log(jsonOutput(data));
        } else {
          console.log(formatTable(["Field", "Value"], quoteRows(data, options.slippage)));
          console.log("\n  This CLI is read-only: approve if needed, then sign transactionRequest with your wallet.");
          if (data.action?.fromChainId !== data.action?.toChainId) {
            console.log(
              "  After broadcasting, track with: lifi status <txHash> --from-chain <fromChain> --to-chain <toChain> --watch",
            );
          }
          console.log("  Use --json to get the full transactionRequest object.");
        }
      } catch (error) {
        handleError(error);
      }
    })}