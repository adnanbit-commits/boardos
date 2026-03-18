'use client';
// src/hooks/useMeetingSocket.ts
//
// Connects to the BoardOS real-time gateway and subscribes to all
// meeting-scoped events. Call this once in MeetingWorkspacePage and
// pass the reload callbacks — the hook handles connect/disconnect/room
// join/leave automatically.
//
// Usage:
//   useMeetingSocket(meetingId, jwt, {
//     onMeetingUpdated:     reloadMeeting,
//     onResolutionUpdated:  reloadResolutions,
//     onVoteCast:           reloadResolutions,
//     onAttendanceUpdated:  reloadAttendance,
//     onDeclarationUpdated: reloadDeclarations,
//     onNominationUpdated:  reloadNomination,
//     onMinutesUpdated:     reloadMinutes,
//   });

import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

export interface MeetingSocketCallbacks {
  onMeetingUpdated?:     () => void;
  onResolutionUpdated?:  () => void;
  onVoteCast?:           () => void;
  onAttendanceUpdated?:  () => void;
  onDeclarationUpdated?: () => void;
  onNominationUpdated?:  () => void;
  onMinutesUpdated?:     () => void;
}

export function useMeetingSocket(
  meetingId: string | null,
  jwt: string | null,
  callbacks: MeetingSocketCallbacks,
) {
  const socketRef = useRef<Socket | null>(null);
  // Keep callbacks ref so we don't need to re-subscribe on every render
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;

  useEffect(() => {
    if (!meetingId || !jwt) return;

    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

    const socket = io(`${apiBase}/meeting`, {
      auth: { token: jwt },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join:meeting', { meetingId });
    });

    socket.on('meeting:updated',     () => cbRef.current.onMeetingUpdated?.());
    socket.on('resolution:updated',  () => cbRef.current.onResolutionUpdated?.());
    socket.on('vote:cast',           () => cbRef.current.onVoteCast?.());
    socket.on('attendance:updated',  () => cbRef.current.onAttendanceUpdated?.());
    socket.on('declaration:updated', () => cbRef.current.onDeclarationUpdated?.());
    socket.on('nomination:updated',  () => cbRef.current.onNominationUpdated?.());
    socket.on('minutes:updated',     () => cbRef.current.onMinutesUpdated?.());

    socket.on('disconnect', () => {
      // Socket.io handles reconnect automatically
    });

    return () => {
      socket.emit('leave:meeting', { meetingId });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [meetingId, jwt]);
}
