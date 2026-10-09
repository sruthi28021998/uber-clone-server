alter table users
  add column if not exists is_online boolean not null default false,
  add column if not exists current_lat double precision,
  add column if not exists current_lng double precision;