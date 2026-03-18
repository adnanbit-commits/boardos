// src/realtime/meeting.gateway.ts
//
// WebSocket gateway for real-time meeting sync.
//
// Each connected client joins a room identified by meetingId.
// Any mutation in the meeting workspace broadcasts a typed event
// to all clients in that room so they can re-fetch the relevant data
// without polling or manual refresh.
//
// Event catalogue:
//   meeting:updated       — status changed, agenda item added/removed
//   resolution:updated    — resolution created, updated, status changed
//   vote:cast             — vote recorded (tally changes)
//   attendance:updated    — attendance recorded or updated
//   declaration:updated   — director declaration noted
//   nomination:updated    — chairperson nomination/confirmation
//   minutes:updated       — minutes generated or signed

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Injectable } from '@nestjs/common';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: [
      process.env.FRONTEND_URL ?? 'http://localhost:3000',
      /\.nip\.io(:\d+)?$/,
    ],
    credentials: true,
  },
  namespace: '/meeting',
})
export class MeetingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private readonly jwt: JwtService) {}

  // ── Connection lifecycle ────────────────────────────────────────────────────

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        client.disconnect();
        return;
      }

      // Validate JWT — disconnect if invalid
      this.jwt.verify(token);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    // Socket.io automatically cleans up room membership on disconnect
  }

  // ── Room management ────────────────────────────────────────────────────────

  @SubscribeMessage('join:meeting')
  handleJoin(
    @MessageBody() data: { meetingId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.join(`meeting:${data.meetingId}`);
    return { joined: data.meetingId };
  }

  @SubscribeMessage('leave:meeting')
  handleLeave(
    @MessageBody() data: { meetingId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.leave(`meeting:${data.meetingId}`);
    return { left: data.meetingId };
  }

  // ── Broadcast helpers — called by services after mutations ─────────────────

  broadcastMeetingUpdated(meetingId: string, payload?: any) {
    this.server
      .to(`meeting:${meetingId}`)
      .emit('meeting:updated', { meetingId, ...payload });
  }

  broadcastResolutionUpdated(meetingId: string, payload?: any) {
    this.server
      .to(`meeting:${meetingId}`)
      .emit('resolution:updated', { meetingId, ...payload });
  }

  broadcastVoteCast(meetingId: string, payload?: any) {
    this.server
      .to(`meeting:${meetingId}`)
      .emit('vote:cast', { meetingId, ...payload });
  }

  broadcastAttendanceUpdated(meetingId: string, payload?: any) {
    this.server
      .to(`meeting:${meetingId}`)
      .emit('attendance:updated', { meetingId, ...payload });
  }

  broadcastDeclarationUpdated(meetingId: string, payload?: any) {
    this.server
      .to(`meeting:${meetingId}`)
      .emit('declaration:updated', { meetingId, ...payload });
  }

  broadcastNominationUpdated(meetingId: string, payload?: any) {
    this.server
      .to(`meeting:${meetingId}`)
      .emit('nomination:updated', { meetingId, ...payload });
  }

  broadcastMinutesUpdated(meetingId: string, payload?: any) {
    this.server
      .to(`meeting:${meetingId}`)
      .emit('minutes:updated', { meetingId, ...payload });
  }
}
