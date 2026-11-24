import { defineChain } from "viem";

/** X Layer mainnet: TapeOut contracts live here. Rails Desk only reads from it. */
export const xLayer = defineChain({
  id: 196,
  name: "X Layer",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.xlayer.tech", "https://xlayerrpc.okx.com"] } },
  blockExplorers: { default: { name: "OKX Explorer", url: "https://web3.okx.com/explorer/x-layer" } },
});

/** X Layer testnet: prefer the confirmed working official OKX RPC for browser and server reads. */
export const xLayerTestnet = defineChain({
  id: 1952,
  name: "X Layer Testnet",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: { default: { http: ["https://xlayertestrpc.okx.com/terigon", "https://testrpc.xlayer.tech/terigon"] } },
  blockExplorers: { default: { name: "OKX Explorer", url: "https://web3.okx.com/explorer/x-layer-testnet" } },
  testnet: true,
});

export const XLAYER_FAUCET_URL = "https://web3.okx.com/xlayer/faucet";
export const txUrl = (chain: typeof xLayer | typeof xLayerTestnet, hash: string) => `${chain.blockExplorers.default.url}/tx/${hash}`;
export const addressUrl = (chain: typeof xLayer | typeof xLayerTestnet, address: string) => `${chain.blockExplorers.default.url}/address/${address}`;
