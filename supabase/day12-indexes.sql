create index if not exists payments_ride_id_idx on payments (ride_id);
create index if not exists rides_rider_created_idx on rides (rider_id, created_at desc);
create index if not exists rides_open_requests_idx on rides (created_at desc)
  where status = 'requested' and driver_id is null;