import type { BetterAuthPlugin } from "better-auth";
import {
  APIError,
  createAuthEndpoint,
  formCsrfMiddleware,
} from "better-auth/api";
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
      evpGetNonce: createAuthEndpoint(
        "/evp/get-nonce",
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
      evpVerify: createAuthEndpoint(
        "/evp/verify",
        {
          method: "POST",
          body: evpVerifyBodySchema,
          use: [formCsrfMiddleware],
        },
        async (ctx) => {
          const email = ctx.body.email.trim().toLowerCase();
          const { token, nonce } = ctx.body;

          if (!z.email().safeParse(email).success) {
            throw new APIError("BAD_REQUEST", { message: "Invalid email" });
          }

          if (options.allowedEmailDomains) {
            const domain = email.split("@")[1];
            if (!options.allowedEmailDomains.includes(domain)) {
              return ctx.json({
                verified: false,
                reason: "domain_not_allowed",
              });
            }
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
              await ctx.context.internalAdapter.deleteUserSessions(user.id);
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
