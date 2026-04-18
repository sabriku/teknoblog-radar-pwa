-- Replace YOUR_VERCEL_DOMAIN and YOUR_CRON_TOKEN before running.
-- Requires pg_net + pg_cron support in your Supabase project.

select cron.schedule(
  'teknoblog-radar-pipeline',
  '0 */4 * * *',
  $$
  select
    net.http_get(
      url := 'https://YOUR_VERCEL_DOMAIN/api/run-pipeline?token=YOUR_CRON_TOKEN'
    );
  $$
);
