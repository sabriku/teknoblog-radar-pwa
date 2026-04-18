create extension if not exists pg_cron;

select cron.schedule(
  'cleanup_old_teknoblog_radar_data',
  '17 3 * * *',
  $$select cleanup_old_data();$$
);
