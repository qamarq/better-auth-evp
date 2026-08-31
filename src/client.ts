import type { BetterAuthClientPlugin } from "better-auth/client";

import type { emailVerificationProtocol } from "./index";
import type { EvpNonceResponse, EvpVerifyResponse } from "./types";

/**
 * `autocomplete` value for the visible email `<input>`. Required by the
 * protocol so the browser can offer verified addresses.
 */
export const EVP_EMAIL_AUTOCOMPLETE = "email";

/**
 * `autocomplete` value for the hidden token `<input>` the browser fills in
 * with the signed Email Verification Token.
 */
export const EVP_TOKEN_AUTOCOMPLETE = "email-verification-token";

export function emailVerificationProtocolClient() {
  return {
    id: "email-verification-protocol",
    $InferServerPlugin: {} as ReturnType<typeof emailVerificationProtocol>,
    getActions: ($fetch) => ({
      evp: {
        /**
         * Fetches a fresh, single-use nonce. Call this once per sign-in
         * attempt and bind the result to the hidden token input's `nonce`
         * attribute before the user submits the form.
         */
        getNonce: async () => {
          return $fetch<EvpNonceResponse>("/evp/nonce", { method: "GET" });
        },
        /**
         * Verifies the token the browser filled into the hidden input and,
         * on success, signs the user in. Always check `data.verified`
         * (or the presence of `error`) and fall back to a normal sign-in
         * method when it's falsy - this is expected for the vast majority
         * of browsers/users today.
         */
        verify: async (data: {
          email: string;
          token: string;
          nonce: string;
        }) => {
          return $fetch<EvpVerifyResponse>("/evp/verify", {
            method: "POST",
            body: data,
          });
        },
      },
    }),
  } satisfies BetterAuthClientPlugin;
}
