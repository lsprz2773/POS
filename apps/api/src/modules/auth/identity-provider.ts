/** Identidad verificada por el proveedor (Cognito en producción, proveedor local en desarrollo). */
export interface Identity {
  subject: string;
  email: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessExpiresInSeconds: number;
  refreshExpiresInSeconds: number;
}

export class InvalidCredentialsError extends Error {}
export class InvalidTokenError extends Error {}

/** Puerto de identidad: el resto de la aplicación no conoce al proveedor concreto. */
export interface IdentityProvider {
  login(email: string, password: string): Promise<{ identity: Identity; tokens: AuthTokens }>;
  verifyAccessToken(token: string): Promise<Identity>;
  refresh(refreshToken: string): Promise<{ identity: Identity; tokens: AuthTokens }>;
}
