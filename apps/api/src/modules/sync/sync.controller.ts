import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PERMISSIONS } from "@valtic/types";
import { Permissions } from "../../common/decorators/permissions.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { TenantId } from "../../common/decorators/tenant-id.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { TenantScopeGuard } from "../auth/guards/tenant-scope.guard";
import { SyncService } from "./sync.service";
import { SyncPushDto } from "./dto/sync-push.dto";
import { SyncAcknowledgeDto } from "./dto/sync-acknowledge.dto";

@ApiTags("sync")
@ApiBearerAuth()
@UseGuards(TenantScopeGuard)
@Controller("sync")
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post("push")
  @Permissions(PERMISSIONS.TRIPS_UPDATE_OWN_PROGRESS)
  @ApiOperation({ summary: "Sincroniza el outbox offline del conductor (acciones de viaje + puntos GPS)" })
  push(@Body() dto: SyncPushDto, @TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.syncService.push(tenantId, user.sub, dto.events).then((results) => ({
      results,
      serverTime: new Date().toISOString(),
    }));
  }

  @Get("pull")
  @Permissions(PERMISSIONS.TRIPS_READ_OWN)
  @ApiOperation({ summary: "Reconcilia el estado del viaje activo del conductor tras reconectar" })
  pull(@TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.syncService.pull(tenantId, user.sub);
  }

  @Post("acknowledge")
  @Permissions(PERMISSIONS.TRIPS_UPDATE_OWN_PROGRESS)
  @ApiOperation({ summary: "Confirma que el cliente proceso los resultados de un push previo" })
  acknowledge(@Body() dto: SyncAcknowledgeDto, @TenantId() tenantId: string) {
    return this.syncService.acknowledge(tenantId, dto.eventIds);
  }
}
