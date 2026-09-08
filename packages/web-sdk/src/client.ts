import { Keypair, Asset } from "@stellar/stellar-sdk";
import { StellarClient, Wallet, KNOWN_ASSETS } from "@lumen/core";
import type { StellarNetwork, WalletRecord } from "@lumen/types";

export interface LumenClientOpts {
  network?: StellarNetwork;
  horizonUrl?: string;
  rpcUrl?: string;
  serverUrl?: string;
  apiKey?: string;
  sponsorSecret: string;
  serverPublicKey: string;
}

export class LumenClient {
  private client: StellarClient;
  private sponsorKeypair: Keypair;
  private serverPublicKey: string;
  private serverUrl: string;
  private apiKey?: string;
  private wallets: Map<string, Wallet> = new Map();

  constructor(opts: LumenClientOpts) {
    this.client = new StellarClient({
      network: opts.network,
      horizonUrl: opts.horizonUrl,
      rpcUrl: opts.rpcUrl,
    });
    this.sponsorKeypair = Keypair.fromSecret(opts.sponsorSecret);
    this.serverPublicKey = opts.serverPublicKey;
    this.serverUrl = opts.serverUrl ?? "http://localhost:3000";
    this.apiKey = opts.apiKey;
  }

  async createWallet(userDevicePublicKey?: string): Promise<{ address: string; id: string; userDevicePublicKey?: string }> {
    const wallet = new Wallet({
      client: this.client,
      sponsorKeypair: this.sponsorKeypair,
      serverPublicKey: this.serverPublicKey,
    });

    const { address } = await wallet.create();
    const id = address;

    this.wallets.set(id, wallet);

    return { address, id, userDevicePublicKey: userDevicePublicKey ?? address };
  }

  getWallet(id: string): Wallet | undefined {
    return this.wallets.get(id);
  }

  listWallets(): Wallet[] {
    return Array.from(this.wallets.values());
  }

  disposeWallet(id: string): void {
    const wallet = this.wallets.get(id);
    if (wallet) {
      wallet.dispose();
      this.wallets.delete(id);
    }
  }

  dispose(): void {
    for (const wallet of this.wallets.values()) {
      wallet.dispose();
    }
    this.wallets.clear();
  }

  close(): void {
    this.dispose();
  }

  async recoverWallets(serverUrl?: string, apiKey?: string): Promise<WalletRecord[]> {
    const baseUrl = serverUrl ?? this.serverUrl;
    const key = apiKey ?? this.apiKey;
    const headers: Record<string, string> = {};
    if (key) {
      headers["x-api-key"] = key;
    }

    const res = await fetch(`${baseUrl}/wallets`, { headers });
    if (!res.ok) {
      throw new Error(`Failed to recover wallets from server: ${res.statusText}`);
    }

    const data = (await res.json()) as { items: WalletRecord[] };
    const recovered: WalletRecord[] = data.items || [];

    for (const record of recovered) {
      if (!this.wallets.has(record.id) && !this.wallets.has(record.address)) {
        const wallet = new Wallet({
          client: this.client,
          sponsorKeypair: this.sponsorKeypair,
          serverPublicKey: this.serverPublicKey,
        });
        // Associate address
        (wallet as any)._address = record.address;
        this.wallets.set(record.id, wallet);
        this.wallets.set(record.address, wallet);
      }
    }

    return recovered;
  }

  async lookupByAddress(address: string, serverUrl?: string, apiKey?: string): Promise<WalletRecord | undefined> {
    const baseUrl = serverUrl ?? this.serverUrl;
    const key = apiKey ?? this.apiKey;
    const headers: Record<string, string> = {};
    if (key) {
      headers["x-api-key"] = key;
    }

    const res = await fetch(`${baseUrl}/wallets/${address}`, { headers });
    if (res.status === 404) {
      return undefined;
    }
    if (!res.ok) {
      throw new Error(`Failed to lookup wallet by address: ${res.statusText}`);
    }

    return (await res.json()) as WalletRecord;
  }

  async getBalance(id: string, assetCode?: string): Promise<string> {
    const wallet = this.wallets.get(id);
    if (!wallet) throw new Error(`Wallet not found: ${id}`);

    if (!assetCode || assetCode === "XLM") {
      return wallet.getBalance();
    }

    const network = this.client.config.network;
    const knownAsset = KNOWN_ASSETS[network]?.[assetCode];
    if (!knownAsset) {
      throw new Error(
        `Unknown asset: ${assetCode}. Known assets: ${Object.keys(KNOWN_ASSETS[network] ?? {}).join(", ")}`
      );
    }

    return wallet.getBalance(knownAsset);
  }

  async sendPayment(
    id: string,
    destination: string,
    assetCode: string,
    amount: string
  ): Promise<{ hash: string }> {
    const wallet = this.wallets.get(id);
    if (!wallet) throw new Error(`Wallet not found: ${id}`);

    let asset: Asset;
    if (assetCode === "XLM") {
      asset = Asset.native();
    } else {
      const network = this.client.config.network;
      const knownAsset = KNOWN_ASSETS[network]?.[assetCode];
      if (!knownAsset) {
        throw new Error(
          `Unknown asset: ${assetCode}. Known assets: ${Object.keys(KNOWN_ASSETS[network] ?? {}).join(", ")}`
        );
      }
      asset = knownAsset;
    }

    return wallet.send(destination, asset, amount);
  }
}

export function setupGlobalErrorHandler(client: LumenClient): () => void {
  const handleUncaught = () => {
    client.dispose();
  };

  if (typeof window !== "undefined") {
    const origOnError = window.onerror;
    window.onerror = (event, source, lineno, colno, error) => {
      client.dispose();
      if (origOnError) return origOnError(event, source, lineno, colno, error);
      return false;
    };
  } else if (typeof process !== "undefined") {
    process.on("uncaughtException", handleUncaught);
  }

  return () => {
    if (typeof process !== "undefined") {
      process.off("uncaughtException", handleUncaught);
    }
  };
}

