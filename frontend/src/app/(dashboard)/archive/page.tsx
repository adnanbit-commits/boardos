'use client';
// Redirects to dashboard — these routes require a company context.
// The sidebar builds the correct /companies/[id]/archive URL once a company is loaded.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Redirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/dashboard'); }, [router]);
  return null;
}
