-- Secure match fetch for participants (works with auth uid or explicit player_id)

create or replace function public.get_online_match(
  p_match_id uuid,
  p_player_id text
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
    and (player_a_id = p_player_id or player_b_id = p_player_id);

  if not found then
    return null;
  end if;

  return to_jsonb(v_match);
end;
$$;

grant execute on function public.get_online_match(uuid, text) to anon, authenticated;
