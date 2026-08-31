import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { generateRandomString } from "better-auth/crypto";
import { verifyEmailToken } from "email-verification-api";
import * as z from "zod";

import type {
  EvpPluginOptions,
  EvpVerificationResult,
  EvpVerifiedEmail,
} from "./types";

export * from "./types";

const NONCE_IDENTIFIER_PREFIX = "evp-nonce:";

const evpVerifyBodySchema = z.object({
  email: z.string(),
  token: z.string(),
  nonce: z.string(),
});

/**
 * [Email Verification Protocol](https://developer.chrome.com/blog/email-verification-protocol-origin-trial)
 * plugin for Better Auth.
 *
 * EVP lets a browser that supports the (Chrome-only, origin-trial-gated)
 * protocol prove a user owns the email address they typed into a form,
 * without sending an OTP or magic link. It is entirely progressive
 * enhancement: unsupported browsers, mailbox providers that haven't
 * implemented the issuer side, or a user simply not signed into their
 * mailbox all result in an empty/unverifiable token. Callers MUST treat
 * `verified: false` (or the nonce/verify endpoints being unreachable) as a
 * normal, expected outcome and fall back to whatever sign-in method the
 * app already uses (email OTP, magic link, password, ...) - this plugin
 * does not implement a fallback itself, it only adds the EVP fast path.
 *
 * @see https://github.com/philnash/email-verification-api
 */
export function emailVerificationProtocol<T extends Record<string, any> = {}>(
  options: EvpPluginOptions<T>,
) {
  if (!options.origin) {
    throw new Error(
      "emailVerificationProtocol plugin requires an `origin` option (this relying party's absolute origin)",
    );
  }

  const nonceExpiresIn = options.nonceExpiresIn ?? 120;
  const verify = options.verify ?? verifyEmailToken;

  return {
    id: "email-verification-protocol",
    endpoints: {
      /**
       * ### Endpoint
       *
       * GET `/evp/nonce`
       *
       * ### API Methods
       *
       * **server:** `auth.api.evpNonce`
       *
       * **client:** `authClient.evp.getNonce`
       *
       * Issues a single-use nonce to bind into the hidden
       * `email-verification-token` input's `nonce` attribute. Call this
       * once per sign-in attempt, right before rendering the form.
       */
      evpNonce: createAuthEndpoint(
        "/evp/nonce",
        { method: "GET" },
        async (ctx) => {
          const nonce = generateRandomString(24, "a-z", "A-Z", "0-9");
          await ctx.context.internalAdapter.createVerificationValue({
            identifier: `${NONCE_IDENTIFIER_PREFIX}${nonce}`,
            value: "pending",
            expiresAt: new Date(Date.now() + nonceExpiresIn * 1000),
          });
          return ctx.json({ nonce, expiresIn: nonceExpiresIn });
        },
      ),
      /**
       * ### Endpoint
       *
       * POST `/evp/verify`
       *
       * ### API Methods
       *
       * **server:** `auth.api.evpVerify`
       *
       * **client:** `authClient.evp.verify`
       *
       * Verifies the browser-issued Email Verification Token. On success,
       * signs the user in (creating an account first if none exists and
       * sign-up isn't disabled) exactly like any other passwordless method
       * and returns `{ verified: true }`. On any failure it returns
       * `{ verified: false, reason }` instead of throwing, since a failure
       * here is an expected, common outcome that the caller should recover
       * from by falling back to a different sign-in method.
       */
      evpVerify: createAuthEndpoint(
        "/evp/verify",
        { method: "POST", body: evpVerifyBodySchema },
        async (ctx) => {
          const email = ctx.body.email.trim().toLowerCase();
          const { token, nonce } = ctx.body;

          if (!z.email().safeParse(email).success) {
            throw new APIError("BAD_REQUEST", { message: "Invalid email" });
          }

          const nonceRecord =
            await ctx.context.internalAdapter.consumeVerificationValue(
              `${NONCE_IDENTIFIER_PREFIX}${nonce}`,
            );
          if (!nonceRecord) {
            return ctx.json({ verified: false, reason: "nonce_invalid" });
          }

          let result: EvpVerificationResult;
          try {
            result = await verify({
              token,
              nonce,
              email,
              audience: options.origin,
            });
          } catch (error) {
            ctx.context.logger.error(
              "[email-verification-protocol] verification threw",
              error,
            );
            return ctx.json({ verified: false, reason: "verification_error" });
          }

          if (!result.ok) {
            return ctx.json({
              verified: false,
              reason: result.error.code,
            });
          }

          const verified: EvpVerifiedEmail = result.value;
          if (verified.email.trim().toLowerCase() !== email) {
            return ctx.json({ verified: false, reason: "email_mismatch" });
          }

          const existing =
            await ctx.context.internalAdapter.findUserByEmail(email);

          let user;
          if (!existing) {
            if (options.disableSignUp) {
              return ctx.json({ verified: false, reason: "sign_up_disabled" });
            }
            const additionalFields = options.userFields
              ? options.userFields(verified)
              : ({} as T);
            user = await ctx.context.internalAdapter.createUser(
              { ...additionalFields, email, emailVerified: true, name: "" },
              { method: "email-verification-protocol" },
            );
          } else {
            user = existing.user;
            if (!user.emailVerified) {
              user = await ctx.context.internalAdapter.updateUser(user.id, {
                emailVerified: true,
              });
            }
          }

          const session = await ctx.context.internalAdapter.createSession(
            user.id,
          );
          await setSessionCookie(ctx, { session, user });

          if (options.onVerified) {
            await options.onVerified({ ...verified, userId: user.id });
          }

          return ctx.json({
            verified: true,
            token: session.token,
            user,
          });
        },
      ),
    },
    rateLimit: [
      {
        pathMatcher(path: string) {
          return path.startsWith("/evp/");
        },
        window: 60,
        max: 20,
      },
    ],
  } satisfies BetterAuthPlugin;
}
