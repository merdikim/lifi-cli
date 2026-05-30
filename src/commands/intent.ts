import { input, select } from "@inquirer/prompts";
import axios, { type AxiosInstance } from "axios";
import { type Command, Option } from "commander";
import { parseUnits } from "viem";
import { ExitCode } from "../core/constants.js";
import { CliError, handleError, mapAxiosError } from "../core/errors.js";
import { formatAmount } from "../core/formatter.js";
import { withSpinner } from "../core/interactive.js";
import { getInteropAddress } from "../core/interop-address.js";
import type { Token } from "../types/index.js";
import { getTokens } from "./tokens.js";

type IntentType = "exact-input" | "exact-output";

export interface SupportedIntentChain {
  id: number;
  chainId: string;
  chainType: string;
  name: string;
  rpcUrls: string[];
  isActive: boolean;
}

export interface IntentOptions {
  fromChain: string;
  toChain: string;
  fromToken: Token;
  toToken: Token;
  amount: string;
  type: IntentType;
  fromChainName?: string | undefined;
  toChainName?: string | undefined;
}

interface IntentCommandOptions {
  fromChain: string;
  toChain: string;
  fromToken: string;
  toToken: string;
  amount: string;
  type: string;
  fromChainName?: string | undefined;
  toChainName?: string | undefined;
}

interface RawIntentOptions {
  fromChain: string;
  toChain: string;
  fromToken: Token;
  toToken: Token;
  amount: string;
  type: string;
  fromChainName?: string;
  toChainName?: string;
}

export interface IntentQuoteRequest {
  user: string;
  intent: {
    intentType: "oif-swap";
    inputs: Array<{
      user: string;
      asset: string;
      amount: string | null;
    }>;
    outputs: Array<{
      receiver: string;
      asset: string;
      amount: string | null;
    }>;
    swapType: IntentType;
  };
  supportedTypes: ["oif-escrow-v0"];
}

export interface IntentQuote {
  order: null;
  validUntil: number;
  quoteId: string;
  preview: {
    inputs: Array<{
      user: string;
      asset: string;
      amount: string;
    }>;
    outputs: Array<{
      receiver: string;
      asset: string;
      amount: string;
    }>;
  };
  metadata: {
    exclusiveFor: string | null;
  };
  partialFill: boolean;
  failureHandling: string;
}

export interface IntentQuoteResponse {
  quotes: IntentQuote[];
}

const INTENTS_API_BASE_URL = "https://order.li.fi";
const INTENT_USER_ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
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

function formatTokenOption(token: Token): string {
  return `${token.symbol} - ${token.name} (${token.address})`;
}

function findSupportedChain(value: string, chains: SupportedIntentChain[]): SupportedIntentChain | undefined {
  const normalized = value.trim().toLowerCase();
  return chains.find(
    (chain) => String(chain.chainId).toLowerCase() === normalized || String(chain.name).toLowerCase() === normalized,
  );
}

function findSupportedToken(value: string, tokens: Token[]): Token | undefined {
  const trimmed = value.trim();
  const normalized = trimmed.toLowerCase();
  return tokens.find(
    (token) =>
      (String(token.address).startsWith("0x")
        ? String(token.address).toLowerCase() === normalized
        : String(token.address) === trimmed) ||
      String(token.symbol).toLowerCase() === normalized ||
      String(token.name).toLowerCase() === normalized,
  );
}

function findIntentType(value: string, types: readonly IntentType[]): IntentType | undefined {
  const normalized = value.trim().toLowerCase();
  return types.find((type) => type === normalized);
}

function formatSupportedChoices<T>(choices: readonly T[], formatChoice: (choice: T) => string): string {
  const shownChoices = choices.slice(0, 20).map(formatChoice);
  const remaining = choices.length - shownChoices.length;
  if (remaining > 0) {
    shownChoices.push(`and ${remaining} more`);
  }
  return shownChoices.join(", ");
}

async function selectIfMissing<T>(
  value: string | undefined,
  label: string,
  choices: readonly T[],
  resolveValue: (value: string, choices: T[]) => T | undefined,
  formatChoice: (choice: T) => string,
  unsupportedLabel: string,
): Promise<T> {
  if (choices.length === 0) {
    throw new CliError(`No supported ${unsupportedLabel}s available for ${label}`, ExitCode.InvalidArgs);
  }

  if (value) {
    const choice = resolveValue(value, [...choices]);
    if (choice) return choice;

    throw new CliError(
      `Unsupported ${unsupportedLabel} for ${label}: ${value}`,
      ExitCode.InvalidArgs,
      `Supported ${unsupportedLabel}s: ${formatSupportedChoices(choices, formatChoice)}`,
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

function parseHumanAmount(value: string, decimals: number): string {
  const amount = value.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(amount) || Number(amount) <= 0) {
    throw new CliError("--amount must be a positive number", ExitCode.InvalidArgs);
  }

  try {
    const parsed = parseUnits(amount, decimals);
    if (parsed <= 0n) {
      throw new CliError("--amount is smaller than the token's smallest unit", ExitCode.InvalidArgs);
    }
    return parsed.toString();
  } catch (_error) {
    if (_error instanceof CliError) {
      throw _error;
    }
    throw new CliError(
      `--amount has too many decimal places for a token with ${decimals} decimals`,
      ExitCode.InvalidArgs,
    );
  }
}

function validateIntentOptions(options: RawIntentOptions): IntentOptions {
  const validated = {
    fromChain: options.fromChain.trim(),
    toChain: options.toChain.trim(),
    fromToken: options.fromToken,
    toToken: options.toToken,
    amount: options.amount.trim(),
    type: options.type.trim(),
    fromChainName: options.fromChainName,
    toChainName: options.toChainName,
  };

  const missingOption = [
    ["fromChain", validated.fromChain],
    ["toChain", validated.toChain],
    ["amount", validated.amount],
    ["type", validated.type],
  ].find(([, value]) => !value)?.[0];
  if (missingOption) {
    throw new CliError(
      `Missing required option: --${missingOption.replace(/[A-Z]/g, "-$&").toLowerCase()}`,
      ExitCode.InvalidArgs,
    );
  }

  if (!INTENT_TYPES.includes(validated.type as IntentType)) {
    throw new CliError("--type must be either exact-input or exact-output", ExitCode.InvalidArgs);
  }

  const type = validated.type as IntentType;

  return {
    ...validated,
    amount: parseHumanAmount(
      validated.amount,
      type === "exact-input" ? options.fromToken.decimals : options.toToken.decimals,
    ),
    type,
    fromChainName: validated.fromChainName,
    toChainName: validated.toChainName,
  };
}

function buildIntentQuoteRequest(options: IntentOptions): IntentQuoteRequest {
  const user = getInteropAddress(INTENT_USER_ADDRESS, options.fromToken.chainId);
  const receiver = getInteropAddress(INTENT_USER_ADDRESS, options.toToken.chainId);
  const inputAsset = getInteropAddress(options.fromToken.address, options.fromToken.chainId);
  const outputAsset = getInteropAddress(options.toToken.address, options.toToken.chainId);

  return {
    user,
    intent: {
      intentType: "oif-swap",
      inputs: [
        {
          user,
          asset: inputAsset,
          amount: options.type === "exact-input" ? options.amount : null,
        },
      ],
      outputs: [
        {
          receiver,
          asset: outputAsset,
          amount: options.type === "exact-output" ? options.amount : null,
        },
      ],
      swapType: options.type,
    },
    supportedTypes: ["oif-escrow-v0"],
  };
}

export async function fetchIntentQuotes(options: IntentOptions): Promise<IntentQuote[]> {
  const request = buildIntentQuoteRequest(options);
  const { data } = await intentsApi.post<IntentQuoteResponse>("/quote/request", request);
  return Array.isArray(data.quotes) ? data.quotes : [];
}

function formatQuoteReview(quote: IntentQuote, options: IntentOptions): string {
  const input = quote.preview.inputs[0];
  const output = quote.preview.outputs[0];
  const inputAmount = formatAmount(input?.amount ?? options.amount, options.fromToken.decimals);
  const outputAmount = formatAmount(output?.amount ?? options.amount, options.toToken.decimals);

  return `You will pay ${inputAmount} ${options.fromToken.symbol} on ${
    options.fromChainName ?? options.fromChain
  } and receive ${outputAmount} ${options.toToken.symbol} on ${options.toChainName ?? options.toChain}.`;
}

async function getIntentType(type: string | undefined): Promise<IntentType> {
  return selectIfMissing(type, "--type", INTENT_TYPES, findIntentType, (intentType) => intentType, "type");
}

async function getIntentOptions(
  options: Partial<Record<keyof IntentCommandOptions, string>>,
  chains: SupportedIntentChain[],
  type: IntentType,
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

  const [fromTokens, toTokens] = await withSpinner("Fetching supported intent tokens...", () =>
    Promise.all([getTokens(fromChain.chainId), getTokens(toChain.chainId)]),
  );
  const fromToken = await selectIfMissing(
    options.fromToken,
    "--from-token",
    fromTokens,
    findSupportedToken,
    formatTokenOption,
    "token",
  );
  const toToken = await selectIfMissing(
    options.toToken,
    "--to-token",
    toTokens,
    findSupportedToken,
    formatTokenOption,
    "token",
  );

  return validateIntentOptions({
    fromChain: fromChain.chainId,
    toChain: toChain.chainId,
    fromToken,
    toToken,
    amount: await promptIfMissing(options.amount, "--amount"),
    type,
    fromChainName: fromChain.name,
    toChainName: toChain.name,
  });
}

export function registerIntentCommand(program: Command): void {
  program
    .command("intent")
    .description("Execute a LI.FI intent quote")
    .option("--from-chain <chain>", "Source chain name, or ID (e.g. ethereum, 1)")
    .option("--to-chain <chain>", "Destination chain name, or ID (e.g. base, 8453)")
    .option("--from-token <token>", "Token to send, as a symbol, name or address (e.g. USDC, 0xa0b8...)")
    .option("--to-token <token>", "Token to receive, as a symbol, name or address")
    .option("--amount <amount>", "Amount as a human-readable number (e.g. 1 for 1 USDC)")
    .addOption(new Option("--type <type>", "Intent quote type").choices(INTENT_TYPES))
    .addHelpText(
      "after",
      `
Examples:
  $ lifi intent --from-chain ethereum --to-chain base --from-token USDC --to-token USDC --amount 1 --type exact-input
  $ lifi intent --from-chain 1 --to-chain 8453 --from-token USDC --to-token USDC --amount 1 --type exact-output`,
    )
    .action(async (options) => {
      try {
        const type = await getIntentType(options.type);
        const chains = await withSpinner("Fetching supported intent chains...", () => fetchSupportedChains());
        const intentOptions = await getIntentOptions(options, chains, type);
        const quotes = await withSpinner("Fetching intent quotes...", () => fetchIntentQuotes(intentOptions));

        if (quotes.length === 0) {
          console.log("No intent quotes found for the selected tokens and amount.");
          console.log("Try a different token pair, amount or try again later.");
          return;
        }

        const quote = quotes[0];
        if (!quote) {
          console.log("No intent quotes found for the selected tokens and amount.");
          console.log("Try a different token pair, amount or try again later.");
          return;
        }

        console.log(formatQuoteReview(quote, intentOptions));
      } catch (error) {
        handleError(error);
      }
    });
}
