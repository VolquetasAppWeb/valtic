import { Controller, Get, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PERMISSIONS } from "@valtic/types";
import { Permissions } from "../../common/decorators/permissions.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { AuditService } from "./audit.service";
import { AuditQueryDto } from "./dto/audit-query.dto";

// Sin TenantScopeGuard a proposito: SUPER_ADMIN (audit:read-global) necesita
// poder consultar auditoria entre tenants. El filtrado por tenant se
// resuelve dentro de AuditService.findAll segun el permiso del actor.
@ApiTags("audit")
@ApiBearerAuth()
@Controller("audit")
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Permissions(PERMISSIONS.AUDIT_READ, PERMISSIONS.AUDIT_READ_GLOBAL)
  @ApiOperation({ summary: "Lista eventos de auditoria (scope de tenant automatico segun el permiso del actor)" })
  findAll(@Query() query: AuditQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.auditService.findAll(user, query);
  }
}
