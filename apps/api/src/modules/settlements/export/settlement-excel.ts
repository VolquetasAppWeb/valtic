import ExcelJS from "exceljs";
import type { Response } from "express";
import type { SettlementExportData } from "./settlement-pdf";

export async function streamSettlementExcel(res: Response, data: SettlementExportData): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "VALTIC";
  const sheet = workbook.addWorksheet(`Liquidacion ${data.sequentialNumber}`);

  sheet.addRow([`Liquidacion #${data.sequentialNumber}`]);
  sheet.addRow([`Propietario: ${data.fleetOwnerName}`]);
  sheet.addRow([`Periodo: ${data.periodStart.toISOString().slice(0, 10)} a ${data.periodEnd.toISOString().slice(0, 10)}`]);
  sheet.addRow([`Estado: ${data.status}`]);
  sheet.addRow([]);

  const headerRow = sheet.addRow(["Viaje", "Ruta", "Material", "Tipo de tarifa", "Cantidad", "Valor unitario", "Total"]);
  headerRow.font = { bold: true };

  for (const item of data.items) {
    sheet.addRow([
      item.tripSequentialNumber,
      item.route,
      item.material,
      item.rateType,
      item.quantity,
      item.unitValue,
      item.total,
    ]);
  }

  sheet.addRow([]);
  sheet.addRow(["", "", "", "", "", "Subtotal", data.subtotal]);
  sheet.addRow(["", "", "", "", "", "Ajustes", data.adjustmentsTotal]);
  const totalRow = sheet.addRow(["", "", "", "", "", "Total", data.total]);
  totalRow.font = { bold: true };

  if (data.adjustments.length > 0) {
    sheet.addRow([]);
    sheet.addRow(["Ajustes"]).font = { bold: true };
    sheet.addRow(["Tipo", "Descripcion", "Monto"]).font = { bold: true };
    for (const adjustment of data.adjustments) {
      sheet.addRow([adjustment.type, adjustment.description, adjustment.amount]);
    }
  }

  sheet.columns.forEach((column) => {
    column.width = 22;
  });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="liquidacion-${data.sequentialNumber}.xlsx"`);

  await workbook.xlsx.write(res);
  res.end();
}
