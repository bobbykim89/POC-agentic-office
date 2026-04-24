# API Integration

## HTTP Client

Use axios or fetch wrapper.

## Rules

- Always attach Authorization header:
  Authorization: Bearer <accessToken>

## Interceptor Logic

On every request:

- attach accessToken

On 401 response:

1. call refreshToken()
2. retry original request
3. if refresh fails → logout

## Endpoints

- POST /auth/login
- POST /auth/signup
- POST /auth/refresh
- GET /auth/me

## Refresh Request

- call /auth/refresh
- DO NOT send refresh token manually
- browser sends cookie automatically
