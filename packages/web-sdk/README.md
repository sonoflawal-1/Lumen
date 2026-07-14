# @lumen/web-sdk

Browser SDK for the Lumen wallet platform. Provides a simple client for creating seedless, gasless Stellar wallets and sending payments — no XLM required by the end user.

## Installation

```bash
pnpm add @lumen/web-sdk
```

## Quick start

The example below shows the full lifecycle: initialise the client, create a wallet, check its balance, and send a payment.

```ts
import { LumenClient } from "@lumen/web-sdk";

// 1. Initialise the client
//    sponsorSecret  — the server-side key that pays account reserves and fees
//    serverPublicKey — the co-signer public key used to set up 2-of-2 multisig
const client = new LumenClient({
  network: "testnet",           // "testnet" | "mainnet" | "local"
  sponsorSecret: process.env.FEE_PAYER_SECRET!,
  serverPublicKey: process.env.COSIGNER_PUBLIC_KEY!,
});

// 2. Create a new wallet
//    The sponsor pays the Stellar minimum reserve so the user never needs XLM.
//    Returns the wallet's Stellar address and an opaque id used for subsequent calls.
const { address, id } = await client.createWallet();
console.log("Wallet created:", address);

// 3. Check the XLM balance
const balance = await client.getBalance(id);
console.log("Balance:", balance, "XLM");

// 4. Send a payment
//    The transaction is fee-bumped by the sponsor, so the sender pays no gas.
const { hash } = await client.sendPayment(
  id,
  "GDEST...PUBKEY",   // destination Stellar address
  "XLM",             // asset code
  "10"               // amount as a string
);
console.log("Payment submitted, tx hash:", hash);
```

## API

### `new LumenClient(opts)`

| Option | Type | Required | Description |
|---|---|---|---|
| `network` | `"testnet" \| "mainnet" \| "local"` | No | Defaults to `"testnet"` |
| `horizonUrl` | `string` | No | Override the Horizon REST endpoint |
| `rpcUrl` | `string` | No | Override the Soroban RPC endpoint |
| `sponsorSecret` | `string` | Yes | Secret key of the fee-sponsor account |
| `serverPublicKey` | `string` | Yes | Public key of the server co-signer |

### `client.createWallet() → Promise<{ address: string; id: string }>`

Generates a new keypair, sponsors the on-chain account creation, and sets up 2-of-2 multisig with the server co-signer. Returns the wallet's public address and an `id` used to reference it in subsequent calls.

### `client.getBalance(id, assetCode?) → Promise<string>`

Returns the balance of the given asset as a decimal string (e.g. `"42.5000000"`). Defaults to native XLM when `assetCode` is omitted.

### `client.sendPayment(id, destination, assetCode, amount) → Promise<{ hash: string }>`

Builds and submits a payment operation. The transaction is signed by the device key and co-signed by the server after a policy check. Returns the ledger transaction hash.

### `client.getWallet(id) → Wallet | undefined`

Returns the underlying `@lumen/core` `Wallet` instance for advanced use cases.

## Environment variables

```
FEE_PAYER_SECRET=S...       # Secret key of the Stellar account that pays fees and reserves
COSIGNER_PUBLIC_KEY=G...    # Public key of the server co-signer
STELLAR_NETWORK=testnet
```

See `.env.example` at the repo root for the full list.

## How it works

1. `createWallet` — the sponsor account pays the minimum XLM reserve for the new account, then configures 2-of-2 multisig so every transaction also requires a server signature.
2. `sendPayment` — the SDK builds a payment transaction and signs it with the user's device key. The server co-signer verifies it against the policy engine before adding its own signature.
3. Gasless — all transactions are wrapped in a fee-bump so the user's wallet never needs to hold XLM for fees.

## License

MIT
