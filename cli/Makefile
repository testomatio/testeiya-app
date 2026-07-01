.PHONY: build run stop clean clean-context

build:
	docker build -t testeiya .

run:
	@if [ ! -f .env ]; then \
		echo "Error: .env file not found. Copy from .env.example:"; \
		echo "  cp .env.example .env"; \
		echo "Then edit .env with your API keys."; \
		exit 1; \
	fi
	docker run -it --rm \
		--env-file .env \
		-v $(PWD)/.testeiya-context:/app/.testeiya-context \
		-v $(PWD)/src:/app/src \
		-u $(shell id -u):$(shell id -g) \
		testeiya bun src/cli.ts

stop:
	docker stop $$(docker ps -q --filter ancestor=testeiya) 2>/dev/null || true

clean:
	docker stop $$(docker ps -q --filter ancestor=testeiya) 2>/dev/null || true
	docker rm $$(docker ps -aq --filter ancestor=testeiya) 2>/dev/null || true

clean-context:
	rm -rf .testeiya-context/*