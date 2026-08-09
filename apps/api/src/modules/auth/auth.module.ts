import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { TokenService } from "./token.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { PermissionsGuard } from "./guards/permissions.guard";
import { TenantScopeGuard } from "./guards/tenant-scope.guard";

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, TokenService, JwtAuthGuard, PermissionsGuard, TenantScopeGuard],
  exports: [TokenService, JwtAuthGuard, PermissionsGuard, TenantScopeGuard],
})
export class AuthModule {}
