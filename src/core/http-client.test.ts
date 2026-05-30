import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExitCode } from "./constants.js";
import { CliError } from "./errors.js";

/** Axios interceptor managers expose a `handlers` array at runtime, but the type is not exported. */
interface InterceptorAccess<T = unknown> {
  handlers: Array<{
    fulfilled: (value: T) => T;
    rejected?: (error: unknown) => unknown;
  }>;
}

// Mock config before importing http-client
vi.mock("./config.js", () => ({
  getApiKey: vi.fn(),
}));

import { getApiKey } from "./config.js";
import { createApiClient } from "./http-client.js";

const mockedGetApiKey = vi.mocked(getApiKey);

describe("http-client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetApiKey.mockReturnValue(undefined);
  });

  describe("createApiClient", () => {
    it("creates client with correct base URL", () => {
      const client = createApiClient();
      expect(client.defaults.baseURL).toBe("https://li.quest/v1");
    });

    it("injects API key header when key is available", async () => {
      mockedGetApiKey.mockReturnValue("test-api-key");
      const client = createApiClient();

      // Access the request interceptor by making a config pass through it
      const interceptors = client.interceptors.request as unknown as InterceptorAccess;
      const handlers = interceptors.handlers;
      expect(handlers.length).toBeGreaterThan(0);

      // Simulate passing a config through the interceptor
      const handler = handlers[0];
      const config = { headers: {} as Record<string, string>, params: {} as Record<string, string> };
      const result = handler.fulfilled(config);
      expect(result.headers["X-LiFi-Api-Key"]).toBe("test-api-key");
    });

    it("does not inject API key header when no key available", async () => {
      mockedGetApiKey.mockReturnValue(undefined);
      const client = createApiClient();

      const interceptors = client.interceptors.request as unknown as InterceptorAccess;
      const handler = interceptors.handlers[0];
      const config = { headers: {} as Record<string, string>, params: {} as Record<string, string> };
      const result = handler.fulfilled(config);
      expect(result.headers["X-LiFi-Api-Key"]).toBeUndefined();
    });

    it("injects integrator param", async () => {
      const client = createApiClient();

      const interceptors = client.interceptors.request as unknown as InterceptorAccess;
      const handler = interceptors.handlers[0];
      const config = { headers: {} as Record<string, string>, params: {} as Record<string, string> };
      const result = handler.fulfilled(config);
      expect(result.params.integrator).toBe("lifi-cli");
    });

    it("creates Earn client with the correct base URL", async () => {
      const client = createApiClient("https://earn.li.fi/v1");
      expect(client.defaults.baseURL).toBe("https://earn.li.fi/v1");
    });
  });

  describe("mapResponseError", () => {
    it("maps 401 to CliError with AuthError exit code", async () => {
      const client = createApiClient();
      const interceptors = client.interceptors.response as unknown as InterceptorAccess;
      const errorHandler = interceptors.handlers[0].rejected;

      const axiosError = {
        isAxiosError: true,
        response: { status: 401, data: { message: "Invalid API key" } },
      };

      try {
        await errorHandler(axiosError);
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).exitCode).toBe(ExitCode.AuthError);
      }
    });

    it("maps 500 to CliError with ApiError exit code", async () => {
      const client = createApiClient();
      const interceptors = client.interceptors.response as unknown as InterceptorAccess;
      const errorHandler = interceptors.handlers[0].rejected;

      const axiosError = {
        isAxiosError: true,
        response: { status: 500, data: { message: "Internal error" } },
      };

      try {
        await errorHandler(axiosError);
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).exitCode).toBe(ExitCode.ApiError);
      }
    });

    it("maps network error to CliError with NetworkError exit code", async () => {
      const client = createApiClient();
      const interceptors = client.interceptors.response as unknown as InterceptorAccess;
      const errorHandler = interceptors.handlers[0].rejected;

      const axiosError = {
        isAxiosError: true,
        response: undefined,
        code: "ECONNREFUSED",
        message: "connect ECONNREFUSED",
      };

      try {
        await errorHandler(axiosError);
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).exitCode).toBe(ExitCode.NetworkError);
      }
    });
  });
});
