-- 0005_audit.sql — the append-only audit log.
--
-- domain-spec §9.2; architecture-spec §2.4.
--
-- Reports are ALWAYS recomputed from current data; nothing here feeds a report.
-- The log exists to explain *why a number changed* — which, in a system where
-- every record is editable and every edit silently moves a profit figure, is the
-- only way to answer "this was 4,200 last week".

create table audit_log (
  id         bigserial primary key,
  table_name text not null,
  row_id     uuid not null,
  operation  text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  before     jsonb,
  after      jsonb,
  actor      uuid,                                  -- auth.uid(), null for seeds
  at         timestamptz not null default now()
);

create index audit_log_row on audit_log (table_name, row_id, at desc);
create index audit_log_at  on audit_log (at desc);

-- One generic trigger for every audited table.
--
-- SECURITY DEFINER so the log can be written even though no role holds INSERT
-- on it directly: that is what makes it append-only rather than merely
-- append-by-convention.
create function write_audit_log() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
begin
  -- auth.uid() throws if the JWT claim is absent or malformed (seeds, psql,
  -- migrations). An unattributed audit row is far better than a failed write.
  begin
    v_actor := auth.uid();
  exception when others then
    v_actor := null;
  end;

  if tg_op = 'DELETE' then
    insert into audit_log (table_name, row_id, operation, before, after, actor)
    values (tg_table_name, old.id, tg_op, to_jsonb(old), null, v_actor);
    return old;
  elsif tg_op = 'UPDATE' then
    insert into audit_log (table_name, row_id, operation, before, after, actor)
    values (tg_table_name, new.id, tg_op, to_jsonb(old), to_jsonb(new), v_actor);
    return new;
  else
    insert into audit_log (table_name, row_id, operation, before, after, actor)
    values (tg_table_name, new.id, tg_op, null, to_jsonb(new), v_actor);
    return new;
  end if;
end
$$;

create trigger audit_purchase
  after insert or update or delete on purchase
  for each row execute function write_audit_log();

create trigger audit_stock_count
  after insert or update or delete on stock_count
  for each row execute function write_audit_log();

create trigger audit_stock_loss
  after insert or update or delete on stock_loss
  for each row execute function write_audit_log();

create trigger audit_charge
  after insert or update or delete on charge
  for each row execute function write_audit_log();

create trigger audit_markup_rate
  after insert or update or delete on markup_rate
  for each row execute function write_audit_log();
