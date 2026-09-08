.PHONY: dev-stellar dev-stellar-down dev-stellar-logs test-integration

dev-stellar:
	docker compose -f docker/docker-compose.yml up -d

dev-stellar-down:
	docker compose -f docker/docker-compose.yml down

dev-stellar-logs:
	docker compose -f docker/docker-compose.yml logs -f

test-integration:
	docker compose -f docker/docker-compose.yml up -d
	pnpm test
