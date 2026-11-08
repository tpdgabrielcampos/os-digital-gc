-- OS digital GC — módulo financeiro (entradas, saídas, fechamentos, fiscal).
-- Pode rodar de novo sem problema.

-- Lançamentos: tudo que entra e sai de dinheiro.
create table if not exists fin_lancamentos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('entrada','saida')),
  descricao text not null,
  categoria text not null,
  valor numeric(12,2) not null check (valor >= 0),
  competencia date not null,            -- mês/dia a que se refere (para o resultado e o fiscal)
  vencimento date,                       -- quando deve ser pago/recebido
  pago_em date,                          -- quando foi pago/recebido (vazio = em aberto)
  forma_pagamento text,
  dentista_id uuid references dentistas(id) on delete set null,
  pedido_id uuid references pedidos(id) on delete set null,   -- saída ligada a uma OS (ex.: terceirizado)
  fornecedor text,
  parcela text,                          -- ex.: "3/12"
  grupo uuid,                            -- liga parcelas / recorrências
  nf_status text not null default 'pendente' check (nf_status in ('pendente','emitida','nao_se_aplica')),
  nf_numero text,
  observacoes text,
  criado_em timestamptz not null default now()
);
create index if not exists idx_fin_lanc_comp on fin_lancamentos(competencia);
create index if not exists idx_fin_lanc_venc on fin_lancamentos(vencimento);
create index if not exists idx_fin_lanc_dent on fin_lancamentos(dentista_id);
alter table fin_lancamentos enable row level security;  -- só o servidor (painel do laboratório) acessa

-- OS cobradas: qual lançamento de entrada cobrou cada OS, e valor final (se diferente do estimado).
alter table pedidos add column if not exists cobranca_id uuid references fin_lancamentos(id) on delete set null;
alter table pedidos add column if not exists valor_final numeric(10,2);

-- Como cada dentista paga.
alter table dentistas add column if not exists forma_cobranca text not null default 'mensal';
alter table dentistas add column if not exists dia_vencimento int not null default 10;

-- Configuração fiscal (uma linha só).
create table if not exists fin_config (
  id int primary key default 1 check (id = 1),
  regime text not null default 'simples',
  anexo text not null default 'III',
  aliquota_manual numeric(6,3),        -- alíquota efetiva informada pelo contador (%), se preferir
  atualizado_em timestamptz not null default now()
);
insert into fin_config (id) values (1) on conflict (id) do nothing;
alter table fin_config add column if not exists aliquota_manual numeric(6,3);
alter table fin_config enable row level security;

-- Faturamento dos meses antes de usar o sistema (para o cálculo dos últimos 12 meses do Simples).
create table if not exists fin_historico (
  mes date primary key,           -- sempre dia 1 do mês
  receita numeric(14,2) not null default 0
);
alter table fin_historico enable row level security;

notify pgrst, 'reload schema';
