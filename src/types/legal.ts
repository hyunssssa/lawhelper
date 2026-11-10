export type RiskSeverity = 'critical' | 'medium' | 'low' | 'standard';

export interface ClauseAnalysis {
  id: string;
  clauseNumber: string;
  title: string;
  originalText: string;
  severity: RiskSeverity;
  riskSummary: string;
  legalRationale: string;
  statutoryReference: string;
  precedentCitation?: string;
  toxicKeywords: string[];
  recommendedRedline: string;
  negotiationStance: string;
}

export interface MissingProtection {
  id: string;
  title: string;
  importance: 'critical' | 'medium' | 'advisory';
  riskDescription: string;
  suggestedLanguage: string;
  statutoryBasis: string;
}

export type TransactionCategory =
  | 'loan_disbursement'    // 대출금 입금
  | 'preference_payment'   // 편파변제 의심 (친인척/특정채권자 우선변제)
  | 'gambling_crypto'      // 사행성·코인·주식 지출
  | 'self_transfer'        // 본인 계좌 간 이체 (차감 매칭)
  | 'living_expense'       // 정상 생활비·병원비·임대료
  | 'card_settlement'      // 카드대금 상환
  | 'general';             // 일반 거래

export interface TransactionItem {
  id: string;
  date: string;
  type: 'deposit' | 'withdrawal';
  amount: number;
  counterpart: string;
  bankName: string;
  accountNumber: string;
  category: TransactionCategory;
  categoryLabel: string;
  isFlagged: boolean;
  flagReason?: string;
  courtRiskLevel: 'high' | 'medium' | 'normal';
  explanationStatus: 'needed' | 'completed' | 'exempt';
  explanationNote?: string;
  sourceCategory?: 'bank' | 'card' | 'crypto';
  appliedThreshold?: number;
}

export interface StatementAuditResult {
  id: string;
  clientName: string;
  statementPeriod: string;
  totalTransactionsCount: number;
  totalDepositAmount: number;
  totalWithdrawalAmount: number;
  thresholdAmount: number;
  highValueCount: number;
  preferenceCount: number;
  preferenceAmount: number;
  cryptoGamblingCount: number;
  cryptoGamblingAmount: number;
  recentLoanCount: number;
  recentLoanAmount: number;
  selfTransferCount: number;
  transactions: TransactionItem[];
}

export interface ContractReviewResult {
  id: string;
  title: string;
  documentType: string;
  counterparty: string;
  effectiveDate?: string;
  jurisdiction: string;
  overallRiskLevel: 'critical' | 'high' | 'moderate' | 'low';
  criticalClauseCount: number;
  mediumClauseCount: number;
  lowClauseCount: number;
  clauses: ClauseAnalysis[];
  missingProtections: MissingProtection[];
  executiveSummary: {
    clientBriefing: string;
    keyLiabilities: string[];
    tacticalChecklist: string[];
    suggestedWalkAwayTerms: string[];
  };
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  timestamp: string;
  text: string;
  structuredResponse?: {
    summaryOfLaw: string;
    practicalImplications: string;
    recommendedNextSteps: string[];
    statutoryCitations: string[];
    precedents: { caseName: string; court: string; holding: string }[];
  };
}

export type LegalDomain = 'civil' | 'criminal' | 'corporate' | 'labor' | 'family';

export interface CaseTriageInput {
  domain: LegalDomain;
  clientRole: string; // e.g. Plaintiff, Defendant, Employer, Employee, Spouse
  counterparty: string;
  incidentDate: string;
  jurisdiction: string;
  disputeAmount: string;
  keyFacts: string;
  desiredOutcome: string;
  existingEvidence: string[];
  hasReceivedDemandLetter: boolean;
}

export interface CaseTriageReport {
  id: string;
  domain: LegalDomain;
  intakeTimestamp: string;
  viabilityScore: number; // 0 - 100
  viabilityGrade: 'High Probability' | 'Moderate / Contested' | 'High Risk / Unfavorable';
  statuteOfLimitationsStatus: {
    timeframe: string;
    deadlineEstimate: string;
    riskStatus: 'Urgent' | 'Within Window' | 'Expired / Vulnerable';
  };
  governingStatutes: string[];
  primaryRiskFactors: string[];
  recommendedStrategy: {
    immediateActions72h: string[];
    evidentiaryPriorities: string[];
    preLitigationTactics: string[];
    estimatedResolutionRange: string;
  };
  seniorPartnerNotes: string;
}
