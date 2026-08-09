import PDFDocument from "pdfkit";
import type { Response } from "express";

const currencyFormatter = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const dateFormatter = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" });

export interface SettlementExportData {
  sequentialNumber: number;
  fleetOwnerName: string;
  periodStart: Date;
  periodEnd: Date;
  status: string;
  subtotal: number;
  adjustmentsTotal: number;
  total: number;
  currency: string;
  items: {
    tripSequentialNumber: number;
    route: string;
    material: string;
    rateType: string;
    quantity: number;
    unitValue: number;
    total: number;
  }[];
  adjustments: { type: string; description: string; amount: number }[];
}

export function streamSettlementPdf(res: Response, data: SettlementExportData): void {
  const doc = new PDFDocument({ margin: 40, size: "A4" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="liquidacion-${data.sequentialNumber}.pdf"`);
  doc.pipe(res);

  doc.fontSize(18).text(`Liquidacion #${data.sequentialNumber}`, { align: "left" });
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor("#555").text(`Estado: ${data.status}`);
  doc.text(`Propietario: ${data.fleetOwnerName}`);
  doc.text(`Periodo: ${dateFormatter.format(data.periodStart)} - ${dateFormatter.format(data.periodEnd)}`);
  doc.moveDown(1);

  doc.fillColor("#000").fontSize(11).text("Viajes incluidos", { underline: true });
  doc.moveDown(0.5);

  const tableTop = doc.y;
  const columns = [
    { label: "Viaje", width: 45 },
    { label: "Ruta", width: 150 },
    { label: "Material", width: 80 },
    { label: "Tarifa", width: 60 },
    { label: "Cant.", width: 45 },
    { label: "Valor unit.", width: 75 },
    { label: "Total", width: 75 },
  ];

  let x = doc.x;
  doc.fontSize(8).fillColor("#666");
  for (const col of columns) {
    doc.text(col.label, x, tableTop, { width: col.width });
    x += col.width;
  }
  doc.moveTo(doc.x, tableTop + 12).lineTo(doc.x + 530, tableTop + 12).strokeColor("#ddd").stroke();

  let y = tableTop + 16;
  doc.fillColor("#111").fontSize(8);
  for (const item of data.items) {
    x = 40;
    const row = [
      `#${item.tripSequentialNumber}`,
      item.route,
      item.material,
      item.rateType,
      String(item.quantity),
      currencyFormatter.format(item.unitValue),
      currencyFormatter.format(item.total),
    ];
    row.forEach((value, i) => {
      doc.text(value, x, y, { width: columns[i]!.width });
      x += columns[i]!.width;
    });
    y += 16;
    if (y > 720) {
      doc.addPage();
      y = 40;
    }
  }

  doc.moveDown(2);
  doc.moveTo(40, y + 8).lineTo(570, y + 8).strokeColor("#ddd").stroke();
  doc.fontSize(10).fillColor("#000");
  doc.text(`Subtotal: ${currencyFormatter.format(data.subtotal)}`, 40, y + 16, { align: "right", width: 530 });
  doc.text(`Ajustes: ${currencyFormatter.format(data.adjustmentsTotal)}`, 40, y + 32, { align: "right", width: 530 });
  doc.fontSize(12).text(`Total: ${currencyFormatter.format(data.total)}`, 40, y + 50, { align: "right", width: 530 });

  if (data.adjustments.length > 0) {
    doc.moveDown(2);
    doc.fontSize(11).text("Ajustes", { underline: true });
    doc.fontSize(9);
    for (const adjustment of data.adjustments) {
      doc.text(`${adjustment.type} — ${adjustment.description}: ${currencyFormatter.format(adjustment.amount)}`);
    }
  }

  doc.end();
}
