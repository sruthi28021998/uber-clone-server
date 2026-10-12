create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null unique references rides(id) on delete cascade,
  rider_id uuid not null references users(id) on delete cascade,
  driver_id uuid not null references users(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz default now()
);

create index if not exists reviews_driver_id_idx on reviews (driver_id);

alter table reviews enable row level security;

create or replace view driver_ratings with (security_invoker = true) as
select driver_id,
       round(avg(rating)::numeric, 2) as avg_rating,
       count(*) as review_count
from reviews
group by driver_id;