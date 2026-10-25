-- ============================================================================
-- VoltTrack — 0019 fire a push notification whenever a notification is created
--
-- Split out from 0018 on purpose: pg_net may need to be enabled from the
-- dashboard (Database -> Extensions) on some projects before this can run.
--
-- IMPORTANT: this points at the `send-push` edge function, which must be
-- deployed first (see supabase/functions/send-push/index.ts) with
-- "Enforce JWT verification" turned OFF when creating it, so this trigger
-- doesn't need to attach a service-role token to call it.
--
-- If your project ref ever changes, update the URL below to match.
-- ============================================================================

create extension if not exists pg_net;

create or replace function public.trigger_send_push()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://oljytxnpfcgvjnnocagi.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'user_id', new.user_id,
      'title', new.title,
      'body', new.message
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_notifications_push on public.notifications;
create trigger trg_notifications_push
  after insert on public.notifications
  for each row execute function public.trigger_send_push();
