import { Router } from "express";
import { requireDbUser } from "../middleware/auth.js";
import { isUuid } from "../lib/utils.js";
import { loadReceipt } from "../lib/receipt.js";
import { buildReceiptPdf } from "../lib/receiptPdf.js";
import { sendReceiptEmail } from "../lib/mailer.js";

const router = Router();
router.use(requireDbUser);

router.param("id", (_req, res, next, id) =>
  isUuid(id) ? next() : res.status(404).json({ error: "Receipt not found" })
);

// Only the rider or driver of the ride may see its receipt
async function findReceipt(req, res) {
  const receipt = await loadReceipt(req.params.id);
  if (!receipt || (receipt.riderId !== req.user.id && receipt.driverId !== req.user.id)) {
    res.status(404).json({ error: "Receipt not found" });
    return null;
  }
  return receipt;
}

router.get("/:id", async (req, res, next) => {
  try {
    const receipt = await findReceipt(req, res);
    if (receipt) res.json(receipt);
  } catch (err) {
    next(err);
  }
});

router.get("/:id/pdf", async (req, res, next) => {
  try {
    const receipt = await findReceipt(req, res);
    if (!receipt) return;
    const pdf = await buildReceiptPdf(receipt);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="receipt-${receipt.receiptNo}.pdf"`,
    });
    res.send(pdf);
  } catch (err) {
    next(err);
  }
});

router.post("/:id/email", async (req, res, next) => {
  try {
    const receipt = await findReceipt(req, res);
    if (!receipt) return;
    if (receipt.riderId !== req.user.id) {
      return res.status(403).json({ error: "Only the rider can email the receipt" });
    }
    const sent = await sendReceiptEmail(receipt);
    if (!sent) return res.status(503).json({ error: "Email is not set up on the server" });
    res.json({ sent: true });
  } catch (err) {
    next(err);
  }
});

export default router;