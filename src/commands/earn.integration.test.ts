import axios from "axios";
import { beforeAll, describe, expect, it } from "vitest";

const EARN_API_BASE = "https://earn.li.fi/v1";
const PARAMS = { integrator: "lifi-cli" };

const shouldRun = process.env["INTEGRATION"] === "1";

describe.skipIf(!shouldRun)("earn — integration (live API)", () => {
  let chains: Array<Record<string, unknown>>;
  let protocols: Array<Record<string, unknown>>;
  let vaults: Array<Record<string, unknown>>;

  beforeAll(async () => {
    const [chainsResponse, protocolsResponse, vaultsResponse] = await Promise.all([
      axios.get(`${EARN_API_BASE}/chains`, { params: PARAMS }),
      axios.get(`${EARN_API_BASE}/protocols`, { params: PARAMS }),
      axios.get(`${EARN_API_BASE}/vaults`, {
        params: { ...PARAMS, limit: 10, sortBy: "apy" },
      }),
    ]);

    chains = chainsResponse.data;
    protocols = protocolsResponse.data;
    vaults = vaultsResponse.data.data;
  });

  it("returns supported Earn chains", () => {
    expect(Array.isArray(chains)).toBe(true);
    expect(chains.length).toBeGreaterThan(0);

    for (const chain of chains) {
      expect(typeof chain["chainId"]).toBe("number");
      expect(typeof chain["name"]).toBe("string");
    }
  });

  it("returns supported Earn protocols", () => {
    expect(Array.isArray(protocols)).toBe(true);
    expect(protocols.length).toBeGreaterThan(0);

    for (const protocol of protocols) {
      expect(typeof protocol["name"]).toBe("string");
      expect((protocol["name"] as string).length).toBeGreaterThan(0);
    }
  });

  it("returns Earn vaults with required display fields", () => {
    expect(Array.isArray(vaults)).toBe(true);
    expect(vaults.length).toBeGreaterThan(0);

    for (const vault of vaults) {
      expect(typeof vault["chainId"]).toBe("number");
      expect(typeof vault["protocol"]).toBe("object");
      expect(vault["name"] || vault["slug"]).toBeTruthy();
    }
  });

  it("returns one Earn vault by chain ID and address", async () => {
    const vault = vaults.find((item) => typeof item["chainId"] === "number" && typeof item["address"] === "string");

    expect(vault).toBeDefined();

    const { data } = await axios.get(`${EARN_API_BASE}/vaults/${vault?.["chainId"]}/${vault?.["address"]}`, {
      params: PARAMS,
    });

    expect(data.chainId).toBe(vault?.["chainId"]);
    expect(data.address).toBe(vault?.["address"]);
    expect(data.name || data.slug).toBeTruthy();
  });
});
