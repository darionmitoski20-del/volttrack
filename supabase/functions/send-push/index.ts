// VoltTrack — send-push edge function
//
// Deploy via the Supabase Dashboard: Edge Functions -> Create a new function
// -> name it "send-push" -> paste this file's contents -> when creating it,
// turn OFF "Enforce JWT verification" (the notifications trigger calls this
// with no auth token, since it only ever fires from inside our own database).
//
// Required secrets (Edge Functions -> send-push -> Secrets):
//   VAPID_PUBLIC_KEY   - from `npx web-push generate-vapid-keys`
//   VAPID_PRIVATE_KEY  - from the same command, keep secret
//   VAPID_SUBJECT       - "mailto:you@example.com" (any contact address)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT')!,
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
);

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req) => {
  try {
    const { user_id, title, body, url } = await req.json();
    if (!user_id) return new Response('Missing user_id', { status: 400 });

    const { data: subs, error } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', user_id);
    if (error) throw error;

    const payload = JSON.stringify({ title, body, url: url ?? '/' });

    await Promise.all(
      (subs ?? []).map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
          );
        } catch (err) {
          // 404/410 = the subscription is gone (uninstalled, expired, revoked) — clean it up.
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await supabase.from('push_subscriptions').delete().eq('id', sub.id);
          }
        }
      }),
    );

    return new Response('ok', { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response('error', { status: 500 });
  }
});
