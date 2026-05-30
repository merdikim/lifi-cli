import { type Command, InvalidArgumentError, Option } from "commander";
import { handleError } from "../core/errors.js";
import { formatTable, formatUsd, isJsonMode, jsonOutput } from "../core/formatter.js";
import { earnApi } from "../core/http-client.js";
import { withSpinner } from "../core/interactive.js";
import type {
  EarnChain,
  EarnPosition,
  EarnPositionsResponse,
  EarnProtocol,
  EarnVault,
  EarnVaultsResponse,
} from "../types/index.js";

function protocolName(protocol: EarnProtocol | undefined): string {
  if (!protocol) return "N/A";
  return protocol.name;
}

function percent(value: number | undefined): string {
  if (value === undefined || value === null || !Number.isFinite(Number(value))) return "N/A";
  const normalized = value * 100;
  return `${normalized.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
}

function vaultAsset(vault: EarnVault): string {
  return vault.underlyingTokens?.[0]?.symbol ?? "N/A";
}

function vaultApy(vault: EarnVault): number | undefined {
  return vault.analytics?.apy?.total ?? undefined;
}

function vaultTvl(vault: EarnVault): number | string | undefined {
  return vault.analytics?.tvl?.usd ?? undefined;
}

function parsePositiveInteger(value: string, message: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError(message);
  }
  return parsed;
}

function vaultRows(vaults: EarnVault[]): string[][] {
  return vaults.map((vault) => [
    String(vault.chainId),
    protocolName(vault.protocol),
    vault.name ?? vault.slug ?? "N/A",
    vaultAsset(vault),
    percent(vaultApy(vault)),
    formatUsd(Number(vaultTvl(vault))),
  ]);
}

function positionRows(positions: EarnPosition[]): string[][] {
  return positions.map((position) => [
    String(position.chainId ?? "N/A"),
    position.protocolName ?? "N/A",
    position.address ?? "N/A",
    position.asset?.symbol ?? "N/A",
    position.balanceNative ?? "N/A",
    formatUsd(Number(position.balanceUsd)),
  ]);
}

export function registerEarnCommand(program: Command): void {
  const earn = program
    .command("earn")
    .description("Discover LI.FI Earn vaults and portfolio positions")
    .addHelpText(
      "after",
      `
Examples:
  $ lifi earn vaults --chain 8453 --asset USDC --limit 10
  $ lifi earn vaults --protocol aave --json
  $ lifi earn positions 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045`,
    );

  earn
    .command("vaults")
    .description("List Earn vaults")
    .option("--chain <chainId>", "Filter by chain ID")
    .option("--asset <asset>", "Filter by asset symbol or address")
    .option("--protocol <protocol>", "Filter by protocol key or name")
    .option("--min-tvl <usd>", "Only show vaults with TVL >= this USD amount", (value) =>
      parsePositiveInteger(value, "must be a positive integer"),
    )
    .option("--transactional", "Only show vaults that support transactional flows")
    .option("--redeemable", "Only show vaults that support redemption")
    .option("--composer-supported", "Only show vaults supported by LI.FI Composer")
    .addOption(new Option("--sort-by <field>", "Sort vaults by an Earn API field").choices(["apy", "tvl"]))
    .option("--limit <count>", "Maximum number of vaults to request", (value) =>
      parsePositiveInteger(value, "must be a positive integer"),
    )
    .option("--cursor <cursor>", "Pagination cursor from a previous response")
    .addHelpText(
      "after",
      `
Examples:
  $ lifi earn vaults --chain 8453 --asset USDC
  $ lifi earn vaults --sort-by apy --limit 20
  $ lifi earn vaults --composer-supported --json`,
    )
    .action(async (options, command) => {
      const opts = command.optsWithGlobals();
      try {
        const params: Record<string, string | number | boolean> = {};
        if (options.chain) params["chainId"] = options.chain as string;
        if (options.asset) params["asset"] = options.asset as string;
        if (options.protocol) params["protocol"] = options.protocol as string;
        if (options.minTvl !== undefined) params["minTvlUsd"] = options.minTvl as number;
        if (options.transactional) params["isTransactional"] = true;
        if (options.redeemable) params["isRedeemable"] = true;
        if (options.composerSupported) params["isComposerSupported"] = true;
        if (options.sortBy) params["sortBy"] = options.sortBy as string;
        if (options.limit !== undefined) params["limit"] = options.limit as number;
        if (options.cursor) params["cursor"] = options.cursor as string;

        const { data } = await withSpinner("Fetching Earn vaults...", () =>
          earnApi.get<EarnVaultsResponse>("/vaults", { params }),
        );

        if (data.total !== undefined) console.log(`\n  Total vaults: ${data.total}`);

        if (isJsonMode(opts)) {
          console.log(jsonOutput(data));
        } else {
          console.log(formatTable(["Chain", "Protocol", "Vault", "Asset", "APY", "TVL"], vaultRows(data.data)));
          if (data.nextCursor) {
            console.log(`\n  Next page cursor: ${data.nextCursor}`);
          }
        }
      } catch (error) {
        handleError(error);
      }
    });

  earn
    .command("vault <chainId> <address>")
    .description("Get full details for a single Earn vault")
    .addHelpText(
      "after",
      `
Examples:
  $ lifi earn vault 8453 0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A
  $ lifi earn vault 8453 0x7BfA... --json`,
    )
    .action(async (chainId, address, _options, command) => {
      const opts = command.optsWithGlobals();
      try {
        const { data } = await withSpinner("Fetching Earn vault...", () =>
          earnApi.get<EarnVault>(`/vaults/${chainId}/${address}`),
        );

        if (isJsonMode(opts)) {
          console.log(jsonOutput(data));
        } else {
          const rows = [
            ["Chain", String(data.chainId)],
            ["Protocol", protocolName(data.protocol)],
            ["Vault", data.name ?? data.slug ?? data.address ?? "N/A"],
            ["Asset", vaultAsset(data)],
            ["APY", percent(vaultApy(data))],
            ["TVL", formatUsd(Number(vaultTvl(data)))],
            ["Transactional", data.isTransactional ? "Yes" : "No"],
            ["Redeemable", data.isRedeemable ? "Yes" : "No"],
          ];
          console.log(formatTable(["Field", "Value"], rows));
        }
      } catch (error) {
        handleError(error);
      }
    });

  earn
    .command("chains")
    .description("List chains supported by LI.FI Earn")
    .action(async (_options, command) => {
      const opts = command.optsWithGlobals();
      try {
        const { data } = await withSpinner("Fetching Earn chains...", () => earnApi.get<EarnChain[]>("/chains"));
        if (isJsonMode(opts)) {
          console.log(jsonOutput(data));
        } else {
          const rows = data.map((chain) => [String(chain.chainId), chain.name, chain.networkCaip ?? "N/A"]);
          console.log(formatTable(["ID", "Name", "CAIP"], rows));
        }
      } catch (error) {
        handleError(error);
      }
    });

  earn
    .command("protocols")
    .description("List protocols supported by LI.FI Earn")
    .action(async (_options, command) => {
      const opts = command.optsWithGlobals();
      try {
        const { data } = await withSpinner("Fetching Earn protocols...", () =>
          earnApi.get<EarnProtocol[]>("/protocols"),
        );

        if (isJsonMode(opts)) {
          console.log(jsonOutput(data));
        } else {
          const rows = data.map((protocol) => [protocol.name, protocol.url ?? "N/A", protocol.logoUri ?? "N/A"]);
          console.log(formatTable(["Name", "URL", "Logo URI"], rows));
        }
      } catch (error) {
        handleError(error);
      }
    });

  earn
    .command("positions <address>")
    .description("List Earn positions for a wallet address")
    .addHelpText(
      "after",
      `
Examples:
  $ lifi earn positions 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
  $ lifi earn positions 0xd8dA... --json`,
    )
    .action(async (address, _options, command) => {
      const opts = command.optsWithGlobals();
      try {
        const { data } = await withSpinner("Fetching Earn positions...", () =>
          earnApi.get<EarnPositionsResponse>(`/portfolio/${address}/positions`),
        );

        if (isJsonMode(opts)) {
          console.log(jsonOutput(data));
        } else {
          console.log(
            formatTable(
              ["Chain ID", "Protocol", "Vault Address", "Asset", "Balance Native", "Balance USD"],
              positionRows(data.positions),
            ),
          );
        }
      } catch (error) {
        handleError(error);
      }
    });
}
