import { supabase } from "../config/supabase.js";

// Returns receipt data for a paid ride, or null if the ride isn't paid
export async function loadReceipt(rideId) {
  const { data: ride, error } = await supabase
    .from("rides")
    .select(
      "*, rider:users!rider_id(name, email), driver:users!driver_id(name), payments(id, amount, currency, status, created_at)"
    )
    .eq("id", rideId)
    .maybeSingle();
  if (error) throw error;

  const payment = ride?.payments?.find((p) => p.status === "succeeded");
  if (!ride || !payment) return null;

  return {
    receiptNo: payment.id.slice(0, 8).toUpperCase(),
    date: payment.created_at,
    rideId: ride.id,
    riderId: ride.rider_id,
    driverId: ride.driver_id,
    rider: { name: ride.rider?.name ?? "Rider", email: ride.rider?.email ?? null },
    driverName: ride.driver?.name ?? "Driver",
    pickup: ride.pickup_address,
    dropoff: ride.dropoff_address,
    rideType: ride.ride_type,
    amount: Number(payment.amount),
    currency: payment.currency.toUpperCase(),
  };
}