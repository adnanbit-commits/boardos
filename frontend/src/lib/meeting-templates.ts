// lib/meeting-templates.ts
// System meeting templates — Companies Act 2013 + SS-1/SS-2 compliant
//
// Each agenda item carries:
//   workItems[]  — pre-built resolutions/noting items created when template is applied
//   legalBasis   — shown to CS as guidance, never appears in minutes
//   guidanceNote — operational note for the CS, never appears in minutes
//   itemType     — drives specialised UI in the meeting workspace
//   requiredFor  — controls whether item appears in subsequent meetings
//
// AGENDA ITEM TITLES follow Indian corporate practice:
//   "To appoint…"     for elections / appointments
//   "To take note of…" for document / compliance noting
//   "To consider and approve…" for resolutions requiring approval
//   "To consider and fix…" for determinations
//
// RESOLUTION TEXT (what appears in minutes / certified copies) uses "RESOLVED THAT…"
// The agenda title and the resolution text are intentionally different.

export type AgendaItemType =
  | 'STANDARD'
  | 'ROLL_CALL'
  | 'QUORUM_CONFIRMATION'
  | 'CHAIRPERSON_ELECTION'
  | 'COMPLIANCE_NOTING'
  | 'DOCUMENT_NOTING'       // canonical type for all document noting agenda items
  | 'VAULT_DOC_NOTING'      // alias kept for backward compat
  | 'ELECTRONIC_CONSENT';

export type WorkItemType =
  | 'RESOLUTION_VOTING'
  | 'DOCUMENT_NOTING'       // canonical: note any document — vault, external, or physical
  | 'NOTING_VAULT_DOC'      // alias kept for backward compat
  | 'NOTING_COMPLIANCE_FORM'
  | 'SYSTEM_ACTION';

export type RequiredFor =
  | 'ALL'             // every board meeting
  | 'FIRST_MEETING'   // first board meeting only — suppressed after firstBoardMeetingLockedId is set
  | 'FY_FIRST_MEETING'// first meeting of each financial year
  | 'FIRST_APPOINTMENT'; // once per director on first appointment

export interface TemplateWorkItem {
  type:             WorkItemType;
  title:            string;
  textTemplate:     string;   // {{company_name}}, {{director_name}}, {{date}} substituted at apply time
  // Document noting fields (DOCUMENT_NOTING / NOTING_VAULT_DOC)
  vaultDocType?:    string;   // if set, auto-links vault slot by docType (INCORPORATION_CERT, MOA, etc.)
  docLabel?:        string;   // human label shown in evidence UI and minutes
  // Compliance form (NOTING_COMPLIANCE_FORM)
  complianceForm?:  string;   // 'DIR_2' | 'DIR_8' | 'MBP_1'
  isDynamic?:       boolean;  // true = generate one item per director at apply time
  isEditable:       boolean;  // can CS edit text before meeting starts?
  hasPlaceholders:  boolean;  // true = text has [PLACEHOLDER] markers that must be filled
  requiredFor:      RequiredFor;
}

export interface TemplateAgendaItem {
  order:        number;
  title:        string;        // agenda line — "To take note of…", "To consider and approve…"
  itemType:     AgendaItemType;
  legalBasis:   string;
  guidanceNote: string;
  isOptional:   boolean;
  requiredFor:  RequiredFor;
  workItems:    TemplateWorkItem[];
  // Backward-compat alias used by the template builder UI (maps to legalBasis)
  description?: string;
}

export interface SystemTemplate {
  id:          string;
  name:        string;
  description: string;
  category:    string;
  agendaItems: TemplateAgendaItem[];
}

export const SYSTEM_TEMPLATES: SystemTemplate[] = [

  // ── First Board Meeting ────────────────────────────────────────────────────
  {
    id:          'sys_first_board_meeting',
    name:        'First Board Meeting — Post-Incorporation',
    category:    'BOARD',
    description: 'Post-incorporation first meeting of the Board of Directors. Covers all mandatory agenda items under the Companies Act 2013 and SS-1 in the legally correct sequence.',
    agendaItems: [

      // ── Item 1: Chairperson election ────────────────────────────────────────
      // Not a resolution. A procedural act — directors elect from among themselves.
      // The chairperson takes the chair; their election is recorded in the minutes
      // as a statement of fact, not as a "RESOLVED THAT" resolution.
      {
        order:       1,
        title:       'To appoint Chairperson for this Meeting',
        itemType:    'CHAIRPERSON_ELECTION',
        legalBasis:  'SS-1 Annexure B — Item 1. Mandatory first act of every board meeting. Not a resolution — a procedural election among directors.',
        guidanceNote:'Any director nominates a colleague (or themselves). The other director(s) confirm. Once elected, the Chairperson takes the chair. Minutes record: "Mr/Ms [Name] was elected as the Chairperson of the Meeting."',
        isOptional:  false,
        requiredFor: 'ALL',
        workItems: [
          {
            type:            'SYSTEM_ACTION',
            title:           'Chairperson Election',
            // Minutes entry — not a resolution
            textTemplate:    '{{nominee_name}}, a Director of the Company, was proposed by {{proposer_name}} and duly elected as the Chairperson of the Meeting. The Chairperson took the chair and confirmed that the Notice of Meeting had been duly issued to all Directors.',
            isEditable:      false,
            hasPlaceholders: true,
            requiredFor:     'ALL',
          },
        ],
      },

      // ── Item 2: Confirmation of Quorum ──────────────────────────────────────
      {
        order:       2,
        title:       'To confirm Quorum for the Meeting',
        itemType:    'QUORUM_CONFIRMATION',
        legalBasis:  'Sec. 174 Companies Act 2013 — quorum is the higher of 2 directors or one-third of total strength. SS-1 Rule 3(5) — Chairperson must confirm quorum on the record.',
        guidanceNote:'The Chairperson reviews the attendance register and formally confirms quorum. For a 2-director company, both directors must be present. If quorum is not met the meeting must be adjourned.',
        isOptional:  false,
        requiredFor: 'ALL',
        workItems: [
          {
            type:            'SYSTEM_ACTION',
            title:           'Quorum Confirmation',
            textTemplate:    'The Chairperson confirmed that {{present_count}} out of {{total_count}} Directors were present, constituting the required quorum of {{quorum_required}} under Section 174 of the Companies Act, 2013. The Meeting was declared duly constituted.',
            isEditable:      false,
            hasPlaceholders: false,
            requiredFor:     'ALL',
          },
        ],
      },

      // ── Item 3: Director Declarations ──────────────────────────────────────
      // COMPLIANCE_NOTING itemType → renders ComplianceNotingInline in the workspace
      // (same as DocNotesPanel but inline within the agenda item)
      {
        order:       3,
        title:       'To take note of Director Declarations — DIR-2, DIR-8, MBP-1',
        itemType:    'COMPLIANCE_NOTING',
        legalBasis:  'Sec. 152(5) — DIR-2 (consent to act as director). Sec. 164(2) — DIR-8 (non-disqualification). Sec. 184(1) — MBP-1 (disclosure of interest).',
        guidanceNote:'The Chairperson must open and review each director\'s uploaded form before formally noting it. All three forms are mandatory at the first board meeting. DIR-8 and MBP-1 must be re-noted at the first meeting of each financial year.',
        isOptional:  false,
        requiredFor: 'ALL',
        workItems: [
          {
            type:            'NOTING_COMPLIANCE_FORM',
            title:           'To take note of Form DIR-2 — Consent to Act as Director',
            textTemplate:    'The Board took note of the written consent to act as Director received from {{director_name}} in Form DIR-2 dated {{date}} and confirmed the appointment. The Form is placed on record.',
            complianceForm:  'DIR_2',
            isDynamic:       true,
            isEditable:      false,
            hasPlaceholders: false,
            requiredFor:     'FIRST_APPOINTMENT',
          },
          {
            type:            'NOTING_COMPLIANCE_FORM',
            title:           'To take note of Form DIR-8 — Non-Disqualification Declaration',
            textTemplate:    'The Board took note of the declaration of non-disqualification under Section 164(2) received from {{director_name}} in Form DIR-8. The Form is placed on record.',
            complianceForm:  'DIR_8',
            isDynamic:       true,
            isEditable:      false,
            hasPlaceholders: false,
            requiredFor:     'FY_FIRST_MEETING',
          },
          {
            type:            'NOTING_COMPLIANCE_FORM',
            title:           'To take note of Form MBP-1 — Disclosure of Interest',
            textTemplate:    'The Board took note of the disclosure of interest under Section 184(1) received from {{director_name}} in Form MBP-1. The interests disclosed are placed on record.',
            complianceForm:  'MBP_1',
            isDynamic:       true,
            isEditable:      false,
            hasPlaceholders: false,
            requiredFor:     'FY_FIRST_MEETING',
          },
        ],
      },

      // ── Item 4: Certificate of Incorporation ─────────────────────────────────
      // DOCUMENT_NOTING itemType → renders DocumentNotingInline in the workspace
      // vaultDocType links to the statutory vault slot automatically
      {
        order:       4,
        title:       'To take note of the Certificate of Incorporation',
        itemType:    'DOCUMENT_NOTING',
        legalBasis:  'SS-1 Annexure B — first board meeting only. The Board acknowledges the Company\'s formal legal existence.',
        guidanceNote:'Upload the COI to the Statutory Documents section of the Vault before the meeting. The Chairperson opens and reviews it before placing on record. Once noted and the meeting is locked, this item will not appear in future meetings.',
        isOptional:  false,
        requiredFor: 'FIRST_MEETING',
        workItems: [
          {
            type:            'DOCUMENT_NOTING',
            title:           'To take note of the Certificate of Incorporation',
            textTemplate:    'RESOLVED THAT the Certificate of Incorporation bearing Corporate Identity Number (CIN) {{cin}} dated {{inc_date}}, issued by the Registrar of Companies, {{roc_city}}, be and is hereby noted and placed on record, confirming that the Company has been duly incorporated under the Companies Act, 2013.',
            vaultDocType:    'INCORPORATION_CERT',
            docLabel:        'Certificate of Incorporation',
            isEditable:      false,
            hasPlaceholders: false,
            requiredFor:     'FIRST_MEETING',
          },
        ],
      },

      // ── Item 5: Memorandum of Association ─────────────────────────────────
      {
        order:       5,
        title:       'To take note of the Memorandum of Association',
        itemType:    'DOCUMENT_NOTING',
        legalBasis:  'SS-1 Annexure B — first board meeting only. Constitutional document governing the Company\'s objects and capital.',
        guidanceNote:'Upload the MOA to the Statutory Documents section of the Vault before the meeting.',
        isOptional:  false,
        requiredFor: 'FIRST_MEETING',
        workItems: [
          {
            type:            'DOCUMENT_NOTING',
            title:           'To take note of the Memorandum of Association',
            textTemplate:    'RESOLVED THAT the Memorandum of Association of {{company_name}} as registered with the Registrar of Companies be and is hereby noted and placed on record as the constitutional document governing the Company\'s objects, powers, and share capital.',
            vaultDocType:    'MOA',
            docLabel:        'Memorandum of Association',
            isEditable:      false,
            hasPlaceholders: false,
            requiredFor:     'FIRST_MEETING',
          },
        ],
      },

      // ── Item 6: Articles of Association ──────────────────────────────────
      {
        order:       6,
        title:       'To take note of the Articles of Association',
        itemType:    'DOCUMENT_NOTING',
        legalBasis:  'SS-1 Annexure B — first board meeting only. Internal governance document.',
        guidanceNote:'Upload the AOA to the Statutory Documents section of the Vault before the meeting.',
        isOptional:  false,
        requiredFor: 'FIRST_MEETING',
        workItems: [
          {
            type:            'DOCUMENT_NOTING',
            title:           'To take note of the Articles of Association',
            textTemplate:    'RESOLVED THAT the Articles of Association of {{company_name}} as registered with the Registrar of Companies be and is hereby noted and placed on record as the document governing the internal management and administration of the Company.',
            vaultDocType:    'AOA',
            docLabel:        'Articles of Association',
            isEditable:      false,
            hasPlaceholders: false,
            requiredFor:     'FIRST_MEETING',
          },
        ],
      },

      // ── Item 7: Registered Office ────────────────────────────────────────
      {
        order:       7,
        title:       'To confirm the Registered Office of the Company',
        itemType:    'STANDARD',
        legalBasis:  'Sec. 12 Companies Act 2013 — registered office must be capable of receiving communications.',
        guidanceNote:'Auto-filled from the company profile. Confirm the registered address is correct before the meeting.',
        isOptional:  false,
        requiredFor: 'FIRST_MEETING',
        workItems: [
          {
            type:            'RESOLUTION_VOTING',
            title:           'To confirm the Registered Office',
            textTemplate:    'RESOLVED THAT the Board takes note that the registered office of the Company is situated at {{registered_address}} and that the same is capable of receiving and acknowledging all communications and notices as required under Section 12 of the Companies Act, 2013.',
            isEditable:      true,
            hasPlaceholders: false,
            requiredFor:     'FIRST_MEETING',
          },
        ],
      },

      // ── Item 8: Authorisation of Electronic Records & Custodian ─────────
      {
        order:       8,
        title:       'To consider and approve authorisation of electronic records and appointment of Custodian',
        itemType:    'STANDARD',
        legalBasis:  'Rule 3(7) Companies (Meetings of Board and its Powers) Rules, 2014. Rule 28 Companies (Management and Administration) Rules, 2014.',
        guidanceNote:'This is the resolution that makes everything on BoardOS legally valid. It authorises electronic maintenance of registers and designates the custodian responsible under Rule 28. Without this resolution, electronic records have no board authorisation.',
        isOptional:  false,
        requiredFor: 'FIRST_MEETING',
        workItems: [
          {
            type:            'RESOLUTION_VOTING',
            title:           'To authorise electronic records and appoint Custodian',
            textTemplate:    'RESOLVED THAT pursuant to Rule 3(7) of the Companies (Meetings of Board and its Powers) Rules, 2014, and Rule 28 of the Companies (Management and Administration) Rules, 2014, the Board hereby resolves that:\n\n(a) All statutory registers, minutes books, and records of the Company shall be maintained in electronic form on a compliant digital governance platform;\n\n(b) {{custodian_name}}, {{custodian_designation}}, be and is hereby designated as the person responsible for the maintenance, security, and authentication of all electronic statutory records of the Company under Rule 28;\n\n(c) The consent of all directors participating in this meeting through video conferencing to authenticate the statutory registers electronically is hereby placed on record as required under Rule 3(7);\n\n(d) The attendance register for this meeting shall be deemed to have been signed by all directors participating through video conferencing, their attendance having been recorded by the Chairperson.',
            isEditable:      true,
            hasPlaceholders: true,
            requiredFor:     'FIRST_MEETING',
          },
        ],
      },

      // ── Item 9: Statutory Books and Registers ───────────────────────────
      {
        order:       9,
        title:       'To consider and approve directions for maintenance of Statutory Registers',
        itemType:    'STANDARD',
        legalBasis:  'Companies Act 2013 — various sections requiring maintenance of statutory registers.',
        guidanceNote:'Directs the custodian to maintain all required registers. On BoardOS this authorises the platform as the register system.',
        isOptional:  false,
        requiredFor: 'FIRST_MEETING',
        workItems: [
          {
            type:            'RESOLUTION_VOTING',
            title:           'To approve maintenance of Statutory Registers',
            textTemplate:    'RESOLVED THAT the {{custodian_name}} be and is hereby directed to procure and maintain all statutory registers and books required under the Companies Act, 2013 in electronic form, including the Register of Members, Register of Directors and Key Managerial Personnel, Minutes Books, Attendance Register, Register of Charges, and all other registers as applicable.',
            isEditable:      true,
            hasPlaceholders: true,
            requiredFor:     'FIRST_MEETING',
          },
        ],
      },

      // ── Item 10: Board Chairman (optional) ──────────────────────────────
      {
        order:       10,
        title:       'To consider and approve appointment of Chairman of the Board (Optional)',
        itemType:    'STANDARD',
        legalBasis:  'SS-1 — distinct from per-meeting chairperson election. A permanent Board Chairman chairs all future meetings unless absent.',
        guidanceNote:'Optional for small private companies. If not appointed here, a chairperson is elected at the start of each meeting (Item 1 on every agenda).',
        isOptional:  true,
        requiredFor: 'FIRST_MEETING',
        workItems: [
          {
            type:            'RESOLUTION_VOTING',
            title:           'To appoint Chairman of the Board',
            textTemplate:    'RESOLVED THAT {{director_name}} be and is hereby appointed as the Chairman of the Board of Directors of the Company and shall preside over all future meetings of the Board.',
            isEditable:      true,
            hasPlaceholders: true,
            requiredFor:     'FIRST_MEETING',
          },
        ],
      },

      // ── Item 11: First Statutory Auditor ────────────────────────────────
      {
        order:       11,
        title:       'To consider and approve appointment of First Statutory Auditor',
        itemType:    'STANDARD',
        legalBasis:  'Sec. 139(6) Companies Act 2013 — first auditor must be appointed within 30 days of incorporation by the Board.',
        guidanceNote:'Fill in the auditor firm name and ICAI registration number before the meeting. File ADT-1 with MCA within 15 days of this resolution. Failure to appoint within 30 days of incorporation is an offence.',
        isOptional:  false,
        requiredFor: 'FIRST_MEETING',
        workItems: [
          {
            type:            'RESOLUTION_VOTING',
            title:           'To appoint First Statutory Auditor',
            textTemplate:    'RESOLVED THAT pursuant to Section 139(6) of the Companies Act, 2013, [AUDITOR_FIRM_NAME], Chartered Accountants, bearing ICAI Firm Registration Number [FRN], be and are hereby appointed as the First Statutory Auditors of the Company to hold office from the conclusion of this Meeting until the conclusion of the First Annual General Meeting of the Company, at a remuneration to be mutually agreed.\n\nFURTHER RESOLVED THAT the {{custodian_name}} be authorised to file Form ADT-1 with the Registrar of Companies within 15 days of this appointment.',
            isEditable:      true,
            hasPlaceholders: true,
            requiredFor:     'FIRST_MEETING',
          },
        ],
      },

      // ── Item 12: Bank Account ────────────────────────────────────────────
      {
        order:       12,
        title:       'To consider and approve opening of Bank Account',
        itemType:    'STANDARD',
        legalBasis:  'Operational requirement — Company needs a bank account to conduct business.',
        guidanceNote:'Fill in the bank name, branch, and authorised signatory details before the meeting.',
        isOptional:  false,
        requiredFor: 'FIRST_MEETING',
        workItems: [
          {
            type:            'RESOLUTION_VOTING',
            title:           'To approve opening of Bank Account',
            textTemplate:    'RESOLVED THAT the Company be and is hereby authorised to open a current account with [BANK_NAME], [BRANCH_NAME] Branch.\n\nFURTHER RESOLVED THAT [AUTHORISED_SIGNATORIES] be and are hereby authorised to operate the said account, and that the bank be informed of this resolution.',
            isEditable:      true,
            hasPlaceholders: true,
            requiredFor:     'FIRST_MEETING',
          },
        ],
      },

      // ── Item 13: Common Seal (optional) ─────────────────────────────────
      // DOCUMENT_NOTING — seal impression is a company document, noted like COI/MOA/AOA
      {
        order:       13,
        title:       'To take note of the Common Seal of the Company (Optional)',
        itemType:    'DOCUMENT_NOTING',
        legalBasis:  'Common seal is optional post-2015 (Companies Amendment Act 2015). If adopted, a specimen impression must be placed on record.',
        guidanceNote:'Optional. If the company has adopted a common seal, upload a scan/impression to the Vault and this item will auto-link it. Skip if no common seal.',
        isOptional:  true,
        requiredFor: 'FIRST_MEETING',
        workItems: [
          {
            type:            'DOCUMENT_NOTING',
            title:           'To take note of the Common Seal',
            textTemplate:    'RESOLVED THAT the Common Seal of the Company, an impression of which is placed before the Board, be and is hereby adopted as the Common Seal of the Company. The {{custodian_name}} is authorised to have custody of the Common Seal and to affix the same on documents as authorised by the Board.',
            vaultDocType:    'COMMON_SEAL',
            docLabel:        'Common Seal',
            isEditable:      true,
            hasPlaceholders: true,
            requiredFor:     'FIRST_MEETING',
          },
        ],
      },

      // ── Item 14: Allotment of Shares ────────────────────────────────────
      {
        order:       14,
        title:       'To consider and approve allotment of Shares to Subscribers of Memorandum',
        itemType:    'STANDARD',
        legalBasis:  'Sec. 2(84) read with Sec. 62 — MOA subscribers become first members on allotment.',
        guidanceNote:'Fill in each subscriber\'s name, number of shares, and face value from the MOA.',
        isOptional:  false,
        requiredFor: 'FIRST_MEETING',
        workItems: [
          {
            type:            'RESOLUTION_VOTING',
            title:           'To approve allotment of Shares to MOA Subscribers',
            textTemplate:    'RESOLVED THAT the following equity shares of ₹[FACE_VALUE]/- each be allotted to the subscribers of the Memorandum of Association of the Company:\n\n[TABLE: Name | Shares | Amount]\n\nFURTHER RESOLVED THAT share certificates be issued to the above allottees and entries be made in the Register of Members.',
            isEditable:      true,
            hasPlaceholders: true,
            requiredFor:     'FIRST_MEETING',
          },
        ],
      },

      // ── Item 15: Preliminary Expenses (optional) ─────────────────────────
      {
        order:       15,
        title:       'To consider and ratify Preliminary Expenses (Optional)',
        itemType:    'STANDARD',
        legalBasis:  'Expenses incurred by promoters before and during incorporation may be ratified by the Board.',
        guidanceNote:'List any expenses incurred before incorporation (registration fees, professional fees, stamp duty etc.).',
        isOptional:  true,
        requiredFor: 'FIRST_MEETING',
        workItems: [
          {
            type:            'RESOLUTION_VOTING',
            title:           'To ratify Preliminary Expenses',
            textTemplate:    'RESOLVED THAT the preliminary expenses incurred by the promoters in connection with the incorporation of the Company, amounting to ₹[AMOUNT]/-, as detailed in the statement placed before the Board, be and are hereby ratified and approved.',
            isEditable:      true,
            hasPlaceholders: true,
            requiredFor:     'FIRST_MEETING',
          },
        ],
      },

      // ── Item 16: Financial Year ──────────────────────────────────────────
      {
        order:       16,
        title:       'To consider and fix the Financial Year of the Company',
        itemType:    'STANDARD',
        legalBasis:  'Sec. 2(41) Companies Act 2013 — financial year is April 1 to March 31 for most companies.',
        guidanceNote:'Pre-filled. Change only if the company has a different financial year (requires special approval).',
        isOptional:  false,
        requiredFor: 'FIRST_MEETING',
        workItems: [
          {
            type:            'RESOLUTION_VOTING',
            title:           'To fix the Financial Year',
            textTemplate:    'RESOLVED THAT the financial year of the Company shall be from 1st April to 31st March of the succeeding year, in accordance with Section 2(41) of the Companies Act, 2013.',
            isEditable:      true,
            hasPlaceholders: false,
            requiredFor:     'FIRST_MEETING',
          },
        ],
      },

      // ── Item 17: Company Secretary (optional) ───────────────────────────
      {
        order:       17,
        title:       'To consider and approve appointment of Company Secretary / KMP (Optional)',
        itemType:    'STANDARD',
        legalBasis:  'Sec. 203 Companies Act 2013 — companies with paid-up capital of ₹5 crore or more must appoint a whole-time CS.',
        guidanceNote:'Optional for companies below the threshold. If appointing a CS, include their name and membership number.',
        isOptional:  true,
        requiredFor: 'FIRST_MEETING',
        workItems: [
          {
            type:            'RESOLUTION_VOTING',
            title:           'To appoint Company Secretary',
            textTemplate:    'RESOLVED THAT [CS_NAME], ACS/FCS No. [MEMBERSHIP_NO], be and is hereby appointed as the Company Secretary of the Company with effect from [DATE], at a remuneration to be mutually agreed.',
            isEditable:      true,
            hasPlaceholders: true,
            requiredFor:     'FIRST_MEETING',
          },
        ],
      },

      // ── Item 18: Any Other Business ────────────────────────────────────
      {
        order:       18,
        title:       'Any Other Business with the permission of the Chairperson',
        itemType:    'STANDARD',
        legalBasis:  'SS-1 Clause 6 — AOB items admitted with Chairperson\'s permission.',
        guidanceNote:'Any urgent matters not on the original agenda. Chairperson must explicitly admit each AOB item.',
        isOptional:  true,
        requiredFor: 'ALL',
        workItems:   [],
      },
    ],
  },

  // ── Standard Quarterly Board Meeting ──────────────────────────────────────
  {
    id:          'sys_quarterly_board',
    name:        'Quarterly Board Meeting',
    category:    'BOARD',
    description: 'Standard quarterly board meeting. Director declarations (DIR-8/MBP-1) included — required at the first meeting of each financial year.',
    agendaItems: [
      {
        order: 1, title: 'To appoint Chairperson for this Meeting',
        itemType: 'CHAIRPERSON_ELECTION',
        legalBasis: 'SS-1 Annexure B — Item 1.',
        guidanceNote: 'Any director nominates a colleague (or themselves). Confirmed by other directors.',
        isOptional: false, requiredFor: 'ALL',
        workItems: [{
          type: 'SYSTEM_ACTION', title: 'Chairperson Election',
          textTemplate: '{{nominee_name}} was proposed by {{proposer_name}} and duly elected as the Chairperson of the Meeting.',
          isEditable: false, hasPlaceholders: true, requiredFor: 'ALL',
        }],
      },
      {
        order: 2, title: 'To confirm Quorum for the Meeting',
        itemType: 'QUORUM_CONFIRMATION',
        legalBasis: 'Sec. 174 Companies Act 2013.',
        guidanceNote: 'Chairperson confirms quorum on the record.',
        isOptional: false, requiredFor: 'ALL',
        workItems: [{
          type: 'SYSTEM_ACTION', title: 'Quorum Confirmation',
          textTemplate: 'The Chairperson confirmed that {{present_count}} of {{total_count}} Directors were present, constituting the required quorum of {{quorum_required}}.',
          isEditable: false, hasPlaceholders: false, requiredFor: 'ALL',
        }],
      },
      {
        order: 3, title: 'To take note of Director Declarations — DIR-8, MBP-1',
        itemType: 'COMPLIANCE_NOTING',
        legalBasis: 'Sec. 164(2) — DIR-8. Sec. 184(1) — MBP-1. Required at first meeting of each FY.',
        guidanceNote: 'Required once per financial year. The Chairperson must note each director\'s uploaded forms.',
        isOptional: false, requiredFor: 'FY_FIRST_MEETING',
        workItems: [
          {
            type: 'NOTING_COMPLIANCE_FORM', title: 'To take note of Form DIR-8',
            textTemplate: 'The Board took note of the non-disqualification declaration received from {{director_name}} in Form DIR-8. The Form is placed on record.',
            complianceForm: 'DIR_8', isDynamic: true, isEditable: false, hasPlaceholders: false, requiredFor: 'FY_FIRST_MEETING',
          },
          {
            type: 'NOTING_COMPLIANCE_FORM', title: 'To take note of Form MBP-1',
            textTemplate: 'The Board took note of the disclosure of interest received from {{director_name}} in Form MBP-1. The interests disclosed are placed on record.',
            complianceForm: 'MBP_1', isDynamic: true, isEditable: false, hasPlaceholders: false, requiredFor: 'FY_FIRST_MEETING',
          },
        ],
      },
      {
        order: 4, title: 'To consider and approve the Financial Statements',
        itemType: 'STANDARD',
        legalBasis: 'Sec. 134 Companies Act 2013.',
        guidanceNote: 'Approve quarterly / annual financial statements. Attach supporting documents.',
        isOptional: false, requiredFor: 'ALL',
        workItems: [{
          type: 'RESOLUTION_VOTING', title: 'To approve Financial Statements',
          textTemplate: 'RESOLVED THAT the Financial Statements of the Company for the period ending {{date}}, as placed before the Board, be and are hereby approved and adopted.',
          isEditable: true, hasPlaceholders: true, requiredFor: 'ALL',
        }],
      },
      {
        order: 5, title: 'Any Other Business with the permission of the Chairperson',
        itemType: 'STANDARD',
        legalBasis: 'SS-1 Clause 6.',
        guidanceNote: 'Any urgent matters not on the original agenda.',
        isOptional: true, requiredFor: 'ALL',
        workItems: [],
      },
    ],
  },

  // ── Annual General Meeting ─────────────────────────────────────────────────
  {
    id:          'sys_agm',
    name:        'Annual General Meeting',
    category:    'AGM',
    description: 'Annual General Meeting — all mandatory items under Sec. 102 Companies Act 2013.',
    agendaItems: [
      {
        order: 1, title: 'To appoint Chairperson for this Meeting',
        itemType: 'CHAIRPERSON_ELECTION',
        legalBasis: 'Articles of Association — Chairperson of the Board chairs the AGM unless absent.',
        guidanceNote: 'Chairman of the Board (or any member) takes the chair.',
        isOptional: false, requiredFor: 'ALL',
        workItems: [{ type: 'SYSTEM_ACTION', title: 'Chairperson Election',
          textTemplate: '{{nominee_name}} was proposed and elected as the Chairperson of the Annual General Meeting.',
          isEditable: false, hasPlaceholders: true, requiredFor: 'ALL' }],
      },
      {
        order: 2, title: 'To consider and adopt the Audited Financial Statements',
        itemType: 'STANDARD',
        legalBasis: 'Sec. 129 Companies Act 2013.',
        guidanceNote: 'Ordinary resolution — requires simple majority.',
        isOptional: false, requiredFor: 'ALL',
        workItems: [{ type: 'RESOLUTION_VOTING', title: 'To adopt Financial Statements',
          textTemplate: 'RESOLVED THAT the Audited Financial Statements of the Company for the financial year ended 31st March {{year}}, together with the Reports of the Board of Directors and the Auditors thereon, be and are hereby received, considered, and adopted.',
          isEditable: true, hasPlaceholders: true, requiredFor: 'ALL' }],
      },
      {
        order: 3, title: 'To consider and approve re-appointment of retiring Director(s)',
        itemType: 'STANDARD',
        legalBasis: 'Sec. 152(6) — directors retire by rotation at AGM.',
        guidanceNote: 'One-third of rotational directors retire at each AGM.',
        isOptional: false, requiredFor: 'ALL',
        workItems: [{ type: 'RESOLUTION_VOTING', title: 'To re-appoint retiring Director',
          textTemplate: 'RESOLVED THAT {{director_name}}, who retires by rotation and being eligible, offers himself/herself for re-appointment, be and is hereby re-appointed as a Director of the Company.',
          isEditable: true, hasPlaceholders: true, requiredFor: 'ALL' }],
      },
      {
        order: 4, title: 'To consider and approve appointment of Statutory Auditors',
        itemType: 'STANDARD',
        legalBasis: 'Sec. 139(1) Companies Act 2013.',
        guidanceNote: 'Auditors appointed for 5-year term at AGM.',
        isOptional: false, requiredFor: 'ALL',
        workItems: [{ type: 'RESOLUTION_VOTING', title: 'To appoint Statutory Auditors',
          textTemplate: 'RESOLVED THAT pursuant to Section 139 of the Companies Act, 2013, [AUDITOR_FIRM_NAME], Chartered Accountants (FRN: [FRN]), be and are hereby appointed as the Statutory Auditors of the Company for a term of five consecutive years.',
          isEditable: true, hasPlaceholders: true, requiredFor: 'ALL' }],
      },
      {
        order: 5, title: 'Any Other Business with the permission of the Chairperson',
        itemType: 'STANDARD', legalBasis: 'Sec. 102 Companies Act 2013.',
        guidanceNote: 'Any special business admitted by the Chairperson.',
        isOptional: true, requiredFor: 'ALL', workItems: [],
      },
    ],
  },
];

// ── Template utilities ────────────────────────────────────────────────────────

// Returns agenda items relevant to the company's current state.
export function filterAgendaForCompany(
  template: SystemTemplate,
  opts: { isFirstMeeting: boolean; isFyFirstMeeting: boolean },
): TemplateAgendaItem[] {
  return template.agendaItems.filter(item => {
    if (item.requiredFor === 'FIRST_MEETING'    && !opts.isFirstMeeting)    return false;
    if (item.requiredFor === 'FY_FIRST_MEETING' && !opts.isFyFirstMeeting)  return false;
    return true;
  });
}

export interface SystemAgendaItem {
  title:       string;
  description: string;
  itemType:    AgendaItemType;
  vaultDocType?: string;
  docLabel?:   string;
}

// Convert rich template to the shape used by the template builder and DB storage
export function toFlatAgendaItems(items: TemplateAgendaItem[]): SystemAgendaItem[] {
  return items.map(i => ({
    title:       i.title,
    description: i.legalBasis,
    itemType:    i.itemType,
    ...(i.workItems[0]?.vaultDocType ? { vaultDocType: i.workItems[0].vaultDocType } : {}),
    ...(i.workItems[0]?.docLabel     ? { docLabel:     i.workItems[0].docLabel     } : {}),
  }));
}
