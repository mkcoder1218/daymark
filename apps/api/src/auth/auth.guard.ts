import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { verifyAccessToken } from "./auth.security.js";

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  userId: string;
}

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const header = Array.isArray(authorization) ? authorization[0] : authorization;
    if (!header?.startsWith("Bearer ")) throw new UnauthorizedException("Sign in to continue");

    try {
      request.userId = verifyAccessToken(header.slice(7).trim()).sub;
      return true;
    } catch {
      throw new UnauthorizedException("Your session has expired. Sign in again.");
    }
  }
}
