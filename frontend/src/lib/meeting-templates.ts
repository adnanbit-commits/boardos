// lib/meeting-templates.ts
// System meeting templates — Companies Act 2013 + SS-1/SS-2 compliant
// Hardcoded: no DB, always available to every workspace from day one.

export interface SystemAgendaItem {
  order: number;
  title: string;
  description: string;
}

export interface SystemTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  isSystem: true;
  agendaItems: SystemAgendaItem[];
}

export const SYSTEM_TEMPLATES: SystemTemplate[] = [
  {
    id: 'sys_first_board',
    name: 'First Board Meeting',
    description: 'Post-incorporation first meeting of the Board of Directors. Covers all mandatory agenda items under the Companies Act 2013.',
    category: 'BOARD',
    isSystem: true,
    agendaItems: [
      { order: 1, title: 'Disclosure of Interest by Directors', description: 'Directors to disclose their interests in other entities as required under Section 184. Collection of MBP-1 forms from all directors.' },
      { order: 2, title: 'Appointment of Chairperson', description: 'Elect a Chairperson for the current meeting and authorise the Chairperson to conduct proceedings in accordance with SS-1.' },
      { order: 3, title: 'Appointment of First Statutory Auditor', description: 'Appointment of the first Statutory Auditor under Section 139(6) of the Companies Act 2013, to hold office until conclusion of the first AGM.' },
      { order: 4, title: 'Opening of Bank Account', description: 'Authorise the Company to open a current/savings account with a scheduled bank. Designate authorised signatories and signing authority limits.' },
      { order: 5, title: 'Adoption of Common Seal', description: 'Adopt the common seal of the Company (if applicable) and authorise the Company Secretary or a Director to have custody of the seal.' },
      { order: 6, title: 'Approval of Preliminary Expenses', description: 'Ratify and approve expenses incurred by the promoters prior to and in connection with the incorporation of the Company.' },
      { order: 7, title: 'Appointment of Key Managerial Personnel', description: 'Consider appointment of Managing Director, Whole-Time Director, or other KMPs as applicable under Section 196.' },
      { order: 8, title: 'Fixing of Registered Office', description: 'Confirm the registered office address and authorise filing of INC-22 if applicable.' },
      { order: 9, title: 'Any Other Business', description: 'Any other matter with the permission of the Chairperson.' },
    ],
  },
  {
    id: 'sys_quarterly_board',
    name: 'Quarterly Board Meeting',
    description: 'Standard quarterly board meeting agenda covering financial review, compliance update, and operational matters.',
    category: 'BOARD',
    isSystem: true,
    agendaItems: [
      { order: 1, title: 'Confirmation of Previous Meeting Minutes', description: 'Read and confirm the minutes of the previous Board Meeting. Chairperson to sign the minutes.' },
      { order: 2, title: 'Financial Performance Review', description: 'Review of financial statements including P&L, Balance Sheet, and Cash Flow Statement for the quarter. Comparison against budget and prior period.' },
      { order: 3, title: 'Compliance and Secretarial Report', description: 'Company Secretary to present status of statutory compliances, pending filings, and any notices received from regulatory authorities.' },
      { order: 4, title: 'Business Operations Update', description: 'Management to present operational highlights, key metrics, strategic initiatives, and material developments since the last meeting.' },
      { order: 5, title: 'Related Party Transactions', description: 'Review and approval of any related party transactions under Section 188. Ensure compliance with arm\'s length pricing.' },
      { order: 6, title: 'Investment and Borrowings Update', description: 'Update on any borrowings, investments, or guarantees. Review against approved limits.' },
      { order: 7, title: 'Any Other Business', description: 'Any other matter with the permission of the Chairperson.' },
    ],
  },
  {
    id: 'sys_agm',
    name: 'Annual General Meeting (AGM)',
    description: 'Annual General Meeting agenda covering all mandatory items under Section 102 of the Companies Act 2013.',
    category: 'AGM',
    isSystem: true,
    agendaItems: [
      { order: 1, title: 'Adoption of Financial Statements', description: 'Ordinary Resolution — Adoption of the audited financial statements for the financial year, together with the reports of the Board of Directors and Auditors.' },
      { order: 2, title: 'Declaration of Dividend', description: 'Ordinary Resolution — Declaration of dividend on equity shares for the financial year, if recommended by the Board.' },
      { order: 3, title: 'Re-appointment of Director Retiring by Rotation', description: 'Ordinary Resolution — Re-appointment of Director who retires by rotation under Section 152(6) and being eligible offers himself for re-appointment.' },
      { order: 4, title: 'Appointment / Ratification of Statutory Auditor', description: 'Ordinary Resolution — Appointment or ratification of Statutory Auditor under Section 139 and fixing their remuneration.' },
      { order: 5, title: 'Special Business — Increase in Authorised Capital', description: 'Special Resolution (if applicable) — Increase in the Authorised Share Capital of the Company and amendment of the Memorandum of Association.' },
      { order: 6, title: 'Any Other Business', description: 'Any other matter with the permission of the Chairperson, with prior intimation as required under the Act.' },
    ],
  },
  {
    id: 'sys_egm',
    name: 'Extraordinary General Meeting (EGM)',
    description: 'Extraordinary General Meeting for special business requiring shareholder approval outside the AGM cycle.',
    category: 'EGM',
    isSystem: true,
    agendaItems: [
      { order: 1, title: 'Appointment of Chairperson for the Meeting', description: 'Elect a Chairperson to conduct the EGM proceedings in accordance with the Articles of Association and SS-2.' },
      { order: 2, title: 'Increase in Authorised Share Capital', description: 'Special Resolution — Increase the Authorised Share Capital of the Company. Consequential alteration of the Memorandum of Association under Section 61.' },
      { order: 3, title: 'Alteration of Articles of Association', description: 'Special Resolution — Alteration of the Articles of Association of the Company under Section 14 to reflect the capital structure change.' },
      { order: 4, title: 'Issue of Shares / Securities', description: 'Special Resolution — Authorise issuance of equity shares, preference shares, CCDs, or other securities under Section 62, including to specific investors.' },
      { order: 5, title: 'Approval of Material Related Party Transaction', description: 'Ordinary / Special Resolution — Approval of a material related party transaction under Section 188 read with applicable SEBI regulations.' },
      { order: 6, title: 'Any Other Special Business', description: 'Any other special business as specified in the notice of the EGM.' },
    ],
  },
  {
    id: 'sys_audit_committee',
    name: 'Audit Committee Meeting',
    description: 'Quarterly Audit Committee meeting covering financial oversight, internal audit review, and related party transactions.',
    category: 'COMMITTEE',
    isSystem: true,
    agendaItems: [
      { order: 1, title: 'Review of Quarterly Financial Results', description: 'Review and recommend to the Board the quarterly financial results before publication. Examine accounting policies and estimates.' },
      { order: 2, title: 'Review of Internal Audit Report', description: 'Discussion of the internal audit report, significant findings, management responses, and follow-up on prior period observations.' },
      { order: 3, title: 'Review of Related Party Transactions', description: 'Review all related party transactions entered into during the quarter. Verify arm\'s length pricing and compliance with the policy.' },
      { order: 4, title: 'Auditor Observations and Management Representation', description: 'Discussion with Statutory Auditors on audit observations, qualifications, and management letters.' },
      { order: 5, title: 'Risk Management Update', description: 'Review of key risks identified by management and status of mitigation measures.' },
      { order: 6, title: 'Any Other Matter', description: 'Any other matter referred by the Board or raised by the auditors.' },
    ],
  },
];
