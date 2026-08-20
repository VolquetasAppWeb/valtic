import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createWorker } from "tesseract.js";
import { GoogleGenAI, Type } from "@google/genai";
import type { AppConfig } from "../../config/configuration";

export interface VoucherExtraction {
  quantity: number | null;
  unit: "TON" | "CUBIC_METER" | null;
  voucherNumber: string | null;
  // Cualquier otro campo con etiqueta que se haya podido leer (cliente,
  // obra, placa, conductor, fecha, etc). La clave es la etiqueta tal como
  // se muestra en pantalla; el set exacto varia segun el formato del vale.
  fields: Record<string, string>;
}

// Todos los campos que trae una tarjeta de propiedad colombiana (frente y
// reverso). Todos nullable: es best-effort, lo que no se logre leer con
// certeza queda en null para que el usuario lo revise/complete despues.
export interface VehicleRegistrationExtraction {
  // Datos generales del documento
  country: string | null;
  licenseNumber: string | null; // Numero de licencia de transito
  licenseBarcode: string | null; // Codigo de barras inferior (LIC)

  // Cara frontal
  plate: string | null;
  brand: string | null;
  line: string | null;
  modelYear: string | null;
  cc: string | null; // Cilindrada
  color: string | null;
  serviceType: string | null; // Servicio
  vehicleClass: string | null; // Clase de vehiculo
  bodyType: string | null; // Tipo carroceria
  fuelType: string | null; // Combustible
  loadCapacity: string | null; // Capacidad (Kg/PSJ)
  engineNumber: string | null;
  serialNumber: string | null;
  vin: string | null;
  chassisNumber: string | null;
  ownerName: string | null; // Nombre/razon social del propietario
  ownerDocumentNumber: string | null; // Identificacion del propietario

  // Cara posterior
  mobilityRestriction: string | null;
  armor: string | null; // Blindaje
  horsepower: string | null; // Potencia (HP)
  importDeclaration: string | null;
  importDate: string | null;
  doors: string | null;
  propertyLimitation: string | null;
  registrationDate: string | null; // Fecha de matricula
  licenseIssueDate: string | null; // Fecha de expedicion Lic. Tto.
  licenseExpirationDate: string | null; // Fecha de vencimiento
  transitAuthority: string | null; // Organismo de transito
}

// Todos los campos que trae una cedula de ciudadania colombiana (frente y
// reverso). Todos nullable: best-effort, lo que no se logre leer con
// certeza queda en null. No incluye elementos puramente graficos que un
// modelo de lenguaje no puede "leer" como texto (firma, huella, codigo QR
// como imagen) — solo lo que efectivamente es texto/numeros en el documento.
export interface CedulaExtraction {
  documentType: string | null; // Tipo de documento, ej. "CC"
  country: string | null;
  documentNumber: string | null; // NUIP
  lastName: string | null;
  firstName: string | null;
  nationality: string | null;
  height: string | null; // Estatura
  sex: string | null;
  birthDate: string | null; // Formato ISO YYYY-MM-DD si es claro
  bloodType: string | null; // G.S. / RH
  birthPlace: string | null;
  issuePlace: string | null; // Fecha y lugar de expedicion, tal como aparece
  documentExpirationDate: string | null; // Formato ISO YYYY-MM-DD si es claro
  supportNumber: string | null; // Numero de soporte/serie (reverso)
  mrz: string | null; // Codigo de lectura mecanica (reverso), si trae
}

// Una fila de la tabla "CATEGORIAS AUTORIZADAS" del reverso — cada categoria
// tiene su PROPIA vigencia y servicio (una licencia tipica trae una fila
// "B2 ... PARTICULAR" y otra "C2 ... PUBLICO" con vigencias distintas), asi
// que no se pueden aplanar en un solo campo sin perder esa informacion.
export interface DriverLicenseCategoryEntry {
  category: string | null; // ej. "C2"
  vehicleClass: string | null; // Clase de vehiculo de esa fila
  expiration: string | null; // Vigencia de esa fila, formato ISO YYYY-MM-DD si es clara
  serviceType: string | null; // Servicio de esa fila (PARTICULAR/PUBLICO)
}

// Todos los campos que trae una licencia de conduccion colombiana (frente y
// reverso). "documentNumber" es el numero de documento/cedula reimpreso en
// el frente de la licencia (NO el numero de LC) — se usa junto con
// "fullName" para comparar contra la cedula y avisar si no coinciden.
export interface DriverLicenseExtraction {
  country: string | null;
  documentType: string | null; // Tipo de documento, ej. "Licencia de conduccion"
  licenseNumber: string | null; // Numero de LC (bajo el codigo de barras, reverso)
  licenseBarcode: string | null; // Codigo de barras/identificador inferior, si es distinto del numero de LC
  fullName: string | null; // Nombre completo (frente)
  documentNumber: string | null; // Numero de documento/cedula impreso como "No." en el frente
  birthDate: string | null;
  issueDate: string | null; // Fecha de expedicion (frente)
  bloodType: string | null; // Sangre/RH (frente)
  restrictions: string | null; // Restricciones del conductor (frente)
  issuingAuthority: string | null; // Organismo de transito expedidor (frente)
  categories: DriverLicenseCategoryEntry[]; // Una fila por cada categoria autorizada (reverso)
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
// La API de Gemini puede demorar bastante mas de lo esperado en algunos
// llamados (picos de latencia, fotos grandes) — 60s da margen de sobra sin
// que el usuario espere demasiado; no hay reintentos ni multiples variantes
// como tenia la version con tesseract.js, asi que solo hay una oportunidad.
const GEMINI_TIMEOUT_MS = 60_000;

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);
  private readonly gemini: GoogleGenAI | null;
  private readonly geminiModel: string;

  constructor(private readonly configService: ConfigService<AppConfig, true>) {
    const { apiKey, model } = this.configService.get("gemini", { infer: true });
    this.gemini = apiKey ? new GoogleGenAI({ apiKey }) : null;
    this.geminiModel = model;
    if (!this.gemini) {
      this.logger.warn("GEMINI_API_KEY no configurada — el OCR de cedula/licencia/tarjeta de propiedad quedara deshabilitado.");
    }
  }

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

  // Detecta el mime type real de la foto (JPEG/PNG/WEBP/HEIC) mirando los
  // primeros bytes — el nombre de archivo o el Content-Type del navegador no
  // siempre son confiables, y Gemini necesita el mime type correcto.
  private detectImageMimeType(buffer: Buffer): string {
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
    if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
    if (buffer.length >= 12 && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
    return "image/jpeg";
  }

  // Motor comun para los 4 tipos de documento: le manda la foto a Gemini con
  // un prompt especifico y un schema JSON estricto (asi la respuesta ya
  // viene tipada, sin tener que parsear texto libre) y devuelve el objeto
  // parseado. Nunca lanza — sin API key, con la red caida, o si Gemini no
  // logra leer la foto, devuelve `empty` para que el usuario complete el
  // formulario a mano, igual que hacia la version con tesseract.js.
  private async extractWithGemini<T>(
    imageBuffers: Buffer[],
    logLabel: string,
    prompt: string,
    responseSchema: Record<string, unknown>,
    empty: T,
  ): Promise<{ rawText: string; extraction: T }> {
    if (!this.gemini) {
      return { rawText: "", extraction: empty };
    }

    const gemini = this.gemini;
    const callGemini = () =>
      this.withTimeout(
        gemini.models.generateContent({
          model: this.geminiModel,
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                ...imageBuffers.map((buffer) => ({
                  inlineData: { mimeType: this.detectImageMimeType(buffer), data: buffer.toString("base64") },
                })),
              ],
            },
          ],
          config: { responseMimeType: "application/json", responseSchema },
        }),
        GEMINI_TIMEOUT_MS,
      );

    // El tier gratuito de Gemini a veces devuelve 503 "high demand" o 429
    // "resource exhausted" — errores transitorios, no un problema de la
    // foto. Con el volumen bajo de este proyecto (decenas de fotos al mes)
    // vale la pena un reintento corto antes de rendirse y dejar los campos
    // en null.
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await callGemini();
        const rawText = response.text ?? "";
        const parsed = JSON.parse(rawText) as T;
        return { rawText, extraction: { ...empty, ...parsed } };
      } catch (error) {
        const message = (error as Error).message;
        const isRetryable = /503|429|UNAVAILABLE|RESOURCE_EXHAUSTED/.test(message);
        if (attempt === 1 && isRetryable) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          continue;
        }
        // El mensaje suele decir la causa real (ej. imagen rechazada por
        // filtros de seguridad, JSON invalido, o timeout) — se deja como
        // error, no warn, para que quede visible sin subir el nivel de log.
        this.logger.error(`OCR Gemini (${logLabel}) fallo: ${message}`, (error as Error).stack);
        return { rawText: "", extraction: empty };
      }
    }
    return { rawText: "", extraction: empty };
  }

  // Punto de entrada para las fotos de la tarjeta de propiedad (licencia de
  // transito colombiana) — frente y reverso en un solo llamado a Gemini para
  // que combine lo que lee en cada lado (algunos datos, como el numero de
  // licencia de transito, a veces solo estan legibles en una de las dos
  // caras segun la foto). Best-effort: cualquier campo que Gemini no logre
  // leer con certeza queda en null.
  async extractVehicleRegistrationFromImages(
    imageBuffers: Buffer[],
  ): Promise<{ rawText: string; extraction: VehicleRegistrationExtraction }> {
    const emptyExtraction: VehicleRegistrationExtraction = {
      country: null,
      licenseNumber: null,
      licenseBarcode: null,
      plate: null,
      brand: null,
      line: null,
      modelYear: null,
      cc: null,
      color: null,
      serviceType: null,
      vehicleClass: null,
      bodyType: null,
      fuelType: null,
      loadCapacity: null,
      engineNumber: null,
      serialNumber: null,
      vin: null,
      chassisNumber: null,
      ownerName: null,
      ownerDocumentNumber: null,
      mobilityRestriction: null,
      armor: null,
      horsepower: null,
      importDeclaration: null,
      importDate: null,
      doors: null,
      propertyLimitation: null,
      registrationDate: null,
      licenseIssueDate: null,
      licenseExpirationDate: null,
      transitAuthority: null,
    };
    const stringField = (description: string) => ({ type: Type.STRING, nullable: true, description });

    return this.extractWithGemini(
      imageBuffers,
      "tarjeta",
      "Estas son fotos de una tarjeta de propiedad (licencia de transito) colombiana — la primera imagen es el " +
        "frente y, si hay una segunda, es el reverso de la misma tarjeta. Lee TODOS los campos que encuentres en " +
        "ambas caras del documento, no solo los principales. Si algun dato no se alcanza a leer con certeza, o el " +
        "campo no aparece en el documento, devuelve null en ese campo en vez de adivinar. Las fechas devuelvelas " +
        "en formato ISO (YYYY-MM-DD) cuando el dia y mes sean claros; si no, devuelve el texto tal como aparece.",
      {
        type: Type.OBJECT,
        properties: {
          country: stringField("Pais de expedicion del documento, normalmente COLOMBIA"),
          licenseNumber: stringField("Numero de la licencia de transito"),
          licenseBarcode: stringField("Codigo de barras inferior de la tarjeta (LIC)"),
          plate: stringField("Placa del vehiculo, ej. ABC123"),
          brand: stringField("Marca del vehiculo, ej. CHEVROLET"),
          line: stringField("Linea/referencia del vehiculo, ej. AVEO"),
          modelYear: stringField("Modelo (año) del vehiculo, ej. 2006"),
          cc: stringField("Cilindrada (CC)"),
          color: stringField("Color del vehiculo"),
          serviceType: stringField("Servicio (ej. Particular, Publico)"),
          vehicleClass: stringField("Clase de vehiculo segun la tarjeta (ej. Camion, Camioneta)"),
          bodyType: stringField("Tipo de carroceria"),
          fuelType: stringField("Combustible (ej. Diesel, Gasolina)"),
          loadCapacity: stringField("Capacidad de carga/pasajeros impresa en la tarjeta (Kg o PSJ), con la unidad"),
          engineNumber: stringField("Numero de motor"),
          serialNumber: stringField("Numero de serie"),
          vin: stringField("VIN"),
          chassisNumber: stringField("Numero de chasis"),
          ownerName: stringField("Nombre o razon social del propietario"),
          ownerDocumentNumber: stringField("Numero de identificacion del propietario"),
          mobilityRestriction: stringField("Restriccion de movilidad (pico y placa, etc)"),
          armor: stringField("Blindaje"),
          horsepower: stringField("Potencia en HP"),
          importDeclaration: stringField("Numero de declaracion de importacion"),
          importDate: stringField("Fecha de importacion, formato ISO YYYY-MM-DD si es clara"),
          doors: stringField("Numero de puertas"),
          propertyLimitation: stringField("Limitacion a la propiedad (prenda, embargo, etc)"),
          registrationDate: stringField("Fecha de matricula, formato ISO YYYY-MM-DD si es clara"),
          licenseIssueDate: stringField("Fecha de expedicion de la licencia de transito, formato ISO YYYY-MM-DD si es clara"),
          licenseExpirationDate: stringField("Fecha de vencimiento, formato ISO YYYY-MM-DD si es clara"),
          transitAuthority: stringField("Organismo de transito que expidio el documento"),
        },
        required: Object.keys(emptyExtraction),
      },
      emptyExtraction,
    );
  }

  // Punto de entrada para las fotos de la cedula de ciudadania (frente y
  // reverso) — un solo llamado a Gemini para que combine lo que lee en
  // ambas caras, igual que la tarjeta de propiedad de vehiculos.
  async extractCedulaFromImages(imageBuffers: Buffer[]): Promise<{ rawText: string; extraction: CedulaExtraction }> {
    const emptyExtraction: CedulaExtraction = {
      documentType: null,
      country: null,
      documentNumber: null,
      lastName: null,
      firstName: null,
      nationality: null,
      height: null,
      sex: null,
      birthDate: null,
      bloodType: null,
      birthPlace: null,
      issuePlace: null,
      documentExpirationDate: null,
      supportNumber: null,
      mrz: null,
    };
    const stringField = (description: string) => ({ type: Type.STRING, nullable: true, description });

    const { rawText, extraction } = await this.extractWithGemini(
      imageBuffers,
      "cedula",
      "Estas son fotos de una cedula de ciudadania colombiana — la primera imagen es el frente y, si hay una " +
        "segunda, es el reverso del mismo documento. Lee TODOS los campos que encuentres en ambas caras, no solo " +
        "los principales. El numero de documento (NUIP) puede aparecer con puntos como separador de miles: " +
        "quitalos y devuelve solo digitos. Las fechas devuelvelas en formato ISO (YYYY-MM-DD): interpreta el " +
        "formato colombiano DIA-MES-AÑO (nunca mes-dia-año). Si algun dato no se alcanza a leer con certeza, o el " +
        "campo no aparece en el documento, devuelve null en vez de adivinar.",
      {
        type: Type.OBJECT,
        properties: {
          documentType: stringField("Tipo de documento, ej. CC"),
          country: stringField("Pais de expedicion, normalmente COLOMBIA"),
          documentNumber: stringField("Numero de documento/NUIP, solo digitos"),
          lastName: stringField("Apellidos de la persona"),
          firstName: stringField("Nombres de la persona"),
          nationality: stringField("Nacionalidad"),
          height: stringField("Estatura"),
          sex: stringField("Sexo"),
          birthDate: stringField("Fecha de nacimiento, formato ISO YYYY-MM-DD si es clara"),
          bloodType: stringField("Grupo sanguineo/factor RH (G.S.)"),
          birthPlace: stringField("Lugar de nacimiento"),
          issuePlace: stringField("Fecha y lugar de expedicion, tal como aparece impreso"),
          documentExpirationDate: stringField("Fecha de expiracion/vencimiento del documento, formato ISO YYYY-MM-DD si es clara"),
          supportNumber: stringField("Numero de soporte/serie del documento (reverso)"),
          mrz: stringField("Codigo de lectura mecanica (MRZ) si el documento lo trae (reverso)"),
        },
        required: Object.keys(emptyExtraction),
      },
      emptyExtraction,
    );

    extraction.birthDate = this.normalizeDateString(extraction.birthDate);
    extraction.documentExpirationDate = this.normalizeDateString(extraction.documentExpirationDate);

    return { rawText, extraction };
  }

  // Punto de entrada para las fotos de la licencia de conduccion (frente y
  // reverso) — un solo llamado a Gemini que combina ambas caras.
  async extractDriverLicenseFromImages(
    imageBuffers: Buffer[],
  ): Promise<{ rawText: string; extraction: DriverLicenseExtraction }> {
    const emptyExtraction: DriverLicenseExtraction = {
      country: null,
      documentType: null,
      licenseNumber: null,
      licenseBarcode: null,
      fullName: null,
      documentNumber: null,
      birthDate: null,
      issueDate: null,
      bloodType: null,
      restrictions: null,
      issuingAuthority: null,
      categories: [],
    };
    const stringField = (description: string) => ({ type: Type.STRING, nullable: true, description });

    const { rawText, extraction } = await this.extractWithGemini(
      imageBuffers,
      "licencia",
      "Estas son fotos de una licencia de conduccion colombiana — la primera imagen es el frente y, si hay una " +
        "segunda, es el reverso de la misma licencia. Lee TODOS los campos que encuentres en ambas caras. " +
        "En el frente: el numero de documento aparece como 'No.' junto al numero de la licencia (es el mismo " +
        "numero de cedula de la persona, distinto del numero de LC), el nombre completo bajo la etiqueta " +
        "'NOMBRE', fecha de nacimiento, fecha de expedicion, sangre/RH, restricciones del conductor, y el " +
        "organismo de transito expedidor. En el reverso hay una tabla 'CATEGORIAS AUTORIZADAS' con una fila por " +
        "cada categoria autorizada (ej. una fila 'B2' y otra fila 'C2' por separado, cada una con su PROPIA " +
        "clase de vehiculo, vigencia y servicio — NO las combines en una sola fila, devuelve un elemento del " +
        "array 'categories' por cada fila de la tabla). Ademas hay un numero de licencia con el formato 'LC' " +
        "seguido de digitos debajo del codigo de barras (ej. LC06003009573). Las fechas devuelvelas en formato " +
        "ISO (YYYY-MM-DD): interpreta el formato colombiano DIA-MES-AÑO (nunca mes-dia-año). Si algun dato no se " +
        "alcanza a leer con certeza, o el campo no aparece, devuelve null.",
      {
        type: Type.OBJECT,
        properties: {
          country: stringField("Pais/entidad que expide la licencia"),
          documentType: stringField("Tipo de documento, ej. 'Licencia de conduccion'"),
          licenseNumber: stringField("Numero de LC con prefijo, ej. LC06003009573 (reverso)"),
          licenseBarcode: stringField("Codigo de barras/identificador inferior si es distinto del numero de LC"),
          fullName: stringField("Nombre completo de la persona (frente)"),
          documentNumber: stringField("Numero de documento/cedula impreso como 'No.' en el frente, solo digitos"),
          birthDate: stringField("Fecha de nacimiento (frente), formato ISO YYYY-MM-DD si es clara"),
          issueDate: stringField("Fecha de expedicion (frente), formato ISO YYYY-MM-DD si es clara"),
          bloodType: stringField("Sangre/factor RH (frente)"),
          restrictions: stringField("Restricciones del conductor (frente)"),
          issuingAuthority: stringField("Organismo de transito expedidor (frente)"),
          categories: {
            type: Type.ARRAY,
            description: "Una fila por cada categoria autorizada en la tabla del reverso",
            items: {
              type: Type.OBJECT,
              properties: {
                category: stringField("Categoria de esta fila, ej. 'C2'"),
                vehicleClass: stringField("Clase de vehiculo de esta fila"),
                expiration: stringField("Vigencia de esta fila, formato ISO YYYY-MM-DD si es clara"),
                serviceType: stringField("Servicio de esta fila (PARTICULAR/PUBLICO)"),
              },
              required: ["category", "vehicleClass", "expiration", "serviceType"],
            },
          },
        },
        required: Object.keys(emptyExtraction),
      },
      emptyExtraction,
    );

    // Las fechas que Gemini no logra convertir a ISO por su cuenta (a pesar
    // de que el prompt lo pide) vienen en formato colombiano DD-MM-YYYY —
    // se normalizan aca para que nunca lleguen crudas al validador del DTO
    // (@IsDateString), que rechaza cualquier formato que no sea ISO 8601.
    extraction.birthDate = this.normalizeDateString(extraction.birthDate);
    extraction.issueDate = this.normalizeDateString(extraction.issueDate);
    extraction.categories = extraction.categories.map((entry) => ({
      ...entry,
      expiration: this.normalizeDateString(entry.expiration),
    }));

    return { rawText, extraction };
  }

  // Convierte fechas en formato colombiano (DD-MM-YYYY o DD/MM/YYYY) a ISO
  // (YYYY-MM-DD). Si ya viene en ISO, o no calza con ningun formato
  // reconocido, se devuelve tal cual (mejor un dato crudo que uno inventado).
  private normalizeDateString(raw: string | null): string | null {
    if (!raw) return raw;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

    const match = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(raw.trim());
    if (!match) return raw;

    const [, day, month, year] = match;
    const dd = day!.padStart(2, "0");
    const mm = month!.padStart(2, "0");
    if (Number(mm) < 1 || Number(mm) > 12 || Number(dd) < 1 || Number(dd) > 31) return raw;

    return `${year}-${mm}-${dd}`;
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
