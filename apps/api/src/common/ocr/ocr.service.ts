import { Injectable, Logger } from "@nestjs/common";
import { createWorker } from "tesseract.js";
import { Jimp, JimpMime } from "jimp";

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

// createWorker puede colgarse indefinidamente (ej. si no logra descargar el
// modelo de idioma) sin lanzar una excepcion que el try/catch pueda atrapar
// — por eso el limite de tiempo es imprescindible, no solo una optimizacion.
const OCR_TIMEOUT_MS = 20_000;
// La tarjeta de propiedad se intenta en varias rotaciones (ver mas abajo),
// asi que necesita mas presupuesto de tiempo total que un OCR de una sola
// pasada.
const REGISTRATION_OCR_TIMEOUT_MS = 60_000;
// Fotos de camara vienen en resoluciones muy altas (varios miles de px de
// ancho); reducirlas antes del OCR baja mucho el tiempo de reconocimiento
// y el uso de memoria sin perder legibilidad del texto.
const MAX_OCR_IMAGE_WIDTH = 1600;
// Si la foto viene chica (ej. una captura ya comprimida, no la original de
// camara), agrandarla ayuda a Tesseract a segmentar mejor los caracteres —
// sin esto, en fotos de baja resolucion se pierden justo las etiquetas mas
// pequenas de la tarjeta (PLACA, MARCA, etc.) aunque los valores en negrita
// se sigan leyendo bien.
const MIN_OCR_IMAGE_WIDTH = 1200;
// Angulos a probar, en orden de probabilidad: la mayoria de fotos ya vienen
// derechas o giradas 90° en un sentido u otro; 180° (foto al reves) es el
// caso menos comun.
const ROTATIONS_TO_TRY = [0, 90, 270, 180] as const;
// Cuantos de los 5 campos hay que leer para dejar de probar rotaciones.
const GOOD_ENOUGH_SCORE = 4;

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  // Corre OCR sobre una foto (vale, tarjeta de propiedad, etc). Si falla o
  // se demora demasiado (foto ilegible, error del motor, sin red para bajar
  // el modelo de idioma), no debe tumbar ni colgar el flujo que la usa -- el
  // archivo se guarda igual, solo sin texto extraido.
  async extractText(imageBuffer: Buffer): Promise<string> {
    try {
      return await this.withTimeout(this.runOcr(imageBuffer), OCR_TIMEOUT_MS);
    } catch (error) {
      this.logger.warn(`OCR fallo sobre la foto: ${(error as Error).message}`);
      return "";
    }
  }

  private async runOcr(imageBuffer: Buffer): Promise<string> {
    const worker = await createWorker("spa");
    try {
      const {
        data: { text },
      } = await worker.recognize(imageBuffer);
      return text;
    } finally {
      await worker.terminate();
    }
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`OCR excedio el limite de ${ms}ms`)), ms);
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
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

  // Punto de entrada para la foto de tarjeta de propiedad: prueba la imagen
  // en varias rotaciones (las fotos de celular llegan giradas con mucha
  // frecuencia y Tesseract no corrige orientacion por si solo) y se queda
  // con la que mas campos logro leer. Nunca lanza — ante cualquier falla
  // devuelve todo en null para que el usuario complete el formulario a mano.
  async extractVehicleRegistrationFromImage(
    imageBuffer: Buffer,
  ): Promise<{ rawText: string; extraction: VehicleRegistrationExtraction }> {
    const empty = { plate: null, brand: null, line: null, modelYear: null, licenseNumber: null };
    try {
      return await this.withTimeout(
        this.runVehicleRegistrationRotations(imageBuffer),
        REGISTRATION_OCR_TIMEOUT_MS,
      );
    } catch (error) {
      // El mensaje suele decir la causa real (ej. formato de imagen no
      // soportado como HEIC de iPhone, que ni Jimp ni tesseract leen) — se
      // deja como error, no warn, para que quede visible sin tener que subir
      // el nivel de log.
      this.logger.error(`OCR de tarjeta de propiedad fallo: ${(error as Error).message}`, (error as Error).stack);
      return { rawText: "", extraction: empty };
    }
  }

  private async runVehicleRegistrationRotations(
    imageBuffer: Buffer,
  ): Promise<{ rawText: string; extraction: VehicleRegistrationExtraction }> {
    const worker = await createWorker("spa");
    try {
      let best: { rawText: string; extraction: VehicleRegistrationExtraction; score: number } | null = null;

      for (const angle of ROTATIONS_TO_TRY) {
        const preprocessed = await this.preprocessForOcr(imageBuffer, angle);
        const {
          data: { text },
        } = await worker.recognize(preprocessed);
        const extraction = this.extractVehicleRegistration(text);
        const score = this.scoreRegistrationExtraction(extraction);

        // Diagnostico: sin esto, cuando una foto no calza con ningun
        // patron no hay forma de saber si el OCR leyo texto ilegible o si
        // simplemente no lo intento (foto en un formato que no se pudo
        // decodificar, por ejemplo).
        this.logger.debug(
          `OCR tarjeta rotacion=${angle}° score=${score} texto="${text.replace(/\s+/g, " ").trim().slice(0, 200)}"`,
        );

        if (!best || score > best.score) {
          best = { rawText: text, extraction, score };
        }
        if (score >= GOOD_ENOUGH_SCORE) {
          break;
        }
      }

      return { rawText: best!.rawText, extraction: best!.extraction };
    } finally {
      await worker.terminate();
    }
  }

  // Reduce el tamano (las fotos de camara vienen enormes), pasa a escala de
  // grises y sube el contraste (ayuda mucho cuando el texto esta sobre un
  // fondo con patron/marca de agua, como en la tarjeta de propiedad), y rota
  // si hace falta, antes de pasarla al motor de OCR.
  private async preprocessForOcr(imageBuffer: Buffer, degrees: number): Promise<Buffer> {
    const image = await Jimp.read(imageBuffer);
    if (image.width > MAX_OCR_IMAGE_WIDTH) {
      image.resize({ w: MAX_OCR_IMAGE_WIDTH });
    } else if (image.width < MIN_OCR_IMAGE_WIDTH) {
      image.resize({ w: MIN_OCR_IMAGE_WIDTH });
    }
    image.greyscale();
    image.contrast(0.3);
    if (degrees !== 0) {
      image.rotate(degrees);
    }
    return image.getBuffer(JimpMime.jpeg);
  }

  private scoreRegistrationExtraction(extraction: VehicleRegistrationExtraction): number {
    return Object.values(extraction).filter((value) => value !== null).length;
  }

  private readonly PLATE_PATTERN = /\b[A-Z]{3}\d{2,3}[A-Z]?\b/;
  private readonly BRAND_PATTERN = /\b[A-ZÀ-Ý][A-ZÀ-Ý0-9]{1,19}\b/;
  private readonly YEAR_PATTERN = /\b(19|20)\d{2}\b/;

  // Lee una foto de tarjeta de propiedad (licencia de transito colombiana).
  // El documento es una tabla, no texto lineal "etiqueta: valor" — el OCR
  // por eso es heuristico y best-effort: cada campo que no se logre leer
  // queda en null para que el usuario lo complete/corrija a mano.
  //
  // "Linea" es aparte de los otros 3 (placa/marca/modelo): no tiene un
  // patron de valor propio confiable (puede ser una palabra como "AVEO" o
  // varias como "HUNK 160 FI ST", y a veces la etiqueta vecina "MODELO" sale
  // ilegible del OCR y se confundiria con el valor). En vez de adivinar
  // donde empieza y termina, siempre se deriva DESPUES, como lo que hay
  // entre el final del valor de marca y el inicio del valor de modelo — dos
  // puntos que si se localizan con patrones confiables.
  extractVehicleRegistration(text: string): VehicleRegistrationExtraction {
    // Sin quitar tildes, "TRÁNSITO" no calzaria con /transito/i (el flag i
    // no pliega acentos) — el resto de valores (placas, marcas, anos) no
    // usa caracteres acentuados, asi que normalizar todo el texto es seguro.
    const normalized = this.stripAccents(text.replace(/\r/g, ""));

    // Metodo 1: la etiqueta y su valor quedan pegados (ej. "PLACA\nBYN613"
    // o "PLACA BYN613 MARCA CHEVROLET" en la misma linea).
    let plate = this.extractNear(normalized, /placa/i, this.PLATE_PATTERN);
    let brand = this.extractNear(normalized, /marca/i, this.BRAND_PATTERN);
    let modelYear = this.extractNear(normalized, /modelo/i, this.YEAR_PATTERN);

    // Metodo 2 (respaldo): el formato oficial de la tarjeta trae las 4
    // etiquetas juntas en una fila y los 4 valores en la fila de abajo
    // (ej. "PLACA MARCA LINEA MODELO" / "BYN613 CHEVROLET AVEO 2006") — ahi
    // el valor de PLACA no esta cerca de la palabra "PLACA", esta despues
    // de las otras 3 etiquetas. Se busca en el texto que sigue a la ULTIMA
    // etiqueta encontrada, tomando los valores en el mismo orden fijo en que
    // siempre aparecen impresas en el documento oficial.
    if (!plate || !brand || !modelYear) {
      const labelMatches = [/placa/i, /marca/i, /linea/i, /modelo/i]
        .map((re) => re.exec(normalized))
        .filter((m): m is RegExpExecArray => m !== null);

      if (labelMatches.length > 0) {
        const lastLabelEnd = Math.max(...labelMatches.map((m) => m.index + m[0].length));
        const valuesArea = normalized.slice(lastLabelEnd, lastLabelEnd + 200);

        let cursor = 0;
        if (!plate) {
          const m = this.PLATE_PATTERN.exec(valuesArea);
          if (m) {
            plate = m[0].trim();
            cursor = m.index + m[0].length;
          }
        }
        if (!brand) {
          const m = this.BRAND_PATTERN.exec(valuesArea.slice(cursor));
          if (m) {
            brand = m[0].trim();
            cursor += m.index + m[0].length;
          }
        }
        if (!modelYear) {
          const m = this.YEAR_PATTERN.exec(valuesArea.slice(cursor));
          if (m) modelYear = m[0].trim();
        }
      }
    }

    // Metodo 3 (ultimo recurso, sin etiquetas): en fotos de baja resolucion
    // el OCR a veces pierde TODAS las etiquetas (letra chica e ilegible)
    // pero igual lee bien los valores (letra grande en negrita) — confirmado
    // en pruebas reales. Si no se encontro ni una sola etiqueta, se busca
    // directamente el patron de placa en todo el texto como ancla, y se
    // toman marca/modelo en el mismo orden fijo de siempre, justo despues de
    // ella. Mas propenso a datos incorrectos que los metodos anteriores,
    // pero el usuario revisa el formulario antes de confirmar.
    if (!plate) {
      const m = this.PLATE_PATTERN.exec(normalized);
      if (m) {
        plate = m[0].trim();
        const afterPlate = normalized.slice(m.index + m[0].length, m.index + m[0].length + 200);

        let cursor = 0;
        if (!brand) {
          const bm = this.BRAND_PATTERN.exec(afterPlate);
          if (bm) {
            brand = bm[0].trim();
            cursor = bm.index + bm[0].length;
          }
        }
        if (!modelYear) {
          const ym = this.YEAR_PATTERN.exec(afterPlate.slice(cursor));
          if (ym) modelYear = ym[0].trim();
        }
      }
    }

    const line = this.deriveLineBetween(normalized, brand, modelYear);

    return { plate, brand, line, modelYear, licenseNumber: this.extractLicenseNumber(normalized) };
  }

  // "Linea" = lo que hay entre el final del valor de marca y el inicio del
  // valor de modelo, en el texto real (no en una sub-ventana ya recortada) —
  // busca la posicion literal de ambos valores para no depender de por cual
  // metodo se encontraron.
  private deriveLineBetween(text: string, brand: string | null, modelYear: string | null): string | null {
    if (!brand) return null;
    const brandIdx = text.indexOf(brand);
    if (brandIdx === -1) return null;
    const afterBrand = brandIdx + brand.length;

    const yearIdx = modelYear ? text.indexOf(modelYear, afterBrand) : -1;
    const lineArea =
      yearIdx > -1 ? text.slice(afterBrand, yearIdx) : this.windowUntilNextLabel(text, afterBrand, 40);

    // En el layout "apilado" (etiqueta y valor cada uno en su propia linea)
    // este tramo trae la propia etiqueta "LINEA" pegada antes del valor, y a
    // veces "MODELO" pegada despues — se descartan como ruido; en el layout
    // de fila de etiquetas + fila de valores el tramo ya viene limpio y esto
    // no cambia nada.
    const withoutLabels = lineArea.replace(/\b(placa|marca|linea|modelo)\b/gi, " ");
    const collapsed = withoutLabels.replace(/\s+/g, " ").trim();
    return collapsed || null;
  }

  // Otras etiquetas conocidas de la tarjeta — sirven para cortar la ventana
  // de busqueda de un valor ANTES de que se meta a la siguiente etiqueta,
  // que pasa seguido cuando el OCR pone etiqueta y valor en la misma linea
  // (ej. "LINEA AVEO MODELO 2006" sin salto de linea entre campos).
  private readonly NEXT_LABEL =
    /\b(placa|marca|linea|modelo|licencia|cilindrada|color|clase|carroceria|combustible|servicio|capacidad)\b/i;

  private windowUntilNextLabel(text: string, start: number, maxLen: number): string {
    const raw = text.slice(start, start + maxLen);
    const nextLabelMatch = this.NEXT_LABEL.exec(raw);
    return nextLabelMatch ? raw.slice(0, nextLabelMatch.index) : raw;
  }

  // Busca la etiqueta y devuelve la primera coincidencia del patron de
  // valor dentro de una ventana corta de texto inmediatamente despues
  // (misma linea o la siguiente — el OCR de una tabla no siempre alinea
  // etiqueta y valor en la misma linea), sin pasarse a la siguiente etiqueta.
  private extractNear(text: string, label: RegExp, valuePattern: RegExp): string | null {
    const labelMatch = label.exec(text);
    if (!labelMatch) return null;

    const window = this.windowUntilNextLabel(text, labelMatch.index + labelMatch[0].length, 60);
    const valueMatch = valuePattern.exec(window);
    return valueMatch?.[0]?.trim() ?? null;
  }

  private extractLicenseNumber(text: string): string | null {
    // "LICENCIA DE TRANSITO No 10034039969" — se ancla a esas dos palabras
    // en vez de buscar la corrida de digitos mas larga del documento, para
    // no confundirla con la cedula del propietario u otro numero largo.
    const anchor = /licencia[\s\S]{0,10}transito[\s\S]{0,20}?((?:\d[\s.]?){8,12})/i.exec(text);
    if (anchor?.[1]) {
      const digits = anchor[1].replace(/[^\d]/g, "");
      if (digits.length >= 8) return digits;
    }
    return null;
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
