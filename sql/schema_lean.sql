create extension if not exists pgcrypto;

create table if not exists raw_feed_items (
  id bigint generated always as identity primary key,
  source_name text not null,
  title text not null,
  summary text,
  source_url text not null,
  url_hash text not null unique,
  published_at timestamptz,
  inserted_at timestamptz not null default now()
);

create index if not exists raw_feed_items_published_idx on raw_feed_items (published_at desc);
create index if not exists raw_feed_items_inserted_idx on raw_feed_items (inserted_at desc);

create table if not exists topic_candidates (
  id bigint generated always as identity primary key,
  candidate_hash text not null unique,
  title text not null,
  summary text,
  source_url text,
  traffic_score int not null default 0 check (traffic_score between 0 and 100),
  conversion_score int not null default 0 check (conversion_score between 0 and 100),
  discover_score int not null default 0 check (discover_score between 0 and 100),
  social_score int not null default 0 check (social_score between 0 and 100),
  editorial_score int not null default 0 check (editorial_score between 0 and 100),
  total_score int not null default 0 check (total_score between 0 and 100),
  status text not null default 'active' check (status in ('active','archived','published','dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists topic_candidates_status_score_idx on topic_candidates (status, total_score desc);
create index if not exists topic_candidates_updated_idx on topic_candidates (updated_at desc);

create table if not exists editor_actions (
  id bigint generated always as identity primary key,
  topic_candidate_id bigint not null references topic_candidates(id) on delete cascade,
  action_type text not null check (action_type in ('accepted','rejected','published','deferred')),
  note text,
  created_at timestamptz not null default now()
);

create or replace function cleanup_old_data()
returns void
language plpgsql
as $$
begin
  delete from raw_feed_items where inserted_at < now() - interval '14 days';
  update topic_candidates
  set status = 'archived', updated_at = now()
  where status = 'active'
    and updated_at < now() - interval '180 days';
end;
$$;
