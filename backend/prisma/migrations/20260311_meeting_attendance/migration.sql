-- AttendanceMode enum
CREATE TYPE "AttendanceMode" AS ENUM ('IN_PERSON', 'VIDEO', 'PHONE', 'ABSENT');

-- MeetingAttendance table
CREATE TABLE "meeting_attendance" (
  "id"         TEXT NOT NULL,
  "meetingId"  TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "mode"       "AttendanceMode" NOT NULL DEFAULT 'IN_PERSON',
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "meeting_attendance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "meeting_attendance_meetingId_userId_key" UNIQUE ("meetingId", "userId"),
  CONSTRAINT "meeting_attendance_meetingId_fkey"
    FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE,
  CONSTRAINT "meeting_attendance_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT
);
