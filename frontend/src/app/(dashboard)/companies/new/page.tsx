'use client';
// app/(dashboard)/companies/new/page.tsx
// Create a new company workspace.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRequireAuth } from '@/hooks/useAuth';
import { companies as companiesApi } from '@/lib/api';

export default function NewCompanyPage() {
  const router = useRouter();
  const { token } = useRequireAuth();

  const [name,        setName]        = useState('');
  const [cin,         setCin]         = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState('');

  async function handleSubmit() {
    if (!name.trim()) { setError('Company name is required.'); return; }
    if (!token) return;
    setSubmitting(true);
    setError('');
    try {
      const company = await companiesApi.create(
        { name: name.trim(), ...(cin.trim() ? { cin: cin.trim() } : {}) },
        token,
      );
      router.push(`/companies/${company.id}`);
    } catch (err: any) {
      setError((err as any)?.body?.message ?? 'Failed to create company.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{
      minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '48px 24px', fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      <div style={{
        width: '100%', maxWidth: 480,
        background: '#191D24', border: '1px solid #232830',
        borderRadius: 20, padding: '40px 36px',
      }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{
            width: 44, height: 44, background: '#1A2540', borderRadius: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, color: '#4F7FFF', marginBottom: 16,
          }}>⬢</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#F0F2F5', marginBottom: 6 }}>
            Create company workspace
          </h1>
          <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.6 }}>
            Set up your board governance workspace. You can invite directors after creation.
          </p>
        </div>

        {/* Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Company Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Acme Private Limited"
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              style={{
                width: '100%', background: '#13161B', border: '1px solid #232830',
                borderRadius: 10, padding: '10px 14px', color: '#F0F2F5',
                fontSize: 14, outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              CIN <span style={{ color: '#374151', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
            </label>
            <input
              type="text"
              value={cin}
              onChange={e => setCin(e.target.value)}
              placeholder="U12345MH2024PTC000000"
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              style={{
                width: '100%', background: '#13161B', border: '1px solid #232830',
                borderRadius: 10, padding: '10px 14px', color: '#F0F2F5',
                fontSize: 14, outline: 'none', boxSizing: 'border-box',
                fontFamily: 'monospace',
              }}
            />
          </div>

          {error && (
            <p style={{ fontSize: 13, color: '#EF4444', background: '#2D1515', padding: '10px 14px', borderRadius: 8 }}>
              {error}
            </p>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button
              onClick={() => router.back()}
              style={{
                flex: 1, padding: '11px', background: 'transparent',
                border: '1px solid #232830', borderRadius: 10,
                color: '#6B7280', fontSize: 14, cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{
                flex: 2, padding: '11px',
                background: submitting ? '#1A2540' : '#4F7FFF',
                border: 'none', borderRadius: 10,
                color: submitting ? '#6B7280' : '#fff',
                fontSize: 14, fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Creating…' : 'Create workspace'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
