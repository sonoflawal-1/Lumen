import { Keypair } from "@stellar/stellar-sdk";
import { StellarClient, Wallet } from "@lumen/core";
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
    return wallet.getBalance();
  }

  async sendPayment(
    id: string,
    destination: string,
    assetCode: string,
    amount: string
  ): Promise<{ hash: string }> {
    const wallet = this.wallets.get(id);
    if (!wallet) throw new Error(`Wallet not found: ${id}`);

    const { Asset } = await import("@stellar/stellar-sdk");
    const asset = assetCode === "XLM" ? Asset.native() : Asset.native();

    return wallet.send(destination, asset, amount);
  }
}
