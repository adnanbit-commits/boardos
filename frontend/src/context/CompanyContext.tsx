'use client';
// src/context/CompanyContext.tsx
// Shares active company + membership role across the dashboard subtree.
// Layout loads it; pages consume it via useCompany().

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { companies as companiesApi, type CompanyWithMeta, type CompanyMember } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';

interface CompanyContextValue {
  companies:    CompanyWithMeta[];
  company:      CompanyWithMeta | null;
  membership:   CompanyMember | null;
  setCompanyId: (id: string) => void;
  refresh:      () => Promise<void>;
  isLoading:    boolean;
  isAdmin:      boolean;
  isWorkspaceAdmin: boolean;
}

const CompanyContext = createContext<CompanyContextValue>({
  companies: [], company: null, membership: null,
  setCompanyId: () => {}, refresh: async () => {},
  isLoading: true, isAdmin: false, isWorkspaceAdmin: false,
});

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [companies,  setCompanies]  = useState<CompanyWithMeta[]>([]);
  const [companyId,  setCompanyId]  = useState<string | null>(null);
  const [membership, setMembership] = useState<CompanyMember | null>(null);
  const [isLoading,  setIsLoading]  = useState(true);

  const refresh = useCallback(async () => {
    const jwt = getToken();
    if (!jwt) return;
    const list = await companiesApi.list(jwt);
    setCompanies(list);
    if (!companyId && list.length > 0) setCompanyId(list[0].id);
  }, [companyId]);

  useEffect(() => { refresh().finally(() => setIsLoading(false)); }, []);

  useEffect(() => {
    if (!companyId) return;
    const jwt = getToken();
    if (!jwt) return;
    const stored = getUser();
    companiesApi.listMembers(companyId, jwt)
      .then(members => {
        setMembership(stored ? (members.find(m => m.userId === stored.id) ?? null) : null);
      }).catch(() => {});
  }, [companyId]);

  const company    = companies.find(c => c.id === companyId) ?? null;
  const isAdmin    = company?.isWorkspaceAdmin === true;
  const isWorkspaceAdmin = company?.isWorkspaceAdmin ?? false;

  return (
    <CompanyContext.Provider value={{
      companies, company, membership,
      setCompanyId, refresh,
      isLoading, isAdmin, isWorkspaceAdmin,
    }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() { return useContext(CompanyContext); }
