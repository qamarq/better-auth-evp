export interface EvpVerifiedEmail {
  /** The mailbox address the issuer vouched for. */
  email: string;
  /** The issuer that signed the Email Verification Token. */
  issuer: string;
  /** The relying-party origin the token was bound to. */
  audience: string;
  /** Timestamps reported by the verification library, if any. */
  issuedAt?: unknown;
  /** Any additional claims the issuer included in the token. */
  claims?: Record<string, unknown>;
}

export interface EvpVerificationError {
  /** Which stage of verification failed (DNS lookup, signature check, ...). */
  stage?: string;
  /** Machine-readable error code. */
  code: string;
  /** Human-readable message, safe to log. */
  message: string;
  cause?: unknown;
}

export type EvpVerificationResult =
  | { ok: true; value: EvpVerifiedEmail }
  | { ok: false; error: EvpVerificationError };

export interface EvpVerifyParams {
  /** The SD-JWT+KB presentation the browser put in the hidden form field. */
  token: string;
  /** The nonce this relying party issued for the current attempt. */
  nonce: string;
  /** The email address the user typed into the form. */
  email: string;
  /** This relying party's absolute HTTP(S) origin. */
  audience: string;
}

export interface EvpPluginOptions<T extends Record<string, any> = {}> {
  /**
   * This relying party's absolute origin, e.g. `https://example.com`. Sent
   * to the verifier as the `audience` and must match the origin the Chrome
   * origin-trial token (and the DNS/issuer records) were issued for.
   */
  origin: string;

  /**
   * How long an issued nonce stays valid for, in seconds.
   * @default 120
   */
  nonceExpiresIn?: number;

  /**
   * When true, a verified email that has no existing account is rejected
   * instead of provisioning a new user.
   * @default false
   */
  disableSignUp?: boolean;

  /**
   * Additional fields to set on a newly created user.
   */
  userFields?: (verified: EvpVerifiedEmail) => T;

  /**
   * Called after a session has been created for a successfully verified
   * email. Useful for analytics/logging.
   */
  onVerified?: (
    verified: EvpVerifiedEmail & { userId: string },
  ) => void | Promise<void>;

  /**
   * Overrides the verification call - mainly useful for tests. Defaults to
   * `verifyEmailToken` from the `email-verification-api` package.
   */
  verify?: (params: EvpVerifyParams) => Promise<EvpVerificationResult>;
}

export interface EvpNonceResponse {
  nonce: string;
  expiresIn: number;
}

export interface EvpVerifyResponse {
  verified: boolean;
  /**
   * Present when `verified` is false. Callers should treat any failure as
   * a signal to fall back to a normal sign-in method (OTP, magic link,
   * password, ...) - this is an experimental, Chrome-only capability and
   * is expected to fail for most users.
   */
  reason?: string;
  token?: string;
  user?: Record<string, unknown>;
}
