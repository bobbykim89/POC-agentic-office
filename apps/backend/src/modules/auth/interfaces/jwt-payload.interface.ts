export interface JwtPayload {
  sub: string;
  email: string;
  username: string;
  type: 'access' | 'refresh';
}
