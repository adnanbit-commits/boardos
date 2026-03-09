// src/auth/auth.service.ts

import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService }    from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt       from 'bcryptjs';

const BCRYPT_ROUNDS = 12;

export interface RegisterDto {
  name:     string;
  email:    string;
  password: string;
}

export interface LoginDto {
  email:    string;
  password: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma:  PrismaService,
    private readonly jwt:     JwtService,
    private readonly config:  ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const hash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.prisma.user.create({
      data: { name: dto.name, email: dto.email, passwordHash: hash },
      select: { id: true, name: true, email: true, createdAt: true },
    });

    return { token: this.sign(user.id, user.email), user };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const { passwordHash: _, ...safe } = user;
    return { token: this.sign(user.id, user.email), user: safe };
  }

  private sign(userId: string, email: string) {
    return this.jwt.sign(
      { sub: userId, email },
      { expiresIn: this.config.get('JWT_EXPIRES_IN') ?? '7d' },
    );
  }
}
