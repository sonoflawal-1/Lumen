import { Keypair, Asset, TransactionBuilder, Operation, BASE_FEE } from "@stellar/stellar-sdk";
import { StellarClient, KNOWN_ASSETS } from "@lumen/core";
import type { StellarNetwork } from "@lumen/types";

export interface LumenClientOpts {
  network?: StellarNetwork;
  horizonUrl?: string;
  rpcUrl?: string;
  serverUrl: string;
  serverPublicKey?: string;
}

export interface ClientWalletEntry {
  id: string;
  address: string;
  keypair?: Keypair;
}

export class LumenClient {
  private client: StellarClient;
  private serverUrl: string;
  private serverPublicKey?: string;
  private wallets: Map<string, ClientWalletEntry> = new Map();

  constructor(opts: LumenClientOpts) {
    this.client = new StellarClient({
      network: opts.network,
      horizonUrl: opts.horizonUrl,
      rpcUrl: opts.rpcUrl,
    });
    this.serverUrl = opts.serverUrl.replace(/\/$/, "");
    this.serverPublicKey = opts.serverPublicKey;
  }

  async createWallet(): Promise<{ address: string; id: string }> {
    const res = await fetch(`${this.serverUrl}/wallet/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

    return { address: data.address, id: data.id };
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
