import PDFDocument from "pdfkit";

export function buildReceiptPdf(r) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(24).text("RideNow", { align: "center" });
    doc.fontSize(14).text("Ride Receipt", { align: "center" });
    doc.moveDown(2);

    const row = (label, value) => {
      doc.fontSize(10).fillColor("#666666").text(label);
      doc.fontSize(12).fillColor("#000000").text(String(value));
      doc.moveDown(0.6);
    };

    row("Receipt no.", r.receiptNo);
    row("Date", new Date(r.date).toLocaleString());
    row("Rider", r.rider.name);
    row("Driver", r.driverName);
    row("Pickup", r.pickup);
    row("Drop-off", r.dropoff);
    row("Ride type", r.rideType);
    doc.moveDown();
    doc.fontSize(16).text(`Total paid: ${r.amount.toFixed(2)} ${r.currency}`);

    doc.end();
  });
}