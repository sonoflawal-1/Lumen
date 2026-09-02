# Lumen

Seedless, gasless Stellar wallets — the user never holds a key or pays a fee.

License: MIT · Network: Stellar · Runtime: TypeScript + Node

Seedless onboarding · gasless UX · 2-of-2 multisig · policy-controlled wallets · fee-bump sponsorship

Lumen is a wallet SDK for building non-custodial Stellar wallets where the user never manages secret keys and never pays transaction fees. The server sponsors all accounts and fees, co-signs every transaction after a policy check, and enforces configurable rules (spend limits, velocity, allowlists) — all without holding user funds.

See it in action

```ts
import { LumenClient } from "@lumen/web-sdk";

const client = new LumenClient({
  network: "testnet",
  sponsorSecret: process.env.FEE_PAYER_SECRET!,
  serverPublicKey: process.env.COSIGNER_PUBLIC_KEY!,
});

// Create a wallet — sponsor pays the XLM reserve
const { address, id } = await client.createWallet();

// Send a payment — fee-bumped, user never needs XLM for gas
const { hash } = await client.sendPayment(id, "GDEST...PUBKEY", "XLM", "10");
```

How it works

A user creates a wallet → the server sponsors the account and sets up 2-of-2 multisig → the user signs with their device key → the server co-signs after a policy check → the transaction is fee-bumped so the user never holds XLM.

Layer | Backed by | What it is
-- | -- | --
Identity | Stellar | 2-of-2 multisig account with co-signer
Fees | Stellar (fee-bumps) | Server wraps all txs; user pays zero gas
Policy | @lumen/server | Spend limits, velocity, allowlists enforced before co-signing
Key management | @lumen/core | Keypair generation, storage, derivation (OAuth, passphrase)
SDK | @lumen/web-sdk | Browser client: createWallet, getBalance, sendPayment
API | Express | /cosign, /fee-bump, /wallet/create, /policy

Why it's different

Most wallet SDKs require users to manage seed phrases and hold tokens for gas. Lumen makes both invisible.

|  | Traditional wallet | Lumen
-- | -- | --
Onboarding | User must back up seed phrase | Seedless — server manages keys
Gas | User holds XLM for fees | Gasless — server fee-bumps all txs
Security | Single key controls funds | 2-of-2 multisig — server co-signs
Policy | None or off-chain | On-chain spend limits, velocity, allowlists
Control | Who holds the seed | Who holds the co-signer key

Quickstart

Prereqs: Node.js 18+, pnpm, Docker (for local Stellar network).

```bash
# Install
pnpm install

# Start local Stellar network
docker run --rm -p 8000:8000 stellar/quickstart:testing --local --enable-stellar-rpc

# Build all packages
pnpm build

# Run tests
pnpm test
```

Environment

Copy `.env.example` to `.env` and fill in:

```
COSIGNER_SECRET=S...        # Server co-signer key
FEE_PAYER_SECRET=S...       # Fee sponsor key
STELLAR_NETWORK=testnet
```

Packages

- **@lumen/core** — StellarClient, createSponsoredAccount, setupMultisig, buildFeeBump, pathPayment, KeyManager, Wallet
- **@lumen/server** — CosignerService, FeeSponsorService, PolicyEngine, Express API
- **@lumen/web-sdk** — LumenClient: createWallet, getBalance, sendPayment
- **@lumen/types** — Shared TypeScript interfaces

License

MIT
