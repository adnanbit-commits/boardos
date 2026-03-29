// src/cin/cin.service.ts
//
// Lookup chain:
//   1. Sandbox API (primary — full director data with DINs)
//   2. MCA V3 direct endpoints (fallback — no API key, may have CSRF issues)
//   3. Throw ServiceUnavailableException → frontend switches to manual entry
//
// The frontend (companies/new/page.tsx) catches any thrown error and
// moves to step='manual' where the user fills in details themselves.
// Never return a partial/empty stub — always throw on full failure so
// the frontend flow is unambiguous.

import { Injectable, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import * as https from 'https';

export interface CinDirector {
  din: string; name: string; designation: string; appointedOn: string | null;
}
export interface CinLookupResult {
  cin: string; companyName: string; status: string;
  incorporatedOn: string | null; registeredAddress: string | null;
  companyEmail: string | null; directors: CinDirector[];
}

// ── Sandbox helpers (original implementation) ─────────────────────────────

function sandboxRequest(path: string, method: 'GET'|'POST', headers: Record<string,string>, body?: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const req = https.request({
      hostname: 'api.sandbox.co.in', path, method,
      headers: { 'Content-Type': 'application/json', ...headers, ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}) },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
          else reject(new Error(`Sandbox ${res.statusCode}: ${data}`));
        } catch { reject(new Error(`Invalid JSON: ${data}`)); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ── MCA direct scrape helpers ─────────────────────────────────────────────

const V3_BASE      = 'https://efiling.mca.gov.in/OnlineServices/rest/companyProfileSearch';
const MCA_HEADERS  = {
  'User-Agent': 'Mozilla/5.0 (compatible; SafeMinutes/1.0; +https://safeminutes.com)',
  'Accept':     'application/json, text/plain, */*',
  'Referer':    'https://www.mca.gov.in/',
  'Origin':     'https://www.mca.gov.in',
};

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error('MCA timeout')), ms)),
  ]);
}

// ── Service ───────────────────────────────────────────────────────────────

@Injectable()
export class CinService {
  private cachedToken: string | null = null;
  private tokenExpiry = 0;

  async lookup(cin: string): Promise<CinLookupResult> {
    const clean = cin.trim().toUpperCase();
    if (!/^[A-Z][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/.test(clean)) {
      throw new BadRequestException('Invalid CIN format. Expected 21 chars e.g. U12345MH2024PTC000000');
    }

    // ── Tier 1: Sandbox API ─────────────────────────────────────────────
    const apiKey    = process.env.SANDBOX_API_KEY;
    const apiSecret = process.env.SANDBOX_API_SECRET;

    if (apiKey && apiSecret) {
      try {
        const jwt = await this.getToken(apiKey, apiSecret);
        const res = await sandboxRequest('/mca/company/master-data/search', 'POST',
          { 'authorization': jwt, 'x-api-key': apiKey, 'x-api-version': '2.0' },
          { '@entity': 'in.co.sandbox.kyc.mca.master_data.request', id: clean, consent: 'y', reason: 'SafeMinutes workspace creation' },
        );
        return this.parseSandbox(res, clean);
      } catch (err: any) {
        if (err instanceof BadRequestException) throw err;
        console.warn(`CinService: Sandbox failed for ${clean} — trying MCA direct:`, err.message);
        // Fall through to MCA direct
      }
    }

    // ── Tier 2: MCA V3 direct endpoints (no API key) ────────────────────
    try {
      return await withTimeout(this.fetchMcaDirect(clean), 15_000);
    } catch (err: any) {
      console.warn(`CinService: MCA direct also failed for ${clean}:`, err.message);
      // Fall through to throw — frontend will show manual entry
    }

    // ── Tier 3: Both failed — let frontend handle manual entry ──────────
    throw new ServiceUnavailableException(
      'MCA data is temporarily unavailable. Please enter your company details manually — you can re-sync from MCA later.',
    );
  }

  // ── Sandbox token ─────────────────────────────────────────────────────

  private async getToken(apiKey: string, apiSecret: string): Promise<string> {
    if (this.cachedToken && Date.now() < this.tokenExpiry) return this.cachedToken;
    const res = await sandboxRequest('/authenticate', 'POST',
      { 'x-api-key': apiKey, 'x-api-secret': apiSecret },
    );
    const token = res?.access_token ?? res?.data?.access_token;
    if (!token) throw new Error('Failed to get Sandbox token');
    this.cachedToken = token;
    this.tokenExpiry = Date.now() + 23 * 60 * 60 * 1000;
    return token;
  }

  // ── Sandbox response parser ───────────────────────────────────────────

  private parseSandbox(res: any, cin: string): CinLookupResult {
    const m    = res?.data?.company_master_data ?? {};
    const dirs = res?.data?.['directors/signatory_details'] ?? [];
    return {
      cin:               m.cin ?? cin,
      companyName:       this.title(m.company_name ?? ''),
      status:            m['company_status(for_efiling)'] ?? m.company_status ?? 'Unknown',
      incorporatedOn:    m.date_of_incorporation ?? null,
      registeredAddress: m.registered_address ?? null,
      companyEmail:      m.email_id ?? null,
      directors: dirs.map((d: any) => ({
        din:         String(d['din/pan'] ?? d.din ?? ''),
        name:        this.title(d.name ?? ''),
        designation: d.designation ?? 'Director',
        appointedOn: d.begin_date ?? null,
      })),
    };
  }

  // ── MCA V3 direct scrape ──────────────────────────────────────────────
  // Calls the same REST endpoints the MCA public portal uses in-browser.
  // No API key needed. Normalises multiple known response shapes.

  private async fetchMcaDirect(cin: string): Promise<CinLookupResult> {
    const [masterRes, sigRes] = await Promise.allSettled([
      fetch(`${V3_BASE}/getCompanyMasterData?cin=${encodeURIComponent(cin)}`, { headers: MCA_HEADERS }),
      fetch(`${V3_BASE}/getSignatoryDetails?cin=${encodeURIComponent(cin)}`,  { headers: MCA_HEADERS }),
    ]);

    if (masterRes.status === 'rejected' || !masterRes.value.ok) {
      throw new Error('MCA V3 master fetch failed');
    }

    const masterJson = await masterRes.value.json();
    const d = masterJson?.companyMasterData
           ?? masterJson?.data?.companyMasterData
           ?? masterJson?.data
           ?? masterJson;

    if (!d?.companyName && !d?.company_name) {
      throw new Error('MCA V3 response missing company data');
    }

    let directors: CinDirector[] = [];
    if (sigRes.status === 'fulfilled' && sigRes.value.ok) {
      const sigJson = await sigRes.value.json();
      const dirs: any[] = sigJson?.signatoryDetails
                       ?? sigJson?.data?.signatoryDetails
                       ?? sigJson?.directors
                       ?? [];
      directors = dirs.map((s: any) => ({
        din:         String(s.din ?? s['din/pan'] ?? ''),
        name:        this.title(s.signatoryName ?? s.name ?? ''),
        designation: s.designation ?? 'Director',
        appointedOn: s.dateOfAppointment ?? s.beginDate ?? s.begin_date ?? null,
      }));
    }

    return {
      cin:               d.cin ?? d.CIN ?? cin,
      companyName:       this.title(d.companyName ?? d.company_name ?? ''),
      status:            d.companyStatus ?? d.company_status ?? 'Unknown',
      incorporatedOn:    d.dateOfIncorporation ?? d.date_of_incorporation ?? null,
      registeredAddress: d.registeredAddress ?? d.registered_address ?? null,
      companyEmail:      d.emailId ?? d.email_id ?? null,
      directors,
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private title(s: string): string {
    return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }
}
