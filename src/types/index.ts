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

// --- Quote types ---

export interface QuoteEstimate {
  toAmount: string;
  toAmountMin?: string;
  toAmountDecimals?: number;
  approvalAddress?: string;
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

export interface QuoteParams {
  fromChain: string;
  toChain: string;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  fromAddress: string;
  toAddress?: string;
  slippage: string;
  order?: RouteOrder;
  allowBridges?: string;
  denyBridges?: string;
  allowExchanges?: string;
  denyExchanges?: string;
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
  logoUri: string;
  url: string;
}

export interface EarnAsset {
  address?: string;
  symbol: string;
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
  id?: string;
  address?: string;
  chainId: number;
  network?: string;
  slug?: string;
  name?: string;
  description?: string;
  protocol?: EarnProtocol;
  asset?: EarnAsset;
  underlyingTokens?: EarnAsset[];
  lpTokens?: EarnAsset[];
  rewardTokens?: EarnAsset[];
  tags: string[];
  analytics?: {
    apy?: {
      total?: number | null;
      base?: number | null;
      reward?: number | null;
    };
    apy1d?: number;
    apy7d?: number;
    apy30d: number;
    tvl?: {
      usd?: string | number;
      native?: string;
    };
    updatedAt: string;
  };
  apy?: number;
  tvlUsd?: number;
  tvlUSD?: number;
  isTransactional?: boolean;
  isRedeemable?: boolean;
  isComposerSupported?: boolean;
  caps?: EarnVaultCaps;
  timeLock?: number;
  kyc?: boolean;
  syncedAt?: string;
  depositPacks?: EarnVaultPack[];
  redeemPacks?: EarnVaultPack[];
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
