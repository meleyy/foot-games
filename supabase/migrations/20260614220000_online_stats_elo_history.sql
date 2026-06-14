-- Online player stats, match history, ELO, and tighter RLS

create table if not exists public.online_player_stats (
  player_id text primary key,
  display_name text not null default 'Joueur',
  elo integer not null default 1000 check (elo >= 0),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  draws integer not null default 0 check (draws >= 0),
  matches_played integer not null default 0 check (matches_played >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.online_match_history (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.online_matches(id) on delete cascade,
  player_a_id text not null,
  player_b_id text not null,
  player_a_name text,
  player_b_name text,
  home_goals integer not null default 0,
  away_goals integer not null default 0,
  winner_id text,
  player_a_elo_before integer,
  player_a_elo_after integer,
  player_b_elo_before integer,
  player_b_elo_after integer,
  played_at timestamptz not null default now(),
  unique (match_id)
);

create index if not exists online_match_history_player_a_idx
  on public.online_match_history (player_a_id, played_at desc);

create index if not exists online_match_history_player_b_idx
  on public.online_match_history (player_b_id, played_at desc);

alter table public.online_player_stats enable row level security;
alter table public.online_match_history enable row level security;

drop policy if exists online_player_stats_select_own on public.online_player_stats;
create policy online_player_stats_select_own
  on public.online_player_stats
  for select
  to anon, authenticated
  using (player_id = coalesce(auth.uid()::text, ''));

drop policy if exists online_match_history_select_own on public.online_match_history;
create policy online_match_history_select_own
  on public.online_match_history
  for select
  to anon, authenticated
  using (
    player_a_id = coalesce(auth.uid()::text, '')
    or player_b_id = coalesce(auth.uid()::text, '')
  );

drop policy if exists online_matches_select_all on public.online_matches;
drop policy if exists "online_matches_select_all" on public.online_matches;

create policy online_matches_select_participants
  on public.online_matches
  for select
  to anon, authenticated
  using (
    player_a_id = coalesce(auth.uid()::text, '')
    or player_b_id = coalesce(auth.uid()::text, '')
  );

create or replace function public.elo_expected(p_player_elo integer, p_opponent_elo integer)
returns numeric
language sql
immutable
set search_path = public
as $$
  select 1.0 / (1.0 + power(10.0, (p_opponent_elo - p_player_elo) / 400.0));
$$;

create or replace function public.elo_delta(
  p_player_elo integer,
  p_opponent_elo integer,
  p_score numeric
)
returns integer
language sql
immutable
set search_path = public
as $$
  select round(32.0 * (p_score - public.elo_expected(p_player_elo, p_opponent_elo)))::integer;
$$;

create or replace function public.touch_online_player_stats()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists online_player_stats_updated_at on public.online_player_stats;
create trigger online_player_stats_updated_at
  before update on public.online_player_stats
  for each row
  execute function public.touch_online_player_stats();

create or replace function public.ensure_online_player_stats(
  p_player_id text,
  p_display_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.online_player_stats (player_id, display_name)
  values (p_player_id, left(trim(coalesce(p_display_name, 'Joueur')), 24))
  on conflict (player_id) do update
    set display_name = excluded.display_name,
        updated_at = now();
end;
$$;

create or replace function public.apply_online_match_stats(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.online_matches%rowtype;
  v_result jsonb;
  v_winner_id text;
  v_score_a numeric;
  v_score_b numeric;
  v_stats_a public.online_player_stats%rowtype;
  v_stats_b public.online_player_stats%rowtype;
  v_delta_a integer;
  v_delta_b integer;
  v_elo jsonb;
begin
  select *
  into v_match
  from public.online_matches
  where id = p_match_id
  for update;

  if not found or v_match.status <> 'result' or v_match.result is null then
    return coalesce(v_match.result, '{}'::jsonb);
  end if;

  if exists (select 1 from public.online_match_history where match_id = p_match_id) then
    return v_match.result;
  end if;

  v_result := v_match.result;

  if coalesce(v_result ->> 'reason', '') = 'abandoned' then
    return v_result;
  end if;

  perform public.ensure_online_player_stats(v_match.player_a_id, v_match.player_a_name);
  perform public.ensure_online_player_stats(v_match.player_b_id, v_match.player_b_name);

  select * into v_stats_a from public.online_player_stats where player_id = v_match.player_a_id;
  select * into v_stats_b from public.online_player_stats where player_id = v_match.player_b_id;

  v_winner_id := v_result ->> 'winnerId';

  if v_winner_id = v_match.player_a_id then
    v_score_a := 1;
    v_score_b := 0;
  elsif v_winner_id = v_match.player_b_id then
    v_score_a := 0;
    v_score_b := 1;
  else
    v_score_a := 0.5;
    v_score_b := 0.5;
  end if;

  v_delta_a := public.elo_delta(v_stats_a.elo, v_stats_b.elo, v_score_a);
  v_delta_b := public.elo_delta(v_stats_b.elo, v_stats_a.elo, v_score_b);

  update public.online_player_stats
  set elo = greatest(0, elo + v_delta_a),
      wins = wins + case when v_score_a = 1 then 1 else 0 end,
      losses = losses + case when v_score_a = 0 then 1 else 0 end,
      draws = draws + case when v_score_a = 0.5 then 1 else 0 end,
      matches_played = matches_played + 1
  where player_id = v_match.player_a_id
  returning * into v_stats_a;

  update public.online_player_stats
  set elo = greatest(0, elo + v_delta_b),
      wins = wins + case when v_score_b = 1 then 1 else 0 end,
      losses = losses + case when v_score_b = 0 then 1 else 0 end,
      draws = draws + case when v_score_b = 0.5 then 1 else 0 end,
      matches_played = matches_played + 1
  where player_id = v_match.player_b_id
  returning * into v_stats_b;

  insert into public.online_match_history (
    match_id,
    player_a_id,
    player_b_id,
    player_a_name,
    player_b_name,
    home_goals,
    away_goals,
    winner_id,
    player_a_elo_before,
    player_a_elo_after,
    player_b_elo_before,
    player_b_elo_after
  )
  values (
    p_match_id,
    v_match.player_a_id,
    v_match.player_b_id,
    v_match.player_a_name,
    v_match.player_b_name,
    coalesce((v_result ->> 'homeGoals')::integer, 0),
    coalesce((v_result ->> 'awayGoals')::integer, 0),
    v_winner_id,
    v_stats_a.elo - v_delta_a,
    v_stats_a.elo,
    v_stats_b.elo - v_delta_b,
    v_stats_b.elo
  );

  v_elo := jsonb_build_object(
    'playerA', jsonb_build_object(
      'before', v_stats_a.elo - v_delta_a,
      'after', v_stats_a.elo,
      'delta', v_delta_a
    ),
    'playerB', jsonb_build_object(
      'before', v_stats_b.elo - v_delta_b,
      'after', v_stats_b.elo,
      'delta', v_delta_b
    )
  );

  v_result := v_result || jsonb_build_object('elo', v_elo);

  update public.online_matches
  set result = v_result
  where id = p_match_id;

  return v_result;
end;
$$;

create or replace function public.get_online_player_stats(p_player_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stats public.online_player_stats%rowtype;
begin
  select *
  into v_stats
  from public.online_player_stats
  where player_id = p_player_id;

  if not found then
    return jsonb_build_object(
      'player_id', p_player_id,
      'display_name', null,
      'elo', 1000,
      'wins', 0,
      'losses', 0,
      'draws', 0,
      'matches_played', 0
    );
  end if;

  return jsonb_build_object(
    'player_id', v_stats.player_id,
    'display_name', v_stats.display_name,
    'elo', v_stats.elo,
    'wins', v_stats.wins,
    'losses', v_stats.losses,
    'draws', v_stats.draws,
    'matches_played', v_stats.matches_played
  );
end;
$$;

create or replace function public.get_online_match_history(
  p_player_id text,
  p_limit integer default 8
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
begin
  select coalesce(jsonb_agg(row_data order by played_at desc), '[]'::jsonb)
  into v_rows
  from (
    select jsonb_build_object(
      'match_id', h.match_id,
      'played_at', h.played_at,
      'player_a_id', h.player_a_id,
      'player_b_id', h.player_b_id,
      'player_a_name', h.player_a_name,
      'player_b_name', h.player_b_name,
      'home_goals', h.home_goals,
      'away_goals', h.away_goals,
      'winner_id', h.winner_id,
      'player_a_elo_delta', h.player_a_elo_after - h.player_a_elo_before,
      'player_b_elo_delta', h.player_b_elo_after - h.player_b_elo_before
    ) as row_data,
    h.played_at
    from public.online_match_history h
    where h.player_a_id = p_player_id or h.player_b_id = p_player_id
    order by h.played_at desc
    limit greatest(1, least(coalesce(p_limit, 8), 20))
  ) ranked;

  return jsonb_build_object('matches', v_rows);
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

  perform public.ensure_online_player_stats(p_player_id, v_name);
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
    perform public.ensure_online_player_stats(v_opponent.player_id, v_opponent.display_name);

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

grant execute on function public.get_online_player_stats(text) to anon, authenticated;
grant execute on function public.get_online_match_history(text, integer) to anon, authenticated;
grant execute on function public.apply_online_match_stats(uuid) to service_role;
grant execute on function public.ensure_online_player_stats(text, text) to anon, authenticated;
