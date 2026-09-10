-- The existing monthly job remains on the existing authenticated endpoint.
-- Explicit engine selection shares the same database coordinator/lease; weekly
-- dispatch never runs monthly generation or monthly summary emails.
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='weekly-preparation') THEN
    RAISE EXCEPTION 'weekly_dispatch_already_exists';
  END IF;
  PERFORM cron.schedule('weekly-preparation','*/5 * * * *',$cron$
    SELECT net.http_post(
      url := 'https://milogrowth.com/api/auto-scheduler/run?engine=weekly',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='auto_scheduler_secret')),
      body := '{}'::jsonb, timeout_milliseconds := 290000
    );
  $cron$);
END $$;
