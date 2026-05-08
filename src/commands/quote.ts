import { type Command, Option } from "commander";
import { handleError } from "../core/errors.js";
import { formatAmount, formatTable, isJsonMode, jsonOutput } from "../core/formatter.js";
import { api } from "../core/http-client.js";
import { withSpinner } from "../core/interactive.js";
import { promptIfMissing } from "../core/prompt-if-missing.js";
import type { QuoteParams, QuoteResponse, RouteOrder } from "../types/index.js";

export async function fetchQuote(params: QuoteParams, message = "Fetching quote..."): Promise<QuoteResponse> {
  const { data } = await withSpinner(message, () => api.get<QuoteResponse>("/quote", { params }));
  return data;
}

export function registerQuoteCommand(program: Command): void {
  program
    .command("quote")
    .description("Get the best route for a cross-chain or same-chain swap")
    .option("--from <chain>", "Source chain name or ID (e.g. ethereum, 1)")
    .option("--to <chain>", "Destination chain name or ID (e.g. arbitrum, 42161)")
    .option("--from-token <token>", "Token to send — symbol or address (e.g. USDC, 0xa0b8...)")
    .option("--to-token <token>", "Token to receive — symbol or address")
    .option("--amount <amount>", "Amount in smallest unit (e.g. 1000000 for 1 USDC)")
    .option("--from-address <address>", "Sender wallet address (0x...)")
    .option("--slippage <slippage>", "Max slippage as decimal (e.g. 0.03 for 3%)", "0.03")
    .addOption(
      new Option("--order <order>", "Route preference").choices([
        "CHEAPEST",
        "FASTEST",
        "SAFEST",
        "RECOMMENDED",
      ] satisfies RouteOrder[]),
    )
    .option("--allow-bridges <keys>", "Only use these bridges (comma-separated keys from lifi tools)")
    .option("--allow-exchanges <keys>", "Only use these exchanges (comma-separated keys from lifi tools)")
    .addHelpText(
      "after",
      `
Examples:
  $ lifi quote --from ethereum --to arbitrum --from-token USDC --to-token USDC --amount 1000000 --from-address 0xd8dA...
  $ lifi quote                          # Interactive mode — prompts for each field
  $ lifi quote --from 1 --to 8453 --from-token USDC --to-token USDC --amount 1000000000 --json`,
    )
    .action(async (options, command) => {
      const opts = command.optsWithGlobals();
      try {
        const fromChain = await promptIfMissing(options.from, "--from (source chain)");
        const toChain = await promptIfMissing(options.to, "--to (destination chain)");
        const fromToken = await promptIfMissing(options.fromToken, "--from-token");
        const toToken = await promptIfMissing(options.toToken, "--to-token");
        const fromAmount = await promptIfMissing(options.amount, "--amount");
        const fromAddress = await promptIfMissing(options.fromAddress, "--from-address");

        const params: QuoteParams = {
          fromChain,
          toChain,
          fromToken,
          toToken,
          fromAmount,
          fromAddress,
          slippage: options.slippage,
        };
        if (options["order"]) params.order = options["order"] as RouteOrder;
        if (options["allowBridges"]) params["allowBridges"] = options["allowBridges"] as string;
        if (options["allowExchanges"]) params["allowExchanges"] = options["allowExchanges"] as string;

        const data = await fetchQuote(params);

        if (isJsonMode(opts)) {
          console.log(jsonOutput(data));
        } else {
          const estimate = data.estimate;
          const rows = [
            [
              "You receive",
              `${formatAmount(estimate?.toAmount ?? "0", estimate?.toAmountDecimals ?? 18)} ${data.action?.toToken?.symbol ?? ""}`,
            ],
            ["Bridge", data.toolDetails?.name ?? data.tool ?? "N/A"],
            ["Est. time", estimate?.executionDuration ? `~${Math.round(estimate.executionDuration / 60)} min` : "N/A"],
            ["Gas cost", estimate?.gasCosts?.[0]?.amountUSD ? `~$${estimate.gasCosts[0].amountUSD}` : "N/A"],
            ["Slippage", `${Number(options["slippage"]) * 100}%`],
          ];
          console.log(formatTable(["", ""], rows));
          console.log("\n  Sign the transactionRequest with your wallet to execute.");
          console.log("  Then track with: lifi status <txHash> --watch");
          console.log("  Use --json to get the full transactionRequest object.");
        }
      } catch (error) {
        handleError(error);
      }
    });
}
