-- ============================================================================
-- VoltTrack — 0018 web push subscriptions
--
-- Stores browser Push API subscriptions per user/device so the send-push
-- edge function (deployed separately, see supabase/functions/send-push) can
-- deliver notifications even when the app is closed. One row per
-- browser/device — a user can be subscribed on more than one.
-- ============================================================================

CREATE TABLE public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);
CREATE INDEX idx_push_subscriptions_user ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY push_subscriptions_select ON public.push_subscriptions FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY push_subscriptions_insert ON public.push_subscriptions FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY push_subscriptions_delete ON public.push_subscriptions FOR DELETE
  USING (user_id = auth.uid());
