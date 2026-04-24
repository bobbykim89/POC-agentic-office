# Security

## Storage

- accessToken in memory (safe from XSS persistence)
- refreshToken in localStorage (acceptable tradeoff)

## Important

- Never store accessToken in localStorage
- Always rotate accessToken via refresh

## Risks

- XSS can access refreshToken
  → mitigate later with:
  - CSP
  - input sanitization
