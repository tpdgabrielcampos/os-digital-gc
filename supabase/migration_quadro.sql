-- OS digital GC — novas etapas do quadro: "Aprovação (HTML)" e "Prova".
-- Rode no SQL Editor do Supabase (pode rodar de novo sem problema).

alter table pedidos drop constraint if exists pedidos_status_check;
alter table pedidos add constraint pedidos_status_check
  check (status in (
    'recebido',
    'standby',
    'cad',
    'aprovacao',
    'cam',
    'finalizacao',
    'prova',
    'entregue'
  ));

notify pgrst, 'reload schema';
