create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.unschedule(jobid)
from cron.job
where jobname = 'radar-pipeline-30min';

select
  cron.schedule(
    'radar-pipeline-30min',
    '*/30 * * * *',
    $$
    select
      net.http_post(
        url := 'https://teknoblogcom-radar-pwa.vercel.app/api/run-pipeline?token=BURAYA_CRON_TOKEN_YAZ',
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := '{"source":"supabase-cron"}'::jsonb
      ) as request_id;
    $$
  );

select jobid, jobname, schedule, active
from cron.job
where jobname = 'radar-pipeline-30min';
