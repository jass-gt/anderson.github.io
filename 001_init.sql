-- Finance OS: esquema inicial. Valores monetários em NUMERIC(14,2). Sem cascata em histórico financeiro.
create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

create table public.profiles (id uuid primary key references auth.users on delete restrict, name text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.user_preferences (
  user_id uuid primary key references auth.users on delete restrict,
  monthly_income numeric(14,2) not null default 0 check (monthly_income >= 0),
  savings_goal numeric(14,2) not null default 0 check (savings_goal >= 0),
  expense_limit numeric(14,2) not null default 0 check (expense_limit >= 0),
  emergency_reserve numeric(14,2) not null default 0 check (emergency_reserve >= 0),
  plan_start date, timezone text not null default 'America/Maceio',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.financial_accounts (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete restrict,
  name text not null, opening_balance numeric(14,2) not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.categories (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete restrict,
  name text not null, kind text not null check (kind in ('expense','income','investment')), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (user_id, kind, name));
create table public.transactions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete restrict,
  type text not null check (type in ('income','expense','transfer','investment_contribution','investment_redemption')),
  amount numeric(14,2) not null check (amount > 0 and amount < 1000000000),
  occurred_on date not null, due_on date,
  status text not null default 'settled' check (status in ('planned','pending','settled','canceled')),
  category text, description text not null check (length(description) between 1 and 200),
  payment_method text, notes text,
  account_id uuid references public.financial_accounts on delete restrict,
  to_account_id uuid references public.financial_accounts on delete restrict,
  related_id uuid references public.transactions on delete restrict,
  canceled_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (type <> 'transfer' or (account_id is not null and to_account_id is not null and account_id <> to_account_id)));
create index on public.transactions (user_id, occurred_on desc);
create index on public.transactions (user_id, type, status);
create table public.investments (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete restrict,
  name text not null, category text not null, institution text, first_date date,
  quantity numeric(20,8) check (quantity >= 0), avg_price numeric(14,4) check (avg_price >= 0),
  market_value numeric(14,2) check (market_value >= 0), market_value_at date, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.investment_transactions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete restrict,
  investment_id uuid not null references public.investments on delete restrict, kind text not null check (kind in ('aporte','resgate')),
  amount numeric(14,2) not null check (amount > 0), occurred_on date not null,
  account_id uuid references public.financial_accounts on delete restrict, transaction_id uuid references public.transactions on delete restrict,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index on public.investment_transactions (user_id, investment_id);
create table public.financial_goals (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete restrict,
  name text not null, target_amount numeric(14,2) not null check (target_amount > 0), saved_amount numeric(14,2) not null default 0 check (saved_amount >= 0),
  deadline date not null, priority text not null default 'media' check (priority in ('baixa','media','alta')), description text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

-- RLS + triggers. Transações e operações de investimento NÃO têm DELETE (cancelar preserva o histórico).
do $$ declare t text; c text; begin
  foreach t in array array['profiles','user_preferences','financial_accounts','categories','transactions','investments','investment_transactions','financial_goals'] loop
    c := case when t = 'profiles' then 'id' else 'user_id' end;
    execute format('alter table public.%I enable row level security', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_trg', t);
    execute format('create policy %I on public.%I for select to authenticated using (%I = (select auth.uid()))', t || '_sel', t, c);
    execute format('create policy %I on public.%I for insert to authenticated with check (%I = (select auth.uid()))', t || '_ins', t, c);
    execute format('create policy %I on public.%I for update to authenticated using (%I = (select auth.uid())) with check (%I = (select auth.uid()))', t || '_upd', t, c, c);
    if t not in ('transactions','investment_transactions') then
      execute format('create policy %I on public.%I for delete to authenticated using (%I = (select auth.uid()))', t || '_del', t, c);
    end if;
  end loop; end $$;

-- Aporte/resgate atômico (movimentação + operação na mesma transação). SECURITY INVOKER => RLS se aplica.
create or replace function public.invest_op(p_investment uuid, p_kind text, p_amount numeric, p_date date, p_account uuid)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_tx uuid; v_name text; begin
  if p_kind not in ('aporte','resgate') then raise exception 'Tipo inválido'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Valor inválido'; end if;
  select name into v_name from investments where id = p_investment and user_id = auth.uid();
  if v_name is null then raise exception 'Investimento não encontrado'; end if;
  if not exists (select 1 from financial_accounts where id = p_account and user_id = auth.uid()) then raise exception 'Conta não encontrada'; end if;
  insert into transactions (user_id,type,amount,occurred_on,status,category,description,account_id)
  values (auth.uid(), case when p_kind = 'aporte' then 'investment_contribution' else 'investment_redemption' end, round(p_amount,2), p_date, 'settled', 'Investimentos', initcap(p_kind) || ' - ' || v_name, p_account) returning id into v_tx;
  insert into investment_transactions (user_id,investment_id,kind,amount,occurred_on,account_id,transaction_id)
  values (auth.uid(), p_investment, p_kind, round(p_amount,2), p_date, p_account, v_tx);
  return v_tx; end $$;
revoke all on function public.invest_op from public, anon; grant execute on function public.invest_op to authenticated;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.profiles (id) values (new.id) on conflict do nothing; return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
