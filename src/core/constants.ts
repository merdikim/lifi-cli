export const API_BASE_URL = "https://li.quest/v1";
export const EARN_API_BASE_URL = "https://earn.li.fi/v1";
export const INTENT_API_BASE_URL = "https://order.li.fi";
export const INTEGRATOR_ID = "lifi-cli";
export const AUTH_HEADER = "X-LiFi-Api-Key";
export const ENV_API_KEY = "LIFI_API_KEY";

export enum ExitCode {
  Success = 0,
  General = 1,
  InvalidArgs = 2,
  AuthError = 3,
  ApiError = 4,
  NetworkError = 5,
}
