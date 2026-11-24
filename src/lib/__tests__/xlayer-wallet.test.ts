import { describe, expect, it } from "vitest";
import { parseOkxSessionAddress } from "../xlayer-wallet";

describe("OKX Connect session parsing", () => {
  it("extracts the X Layer testnet account from an EIP-155 session", () => {
    expect(parseOkxSessionAddress({
      namespaces: { eip155: { accounts: ["eip155:1952:0x1acb089eeb15dada38878fdace6b33d5de82bb16"] } },
    })).toBe("0x1acb089eeb15dada38878fdace6b33d5de82bb16");
  });

  it("rejects sessions that do not include X Layer testnet", () => {
    expect(() => parseOkxSessionAddress({
      namespaces: { eip155: { accounts: ["eip155:1:0x1acb089eeb15dada38878fdace6b33d5de82bb16"] } },
    })).toThrow(/X Layer testnet account/);
  });
});
