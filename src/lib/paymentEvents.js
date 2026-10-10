import { emitToUser } from "./realtime.js";
import { loadReceipt } from "./receipt.js";
import { sendReceiptEmail } from "./mailer.js";

export async function onPaymentSucceeded(payment, ride) {
  if (ride.driver_id) {
    emitToUser(ride.driver_id, "notification", {
      message: `Payment received: $${Number(payment.driver_earning).toFixed(2)}`,
    });
  }

  try {
    const receipt = await loadReceipt(ride.id);
    if (receipt) await sendReceiptEmail(receipt);
  } catch (err) {
    console.error("Receipt email failed:", err.message);
  }
}