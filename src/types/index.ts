import type { Address, Hex } from "viem";

export interface GlobalOptions {
  json?: boolean;
  verbose?: boolean;
  noColor?: boolean;
}

// --- Chain types ---

export interface NativeToken {
  address: string;
  chainId: number;
  symbol: string;
  decimals: number;
  name: string;
  coinKey?: string;
  logoURI?: string;
  priceUSD?: string;
}

export interface Chain {
  id: number;
  key: string;
  name: string;
  chainType: ChainType;
  coin: string;
  mainnet: boolean;
  logoURI?: string;
  nativeToken: NativeToken;
  metamask?: {
    chainId: string;
    blockExplorerUrls: string[];
    chainName: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    rpcUrls: string[];
  };
  diamondAddress?: string;
}

export type ChainType = "EVM" | "SVM";

// --- Token types ---

export interface Token {
  address: string;
  chainId: number;
  symbol: string;
  decimals: number;
  name: string;
  coinKey?: string;
  logoURI?: string;
  priceUSD?: string;
  marketCapUSD?: number;
  volumeUSD24H?: number;
  tags?: string[];
  verificationStatus?: string;
}

export interface TokensResponse {
  tokens: Record<string, Token[]>;
}

// --- Intent types ---

export type IntentType = "exact-input" | "exact-output";

export interface SupportedIntentChain {
  id: number;
  chainId: string;
  chainType: string;
  name: string;
  rpcUrls: string[];
}

export interface IntentOptions {
  fromChain: string;
  toChain: string;
  fromToken: Token;
  toToken: Token;
  amount: string;
  type: IntentType;
  rpcUrl?: string | undefined;
  fromChainName?: string | undefined;
  toChainName?: string | undefined;
}

export interface IntentCommandOptions {
  fromChain: string;
  toChain: string;
  fromToken: string;
  toToken: string;
  amount: string;
  type: string;
  rpcUrl?: string | undefined;
  fromChainName?: string | undefined;
  toChainName?: string | undefined;
}

export interface UnvalidatedIntentOptions extends Omit<IntentOptions, "type"> {
  type: string;
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
  order: unknown | null;
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

export interface IntentOrderStatusResponse {
  meta?: {
    orderStatus?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export type StandardEscrowOrder = {
  user: Address;
  nonce: bigint;
  originChainId: bigint;
  expires: number;
  fillDeadline: number;
  inputOracle: Address;
  inputs: Array<[bigint, bigint]>;
  outputs: Array<{
    oracle: Hex;
    settler: Hex;
    chainId: bigint;
    token: Hex;
    amount: bigint;
    recipient: Hex;
    call: Hex;
    context: Hex;
  }>;
};

// --- Quote types ---

export interface QuoteEstimate {
  toAmount: string;
  toAmountMin?: string;
  toAmountDecimals?: number;
  fromAmountUSD?: string;
  toAmountUSD?: string;
  executionDuration?: number;
  gasCosts?: Array<{ amount?: string; amountUSD?: string; token?: { symbol: string } }>;
  feeCosts?: Array<{ name?: string; amountUSD?: string; percentage?: string }>;
}

export interface QuoteAction {
  fromToken?: Token;
  toToken?: Token;
  fromAmount?: string;
  slippage?: number;
  fromChainId?: number;
  toChainId?: number;
}

export interface QuoteResponse {
  tool: string;
  toolDetails?: { key: string; name: string; logoURI?: string };
  action?: QuoteAction;
  estimate?: QuoteEstimate;
  transactionRequest?: Record<string, unknown>;
  includedSteps?: Step[];
}

// --- Route types ---

export interface Step {
  type: string;
  tool: string;
  toolDetails?: { key: string; name: string };
}

export interface Route {
  steps: Step[];
  toAmountUSD?: string;
  gasCostUSD?: string;
  toAmount?: string;
}

export interface RoutesResponse {
  routes: Route[];
}

// --- Route order ---

export type RouteOrder = "CHEAPEST" | "FASTEST" | "SAFEST" | "RECOMMENDED";

// --- Status types ---

export type TransferStatus = "PENDING" | "DONE" | "FAILED" | "CANCELLED" | "NOT_FOUND" | "INVALID" | "UNKNOWN";

export const TERMINAL_STATUSES: ReadonlySet<TransferStatus> = new Set<TransferStatus>([
  "DONE",
  "FAILED",
  "CANCELLED",
  "NOT_FOUND",
  "INVALID",
]);

export interface StatusResponse {
  status: TransferStatus;
  substatus?: string;
  tool?: string;
  sending?: Record<string, unknown>;
  receiving?: Record<string, unknown>;
}

// --- Connection types ---

export interface Connection {
  fromChainId: number;
  toChainId: number;
  fromToken?: Token;
  toToken?: Token;
  fromTokens?: Token[];
  toTokens?: Token[];
}

export interface ConnectionsResponse {
  connections: Connection[];
}

// --- Tools types ---

export interface Bridge {
  key: string;
  name: string;
  logoURI?: string;
  supportedChains?: Array<{ fromChainId: number; toChainId: number }>;
}

export interface Exchange {
  key: string;
  name: string;
  logoURI?: string;
  supportedChains?: number[];
}

export interface ToolsResponse {
  bridges: Bridge[];
  exchanges: Exchange[];
}

// --- Gas types ---

export interface GasPrices {
  [chainId: string]: {
    standard: number;
    fast: number;
    fastest: number;
    lastUpdate?: number;
  };
}

export interface GasSuggestion {
  recommended: {
    token: NativeToken;
    amount: string;
    amountUsd: string;
  };
  limit?: {
    token: NativeToken;
    amount: string;
    amountUsd: string;
  };
  available: boolean;
  fromAmount?: string;
}

// --- Earn types ---

export interface EarnProtocol {
  id?: string;
  key?: string;
  name: string;
  logoUri?: string;
  url?: string;
}

export interface EarnAsset {
  address?: string;
  symbol?: string;
  decimals?: number;
  weight?: number;
  name?: string;
  priceUsd?: string | number;
}

export interface EarnVaultCaps {
  totalCap?: string;
  maxCap?: string;
}

export interface EarnVaultPack {
  name: string;
  stepsType: string;
}

export interface EarnVault {
  address?: string;
  network?: string;
  chainId?: number;
  slug?: string;
  name?: string;
  description?: string;
  protocol?: EarnProtocol;
  underlyingTokens?: EarnAsset[];
  rewardTokens?: EarnAsset[];
  tags?: string[];
  analytics?: {
    apy?: {
      total?: number | null;
      base?: number | null;
      reward?: number | null;
    };
    apy1d?: number;
    apy7d?: number;
    apy30d?: number;
    tvl?: {
      usd?: string;
      native?: string;
    };
    updatedAt?: string;
  };
  verificationStatus?: string;
  verificationStatusBreakdown?: [
    {
      result?: string;
      reason?: string;
    },
  ];
  isTransactional?: boolean;
  isRedeemable?: boolean;
  depositPacks?: EarnVaultPack[];
  redeemPacks?: EarnVaultPack[];
  syncedAt?: string;
}

export interface EarnVaultsResponse {
  data: EarnVault[];
  nextCursor?: string;
  total?: number;
}

export interface EarnChain {
  name: string;
  chainId: number;
  networkCaip?: string;
}

export interface EarnPosition {
  chainId?: number;
  protocolName?: string | null;
  address?: string | null;
  asset?: EarnAsset;
  balanceNative?: string;
  balanceUsd?: string | number;
}

export interface EarnPositionsResponse {
  positions: EarnPosition[];
}

// --- Balance / allowance result shapes ---
// Field names mirror the LI.FI MCP server's tool result schema so JSON output is drop-in compatible.

export interface NativeBalanceResult {
  address: string;
  balance: string;
  tokenSymbol: string;
  chainId: number;
  decimals: number;
}

export interface TokenBalanceResult {
  walletAddress: string;
  tokenAddress: string;
  balance: string;
  tokenSymbol: string;
  decimals: number;
  chainId: number;
}

export interface AllowanceResult {
  tokenAddress: string;
  ownerAddress: string;
  spenderAddress: string;
  allowance: string;
  tokenSymbol: string;
  decimals: number;
  chainId: number;
}
