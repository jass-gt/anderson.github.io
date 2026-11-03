-- Receitas previstas "confiáveis" entram no orçamento; valor mensal a investir como reserva.
alter table public.transactions add column if not exists reliable boolean not null default false;
alter table public.user_preferences add column if not exists investment_reserve numeric(14,2) not null default 0 check (investment_reserve >= 0);
