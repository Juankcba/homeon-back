.PHONY: help build up down restart logs status ps db-shell redis-shell backend-shell clean deploy pull

# ─── Colors ────────────────────────────────────────────────
CYAN  := \033[36m
GREEN := \033[32m
RESET := \033[0m

help: ## Show this help
	@echo ""
	@echo "$(CYAN)HomeOn$(RESET) - Smart Home Backend"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-18s$(RESET) %s\n", $$1, $$2}'
	@echo ""

# ─── Build & Run ───────────────────────────────────────────
build: ## Build all containers
	docker compose build

up: ## Start all services (detached)
	docker compose up -d

down: ## Stop all services
	docker compose down

restart: ## Restart all services
	docker compose restart

restart-backend: ## Restart only the backend
	docker compose restart backend

# ─── Logs ──────────────────────────────────────────────────
logs: ## Tail logs from all services
	docker compose logs -f --tail=100

logs-backend: ## Tail backend logs only
	docker compose logs -f --tail=100 backend

logs-db: ## Tail postgres logs
	docker compose logs -f --tail=50 postgres

# ─── Status ────────────────────────────────────────────────
status: ## Show service status
	docker compose ps

ps: status

health: ## Check health of all services
	@echo "$(CYAN)Backend:$(RESET)"
	@curl -sf http://localhost:3001/health 2>/dev/null && echo " ✓ OK" || echo " ✗ DOWN"
	@echo "$(CYAN)PostgreSQL:$(RESET)"
	@docker compose exec -T postgres pg_isready -U homeon 2>/dev/null && echo " ✓ OK" || echo " ✗ DOWN"
	@echo "$(CYAN)Redis:$(RESET)"
	@docker compose exec -T redis redis-cli ping 2>/dev/null || echo " ✗ DOWN"
	@echo "$(CYAN)Tunnel:$(RESET)"
	@docker compose ps cloudflared --format '{{.Status}}' 2>/dev/null || echo " ✗ DOWN"

# ─── Shell access ──────────────────────────────────────────
db-shell: ## Open psql shell
	docker compose exec postgres psql -U $${DB_USERNAME:-homeon} -d $${DB_DATABASE:-homeon}

redis-shell: ## Open redis-cli
	docker compose exec redis redis-cli

backend-shell: ## Open shell in backend container
	docker compose exec backend sh

# ─── Deploy (pull from GitHub + rebuild) ───────────────────
deploy: ## Pull latest code + rebuild + restart
	@echo "$(CYAN)Pulling latest code...$(RESET)"
	git pull origin main
	@echo "$(CYAN)Building backend...$(RESET)"
	docker compose build backend
	@echo "$(CYAN)Restarting backend...$(RESET)"
	docker compose up -d backend
	@echo "$(GREEN)Deploy complete!$(RESET)"

pull: ## Pull latest images (postgres, redis, cloudflared)
	docker compose pull postgres redis cloudflared

# ─── Maintenance ───────────────────────────────────────────
clean: ## Remove stopped containers and dangling images
	docker compose down --remove-orphans
	docker image prune -f

reset-db: ## ⚠️  Destroy and recreate database (data loss!)
	@echo "$(CYAN)WARNING: This will destroy all data!$(RESET)"
	@read -p "Are you sure? (y/N) " confirm && [ "$$confirm" = "y" ] || exit 1
	docker compose down -v
	docker compose up -d postgres
	@echo "$(GREEN)Database recreated. Run 'make up' to start all services.$(RESET)"

backup-db: ## Backup database to ./backups/
	@mkdir -p backups
	docker compose exec -T postgres pg_dump -U $${DB_USERNAME:-homeon} $${DB_DATABASE:-homeon} | gzip > backups/homeon-$$(date +%Y%m%d-%H%M%S).sql.gz
	@echo "$(GREEN)Backup saved to backups/$(RESET)"
