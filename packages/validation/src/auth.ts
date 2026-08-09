import { z } from "zod";

export const adminLoginSchema = z.object({
  email: z.string().email("Correo invalido"),
  password: z.string().min(8, "La contrasena debe tener minimo 8 caracteres"),
});
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

export const driverLoginSchema = z.object({
  documentOrPhone: z.string().min(4, "Documento o celular invalido"),
  pin: z
    .string()
    .length(6, "El PIN debe tener exactamente 6 digitos")
    .regex(/^\d{6}$/, "El PIN solo debe contener numeros"),
});
export type DriverLoginInput = z.infer<typeof driverLoginSchema>;

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
