// src/cin/cin.service.ts
//
// MCA lookup strategy (in order):
//   1. MCA V3 efiling endpoints — direct, no auth, no cost
//   2. MCA V2 company master (data frozen at June 2024, fallback only)
//   3. Graceful degradation — return empty directors, let user fill manually
//
// These are the same endpoints the MCA portal's own browser calls hit.
// No API key required. Rate limit is undocumented — keep one call per
// workspace creation, never batch.
//
// When to upgrade to a paid provider (Surepass / APIclub):
//   - MCA adds CSRF token validation to the V3 endpoints
//   - Director data for newly incorporated companies is incomplete
//   - Rate limiting starts blocking legitimate usage at scale

import { Injectable, BadRequestException } from '@nestjs/common';

export interface CinDirector {
  din: string; name: string; designation: string; appointedOn: string | null;
}
export interface CinLookupResult {
  cin: string; companyName: string; status: string;
  incorporatedOn: string | null; registeredAddress: string | null;
  companyEmail: string | null; directors: CinDirector[];
}

// MCA V3 efiling REST endpoints (same ones the public portal calls)
const V3_BASE      = 'https://efiling.mca.gov.in/OnlineServices/rest/companyProfileSearch';
const V3_MASTER    = `${V3_BASE}/getCompanyMasterData`;
const V3_SIGNATORY = `${V3_BASE}/getSignatoryDetails`;

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; SafeMinutes/1.0; +https://safeminutes.com)',
  'Accept':     'application/json, text/plain, */*',
  'Referer':    'https://www.mca.gov.in/',
  'Origin':     'https://www.mca.gov.in',
};

const TIMEOUT_MS = 12_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('MCA request timed out')), ms)
    ),
  ]);
}

@Injectable()
export class CinService {

  async lookup(cin: string): Promise<CinLookupResult> {
    const clean = cin.trim().toUpperCase();
    if (!/^[A-Z][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/.test(clean)) {
      throw new BadRequestException(
        'Invalid CIN format. Expected 21 characters, e.g. U12345MH2024PTC000000',
      );
    }

    // Fire both V3 calls in parallel
    const [masterResult, signatoryResult] = await Promise.allSettled([
      withTimeout(this.fetchV3Master(clean),    TIMEOUT_MS),
      withTimeout(this.fetchV3Signatory(clean), TIMEOUT_MS),
    ]);

    // If master data failed try V2 fallback
    if (masterResult.status === 'rejected') {
      console.warn(`CinService: V3 master failed for ${clean}:`, masterResult.reason?.message);
      try {
        const v2 = await withTimeout(this.fetchV2Master(clean), TIMEOUT_MS);
        return { ...v2, directors: [], companyEmail: null };
      } catch (v2err: any) {
        console.warn(`CinService: V2 fallback also failed for ${clean}:`, v2err?.message);
        // Full degradation — return minimal stub, user fills manually
        return {
          cin: clean, companyName: '', status: 'Unknown',
          incorporatedOn: null, registeredAddress: null,
          companyEmail: null, directors: [],
        };
      }
    }

    const master    = masterResult.value;
    const signatory = signatoryResult.status === 'fulfilled'
      ? signatoryResult.value : { directors: [] };

    return {
      cin:               master.cin                ?? clean,
      companyName:       this.toTitleCase(master.companyName ?? ''),
      status:            master.companyStatus      ?? 'Unknown',
      incorporatedOn:    master.dateOfIncorporation ?? null,
      registeredAddress: master.registeredAddress  ?? null,
      companyEmail:      master.emailId            ?? null,
      directors: signatory.directors.map((d: any) => ({
        din:         String(d.din ?? ''),
        name:        this.toTitleCase(d.name ?? d.signatoryName ?? ''),
        designation: d.designation       ?? 'Director',
        appointedOn: d.dateOfAppointment ?? d.beginDate ?? null,
      })),
    };
  }

  // ── V3 master data ────────────────────────────────────────────────────────
  private async fetchV3Master(cin: string): Promise<any> {
    const res = await fetch(`${V3_MASTER}?cin=${encodeURIComponent(cin)}`, { headers: FETCH_HEADERS });
    if (!res.ok) throw new Error(`V3 master HTTP ${res.status}`);
    const json = await res.json();

    const d = json?.companyMasterData
           ?? json?.data?.companyMasterData
           ?? json?.data
           ?? json;

    if (!d || (!d.companyName && !d.company_name)) {
      throw new Error('V3 master response missing company data');
    }

    return {
      cin:                 d.cin                ?? d.CIN                 ?? cin,
      companyName:         d.companyName        ?? d.company_name        ?? '',
      companyStatus:       d.companyStatus      ?? d.company_status      ?? '',
      dateOfIncorporation: d.dateOfIncorporation ?? d.date_of_incorporation ?? null,
      registeredAddress:   d.registeredAddress  ?? d.registered_address  ?? null,
      emailId:             d.emailId            ?? d.email_id            ?? null,
    };
  }

  // ── V3 signatory / director list ──────────────────────────────────────────
  private async fetchV3Signatory(cin: string): Promise<{ directors: any[] }> {
    const res = await fetch(`${V3_SIGNATORY}?cin=${encodeURIComponent(cin)}`, { headers: FETCH_HEADERS });
    if (!res.ok) throw new Error(`V3 signatory HTTP ${res.status}`);
    const json = await res.json();

    const dirs: any[] = json?.signatoryDetails
                     ?? json?.data?.signatoryDetails
                     ?? json?.directors
                     ?? json?.data?.directors
                     ?? [];

    return {
      directors: dirs.map((d: any) => ({
        din:               d.din              ?? d['din/pan'] ?? '',
        name:              d.signatoryName    ?? d.name       ?? '',
        designation:       d.designation                      ?? 'Director',
        dateOfAppointment: d.dateOfAppointment ?? d.beginDate ?? d.begin_date ?? null,
      })),
    };
  }

  // ── V2 fallback ───────────────────────────────────────────────────────────
  // Data frozen at June 2024. Company master only — no directors.
  private async fetchV2Master(cin: string): Promise<Omit<CinLookupResult, 'directors' | 'companyEmail'>> {
    const params = new URLSearchParams({ companyID: cin });
    const res = await fetch(
      `https://www.mca.gov.in/mcafoportal/viewCompanyMasterData.do?${params}`,
      { headers: { ...FETCH_HEADERS, 'Accept': 'text/html,application/xhtml+xml' } },
    );
    if (!res.ok) throw new Error(`V2 HTTP ${res.status}`);
    const html = await res.text();

    const extract = (label: string): string | null => {
      const re = new RegExp(label + '.*?<td[^>]*>([^<]+)<', 'is');
      const m  = html.match(re);
      return m ? m[1].trim() : null;
    };

    const companyName = extract('Company Name') ?? '';
    if (!companyName) throw new Error('V2 response did not contain company data');

    return {
      cin,
      companyName:       this.toTitleCase(companyName),
      status:            extract('Status')               ?? 'Unknown',
      incorporatedOn:    extract('Date of Incorporation') ?? null,
      registeredAddress: extract('Registered Address')   ?? null,
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  private toTitleCase(s: string): string {
    return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }
}
