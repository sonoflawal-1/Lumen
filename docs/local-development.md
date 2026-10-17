# Local Development Environment Guide

This document describes how to set up, manage, and debug the local Stellar standalone network used by Lumen services and test suites.

## Docker Setup

Lumen relies on the `stellar/quickstart:testing` container running in standalone/local mode with Stellar RPC enabled. The container is defined in `docker/docker-compose.yml`, which uses named volumes so the local network state persists across container restarts.

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
# or
docker compose -f docker/docker-compose.yml logs -f
```

Stop and clean up container resources:

```bash
pnpm dev:stellar:down
# or
make dev-stellar-down
# or
docker compose -f docker/docker-compose.yml down
```

Because the compose file uses named volumes, stopping the container with `down` (without `-v`) preserves the local network state. To wipe the network and start fresh, remove the volumes:

```bash
docker compose -f docker/docker-compose.yml down -v
```

### Apple Silicon / Multi-Platform Support

The `docker/docker-compose.yml` file explicitly specifies `platform: linux/amd64` to ensure smooth emulation and startup on Apple Silicon (M1/M2/M3) Macs as well as Linux and Windows. Running the raw `docker run` form without `--platform linux/amd64` will fail to start the Stellar image on Apple Silicon, which is one of the reasons the compose file is the recommended path.

### Integration Tests

The integration test suite uses `docker/docker-compose.yml` as a fixture, bringing up a fresh local Stellar environment before running the tests. To run the integration suite against the compose fixture:

```bash
pnpm integration
```

This starts the compose stack, waits for Horizon/RPC on port `8000` to become healthy, runs the integration tests, and then tears the stack down.