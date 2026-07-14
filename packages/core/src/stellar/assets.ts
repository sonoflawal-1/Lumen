import { Asset } from "@stellar/stellar-sdk";

export const KNOWN_ASSETS: Record<string, Record<string, Asset>> = {
  testnet: {
    USDC: new Asset("USDC", "GA5ZSEJYB37JDD5G4LYXCI7B7LUHTA7J2WYFJ65THFZQ77EU7VTV4GRQ"),
    BTC: new Asset("BTC", "GBL2MXJGQYVPMXQ5GV537VZPILQKJMZNSNDA2SJSVY54G3E4GJX5M32E"),
    ETH: new Asset("ETH", "GBFXOVIJ7TXGFVAY2S3L5DCZZAOVD5RB6G7G4BS2W5G72S3ZB5GMJ4RY"),
    NGNT: new Asset("NGNT", "GAWODAROMJ33V5Y5YB7GK4G6BAPDA5ZL3ABDPXIZEP3WNUYTDHBDZVW4"),
  },
  mainnet: {
    USDC: new Asset("USDC", "GA5ZSEJYB37JDD5G4LYXCI7B7LUHTA7J2WYFJ65THFZQ77EU7VTV4GRQ"),
  },
};

export function getAsset(code: string, issuer: string): Asset {
  return new Asset(code, issuer);
}

export function getNativeAsset(): Asset {
  return Asset.native();
}
