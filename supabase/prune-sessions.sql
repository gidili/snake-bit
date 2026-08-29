-- Keeps game_sessions from growing without bound.
--
-- reset() calls beginSession() on both page load (game.js) and play-again,
-- so every page load leaves behind a session that will never be redeemed:
-- ended_at stays null, which is the first thing submit_score rejects on.
-- Harmless individually, unbounded in aggregate.
--
-- Applied to production 2026-08-29. Re-running is safe: cron.schedule()
-- replaces a job of the same name rather than creating a second one.

create extension if not exists pg_cron;

select cron.schedule(
  'prune-orphan-game-sessions',
  '17 3 * * *',   -- daily, UTC (pg_cron schedules are always UTC)
  $$delete from game_sessions
     where used_at is null
       and started_at < now() - interval '7 days'$$
);

-- Seven days, not one: the filter also catches finished-but-unsubmitted
-- games, and a player who dies and submits later still needs their session
-- to exist. A week puts that beyond reach.
--
-- Used sessions are deliberately kept. They are the only record of when the
-- server saw a given game start and end, i.e. the audit trail for the score
-- it produced. Cap them separately if they ever need capping.

-- Inspect:   select jobname, schedule, active from cron.job;
--            select jobid, status, return_message, start_time
--              from cron.job_run_details order by start_time desc limit 5;
-- Remove:    select cron.unschedule('prune-orphan-game-sessions');
