import { input, select } from "@inquirer/prompts";
import axios, { type AxiosInstance } from "axios";
import { type Command, Option } from "commander";
import { ExitCode } from "../core/constants.js";
import { CliError, handleError, mapAxiosError } from "../core/errors.js";
import { formatTable, isJsonMode, jsonOutput } from "../core/formatter.js";
import { withSpinner } from "../core/interactive.js";

type IntentType = "exact-input" | "exact-output";

interface SupportedIntentChain {
  id: number;
  chainId: string;
  chainType: string;
  name: string;
  rpcUrls: string[];
  isActive: boolean;
}

interface IntentOptions {
  fromChain: string;
  toChain: string;
  fromToken: string;
  toToken: string;
  amount: string;
  type: IntentType;
}

const INTENTS_API_BASE_URL = "https://order.li.fi";
const INTENT_TYPES = ["exact-input", "exact-output"] as const satisfies readonly IntentType[];

function createIntentsApiClient(): AxiosInstance {
  const client = axios.create({
    baseURL: INTENTS_API_BASE_URL,
    timeout: 30_000,
  });

  client.interceptors.response.use(
    (response) => response,
    (error) => {
      throw mapAxiosError(error);
    },
  );

  return client;
}

const intentsApi = createIntentsApiClient();

async function fetchSupportedChains(): Promise<SupportedIntentChain[]> {
  const { data } = await intentsApi.get<SupportedIntentChain[]>("/chains/supported");
  return data.filter((chain) => chain.isActive);
}

async function promptIfMissing(value: string | undefined, label: string): Promise<string> {
  if (value) return value;
  if (process.env["LIFI_NO_INPUT"] === "1") {
    throw new CliError(
      `Missing required option: ${label}`,
      ExitCode.InvalidArgs,
      "Pass all required flags when using --no-input",
    );
  }
  return input({ message: `${label}:` });
}

function formatChainOption(chain: SupportedIntentChain): string {
  return `${chain.name} (${chain.chainType}, ${chain.chainId})`;
}

function findSupportedChain(value: string, chains: SupportedIntentChain[]): SupportedIntentChain | undefined {
  const normalized = value.trim().toLowerCase();
  return chains.find(
    (chain) => String(chain.chainId).toLowerCase() === normalized || String(chain.name).toLowerCase() === normalized,
  );
}

async function selectIfMissing<T>(
  value: string | undefined,
  label: string,
  choices: T[],
  resolveValue: (value: string, choices: T[]) => T | undefined,
  formatChoice: (choice: T) => string,
  unsupportedLabel: string,
): Promise<T> {
  if (value) {
    const choice = resolveValue(value, choices);
    if (choice) return choice;

    throw new CliError(
      `Unsupported ${unsupportedLabel} for ${label}: ${value}`,
      ExitCode.InvalidArgs,
      `Supported ${unsupportedLabel}s: ${choices.map(formatChoice).join(", ")}`,
    );
  }

  if (process.env["LIFI_NO_INPUT"] === "1") {
    throw new CliError(
      `Missing required option: ${label}`,
      ExitCode.InvalidArgs,
      "Pass all required flags when using --no-input",
    );
  }

  return select({
    message: `${label}:`,
    choices: choices.map((choice) => ({
      name: formatChoice(choice),
      value: choice,
    })),
  });
}

function validateIntentOptions(options: Record<keyof IntentOptions, string>): IntentOptions {
  const validated = {
    fromChain: options.fromChain.trim(),
    toChain: options.toChain.trim(),
    fromToken: options.fromToken.trim(),
    toToken: options.toToken.trim(),
    amount: options.amount.trim(),
    type: options.type.trim(),
  };

  const missingOption = Object.entries(validated).find(([, value]) => !value)?.[0];
  if (missingOption) {
    throw new CliError(
      `Missing required option: --${missingOption.replace(/[A-Z]/g, "-$&").toLowerCase()}`,
      ExitCode.InvalidArgs,
    );
  }

  if (!/^[1-9]\d*$/.test(validated.amount)) {
    throw new CliError("--amount must be a positive integer in the token's smallest unit", ExitCode.InvalidArgs);
  }

  if (!INTENT_TYPES.includes(validated.type as IntentType)) {
    throw new CliError("--type must be either exact-input or exact-output", ExitCode.InvalidArgs);
  }

  return {
    ...validated,
    type: validated.type as IntentType,
  };
}

async function getIntentOptions(
  options: Partial<Record<keyof IntentOptions, string>>,
  chains: SupportedIntentChain[],
): Promise<IntentOptions> {
  const fromChain = await selectIfMissing(
    options.fromChain,
    "--from-chain",
    chains,
    findSupportedChain,
    formatChainOption,
    "chain",
  );
  const toChainChoices = chains.filter((chain) => chain.chainId !== fromChain.chainId);
  const toChain = await selectIfMissing(
    options.toChain,
    "--to-chain",
    options.toChain ? chains : toChainChoices,
    findSupportedChain,
    formatChainOption,
    "chain",
  );

  if (fromChain.chainId === toChain.chainId) {
    throw new CliError("--from-chain and --to-chain must be different", ExitCode.InvalidArgs);
  }

  return validateIntentOptions({
    fromChain: fromChain.chainId,
    toChain: toChain.chainId,
    fromToken: await promptIfMissing(options.fromToken, "--from-token"),
    toToken: await promptIfMissing(options.toToken, "--to-token"),
    amount: await promptIfMissing(options.amount, "--amount"),
    type: await promptIfMissing(options.type, "--type"),
  });
}

export function registerIntentCommand(program: Command): void {
  program
    .command("intent")
    .description("Execute a LI.FI intent quote")
    .option("--from-chain <chain>", "Source chain name, or ID (e.g. ethereum, 1)")
    .option("--to-chain <chain>", "Destination chain name, or ID (e.g. base, 8453)")
    .option("--from-token <token>", "Token to send, as a symbol or address (e.g. USDC, 0xa0b8...)")
    .option("--to-token <token>", "Token to receive, as a symbol or address")
    .option("--amount <amount>", "Amount in smallest unit")
    .addOption(
      new Option("--type <type>", "Intent quote type")
        .choices(["exact-input", "exact-output"] satisfies IntentType[])
        .default("exact-output"),
    )
    .addHelpText(
      "after",
      `
Examples:
  $ lifi intent --from-chain ethereum --to-chain base --from-token USDC --to-token USDC --amount 1000000 --type exact-input
  $ lifi intent --from-chain 1 --to-chain 8453 --from-token USDC --to-token USDC --amount 1000000 --type exact-output`,
    )
    .action(async (options, command) => {
      const opts = command.optsWithGlobals();
      try {
        const chains = await withSpinner("Fetching supported intent chains...", () => fetchSupportedChains());
        const intentOptions = await getIntentOptions(options, chains);

        
      } catch (error) {
        handleError(error);
      }
    });
}
