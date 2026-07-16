# Lumen

Stellar-native wallet SDK replicating Okto's core value prop: seedless onboarding, gasless UX, chain-abstracted intents, and policy-controlled wallets.

## Architecture

```
@lumen/web-sdk     → Browser SDK entry point
@lumen/core        → Stellar primitives (accounts, multisig, fees, swaps)
@lumen/server      → Co-signer, fee-sponsor, policy engine
@lumen/types       → Shared TypeScript interfaces
```

## Quick Start

```bash
# Install
pnpm install

# Local Stellar network
docker run --rm -p 8000:8000 stellar/quickstart:testing --local --enable-stellar-rpc

# Build all packages
pnpm build

# Run tests
cd packages/core && pnpm test
cd packages/server && pnpm test
```

## Packages

### @lumen/core
- `StellarClient` — Horizon + Soroban RPC wrapper
- `createSponsoredAccount()` — sponsor pays reserves for new accounts
- `setupMultisig()` — add co-signer, set 2-of-2 threshold
- `buildFeeBump()` — wrap transactions so users never hold XLM for gas
- `pathPayment()` — same-ledger asset conversion via Stellar DEX
- `KeyManager` — generate, store, load keypairs
- `Wallet` — full wallet abstraction (create, balance, send)

### @lumen/server
- `CosignerService` — co-signs transactions after policy check
- `FeeSponsorService` — fee-bump wrapper service
- `PolicyEngine` — configurable rules (spend limits, velocity, allowlists) — see [Policy Configuration Guide](docs/policy-configuration.md) for specs and payload examples
- Express API: `/cosign`, `/fee-bump`, `/wallet/create`, `/policy`

### @lumen/web-sdk
- `LumenClient` — `createWallet()`, `getBalance()`, `sendPayment()`

## Environment

Copy `.env.example` to `.env` and fill in:

```
COSIGNER_SECRET=S...        # Server co-signer key
FEE_PAYER_SECRET=S...       # Fee sponsor key
STELLAR_NETWORK=testnet
```

## How It Works

1. **User creates wallet** → server sponsors account + reserves, sets up 2-of-2 multisig
2. **User sends payment** → builds tx, signs with device key, server co-signs after policy check
3. **Gasless** → server wraps all txs in fee-bumps, user never holds XLM
4. **Policy engine** → spend limits, velocity checks, allowlists enforced before co-signing

## Usage

The snippet below shows the end-to-end flow using `@lumen/web-sdk`. Run the server first (`cd packages/server && pnpm dev`) so the co-signer and fee-sponsor endpoints are available.

```ts
import { LumenClient } from "@lumen/web-sdk";

// Initialise — sponsorSecret and serverPublicKey come from your server environment
const client = new LumenClient({
  network: "testnet",
  sponsorSecret: process.env.FEE_PAYER_SECRET!,
  serverPublicKey: process.env.COSIGNER_PUBLIC_KEY!,
});

// Create a gasless, seedless wallet (sponsor pays the XLM reserve)
const { address, id } = await client.createWallet();
console.log("Wallet address:", address);

// Check balance
const balance = await client.getBalance(id);
console.log("Balance:", balance, "XLM");

// Send a payment (fee-bumped — user never needs XLM for gas)
const { hash } = await client.sendPayment(
  id,
  "GDEST...PUBKEY", // destination Stellar address
  "XLM",
  "10"
);
console.log("Payment submitted:", hash);
```

See [`packages/web-sdk/README.md`](./packages/web-sdk/README.md) for the full API reference.

## License

MIT
