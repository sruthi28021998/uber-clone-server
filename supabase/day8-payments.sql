alter table payments
  add column if not exists platform_fee numeric(10,2),
  add column if not exists driver_earning numeric(10,2);