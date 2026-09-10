-- The existing monthly job remains on the existing authenticated endpoint.
-- Explicit engine selection shares the same database coordinator/lease; weekly
-- dispatch never runs monthly generation or monthly summary emails.
-- Create DISABLED: the previous deployed route ignores the engine selector.
-- Release activates only after exact new runtime verification.
DO $$
DECLARE weekly_job bigint;
BEGIN
  IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='weekly-preparation') THEN
    RAISE EXCEPTION 'weekly_dispatch_already_exists';
  END IF;
  weekly_job := cron.schedule('weekly-preparation','*/5 * * * *',$cron$
    SELECT net.http_post(
      url := 'https://milogrowth.com/api/auto-scheduler/run?engine=weekly',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='auto_scheduler_secret')),
      body := '{}'::jsonb, timeout_milliseconds := 290000
    );
  $cron$);
  PERFORM cron.alter_job(weekly_job, active := false);
END $$;
