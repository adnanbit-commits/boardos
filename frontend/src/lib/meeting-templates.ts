// lib/meeting-templates.ts
// System meeting templates — Companies Act 2013 + SS-1/SS-2 compliant
//
// TERMINOLOGY:
//   textTemplate         — Motion text shown to directors during discussion/voting
//                          ("The Board is moved to...") — never "RESOLVED THAT"
//   resolutionTextTemplate — Enacted text stored only after the motion passes
//                          ("RESOLVED THAT...") — printed in minutes + certified copies
//   NOTING items          — textTemplate is the noting record text (no motion language)
//                          ("The Board took note of...") — goes directly into minutes

export type AgendaItemType =
  | 'STANDARD'
  | 'ROLL_CALL'
  | 'QUORUM_CONFIRMATION'
  | 'CHAIRPERSON_ELECTION'
  | 'COMPLIANCE_NOTING'
  | 'DOCUMENT_NOTING'
  | 'VAULT_DOC_NOTING'
  | 'ELECTRONIC_CONSENT';

export type WorkItemType =
  | 'RESOLUTION_VOTING'
  | 'DOCUMENT_NOTING'
  | 'NOTING_VAULT_DOC'
  | 'NOTING_COMPLIANCE_FORM'
  | 'SYSTEM_ACTION';

export type RequiredFor =
  | 'ALL'
  | 'FIRST_MEETING'
  | 'FY_FIRST_MEETING'
  | 'FIRST_APPOINTMENT';

export interface TemplateWorkItem {
  type:                    WorkItemType;
  title:                   string;
  textTemplate:            string;
  resolutionTextTemplate?: string;
  vaultDocType?:           string;
  docLabel?:               string;
  complianceForm?:         string;
  isDynamic?:              boolean;
  isEditable:              boolean;
  hasPlaceholders:         boolean;
  requiredFor:             RequiredFor;
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
    description: 'Post-incorporation first meeting of the Board of Directors. All mandatory items under Companies Act 2013 and SS-1.',
    agendaItems: [
      {
        order: 1,
        title: 'To appoint Chairperson for this Meeting',
        itemType: 'CHAIRPERSON_ELECTION',
        legalBasis: 'SS-1 Annexure B — Item 1. Procedural election, not a resolution.',
        guidanceNote: 'Any director nominates a colleague. Confirmed by others. Minutes record: "Mr/Ms [Name] was elected as Chairperson."',
        isOptional: false,
        requiredFor: 'ALL',
        workItems: [{
          type: 'SYSTEM_ACTION',
          title: 'Chairperson of the Meeting',
          textTemplate: '{{nominee_name}}, a Director of the Company, was proposed by {{proposer_name}} and duly elected as the Chairperson of the Meeting. The Chairperson took the chair and confirmed that the Notice of Meeting had been duly issued to all Directors.',
          isEditable: false, hasPlaceholders: true, requiredFor: 'ALL',
        }],
      },
      {
        order: 2,
        title: 'To confirm Quorum for the Meeting',
        itemType: 'QUORUM_CONFIRMATION',
        legalBasis: 'Sec. 174 Companies Act 2013. SS-1 Rule 3(5).',
        guidanceNote: 'Chairperson reviews attendance register and confirms quorum on the record.',
        isOptional: false,
        requiredFor: 'ALL',
        workItems: [{
          type: 'SYSTEM_ACTION',
          title: 'Quorum Confirmation',
          textTemplate: 'The Chairperson confirmed that {{present_count}} out of {{total_count}} Directors were present, constituting the required quorum of {{quorum_required}} under Section 174 of the Companies Act, 2013. The Meeting was declared duly constituted.',
          isEditable: false, hasPlaceholders: false, requiredFor: 'ALL',
        }],
      },
      {
        order: 3,
        title: 'To take note of Director Declarations — DIR-2, DIR-8, MBP-1',
        itemType: 'COMPLIANCE_NOTING',
        legalBasis: 'Sec. 152(5) — DIR-2. Sec. 164(2) — DIR-8. Sec. 184(1) — MBP-1.',
        guidanceNote: 'Chairperson must open and review each director\'s uploaded form before noting. All three forms mandatory at first board meeting.',
        isOptional: false,
        requiredFor: 'ALL',
        workItems: [
          {
            type: 'NOTING_COMPLIANCE_FORM',
            title: 'To take note of Form DIR-2 — Consent to Act as Director',
            textTemplate: 'The Board took note of the written consent to act as Director received from {{director_name}} in Form DIR-2 dated {{date}} and confirmed the appointment. The Form is placed on record.',
            complianceForm: 'DIR_2', isDynamic: true,
            isEditable: false, hasPlaceholders: false, requiredFor: 'FIRST_APPOINTMENT',
          },
          {
            type: 'NOTING_COMPLIANCE_FORM',
            title: 'To take note of Form DIR-8 — Non-Disqualification Declaration',
            textTemplate: 'The Board took note of the declaration of non-disqualification under Section 164(2) received from {{director_name}} in Form DIR-8. The Form is placed on record.',
            complianceForm: 'DIR_8', isDynamic: true,
            isEditable: false, hasPlaceholders: false, requiredFor: 'FY_FIRST_MEETING',
          },
          {
            type: 'NOTING_COMPLIANCE_FORM',
            title: 'To take note of Form MBP-1 — Disclosure of Interest',
            textTemplate: 'The Board took note of the disclosure of interest under Section 184(1) received from {{director_name}} in Form MBP-1. The interests disclosed are placed on record.',
            complianceForm: 'MBP_1', isDynamic: true,
            isEditable: false, hasPlaceholders: false, requiredFor: 'FY_FIRST_MEETING',
          },
        ],
      },
      {
        order: 4,
        title: 'To take note of the Certificate of Incorporation',
        itemType: 'DOCUMENT_NOTING',
        legalBasis: 'SS-1 Annexure B — first board meeting only.',
        guidanceNote: 'Upload the COI to the Vault before the meeting. Chairperson opens and reviews before placing on record.',
        isOptional: false,
        requiredFor: 'FIRST_MEETING',
        workItems: [{
          type: 'DOCUMENT_NOTING',
          title: 'To take note of the Certificate of Incorporation',
          textTemplate: 'The Board took note of the Certificate of Incorporation bearing Corporate Identity Number (CIN) {{cin}} dated {{inc_date}}, issued by the Registrar of Companies, {{roc_city}}, confirming that the Company has been duly incorporated under the Companies Act, 2013. The Certificate of Incorporation is placed on record.',
          vaultDocType: 'INCORPORATION_CERT',
          docLabel: 'Certificate of Incorporation',
          isEditable: false, hasPlaceholders: false, requiredFor: 'FIRST_MEETING',
        }],
      },
      {
        order: 5,
        title: 'To take note of the Memorandum of Association',
        itemType: 'DOCUMENT_NOTING',
        legalBasis: 'SS-1 Annexure B — first board meeting only.',
        guidanceNote: 'Upload the MOA to the Vault before the meeting.',
        isOptional: false,
        requiredFor: 'FIRST_MEETING',
        workItems: [{
          type: 'DOCUMENT_NOTING',
          title: 'To take note of the Memorandum of Association',
          textTemplate: 'The Board took note of the Memorandum of Association of {{company_name}} as registered with the Registrar of Companies. The Memorandum of Association, being the constitutional document governing the Company\'s objects, powers, and share capital, is placed on record.',
          vaultDocType: 'MOA',
          docLabel: 'Memorandum of Association',
          isEditable: false, hasPlaceholders: false, requiredFor: 'FIRST_MEETING',
        }],
      },
      {
        order: 6,
        title: 'To take note of the Articles of Association',
        itemType: 'DOCUMENT_NOTING',
        legalBasis: 'SS-1 Annexure B — first board meeting only.',
        guidanceNote: 'Upload the AOA to the Vault before the meeting.',
        isOptional: false,
        requiredFor: 'FIRST_MEETING',
        workItems: [{
          type: 'DOCUMENT_NOTING',
          title: 'To take note of the Articles of Association',
          textTemplate: 'The Board took note of the Articles of Association of {{company_name}} as registered with the Registrar of Companies. The Articles of Association, being the document governing the internal management and administration of the Company, are placed on record.',
          vaultDocType: 'AOA',
          docLabel: 'Articles of Association',
          isEditable: false, hasPlaceholders: false, requiredFor: 'FIRST_MEETING',
        }],
      },
      {
        order: 7,
        title: 'To confirm the Registered Office of the Company',
        itemType: 'STANDARD',
        legalBasis: 'Sec. 12 Companies Act 2013.',
        guidanceNote: 'Auto-filled from company profile. Confirm the registered address is correct before the meeting.',
        isOptional: false,
        requiredFor: 'FIRST_MEETING',
        workItems: [{
          type: 'RESOLUTION_VOTING',
          title: 'Registered Office Confirmation',
          textTemplate: 'The Board is moved to confirm that the registered office of the Company is situated at {{registered_address}}, and that the said premises are capable of receiving and acknowledging communications and notices as required under Section 12 of the Companies Act, 2013.',
          resolutionTextTemplate: 'RESOLVED THAT the registered office of the Company be and is hereby confirmed to be situated at {{registered_address}}, and that the said premises are capable of receiving and acknowledging all communications and notices addressed to the Company, as required under Section 12 of the Companies Act, 2013.',
          isEditable: true, hasPlaceholders: false, requiredFor: 'FIRST_MEETING',
        }],
      },
      {
        order: 8,
        title: 'To consider and approve authorisation of electronic records and appointment of Custodian',
        itemType: 'STANDARD',
        legalBasis: 'Rule 3(7) Companies (Meetings of Board and its Powers) Rules, 2014. Rule 28 Companies (Management and Administration) Rules, 2014.',
        guidanceNote: 'This resolution authorises SafeMinutes as the electronic records platform and designates the custodian under Rule 28. Without this resolution, electronic records have no board authorisation.',
        isOptional: false,
        requiredFor: 'FIRST_MEETING',
        workItems: [{
          type: 'RESOLUTION_VOTING',
          title: 'Authorisation of Electronic Records and Custodian Appointment',
          textTemplate: 'The Board is moved to authorise the maintenance of all statutory registers and records in electronic form, and to designate {{custodian_name}}, {{custodian_designation}}, as the person responsible for maintaining and authenticating all electronic statutory records under Rule 28 of the Companies (Management and Administration) Rules, 2014.',
          resolutionTextTemplate: 'RESOLVED THAT pursuant to Rule 3(7) of the Companies (Meetings of Board and its Powers) Rules, 2014, and Rule 28 of the Companies (Management and Administration) Rules, 2014, the Board hereby resolves that:\n\n(a) All statutory registers, minutes books, and records of the Company shall be maintained in electronic form on a compliant digital governance platform;\n\n(b) {{custodian_name}}, {{custodian_designation}}, be and is hereby designated as the person responsible for the maintenance, security, and authentication of all electronic statutory records of the Company under Rule 28;\n\n(c) The consent of all directors participating in this meeting through video conferencing to authenticate the statutory registers electronically is hereby placed on record as required under Rule 3(7);\n\n(d) The attendance register for this meeting shall be deemed to have been signed by all directors participating through video conferencing, their attendance having been recorded by the Chairperson.',
          isEditable: true, hasPlaceholders: true, requiredFor: 'FIRST_MEETING',
        }],
      },
      {
        order: 9,
        title: 'To consider and approve directions for maintenance of Statutory Registers',
        itemType: 'STANDARD',
        legalBasis: 'Companies Act 2013 — various sections requiring maintenance of statutory registers.',
        guidanceNote: 'Directs the custodian to maintain all required registers in electronic form on SafeMinutes.',
        isOptional: false,
        requiredFor: 'FIRST_MEETING',
        workItems: [{
          type: 'RESOLUTION_VOTING',
          title: 'Maintenance of Statutory Registers',
          textTemplate: 'The Board is moved to direct {{custodian_name}} to procure and maintain all statutory registers and books required under the Companies Act, 2013 in electronic form.',
          resolutionTextTemplate: 'RESOLVED THAT the {{custodian_name}} be and is hereby directed to procure and maintain all statutory registers and books required under the Companies Act, 2013 in electronic form, including the Register of Members, Register of Directors and Key Managerial Personnel, Minutes Books, Attendance Register, Register of Charges, and all other registers as applicable.',
          isEditable: true, hasPlaceholders: true, requiredFor: 'FIRST_MEETING',
        }],
      },
      {
        order: 10,
        title: 'To consider and approve appointment of Chairman of the Board (Optional)',
        itemType: 'STANDARD',
        legalBasis: 'SS-1 — distinct from per-meeting chairperson election. A permanent Board Chairman chairs all future meetings.',
        guidanceNote: 'Optional for small private companies. Skip if no permanent chairman is being appointed.',
        isOptional: true,
        requiredFor: 'FIRST_MEETING',
        workItems: [{
          type: 'RESOLUTION_VOTING',
          title: 'Appointment of Chairman of the Board',
          textTemplate: 'The Board is moved to appoint {{director_name}} as the Chairman of the Board of Directors of the Company to preside over all future meetings of the Board.',
          resolutionTextTemplate: 'RESOLVED THAT {{director_name}} be and is hereby appointed as the Chairman of the Board of Directors of the Company and shall preside over all future meetings of the Board.',
          isEditable: true, hasPlaceholders: true, requiredFor: 'FIRST_MEETING',
        }],
      },
      {
        order: 11,
        title: 'To consider and approve appointment of First Statutory Auditor',
        itemType: 'STANDARD',
        legalBasis: 'Sec. 139(6) Companies Act 2013 — first auditor must be appointed within 30 days of incorporation.',
        guidanceNote: 'Fill in auditor firm name and ICAI FRN. File ADT-1 within 15 days of this resolution.',
        isOptional: false,
        requiredFor: 'FIRST_MEETING',
        workItems: [{
          type: 'RESOLUTION_VOTING',
          title: 'Appointment of First Statutory Auditor',
          textTemplate: 'The Board is moved to appoint [AUDITOR_FIRM_NAME], Chartered Accountants (FRN: [FRN]), as the First Statutory Auditors of the Company to hold office until the conclusion of the First Annual General Meeting, at a remuneration to be mutually agreed, and to authorise {{custodian_name}} to file Form ADT-1 within 15 days.',
          resolutionTextTemplate: 'RESOLVED THAT pursuant to Section 139(6) of the Companies Act, 2013, [AUDITOR_FIRM_NAME], Chartered Accountants, bearing ICAI Firm Registration Number [FRN], be and are hereby appointed as the First Statutory Auditors of the Company to hold office from the conclusion of this Meeting until the conclusion of the First Annual General Meeting of the Company, at a remuneration to be mutually agreed.\n\nFURTHER RESOLVED THAT the {{custodian_name}} be authorised to file Form ADT-1 with the Registrar of Companies within 15 days of this appointment.',
          isEditable: true, hasPlaceholders: true, requiredFor: 'FIRST_MEETING',
        }],
      },
      {
        order: 12,
        title: 'To consider and approve opening of Bank Account',
        itemType: 'STANDARD',
        legalBasis: 'Operational requirement — Company needs a bank account to conduct business.',
        guidanceNote: 'Fill in bank name, branch, and authorised signatory details before the meeting.',
        isOptional: false,
        requiredFor: 'FIRST_MEETING',
        workItems: [{
          type: 'RESOLUTION_VOTING',
          title: 'Opening of Bank Account',
          textTemplate: 'The Board is moved to authorise the opening of a current account with [BANK_NAME], [BRANCH_NAME] Branch, and to designate [AUTHORISED_SIGNATORIES] as authorised signatories for the said account.',
          resolutionTextTemplate: 'RESOLVED THAT the Company be and is hereby authorised to open a current account with [BANK_NAME], [BRANCH_NAME] Branch.\n\nFURTHER RESOLVED THAT [AUTHORISED_SIGNATORIES] be and are hereby authorised to sign cheques, drafts, or other orders for the payment of money on behalf of the Company, and to operate the said account.\n\nFURTHER RESOLVED THAT the officers of the Company are authorised to execute any bank-provided signature cards or documents required to give effect to this resolution.',
          isEditable: true, hasPlaceholders: true, requiredFor: 'FIRST_MEETING',
        }],
      },
      {
        order: 13,
        title: 'To take note of the Common Seal of the Company (Optional)',
        itemType: 'DOCUMENT_NOTING',
        legalBasis: 'Common seal is optional post-2015. If adopted, a specimen impression must be placed on record.',
        guidanceNote: 'Optional. Upload a scan/impression to the Vault and this item will auto-link it.',
        isOptional: true,
        requiredFor: 'FIRST_MEETING',
        workItems: [{
          type: 'DOCUMENT_NOTING',
          title: 'Adoption of Common Seal',
          textTemplate: 'The Board took note of the Common Seal of the Company, an impression of which was placed before the Board. The Common Seal is placed on record. The {{custodian_name}} is authorised to have custody of the Common Seal.',
          resolutionTextTemplate: 'RESOLVED THAT the Common Seal of the Company, an impression of which is placed on record, be and is hereby adopted as the Common Seal of the Company. The {{custodian_name}} is authorised to have custody of the Common Seal and to affix the same on documents as authorised by the Board.',
          vaultDocType: 'COMMON_SEAL',
          docLabel: 'Common Seal',
          isEditable: true, hasPlaceholders: true, requiredFor: 'FIRST_MEETING',
        }],
      },
      {
        order: 14,
        title: 'To consider and approve allotment of Shares to Subscribers of Memorandum',
        itemType: 'STANDARD',
        legalBasis: 'Sec. 2(84) read with Sec. 62 — MOA subscribers become first members on allotment.',
        guidanceNote: 'Fill in each subscriber\'s name, number of shares, and face value from the MOA.',
        isOptional: false,
        requiredFor: 'FIRST_MEETING',
        workItems: [{
          type: 'RESOLUTION_VOTING',
          title: 'Allotment of Shares to MOA Subscribers',
          textTemplate: 'The Board is moved to allot equity shares of ₹[FACE_VALUE]/- each to the subscribers of the Memorandum of Association as per the statement before the Board, and to issue share certificates accordingly.',
          resolutionTextTemplate: 'RESOLVED THAT the following equity shares of ₹[FACE_VALUE]/- each be allotted to the subscribers of the Memorandum of Association of the Company:\n\n[TABLE: Name | Shares | Amount]\n\nFURTHER RESOLVED THAT share certificates be issued to the above allottees and entries be made in the Register of Members.',
          isEditable: true, hasPlaceholders: true, requiredFor: 'FIRST_MEETING',
        }],
      },
      {
        order: 15,
        title: 'To consider and ratify Preliminary Expenses (Optional)',
        itemType: 'STANDARD',
        legalBasis: 'Expenses incurred by promoters before incorporation may be ratified by the Board.',
        guidanceNote: 'List any pre-incorporation expenses (registration fees, professional fees, stamp duty).',
        isOptional: true,
        requiredFor: 'FIRST_MEETING',
        workItems: [{
          type: 'RESOLUTION_VOTING',
          title: 'Ratification of Preliminary Expenses',
          textTemplate: 'The Board is moved to ratify and approve preliminary expenses of ₹[AMOUNT]/- incurred by the promoters in connection with the incorporation of the Company, as detailed in the statement before the Board.',
          resolutionTextTemplate: 'RESOLVED THAT the preliminary expenses incurred by the promoters in connection with the incorporation of the Company, amounting to ₹[AMOUNT]/-, as detailed in the statement placed before the Board, be and are hereby ratified and approved.',
          isEditable: true, hasPlaceholders: true, requiredFor: 'FIRST_MEETING',
        }],
      },
      {
        order: 16,
        title: 'To consider and fix the Financial Year of the Company',
        itemType: 'STANDARD',
        legalBasis: 'Sec. 2(41) Companies Act 2013 — financial year is April 1 to March 31.',
        guidanceNote: 'Pre-filled. Change only if the company has a different financial year.',
        isOptional: false,
        requiredFor: 'FIRST_MEETING',
        workItems: [{
          type: 'RESOLUTION_VOTING',
          title: 'Fixing of Financial Year',
          textTemplate: 'The Board is moved to fix the financial year of the Company as 1st April to 31st March of the succeeding year, in accordance with Section 2(41) of the Companies Act, 2013.',
          resolutionTextTemplate: 'RESOLVED THAT the financial year of the Company shall be from 1st April to 31st March of the succeeding year, in accordance with Section 2(41) of the Companies Act, 2013.',
          isEditable: true, hasPlaceholders: false, requiredFor: 'FIRST_MEETING',
        }],
      },
      {
        order: 17,
        title: 'To consider and approve appointment of Company Secretary / KMP (Optional)',
        itemType: 'STANDARD',
        legalBasis: 'Sec. 203 Companies Act 2013 — companies with paid-up capital of ₹5 crore or more must appoint a whole-time CS.',
        guidanceNote: 'Optional for companies below the threshold.',
        isOptional: true,
        requiredFor: 'FIRST_MEETING',
        workItems: [{
          type: 'RESOLUTION_VOTING',
          title: 'Appointment of Company Secretary',
          textTemplate: 'The Board is moved to appoint [CS_NAME], ACS/FCS No. [MEMBERSHIP_NO], as the Company Secretary of the Company with effect from [DATE], at a remuneration to be mutually agreed.',
          resolutionTextTemplate: 'RESOLVED THAT [CS_NAME], ACS/FCS No. [MEMBERSHIP_NO], be and is hereby appointed as the Company Secretary of the Company with effect from [DATE], at a remuneration to be mutually agreed.',
          isEditable: true, hasPlaceholders: true, requiredFor: 'FIRST_MEETING',
        }],
      },
      {
        order: 18,
        title: 'Any Other Business with the permission of the Chairperson',
        itemType: 'STANDARD',
        legalBasis: 'SS-1 Clause 6 — AOB items admitted with Chairperson\'s permission.',
        guidanceNote: 'Any urgent matters not on the original agenda.',
        isOptional: true,
        requiredFor: 'ALL',
        workItems: [],
      },
    ],
  },

  // ── Standard Quarterly Board Meeting ──────────────────────────────────────
  {
    id:          'sys_quarterly_board',
    name:        'Quarterly Board Meeting',
    category:    'BOARD',
    description: 'Standard quarterly board meeting. Director declarations included for first meeting of each financial year.',
    agendaItems: [
      {
        order: 1, title: 'To appoint Chairperson for this Meeting',
        itemType: 'CHAIRPERSON_ELECTION',
        legalBasis: 'SS-1 Annexure B — Item 1.',
        guidanceNote: 'Any director nominates a colleague. Confirmed by others.',
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
        guidanceNote: 'Required once per financial year.',
        isOptional: false, requiredFor: 'FY_FIRST_MEETING',
        workItems: [
          {
            type: 'NOTING_COMPLIANCE_FORM', title: 'To take note of Form DIR-8',
            textTemplate: 'The Board took note of the non-disqualification declaration received from {{director_name}} in Form DIR-8. The Form is placed on record.',
            complianceForm: 'DIR_8', isDynamic: true,
            isEditable: false, hasPlaceholders: false, requiredFor: 'FY_FIRST_MEETING',
          },
          {
            type: 'NOTING_COMPLIANCE_FORM', title: 'To take note of Form MBP-1',
            textTemplate: 'The Board took note of the disclosure of interest received from {{director_name}} in Form MBP-1. The interests disclosed are placed on record.',
            complianceForm: 'MBP_1', isDynamic: true,
            isEditable: false, hasPlaceholders: false, requiredFor: 'FY_FIRST_MEETING',
          },
        ],
      },
      {
        order: 4, title: 'To consider and approve the Financial Statements',
        itemType: 'STANDARD',
        legalBasis: 'Sec. 134 Companies Act 2013.',
        guidanceNote: 'Approve quarterly/annual financial statements.',
        isOptional: false, requiredFor: 'ALL',
        workItems: [{
          type: 'RESOLUTION_VOTING', title: 'Approval of Financial Statements',
          textTemplate: 'The Board is moved to approve and adopt the Financial Statements of the Company for the period ending {{date}}, as placed before the Board.',
          resolutionTextTemplate: 'RESOLVED THAT the Financial Statements of the Company for the period ending {{date}}, as placed before the Board, be and are hereby approved and adopted.',
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
        legalBasis: 'Articles of Association — Chairperson of the Board chairs the AGM.',
        guidanceNote: 'Chairman of the Board (or any member) takes the chair.',
        isOptional: false, requiredFor: 'ALL',
        workItems: [{
          type: 'SYSTEM_ACTION', title: 'Chairperson Election',
          textTemplate: '{{nominee_name}} was proposed and elected as the Chairperson of the Annual General Meeting.',
          isEditable: false, hasPlaceholders: true, requiredFor: 'ALL',
        }],
      },
      {
        order: 2, title: 'To consider and adopt the Audited Financial Statements',
        itemType: 'STANDARD',
        legalBasis: 'Sec. 129 Companies Act 2013.',
        guidanceNote: 'Ordinary resolution — requires simple majority.',
        isOptional: false, requiredFor: 'ALL',
        workItems: [{
          type: 'RESOLUTION_VOTING', title: 'Adoption of Financial Statements',
          textTemplate: 'The Board is moved to receive, consider, and adopt the Audited Financial Statements of the Company for the financial year ended 31st March {{year}}, together with the Reports of the Board of Directors and the Auditors thereon.',
          resolutionTextTemplate: 'RESOLVED THAT the Audited Financial Statements of the Company for the financial year ended 31st March {{year}}, together with the Reports of the Board of Directors and the Auditors thereon, be and are hereby received, considered, and adopted.',
          isEditable: true, hasPlaceholders: true, requiredFor: 'ALL',
        }],
      },
      {
        order: 3, title: 'To consider and approve re-appointment of retiring Director(s)',
        itemType: 'STANDARD',
        legalBasis: 'Sec. 152(6) — directors retire by rotation at AGM.',
        guidanceNote: 'One-third of rotational directors retire at each AGM.',
        isOptional: false, requiredFor: 'ALL',
        workItems: [{
          type: 'RESOLUTION_VOTING', title: 'Re-appointment of Retiring Director',
          textTemplate: 'The Board is moved to re-appoint {{director_name}}, who retires by rotation and being eligible offers himself/herself for re-appointment, as a Director of the Company.',
          resolutionTextTemplate: 'RESOLVED THAT {{director_name}}, who retires by rotation and being eligible offers himself/herself for re-appointment, be and is hereby re-appointed as a Director of the Company.',
          isEditable: true, hasPlaceholders: true, requiredFor: 'ALL',
        }],
      },
      {
        order: 4, title: 'To consider and approve appointment of Statutory Auditors',
        itemType: 'STANDARD',
        legalBasis: 'Sec. 139(1) Companies Act 2013.',
        guidanceNote: 'Auditors appointed for 5-year term at AGM.',
        isOptional: false, requiredFor: 'ALL',
        workItems: [{
          type: 'RESOLUTION_VOTING', title: 'Appointment of Statutory Auditors',
          textTemplate: 'The Board is moved to appoint [AUDITOR_FIRM_NAME], Chartered Accountants (FRN: [FRN]), as the Statutory Auditors of the Company for a term of five consecutive years.',
          resolutionTextTemplate: 'RESOLVED THAT pursuant to Section 139 of the Companies Act, 2013, [AUDITOR_FIRM_NAME], Chartered Accountants (FRN: [FRN]), be and are hereby appointed as the Statutory Auditors of the Company for a term of five consecutive years from the conclusion of this meeting.',
          isEditable: true, hasPlaceholders: true, requiredFor: 'ALL',
        }],
      },
      {
        order: 5, title: 'Any Other Business with the permission of the Chairperson',
        itemType: 'STANDARD',
        legalBasis: 'Sec. 102 Companies Act 2013.',
        guidanceNote: 'Any special business admitted by the Chairperson.',
        isOptional: true, requiredFor: 'ALL',
        workItems: [],
      },
    ],
  },
];

// ── Template utilities ─────────────────────────────────────────────────────

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

export function substituteTemplateVars(
  text: string,
  vars: Record<string, string>,
): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

export interface SystemAgendaItem {
  title:        string;
  description:  string;
  itemType:     AgendaItemType;
  vaultDocType?: string;
  docLabel?:    string;
}

export function toFlatAgendaItems(items: TemplateAgendaItem[]): SystemAgendaItem[] {
  return items.map(i => ({
    title:       i.title,
    description: i.legalBasis,
    itemType:    i.itemType,
    ...(i.workItems[0]?.vaultDocType ? { vaultDocType: i.workItems[0].vaultDocType } : {}),
    ...(i.workItems[0]?.docLabel     ? { docLabel:     i.workItems[0].docLabel     } : {}),
  }));
}
