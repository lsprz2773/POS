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
  /** Invalida el token de renovación al cerrar sesión, si el proveedor puede hacerlo. */
  revoke?(refreshToken: string): Promise<void>;
}

export class UserExistsError extends Error {}
export class WeakPasswordError extends Error {}

/**
 * Administración de cuentas en el proveedor de identidad (fase 10c): el propietario da de alta y de baja
 * a sus vendedores. Las contraseñas solo pasan por aquí hacia el proveedor: no se guardan ni se registran (T108).
 */
export interface UserDirectory {
  /** Crea la cuenta con su contraseña definitiva. Devuelve el identificador (`sub`) del proveedor. */
  createUser(email: string, password: string): Promise<{ subject: string }>;
  disable(subject: string): Promise<void>;
  enable(subject: string): Promise<void>;
  /** Cierra todas las sesiones de la cuenta. */
  signOutEverywhere(subject: string): Promise<void>;
  deleteUser(subject: string): Promise<void>;
}
