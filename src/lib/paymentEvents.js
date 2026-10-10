import { emitToUser } from "./realtime.js";

export async function onPaymentSucceeded(payment, ride) {
  if (ride.driver_id) {
    emitToUser(ride.driver_id, "notification", {
      message: `Payment received: $${Number(payment.driver_earning).toFixed(2)}`,
    });
  }
}