-- Add SS-1 virtual attendance confirmation fields to MeetingAttendance
ALTER TABLE meeting_attendance
  ADD COLUMN IF NOT EXISTS location       TEXT,
  ADD COLUMN IF NOT EXISTS no_third_party BOOLEAN;
