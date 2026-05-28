import { encodeAddress, type InteroperableAddressText } from "@wonderland/interop-addresses";

type InteropChainType = InteroperableAddressText["chainType"];

export function getInteropAddress(
  address: string,
  chainReference: number | string,
  chainType: InteropChainType = "eip155",
): string {
  return encodeAddress({
    version: 1,
    chainType,
    chainReference: String(chainReference),
    address,
  }) as string;
}
