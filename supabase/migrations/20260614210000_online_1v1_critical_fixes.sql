-- Critical 1v1 fixes: draft persistence, validation, expiry/forfeit, active-match guard

alter table public.online_matches
  add column if not exists player_a_draft_state jsonb,
  add column if not exists player_b_draft_state jsonb;

create or replace function public.formation_slot_ids(p_formation_id text)
returns text[]
language sql
immutable
set search_path = public
as $$
  select case coalesce(p_formation_id, '4-3-3')
    when '4-4-2' then array['gk','lb','lcb','rcb','rb','lm','lcm','rcm','rm','lst','rst']
    when '4-2-3-1' then array['gk','lb','lcb','rcb','rb','cdm1','cdm2','lam','cam','ram','st']
    when '3-5-2' then array['gk','lcb','cb','rcb','lwb','lcm','cm','rcm','rwb','lst','rst']
    when '3-4-3' then array['gk','lcb','cb','rcb','lm','lcm','rcm','rm','lw','st','rw']
    else array['gk','lb','lcb','rcb','rb','lcm','cm','rcm','lw','st','rw']
  end;
$$;

create or replace function public.is_valid_draft_assignments(
  p_formation_id text,
  p_assignments jsonb
)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_slot text;
  v_player jsonb;
  v_rating int;
begin
  if p_assignments is null or jsonb_typeof(p_assignments) <> 'object' then
    return false;
  end if;

  foreach v_slot in array public.formation_slot_ids(p_formation_id)
  loop
    v_player := p_assignments -> v_slot;

    if v_player is null or jsonb_typeof(v_player) <> 'object' then
      return false;
    end if;

    if coalesce(trim(v_player ->> 'name'), '') = '' then
      return false;
    end if;

    begin
      v_rating := (v_player ->> 'rating')::int;
    exception
      when others then
        return false;
    end;

    if v_rating is null or v_rating < 1 or v_rating > 99 then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function public.build_forfeit_result(
  p_match public.online_matches,
  p_winner text
)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case p_winner
    when 'a' then jsonb_build_object(
      'reason', 'forfeit',
      'homeId', p_match.player_a_id,
      'awayId', p_match.player_b_id,
      'homeGoals', 3,
      'awayGoals', 0,
      'winnerId', p_match.player_a_id,
      'penalties', null
    )
    when 'b' then jsonb_build_object(
      'reason', 'forfeit',
      'homeId', p_match.player_a_id,
      'awayId', p_match.player_b_id,
      'homeGoals', 0,
      'awayGoals', 3,
      'winnerId', p_match.player_b_id,
      'penalties', null
    )
    else jsonb_build_object(
      'reason', 'abandoned',
      'homeId', p_match.player_a_id,
      'awayId', p_match.player_b_id,
      'homeGoals', 0,
      'awayGoals', 0,
      'winnerId', null,
      'penalties', null
    )
  end;
$$;

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

  return jsonb_build_object(
    'status', v_match.status,
    'match_id', v_match.id,
    'result', v_match.result
  );
end;
$$;

create or replace function public.process_expired_online_drafts()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_id uuid;
begin
  for v_match_id in
    select id
    from public.online_matches
    where status = 'draft'
      and draft_ends_at <= now()
  loop
    perform public.finalize_online_draft(v_match_id);
  end loop;
end;
$$;

create or replace function public.check_online_draft_expiry(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.process_expired_online_drafts();
  return public.finalize_online_draft(p_match_id);
end;
$$;

create or replace function public.save_online_draft_progress(
  p_match_id uuid,
  p_player_id text,
  p_formation_id text,
  p_draft_state jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.online_matches%rowtype;
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
    return jsonb_build_object('status', v_match.status);
  end if;

  if p_player_id = v_match.player_a_id then
    if v_match.player_a_submitted_at is not null then
      return jsonb_build_object('status', 'draft', 'saved', false);
    end if;

    update public.online_matches
    set player_a_draft_state = p_draft_state,
        player_a_formation = coalesce(p_formation_id, player_a_formation)
    where id = p_match_id
    returning * into v_match;
  elsif p_player_id = v_match.player_b_id then
    if v_match.player_b_submitted_at is not null then
      return jsonb_build_object('status', 'draft', 'saved', false);
    end if;

    update public.online_matches
    set player_b_draft_state = p_draft_state,
        player_b_formation = coalesce(p_formation_id, player_b_formation)
    where id = p_match_id
    returning * into v_match;
  else
    raise exception 'joueur non autorise';
  end if;

  return jsonb_build_object('status', 'draft', 'saved', true);
end;
$$;

create or replace function public.join_matchmaking_queue(
  p_player_id text,
  p_display_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opponent public.matchmaking_queue%rowtype;
  v_match_id uuid;
  v_active_match_id uuid;
  v_name text := left(trim(coalesce(p_display_name, 'Joueur')), 24);
begin
  if p_player_id is null or length(trim(p_player_id)) < 8 then
    raise exception 'player_id invalide';
  end if;

  perform public.cleanup_matchmaking_queue();
  perform public.process_expired_online_drafts();

  select id
  into v_active_match_id
  from public.online_matches
  where (player_a_id = p_player_id or player_b_id = p_player_id)
    and status in ('draft', 'resolving')
  order by created_at desc
  limit 1;

  if v_active_match_id is not null then
    delete from public.matchmaking_queue where player_id = p_player_id;

    return jsonb_build_object(
      'status', 'matched',
      'match_id', v_active_match_id,
      'resumed', true
    );
  end if;

  delete from public.matchmaking_queue where player_id = p_player_id;

  select *
  into v_opponent
  from public.matchmaking_queue
  where status = 'waiting'
    and player_id <> p_player_id
  order by created_at
  limit 1
  for update skip locked;

  if found then
    insert into public.online_matches (
      player_a_id,
      player_b_id,
      player_a_name,
      player_b_name,
      status,
      draft_ends_at
    )
    values (
      v_opponent.player_id,
      p_player_id,
      v_opponent.display_name,
      v_name,
      'draft',
      now() + interval '180 seconds'
    )
    returning id into v_match_id;

    delete from public.matchmaking_queue
    where player_id in (v_opponent.player_id, p_player_id);

    return jsonb_build_object(
      'status', 'matched',
      'match_id', v_match_id
    );
  end if;

  insert into public.matchmaking_queue (player_id, display_name, status, heartbeat_at)
  values (p_player_id, v_name, 'waiting', now())
  on conflict (player_id) do update
    set display_name = excluded.display_name,
        status = 'waiting',
        heartbeat_at = now();

  return jsonb_build_object('status', 'waiting');
end;
$$;

create or replace function public.heartbeat_matchmaking_queue(p_player_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_id uuid;
begin
  perform public.cleanup_matchmaking_queue();
  perform public.process_expired_online_drafts();

  select id
  into v_match_id
  from public.online_matches
  where (player_a_id = p_player_id or player_b_id = p_player_id)
    and status in ('draft', 'resolving')
  order by created_at desc
  limit 1;

  if v_match_id is not null then
    return jsonb_build_object('status', 'matched', 'match_id', v_match_id);
  end if;

  update public.matchmaking_queue
  set heartbeat_at = now()
  where player_id = p_player_id and status = 'waiting';

  if found then
    return jsonb_build_object('status', 'waiting');
  end if;

  return jsonb_build_object('status', 'idle');
end;
$$;

create or replace function public.submit_online_draft(
  p_match_id uuid,
  p_player_id text,
  p_formation_id text,
  p_assignments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.online_matches%rowtype;
  v_both_ready boolean;
  v_formation text;
begin
  if not public.is_valid_draft_assignments(p_formation_id, p_assignments) then
    raise exception 'equipe incomplete: 11 joueurs valides requis pour la formation';
  end if;

  select *
  into v_match
  from public.online_matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'match introuvable';
  end if;

  if v_match.status = 'abandoned' then
    return jsonb_build_object('status', v_match.status, 'result', v_match.result);
  end if;

  if v_match.status not in ('draft', 'resolving') then
    return jsonb_build_object('status', v_match.status, 'result', v_match.result);
  end if;

  if v_match.draft_ends_at <= now() and v_match.status = 'draft' then
    return public.finalize_online_draft(p_match_id);
  end if;

  v_formation := coalesce(p_formation_id, '4-3-3');

  if p_player_id = v_match.player_a_id then
    if v_match.player_a_submitted_at is not null then
      return jsonb_build_object(
        'status', v_match.status,
        'match_id', v_match.id,
        'both_ready', v_match.player_b_submitted_at is not null,
        'result', v_match.result
      );
    end if;

    update public.online_matches
    set player_a_formation = v_formation,
        player_a_assignments = p_assignments,
        player_a_draft_state = null,
        player_a_submitted_at = now()
    where id = p_match_id
    returning * into v_match;
  elsif p_player_id = v_match.player_b_id then
    if v_match.player_b_submitted_at is not null then
      return jsonb_build_object(
        'status', v_match.status,
        'match_id', v_match.id,
        'both_ready', v_match.player_a_submitted_at is not null,
        'result', v_match.result
      );
    end if;

    update public.online_matches
    set player_b_formation = v_formation,
        player_b_assignments = p_assignments,
        player_b_draft_state = null,
        player_b_submitted_at = now()
    where id = p_match_id
    returning * into v_match;
  else
    raise exception 'joueur non autorise';
  end if;

  v_both_ready := v_match.player_a_submitted_at is not null
    and v_match.player_b_submitted_at is not null;

  if v_both_ready and v_match.status = 'draft' then
    update public.online_matches
    set status = 'resolving'
    where id = p_match_id
    returning * into v_match;
  end if;

  return jsonb_build_object(
    'status', v_match.status,
    'match_id', v_match.id,
    'both_ready', v_both_ready,
    'result', v_match.result
  );
end;
$$;

grant execute on function public.check_online_draft_expiry(uuid) to anon, authenticated;
grant execute on function public.save_online_draft_progress(uuid, text, text, jsonb) to anon, authenticated;
grant execute on function public.process_expired_online_drafts() to anon, authenticated;

alter table public.online_matches
  drop constraint if exists online_matches_status_check;

alter table public.online_matches
  add constraint online_matches_status_check
  check (status = any (array['draft', 'resolving', 'result', 'cancelled', 'abandoned']));
