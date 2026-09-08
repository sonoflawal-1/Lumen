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
    this.serverUrl = opts.serverUrl.replace(/\/$/, "");
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

    if (!res.ok) {
      throw new Error(`Failed to create wallet on server: ${res.statusText}`);
    }

    const data = (await res.json()) as { id: string; address: string };
    const entry: ClientWalletEntry = {
      id: data.id,
      address: data.address,
    };

    this.wallets.set(data.id, entry);
    this.wallets.set(data.address, entry);

    return { address, id, userDevicePublicKey: userDevicePublicKey ?? address };
  }

  async getWallet(
    id: string
  ): Promise<{ id: string; address: string; createdAt?: string; policyId?: string }> {
    const res = await fetch(`${this.serverUrl}/wallet/${id}`);
    if (!res.ok) {
      throw new Error(`Wallet not found: ${id}`);
    }

    const data = (await res.json()) as {
      id: string;
      address: string;
      createdAt?: string;
      policyId?: string;
    };

    const entry: ClientWalletEntry = {
      id: data.id,
      address: data.address,
    };

    this.wallets.set(data.id, entry);
    this.wallets.set(data.address, entry);

    return data;
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
    let wallet = this.wallets.get(id);
    if (!wallet) {
      const fetched = await this.getWallet(id);
      wallet = { id: fetched.id, address: fetched.address };
    }

    const account = await this.client.horizon.loadAccount(wallet.address);

    if (!assetCode || assetCode === "XLM") {
      const balance = account.balances.find((b: any) => b.asset_type === "native");
      return balance?.balance ?? "0";
    }

    const network = this.client.config.network;
    const knownAsset = KNOWN_ASSETS[network]?.[assetCode];
    if (!knownAsset) {
      throw new Error(
        `Unknown asset: ${assetCode}. Known assets: ${Object.keys(KNOWN_ASSETS[network] ?? {}).join(", ")}`
      );
    }

    const balance = account.balances.find(
      (b: any) => b.asset_code === knownAsset.getCode() && b.asset_issuer === knownAsset.getIssuer()
    );
    return (balance as any)?.balance ?? "0";
  }

  async sendPayment(
    id: string,
    destination: string,
    assetCode: string,
    amount: string
  ): Promise<{ hash: string }> {
    let wallet = this.wallets.get(id);
    if (!wallet) {
      const fetched = await this.getWallet(id);
      wallet = { id: fetched.id, address: fetched.address };
    }

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

    const account = await this.client.horizon.loadAccount(wallet.address);

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.client.networkPassphrase,
    })
      .addOperation(
        Operation.payment({
          destination,
          asset,
          amount,
        })
      )
      .setTimeout(180)
      .build();

    if (wallet.keypair) {
      tx.sign(wallet.keypair);
    }

    // 1. Request co-signing from Lumen server
    const cosignRes = await fetch(`${this.serverUrl}/cosign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        xdr: tx.toXDR(),
        walletAddress: wallet.address,
      }),
    });

    if (!cosignRes.ok) {
      const err = await cosignRes.json().catch(() => ({ error: cosignRes.statusText }));
      throw new Error(`Co-signing failed: ${(err as any).error ?? cosignRes.statusText}`);
    }

    const cosignData = (await cosignRes.json()) as { signedXdr: string };

    // 2. Submit transaction via fee-sponsor on Lumen server
    const feeBumpRes = await fetch(`${this.serverUrl}/fee-bump/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        xdr: cosignData.signedXdr,
        walletAddress: wallet.address,
      }),
    });

    if (!feeBumpRes.ok) {
      const err = await feeBumpRes.json().catch(() => ({ error: feeBumpRes.statusText }));
      throw new Error(`Fee-bump submission failed: ${(err as any).error ?? feeBumpRes.statusText}`);
    }

    const feeBumpData = (await feeBumpRes.json()) as { hash: string };
    return { hash: feeBumpData.hash };
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

