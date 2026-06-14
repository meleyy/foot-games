-- Apply ELO stats when draft expires into forfeit result

create or replace function public.finalize_online_draft(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.online_matches%rowtype;
  v_a_assignments jsonb;
  v_b_assignments jsonb;
  v_a_formation text;
  v_b_formation text;
  v_a_ready boolean := false;
  v_b_ready boolean := false;
  v_result jsonb;
begin
  select *
  into v_match
  from public.online_matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'match introuvable';
  end if;

  if v_match.status <> 'draft' then
    return jsonb_build_object(
      'status', v_match.status,
      'match_id', v_match.id,
      'result', v_match.result
    );
  end if;

  if v_match.draft_ends_at > now() then
    return jsonb_build_object(
      'status', 'draft',
      'match_id', v_match.id,
      'expired', false
    );
  end if;

  v_a_formation := coalesce(
    v_match.player_a_formation,
    v_match.player_a_draft_state ->> 'formationId',
    '4-3-3'
  );
  v_b_formation := coalesce(
    v_match.player_b_formation,
    v_match.player_b_draft_state ->> 'formationId',
    '4-3-3'
  );

  v_a_assignments := coalesce(
    v_match.player_a_assignments,
    v_match.player_a_draft_state -> 'assignments'
  );
  v_b_assignments := coalesce(
    v_match.player_b_assignments,
    v_match.player_b_draft_state -> 'assignments'
  );

  if v_match.player_a_submitted_at is not null then
    v_a_ready := public.is_valid_draft_assignments(v_a_formation, v_match.player_a_assignments);
  elsif public.is_valid_draft_assignments(v_a_formation, v_a_assignments) then
    update public.online_matches
    set player_a_formation = v_a_formation,
        player_a_assignments = v_a_assignments,
        player_a_submitted_at = coalesce(player_a_submitted_at, now())
    where id = p_match_id
    returning * into v_match;
    v_a_ready := true;
  end if;

  if v_match.player_b_submitted_at is not null then
    v_b_ready := public.is_valid_draft_assignments(v_b_formation, v_match.player_b_assignments);
  elsif public.is_valid_draft_assignments(v_b_formation, v_b_assignments) then
    update public.online_matches
    set player_b_formation = v_b_formation,
        player_b_assignments = v_b_assignments,
        player_b_submitted_at = coalesce(player_b_submitted_at, now())
    where id = p_match_id
    returning * into v_match;
    v_b_ready := true;
  end if;

  if v_a_ready and v_b_ready then
    update public.online_matches
    set status = 'resolving'
    where id = p_match_id
    returning * into v_match;

    return jsonb_build_object(
      'status', 'resolving',
      'match_id', v_match.id
    );
  end if;

  if v_a_ready and not v_b_ready then
    update public.online_matches
    set status = 'result',
        result = public.build_forfeit_result(v_match, 'a')
    where id = p_match_id
    returning * into v_match;
  elsif v_b_ready and not v_a_ready then
    update public.online_matches
    set status = 'result',
        result = public.build_forfeit_result(v_match, 'b')
    where id = p_match_id
    returning * into v_match;
  else
    update public.online_matches
    set status = 'abandoned',
        result = public.build_forfeit_result(v_match, null)
    where id = p_match_id
    returning * into v_match;
  end if;

  if v_match.status = 'result' then
    v_result := public.apply_online_match_stats(p_match_id);
    return jsonb_build_object(
      'status', 'result',
      'match_id', v_match.id,
      'result', v_result
    );
  end if;

  return jsonb_build_object(
    'status', v_match.status,
    'match_id', v_match.id,
    'result', v_match.result
  );
end;
$$;
