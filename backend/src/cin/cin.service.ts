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

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error('Lookup timed out')), ms)),
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

  // ── companydetails.in scrape ──────────────────────────────────────────────
  // companydetails.in exposes a CIN-based redirect URL:
  //   https://www.companydetails.in/updatecompanydetails/{CIN}
  // which redirects to the company profile page. That page has:
  //   - Company name in <h1>
  //   - Fields in label/value pairs inside a details table
  //   - A clean director table: DIN | Name | Designation | Appointment Date
  // Verified: responds to server-side fetches without 403 or CAPTCHA.

  private async fetchMcaDirect(cin: string): Promise<CinLookupResult> {
    const res = await fetch(
      `https://www.companydetails.in/updatecompanydetails/${cin}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept':     'text/html,application/xhtml+xml,*/*',
          'Referer':    'https://www.companydetails.in/',
        },
        redirect: 'follow',
      }
    );

    if (!res.ok) throw new Error(`companydetails.in HTTP ${res.status}`);
    const html = await res.text();

    // ── Company name — appears in <h1> ──────────────────────────────────────
    const nameMatch = html.match(/<h1[^>]*>\s*([^<]{5,}?)\s*<\/h1>/i);
    const companyName = nameMatch ? this.title(nameMatch[1].trim()) : '';
    if (!companyName) throw new Error('companydetails.in: could not parse company name');

    // ── Extract labelled field values from the detail sections ───────────────
    // Pattern: label in one element, value in the next <h6> sibling
    const field = (label: string): string | null => {
      const re = new RegExp(label + '[\\s\\S]{0,300}?<h6[^>]*>([^<]+)<\\/h6>', 'i');
      const m  = html.match(re);
      return m ? m[1].trim().replace(/&amp;/g, '&').replace(/&AMP;/g, '&') : null;
    };

    // ── Director table ───────────────────────────────────────────────────────
    // Section heading: "DIRECTOR DETAILS"
    // Table columns: DIN | Director Name | Designation | Appointment Date
    const directors: CinDirector[] = [];
    const tableSection = html.match(/DIRECTOR DETAILS[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/i);
    if (tableSection) {
      const rows = tableSection[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) ?? [];
      for (const row of rows) {
        // Strip all tags, get text content of each cell
        const cells = (row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) ?? [])
          .map(c => c.replace(/<[^>]+>/g, '').trim());
        // DIN is exactly 8 digits — use that as the row guard
        if (cells.length >= 2 && /^\d{8}$/.test(cells[0])) {
          directors.push({
            din:         cells[0],
            name:        this.title(cells[1] ?? ''),
            designation: cells[2] ?? 'Director',
            appointedOn: cells[3] ?? null,
          });
        }
      }
    }

    return {
      cin,
      companyName,
      status:            field('Company Status') ?? 'Unknown',
      incorporatedOn:    field('Registration Date') ?? null,
      registeredAddress: field('Address') ?? null,
      companyEmail:      field('Email') ?? null,
      directors,
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private title(s: string): string {
    return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }
}
