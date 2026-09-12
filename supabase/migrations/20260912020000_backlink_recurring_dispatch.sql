-- Create disabled. Release may activate only after the exact runtime with the
-- authenticated backlinks engine is verified. No monitor is created or enabled.
-- Uses the existing private scheduler secret; never creates or reads it into app output.
DO $$
DECLARE backlink_job bigint;
BEGIN
 IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='backlink-monitoring') THEN
  RAISE EXCEPTION 'backlink_dispatch_already_exists';
 END IF;
 backlink_job:=cron.schedule('backlink-monitoring','*/5 * * * *',$cron$
  SELECT net.http_post(
   url := 'https://milogrowth.com/api/auto-scheduler/run?engine=backlinks',
   headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='auto_scheduler_secret')),
   body := '{}'::jsonb, timeout_milliseconds := 80000
  );
 $cron$);
 PERFORM cron.alter_job(backlink_job, active := false);
END $$;
