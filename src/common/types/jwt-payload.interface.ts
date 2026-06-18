import { Role } from '@prisma/client';

export interface JwtPayload {
  sub: string;      // User ID
  name: string;
  username: string;
  role: Role;
}
