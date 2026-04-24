# Auth Flow (Hybrid)

## Tokens

- accessToken (short-lived, stored in memory)
- refreshToken (httpOnly cookie)

## Login / Signup

1. Backend:
   - sets refreshToken cookie
   - returns accessToken + user

2. Frontend:
   - store accessToken in Pinia
   - store user

## Request

Authorization: Bearer <accessToken>

## Refresh

1. accessToken expires → 401
2. frontend calls /auth/refresh
3. cookie sent automatically
4. backend returns new accessToken
5. retry original request

## Logout

- backend clears cookie
- frontend clears state
