// src/realtime/realtime.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MeetingGateway } from './meeting.gateway';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET') ?? 'boardos-dev-secret',
      }),
    }),
  ],
  providers: [MeetingGateway],
  exports:   [MeetingGateway],
})
export class RealtimeModule {}
