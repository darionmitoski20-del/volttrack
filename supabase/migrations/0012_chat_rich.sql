-- ============================================================================
-- VoltTrack — 0012 chat: attachments, edit/delete, emoji reactions
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Membership helper. Defined here too so this script never depends on an
-- earlier hotfix having been applied — SECURITY DEFINER keeps the chat
-- policies from recursing into chat_channel_members.
-- ---------------------------------------------------------------------------
create or replace function public.is_chat_member(p_channel_id uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.chat_channel_members
    where channel_id = p_channel_id and user_id = auth.uid()
  );
$$;
grant execute on function public.is_chat_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS attachment_path text,
  ADD COLUMN IF NOT EXISTS attachment_name text,
  ADD COLUMN IF NOT EXISTS attachment_type text
    CHECK (attachment_type IS NULL OR attachment_type IN ('image', 'file')),
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- An attachment-only message carries no text, so the old 1..4000 check
-- no longer holds. Allow empty content when there is an attachment.
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_content_check;
ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_content_check
  CHECK (char_length(content) <= 4000
         AND (char_length(btrim(content)) > 0 OR attachment_path IS NOT NULL));

-- ---------------------------------------------------------------------------
-- Reactions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_reactions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji      text NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 8),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);
CREATE INDEX IF NOT EXISTS idx_chat_reactions_message ON public.chat_reactions(message_id);

ALTER TABLE public.chat_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reactions_select ON public.chat_reactions;
CREATE POLICY reactions_select ON public.chat_reactions FOR SELECT
  USING (
    public.is_chat_member(
      (SELECT channel_id FROM public.chat_messages WHERE id = message_id)
    )
  );
-- Writes go through toggle_reaction().

-- ---------------------------------------------------------------------------
-- send_message: now accepts an optional attachment.
-- The new signature is an OVERLOAD, not a replacement — drop the 2-arg one so
-- PostgREST never has to choose between two candidates.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.send_message(uuid, text);

create or replace function public.send_message(
  p_channel_id uuid,
  p_content text,
  p_attachment_path text default null,
  p_attachment_name text default null,
  p_attachment_type text default null
) returns public.chat_messages
language plpgsql security definer set search_path = public as $$
declare
  v_msg public.chat_messages;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if coalesce(btrim(p_content), '') = '' and p_attachment_path is null then
    raise exception 'message cannot be empty';
  end if;
  if char_length(coalesce(p_content, '')) > 4000 then raise exception 'message too long'; end if;

  if not public.is_chat_member(p_channel_id) then
    raise exception 'not a member of this channel';
  end if;

  insert into public.chat_messages (
    channel_id, sender_id, content, attachment_path, attachment_name, attachment_type
  ) values (
    p_channel_id, auth.uid(), btrim(coalesce(p_content, '')),
    p_attachment_path, p_attachment_name, p_attachment_type
  )
  returning * into v_msg;

  update public.chat_channels set updated_at = now() where id = p_channel_id;

  update public.chat_channel_members
  set last_read_at = now()
  where channel_id = p_channel_id and user_id = auth.uid();

  return v_msg;
end;
$$;

-- ---------------------------------------------------------------------------
-- edit_message / delete_message (own messages only)
-- ---------------------------------------------------------------------------
create or replace function public.edit_message(
  p_message_id uuid,
  p_content text
) returns public.chat_messages
language plpgsql security definer set search_path = public as $$
declare
  v_msg public.chat_messages;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select * into v_msg from public.chat_messages where id = p_message_id;
  if not found then raise exception 'message not found'; end if;
  if v_msg.sender_id <> auth.uid() then raise exception 'not your message'; end if;
  if v_msg.deleted_at is not null then raise exception 'message was deleted'; end if;
  if coalesce(btrim(p_content), '') = '' and v_msg.attachment_path is null then
    raise exception 'message cannot be empty';
  end if;
  if char_length(coalesce(p_content, '')) > 4000 then raise exception 'message too long'; end if;

  update public.chat_messages
    set content = btrim(coalesce(p_content, '')), edited_at = now()
  where id = p_message_id
  returning * into v_msg;

  return v_msg;
end;
$$;

-- Soft delete so the conversation keeps its shape ("This message was deleted").
create or replace function public.delete_message(p_message_id uuid)
returns public.chat_messages
language plpgsql security definer set search_path = public as $$
declare
  v_msg public.chat_messages;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select * into v_msg from public.chat_messages where id = p_message_id;
  if not found then raise exception 'message not found'; end if;
  if v_msg.sender_id <> auth.uid() then raise exception 'not your message'; end if;

  update public.chat_messages
    set deleted_at = now(),
        content = '',
        attachment_path = null,
        attachment_name = null,
        attachment_type = null
  where id = p_message_id
  returning * into v_msg;

  delete from public.chat_reactions where message_id = p_message_id;

  return v_msg;
end;
$$;

-- ---------------------------------------------------------------------------
-- toggle_reaction: add the emoji, or remove it if already reacted
-- ---------------------------------------------------------------------------
create or replace function public.toggle_reaction(
  p_message_id uuid,
  p_emoji text
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_channel uuid;
  v_existing uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select channel_id into v_channel from public.chat_messages where id = p_message_id;
  if v_channel is null then raise exception 'message not found'; end if;
  if not public.is_chat_member(v_channel) then
    raise exception 'not a member of this channel';
  end if;

  select id into v_existing from public.chat_reactions
  where message_id = p_message_id and user_id = auth.uid() and emoji = p_emoji;

  if v_existing is not null then
    delete from public.chat_reactions where id = v_existing;
    return false; -- removed
  end if;

  insert into public.chat_reactions (message_id, user_id, emoji)
  values (p_message_id, auth.uid(), p_emoji);
  return true; -- added
end;
$$;

grant execute on function
  public.send_message(uuid, text, text, text, text),
  public.edit_message(uuid, text),
  public.delete_message(uuid),
  public.toggle_reaction(uuid, text)
to authenticated;

-- Attachments storage lives in 0013 — policies on storage.objects can fail on
-- permissions, and this script must not be taken down with them.

-- ---------------------------------------------------------------------------
-- Realtime for reactions
-- ---------------------------------------------------------------------------
-- ADD TABLE errors if the table is already published, which would abort the
-- whole script on a re-run — so add only what is missing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_reactions;
  END IF;

  -- Read receipts, so the "Seen" marker updates live.
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_channel_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_channel_members;
  END IF;
END $$;
