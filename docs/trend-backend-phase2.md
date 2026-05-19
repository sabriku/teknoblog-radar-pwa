# Trend backend Faz 2 kurulumu

Bu faz, mevcut RSS radarının üstüne gerçek trend veri katmanı eklemek için hazırlandı.

## Eklenen dosyalar

- `supabase/trend_phase2.sql`
- `api/trends-ingest.js`
- `api/trend-clusters.js`
- `api/trend-overview.js`

## 1. Supabase şemasını uygula

Supabase SQL Editor içinde `supabase/trend_phase2.sql` dosyasını çalıştır.

Bu işlem şu tabloları açar:

- `trend_signals`
- `trend_clusters`
- `trend_news_links`
- `competitor_mentions`

## 2. Environment değişkeni ekle

Sunucuda `.env` içine `TREND_FEED_URLS` adlı JSON dizi eklenmeli.

Örnek:

```env
TREND_FEED_URLS=[
  {"name":"Google Trends TR","url":"BURAYA_TREND_FEED_URL","source_type":"google_trends","market_scope":"turkey","country_code":"TR","time_window":"24h","base_score":62,"limit":25},
  {"name":"Google Trends Global","url":"BURAYA_GLOBAL_TREND_FEED_URL","source_type":"google_trends","market_scope":"global","time_window":"24h","base_score":58,"limit":25}
]
```

Not:
- Buradaki feed URL değerleri deploy ortamında tanımlanmalı.
- Endpoint, feed URL tanımlı değilse hata vermez, bilgi mesajı döner.

## 3. Sunucu route ekle

Özel `server.mjs` kullanıldığı için routeMap içine şu yollar eklenmeli:

```js
'/api/trends-ingest': './api/trends-ingest.js',
'/api/trend-clusters': './api/trend-clusters.js',
'/api/trend-overview': './api/trend-overview.js'
```

## 4. Cron akışı

Önerilen sıra:

1. `/api/trends-ingest?token=CRON_TOKEN`
2. `/api/trend-clusters?token=CRON_TOKEN`

Örnek manuel test:

```bash
curl "http://127.0.0.1:3000/api/trends-ingest?token=CRON_TOKEN"
curl "http://127.0.0.1:3000/api/trend-clusters?token=CRON_TOKEN"
curl "http://127.0.0.1:3000/api/trend-overview?limit=20"
```

## 5. Bu faz şu an ne yapıyor?

- Config ile verilen trend feed’lerini çekiyor
- sinyalleri `trend_signals` tablosuna yazıyor
- sinyalleri kümeliyor
- mevcut `topic_candidates` kayıtlarıyla eşleştiriyor
- sonucu `trend_clusters` ve `trend_news_links` tablolarına yazıyor

## 6. Sonraki adım

Bu veriyi frontend’de doğrudan `trend-overview` endpoint’inden okuyup mevcut trend panelini gerçek backend verisiyle beslemek.
