'use client';
// app/shared/meeting/[shareToken]/page.tsx
// Publicly accessible — no login required. Served to meeting invitees.

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { publicApi } from '@/lib/api';

interface SharedDoc {
  id: string; title: string; docType: string;
  fileName: string; fileSize: number | null;
  uploadedAt: string; downloadUrl: string;
}

interface SharedMeeting {
  companyName: string; meetingTitle: string;
  scheduledAt: string; documents: SharedDoc[];
}

const DOC_TYPE_LABEL: Record<string, string> = {
  DRAFT_NOTICE:     'Notice',
  DRAFT_AGENDA:     'Agenda',
  SUPPORTING_PAPER: 'Supporting Paper',
  DRAFT_RESOLUTION: 'Draft Resolution',
  CUSTOM:           'Document',
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtSize(bytes: number | null) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SharedMeetingPage() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const [data,    setData]    = useState<SharedMeeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    publicApi.meetingPapers(shareToken)
      .then(setData)
      .catch(() => setError('This link is invalid or has been deactivated.'))
      .finally(() => setLoading(false));
  }, [shareToken]);

  return (
    <div style={{ minHeight: '100vh', background: '#0D0F12', fontFamily: "'DM Sans', system-ui, sans-serif", padding: '0 0 60px' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>

      {/* Top bar */}
      <div style={{ background: '#13161B', borderBottom: '1px solid #1a1e26', padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: '#1E2530', border: '1px solid #374151', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#4F7FFF' }}>S</div>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#F0F2F5' }}>SafeMinutes</span>
        </div>
        <span style={{ fontSize: 11, color: '#374151', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Meeting Papers — Shared Link</span>
      </div>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '40px 24px 0' }}>
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: 16 }}>
            <div style={{ width: 28, height: 28, border: '2px solid #232830', borderTop: '2px solid #4F7FFF', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <p style={{ fontSize: 13, color: '#6B7280' }}>Loading meeting papers…</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {error && (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>⊘</div>
            <p style={{ fontSize: 16, fontWeight: 700, color: '#F87171', marginBottom: 8 }}>Link unavailable</p>
            <p style={{ fontSize: 13, color: '#6B7280' }}>{error}</p>
          </div>
        )}

        {data && !loading && (
          <>
            {/* Meeting header */}
            <div style={{ background: '#13161B', border: '1px solid #232830', borderRadius: 18, padding: '28px 28px 24px', marginBottom: 24 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#4F7FFF', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 8px' }}>
                {data.companyName}
              </p>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: '#F0F2F5', margin: '0 0 10px', lineHeight: 1.3 }}>
                {data.meetingTitle}
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, color: '#9CA3AF' }}>📅</span>
                <span style={{ fontSize: 14, color: '#9CA3AF' }}>{fmtDate(data.scheduledAt)}</span>
              </div>
            </div>

            {/* Documents */}
            <p style={{ fontSize: 11, fontWeight: 700, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>
              {data.documents.length} Document{data.documents.length !== 1 ? 's' : ''}
            </p>

            {data.documents.length === 0 ? (
              <div style={{ background: '#13161B', border: '1px solid #232830', borderRadius: 14, padding: '40px 24px', textAlign: 'center', color: '#6B7280', fontSize: 13 }}>
                No documents have been shared for this meeting yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {data.documents.map(doc => (
                  <div key={doc.id} style={{ background: '#13161B', border: '1px solid #232830', borderRadius: 14, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ width: 42, height: 42, borderRadius: 10, background: '#1a1e26', border: '1px solid #232830', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>📄</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <p style={{ fontSize: 14, fontWeight: 700, color: '#F0F2F5', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.title}</p>
                        <span style={{ fontSize: 9, fontWeight: 700, color: '#9CA3AF', background: '#1a1e26', border: '1px solid #232830', padding: '1px 6px', borderRadius: 10, textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
                          {DOC_TYPE_LABEL[doc.docType] ?? doc.docType}
                        </span>
                      </div>
                      <p style={{ fontSize: 11, color: '#6B7280', margin: 0 }}>
                        {doc.fileName}{doc.fileSize ? ` · ${fmtSize(doc.fileSize)}` : ''}
                      </p>
                    </div>
                    <a href={doc.downloadUrl} target="_blank" rel="noopener noreferrer"
                      style={{ flexShrink: 0, background: '#4F7FFF', color: '#fff', textDecoration: 'none', fontSize: 12, fontWeight: 700, padding: '8px 18px', borderRadius: 9, display: 'inline-block' }}>
                      View / Download ↗
                    </a>
                  </div>
                ))}
              </div>
            )}

            {/* Footer note */}
            <div style={{ marginTop: 32, background: '#13161B', border: '1px solid #1a1e26', borderRadius: 12, padding: '14px 18px' }}>
              <p style={{ fontSize: 11, color: '#374151', margin: 0, lineHeight: 1.6 }}>
                These documents have been shared with you by the Company Secretary or a Director of {data.companyName} for review prior to the meeting.
                This link was generated by SafeMinutes, a board governance platform for Indian private companies.
                If you believe you received this link in error, please contact the sender directly.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
