# State Management (Pinia)

## Store: authStore

State:

- user: User | null
- accessToken: string | null
- isAuthenticated: boolean
- isLoading: boolean

Getters:

- isAuthenticated = !!accessToken

Actions:

login(credentials):

- call /auth/login
- store accessToken
- store refreshToken
- set user

signup(data):

- same as login

logout():

- clear state
- remove refreshToken from localStorage

refreshToken():

- call /auth/refresh
- update accessToken

fetchCurrentUser():

- call /auth/me
- set user
