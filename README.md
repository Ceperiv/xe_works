# App Ads Scraper Prototype

Production-oriented prototype сервісу для збору `app-ads.txt` з акцентом на:

- horizontal scaling;
- BullMQ queues + workers;
- scheduler batching без full-table loading;
- Redis distributed locks / rate limiting;
- idempotent enqueue + DB upserts;
- retry / backoff / dead-letter semantics;
- мінімальний REST API для ручного запуску jobs.

## Project Structure

```text
src/
  api.module.ts
  worker.module.ts
  scheduler.module.ts
  core.module.ts
  main.ts
  common/
    config/
    errors/
    http/
    logging/
    metrics/
    rate-limit/
  database/entities/
  modules/
    applications/
    ads-txt/
    marketplace/
    queue/
    scheduler/
    health/
    seed/
mock-publisher/
test/
Dockerfile
docker-compose.yml
```

## Architecture Decisions

1. Один codebase / image, але три runtime roles: `api`, `worker`, `scheduler`.
2. `scheduler` працює батчами через keyset-like pagination по `id` + `next*CheckAt`.
3. `worker` обробляє дві незалежні queue:
   - `marketplace-discovery`
   - `ads-txt-fetch`
4. Job idempotency забезпечується через:
   - deterministic BullMQ `jobId`;
   - unique constraint `(applicationId, type)` у `scraping_jobs`;
   - upsert замість insert-only.
5. HTTP reliability та rate limiting винесені в окремі reusable сервіси.
6. `Redis` використовується для:
   - distributed scheduler lock;
   - global concurrency coordination;
   - per-domain limiting.

## Run

```bash
docker compose up --build
```

## API

```bash
GET  /health
GET  /applications/:id
POST /applications/:id/scrape
POST /applications/:id/marketplace-refresh
```

## Demo Flow

1. `SeedService` створює 20 applications.
2. `SchedulerService` знаходить due rows батчами.
3. `IdempotentJobService` додає jobs у BullMQ queues.
4. `MarketplaceProcessor` оновлює metadata та publisher domain.
5. `AdsTxtProcessor` забирає `https://{domain}/app-ads.txt` і для demo `*.local` fallback-иться на `http`.
6. Результат та metadata зберігаються в PostgreSQL.

## Scaling

- `api x N`: stateless REST layer.
- `scheduler x N`: тільки один instance виконує scan завдяки Redis lock.
- `worker x N`: BullMQ розподіляє jobs між instances.
- correctness не залежить від in-memory state.

## Tests

Покрито:

- domain normalization;
- `app-ads.txt` URL generation;
- content hash / change detection;
- HTTP error classification;
- retry logic;
- deterministic idempotent job creation;
- marketplace providers;
- scheduler batching.

## Production TODO

- перейти з `synchronize: true` на SQL migrations;
- додати окремий dead-letter queue та replay tooling;
- додати Prometheus endpoint / OpenTelemetry traces;
- винести marketplace adapters на реальні scraper/API clients;
- додати richer HTTP redirect tracking, ETag/Last-Modified, gzip handling;
- додати partitioning / archival strategy для великих `scraping_jobs` та historical `app_ads_txt`;
- додати admin endpoints / dashboards для queue depth, failures, retry pressure;
- додати stronger domain validation через PSL / punycode handling;
- додати secrets management та CI pipeline.
