import { type Command, Option } from "commander";
import { handleError } from "../core/errors.js";
import { formatTable, isJsonMode, jsonOutput } from "../core/formatter.js";
import { api } from "../core/http-client.js";
import { withSpinner } from "../core/interactive.js";
import type { Route, RouteOrder, RoutesParams, RoutesResponse, Step } from "../types/index.js";

export async function fetchRoutes(body: RoutesParams, message = "Fetching routes..."): Promise<RoutesResponse> {
  const { data } = await withSpinner(message, () => api.post<RoutesResponse>("/advanced/routes", body));
  return data;
}

export function routeRows(routes: Route[]): string[][] {
  return routes.map((route, index) => [
    String(index + 1),
    route.steps.map((step: { tool: string }) => step.tool).join(" → "),
    route.toAmountUSD ? `$${route.toAmountUSD}` : "N/A",
    route.gasCostUSD ? `$${route.gasCostUSD}` : "N/A",
  ]);
}

export async function fetchStepTransaction(step: Step, message = "Fetching route transaction..."): Promise<Step> {
  const { data } = await withSpinner(message, () => api.post<Step>("/advanced/stepTransaction", step));
  return data;
}

export function registerRoutesCommand(program: Command): void {
  program
    .command("routes")
    .description("Get multiple route options for comparison (unlike quote, returns several alternatives)")
    .option("--from <chain>", "Source chain name or ID (e.g. ethereum, 1)")
    .option("--to <chain>", "Destination chain name or ID (e.g. arbitrum, 42161)")
    .option("--from-token <token>", "Token to send — symbol or address (e.g. USDC)")
    .option("--to-token <token>", "Token to receive — symbol or address")
    .option("--amount <amount>", "Amount in smallest unit (e.g. 1000000 for 1 USDC)")
    .option("--from-address <address>", "Sender wallet address (0x...)")
    .addOption(
      new Option("--order <order>", "Sort preference").choices([
        "CHEAPEST",
        "FASTEST",
        "SAFEST",
        "RECOMMENDED",
      ] satisfies RouteOrder[]),
    )
    .addHelpText(
      "after",
      `
Examples:
  $ lifi routes --from 1 --to 42161 --from-token USDC --to-token USDC --amount 1000000000 --json
  $ lifi routes --from ethereum --to base --from-token USDC --to-token USDC --amount 1000000 --order CHEAPEST`,
    )
    .action(async (options, command) => {
      const opts = command.optsWithGlobals();
      try {
        const body: RoutesParams = {
          fromChainId: options.from,
          toChainId: options.to,
          fromTokenAddress: options.fromToken,
          toTokenAddress: options.toToken,
          fromAmount: options.amount,
          fromAddress: options.fromAddress || "0x0000000000000000000000000000000000000000",
        };
        if (options.order) body.options = { order: options.order as RouteOrder };

        const data = await fetchRoutes(body);

        if (isJsonMode(opts)) {
          console.log(jsonOutput(data));
        } else {
          const routes: Route[] = data.routes ?? [];
          console.log(formatTable(["#", "Steps", "You Receive (USD)", "Gas Cost"], routeRows(routes)));
        }
      } catch (error) {
        handleError(error);
      }
    });
}
