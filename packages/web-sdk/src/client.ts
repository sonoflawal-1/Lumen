import { Keypair, Asset } from "@stellar/stellar-sdk";
import { StellarClient, Wallet, KNOWN_ASSETS } from "@lumen/core";
import type { StellarNetwork } from "@lumen/types";

export interface LumenClientOpts {
  network?: StellarNetwork;
  horizonUrl?: string;
  rpcUrl?: string;
  sponsorSecret: string;
  serverPublicKey: string;
}

export class LumenClient {
  private client: StellarClient;
  private sponsorKeypair: Keypair;
  private serverPublicKey: string;
  private wallets: Map<string, Wallet> = new Map();

  constructor(opts: LumenClientOpts) {
    this.client = new StellarClient({
      network: opts.network,
      horizonUrl: opts.horizonUrl,
      rpcUrl: opts.rpcUrl,
    });
    this.sponsorKeypair = Keypair.fromSecret(opts.sponsorSecret);
    this.serverPublicKey = opts.serverPublicKey;
  }

  async createWallet(): Promise<{ address: string; id: string }> {
    const wallet = new Wallet({
      client: this.client,
      sponsorKeypair: this.sponsorKeypair,
      serverPublicKey: this.serverPublicKey,
    });

    const { address } = await wallet.create();
    const id = address;

    this.wallets.set(id, wallet);

    return { address, id };
  }

  getWallet(id: string): Wallet | undefined {
    return this.wallets.get(id);
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
