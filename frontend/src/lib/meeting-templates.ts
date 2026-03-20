// lib/meeting-templates.ts
// SafeMinutes system meeting templates — Companies Act 2013 + SS-1/SS-2 compliant
//
// TERMINOLOGY:
//   textTemplate         — Motion text shown to directors during discussion/voting
//   resolutionTextTemplate — Enacted text stored only after the motion passes
//   NOTING items          — textTemplate is the noting record text (no motion language)
//
// VARIABLE CONVENTIONS:
//   {{variable_name|Human readable label|type}}  — filled by chairperson/minutes recorder at meeting
//   Company profile keys (auto-populated from company record, NOT manual variables):
//     company_name, cin, registered_address, inc_date, roc_city, custodian_name
//
// CHANGES IN THIS VERSION:
//   Step 1 — All [BRACKET] placeholders converted to {{variable|label|type}} tokens
//   Step 2 — Missing first meeting items added: PAN/TAN, share certificates, borrowing, ROC signatory
//   Step 3 — Company profile fields annotated as auto-populate (not manual variables)

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

// Company profile keys — substituted from company record before meeting opens.
// NOT presented to chairperson as manual variables.
export const COMPANY_PROFILE_KEYS = [
  'company_name',
  'cin',
  'registered_address',
  'inc_date',
  'roc_city',
  'custodian_name',
] as const;

export type CompanyProfileKey = typeof COMPANY_PROFILE_KEYS[number];

export const SYSTEM_TEMPLATES: SystemTemplate[] = [

  // ── First Board Meeting ──────────────────────────────────────────────────
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
        isOptional: false, requiredFor: 'ALL',
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
        isOptional: false, requiredFor: 'ALL',
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
        isOptional: false, requiredFor: 'ALL',
        workItems: [
          {
            type: 'NOTING_COMPLIANCE_FORM',
            title: 'To take note of Form DIR-2 — Consent to Act as Director',
            textTemplate: 'The Board took note of the written consent to act as Director received from {{director_name}} in Form DIR-2 dated {{dir2_date|Date of DIR-2|date}} and confirmed the appointment. The Form is placed on record.',
            complianceForm: 'DIR_2', isDynamic: true,
            isEditable: false, hasPlaceholders: true, requiredFor: 'FIRST_APPOINTMENT',
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
        guidanceNote: 'Upload the COI to the Vault before the meeting. CIN, incorporation date, and RoC city are auto-filled from the company profile.',
        isOptional: false, requiredFor: 'FIRST_MEETING',
        workItems: [{
          type: 'DOCUMENT_NOTING',
          title: 'To take note of the Certificate of Incorporation',
          textTemplate: 'The Board took note of the Certificate of Incorporation bearing Corporate Identity Number (CIN) {{cin}} dated {{inc_date}}, issued by the Registrar of Companies, {{roc_city}}, confirming that the Company has been duly incorporated under the Companies Act, 2013. The Certificate of Incorporation is placed on record.',
          vaultDocType: 'INCORPORATION_CERT', docLabel: 'Certificate of Incorporation',
          isEditable: false, hasPlaceholders: false, requiredFor: 'FIRST_MEETING',
        }],
      },
      {
        order: 5,
        title: 'To take note of the Memorandum of Association',
        itemType: 'DOCUMENT_NOTING',
        legalBasis: 'SS-1 Annexure B — first board meeting only.',
        guidanceNote: 'Upload the MOA to the Vault before the meeting. Company name is auto-filled.',
        isOptional: false, requiredFor: 'FIRST_MEETING',
        workItems: [{
          type: 'DOCUMENT_NOTING',
          title: 'To take note of the Memorandum of Association',
          textTemplate: 'The Board took note of the Memorandum of Association of {{company_name}} as registered with the Registrar of Companies. The Memorandum of Association, being the constitutional document governing the Company\'s objects, powers, and share capital, is placed on record.',
          vaultDocType: 'MOA', docLabel: 'Memorandum of Association',
          isEditable: false, hasPlaceholders: false, requiredFor: 'FIRST_MEETING',
        }],
      },
      {
        order: 6,
        title: 'To take note of the Articles of Association',
        itemType: 'DOCUMENT_NOTING',
        legalBasis: 'SS-1 Annexure B — first board meeting only.',
        guidanceNote: 'Upload the AOA to the Vault before the meeting. Company name is auto-filled.',
        isOptional: false, requiredFor: 'FIRST_MEETING',
        workItems: [{
          type: 'DOCUMENT_NOTING',
          title: 'To take note of the Articles of Association',
          textTemplate: 'The Board took note of the Articles of Association of {{company_name}} as registered with the Registrar of Companies. The Articles of Association, being the document governing the internal management and administration of the Company, are placed on record.',
          vaultDocType: 'AOA', docLabel: 'Articles of Association',
          isEditable: false, hasPlaceholders: false, requiredFor: 'FIRST_MEETING',
        }],
      },
      {
        order: 7,
        title: 'To confirm the Registered Office of the Company',
        itemType: 'STANDARD',
        legalBasis: 'Sec. 12 Companies Act 2013.',
        guidanceNote: 'Registered office address is auto-filled from the company profile. Confirm it is correct before the meeting.',
        isOptional: false, requiredFor: 'FIRST_MEETING',
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
        guidanceNote: 'Authorises SafeMinutes as the electronic records platform. Custodian name is auto-filled from the company profile (set in Company Settings under Custodian).',
        isOptional: false, requiredFor: 'FIRST_MEETING',
        workItems: [{
          type: 'RESOLUTION_VOTING',
          title: 'Authorisation of Electronic Records and Custodian Appointment',
          textTemplate: 'The Board is moved to authorise the maintenance of all statutory registers and records in electronic form, and to designate {{custodian_name}}, {{custodian_designation|Designation of custodian (e.g. Director, Company Secretary)|text}}, as the person responsible for maintaining and authenticating all electronic statutory records under Rule 28 of the Companies (Management and Administration) Rules, 2014.',
          resolutionTextTemplate: 'RESOLVED THAT pursuant to Rule 3(7) of the Companies (Meetings of Board and its Powers) Rules, 2014, and Rule 28 of the Companies (Management and Administration) Rules, 2014, the Board hereby resolves that:\n\n(a) All statutory registers, minutes books, and records of the Company shall be maintained in electronic form on a compliant digital governance platform;\n\n(b) {{custodian_name}}, {{custodian_designation|Designation of custodian|text}}, be and is hereby designated as the person responsible for the maintenance, security, and authentication of all electronic statutory records of the Company under Rule 28;\n\n(c) The consent of all directors participating in this meeting through video conferencing to authenticate the statutory registers electronically is hereby placed on record as required under Rule 3(7);\n\n(d) The attendance register for this meeting shall be deemed to have been signed by all directors participating through video conferencing, their attendance having been recorded by the Chairperson.',
          isEditable: true, hasPlaceholders: true, requiredFor: 'FIRST_MEETING',
        }],
      },
      {
        order: 9,
        title: 'To consider and approve directions for maintenance of Statutory Registers',
        itemType: 'STANDARD',
        legalBasis: 'Companies Act 2013 — various sections requiring maintenance of statutory registers.',
        guidanceNote: 'Directs the custodian to maintain all required registers in electronic form on SafeMinutes. Custodian name is auto-filled.',
        isOptional: false, requiredFor: 'FIRST_MEETING',
        workItems: [{
          type: 'RESOLUTION_VOTING',
          title: 'Maintenance of Statutory Registers',
          textTemplate: 'The Board is moved to direct {{custodian_name}} to procure and maintain all statutory registers and books required under the Companies Act, 2013 in electronic form.',
          resolutionTextTemplate: 'RESOLVED THAT {{custodian_name}} be and is hereby directed to procure and maintain all statutory registers and books required under the Companies Act, 2013 in electronic form, including the Register of Members, Register of Directors and Key Managerial Personnel, Minutes Books, Attendance Register, Register of Charges, and all other registers as applicable.',
          isEditable: true, hasPlaceholders: false, requiredFor: 'FIRST_MEETING',
        }],
      },
      {
        order: 10,
        title: 'To consider and approve appointment of First Statutory Auditor',
        itemType: 'STANDARD',
        legalBasis: 'Sec. 139(6) Companies Act 2013 — first auditor must be appointed within 30 days of incorporation.',
        guidanceNote: 'Fill in auditor firm name and ICAI FRN before the meeting. File ADT-1 within 15 days of this resolution. Custodian name is auto-filled.',
        isOptional: false, requiredFor: 'FIRST_MEETING',
        workItems: [{
          type: 'RESOLUTION_VOTING',
          title: 'Appointment of First Statutory Auditor',
          textTemplate: 'The Board is moved to appoint {{auditor_firm_name|Name of auditor firm|name}}, Chartered Accountants (FRN: {{auditor_frn|ICAI Firm Registration Number|text}}), as the First Statutory Auditors of the Company to hold office until the conclusion of the First Annual General Meeting, at a remuneration to be mutually agreed, and to authorise {{custodian_name}} to file Form ADT-1 within 15 days.',
          resolutionTextTemplate: 'RESOLVED THAT pursuant to Section 139(6) of the Companies Act, 2013, {{auditor_firm_name|Name of auditor firm|name}}, Chartered Accountants, bearing ICAI Firm Registration Number {{auditor_frn|ICAI Firm Registration Number|text}}, be and are hereby appointed as the First Statutory Auditors of the Company to hold office from the conclusion of this Meeting until the conclusion of the First Annual General Meeting of the Company, at a remuneration to be mutually agreed.\n\nFURTHER RESOLVED THAT {{custodian_name}} be authorised to file Form ADT-1 with the Registrar of Companies within 15 days of this appointment.',
          isEditable: true, hasPlaceholders: true, requiredFor: 'FIRST_MEETING',
        }],
      },
      {
        order: 11,
        title: 'To consider and approve opening of Bank Account',
        itemType: 'STANDARD',
        legalBasis: 'Operational requirement — Company needs a bank account to conduct business.',
        guidanceNote: 'Fill in bank name, branch, account type, and authorised signatory details before the meeting.',
        isOptional: false, requiredFor: 'FIRST_MEETING',
        workItems: [{
          type: 'RESOLUTION_VOTING',
          title: 'Opening of Bank Account',
          textTemplate: 'The Board is moved to authorise the opening of a {{account_type|Type of account (e.g. Current)|text}} account with {{bank_name|Name of bank|name}}, {{bank_branch|Branch name and city|text}} Branch, and to designate {{authorised_signatories|Names of authorised signatories|name}} as authorised signatories for the said account.',
          resolutionTextTemplate: 'RESOLVED THAT the Company be and is hereby authorised to open a {{account_type|Type of account|text}} account with {{bank_name|Name of bank|name}}, {{bank_branch|Branch name and city|text}} Branch.\n\nFURTHER RESOLVED THAT {{authorised_signatories|Names of authorised signatories|name}} be and are hereby authorised to sign cheques, drafts, or other orders for the payment of money on behalf of the Company, and to operate the said account, singly or jointly as may be specified in the account opening form.\n\nFURTHER RESOLVED THAT the officers of the Company are authorised to execute any bank-provided signature cards or documents required to give effect to this resolution.',
          isEditable: true, hasPlaceholders: true, requiredFor: 'FIRST_MEETING',
        }],
      },
      {
        order: 12,
        title: 'To consider and approve application for PAN and TAN',
        itemType: 'STANDARD',
        legalBasis: 'Sec. 272 Income Tax Act 1961 — PAN mandatory for companies. Sec. 203A — TAN required before TDS deduction.',
        guidanceNote: 'Critical — PAN is required to open a bank account and file taxes. TAN is required before deducting TDS. Often missed at first meetings. Fill in the authorised person\'s name and designation before the meeting.',
        isOptional: false, requiredFor: 'FIRST_MEETING',
        workItems: [{
          type: 'RESOLUTION_VOTING',
          title: 'Application for PAN and TAN',
          textTemplate: 'The Board is moved to authorise {{pan_tan_authorised_person|Name of authorised person|name}}, {{pan_tan_designation|Their designation (e.g. Director)|text}}, to make applications for allotment of the Permanent Account Number (PAN) and Tax Deduction and Collection Account Number (TAN) to {{company_name}} and to execute all documents and forms required in connection therewith.',
          resolutionTextTemplate: 'RESOLVED THAT {{pan_tan_authorised_person|Name of authorised person|name}}, {{pan_tan_designation|Their designation|text}}, be and is hereby authorised to make applications for the allotment of Permanent Account Number (PAN) under Section 272B of the Income Tax Act, 1961, and Tax Deduction and Collection Account Number (TAN) under Section 203A of the Income Tax Act, 1961, to {{company_name}}, and to sign and submit all applications, forms, and documents required in connection therewith on behalf of the Company.',
          isEditable: true, hasPlaceholders: true, requiredFor: 'FIRST_MEETING',
        }],
      },
      {
        order: 13,
        title: 'To consider and approve issue of Share Certificates to MOA Subscribers',
        itemType: 'STANDARD',
        legalBasis: 'Sec. 56(4) Companies Act 2013 — share certificates must be issued within 2 months of incorporation.',
        guidanceNote: 'Share certificates must be signed by two directors, or one director and the CS. Certificates must be issued within 2 months — this deadline is frequently missed by new companies. Name the signatories here.',
        isOptional: false, requiredFor: 'FIRST_MEETING',
        workItems: [{
          type: 'RESOLUTION_VOTING',
          title: 'Issue of Share Certificates to MOA Subscribers',
          textTemplate: 'The Board is moved to allot {{share_count|Total number of equity shares|number}} equity shares of Rs.{{face_value|Face value per share (Rs.)|number}}/- each to the subscribers of the Memorandum of Association as per the statement before the Board, and to authorise {{cert_signatory_1|Name of first signatory|name}} and {{cert_signatory_2|Name of second signatory|name}} to sign and issue share certificates within two months of incorporation.',
          resolutionTextTemplate: 'RESOLVED THAT {{share_count|Total number of equity shares|number}} equity shares of Rs.{{face_value|Face value per share|number}}/- each be allotted to the subscribers of the Memorandum of Association of the Company, as per the statement placed before the Board.\n\nFURTHER RESOLVED THAT share certificates in respect of the above allotment be issued to the allottees within two months from the date of incorporation, as required under Section 56(4) of the Companies Act, 2013.\n\nFURTHER RESOLVED THAT {{cert_signatory_1|Name of first signatory|name}} and {{cert_signatory_2|Name of second signatory|name}} be and are hereby authorised to sign the share certificates on behalf of the Company and that entries be made in the Register of Members accordingly.',
          isEditable: true, hasPlaceholders: true, requiredFor: 'FIRST_MEETING',
        }],
      },
      {
        order: 14,
        title: 'To consider and approve borrowing authority under Section 180(1)(c)',
        itemType: 'STANDARD',
        legalBasis: 'Sec. 180(1)(c) Companies Act 2013 — Board may borrow up to paid-up capital plus free reserves without shareholder approval.',
        guidanceNote: 'Banks and lenders commonly ask for this resolution before disbursement. Set a prudent limit — typically 2-5x the initial paid-up capital. If higher limits are anticipated, a special resolution of shareholders will be required separately.',
        isOptional: false, requiredFor: 'FIRST_MEETING',
        workItems: [{
          type: 'RESOLUTION_VOTING',
          title: 'Borrowing Authority under Section 180(1)(c)',
          textTemplate: 'The Board is moved to authorise borrowing of money for the purposes of the Company up to a limit of Rs.{{borrow_limit|Maximum borrowing limit (Rs.)|number}}/- (Rupees {{borrow_limit_words|Borrowing limit in words|text}} only) in aggregate, in addition to the paid-up share capital and free reserves of the Company.',
          resolutionTextTemplate: 'RESOLVED THAT pursuant to Section 180(1)(c) of the Companies Act, 2013, the consent of the Board be and is hereby accorded to borrow money for the purposes of the Company, from time to time, at its discretion, from any bank, financial institution, or other lender, whether by way of loan, overdraft, cash credit, or any other form, up to a sum of Rs.{{borrow_limit|Maximum borrowing limit (Rs.)|number}}/- (Rupees {{borrow_limit_words|Borrowing limit in words|text}} only) in aggregate at any time, notwithstanding that the moneys to be borrowed together with the moneys already borrowed by the Company may exceed the aggregate of its paid-up share capital and free reserves.\n\nFURTHER RESOLVED THAT {{custodian_name}} be and is hereby authorised to do all such acts, deeds, and things as may be necessary to give effect to this resolution.',
          isEditable: true, hasPlaceholders: true, requiredFor: 'FIRST_MEETING',
        }],
      },
      {
        order: 15,
        title: 'To consider and approve authorisation for MCA/ROC filings',
        itemType: 'STANDARD',
        legalBasis: 'Companies Act 2013 — various sections requiring e-filing. Rule 8 Companies (Registration Offices and Fees) Rules, 2014.',
        guidanceNote: 'Authorises a named person to sign and file all e-forms with the MCA/ROC on behalf of the Company. Required for INC-22, ADT-1, and all subsequent filings. Without this, filings lack explicit board authorisation.',
        isOptional: false, requiredFor: 'FIRST_MEETING',
        workItems: [{
          type: 'RESOLUTION_VOTING',
          title: 'Authorisation for MCA/ROC E-Filings',
          textTemplate: 'The Board is moved to authorise {{roc_authorised_person|Name of person authorised to file with MCA/ROC|name}}, {{roc_authorised_designation|Their designation|text}}, to sign, certify, and file all e-forms, returns, and documents required to be filed with the Registrar of Companies and the Ministry of Corporate Affairs on behalf of {{company_name}}.',
          resolutionTextTemplate: 'RESOLVED THAT {{roc_authorised_person|Name of person authorised to file with MCA/ROC|name}}, {{roc_authorised_designation|Their designation|text}}, be and is hereby authorised to sign, certify, and file all e-forms, annual returns, financial statements, and any other documents required to be filed with the Registrar of Companies, Ministry of Corporate Affairs, or any other statutory authority on behalf of {{company_name}}, and to do all acts, deeds, and things necessary in connection therewith, including obtaining and renewing Digital Signature Certificate(s) for the purpose.',
          isEditable: true, hasPlaceholders: true, requiredFor: 'FIRST_MEETING',
        }],
      },
      {
        order: 16,
        title: 'To consider and approve appointment of Chairman of the Board (Optional)',
        itemType: 'STANDARD',
        legalBasis: 'SS-1 — distinct from per-meeting chairperson election.',
        guidanceNote: 'Optional for small private companies. Skip if no permanent chairman is being appointed.',
        isOptional: true, requiredFor: 'FIRST_MEETING',
        workItems: [{
          type: 'RESOLUTION_VOTING',
          title: 'Appointment of Chairman of the Board',
          textTemplate: 'The Board is moved to appoint {{chairman_name|Name of proposed Chairman|name}} as the Chairman of the Board of Directors of the Company to preside over all future meetings of the Board.',
          resolutionTextTemplate: 'RESOLVED THAT {{chairman_name|Name of proposed Chairman|name}} be and is hereby appointed as the Chairman of the Board of Directors of the Company and shall preside over all future meetings of the Board.',
          isEditable: true, hasPlaceholders: true, requiredFor: 'FIRST_MEETING',
        }],
      },
      {
        order: 17,
        title: 'To consider and approve appointment of Company Secretary / KMP (Optional)',
        itemType: 'STANDARD',
        legalBasis: 'Sec. 203 Companies Act 2013 — companies with paid-up capital of Rs.5 crore or more must appoint a whole-time CS.',
        guidanceNote: 'Optional for companies below the Rs.5 crore paid-up capital threshold.',
        isOptional: true, requiredFor: 'FIRST_MEETING',
        workItems: [{
          type: 'RESOLUTION_VOTING',
          title: 'Appointment of Company Secretary',
          textTemplate: 'The Board is moved to appoint {{cs_name|Full name of Company Secretary|name}}, ACS/FCS No. {{cs_membership_no|ICSI Membership Number|text}}, as the Company Secretary of the Company with effect from {{cs_effective_date|Effective date of appointment|date}}, at a remuneration to be mutually agreed.',
          resolutionTextTemplate: 'RESOLVED THAT {{cs_name|Full name of Company Secretary|name}}, ACS/FCS No. {{cs_membership_no|ICSI Membership Number|text}}, be and is hereby appointed as the Company Secretary of the Company with effect from {{cs_effective_date|Effective date of appointment|date}}, at a remuneration to be mutually agreed between the Company and the appointee.',
          isEditable: true, hasPlaceholders: true, requiredFor: 'FIRST_MEETING',
        }],
      },
      {
        order: 18,
        title: 'To take note of the Common Seal of the Company (Optional)',
        itemType: 'DOCUMENT_NOTING',
        legalBasis: 'Companies Act 2013, as amended 2015 — Common Seal is optional. Not required for most private companies.',
        guidanceNote: 'Optional — most private companies do not adopt a Common Seal post-2015. Only include if the Company has decided to adopt one. Upload a scan/impression to the Vault before the meeting.',
        isOptional: true, requiredFor: 'FIRST_MEETING',
        workItems: [{
          type: 'DOCUMENT_NOTING',
          title: 'Adoption of Common Seal',
          textTemplate: 'The Board took note of the Common Seal of the Company, an impression of which was placed before the Board. The Common Seal is placed on record. The {{custodian_name}} is authorised to have custody of the Common Seal.',
          resolutionTextTemplate: 'RESOLVED THAT the Common Seal of the Company, an impression of which is placed on record, be and is hereby adopted as the Common Seal of the Company. The {{custodian_name}} is authorised to have custody of the Common Seal and to affix the same on documents as authorised by the Board.',
          vaultDocType: 'COMMON_SEAL', docLabel: 'Common Seal',
          isEditable: true, hasPlaceholders: false, requiredFor: 'FIRST_MEETING',
        }],
      },
      {
        order: 19,
        title: 'To consider and ratify Preliminary Expenses (Optional)',
        itemType: 'STANDARD',
        legalBasis: 'Expenses incurred by promoters before incorporation may be ratified by the Board.',
        guidanceNote: 'List any pre-incorporation expenses — registration fees, professional fees, stamp duty. Include supporting receipts as meeting papers.',
        isOptional: true, requiredFor: 'FIRST_MEETING',
        workItems: [{
          type: 'RESOLUTION_VOTING',
          title: 'Ratification of Preliminary Expenses',
          textTemplate: 'The Board is moved to ratify and approve preliminary expenses of Rs.{{prelim_expense_amount|Total preliminary expenses (Rs.)|number}}/- incurred by the promoters in connection with the incorporation of the Company, as detailed in the statement before the Board.',
          resolutionTextTemplate: 'RESOLVED THAT the preliminary expenses incurred by the promoters in connection with the incorporation of the Company, amounting to Rs.{{prelim_expense_amount|Total preliminary expenses (Rs.)|number}}/-, as detailed in the statement placed before the Board, be and are hereby ratified and approved.',
          isEditable: true, hasPlaceholders: true, requiredFor: 'FIRST_MEETING',
        }],
      },
      {
        order: 20,
        title: 'To consider and fix the Financial Year of the Company',
        itemType: 'STANDARD',
        legalBasis: 'Sec. 2(41) Companies Act 2013 — financial year is April 1 to March 31.',
        guidanceNote: 'Pre-filled for the standard April-March financial year. Change only if a different financial year applies.',
        isOptional: false, requiredFor: 'FIRST_MEETING',
        workItems: [{
          type: 'RESOLUTION_VOTING',
          title: 'Fixing of Financial Year',
          textTemplate: 'The Board is moved to fix the financial year of the Company as 1st April to 31st March of the succeeding year, in accordance with Section 2(41) of the Companies Act, 2013.',
          resolutionTextTemplate: 'RESOLVED THAT the financial year of the Company shall be from 1st April to 31st March of the succeeding year, in accordance with Section 2(41) of the Companies Act, 2013.',
          isEditable: true, hasPlaceholders: false, requiredFor: 'FIRST_MEETING',
        }],
      },
      {
        order: 21,
        title: 'Any Other Business with the permission of the Chairperson',
        itemType: 'STANDARD',
        legalBasis: 'SS-1 Clause 6 — AOB items admitted with Chairperson\'s permission.',
        guidanceNote: 'Any urgent matters not on the original agenda.',
        isOptional: true, requiredFor: 'ALL',
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
        guidanceNote: 'Required once per financial year — included automatically for the first meeting of each FY.',
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
        order: 4, title: 'To review and take note of Unaudited Financial Performance',
        itemType: 'STANDARD',
        legalBasis: 'Sec. 134 Companies Act 2013 — Board responsible for financial oversight.',
        guidanceNote: 'Quarterly meetings review unaudited management accounts — they do NOT adopt financial statements. Adoption of audited financial statements happens at the pre-AGM board meeting only. Upload management accounts as a meeting paper.',
        isOptional: false, requiredFor: 'ALL',
        workItems: [{
          type: 'RESOLUTION_VOTING', title: 'Review of Unaudited Financial Performance',
          textTemplate: 'The Board is moved to take note of the unaudited financial performance of the Company for the quarter/period ending {{period_ending|Quarter or period ending date|date}}, as placed before the Board.',
          resolutionTextTemplate: 'RESOLVED THAT the unaudited financial performance of the Company for the quarter/period ending {{period_ending|Quarter or period ending date|date}}, as placed before the Board, be and is hereby reviewed and taken on record.',
          isEditable: true, hasPlaceholders: true, requiredFor: 'ALL',
        }],
      },
      {
        order: 5, title: 'To note Related Party Transactions under Section 188',
        itemType: 'STANDARD',
        legalBasis: 'Sec. 188 Companies Act 2013. Rule 15 Companies (Meetings of Board and its Powers) Rules, 2014.',
        guidanceNote: 'Board must note all contracts entered into with related parties since the last meeting. If none, record that no such transactions took place.',
        isOptional: false, requiredFor: 'ALL',
        workItems: [{
          type: 'RESOLUTION_VOTING', title: 'Related Party Transactions — Section 188',
          textTemplate: 'The Board is moved to take note of related party transactions entered into by the Company under Section 188 of the Companies Act, 2013 since the last Board Meeting, as detailed in the statement before the Board.',
          resolutionTextTemplate: 'RESOLVED THAT the related party transactions entered into by the Company during the period since the last Board Meeting, as detailed in the statement placed before the Board, be and are hereby reviewed and taken on record.\n\nFURTHER RESOLVED THAT {{custodian_name}} be directed to enter the details of such transactions in Form MBP-4 (Register of Contracts) as required under Section 189 of the Companies Act, 2013.',
          isEditable: true, hasPlaceholders: false, requiredFor: 'ALL',
        }],
      },
      {
        order: 6, title: 'To review Statutory Compliance Status',
        itemType: 'STANDARD',
        legalBasis: 'SS-1 — Board responsible for reviewing compliance with applicable laws.',
        guidanceNote: 'CS or Minutes Recorder tables a brief compliance status note. Upload the compliance note as a meeting paper before the meeting.',
        isOptional: false, requiredFor: 'ALL',
        workItems: [{
          type: 'RESOLUTION_VOTING', title: 'Statutory Compliance Review',
          textTemplate: 'The Board is moved to take note of the compliance status of the Company for the quarter ending {{period_ending|Quarter ending date|date}}, as placed before the Board.',
          resolutionTextTemplate: 'RESOLVED THAT the compliance status report placed before the Board for the quarter ending {{period_ending|Quarter ending date|date}}, confirming compliance with applicable laws and regulations, be and is hereby reviewed and taken on record.',
          isEditable: true, hasPlaceholders: true, requiredFor: 'ALL',
        }],
      },
      {
        order: 7, title: 'Any Other Business with the permission of the Chairperson',
        itemType: 'STANDARD',
        legalBasis: 'SS-1 Clause 6.',
        guidanceNote: 'Any urgent matters not on the original agenda.',
        isOptional: true, requiredFor: 'ALL',
        workItems: [],
      },
    ],
  },

  // ── Annual General Meeting ───────────────────────────────────────────────
  {
    id:          'sys_agm',
    name:        'Annual General Meeting',
    category:    'AGM',
    description: 'Annual General Meeting — all mandatory items under Sec. 102, 129, and 134 Companies Act 2013.',
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
        order: 2, title: "To consider and adopt the Audited Financial Statements and Board's Report",
        itemType: 'STANDARD',
        legalBasis: "Sec. 129 and Sec. 134 Companies Act 2013. Financial statements and Board's Report must be adopted together.",
        guidanceNote: "Ordinary resolution — requires simple majority. Financial statements and Board's Report must have been approved at the pre-AGM board meeting before being presented here.",
        isOptional: false, requiredFor: 'ALL',
        workItems: [{
          type: 'RESOLUTION_VOTING', title: "Adoption of Financial Statements and Board's Report",
          textTemplate: "The Board is moved to receive, consider, and adopt the Audited Financial Statements of the Company for the financial year ended 31st March {{fy_year|Financial year end (e.g. 2026)|number}}, together with the Reports of the Board of Directors and the Auditors thereon.",
          resolutionTextTemplate: "RESOLVED THAT the Audited Financial Statements of the Company for the financial year ended 31st March {{fy_year|Financial year end (e.g. 2026)|number}}, together with the Report of the Board of Directors and the Report of the Statutory Auditors thereon, be and are hereby received, considered, and adopted.",
          isEditable: true, hasPlaceholders: true, requiredFor: 'ALL',
        }],
      },
      {
        order: 3, title: 'To consider declaration of Dividend (Optional)',
        itemType: 'STANDARD',
        legalBasis: 'Sec. 123 Companies Act 2013 — dividend may be declared at AGM out of profits.',
        guidanceNote: 'Optional — include if dividend is being declared. If no dividend, remove this item.',
        isOptional: true, requiredFor: 'ALL',
        workItems: [{
          type: 'RESOLUTION_VOTING', title: 'Declaration of Dividend',
          textTemplate: 'The Board is moved to declare a dividend of Rs.{{dividend_per_share|Dividend per share (Rs.)|number}}/- per equity share on the paid-up equity share capital of the Company for the financial year ended 31st March {{fy_year|Financial year end (e.g. 2026)|number}}.',
          resolutionTextTemplate: 'RESOLVED THAT a dividend of Rs.{{dividend_per_share|Dividend per share (Rs.)|number}}/- per equity share of Rs.{{face_value|Face value per share (Rs.)|number}}/- each be and is hereby declared on the fully paid-up equity shares of the Company out of the profits of the Company for the financial year ended 31st March {{fy_year|Financial year end|number}}.',
          isEditable: true, hasPlaceholders: true, requiredFor: 'ALL',
        }],
      },
      {
        order: 4, title: 'To consider and approve re-appointment of retiring Director(s) (Optional)',
        itemType: 'STANDARD',
        legalBasis: 'Sec. 152(6) — directors retire by rotation at AGM. Check AOA — not all private companies have rotation directors.',
        guidanceNote: 'Many small private companies are exempt from retirement by rotation under their AOA. Check before including this item.',
        isOptional: true, requiredFor: 'ALL',
        workItems: [{
          type: 'RESOLUTION_VOTING', title: 'Re-appointment of Retiring Director',
          textTemplate: 'The Board is moved to re-appoint {{retiring_director_name|Name of retiring director|name}}, who retires by rotation and being eligible offers himself/herself for re-appointment, as a Director of the Company.',
          resolutionTextTemplate: 'RESOLVED THAT {{retiring_director_name|Name of retiring director|name}}, who retires by rotation and being eligible offers himself/herself for re-appointment, be and is hereby re-appointed as a Director of the Company.',
          isEditable: true, hasPlaceholders: true, requiredFor: 'ALL',
        }],
      },
      {
        order: 5, title: 'To consider and approve appointment of Statutory Auditors',
        itemType: 'STANDARD',
        legalBasis: 'Sec. 139(1) Companies Act 2013 — auditors appointed for 5-year term at AGM.',
        guidanceNote: 'Fill auditor firm name and FRN before the meeting. The FURTHER RESOLVED clause authorises the Board to fix remuneration — this is important and often omitted.',
        isOptional: false, requiredFor: 'ALL',
        workItems: [{
          type: 'RESOLUTION_VOTING', title: 'Appointment of Statutory Auditors',
          textTemplate: 'The Board is moved to appoint {{auditor_firm_name|Name of auditor firm|name}}, Chartered Accountants (FRN: {{auditor_frn|ICAI Firm Registration Number|text}}), as the Statutory Auditors of the Company for a term of five consecutive years, and to authorise the Board to fix their remuneration for each year.',
          resolutionTextTemplate: 'RESOLVED THAT pursuant to Section 139 of the Companies Act, 2013, {{auditor_firm_name|Name of auditor firm|name}}, Chartered Accountants (FRN: {{auditor_frn|ICAI Firm Registration Number|text}}), be and are hereby appointed as the Statutory Auditors of the Company for a term of five consecutive years from the conclusion of this Annual General Meeting until the conclusion of the sixth Annual General Meeting.\n\nFURTHER RESOLVED THAT the Board of Directors be and is hereby authorised to fix the remuneration payable to the Statutory Auditors for each financial year during their term of appointment.',
          isEditable: true, hasPlaceholders: true, requiredFor: 'ALL',
        }],
      },
      {
        order: 6, title: 'Any Other Business with the permission of the Chairperson',
        itemType: 'STANDARD',
        legalBasis: 'Sec. 102 Companies Act 2013.',
        guidanceNote: 'Any special business admitted by the Chairperson.',
        isOptional: true, requiredFor: 'ALL',
        workItems: [],
      },
    ],
  },
];

// ── Template utilities ────────────────────────────────────────────────────

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

/**
 * Substitute company profile values into template text before presenting to the meeting.
 * These are facts the system already knows — NOT manual variables for the chairperson.
 * Call this at meeting creation time using the company record.
 */
export function substituteCompanyProfile(
  text: string,
  profile: Partial<Record<CompanyProfileKey, string>>,
): string {
  let result = text;
  for (const key of COMPANY_PROFILE_KEYS) {
    if (profile[key]) {
      result = result.replace(new RegExp(`\\{\\{${key}(?:\\|[^}]*)?\\}\\}`, 'g'), profile[key]!);
    }
  }
  return result;
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
