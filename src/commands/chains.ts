import { type Command, Option } from "commander";
import { ExitCode } from "../core/constants.js";
import { CliError, handleError } from "../core/errors.js";
import { formatTable, isJsonMode, jsonOutput } from "../core/formatter.js";
import { api } from "../core/http-client.js";
import { withSpinner } from "../core/interactive.js";
import type { Chain, ChainType } from "../types/index.js";

export async function fetchChains(): Promise<Chain[]> {
  const { data } = await api.get<{ chains: Chain[] }>("/chains");
  return data.chains;
}

export function registerChainsCommand(program: Command): void {
  program
    .command("chains")
    .description("List all supported blockchain networks")
    .addOption(new Option("--type <type>", "Filter by chain type").choices(["EVM", "SVM"] satisfies ChainType[]))
    .addHelpText(
      "after",
      `
Examples:
  $ lifi chains                    # All chains
  $ lifi chains --type EVM         # Only EVM chains
  $ lifi chains --json | jq '.chains[] | {id, name}'`,
    )
    .action(async (options, command) => {
      const opts = command.optsWithGlobals();
      try {
        let chains = await withSpinner("Fetching chains...", () => fetchChains());
        if (options.type) {
          const type = options.type as ChainType;
          chains = chains.filter((c) => c.chainType === type);
        }

        if (isJsonMode(opts)) {
          console.log(jsonOutput({ chains }));
        } else {
          const rows = chains.map((c) => [String(c.id), c.name, c.chainType, c.nativeToken.symbol]);
          console.log(formatTable(["ID", "Name", "Type", "Native Token"], rows));
          console.log("\n  Next: lifi chain <id>  or  lifi tokens --chain <id>");
        }
      } catch (error) {
        handleError(error);
      }
    });

  program
    .command("chain <idOrName>")
    .description("Look up a single chain by numeric ID or name (case-insensitive)")
    .addHelpText(
      "after",
      `
Examples:
  $ lifi chain 42161             # By ID
  $ lifi chain arbitrum          # By name
  $ lifi chain ethereum --json   # JSON output`,
    )
    .action(async (idOrName, _options, command) => {
      const opts = command.optsWithGlobals();
      try {
        const allChains = await withSpinner("Fetching chains...", () => fetchChains());
        const isNumeric = /^\d+$/.test(idOrName);

        const chain = isNumeric
          ? allChains.find((c) => c.id === Number(idOrName))
          : allChains.find((c) => c.name.toLowerCase() === idOrName.toLowerCase());

        if (!chain) {
          handleError(
            new CliError(
              `Chain "${idOrName}" not found`,
              ExitCode.InvalidArgs,
              "Run: lifi chains  to see all available chains",
            ),
          );
          return;
        }

        if (isJsonMode(opts)) {
          console.log(jsonOutput(chain));
        } else {
          const rows = [
            ["ID", String(chain.id)],
            ["Name", chain.name],
            ["Key", chain.key],
            ["Type", chain.chainType],
            ["Native Token", chain.nativeToken.symbol],
            ["Mainnet", chain.mainnet ? "Yes" : "No"],
          ];
          console.log(formatTable(["Field", "Value"], rows));
        }
      } catch (error) {
        handleError(error);
      }
    });
}
