import { Horizon, rpc as sorobanRpc, Networks } from "@stellar/stellar-sdk";
import type { StellarConfig, StellarNetwork } from "@lumen/types";

type HorizonServer = InstanceType<typeof Horizon.Server>;
type RpcServer = InstanceType<typeof sorobanRpc.Server>;

const NETWORKS: Record<StellarNetwork, StellarConfig> = {
  testnet: {
    network: "testnet",
    horizonUrl: "https://horizon-testnet.stellar.org",
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: Networks.TESTNET,
  },
  mainnet: {
    network: "mainnet",
    horizonUrl: "https://horizon.stellar.org",
    rpcUrl: "https://soroban-mainnet.stellar.org",
    networkPassphrase: Networks.PUBLIC,
  },
  local: {
    network: "local",
    horizonUrl: "http://localhost:8000",
    rpcUrl: "http://localhost:8000",
    networkPassphrase: Networks.STANDALONE,
  },
};

export interface StellarClientOpts {
  network?: StellarNetwork;
  horizonUrl?: string;
  rpcUrl?: string;
}

export class StellarClient {
  readonly config: StellarConfig;
  readonly horizon: HorizonServer;
  readonly rpc: RpcServer;

  constructor(opts: StellarClientOpts = {}) {
    const network = opts.network ?? "testnet";
    const defaults = NETWORKS[network];

    this.config = {
      ...defaults,
      horizonUrl: opts.horizonUrl ?? defaults.horizonUrl,
      rpcUrl: opts.rpcUrl ?? defaults.rpcUrl,
    };

    this.horizon = new Horizon.Server(this.config.horizonUrl);
    this.rpc = new sorobanRpc.Server(this.config.rpcUrl, { allowHttp: this.config.network === "local" });
  }

  get networkPassphrase(): string {
    return this.config.networkPassphrase;
  }
}
