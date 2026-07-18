# Kurulum Rehberi

## Yerel PostgreSQL

Uygulama yalnızca sunucudaki yerel PostgreSQL'i kullanır. Bağlantı adresi şu kaynaklardan ilk geçerli olanından okunur:

1. `RADAR_DATABASE_URL`
2. `/var/www/teknoblog-radar/.database_url`
3. `/root/radar_database_url.txt`
4. `DATABASE_URL`

Yalnızca `127.0.0.1`, `localhost` veya `::1` hedefleri kabul edilir. Başlangıçta `sql/local_postgres.sql` idempotent olarak uygulanır ve `sql/local_seed.sql` eksik kaynakları ekler.

## Environment variables

- `RADAR_DATABASE_URL`
- `CRON_TOKEN`
- `SLACK_KAYNAK_WEBHOOK_URL`

## Canlı test

```bash
RADAR_BASE_URL=http://127.0.0.1:3000 node --import dotenv/config scripts/smoke-local.mjs
```

Ingest ve score kontrollerini de çalıştırmak için:

```bash
RADAR_BASE_URL=http://127.0.0.1:3000 RADAR_SMOKE_MUTATIONS=1 node --import dotenv/config scripts/smoke-local.mjs
```

GitHub Actions deploy işi bu testi otomatik çalıştırır.
