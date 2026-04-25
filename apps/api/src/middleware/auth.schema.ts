import { z } from 'zod';

/** Zod schema for POST /auth/register request body. */
export const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(255),
});

/** Zod schema for POST /auth/login request body. */
export const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(128),
});

/** Zod schema for POST /auth/forgot-password request body. */
export const forgotPasswordSchema = z.object({
  email: z.string().email().max(255),
});

/** Zod schema for POST /auth/reset-password request body. */
export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

/** Zod schema for POST /auth/verify-email request body. */
export const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

export type RegisterBody = z.infer<typeof registerSchema>;
export type LoginBody = z.infer<typeof loginSchema>;
export type ForgotPasswordBody = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordBody = z.infer<typeof resetPasswordSchema>;
export type VerifyEmailBody = z.infer<typeof verifyEmailSchema>;
