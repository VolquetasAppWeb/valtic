import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsIn, IsOptional, IsString, MinLength } from "class-validator";

const ASSIGNABLE_ROLES = ["TENANT_ADMIN", "DISPATCHER"] as const;

export class CreateUserDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  firstName!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  lastName!: string;

  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8, { message: "La contrasena debe tener minimo 8 caracteres" })
  password!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ enum: ASSIGNABLE_ROLES })
  @IsIn(ASSIGNABLE_ROLES)
  roleName!: (typeof ASSIGNABLE_ROLES)[number];
}
