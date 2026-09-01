# better-auth-evp

[![npm version](https://badge.fury.io/js/better-auth-evp.svg)](https://www.npmjs.com/package/better-auth-evp)
[![Better Auth](https://img.shields.io/badge/Better%20Auth-Plugin-blue)](https://www.better-auth.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

[Email Verification Protocol (EVP)](https://developer.chrome.com/blog/email-verification-protocol-origin-trial) plugin for [Better Auth](https://www.better-auth.com), with automatic fallback to whatever other sign-in method you already have.

**[Live preview →](https://evp.kamilmarczak.pl?utm_source=github&utm_medium=referral&utm_campaign=docs)** - a minimal sign-in screen wired up with this plugin, source in [`example`](./example) ([`evp-demo`](https://github.com/qamarq/evp-demo) repo).

## What is EVP?

EVP is an experimental, **Chrome-only** browser capability (currently gated behind an [origin trial](https://developer.chrome.com/origintrials)) that lets a user prove they own an email address without typing an OTP or clicking a magic link. The browser talks to the user's mailbox provider directly and, if the user is signed in there, hands your form a signed token proving ownership - all triggered by the normal act of filling in and submitting an email field.

Because this depends on: the user running an origin-trial build of Chrome, their mailbox provider having implemented the issuer side of the protocol, and the user being signed into that mailbox in the browser - **it will not work for most users today**. This plugin is pure progressive enhancement: wire it up, try it first, and fall back to your existing sign-in method (OTP, magic link, password, ...) whenever it doesn't pan out.

## Installation

```bash
npm install better-auth-evp email-verification-api
```

### Peer Dependencies

- `better-auth` ^1.5.0
- `email-verification-api` ^0.1.0 (does the actual SD-JWT/DNS/issuer verification)
- `zod` ^3.0.0 || ^4.0.0

## Server Setup

```ts
import { betterAuth } from "better-auth";
import { emailVerificationProtocol } from "better-auth-evp";

export const auth = betterAuth({
  // ...
  account: {
    accountLinking: {
      enabled: true,
      // Add "email-verification-protocol" alongside your other trusted
      // providers (e.g. "email-otp", "magic-link") so a user who already
      // has an account can also sign into it via EVP, instead of getting
      // a separate, unlinked account for the same email.
      trustedProviders: ["email-otp", "email-verification-protocol"],
    },
  },
  plugins: [
    emailVerificationProtocol({
      // Must match the origin your Chrome origin-trial token, DNS
      // `_email-verification` record, etc. were issued for.
      origin: "https://example.com",
      allowedEmailDomains: ["example.com"],
      disableSignUp: false,
      userFields: (verified) => ({
        // any additional fields for a newly created user
      }),
    }),
    // Keep your existing sign-in plugin(s) around for the fallback path,
    // e.g. emailOTP(), magicLink(), ...
  ],
});
```

## Client Setup

```ts
import { createAuthClient } from "better-auth/react";
import { emailVerificationProtocolClient } from "better-auth-evp/client";

export const authClient = createAuthClient({
  plugins: [emailVerificationProtocolClient()],
});
```

## Origin Trial Token

As a participating site you must register for the origin trial and serve the token on any page that renders the email form, either as a meta tag:

```html
<meta http-equiv="origin-trial" content="YOUR_TOKEN" />
```

or as an HTTP response header:

```
Origin-Trial: YOUR_TOKEN
```

This plugin does not manage that token for you - it's static per-origin configuration, not something to fetch from an API.

## Form Markup

```html
<input name="email" type="email" autocomplete="email" />
<input type="hidden" name="token" nonce="{nonce}" autocomplete="email-verification-token" />
```

`{nonce}` comes from `authClient.evp.getNonce()` and must be re-fetched for every attempt.

## Usage Example (progressive enhancement)

```ts
import { emailVerificationProtocolClient } from "better-auth-evp/client";

async function handleEmailSubmit(email: string, form: HTMLFormElement) {
  const tokenInput = form.elements.namedItem("token") as HTMLInputElement;

  if (tokenInput.value) {
    const { nonce } = await authClient.evp.getNonce();
    const result = await authClient.evp.verify({
      email,
      token: tokenInput.value,
      nonce,
    });

    if (result.data?.verified) {
      // User is signed in already - redirect and stop here.
      return;
    }
  }

  // EVP unsupported/unavailable/failed - fall back to your normal flow.
  await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
}
```

## API

### Server (`auth.api`)

- `evpGetNonce()` - `GET /evp/get-nonce` - issues a single-use nonce, valid for `nonceExpiresIn` seconds (default 120).
- `evpVerify({ email, token, nonce })` - `POST /evp/verify` - verifies the token and, on success, creates a session (and a user, unless `disableSignUp` is set). Returns `{ verified: false, reason }` instead of throwing on any expected failure (invalid/expired nonce, disallowed email domain, verification failure, email mismatch, sign-up disabled).

### Client (`authClient.evp`)

- `getNonce()`
- `verify({ email, token, nonce })`

### Options

| Option           | Type                                             | Default    | Description                                             |
| ---------------- | ------------------------------------------------ | ---------- | --------------------------------------------------------- |
| `origin`          | `string`                                         | (required) | This relying party's absolute origin, used as `audience`. |
| `nonceExpiresIn`  | `number`                                         | `120`      | Seconds a nonce stays valid.                               |
| `allowedEmailDomains` | `string[]`                                   | optional, unrestricted if omitted | Restricts which email domains `/evp/verify` will even attempt to verify. The email field in your own form is client-side validation only and can be bypassed by calling the API directly - without this option, a caller can make the server perform a DNS lookup + issuer JWKS fetch against any domain they choose (SSRF/abuse surface). Strongly recommended whenever your app only expects a fixed set of domains. |
| `disableSignUp`   | `boolean`                                        | `false`    | Reject verified emails with no existing account.           |
| `userFields`      | `(verified) => T`                                | -          | Extra fields for a newly created user.                     |
| `onVerified`      | `(verified & { userId }) => void \| Promise<void>` | -        | Side-effect hook after a session is created.                |
| `verify`          | custom verification function                    | `verifyEmailToken` from `email-verification-api` | Override for testing. |

## License

MIT
