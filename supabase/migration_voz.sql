-- OS digital GC — ajustes do assistente por voz (definidos só pelo laboratório).
-- Rode este script inteiro no SQL Editor (pode rodar de novo sem problema).

create table if not exists config_assistente (
  id int primary key default 1 check (id = 1),     -- uma linha só
  provedor text not null default 'navegador',      -- 'navegador' ou 'elevenlabs'
  voz_id text,                                     -- id da voz na ElevenLabs
  voz_nome text,
  modelo text not null default 'eleven_multilingual_v2',
  velocidade numeric not null default 1,           -- 0.7 a 1.2
  estabilidade numeric not null default 0.45,      -- 0 = mais expressiva, 1 = mais estável
  estilo numeric not null default 0.3,             -- exagero do estilo da voz
  pausa int not null default 2000,                 -- ms de silêncio antes de seguir
  atualizado_em timestamptz not null default now()
);
insert into config_assistente (id) values (1) on conflict (id) do nothing;

-- Só o servidor (chave secreta) lê e grava: sem políticas = ninguém de fora acessa.
alter table config_assistente enable row level security;

-- Guarda os áudios já gerados (as perguntas fixas não gastam crédito de novo).
insert into storage.buckets (id, name, public)
values ('voz-cache', 'voz-cache', false)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
