// src/auth/google.strategy.ts
// Passport strategy for Google OAuth 2.0
// On success: find or create user by googleId/email, return user object

import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private readonly prisma: PrismaService) {
    super({
      clientID:     process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL:  process.env.GOOGLE_CALLBACK_URL ?? `${process.env.BACKEND_URL ?? 'http://localhost:3001'}/auth/google/callback`,
      scope: ['email', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ) {
    const email     = profile.emails?.[0]?.value;
    const googleId  = profile.id;
    const name      = profile.displayName ?? profile.emails?.[0]?.value?.split('@')[0] ?? 'Unknown';
    const avatarUrl = profile.photos?.[0]?.value ?? null;

    if (!email) return done(new Error('No email from Google'), false);

    try {
      // Find by googleId first, then by email (handles existing password users)
      let user = await this.prisma.user.findFirst({
        where: { OR: [{ googleId }, { email }] },
      });

      if (user) {
        // Existing user — link googleId if not already linked
        if (!user.googleId) {
          user = await this.prisma.user.update({
            where: { id: user.id },
            data:  { googleId, avatarUrl: avatarUrl ?? user.avatarUrl },
          });
        }
      } else {
        // New user — create account
        user = await this.prisma.user.create({
          data: { email, name, googleId, avatarUrl },
        });
      }

      return done(null, user);
    } catch (err) {
      return done(err, false);
    }
  }
}
