import nodemailer from "nodemailer";
import { buildReceiptPdf } from "./receiptPdf.js";

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM } = process.env;
const port = Number(SMTP_PORT || 587);

const transporter =
  SMTP_HOST && SMTP_USER && SMTP_PASS
    ? nodemailer.createTransport({
        host: SMTP_HOST,
        port,
        secure: port === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
      })
    : null;

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Returns true if the email was sent
export async function sendReceiptEmail(receipt) {
  if (!transporter) {
    console.log("SMTP not configured, skipping receipt email");
    return false;
  }
  if (!receipt.rider.email) return false;

  const pdf = await buildReceiptPdf(receipt);
  await transporter.sendMail({
    from: MAIL_FROM || SMTP_USER,
    to: receipt.rider.email,
    subject: `Your RideNow receipt #${receipt.receiptNo}`,
    html: `
      <h2>Thanks for riding with RideNow, ${esc(receipt.rider.name)}!</h2>
      <p><b>From:</b> ${esc(receipt.pickup)}<br/>
         <b>To:</b> ${esc(receipt.dropoff)}<br/>
         <b>Total paid:</b> ${receipt.amount.toFixed(2)} ${esc(receipt.currency)}</p>
      <p>Your receipt is attached as a PDF.</p>`,
    attachments: [{ filename: `receipt-${receipt.receiptNo}.pdf`, content: pdf }],
  });
  return true;
}