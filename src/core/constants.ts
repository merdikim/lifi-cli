export const API_BASE_URL = "https://li.quest/v1";
export const EARN_API_BASE_URL = "https://earn.li.fi/v1";
export const INTEGRATOR_ID = "lifi-cli";
export const AUTH_HEADER = "X-LiFi-Api-Key";
export const ENV_API_KEY = "LIFI_API_KEY";
export const COMPOSER_TOOL = "composer";
export const DEFAULT_CHAIN_RPC_URLS: Record<string, string> = {
  "1": "https://ethereum-rpc.publicnode.com",
  "10": "https://optimism-rpc.publicnode.com",
  "56": "https://bsc-rpc.publicnode.com",
  "100": "https://gnosis-rpc.publicnode.com",
  "137": "https://polygon-bor-rpc.publicnode.com",
  "250": "https://fantom-rpc.publicnode.com",
  "324": "https://zksync-era-rpc.publicnode.com",
  "1101": "https://polygon-zkevm-rpc.publicnode.com",
  "5000": "https://mantle-rpc.publicnode.com",
  "8453": "https://base-rpc.publicnode.com",
  "42161": "https://arbitrum-one-rpc.publicnode.com",
  "43114": "https://avalanche-c-chain-rpc.publicnode.com",
  "59144": "https://linea-rpc.publicnode.com",
  "81457": "https://blast-rpc.publicnode.com",
  "534352": "https://scroll-rpc.publicnode.com",
};

export enum ExitCode {
  Success = 0,
  General = 1,
  InvalidArgs = 2,
  AuthError = 3,
  ApiError = 4,
  NetworkError = 5,
}
