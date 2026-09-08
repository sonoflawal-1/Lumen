# @lumen/web-sdk

Browser SDK for the Lumen wallet platform. Provides a simple client for creating seedless, gasless Stellar wallets and sending payments — no XLM or private sponsor keys required in the browser.

> [!SECURITY NOTE]
> **No Secret Keys in Browser**: The browser client NEVER takes or exposes `sponsorSecret` (private key `S...`). All wallet creation, co-signing, and fee-bumping operations communicate securely with the Lumen server via `serverUrl`. Backend workers needing direct reserve sponsorship use `ServerWorkerClient`.

## Installation

```bash
pnpm add @lumen/web-sdk
```

## Quick start

The example below shows the full lifecycle: initialise the client with `serverUrl`, create a wallet, check its balance, and send a payment.

```ts
import { LumenClient } from "@lumen/web-sdk";

// 1. Initialise the client using your Lumen server URL
const client = new LumenClient({
  network: "testnet",           // "testnet" | "mainnet" | "local"
  serverUrl: "https://api.lumen.example.com",
});

// 2. Create a new wallet
//    Returns the primary wallet UUID id and the Stellar address.
const { address, id } = await client.createWallet();
console.log("Wallet created:", address, "ID:", id);

// 3. Rehydrate or retrieve wallet info from server
const wallet = await client.getWallet(id);
console.log("Rehydrated wallet:", wallet.address);

// 4. Check the XLM balance
const balance = await client.getBalance(id);
console.log("Balance:", balance, "XLM");

// 5. Send a payment
//    The payment transaction is signed by the client, co-signed by the server policy engine,
//    and submitted via fee-bump so the end user pays no gas fees.
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
| `serverUrl` | `string` | Yes | Endpoint of the deployed Lumen server |
| `network` | `"testnet" \| "mainnet" \| "local"` | No | Defaults to `"testnet"` |
| `horizonUrl` | `string` | No | Override the Horizon REST endpoint |
| `rpcUrl` | `string` | No | Override the Soroban RPC endpoint |
| `serverPublicKey` | `string` | No | Public key of the server co-signer |

### `client.createWallet() → Promise<{ address: string; id: string }>`

Requests the Lumen server to generate a new account and setup 2-of-2 multisig. Returns the primary UUID `id` and `address`.

### `client.getWallet(id) → Promise<{ id: string; address: string; createdAt?: string; policyId?: string }>`

Fetches and rehydrates wallet details from the server by UUID `id`.

### `client.getBalance(id, assetCode?) → Promise<string>`

Returns the balance of the given asset as a decimal string (e.g. `"42.5000000"`). Defaults to native XLM when `assetCode` is omitted.

### `client.sendPayment(id, destination, assetCode, amount) → Promise<{ hash: string }>`

Builds and submits a payment operation. Transaction is co-signed and fee-bumped through the server.

---

### Backend Workers: `ServerWorkerClient`

For backend server processes that sponsor account reserves directly using a `sponsorSecret`:

```ts
import { ServerWorkerClient } from "@lumen/web-sdk";

const worker = new ServerWorkerClient({
  network: "testnet",
  sponsorSecret: process.env.FEE_PAYER_SECRET!,
  serverPublicKey: process.env.COSIGNER_PUBLIC_KEY!,
});

const { address } = await worker.createSponsoredWallet();
```

## License

MIT
