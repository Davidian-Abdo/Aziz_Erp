-- 0004_guards.sql — integrity guards that a CHECK constraint cannot express.
--
-- plan §2.6 (future dates), §2.8 (purchase/count coherence).

-- ---------------------------------------------------------------------------
-- No future dates.
--
-- A trigger rather than a CHECK, because `store_today()` is STABLE, not
-- IMMUTABLE: it reads the settings table and the clock. Postgres would accept a
-- non-immutable CHECK at DDL time and then re-validate it on restore, so a dump
-- taken today could fail to load tomorrow. Backdating stays unlimited.
-- ---------------------------------------------------------------------------

create function guard_not_future() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_today date := store_today();
begin
  if new.occurred_on > v_today then
    raise exception
      'occurred_on % is in the future (store today is %)', new.occurred_on, v_today
      using errcode = 'check_violation',
            hint = 'Dates are in the store timezone; backdating is allowed, forward-dating is not.';
  end if;
  return new;
end
$$;

create trigger stock_count_not_future
  before insert or update of occurred_on on stock_count
  for each row execute function guard_not_future();

create trigger purchase_not_future
  before insert or update of occurred_on on purchase
  for each row execute function guard_not_future();

create trigger stock_loss_not_future
  before insert or update of occurred_on on stock_loss
  for each row execute function guard_not_future();

create trigger charge_not_future
  before insert or update of occurred_on on charge
  for each row execute function guard_not_future();

-- takings has no UI in v1.0, but the guard belongs here too: the spec omitted
-- it, and an empty table is exactly when it is cheapest to add.
create trigger takings_not_future
  before insert or update of occurred_on on takings
  for each row execute function guard_not_future();

-- ---------------------------------------------------------------------------
-- A purchase and its embedded count must agree.
--
-- v_stock_event reads the CATEGORY from the count and the ordering ANCHOR from
-- the purchase. If they disagree the timeline is silently corrupted rather than
-- failing loudly — the worst kind of bug in this system, because the resulting
-- numbers still look plausible.
-- ---------------------------------------------------------------------------

create function guard_purchase_count_coherent() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  c record;
begin
  if new.prior_count_id is null then
    return new;   -- backdated purchase, no count attached (domain-spec §3.2A)
  end if;

  select category_id, occurred_on, source into c
  from stock_count where id = new.prior_count_id;

  if not found then
    raise exception 'prior_count_id % does not exist', new.prior_count_id
      using errcode = 'foreign_key_violation';
  end if;

  if c.source <> 'purchase' then
    raise exception
      'prior_count_id % has source %, expected ''purchase''', new.prior_count_id, c.source
      using errcode = 'check_violation';
  end if;

  if c.category_id <> new.category_id then
    raise exception
      'purchase/count category mismatch: purchase is %, count is %',
      new.category_id, c.category_id
      using errcode = 'check_violation';
  end if;

  if c.occurred_on <> new.occurred_on then
    raise exception
      'purchase/count date mismatch: purchase is %, count is %',
      new.occurred_on, c.occurred_on
      using errcode = 'check_violation';
  end if;

  return new;
end
$$;

create trigger purchase_count_coherent
  before insert or update of prior_count_id, category_id, occurred_on on purchase
  for each row execute function guard_purchase_count_coherent();

-- ---------------------------------------------------------------------------
-- Deleting a purchase removes its embedded count.
--
-- The count describes the shelf before a delivery that no longer exists, so
-- leaving it behind would invent a count the user never took — and it would
-- close a window at a value nobody measured.
-- ---------------------------------------------------------------------------

create function cascade_delete_embedded_count() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.prior_count_id is not null then
    delete from stock_count
    where id = old.prior_count_id and source = 'purchase';
  end if;
  return old;
end
$$;

create trigger purchase_delete_embedded_count
  after delete on purchase
  for each row execute function cascade_delete_embedded_count();
