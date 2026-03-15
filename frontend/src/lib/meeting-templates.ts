// lib/meeting-templates.ts
// System meeting templates — Companies Act 2013 + SS-1/SS-2 compliant
//
// Each agenda item carries:
//   workItems[]  — pre-built resolutions/noting items created when template is applied
//   legalBasis   — shown to CS as guidance, never appears in minutes
//   guidanceNote — operational note for the CS, never appears in minutes
//   itemType     — drives specialised UI in the meeting workspace
//   requiredFor  — controls whether item appears in subsequent meetings

export type AgendaItemType =
  | 'STANDARD'
  | 'ROLL_CALL'
  | 'QUORUM_CONFIRMATION'
  | 'CHAIRPERSON_ELECTION'
  | 'COMPLIANCE_NOTING'
  | 'VAULT_DOC_NOTING'
  | 'ELECTRONIC_CONSENT';

export type WorkItemType =
  | 'RESOLUTION_VOTING'
  | 'NOTING_VAULT_DOC'
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
  vaultDocType?:    string;   // for NOTING_VAULT_DOC — matches VaultDocType enum
  complianceForm?:  string;   // for NOTING_COMPLIANCE_FORM — 'DIR_2' | 'DIR_8' | 'MBP_1'
  isDynamic?:       boolean;  // true = generate one item per director at apply time
  isEditable:       boolean;  // can CS edit text before meeting starts?
  hasPlaceholders:  boolean;  // true = text has [PLACEHOLDER] markers that must be filled
  requiredFor:      RequiredFor;
}

export interface TemplateAgendaItem {
  order:        number;
  title:        string;
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
  id:           string;
  name:         string;
  description:  string;
  category:     string;
  isSystem:     true;
  agendaItems:  TemplateAgendaItem[];
}

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

export const SYSTEM_TEMPLATES: SystemTemplate[] = [

  // ── First Board Meeting ─────────────────────────────────────────────────────
  {
    id:          'sys_first_board',
    name:        'First Board Meeting',
    description: 'Post-incorporation first meeting of the Board of Directors. Covers all mandatory agenda items under the Companies Act 2013 and SS-1 in the legally correct sequence.',
    category:    'BOARD',
    isSystem:    true,
    agendaItems: [

      {
        order:       1,
        title:       'Election of Chairperson for this Meeting',
        itemType:    'CHAIRPERSON_ELECTION',
        legalBasis:  'SS-1 Annexure B — Item 1. Mandatory first act of every board meeting.',
        guidanceNote:'Any director nominates a colleague (or themselves). The other director(s) confirm. Once elected, the Chairperson takes the chair and all subsequent business proceeds under their direction.',
        isOptional:  false,
        requiredFor: 'ALL',
        workItems: [
          {
            type:            'RESOLUTION_VOTING',
            title:           'Election of Chairperson',
            textTemplate:    'RESOLVED THAT {{nominee_name}}, having been proposed by {{proposer_name}}, be and is hereby elected as the Chairperson of this Meeting of the Board of Directors of {{company_name}} and is authorised to conduct the proceedings in accordance with the Companies Act, 2013 and Secretarial Standard-1.',
            isEditable:      false,
            hasPlaceholders: true,  // nominee_name and proposer_name filled by election flow
            requiredFor:     'ALL',
          },
        ],
      },

      {
        order:       2,
        title:       'Confirmation of Quorum',
        itemType:    'QUORUM_CONFIRMATION',
        legalBasis:  'Sec. 174 Companies Act 2013 — quorum is the higher of 2 directors or one-third of total strength. SS-1 Rule 3(5) — Chairperson must confirm quorum after roll call.',
        guidanceNote:'The Chairperson reviews the attendance register and formally confirms that the required quorum is present. For a 2-director company, both directors must be present. If quorum is not met the meeting must be adjourned.',
        isOptional:  false,
        requiredFor: 'ALL',
        workItems: [
          {
            type:            'SYSTEM_ACTION',
            title:           'Quorum Confirmation',
            textTemplate:    'The Chairperson confirmed that {{present_count}} out of {{total_count}} directors were present, constituting the required quorum of {{quorum_required}} under Section 174 of the Companies Act, 2013. The meeting was declared duly constituted.',
            isEditable:      false,
            hasPlaceholders: false, // auto-filled from attendance data
            requiredFor:     'ALL',
          },
        ],
      },

      {
        order:       3,
        title:       'Director Declarations — DIR-2, DIR-8, MBP-1',
        itemType:    'COMPLIANCE_NOTING',
        legalBasis:  'Sec. 152(5) — DIR-2 (consent to act as director). Sec. 164(2) — DIR-8 (non-disqualification). Sec. 184(1) — MBP-1 (disclosure of interest).',
        guidanceNote:'The Chairperson must open and review each director\'s uploaded form before formally noting it. All three forms are mandatory at the first board meeting. DIR-8 and MBP-1 must be re-noted at the first board meeting of each financial year.',
        isOptional:  false,
        requiredFor: 'ALL',
        workItems: [
          {
            type:            'NOTING_COMPLIANCE_FORM',
            title:           'Noting of DIR-2 — Consent to Act as Director',
            textTemplate:    'The Board took note of the written consent to act as Director received from {{director_name}} in Form DIR-2 dated {{date}} and confirmed their appointment as a Director of the Company. The Form is placed on record.',
            complianceForm:  'DIR_2',
            isDynamic:       true,
            isEditable:      false,
            hasPlaceholders: false, // director_name auto-filled per director
            requiredFor:     'FIRST_APPOINTMENT',
          },
          {
            type:            'NOTING_COMPLIANCE_FORM',
            title:           'Noting of DIR-8 — Non-Disqualification Declaration',
            textTemplate:    'The Board took note of the declaration of non-disqualification under Section 164(2) of the Companies Act, 2013, received from {{director_name}} in Form DIR-8. The Form is placed on record.',
            complianceForm:  'DIR_8',
            isDynamic:       true,
            isEditable:      false,
            hasPlaceholders: false,
            requiredFor:     'FY_FIRST_MEETING',
          },
          {
            type:            'NOTING_COMPLIANCE_FORM',
            title:           'Noting of MBP-1 — Disclosure of Interest',
            textTemplate:    'The Board took note of the disclosure of interest under Section 184(1) of the Companies Act, 2013, received from {{director_name}} in Form MBP-1. The interests disclosed are placed on record.',
            complianceForm:  'MBP_1',
            isDynamic:       true,
            isEditable:      false,
            hasPlaceholders: false,
            requiredFor:     'FY_FIRST_MEETING',
          },
        ],
      },

      {
        order:       4,
        title:       'Noting of Certificate of Incorporation',
        itemType:    'VAULT_DOC_NOTING',
        legalBasis:  'SS-1 Annexure B — first board meeting only. The Board acknowledges the Company\'s formal establishment.',
        guidanceNote:'Upload the COI to the Document Vault before the meeting. The Chairperson must open and review the document before placing it on record. Once noted at this meeting and the meeting is locked, this item will not appear in future meetings.',
        isOptional:  false,
        requiredFor: 'FIRST_MEETING',
        workItems: [
          {
            type:            'NOTING_VAULT_DOC',
            title:           'Noting of Certificate of Incorporation',
            textTemplate:    'The Board took note of the Certificate of Incorporation dated {{inc_date}} bearing Corporate Identity Number (CIN) {{cin}} issued by the Registrar of Companies, {{roc_city}}, confirming that the Company has been duly incorporated under the Companies Act, 2013. The Certificate is placed on record.',
            vaultDocType:    'INCORPORATION_CERT',
            isEditable:      false,
            hasPlaceholders: false, // auto-filled from company.cin and company.registeredAt
            requiredFor:     'FIRST_MEETING',
          },
        ],
      },

      {
        order:       5,
        title:       'Noting of Memorandum of Association',
        itemType:    'VAULT_DOC_NOTING',
        legalBasis:  'SS-1 Annexure B — first board meeting only.',
        guidanceNote:'Upload the MOA to the Document Vault before the meeting.',
        isOptional:  false,
        requiredFor: 'FIRST_MEETING',
        workItems: [
          {
            type:            'NOTING_VAULT_DOC',
            title:           'Noting of Memorandum of Association',
            textTemplate:    'The Board took note of the Memorandum of Association of {{company_name}} as registered with the Registrar of Companies. The Memorandum of Association is placed on record as the constitutional document governing the Company\'s objects and capital.',
            vaultDocType:    'MOA',
            isEditable:      false,
            hasPlaceholders: false,
            requiredFor:     'FIRST_MEETING',
          },
        ],
      },

      {
        order:       6,
        title:       'Noting of Articles of Association',
        itemType:    'VAULT_DOC_NOTING',
        legalBasis:  'SS-1 Annexure B — first board meeting only.',
        guidanceNote:'Upload the AOA to the Document Vault before the meeting.',
        isOptional:  false,
        requiredFor: 'FIRST_MEETING',
        workItems: [
          {
            type:            'NOTING_VAULT_DOC',
            title:           'Noting of Articles of Association',
            textTemplate:    'The Board took note of the Articles of Association of {{company_name}} as registered with the Registrar of Companies. The Articles of Association are placed on record as the document governing the internal management and governance of the Company.',
            vaultDocType:    'AOA',
            isEditable:      false,
            hasPlaceholders: false,
            requiredFor:     'FIRST_MEETING',
          },
        ],
      },

      {
        order:       7,
        title:       'Noting of Registered Office',
        itemType:    'STANDARD',
        legalBasis:  'Sec. 12 Companies Act 2013 — registered office must be capable of receiving communications.',
        guidanceNote:'Auto-filled from the company profile. Confirm the registered address is correct before the meeting.',
        isOptional:  false,
        requiredFor: 'FIRST_MEETING',
        workItems: [
          {
            type:            'RESOLUTION_VOTING',
            title:           'Confirmation of Registered Office',
            textTemplate:    'RESOLVED THAT the Board takes note that the registered office of the Company is situated at {{registered_address}} and that the same is capable of receiving and acknowledging all communications and notices as required under Section 12 of the Companies Act, 2013.',
            isEditable:      true,
            hasPlaceholders: false, // auto-filled from company.registeredAt
            requiredFor:     'FIRST_MEETING',
          },
        ],
      },

      {
        order:       8,
        title:       'Authorisation of Electronic Records and Custodian Appointment',
        itemType:    'STANDARD',
        legalBasis:  'Rule 3(7) Companies (Meetings of Board and its Powers) Rules, 2014. Rule 28 Companies (Management and Administration) Rules, 2014.',
        guidanceNote:'This is the resolution that makes everything on BoardOS legally valid. It authorises electronic maintenance of registers and designates the custodian responsible under Rule 28. For a company without a CS, one director must be designated. Without this resolution, electronic records have no board authorisation.',
        isOptional:  false,
        requiredFor: 'FIRST_MEETING',
        workItems: [
          {
            type:            'RESOLUTION_VOTING',
            title:           'Authorisation of Electronic Records and Appointment of Custodian',
            textTemplate:    'RESOLVED THAT pursuant to Rule 3(7) of the Companies (Meetings of Board and its Powers) Rules, 2014, and Rule 28 of the Companies (Management and Administration) Rules, 2014, the Board hereby resolves that:\n\n(a) All statutory registers, minutes books, and records of the Company shall be maintained in electronic form on a compliant digital governance platform;\n\n(b) {{custodian_name}}, {{custodian_designation}}, be and is hereby designated as the person responsible for the maintenance, security, and authentication of all electronic statutory records of the Company under Rule 28;\n\n(c) The consent of all directors participating in this meeting through video conferencing to authenticate the statutory registers electronically is hereby placed on record as required under Rule 3(7);\n\n(d) The attendance register for this meeting shall be deemed to have been signed by all directors participating through video conferencing, their attendance having been recorded by the Chairperson.',
            isEditable:      true,
            hasPlaceholders: true, // custodian_name must be selected
            requiredFor:     'FIRST_MEETING',
          },
        ],
      },

      {
        order:       9,
        title:       'Directions for Maintenance of Statutory Books and Registers',
        itemType:    'STANDARD',
        legalBasis:  'Companies Act 2013 — various sections requiring maintenance of statutory registers.',
        guidanceNote:'Directs the custodian to maintain all required registers. On BoardOS this authorises the platform as the register system.',
        isOptional:  false,
        requiredFor: 'FIRST_MEETING',
        workItems: [
          {
            type:            'RESOLUTION_VOTING',
            title:           'Directions for Statutory Registers',
            textTemplate:    'RESOLVED THAT the {{custodian_name}} be and is hereby directed to procure and maintain all statutory registers and books required under the Companies Act, 2013 in electronic form, including the Register of Members, Register of Directors and Key Managerial Personnel, Minutes Books, Attendance Register, Register of Charges, and all other registers as applicable under the Act.',
            isEditable:      true,
            hasPlaceholders: true,
            requiredFor:     'FIRST_MEETING',
          },
        ],
      },

      {
        order:       10,
        title:       'Appointment of Chairman of the Board (Optional)',
        itemType:    'STANDARD',
        legalBasis:  'SS-1 — distinct from per-meeting chairperson election. A permanent Board Chairman chairs all future meetings unless absent.',
        guidanceNote:'Optional for small private companies. If not appointed here, a chairperson is elected at the start of each meeting (Item 1 on every agenda).',
        isOptional:  true,
        requiredFor: 'FIRST_MEETING',
        workItems: [
          {
            type:            'RESOLUTION_VOTING',
            title:           'Appointment of Chairman of the Board',
            textTemplate:    'RESOLVED THAT {{director_name}} be and is hereby appointed as the Chairman of the Board of Directors of the Company and shall preside over all future meetings of the Board.',
            isEditable:      true,
            hasPlaceholders: true,
            requiredFor:     'FIRST_MEETING',
          },
        ],
      },

      {
        order:       11,
        title:       'Appointment of First Statutory Auditor',
        itemType:    'STANDARD',
        legalBasis:  'Sec. 139(6) Companies Act 2013 — first auditor must be appointed within 30 days of incorporation by the Board.',
        guidanceNote:'Fill in the auditor firm name and ICAI registration number before the meeting. File ADT-1 with MCA within 15 days of this resolution. Failure to appoint within 30 days of incorporation is an offence.',
        isOptional:  false,
        requiredFor: 'FIRST_MEETING',
        workItems: [
          {
            type:            'RESOLUTION_VOTING',
            title:           'Appointment of First Statutory Auditor',
            textTemplate:    'RESOLVED THAT pursuant to Section 139(6) of the Companies Act, 2013, [AUDITOR_FIRM_NAME], Chartered Accountants, bearing ICAI Firm Registration Number [FRN], be and are hereby appointed as the First Statutory Auditors of the Company to hold office from the conclusion of this Meeting until the conclusion of the First Annual General Meeting of the Company, at a remuneration to be mutually agreed between the Board and the Auditors.\n\nFURTHER RESOLVED THAT the {{custodian_name}} be authorised to file Form ADT-1 with the Registrar of Companies within 15 days of this appointment.',
            isEditable:      true,
            hasPlaceholders: true, // [AUDITOR_FIRM_NAME] and [FRN] must be filled
            requiredFor:     'FIRST_MEETING',
          },
        ],
      },

      {
        order:       12,
        title:       'Opening of Bank Account',
        itemType:    'STANDARD',
        legalBasis:  'Operational requirement — Company needs a bank account to conduct business.',
        guidanceNote:'Fill in the bank name, branch, and authorised signatory details before the meeting.',
        isOptional:  false,
        requiredFor: 'FIRST_MEETING',
        workItems: [
          {
            type:            'RESOLUTION_VOTING',
            title:           'Opening of Bank Account',
            textTemplate:    'RESOLVED THAT the Company be and is hereby authorised to open a current account with [BANK_NAME], [BRANCH_NAME] Branch.\n\nFURTHER RESOLVED THAT [AUTHORISED_SIGNATORIES] be and are hereby authorised to operate the said account, and that the bank be informed of this resolution.',
            isEditable:      true,
            hasPlaceholders: true,
            requiredFor:     'FIRST_MEETING',
          },
        ],
      },

      {
        order:       13,
        title:       'Adoption of Common Seal',
        itemType:    'VAULT_DOC_NOTING',
        legalBasis:  'Common seal is optional post-2015 (Companies Amendment Act 2015). If adopted, a specimen must be placed on record.',
        guidanceNote:'Optional. If the company has adopted a common seal, upload a scan/impression to the vault and this item will auto-link it. Skip if no common seal.',
        isOptional:  true,
        requiredFor: 'FIRST_MEETING',
        workItems: [
          {
            type:            'NOTING_VAULT_DOC',
            title:           'Adoption of Common Seal',
            textTemplate:    'RESOLVED THAT the Board adopts the Common Seal of the Company, an impression of which is placed on record. The {{custodian_name}} is authorised to have custody of the Common Seal.',
            vaultDocType:    'COMMON_SEAL',
            isEditable:      true,
            hasPlaceholders: true,
            requiredFor:     'FIRST_MEETING',
          },
        ],
      },

      {
        order:       14,
        title:       'Allotment of Shares to Subscribers of Memorandum',
        itemType:    'STANDARD',
        legalBasis:  'Sec. 2(84) read with Sec. 62 — MOA subscribers become first members on allotment.',
        guidanceNote:'Fill in each subscriber\'s name, number of shares, and face value from the MOA.',
        isOptional:  false,
        requiredFor: 'FIRST_MEETING',
        workItems: [
          {
            type:            'RESOLUTION_VOTING',
            title:           'Allotment of Shares to MOA Subscribers',
            textTemplate:    'RESOLVED THAT the following equity shares of ₹[FACE_VALUE]/- each be allotted to the subscribers of the Memorandum of Association of the Company:\n\n[TABLE: Name | Shares | Amount]\n\nFURTHER RESOLVED THAT share certificates be issued to the above allottees and entries be made in the Register of Members.',
            isEditable:      true,
            hasPlaceholders: true,
            requiredFor:     'FIRST_MEETING',
          },
        ],
      },

      {
        order:       15,
        title:       'Approval of Preliminary Expenses',
        itemType:    'STANDARD',
        legalBasis:  'Expenses incurred by promoters before and during incorporation may be ratified by the Board.',
        guidanceNote:'List any expenses incurred before incorporation (registration fees, professional fees, stamp duty etc.).',
        isOptional:  true,
        requiredFor: 'FIRST_MEETING',
        workItems: [
          {
            type:            'RESOLUTION_VOTING',
            title:           'Ratification and Approval of Preliminary Expenses',
            textTemplate:    'RESOLVED THAT the preliminary expenses incurred by the promoters in connection with the incorporation of the Company, amounting to ₹[AMOUNT]/-, as detailed in the statement placed before the Board, be and are hereby ratified and approved.',
            isEditable:      true,
            hasPlaceholders: true,
            requiredFor:     'FIRST_MEETING',
          },
        ],
      },

      {
        order:       16,
        title:       'Fixing of Financial Year',
        itemType:    'STANDARD',
        legalBasis:  'Sec. 2(41) Companies Act 2013 — financial year is April 1 to March 31 for most companies.',
        guidanceNote:'Pre-filled. Change only if the company has a different financial year (requires special approval).',
        isOptional:  false,
        requiredFor: 'FIRST_MEETING',
        workItems: [
          {
            type:            'RESOLUTION_VOTING',
            title:           'Fixing of Financial Year',
            textTemplate:    'RESOLVED THAT the financial year of the Company shall be from 1st April to 31st March of the succeeding year, in accordance with Section 2(41) of the Companies Act, 2013.',
            isEditable:      true,
            hasPlaceholders: false,
            requiredFor:     'FIRST_MEETING',
          },
        ],
      },

      {
        order:       17,
        title:       'Appointment of Company Secretary / Key Managerial Personnel',
        itemType:    'STANDARD',
        legalBasis:  'Sec. 203 Companies Act 2013 — companies with paid-up capital of ₹5 crore or more must appoint a whole-time CS.',
        guidanceNote:'Optional for companies below the threshold. If appointing a CS, include their name and membership number.',
        isOptional:  true,
        requiredFor: 'FIRST_MEETING',
        workItems: [
          {
            type:            'RESOLUTION_VOTING',
            title:           'Appointment of Company Secretary',
            textTemplate:    'RESOLVED THAT [CS_NAME], ACS/FCS No. [MEMBERSHIP_NO], be and is hereby appointed as the Company Secretary of the Company with effect from [DATE], at a remuneration to be mutually agreed.',
            isEditable:      true,
            hasPlaceholders: true,
            requiredFor:     'FIRST_MEETING',
          },
        ],
      },

      {
        order:       18,
        title:       'Any Other Business with the Permission of the Chairperson',
        itemType:    'STANDARD',
        legalBasis:  'SS-1 Clause 6 — AOB items admitted with Chairperson\'s permission.',
        guidanceNote:'Any urgent matters not on the original agenda. Chairperson must explicitly admit each AOB item.',
        isOptional:  true,
        requiredFor: 'ALL',
        workItems:   [],
      },
    ],
  },

  // ── Quarterly Board Meeting ─────────────────────────────────────────────────
  {
    id:          'sys_quarterly_board',
    name:        'Quarterly Board Meeting',
    description: 'Standard quarterly board meeting. Director declarations (DIR-8/MBP-1) included — required at the first meeting of each financial year.',
    category:    'BOARD',
    isSystem:    true,
    agendaItems: [
      {
        order: 1, title: 'Election of Chairperson for this Meeting',
        itemType: 'CHAIRPERSON_ELECTION', requiredFor: 'ALL', isOptional: false,
        legalBasis: 'SS-1 Annexure B — mandatory first item.',
        guidanceNote: 'Any director nominates a colleague. Other director(s) confirm.',
        workItems: [{
          type: 'RESOLUTION_VOTING', title: 'Election of Chairperson',
          textTemplate: 'RESOLVED THAT {{nominee_name}}, having been proposed by {{proposer_name}}, be and is hereby elected as the Chairperson of this Meeting.',
          isEditable: false, hasPlaceholders: true, requiredFor: 'ALL',
        }],
      },
      {
        order: 2, title: 'Confirmation of Quorum',
        itemType: 'QUORUM_CONFIRMATION', requiredFor: 'ALL', isOptional: false,
        legalBasis: 'Sec. 174 — quorum must be confirmed before any business.',
        guidanceNote: 'Chairperson confirms quorum is present based on attendance.',
        workItems: [{
          type: 'SYSTEM_ACTION', title: 'Quorum Confirmation',
          textTemplate: 'The Chairperson confirmed that {{present_count}} of {{total_count}} directors were present, constituting the required quorum of {{quorum_required}}.',
          isEditable: false, hasPlaceholders: false, requiredFor: 'ALL',
        }],
      },
      {
        order: 3, title: 'Director Declarations — DIR-8, MBP-1',
        itemType: 'COMPLIANCE_NOTING', requiredFor: 'FY_FIRST_MEETING', isOptional: false,
        legalBasis: 'Sec. 164(2) DIR-8, Sec. 184(1) MBP-1 — required at first board meeting of each FY.',
        guidanceNote: 'Only shown at the first board meeting of each financial year. Satisfied for subsequent meetings within the same FY.',
        workItems: [
          { type: 'NOTING_COMPLIANCE_FORM', title: 'Noting of DIR-8', textTemplate: 'The Board took note of the declaration of non-disqualification in Form DIR-8 received from {{director_name}}. The Form is placed on record.', complianceForm: 'DIR_8', isDynamic: true, isEditable: false, hasPlaceholders: false, requiredFor: 'FY_FIRST_MEETING' },
          { type: 'NOTING_COMPLIANCE_FORM', title: 'Noting of MBP-1', textTemplate: 'The Board took note of the disclosure of interest in Form MBP-1 received from {{director_name}}. The interests disclosed are placed on record.', complianceForm: 'MBP_1', isDynamic: true, isEditable: false, hasPlaceholders: false, requiredFor: 'FY_FIRST_MEETING' },
        ],
      },
      {
        order: 4, title: 'Confirmation of Previous Meeting Minutes',
        itemType: 'STANDARD', requiredFor: 'ALL', isOptional: false,
        legalBasis: 'SS-1 — minutes of previous meeting to be confirmed.',
        guidanceNote: 'Chairperson signs the minutes of the previous meeting after confirmation by the Board.',
        workItems: [{ type: 'RESOLUTION_VOTING', title: 'Confirmation of Previous Minutes', textTemplate: 'RESOLVED THAT the minutes of the Board Meeting held on [PREVIOUS_MEETING_DATE] as circulated, be and are hereby confirmed and adopted.', isEditable: true, hasPlaceholders: true, requiredFor: 'ALL' }],
      },
      { order: 5, title: 'Financial Performance Review', itemType: 'STANDARD', requiredFor: 'ALL', isOptional: false, legalBasis: 'Board oversight responsibility.', guidanceNote: 'Management presents P&L, balance sheet, and cash flow for the quarter.', workItems: [] },
      { order: 6, title: 'Compliance and Secretarial Report', itemType: 'STANDARD', requiredFor: 'ALL', isOptional: false, legalBasis: 'Board compliance oversight.', guidanceNote: 'CS presents status of statutory filings, pending compliances, and any regulatory notices.', workItems: [] },
      { order: 7, title: 'Business Operations Update', itemType: 'STANDARD', requiredFor: 'ALL', isOptional: true, legalBasis: '', guidanceNote: 'Management presents operational highlights and strategic updates.', workItems: [] },
      { order: 8, title: 'Related Party Transactions Review', itemType: 'STANDARD', requiredFor: 'ALL', isOptional: true, legalBasis: 'Sec. 188 — related party transactions must be reviewed.', guidanceNote: 'Review and approve any RPTs. Ensure arm\'s length pricing.', workItems: [{ type: 'RESOLUTION_VOTING', title: 'Approval of Related Party Transactions', textTemplate: 'RESOLVED THAT the Board approves the following related party transactions entered into on an arm\'s length basis:\n\n[LIST OF TRANSACTIONS]', isEditable: true, hasPlaceholders: true, requiredFor: 'ALL' }] },
      { order: 9, title: 'Any Other Business', itemType: 'STANDARD', requiredFor: 'ALL', isOptional: true, legalBasis: 'SS-1 Clause 6.', guidanceNote: 'Urgent matters with Chairperson\'s permission.', workItems: [] },
    ],
  },

  // ── AGM, EGM, Audit Committee — keep existing structure, add itemType ────────
  {
    id: 'sys_agm', name: 'Annual General Meeting (AGM)',
    description: 'Annual General Meeting — all mandatory items under Sec. 102 Companies Act 2013.',
    category: 'AGM', isSystem: true,
    agendaItems: [
      { order: 1, title: 'Adoption of Financial Statements', itemType: 'STANDARD', requiredFor: 'ALL', isOptional: false, legalBasis: 'Sec. 129 Companies Act 2013.', guidanceNote: 'Ordinary resolution — adoption of audited financials with Board and Auditor reports.', workItems: [{ type: 'RESOLUTION_VOTING', title: 'Adoption of Financial Statements', textTemplate: 'RESOLVED THAT the audited financial statements of the Company for the financial year ended 31st March [YEAR], together with the Reports of the Board of Directors and the Auditors thereon, be and are hereby received, considered and adopted.', isEditable: true, hasPlaceholders: true, requiredFor: 'ALL' }] },
      { order: 2, title: 'Declaration of Dividend', itemType: 'STANDARD', requiredFor: 'ALL', isOptional: true, legalBasis: 'Sec. 123.', guidanceNote: 'If the Board has recommended a dividend.', workItems: [] },
      { order: 3, title: 'Re-appointment of Retiring Director', itemType: 'STANDARD', requiredFor: 'ALL', isOptional: true, legalBasis: 'Sec. 152(6).', guidanceNote: 'Director retiring by rotation, if eligible and willing.', workItems: [] },
      { order: 4, title: 'Appointment / Ratification of Statutory Auditor', itemType: 'STANDARD', requiredFor: 'ALL', isOptional: false, legalBasis: 'Sec. 139 Companies Act 2013.', guidanceNote: 'Ordinary resolution for appointment or ratification of auditor.', workItems: [{ type: 'RESOLUTION_VOTING', title: 'Auditor Appointment/Ratification', textTemplate: 'RESOLVED THAT [AUDITOR_FIRM], Chartered Accountants (FRN [NUMBER]), be and are hereby appointed/ratified as Statutory Auditors of the Company to hold office from the conclusion of this AGM until the conclusion of the next AGM.', isEditable: true, hasPlaceholders: true, requiredFor: 'ALL' }] },
      { order: 5, title: 'Any Other Business', itemType: 'STANDARD', requiredFor: 'ALL', isOptional: true, legalBasis: '', guidanceNote: '', workItems: [] },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

// Filter agenda items based on company state — removes first-meeting-only items
// if the company already has a locked first meeting.
export function filterAgendaForCompany(
  template: SystemTemplate,
  context: {
    isFirstMeetingDone: boolean; // company.firstBoardMeetingLockedId is set
    isFirstMeetingOfFY: boolean; // DIR-8/MBP-1 not yet noted this FY
  },
): TemplateAgendaItem[] {
  return template.agendaItems.filter(item => {
    if (item.requiredFor === 'FIRST_MEETING' && context.isFirstMeetingDone) return false;
    if (item.requiredFor === 'FY_FIRST_MEETING' && !context.isFirstMeetingOfFY) return false;
    return true;
  });
}

// Substitute template variables into resolution text at apply-time
export function substituteTemplateVars(
  text: string,
  vars: Record<string, string>,
): string {
  let result = text;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }
  return result;
}

// Legacy shape for DB storage + backward compat with existing template builder
export interface SystemAgendaItem {
  order:       number;
  title:       string;
  description: string; // legalBasis shown here for display
}

// Convert rich template to flat shape for DB (agenda title + description only)
export function toFlatAgendaItems(items: TemplateAgendaItem[]): SystemAgendaItem[] {
  return items.map(i => ({
    order:       i.order,
    title:       i.title,
    description: i.legalBasis,
  }));
}
