// src/cin/cin.service.ts
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

@Injectable()
export class CinService {
  private cachedToken: string | null = null;
  private tokenExpiry = 0;

  async lookup(cin: string): Promise<CinLookupResult> {
    const apiKey    = process.env.SANDBOX_API_KEY;
    const apiSecret = process.env.SANDBOX_API_SECRET;
    if (!apiKey || !apiSecret) {
      throw new ServiceUnavailableException(
        'MCA lookup is not configured on this server. Please enter your company details manually.'
      );
    }

    const clean = cin.trim().toUpperCase();
    if (!/^[A-Z][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/.test(clean))
      throw new BadRequestException('Invalid CIN format. Expected 21 chars e.g. U12345MH2024PTC000000');

    try {
      const jwt = await this.getToken(apiKey, apiSecret);
      const res = await sandboxRequest('/mca/company/master-data/search', 'POST',
        { 'authorization': jwt, 'x-api-key': apiKey, 'x-api-version': '2.0' },
        { '@entity': 'in.co.sandbox.kyc.mca.master_data.request', id: clean, consent: 'y', reason: 'BoardOS workspace creation director verification' },
      );
      return this.parse(res, clean);
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      // Parse Sandbox error for a user-friendly message
      const isSandboxDown = err.message?.includes('504') || err.message?.includes('Network error');
      const msg = isSandboxDown
        ? 'MCA data is temporarily unavailable (the government registry is down). Please enter your company details manually — you can re-sync from MCA later.'
        : 'Could not fetch MCA data. Please enter your company details manually.';
      throw new ServiceUnavailableException(msg);
    }
  }

  private async getToken(apiKey: string, apiSecret: string): Promise<string> {
    if (this.cachedToken && Date.now() < this.tokenExpiry) return this.cachedToken;
    const res = await sandboxRequest('/authenticate', 'POST',
      { 'x-api-key': apiKey, 'x-api-secret': apiSecret },
    );
    // Token is at top-level access_token OR data.access_token
    const token = res?.access_token ?? res?.data?.access_token;
    if (!token) throw new Error('Failed to get Sandbox access token');
    this.cachedToken = token;
    this.tokenExpiry = Date.now() + 23 * 60 * 60 * 1000;
    return token;
  }

  private parse(res: any, cin: string): CinLookupResult {
    const m = res?.data?.company_master_data ?? {};
    // Directors are under 'directors/signatory_details' key
    const dirs: any[] = res?.data?.['directors/signatory_details'] ?? [];
    return {
      cin:               m.cin ?? cin,
      companyName:       this.title(m.company_name ?? ''),
      status:            m['company_status(for_efiling)'] ?? m.company_status ?? 'Unknown',
      incorporatedOn:    m.date_of_incorporation ?? null,
      registeredAddress: m.registered_address ?? null,
      companyEmail:      m.email_id ?? null,
      directors: dirs.map(d => ({
        din:         String(d['din/pan'] ?? d.din ?? ''),
        name:        this.title(d.name ?? ''),
        designation: d.designation ?? 'Director',
        appointedOn: d.begin_date ?? null,
      })),
    };
  }

  private title(s: string): string {
    return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }
}
