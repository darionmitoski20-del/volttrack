-- ============================================================================
-- VoltTrack — 0007 real-time chat system
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.chat_channels (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  type text not null check (type in ('dm', 'group')),
  name text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_chat_channels_company on public.chat_channels(company_id);

create table public.chat_channel_members (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  unique (channel_id, user_id)
);
create index idx_chat_members_user on public.chat_channel_members(user_id);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index idx_chat_messages_channel on public.chat_messages(channel_id, created_at);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.chat_channels enable row level security;
alter table public.chat_channel_members enable row level security;
alter table public.chat_messages enable row level security;

create policy "Members can view their channels"
  on public.chat_channels for select using (
    exists (
      select 1 from public.chat_channel_members
      where channel_id = chat_channels.id and user_id = auth.uid()
    )
  );

create policy "Members can view their memberships"
  on public.chat_channel_members for select using (
    exists (
      select 1 from public.chat_channel_members cm
      where cm.channel_id = chat_channel_members.channel_id and cm.user_id = auth.uid()
    )
  );

create policy "Members can view channel messages"
  on public.chat_messages for select using (
    exists (
      select 1 from public.chat_channel_members
      where channel_id = chat_messages.channel_id and user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create or replace function public.create_dm_channel(
  p_other_user_id uuid
) returns public.chat_channels
language plpgsql security definer set search_path = public as $$
declare
  v_company uuid;
  v_channel public.chat_channels;
  v_existing_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_other_user_id = auth.uid() then raise exception 'cannot DM yourself'; end if;

  select company_id into v_company
  from public.company_members
  where user_id = auth.uid() and status = 'active'
  limit 1;
  if v_company is null then raise exception 'not an active member'; end if;

  if not exists (
    select 1 from public.company_members
    where company_id = v_company and user_id = p_other_user_id and status = 'active'
  ) then raise exception 'other user is not an active member'; end if;

  -- Find existing DM between these two users in this company
  select ch.id into v_existing_id
  from public.chat_channels ch
  where ch.company_id = v_company and ch.type = 'dm'
    and exists (select 1 from public.chat_channel_members where channel_id = ch.id and user_id = auth.uid())
    and exists (select 1 from public.chat_channel_members where channel_id = ch.id and user_id = p_other_user_id)
  limit 1;

  if v_existing_id is not null then
    select * into v_channel from public.chat_channels where id = v_existing_id;
    return v_channel;
  end if;

  insert into public.chat_channels (company_id, type, created_by)
  values (v_company, 'dm', auth.uid())
  returning * into v_channel;

  insert into public.chat_channel_members (channel_id, user_id) values
    (v_channel.id, auth.uid()),
    (v_channel.id, p_other_user_id);

  return v_channel;
end;
$$;

create or replace function public.create_group_channel(
  p_name text,
  p_member_ids uuid[]
) returns public.chat_channels
language plpgsql security definer set search_path = public as $$
declare
  v_company uuid;
  v_channel public.chat_channels;
  v_mid uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'group name is required'; end if;

  select company_id into v_company
  from public.company_members
  where user_id = auth.uid() and status = 'active'
  limit 1;
  if v_company is null then raise exception 'not an active member'; end if;

  insert into public.chat_channels (company_id, type, name, created_by)
  values (v_company, 'group', btrim(p_name), auth.uid())
  returning * into v_channel;

  -- Add creator
  insert into public.chat_channel_members (channel_id, user_id)
  values (v_channel.id, auth.uid());

  -- Add other members
  if array_length(p_member_ids, 1) > 0 then
    foreach v_mid in array p_member_ids loop
      if v_mid = auth.uid() then continue; end if;
      if not exists (
        select 1 from public.company_members
        where company_id = v_company and user_id = v_mid and status = 'active'
      ) then continue; end if;

      insert into public.chat_channel_members (channel_id, user_id)
      values (v_channel.id, v_mid)
      on conflict do nothing;
    end loop;
  end if;

  return v_channel;
end;
$$;

create or replace function public.send_message(
  p_channel_id uuid,
  p_content text
) returns public.chat_messages
language plpgsql security definer set search_path = public as $$
declare
  v_msg public.chat_messages;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if coalesce(btrim(p_content), '') = '' then raise exception 'message cannot be empty'; end if;
  if char_length(p_content) > 4000 then raise exception 'message too long'; end if;

  if not exists (
    select 1 from public.chat_channel_members
    where channel_id = p_channel_id and user_id = auth.uid()
  ) then raise exception 'not a member of this channel'; end if;

  insert into public.chat_messages (channel_id, sender_id, content)
  values (p_channel_id, auth.uid(), btrim(p_content))
  returning * into v_msg;

  update public.chat_channels set updated_at = now() where id = p_channel_id;

  update public.chat_channel_members
  set last_read_at = now()
  where channel_id = p_channel_id and user_id = auth.uid();

  return v_msg;
end;
$$;

create or replace function public.mark_channel_read(
  p_channel_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  update public.chat_channel_members
  set last_read_at = now()
  where channel_id = p_channel_id and user_id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant execute on function
  public.create_dm_channel(uuid),
  public.create_group_channel(text, uuid[]),
  public.send_message(uuid, text),
  public.mark_channel_read(uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- Enable Realtime
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.chat_messages;
