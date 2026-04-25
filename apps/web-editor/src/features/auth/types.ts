/** User info returned by the API after authentication. */
export type AuthUser = {
  userId: string;
  email: string;
  displayName: string;
};

/** Response from POST /auth/register and POST /auth/login. */
export type AuthResponse = {
  user: AuthUser;
  token: string;
  expiresAt: string;
};

/** Response from POST /auth/forgot-password, /auth/reset-password, /auth/verify-email. */
export type MessageResponse = {
  message: string;
};
