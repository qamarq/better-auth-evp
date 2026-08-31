import type { BetterAuthClientPlugin } from "better-auth/client";

import type { emailVerificationProtocol } from "./index";

export const EVP_EMAIL_AUTOCOMPLETE = "email";
export const EVP_TOKEN_AUTOCOMPLETE = "email-verification-token";

export function emailVerificationProtocolClient() {
  return {
    id: "email-verification-protocol",
    $InferServerPlugin: {} as ReturnType<typeof emailVerificationProtocol>,
  } satisfies BetterAuthClientPlugin;
}
