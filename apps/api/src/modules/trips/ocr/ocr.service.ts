import { Injectable, Logger } from "@nestjs/common";
import { createWorker } from "tesseract.js";

export interface VoucherExtraction {
  quantity: number | null;
  unit: "TON" | "CUBIC_METER" | null;
  voucherNumber: string | null;
  // Cualquier otro campo con etiqueta que se haya podido leer (cliente,
  // obra, placa, conductor, fecha, etc). La clave es la etiqueta tal como
  // se muestra en pantalla; el set exacto varia segun el formato del vale.
  fields: Record<string, string>;
}

// Etiquetas conocidas de los vales tipo "recibo de entrega de material"
// (ej. Dromos) -> nombre legible para mostrar. La clave va sin tildes/en
// minuscula porque asi se compara despues de normalizar el texto leido.
const KNOWN_LABELS: Record<string, string> = {
  cliente: "Cliente",
  obra: "Obra",
  fecha: "Fecha",
  producto: "Producto",
  transporta: "Transporta",
  placa: "Placa",
  conductor: "Conductor",
  identificacion: "Identificación",
  despachador: "Despachador",
  observaciones: "Observaciones",
};

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  // Corre OCR sobre la foto del vale. Si falla (foto ilegible, error del
  // motor), no debe tumbar el flujo de cierre del viaje -- se guarda el
  // vale igual, solo sin texto extraido.
  async extractText(imageBuffer: Buffer): Promise<string> {
    try {
      const worker = await createWorker("spa");
      try {
        const {
          data: { text },
        } = await worker.recognize(imageBuffer);
        return text;
      } finally {
        await worker.terminate();
      }
    } catch (error) {
      this.logger.warn(`OCR fallo sobre la foto del vale: ${(error as Error).message}`);
      return "";
    }
  }

  // Los vales tipo "recibo de entrega de material" (ej. Dromos) no traen
  // valor en pesos: traen cantidad/volumen (ej. "Volumen: 14 M3"), numero
  // de vale, y una serie de campos "Etiqueta: valor" (cliente, obra, placa,
  // conductor, fecha, etc). Es una heuristica de texto, no un dato
  // confiable — sirve solo para que admin/dispatcher lo comparen contra
  // los datos registrados del viaje.
  extractVoucherData(text: string): VoucherExtraction {
    return {
      ...this.extractQuantity(text),
      voucherNumber: this.extractVoucherNumber(text),
      fields: this.extractLabeledFields(text),
    };
  }

  private extractQuantity(text: string): { quantity: number | null; unit: "TON" | "CUBIC_METER" | null } {
    const patterns: Array<{ regex: RegExp; unit: "TON" | "CUBIC_METER" }> = [
      { regex: /(?:volumen|cantidad)[:\s]*([\d.,]+)\s*m\s?3/i, unit: "CUBIC_METER" },
      { regex: /([\d.,]+)\s*m\s?3\b/i, unit: "CUBIC_METER" },
      { regex: /(?:volumen|cantidad)[:\s]*([\d.,]+)\s*(?:ton|tonelada)/i, unit: "TON" },
      { regex: /([\d.,]+)\s*(?:ton|tonelada)/i, unit: "TON" },
    ];

    for (const { regex, unit } of patterns) {
      const match = text.match(regex);
      const raw = match?.[1];
      if (raw) {
        const value = this.parseNumber(raw);
        if (value !== null && value > 0 && value < 1000) {
          return { quantity: value, unit };
        }
      }
    }
    return { quantity: null, unit: null };
  }

  private extractVoucherNumber(text: string): string | null {
    // Busca linea por linea para no "arrastrar" el valor de la siguiente
    // linea cuando el campo del vale viene vacio (frecuente en estos recibos).
    const line = text.split(/\r?\n/).find((l) => /no\.?\s?vale/i.test(l));
    if (!line) {
      return null;
    }
    const match = line.match(/no\.?\s?vale[:\s]*([A-Za-z0-9-]{2,})/i);
    return match?.[1] ?? null;
  }

  // Lee linea por linea buscando el patron "Etiqueta: valor" y se queda
  // solo con las etiquetas conocidas de este tipo de vale (evita capturar
  // ruido del OCR como lineas sueltas o codigos de barras mal leidos).
  private extractLabeledFields(text: string): Record<string, string> {
    const result: Record<string, string> = {};

    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-zÀ-ÿ.\s]{3,25}?)\s*:\s*(.+?)\s*$/);
      if (!match) continue;

      const [, rawLabel, rawValue] = match;
      if (!rawLabel || !rawValue) continue;
      const normalizedLabel = this.stripAccents(rawLabel.toLowerCase()).replace(/[^a-z]/g, "");
      const displayLabel = KNOWN_LABELS[normalizedLabel];
      const value = rawValue.trim();

      if (displayLabel && value) {
        result[displayLabel] = value;
      }
    }

    return result;
  }

  private stripAccents(value: string): string {
    return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  private parseNumber(raw: string): number | null {
    const cleaned = raw.trim();
    const normalized = cleaned.replace(/,(\d{1,2})$/, "").replace(/[.,]/g, "");
    const value = Number(normalized);
    return Number.isFinite(value) && normalized.length > 0 ? value : null;
  }
}
