import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

type RuntimeConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
  vapidPublicKey: string;
  vapidPrivateKey: string;
  vapidSubject: string;
};

function getRuntimeConfig(): RuntimeConfig {
  const config = {
    supabaseUrl: Deno.env.get('SUPABASE_URL'),
    serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    vapidPublicKey: Deno.env.get('VAPID_PUBLIC_KEY') ?? Deno.env.get('VITE_VAPID_PUBLIC_KEY'),
    vapidPrivateKey: Deno.env.get('VAPID_PRIVATE_KEY'),
    vapidSubject: Deno.env.get('VAPID_SUBJECT'),
  };

  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length) {
    throw new Error(`Missing Edge Function secrets: ${missing.join(', ')}`);
  }

  return config as RuntimeConfig;
}

Deno.serve(async (_req) => {
  let config: RuntimeConfig;

  try {
    config = getRuntimeConfig();
    webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid Edge Function configuration';
    console.error('[push] config error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(config.supabaseUrl, config.serviceRoleKey);

  // Hora atual em Brasília (UTC-3) — ajustar timezone se necessário
  const nowBrasilia = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })
  );
  const hh = String(nowBrasilia.getHours()).padStart(2, '0');
  const mm = String(nowBrasilia.getMinutes()).padStart(2, '0');
  const hhmm = `${hh}:${mm}`;

  // Janela anti-duplicata: ignora alarmes disparados nos últimos 5 minutos
  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const { data: alarms, error } = await supabase
    .from('task_alarms')
    .select('id, user_id, description, time_of_day')
    .eq('enabled', true)
    .gte('time_of_day', `${hhmm}:00`)
    .lte('time_of_day', `${hhmm}:59`)
    .or(`last_notified_at.is.null,last_notified_at.lt.${cutoff}`);

  if (error) {
    console.error('[push] query error:', error);
    return new Response(JSON.stringify({ error }), { status: 500 });
  }

  const results: { alarm_id: string; status: string; code?: number }[] = [];

  for (const alarm of alarms ?? []) {
    // Marca como notificado ANTES de enviar (evita disparo duplo se a função rodar em paralelo)
    await supabase
      .from('task_alarms')
      .update({ last_notified_at: new Date().toISOString() })
      .eq('id', alarm.id);

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', alarm.user_id);

    for (const sub of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({
            title: 'Flux Time',
            body: alarm.description || 'Alarme do Kanban',
            icon: '/icon.svg',
          })
        );
        results.push({ alarm_id: alarm.id, status: 'sent' });
      } catch (err: unknown) {
        const e = err as { statusCode?: number };
        console.warn('[push] send error:', e.statusCode, sub.endpoint);
        // 410 = subscription expirada — remover do banco
        if (e.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        }
        results.push({ alarm_id: alarm.id, status: 'error', code: e.statusCode });
      }
    }
  }

  return new Response(
    JSON.stringify({ hhmm, processed: results.length, results }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
