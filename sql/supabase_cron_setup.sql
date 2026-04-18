-- YOUR-VERCEL-DOMAIN ve YOUR_CRON_TOKEN alanlarını değiştirin
select cron.schedule(
  'teknoblog-radar-every-4-hours',
  '0 */4 * * *',
  $$
  select net.http_get(
    url := 'https://YOUR-VERCEL-DOMAIN/api/run-pipeline?token=YOUR_CRON_TOKEN'
  );
  $$
);
