# Local Development Environment Guide

This document describes how to set up, manage, and debug the local Stellar standalone network used by Lumen services and test suites.

## Docker Setup

Lumen relies on the `stellar/quickstart:testing` container running in standalone/local mode with Stellar RPC enabled.

### Port Mappings

| Port | Service | Purpose |
| --- | --- | --- |
| `8000` | Horizon API & Stellar RPC | Primary HTTP/RPC interface for account creation, balance checks, transaction submission |
| `8080` | Stellar Core HTTP | Admin & debugging endpoint for checking core status and ledger metrics |
| `6000` | Stellar Core Peer | Peer-to-peer (P2P) networking port |

### Container Management

Start the local Stellar container using `docker compose`:

```bash
pnpm dev:stellar
# or
make dev-stellar
# or
docker compose -f docker/docker-compose.yml up -d
```

View live logs:

```bash
pnpm dev:stellar:logs
# or
make dev-stellar-logs
```

Stop and clean up container resources:

```bash
pnpm dev:stellar:down
# or
make dev-stellar-down
```

### Apple Silicon / Multi-Platform Support

The `docker/docker-compose.yml` file explicitly specifies `platform: linux/amd64` to ensure smooth emulation and startup on Apple Silicon (M1/M2/M3) Macs as well as Linux and Windows.

### Integration Tests

To run the integration test suite against a fresh local Stellar environment:

```bash
pnpm test:integration
```
