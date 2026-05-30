import type { AxiosInstance, InternalAxiosRequestConfig } from "axios";
import axios from "axios";
import { getApiKey } from "./config.js";
import { API_BASE_URL, AUTH_HEADER, EARN_API_BASE_URL, INTEGRATOR_ID } from "./constants.js";
import { mapAxiosError } from "./errors.js";

// Singleton — each CLI invocation runs one command in one process, so shared
// state is fine. Tests mock via vi.mock('./http-client.js') which replaces the
// entire module, avoiding cross-test pollution.
export function createApiClient(baseURL = API_BASE_URL): AxiosInstance {
  const client = axios.create({
    baseURL,
    timeout: 30_000,
  });

  client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const apiKey = getApiKey();
    if (apiKey) {
      config.headers[AUTH_HEADER] = apiKey;
    }

    config.params = config.params || {};
    config.params.integrator = INTEGRATOR_ID;

    return config;
  });

  client.interceptors.response.use(
    (response) => response,
    (error) => {
      throw mapAxiosError(error);
    },
  );

  return client;
}

export const api = createApiClient();
export const earnApi = createApiClient(EARN_API_BASE_URL);
