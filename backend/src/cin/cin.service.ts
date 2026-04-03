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
  // Strategy:
  //   1. Search DuckDuckGo lite for "{CIN} site:companydetails.in" — no API key, no JS
  //   2. Extract the first companydetails.in result URL from the response HTML
  //   3. Fetch that URL and parse the company page
  //
  // companydetails.in has DIN, name, designation, appointment date in a clean
  // director table and responds to server-side fetches without 403 or CAPTCHA.

  private async fetchMcaDirect(cin: string): Promise<CinLookupResult> {
    const HEADERS = {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept':     'text/html,application/xhtml+xml,*/*',
    };

    // ── Step 1: find the company page URL via DDG lite search ────────────────
    const query   = encodeURIComponent(`${cin} site:companydetails.in`);
    const ddgRes  = await fetch(`https://duckduckgo.com/lite?q=${query}`, {
      headers: { ...HEADERS, 'Referer': 'https://duckduckgo.com/' },
    });
    if (!ddgRes.ok) throw new Error(`DDG search HTTP ${ddgRes.status}`);
    const ddgHtml = await ddgRes.text();

    // DDG lite result links are in <a class="result-link" href="...">
    const urlMatch = ddgHtml.match(/href="(https?:\/\/(?:www\.)?companydetails\.in\/company\/[^"]+)"/i);
    if (!urlMatch) throw new Error('companydetails.in not found in DDG results');
    const pageUrl = urlMatch[1];

    // ── Step 2: fetch the company profile page ───────────────────────────────
    const pageRes = await fetch(pageUrl, {
      headers: { ...HEADERS, 'Referer': 'https://www.companydetails.in/' },
      redirect: 'follow',
    });
    if (!pageRes.ok) throw new Error(`companydetails.in page HTTP ${pageRes.status}`);
    const html = await pageRes.text();

    // ── Step 3: parse company name from <h1> ─────────────────────────────────
    // The page <h1> contains only the company name (all caps)
    // Skip if it looks like the homepage headline
    const h1Match = html.match(/<h1[^>]*>\s*([A-Z][A-Z0-9 &.,'\-()]{4,}(?:PRIVATE LIMITED|LIMITED|LTD\.?))\s*<\/h1>/i);
    const companyName = h1Match ? this.title(h1Match[1].trim()) : '';
    if (!companyName) throw new Error('companydetails.in: could not parse company name from page');

    // ── Step 4: extract labelled field values ────────────────────────────────
    // Pattern on the page: label text then value in <h6>
    const field = (label: string): string | null => {
      const re = new RegExp(label + '[\\s\\S]{0,300}?<h6[^>]*>([^<]+)<\\/h6>', 'i');
      const m  = html.match(re);
      return m ? m[1].trim().replace(/&amp;/gi, '&') : null;
    };

    // ── Step 5: parse director table ─────────────────────────────────────────
    // Table heading: "DIRECTOR DETAILS"
    // Columns: DIN (8 digits) | Director Name | Designation | Appointment Date
    const directors: CinDirector[] = [];
    const tableSection = html.match(/DIRECTOR DETAILS[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/i);
    if (tableSection) {
      const rows = tableSection[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) ?? [];
      for (const row of rows) {
        const cells = (row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) ?? [])
          .map(c => c.replace(/<[^>]+>/g, '').trim());
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