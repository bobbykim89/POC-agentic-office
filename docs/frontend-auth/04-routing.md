# Routing

## Public

- /login
- /signup

## Protected

- /

## Behavior

- If not authenticated → redirect to /login
- If authenticated → allow

## On App Load

1. Check refreshToken in localStorage
2. If exists:
   → call refreshToken()
   → fetchCurrentUser()
3. Else:
   → go to login
