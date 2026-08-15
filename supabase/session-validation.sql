-- Ties a submitted score to a game the server actually witnessed.
--
-- Before this, `time_played` was whatever the client claimed, so any check
-- built on it (the old rate check included) could be satisfied by simply
-- sending a larger number. The server now stamps both edges of the game on
-- its own clock and validates against that.

create table if not exists game_sessions (
  id         uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  ended_at   timestamptz,
  used_at    timestamptz
);

alter table game_sessions enable row level security;
-- No policies on purpose: the table is reachable only through the security
-- definer functions below, never directly with the anon key.

create index if not exists game_sessions_started_at_idx on game_sessions (started_at);


-- Called when a game starts. Hands back a ticket; the server privately
-- records when it was issued.
create or replace function start_game() returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into game_sessions default values returning id into v_id;
  return v_id;
end $$;


-- Called the moment the snake dies, before the game over overlay. Idempotent:
-- the first call wins, so a retry can't extend the game.
create or replace function end_game(p_session uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update game_sessions set ended_at = now()
   where id = p_session and ended_at is null;
end $$;


create or replace function submit_score(p_session uuid, p_payload jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_initials text;
  v_score int;
  v_level int;
  v_rats int;
  v_eggs int;
  v_pineapples int;
  v_time int;
  v_expected int;
  v_started timestamptz;
  v_ended timestamptz;
  v_used timestamptz;
  v_elapsed numeric;
  v_msg constant text := 'score not accepted: if you wanna do this your job is to do the work!';
begin
  v_initials   := p_payload->>'initials';
  v_score      := (p_payload->>'score')::int;
  v_level      := (p_payload->>'level')::int;
  v_rats       := (p_payload->>'rats')::int;
  v_eggs       := (p_payload->>'eggs')::int;
  v_pineapples := (p_payload->>'pineapples')::int;
  v_time       := (p_payload->>'time_played')::int;

  -- ---- the session must be one the server issued, ended, and never spent ----
  select started_at, ended_at, used_at
    into v_started, v_ended, v_used
    from game_sessions
   where id = p_session
     for update;

  if not found              then raise exception '%', v_msg; end if;
  if v_ended is null        then raise exception '%', v_msg; end if;
  if v_used  is not null    then raise exception '%', v_msg; end if;

  v_elapsed := extract(epoch from (v_ended - v_started));

  -- No real game runs an hour. Caps how much claimable time an abandoned or
  -- deliberately parked session can accumulate.
  if v_elapsed > 3600 then raise exception '%', v_msg; end if;

  -- You cannot have played longer than the game the server watched. The slack
  -- absorbs the start_game round trip, which lands after the browser's clock
  -- has already started. Pausing only ever moves time_played further below
  -- this ceiling, so it cannot cause a false rejection.
  if v_time > v_elapsed + 5 then raise exception '%', v_msg; end if;

  -- level = 1 + min(foodScore/3, survivalSeconds/12), so it is gated by
  -- elapsed time. This is what stops the quadratic level bonus from being
  -- inflated for free.
  --
  -- The slack is not optional. In every real run on record, level is limited
  -- by time rather than food and sits exactly on this boundary, with zero
  -- headroom, so without it a second of round trip jitter drops the floor by
  -- one and rejects an honest player. A full level of slack buys an attacker
  -- one extra level and costs an honest player nothing, which is the right
  -- side of that trade to be wrong on.
  if v_level > 1 + floor((v_elapsed + 12) / 12) then raise exception '%', v_msg; end if;

  -- Cumulative food rate. Genuine games run 4.1 to 8.1 seconds per item, so
  -- one item per second leaves roughly 4x headroom over the fastest real run
  -- while still catching board-sized item counts. Calibrated on six games:
  -- widen it before tightening it if anyone legitimate ever trips.
  --
  -- Deliberately cumulative rather than instantaneous: a fire tier purge
  -- banks a whole board at once, six times a run, which would spike any
  -- per-moment measure.
  if v_rats + v_eggs + v_pineapples > v_elapsed + 5 then
    raise exception '%', v_msg;
  end if;

  -- ---- structural limits ----
  -- The snake grows one cell per food eaten and the board is 24x24.
  -- Pineapples count too: they are worth 10 points each and were previously
  -- left out of this cap entirely.
  if 3 + v_rats + v_eggs + v_pineapples > 576 then
    raise exception '%', v_msg;
  end if;

  -- Encircling needs snake.length >= 8, i.e. five rats/eggs eaten first, and
  -- head eating a pineapple needs rainbow tier at 2000 points. Either way a
  -- pineapple cannot be the first thing you score.
  if v_pineapples > 0 and v_rats + v_eggs < 5 then
    raise exception '%', v_msg;
  end if;

  -- ---- the score must be exactly what those counts produce ----
  v_expected := v_rats + v_eggs * 3 + v_pineapples * 10 + v_level * (v_level + 1) - 2;
  if v_score <> v_expected then
    raise exception '%', v_msg;
  end if;

  insert into scores (initials, score, payload)
  values (v_initials, v_score, p_payload)
  returning id into v_id;

  update game_sessions set used_at = now() where id = p_session;

  return v_id;
end $$;


-- The old single argument version would otherwise still be callable and would
-- bypass every check above.
drop function if exists submit_score(jsonb);

grant execute on function start_game()             to anon, authenticated;
grant execute on function end_game(uuid)           to anon, authenticated;
grant execute on function submit_score(uuid,jsonb) to anon, authenticated;
