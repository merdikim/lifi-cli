import type { Command } from "commander";
import { handleError } from "../core/errors.js";
import { formatTable, isJsonMode, jsonOutput } from "../core/formatter.js";
import { api } from "../core/http-client.js";
import { withSpinner } from "../core/interactive.js";
import type { Token, TokensResponse } from "../types/index.js";

export async function getTokens(chainId: string): Promise<Token[]> {
  const { data } = await api.get<TokensResponse>("/tokens", { params: { chains: chainId } });
  return data.tokens[chainId] ?? [];
}

export function registerTokensCommand(program: Command): void {
  program
    .command("tokens")
    .description("List supported tokens across chains")
    .option("--chain <chainId>", "Filter by chain ID (e.g. 1 for Ethereum, 137 for Polygon)")
    .option("--min-price <price>", "Only show tokens with USD price >= this value")
    .addHelpText(
      "after",
      `
Examples:
  $ lifi tokens --chain 1                     # All Ethereum tokens
  $ lifi tokens --chain 1 --min-price 100     # Tokens worth $100+
  $ lifi tokens --chain 1 --json | jq '.tokens["1"][] | .symbol'`,
    )
    .action(async (options, command) => {
      const opts = command.optsWithGlobals();
      try {
        const params: Record<string, string> = {};
        if (options["chain"]) params["chains"] = options["chain"] as string;

        const { data } = await withSpinner("Fetching tokens...", () => api.get<TokensResponse>("/tokens", { params }));

        if (options["minPrice"]) {
          const minPrice = Number(options["minPrice"]);
          const tokens = data.tokens;
          for (const chainId of Object.keys(tokens)) {
            const chainTokens = tokens[chainId];
            if (chainTokens) {
              tokens[chainId] = chainTokens.filter((t: Token) => Number(t.priceUSD ?? 0) >= minPrice);
            }
          }
        }

        if (isJsonMode(opts)) {
          console.log(jsonOutput(data));
        } else {
          const tokens = data.tokens;
          const allTokens: Token[] = [];
          for (const chainId of Object.keys(tokens)) {
            const chainTokens = tokens[chainId];
            if (chainTokens) {
              allTokens.push(...chainTokens);
            }
          }
          const rows = allTokens
            .slice(0, 50)
            .map((t: Token) => [
              t.symbol,
              t.name,
              `${t.address.slice(0, 10)}...`,
              String(t.decimals),
              String(t.chainId),
            ]);
          console.log(formatTable(["Symbol", "Name", "Address", "Decimals", "Chain"], rows));
          if (allTokens.length > 50) {
            console.log(`\n  Showing 50 of ${allTokens.length} tokens. Use --json for full list.`);
          }
          console.log("\n  Next: lifi token <chain> <symbol>  or  lifi quote --from-token <symbol>");
        }
      } catch (error) {
        handleError(error);
      }
    });

  program
    .command("token <chain> <symbol>")
    .description("Get details for a specific token by chain and symbol or address")
    .addHelpText(
      "after",
      `
Examples:
  $ lifi token 1 USDC                                              # By symbol
  $ lifi token ethereum USDC                                       # By chain name
  $ lifi token 1 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48       # By address`,
    )
    .action(async (chain, symbol, _options, command) => {
      const opts = command.optsWithGlobals();
      try {
        const { data } = await withSpinner("Fetching token...", () =>
          api.get<Token>("/token", { params: { chain, token: symbol } }),
        );

        if (isJsonMode(opts)) {
          console.log(jsonOutput(data));
        } else {
          const rows = [
            ["Symbol", data.symbol],
            ["Name", data.name],
            ["Address", data.address],
            ["Decimals", String(data.decimals)],
            ["Chain ID", String(data.chainId)],
            ["Price (USD)", data.priceUSD ?? "N/A"],
          ];
          console.log(formatTable(["Field", "Value"], rows));
        }
      } catch (error) {
        handleError(error);
      }
    });
}
