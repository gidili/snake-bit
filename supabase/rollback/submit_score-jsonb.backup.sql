-- Rollback copy of the pre-session-validation submit_score(jsonb).
-- Captured from production 2026-08-29 via pg_get_functiondef, before the
-- session-validation migration. Re-run this file verbatim to restore the
-- old behaviour; then also re-grant execute if it was dropped:
--   grant execute on function submit_score(jsonb) to anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_score(p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$declare
      v_id uuid;
      v_initials text;
      v_score int;
      v_level int;
      v_rats int;
      v_eggs int;
      v_pineapples int;
      v_expected int;
      v_msg constant text := 'score not accepted: if you wanna be a smarty pants your job is to do the work!';
    begin
      v_initials := p_payload->>'initials';
      v_score := (p_payload->>'score')::int;
      v_level := (p_payload->>'level')::int;
      v_rats := (p_payload->>'rats')::int;
      v_eggs := (p_payload->>'eggs')::int;
      v_pineapples := (p_payload->>'pineapples')::int;

      if 3 + v_rats + v_eggs > 576 then
        raise exception '%', v_msg;
      end if;

      v_expected := v_rats + v_eggs * 3 + v_pineapples * 10 + v_level * (v_level + 1) - 2;
      if v_score <> v_expected then
        raise exception '%', v_msg;
      end if;

      insert into scores (initials, score, payload)
      values (v_initials, v_score, p_payload)
      returning id into v_id;
      return v_id;
    end;$function$
