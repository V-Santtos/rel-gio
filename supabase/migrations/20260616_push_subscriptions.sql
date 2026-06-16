-- Tabela para armazenar as subscricoes de Web Push dos browsers.
-- user_id segue o padrao do app: public.profiles(id), que referencia auth.users(id).
-- endpoint e unico por browser/dispositivo.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indice para buscar subscricoes por usuario (Edge Function usa isso)
CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
  ON public.push_subscriptions (user_id);

-- RLS: cada usuario so ve e gerencia as proprias subscricoes
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subscriptions_all_own ON public.push_subscriptions;

CREATE POLICY push_subscriptions_all_own ON public.push_subscriptions
  FOR ALL
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP TRIGGER IF EXISTS push_subscriptions_updated_at
  ON public.push_subscriptions;

-- Atualiza updated_at automaticamente usando a funcao compartilhada do schema.
CREATE TRIGGER push_subscriptions_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
