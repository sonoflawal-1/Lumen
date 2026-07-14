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
- `PolicyEngine` — configurable rules (spend limits, velocity, allowlists)
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

## License

MIT
