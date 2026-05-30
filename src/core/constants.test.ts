import { describe, expect, it } from "vitest";
import { API_BASE_URL, AUTH_HEADER, EARN_API_BASE_URL, ENV_API_KEY, ExitCode, INTEGRATOR_ID } from "./constants.js";

describe("constants", () => {
  it("API_BASE_URL points to li.quest v1", () => {
    expect(API_BASE_URL).toBe("https://li.quest/v1");
  });

  it("EARN_API_BASE_URL points to LI.FI Earn v1", () => {
    expect(EARN_API_BASE_URL).toBe("https://earn.li.fi/v1");
  });

  it("INTEGRATOR_ID is lifi-cli", () => {
    expect(INTEGRATOR_ID).toBe("lifi-cli");
  });

  it("AUTH_HEADER is X-LiFi-Api-Key", () => {
    expect(AUTH_HEADER).toBe("X-LiFi-Api-Key");
  });

  it("ENV_API_KEY is LIFI_API_KEY", () => {
    expect(ENV_API_KEY).toBe("LIFI_API_KEY");
  });

  describe("ExitCode", () => {
    it("Success is 0", () => {
      expect(ExitCode.Success).toBe(0);
    });

    it("General is 1", () => {
      expect(ExitCode.General).toBe(1);
    });

    it("InvalidArgs is 2", () => {
      expect(ExitCode.InvalidArgs).toBe(2);
    });

    it("AuthError is 3", () => {
      expect(ExitCode.AuthError).toBe(3);
    });

    it("ApiError is 4", () => {
      expect(ExitCode.ApiError).toBe(4);
    });

    it("NetworkError is 5", () => {
      expect(ExitCode.NetworkError).toBe(5);
    });
  });
});
