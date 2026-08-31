export interface EvpVerifiedEmail {
  email: string;
  issuer: string;
  audience: string;
  issuedAt?: unknown;
  claims?: Record<string, unknown>;
}

export interface EvpVerificationError {
  stage?: string;
  code: string;
  message: string;
  cause?: unknown;
}

export type EvpVerificationResult =
  | { ok: true; value: EvpVerifiedEmail }
  | { ok: false; error: EvpVerificationError };

export interface EvpVerifyParams {
  token: string;
  nonce: string;
  email: string;
  audience: string;
}

export interface EvpPluginOptions<T extends Record<string, any> = {}> {
  origin: string;
  nonceExpiresIn?: number;
  disableSignUp?: boolean;
  userFields?: (verified: EvpVerifiedEmail) => T;
  onVerified?: (
    verified: EvpVerifiedEmail & { userId: string },
  ) => void | Promise<void>;
  verify?: (params: EvpVerifyParams) => Promise<EvpVerificationResult>;
}

export interface EvpNonceResponse {
  nonce: string;
  expiresIn: number;
}

export interface EvpVerifyResponse {
  verified: boolean;
  reason?: string;
  token?: string;
  user?: Record<string, unknown>;
}
