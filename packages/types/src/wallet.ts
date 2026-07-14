export type WalletState = "creating" | "ready" | "locked" | "error";

export interface WalletConfig {
  network: "testnet" | "mainnet" | "local";
  horizonUrl: string;
  rpcUrl: string;
}

export interface WalletInstance {
  id: string;
  address: string;
  state: WalletState;
  createdAt: Date;
}
