// src/auth/jwt.strategy.ts

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy }                  from '@nestjs/passport';
import { ExtractJwt, Strategy }             from 'passport-jwt';
import { ConfigService }                    from '@nestjs/config';
import { PrismaService }                    from '../prisma/prisma.service';

export interface JwtPayload {
  sub:   string;   // user id
  email: string;
  iat?:  number;
  exp?:  number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest:   ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:      config.get<string>('JWT_SECRET') || 'boardos-dev-secret-change-in-production',
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException('User not found');
    // Returned object is attached to req.user by Passport
    return { userId: user.id, email: user.email };
  }
}
