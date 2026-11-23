-- Who goes to the inspection (employees the owner picks).
alter table public.inspections add column if not exists assignee_ids uuid[] not null default '{}';
