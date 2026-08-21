import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
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

// Borrador de "Obra + Puntos operativos + Tarifas" leido de una orden de
// trabajo/cotizacion (foto o texto pegado) que el cliente le manda al
// despachador — evita transcribir todo a mano. Todo es best-effort y se
// revisa/edita en pantalla antes de crear nada (ver OperationsService).
export interface OperationsSetupExtraction {
  // Ya no se le pide nombre/codigo de obra a Gemini: la obra no tiene un
  // nombre propio en la dictada/escrita — cuando el despachador dice "obra:
  // X" en realidad esta nombrando el punto de CARGUE (ver el primer site
  // con type LOAD), no un identificador de proyecto aparte. El codigo de
  // la obra se genera solo, en el backend, a partir de los nombres de
  // cargue/descargue (ver OperationsService.quickSetup).
  project: {
    clientName: string | null;
    description: string | null;
    startDate: string | null;
    endDate: string | null;
  };
  sites: Array<{
    name: string | null;
    type: "LOAD" | "UNLOAD" | "BOTH" | null;
    address: string | null;
  }>;
  rates: Array<{
    originSiteName: string | null;
    destinationSiteName: string | null;
    materialName: string | null;
    rateType: "PER_TRIP" | "PER_TON" | "PER_CUBIC_METER" | "PER_KILOMETER" | "FIXED" | null;
    value: number | null;
    // Tipo de vehiculo/camion de esta tarifa especifica, si se menciono
    // (ej. "sencilla" vs "B200"/doble troque pueden tener precios
    // distintos para la misma ruta y material) — null si no se menciono
    // ningun tipo, en cuyo caso la tarifa aplica a cualquier vehiculo.
    vehicleType: "DUMP_TRUCK" | "DOUBLE_TRAILER" | "MINI_DUMP_TRUCK" | "TRACTOR_TRAILER" | "OTHER" | null;
  }>;
}

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
      this.logger.warn("GEMINI_API_KEY no configurada — el OCR de cedula/licencia/tarjeta de propiedad/vale quedara deshabilitado.");
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

  // Punto de entrada para la foto del vale/recibo de entrega de material
  // (ej. Dromos u otro transportador) que el conductor sube al cerrar el
  // viaje. A diferencia de la version anterior (OCR de texto plano +
  // regex sobre etiquetas fijas), esto le pide a Gemini que lea la foto
  // completa y devuelva TODOS los campos con etiqueta que encuentre, no
  // solo los pocos que el regex conocia — sirve para que admin/dispatcher
  // lo comparen contra los datos registrados del viaje, nunca lo reemplaza.
  async extractVoucherFromImage(imageBuffer: Buffer): Promise<{ rawText: string; extraction: VoucherExtraction }> {
    interface RawVoucherExtraction {
      quantity: number | null;
      unit: "TON" | "CUBIC_METER" | null;
      voucherNumber: string | null;
      fields: Array<{ label: string; value: string }>;
    }
    const emptyExtraction: RawVoucherExtraction = { quantity: null, unit: null, voucherNumber: null, fields: [] };

    const { rawText, extraction } = await this.extractWithGemini<RawVoucherExtraction>(
      [imageBuffer],
      "vale",
      "Esta es una foto de un vale/recibo de entrega de material (ej. vale de una volqueta, formato tipo Dromos u " +
        "otro transportador). Lee TODOS los datos visibles en el documento, no solo los principales: numero de " +
        "vale, cantidad/volumen entregado con su unidad, fecha, placa del vehiculo, producto/material, cliente, " +
        "obra, transportadora, nombre del conductor, identificacion, despachador, observaciones, y cualquier otro " +
        "campo con etiqueta que aparezca impreso o escrito a mano (incluye sellos o notas manuscritas si son " +
        "legibles). La cantidad puede venir en metros cubicos (M3) o toneladas — identifica la unidad correcta " +
        "segun lo que diga el documento. El numero de vale suele venir junto a 'No. Vale' o similar. Para el resto " +
        "de campos, devuelve cada uno como un par etiqueta/valor en 'fields', usando SIEMPRE estas etiquetas en " +
        "español cuando el campo aplique: Fecha, Placa, Producto, Cliente, Obra, Transporta, Conductor, " +
        "Identificación, Despachador, Observaciones — y si hay otro campo que no calce con ninguna de estas, usa " +
        "la etiqueta tal como aparece impresa. Si un dato no se alcanza a leer con certeza o no aparece en el " +
        "documento, simplemente no lo incluyas en 'fields' (no inventes valores).",
      {
        type: Type.OBJECT,
        properties: {
          quantity: { type: Type.NUMBER, nullable: true, description: "Cantidad/volumen numerico entregado, sin unidad" },
          unit: { type: Type.STRING, nullable: true, enum: ["TON", "CUBIC_METER"], description: "Unidad de la cantidad" },
          voucherNumber: { type: Type.STRING, nullable: true, description: "Numero de vale" },
          fields: {
            type: Type.ARRAY,
            description: "Resto de campos con etiqueta visibles en el vale, como pares etiqueta/valor",
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING, description: "Etiqueta del campo, ej. Fecha, Placa, Producto, Cliente, Obra" },
                value: { type: Type.STRING, description: "Valor leido para ese campo" },
              },
              required: ["label", "value"],
            },
          },
        },
        required: ["quantity", "unit", "voucherNumber", "fields"],
      },
      emptyExtraction,
    );

    const fields: Record<string, string> = {};
    for (const { label, value } of extraction.fields) {
      if (label && value) fields[label] = value;
    }

    return {
      rawText,
      extraction: { quantity: extraction.quantity, unit: extraction.unit, voucherNumber: extraction.voucherNumber, fields },
    };
  }

  // Detecta el mime type real del archivo (foto o audio) mirando los
  // primeros bytes — el nombre de archivo o el Content-Type del navegador no
  // siempre son confiables, y Gemini necesita el mime type correcto. Los
  // formatos de audio se revisan primero porque, a diferencia de las fotos,
  // Gemini los usa para "escuchar" la orden de trabajo dictada (ver
  // extractOperationsSetup) en vez de solo leer texto/imagenes.
  private detectMediaMimeType(buffer: Buffer): string {
    // RIFF es un contenedor generico compartido por WAV y WEBP — hay que
    // mirar el sub-formato (bytes 8-12) para no confundir un audio WAV con
    // una imagen WEBP, ambos empiezan igual.
    if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF") {
      const subFormat = buffer.toString("ascii", 8, 12);
      if (subFormat === "WAVE") return "audio/wav";
      if (subFormat === "WEBP") return "image/webp";
    }
    if (buffer.length >= 4 && buffer.toString("ascii", 0, 4) === "OggS") return "audio/ogg";
    if (buffer.length >= 4 && buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) return "audio/webm";
    if (buffer.length >= 3 && buffer.toString("ascii", 0, 3) === "ID3") return "audio/mp3";
    if (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1]! & 0xe0) === 0xe0 && (buffer[1]! & 0x06) !== 0) return "audio/mp3";
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
    if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
    return "image/jpeg";
  }

  // Motor comun para todos los tipos de extraccion: le manda a Gemini el
  // texto del prompt mas cualquier archivo adjunto (fotos y/o audio — se
  // detecta el mime type real de cada uno, ver detectMediaMimeType) junto
  // con un schema JSON estricto (asi la respuesta ya viene tipada, sin
  // tener que parsear texto libre) y devuelve el objeto parseado. Nunca
  // lanza — sin API key, con la red caida, o si Gemini no logra leer el
  // archivo, devuelve `empty` para que el usuario complete el formulario a
  // mano, igual que hacia la version con tesseract.js.
  private async extractWithGemini<T>(
    mediaBuffers: Buffer[],
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
                ...mediaBuffers.map((buffer) => ({
                  inlineData: { mimeType: this.detectMediaMimeType(buffer), data: buffer.toString("base64") },
                })),
              ],
            },
          ],
          // thinkingLevel "minimal" apaga (casi del todo) el "razonamiento"
          // interno del modelo antes de responder — medido con este mismo
          // modelo: una consulta trivial ("di hola") gastaba 173 tokens de
          // pensamiento y tardaba ~28s; con "minimal" bajo a ~0 tokens de
          // pensamiento. (thinkingBudget:0, la forma "oficial" de apagarlo
          // del todo, esta API la rechaza con 400 para este modelo —
          // "minimal" es el nivel mas bajo que si acepta.) Ninguna de estas
          // extracciones necesita razonamiento multi-paso (es mapear texto/
          // audio/foto a un schema fijo, no resolver un problema), asi que
          // esto no baja la calidad, solo quita tiempo "pensando" de mas
          // antes de escribir la respuesta.
          config: {
            responseMimeType: "application/json",
            responseSchema,
            thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          },
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

  // Punto de entrada para "Configuracion automatica de obra": lee una orden
  // de trabajo/cotizacion (foto(s), audio grabado/subido, y/o texto pegado)
  // y arma un borrador con la obra, sus puntos operativos y las tarifas por
  // ruta+material. Gemini "escucha" el audio directamente (sin paso de
  // transcripcion aparte) y extrae los mismos campos que si fuera texto o
  // foto. Los puntos NO traen coordenadas (Gemini no puede geolocalizar con
  // precision) — el frontend las completa con busqueda de direccion antes
  // de crear nada. Las referencias origen/destino de cada tarifa van por
  // NOMBRE de punto (no hay ids todavia); se resuelven en pantalla de
  // revision, donde el usuario tambien puede editar/quitar/agregar filas.
  async extractOperationsSetup(input: {
    imageBuffers: Buffer[];
    audioBuffer?: Buffer;
    text?: string;
    // Materiales ya registrados en el tenant — se le pasan a Gemini para
    // que reconozca cuando el material mencionado ya existe (aunque este
    // dicho de otra forma) y reuse ese nombre exacto en vez de inventar
    // uno nuevo. Ver el comentario "MUY IMPORTANTE sobre materiales"
    // mas abajo.
    existingMaterialNames?: string[];
  }): Promise<{
    rawText: string;
    extraction: OperationsSetupExtraction;
  }> {
    const emptyExtraction: OperationsSetupExtraction = {
      project: { clientName: null, description: null, startDate: null, endDate: null },
      sites: [],
      rates: [],
    };
    const stringField = (description: string) => ({ type: Type.STRING, nullable: true, description });

    const pastedText = input.text?.trim();
    const prompt =
      "Eres un asistente que ayuda a un despachador de volquetas en Colombia a montar una obra nueva en el " +
      "sistema a partir de la orden de trabajo o cotizacion que le mando el cliente (puede venir como foto de un " +
      "papel/PDF, como texto pegado, o como un audio grabado/dictado por el despachador describiendo la obra de " +
      "palabra — en ese caso escucha el audio completo y extrae la misma informacion que sacarias de un texto).\n\n" +
      "IMPORTANTE sobre la palabra 'obra': la obra en si NO tiene nombre propio en el sistema — cuando el " +
      "despachador dice 'obra: X' o 'para la obra X', X es en realidad el NOMBRE DEL PUNTO DE CARGUE (la cantera, " +
      "el sitio de donde sale el material), no un nombre de proyecto aparte. Ej. si dice 'obra: General " +
      "Santander', eso quiere decir que hay un punto operativo llamado 'General Santander' con type LOAD — no lo " +
      "pongas en ningun campo de 'obra/proyecto', ponlo como un site.\n\n" +
      "Extrae: 1) los datos generales del proyecto que SI son propios de la obra: cliente y fechas (nombre y " +
      "codigo NO se piden, se generan solos a partir de los puntos operativos); 2) la lista de puntos operativos " +
      "mencionados (canteras, botaderos — cada uno con su tipo: LOAD si es un punto de cargue/cantera/'obra' " +
      "mencionada asi, UNLOAD si es de descargue/botadero, BOTH si sirve para ambos, y su direccion tal como " +
      "aparezca o se mencione).\n\n" +
      "MUY IMPORTANTE sobre 'address' de cada punto: SIEMPRE debe incluir el nombre/referencia especifica del " +
      "sitio, nunca solo la ciudad sola. Si el despachador NO dio una direccion formal (calle/carrera con " +
      "numeros) y solo dio un nombre de lugar + ciudad (ej. 'Altos de Granada en Manizales'), pon en address ese " +
      "mismo nombre + ciudad tal cual ('Altos de Granada, Manizales, Caldas, Colombia') — NO lo reduzcas solo a " +
      "'Manizales, Caldas, Colombia', porque asi se pierde la referencia y el punto queda ubicado en el centro de " +
      "la ciudad en vez del lugar real. La ciudad se usa para desambiguar, no para reemplazar el nombre del " +
      "sitio.\n\n" +
      "Reconoce estas ciudades principales de Colombia cuando se mencionen (o cualquier otra ciudad/municipio " +
      "colombiano que se nombre explicitamente): Bogota, Medellin, Cali, Barranquilla, Manizales, " +
      "Villavicencio — usa SIEMPRE la ciudad que efectivamente se menciono, nunca asumas Bogota si se dijo otra " +
      "ciudad.\n\n" +
      "3) las tarifas: cada combinacion de ruta (origen-destino), material y tipo/clase de vehiculo con " +
      "su valor y tipo (PER_TRIP si es por viaje, PER_TON si es por tonelada, PER_CUBIC_METER si es por m3, " +
      "PER_KILOMETER si es por kilometro, FIXED si es un valor fijo).\n\n" +
      (input.existingMaterialNames && input.existingMaterialNames.length > 0
        ? "MUY IMPORTANTE sobre materiales ya existentes: estos materiales ya estan registrados en el sistema: [" +
          input.existingMaterialNames.join(", ") +
          "]. Si el material que se menciona es el MISMO producto que uno de estos, aunque este dicho de forma " +
          "distinta o mas/menos especifica (ej. 'excavacion' y 'excavacion de tierra' son el mismo material; " +
          "'recebo' y 'recebo comun' tambien), usa el nombre EXACTO de la lista de arriba, no inventes una " +
          "variante nueva. Solo usa un nombre nuevo si es un material genuinamente distinto que no esta en esa " +
          "lista.\n\n"
        : "") +
      "MUY IMPORTANTE sobre tarifas multiples: puede haber MAS DE UNA tarifa para la misma ruta, incluso " +
      "mencionadas juntas en una sola frase compacta — ej. 'el viaje de recebo comun sale a 270.000 o a veces " +
      "B200 que sale a 320.000' tiene DOS tarifas distintas (una normal/sencilla a 270.000, y otra para vehiculo " +
      "tipo B200/doble troque a 320.000), NO las combines ni te quedes solo con una — devuelve una fila en " +
      "'rates' por cada valor distinto que se mencione, aunque compartan ruta y material. Si se menciona un tipo " +
      "o clase de vehiculo/camion para una tarifa, mapealo a vehicleType asi: 'sencilla'/'volqueta sencilla' -> " +
      "DUMP_TRUCK, 'doble troque'/'B-doble'/'B200'/'bitren' -> DOUBLE_TRAILER, 'mini'/'minivolqueta' -> " +
      "MINI_DUMP_TRUCK, 'tractomula'/'cabezote' -> TRACTOR_TRAILER, cualquier otro tipo mencionado -> OTHER, y " +
      "null si NO se menciona ningun tipo especifico para esa tarifa (aplica a cualquier vehiculo).\n\n" +
      "Usa los NOMBRES de los puntos operativos para referenciar origen/destino de cada tarifa " +
      "(originSiteName/destinationSiteName), deben coincidir exactamente con el nombre que le diste a ese punto " +
      "en la lista de sites. Si un dato no aparece o no estas seguro, devuelve null en ese campo en vez de " +
      "adivinar — es un borrador que el despachador revisa y corrige antes de guardar nada. Las fechas en " +
      "formato ISO (YYYY-MM-DD) si son claras." +
      (pastedText ? `\n\nTexto de la orden de trabajo:\n${pastedText}` : "") +
      (input.imageBuffers.length > 0 ? "\n\nAdemas se adjuntan foto(s) del mismo documento." : "") +
      (input.audioBuffer ? "\n\nAdemas se adjunta un audio donde se dicta/describe la obra de palabra." : "");

    const mediaBuffers = input.audioBuffer ? [...input.imageBuffers, input.audioBuffer] : input.imageBuffers;
    const vehicleTypeEnum = ["DUMP_TRUCK", "DOUBLE_TRAILER", "MINI_DUMP_TRUCK", "TRACTOR_TRAILER", "OTHER"];

    return this.extractWithGemini(
      mediaBuffers,
      "operations-setup",
      prompt,
      {
        type: Type.OBJECT,
        properties: {
          project: {
            type: Type.OBJECT,
            properties: {
              clientName: stringField("Nombre del cliente"),
              description: stringField("Descripcion breve, si aplica"),
              startDate: stringField("Fecha de inicio, formato ISO YYYY-MM-DD si es clara"),
              endDate: stringField("Fecha de fin, formato ISO YYYY-MM-DD si es clara"),
            },
            required: ["clientName", "description", "startDate", "endDate"],
          },
          sites: {
            type: Type.ARRAY,
            description: "Puntos operativos (cargue/descargue) mencionados, incluyendo lo que se haya dicho como 'obra: X'",
            items: {
              type: Type.OBJECT,
              properties: {
                name: stringField("Nombre del punto operativo"),
                type: { type: Type.STRING, nullable: true, enum: ["LOAD", "UNLOAD", "BOTH"], description: "Tipo de punto" },
                address: stringField(
                  "Direccion o ubicacion descrita — SIEMPRE incluye el nombre/referencia del sitio junto con la " +
                    "ciudad (ej. 'Altos de Granada, Manizales, Caldas, Colombia'), nunca solo la ciudad sola",
                ),
              },
              required: ["name", "type", "address"],
            },
          },
          rates: {
            type: Type.ARRAY,
            description: "Tarifas por ruta+material+tipo de vehiculo — una fila por cada valor distinto mencionado, aunque compartan ruta",
            items: {
              type: Type.OBJECT,
              properties: {
                originSiteName: stringField("Nombre del punto de origen, debe calzar con un nombre en 'sites'"),
                destinationSiteName: stringField("Nombre del punto de destino, debe calzar con un nombre en 'sites'"),
                materialName: stringField("Nombre del material transportado"),
                rateType: {
                  type: Type.STRING,
                  nullable: true,
                  enum: ["PER_TRIP", "PER_TON", "PER_CUBIC_METER", "PER_KILOMETER", "FIXED"],
                  description: "Tipo de tarifa",
                },
                value: { type: Type.NUMBER, nullable: true, description: "Valor de la tarifa en pesos colombianos" },
                vehicleType: {
                  type: Type.STRING,
                  nullable: true,
                  enum: vehicleTypeEnum,
                  description: "Tipo/clase de vehiculo de esta tarifa especifica, null si no se menciono ninguno",
                },
              },
              required: ["originSiteName", "destinationSiteName", "materialName", "rateType", "value", "vehicleType"],
            },
          },
        },
        required: ["project", "sites", "rates"],
      },
      emptyExtraction,
    );
  }

  // Convierte una descripcion coloquial de una ubicacion (ej. "la Caracas
  // con 72", "frente al Exito de la 80") en 1-3 direcciones formales y
  // completas, listas para buscar en un mapa — el despachador no siempre
  // sabe la direccion "oficial" de un punto, pero si sabe como se le dice
  // coloquialmente. OperationsService las usa despues como texto de
  // busqueda contra Nominatim (OpenStreetMap) para conseguir coordenadas
  // reales; Gemini nunca inventa coordenadas, solo normaliza el texto.
  async resolveAddress(query: string): Promise<{ rawText: string; extraction: { addresses: string[] } }> {
    const emptyExtraction = { addresses: [] as string[] };
    const prompt =
      "Convierte esta descripcion coloquial de una ubicacion en Colombia a direcciones formales y completas, " +
      "listas para buscar en un mapa. Funciona para cualquier ciudad colombiana, no solo Bogota — reconoce " +
      "explicitamente Bogota, Medellin, Cali, Barranquilla, Manizales, Villavicencio y cualquier otra ciudad/" +
      "municipio que se mencione, y usa SIEMPRE la ciudad que el usuario efectivamente dijo. Solo si NO se " +
      "menciona ninguna ciudad, asume Bogota D.C. como fallback — nunca la reemplaces por Bogota si se nombro " +
      "otra ciudad. Incluye siempre la ciudad y 'Colombia' al final de cada direccion, y NUNCA reduzcas la " +
      "direccion a solo el nombre de la ciudad — si la descripcion trae un nombre de lugar especifico (barrio, " +
      "sitio, punto de referencia), consérvalo siempre junto con la ciudad.\n\n" +
      "Si la ubicacion es en Bogota, aplica estas reglas de nomenclatura local antes de devolver la direccion:\n" +
      "1. Jerarquia por defecto: si el usuario NO dice explicitamente la palabra 'sur', interpreta la interseccion " +
      "como centro/norte (ej. 'Septima con 26' -> Carrera 7 con Calle 26, NO Calle 26 Sur). Solo usa 'Sur' si " +
      "aparece esa palabra en la descripcion.\n" +
      "2. Nombres informales de vias principales -> nomenclatura oficial:\n" +
      "   'la Septima'/'la 7' -> Carrera 7\n" +
      "   'la Caracas' -> Avenida Caracas (Carrera 14)\n" +
      "   'la 26'/'la Dorado' -> Avenida Calle 26\n" +
      "   'la Autopista Norte'/'la Auto Norte' -> Autopista Norte (Carrera 45)\n" +
      "   'la NQS'/'la 30' -> Avenida NQS (Carrera 30)\n" +
      "   'la Boyaca' -> Avenida Boyaca (Carrera 72)\n" +
      "   'la 68' -> Avenida Carrera 68\n" +
      "   'la 100' -> Avenida Calle 100\n" +
      "   'la 80' -> Avenida Calle 80\n" +
      "   'la Suba' -> Avenida Suba (Calle 145)\n" +
      "3. Inferencia Calle vs Carrera: las vias de la lista anterior corren norte-sur (son Carreras/Avenidas), " +
      "asi que en una expresion tipo '<via> con <numero>' (ej. 'la Caracas con 72'), el <numero> casi siempre es " +
      "una Calle (via oriente-occidente) que cruza esa carrera — interpreta 'la Caracas con 72' como Carrera 14 " +
      "con Calle 72, no como dos carreras.\n" +
      "4. Si la descripcion sigue siendo ambigua incluso aplicando estas reglas (varias interpretaciones " +
      "razonables), devuelve 2-3 variantes priorizando zonas de alto flujo comercial/urbano sobre zonas " +
      "perifericas.\n\n" +
      "Devuelve entre 1 y 3 variantes (de la mas a la menos probable) si la descripcion es ambigua, o solo 1 si " +
      `es clara. No expliques nada, solo las direcciones.\n\nDescripcion: "${query}"`;

    return this.extractWithGemini(
      [],
      "resolve-address",
      prompt,
      {
        type: Type.OBJECT,
        properties: {
          addresses: {
            type: Type.ARRAY,
            description: "Direcciones formales candidatas, de la mas a la menos probable",
            items: { type: Type.STRING },
          },
        },
        required: ["addresses"],
      },
      emptyExtraction,
    );
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

}
