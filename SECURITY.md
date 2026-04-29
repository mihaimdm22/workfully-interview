# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly.

**Do not open a public GitHub issue.**

Include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will acknowledge receipt within 48 hours and provide a timeline for a fix.

## Scope

This policy covers the screening bot:

- Server Actions in `src/app/actions.ts` (file upload, text submission)
- The screening pipeline (`src/lib/ai/screen.ts`) — including prompt injection vectors
- The persisted FSM snapshot and the `conversations` / `messages` / `screenings` tables

## Supported Versions

Only the latest commit on `main` is supported.

## Notes

- PDF parsing (`unpdf`) runs on untrusted user uploads; size is capped at 5 MB.
- The Anthropic API key is server-only; it is never exposed to the client bundle.
- The conversation cookie is `httpOnly` + `sameSite: lax`.
