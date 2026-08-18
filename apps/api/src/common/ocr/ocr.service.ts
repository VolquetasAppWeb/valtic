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

export interface VehicleRegistrationExtraction {
  plate: string | null;
  brand: string | null;
  line: string | null;
  modelYear: string | null;
  licenseNumber: string | null;
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

  // Corre OCR sobre una foto (vale, tarjeta de propiedad, etc). Si falla
  // (foto ilegible, error del motor), no debe tumbar el flujo que la usa --
  // el archivo se guarda igual, solo sin texto extraido.
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
      this.logger.warn(`OCR fallo sobre la foto: ${(error as Error).message}`);
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

  // Lee una foto de tarjeta de propiedad (licencia de transito colombiana).
  // El documento es una tabla, no texto lineal "etiqueta: valor" — el OCR
  // por eso es heuristico y best-effort: cada campo que no se logre leer
  // queda en null para que el usuario lo complete/corrija a mano.
  extractVehicleRegistration(text: string): VehicleRegistrationExtraction {
    const normalized = text.replace(/\r/g, "");
    return {
      plate: this.extractNear(normalized, /placa/i, /\b[A-Z]{3}\d{2,3}[A-Z]?\b/),
      brand: this.extractNear(normalized, /marca/i, /\b[A-ZÀ-Ý][A-ZÀ-Ý0-9]{1,19}\b/),
      line: this.extractLineField(normalized),
      modelYear: this.extractNear(normalized, /modelo/i, /\b(19|20)\d{2}\b/),
      licenseNumber: this.extractLicenseNumber(normalized),
    };
  }

  // Busca la etiqueta y devuelve la primera coincidencia del patron de
  // valor dentro de una ventana corta de texto inmediatamente despues
  // (misma linea o la siguiente — el OCR de una tabla no siempre alinea
  // etiqueta y valor en la misma linea).
  private extractNear(text: string, label: RegExp, valuePattern: RegExp): string | null {
    const labelMatch = label.exec(text);
    if (!labelMatch) return null;

    const windowStart = labelMatch.index + labelMatch[0].length;
    const window = text.slice(windowStart, windowStart + 60);
    const valueMatch = valuePattern.exec(window);
    return valueMatch?.[0]?.trim() ?? null;
  }

  private extractLineField(text: string): string | null {
    const labelMatch = /linea/i.exec(text);
    if (!labelMatch) return null;

    const windowStart = labelMatch.index + labelMatch[0].length;
    const window = text.slice(windowStart, windowStart + 40);
    // La linea suele ser varias palabras/numeros (ej. "HUNK 160 FI ST");
    // se corta en el salto de linea o al llegar a la siguiente etiqueta.
    const match = /^[\s:]*([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 .-]{1,29})/.exec(window);
    return match?.[1]?.trim() ?? null;
  }

  private extractLicenseNumber(text: string): string | null {
    // "LICENCIA DE TRANSITO No 10034039969" — se ancla a esas dos palabras
    // en vez de buscar la corrida de digitos mas larga del documento, para
    // no confundirla con la cedula del propietario u otro numero largo.
    const match = /licencia[\s\S]{0,10}transito[\s\S]{0,20}?(\d{8,12})/i.exec(text);
    return match?.[1] ?? null;
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
