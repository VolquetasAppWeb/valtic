import { ConflictException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { OcrService } from "../../common/ocr/ocr.service";
import { isDispatcherScoped } from "../../common/dispatcher-scope";
import type { AppConfig } from "../../config/configuration";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import type { QuickSetupDto, QuickSetupSiteDto } from "./dto/quick-setup.dto";

@Injectable()
export class OperationsService {
  private readonly googleMapsApiKey: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly ocrService: OcrService,
    configService: ConfigService<AppConfig, true>,
  ) {
    this.googleMapsApiKey = configService.get("googleMaps", { infer: true }).apiKey;
  }

  // Lee la orden de trabajo/cotizacion (foto(s), audio y/o texto pegado) y
  // devuelve un borrador de obra + puntos + tarifas — no persiste nada, el
  // usuario lo revisa/edita en pantalla antes de confirmar (ver quickSetup).
  // Le manda a Gemini los materiales que ya existen en el tenant para que
  // reconozca cuando el material mencionado es el mismo aunque este dicho
  // distinto (ej. "excavacion" y "excavacion de tierra") y reuse el nombre
  // existente en vez de crear uno nuevo — el "autoaprendizaje" real pasa
  // aca, no solo comparando texto exacto despues (ver quickSetup).
  async extractSetup(imageBuffers: Buffer[], audioBuffer: Buffer | undefined, text: string | undefined, tenantId: string) {
    const existingMaterials = await this.prisma.material.findMany({
      where: { tenantId, status: "ACTIVE" },
      select: { name: true },
      orderBy: { name: "asc" },
    });
    const { extraction } = await this.ocrService.extractOperationsSetup({
      imageBuffers,
      audioBuffer,
      text,
      existingMaterialNames: existingMaterials.map((m) => m.name),
    });
    return extraction;
  }

  // Ubica un punto operativo a partir de una descripcion coloquial (ej. "la
  // Caracas con 72"): Gemini la convierte primero en 1-3 direcciones
  // formales buscables, y cada una se geocodifica para conseguir
  // coordenadas reales — Gemini nunca inventa coordenadas, solo mejora el
  // texto de busqueda. Si hay una key de Google Maps configurada se usa la
  // Geocoding API (mas precisa con nomenclatura colombiana tipo carrera/
  // calle); si no, cae de vuelta a Nominatim (OpenStreetMap), gratis pero
  // con peor cobertura en direcciones informales. Si Gemini no responde,
  // cae de vuelta a buscar la descripcion tal cual la escribio el usuario.
  // `skipAi` evita el llamado a Gemini y geocodifica `query` tal cual —
  // pensado para cuando la direccion YA salio de un paso de IA anterior
  // (ej. la que extractOperationsSetup ya interpreto de una orden de
  // trabajo dictada/pegada) y por eso ya viene razonablemente formal; pedirle
  // a Gemini que la "normalice" de nuevo es una vuelta de red redundante que
  // solo suma latencia sin mejorar el resultado. Las busquedas manuales
  // (el usuario escribiendo algo coloquial) siguen usando el flujo completo.
  async resolveAddress(query: string, skipAi = false): Promise<Array<{ lat: number; lon: number; displayName: string }>> {
    const candidates = skipAi ? [query] : await this.getAddressCandidates(query);

    const search = (candidate: string) =>
      this.googleMapsApiKey ? this.searchGoogleGeocoding(candidate, this.googleMapsApiKey) : this.searchNominatim(candidate);
    const resultLists = await Promise.all(candidates.slice(0, 3).map(search));

    const seen = new Set<string>();
    const merged: Array<{ lat: number; lon: number; displayName: string }> = [];
    for (const results of resultLists) {
      for (const result of results) {
        const key = `${result.lat.toFixed(5)},${result.lon.toFixed(5)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(result);
      }
    }

    // Guardarraya determinista para la regla de "Sur" (ver el prompt de
    // resolveAddress en OcrService): el geocoder de Google a veces devuelve
    // la variante "Sur" de una interseccion aunque se le mande la direccion
    // formal correcta sin esa palabra (parece un tema de como tiene
    // indexada esa via en su mapa, no algo que se pueda arreglar solo con
    // el texto de busqueda) — asi que si el usuario no escribio "sur" en
    // ningun lado, los resultados que si dicen "sur" se mandan al final en
    // vez de quitarlos (pueden seguir siendo utiles si son los unicos que
    // hay), para que el usuario no tenga que revisar manualmente cual es
    // la interseccion correcta.
    const userMeantSur = /\bsur\b/i.test(query);
    if (!userMeantSur) {
      merged.sort((a, b) => Number(/\bsur\b/i.test(a.displayName)) - Number(/\bsur\b/i.test(b.displayName)));
    }

    return merged.slice(0, 5);
  }

  private async getAddressCandidates(query: string): Promise<string[]> {
    const { extraction } = await this.ocrService.resolveAddress(query);
    return extraction.addresses.length > 0 ? extraction.addresses : [query];
  }

  private async searchGoogleGeocoding(query: string, apiKey: string): Promise<Array<{ lat: number; lon: number; displayName: string }>> {
    try {
      const params = new URLSearchParams({ address: query, key: apiKey, components: "country:CO", language: "es" });
      const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`);
      if (!response.ok) return [];
      const data = (await response.json()) as {
        status: string;
        results: Array<{ formatted_address: string; geometry: { location: { lat: number; lng: number } } }>;
      };
      if (data.status !== "OK") return [];
      return data.results.map((result) => ({
        lat: result.geometry.location.lat,
        lon: result.geometry.location.lng,
        displayName: result.formatted_address,
      }));
    } catch {
      return [];
    }
  }

  private async searchNominatim(query: string): Promise<Array<{ lat: number; lon: number; displayName: string }>> {
    try {
      const params = new URLSearchParams({ format: "jsonv2", q: query, limit: "3", countrycodes: "co" });
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
        headers: { Accept: "application/json", "User-Agent": "VALTIC/1.0" },
      });
      if (!response.ok) return [];
      const data = (await response.json()) as Array<{ lat: string; lon: string; display_name: string }>;
      return data.map((item) => ({ lat: Number(item.lat), lon: Number(item.lon), displayName: item.display_name }));
    } catch {
      return [];
    }
  }

  // Crea obra + puntos operativos + tarifas en una sola transaccion, a
  // partir del borrador ya revisado/editado por el usuario (venga de la IA
  // o armado a mano). Los materiales se resuelven por nombre: si ya existe
  // uno con ese nombre en el tenant se reutiliza, si no se crea uno nuevo
  // con un codigo generado — asi el usuario nunca tiene que ir a crear el
  // material aparte primero.
  async quickSetup(tenantId: string, dto: QuickSetupDto, actor: AuthenticatedUser) {
    const dispatcherId = isDispatcherScoped(actor) ? actor.sub : null;

    const existingProject = await this.prisma.project.findFirst({ where: { tenantId, code: dto.project.code, deletedAt: null } });
    if (existingProject) {
      throw new ConflictException({ code: "PROJECT_CODE_TAKEN", message: "Ya existe una obra con ese codigo." });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          tenantId,
          // El DTO ya no trae nombre (ver comentario en QuickSetupProjectDto)
          // — se deriva aca de los puntos de cargue/descargue, que es como
          // el despachador identifica la obra de todos modos. La columna
          // sigue siendo obligatoria porque el resto de la app (listado de
          // viajes, monitor, reportes) todavia muestra Project.name.
          name: this.deriveProjectName(dto.sites),
          code: dto.project.code,
          description: dto.project.description,
          clientName: dto.project.clientName,
          startDate: new Date(dto.project.startDate),
          endDate: dto.project.endDate ? new Date(dto.project.endDate) : null,
          dispatcherId,
          // La obra queda operativa de una vez (no en PLANNED, el default
          // de la tabla) — se crea porque ya se va a usar, no como
          // borrador.
          status: "ACTIVE",
        },
      });

      const sites = await Promise.all(
        dto.sites.map((site) =>
          tx.operationalSite.create({
            data: {
              tenantId,
              projectId: project.id,
              name: site.name,
              type: site.type,
              address: site.address,
              latitude: site.latitude,
              longitude: site.longitude,
              geofenceRadius: site.geofenceRadius ?? 50,
            },
          }),
        ),
      );

      // Comparar solo con mode:"insensitive" (case-insensitive) no basta:
      // Postgres NO ignora tildes con eso, asi que "Recebo comun" y "Recebo
      // común" contaban como materiales distintos y se duplicaban cada vez
      // que Gemini transcribia con o sin tilde. Se trae la lista completa
      // una vez y se compara en memoria, ignorando tildes/mayusculas/
      // espacios de mas — asi el mismo material dicho de formas distintas
      // ("Arena", "arena", "Arená") siempre resuelve a la misma fila, sin
      // que el administrador tenga que crearlo a mano.
      const existingMaterials = await tx.material.findMany({ where: { tenantId } });
      const normalizeMaterialName = (value: string) =>
        value
          .trim()
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .toLowerCase()
          .replace(/\s+/g, " ");
      // Segunda red de seguridad ademas de lo que ya deberia resolver Gemini
      // (ver el prompt de extractOperationsSetup): si no hay match exacto
      // pero el nombre nuevo contiene, o esta contenido en, uno ya
      // existente (ej. "excavacion" vs "excavacion de tierra"), se trata
      // como el mismo material — se queda con el nombre mas corto/general
      // ya existente en vez de crear una variante nueva. El minimo de 4
      // caracteres evita falsos positivos con nombres muy cortos.
      const MIN_FUZZY_MATCH_LENGTH = 4;
      const findFuzzyMatch = (key: string) => {
        if (key.length < MIN_FUZZY_MATCH_LENGTH) return undefined;
        const candidates = existingMaterials.filter((m) => {
          const existingKey = normalizeMaterialName(m.name);
          if (existingKey.length < MIN_FUZZY_MATCH_LENGTH) return false;
          return existingKey.includes(key) || key.includes(existingKey);
        });
        // El mas corto es el mas "general" — mejor candidato canonico.
        return candidates.sort((a, b) => a.name.length - b.name.length)[0];
      };

      const materialCache = new Map<string, { id: string }>();
      const resolveMaterial = async (rawName: string) => {
        const name = rawName.trim();
        const key = normalizeMaterialName(name);
        const cached = materialCache.get(key);
        if (cached) return cached;

        const existing = existingMaterials.find((m) => normalizeMaterialName(m.name) === key) ?? findFuzzyMatch(key);
        const material = existing ?? (await tx.material.create({ data: { tenantId, name, code: await this.generateMaterialCode(tx, tenantId, name), unit: "m3" } }));
        if (!existing) existingMaterials.push(material);
        materialCache.set(key, material);
        return material;
      };

      const rates = [];
      for (const rate of dto.rates ?? []) {
        const origin = sites[rate.originSiteIndex];
        const destination = sites[rate.destinationSiteIndex];
        if (!origin || !destination) {
          throw new ConflictException({ code: "QUICK_SETUP_INVALID_SITE_INDEX", message: "Una tarifa referencia un punto operativo que no existe en la lista." });
        }
        const material = await resolveMaterial(rate.materialName);
        rates.push(
          await tx.rate.create({
            data: {
              tenantId,
              projectId: project.id,
              originSiteId: origin.id,
              destinationSiteId: destination.id,
              materialId: material.id,
              rateType: rate.rateType,
              value: rate.value,
              vehicleType: rate.vehicleType,
              validFrom: new Date(),
              dispatcherId,
            },
          }),
        );
      }

      return { project, sites, rates };
    });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: "OPERATIONS_QUICK_SETUP_CREATED",
      entityType: "Project",
      entityId: result.project.id,
      newValue: { name: result.project.name, code: result.project.code, sites: result.sites.length, rates: result.rates.length },
    });

    return result;
  }

  // La obra ya no tiene nombre propio (ver QuickSetupProjectDto) — se arma
  // uno legible a partir del primer punto de cargue y el primer punto de
  // descargue, que es como el despachador la reconoce de todos modos
  // ("de General Santander a Botadero Km 20"). Si solo hay un punto (o
  // ninguno tiene un tipo claro), usa los nombres que haya sin forzar el
  // formato "origen -> destino".
  private deriveProjectName(sites: QuickSetupSiteDto[]): string {
    const load = sites.find((s) => s.type === "LOAD" || s.type === "BOTH");
    const unload = sites.find((s) => s.type === "UNLOAD" || s.type === "BOTH");
    if (load && unload && load.name !== unload.name) {
      return `${load.name} → ${unload.name}`;
    }
    const names = [...new Set(sites.map((s) => s.name))];
    return names.slice(0, 2).join(" → ") || "Obra sin nombre";
  }

  // Genera un codigo de material corto y unico a partir del nombre (ej.
  // "Recebo comun" -> "RECEBO-COMUN"), agregando un sufijo numerico si ya
  // existe uno igual en el tenant.
  private async generateMaterialCode(tx: Prisma.TransactionClient, tenantId: string, name: string): Promise<string> {
    const base = name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 20) || "MATERIAL";

    let code = base;
    let suffix = 1;
    while (await tx.material.findFirst({ where: { tenantId, code } })) {
      suffix += 1;
      code = `${base}-${suffix}`;
    }
    return code;
  }
}
