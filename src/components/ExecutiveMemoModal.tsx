import React, { useState } from 'react';
import { ContractReviewResult } from '../types/legal';
import { Printer, Copy, Check, X, Scale } from 'lucide-react';

interface ExecutiveMemoModalProps {
  contract: ContractReviewResult;
  isOpen: boolean;
  onClose: () => void;
  language: 'ko' | 'en';
}

export const ExecutiveMemoModal: React.FC<ExecutiveMemoModalProps> = ({
  contract,
  isOpen,
  onClose,
  language,
}) => {
  const isKo = language === 'ko';
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const generateMarkdown = () => {
    if (isKo) {
      return `# [법률 검토 의견서] 계약서 독소조항 분석 및 수정 로드맵
**담당 시스템:** Lawbot AI 법률문서 분석 시스템
**작성일자:** ${new Date().toLocaleDateString('ko-KR')}
**수신:** 의뢰인 및 법무 실무 담당자
**발신:** Lawbot AI 법률자문 엔진
**제목:** "${contract.title}" 계약상 독소조항 발굴 및 실무 대응방안 검토
**준거법 및 관할:** ${contract.jurisdiction}
**계약 상대방:** ${contract.counterparty}
**종합 위험도 등급:** ${contract.overallRiskLevel.toUpperCase()} (심각한 위험 노출)

---

## 1. 종합 검토 소견
${contract.executiveSummary.clientBriefing}

## 2. 조항별 독소조항 및 대법원 판례 분석
${contract.clauses
  .map(
    (c) =>
      `### ${c.clauseNumber}: ${c.title} [위험도: ${c.severity.toUpperCase()}]
- **계약서 원문:** "${c.originalText}"
- **관련 법령:** ${c.statutoryReference}
- **참조 판례:** ${c.precedentCitation || '대법원 확립 법리'}
- **권고 수정안(Redline):** "${c.recommendedRedline}"
- **협상 스탠스:** ${c.negotiationStance}
`
  )
  .join('\n')}

## 3. 누락된 필수 보호조항 (보완 권고)
${contract.missingProtections
  .map(
    (mp) =>
      `- **${mp.title} (${mp.importance.toUpperCase()} 누락):** ${mp.riskDescription}
  - *삽입 권고 문구:* "${mp.suggestedLanguage}" [근거: ${mp.statutoryBasis}]`
  )
  .join('\n')}

## 4. 실무 협상 체크리스트
${contract.executiveSummary.tacticalChecklist.map((t) => `- [ ] ${t}`).join('\n')}

## 5. 절대 수용 불가 조건 (Walk-Away Boundaries)
${contract.executiveSummary.suggestedWalkAwayTerms.map((w) => `- ⚠️ ${w}`).join('\n')}
`;
    }

    return `# EXECUTIVE LEGAL MEMORANDUM
**SYSTEM:** Lawbot AI Legal Document Review
**DATE:** ${new Date().toLocaleDateString()}
**TO:** Executive Leadership & Legal Team
**FROM:** Lawbot AI Legal Advisory Engine
**RE:** Comprehensive Legal Risk & Statutory Review of "${contract.title}"
**JURISDICTION:** ${contract.jurisdiction}
**COUNTERPARTY:** ${contract.counterparty}
**OVERALL RISK STATUS:** ${contract.overallRiskLevel.toUpperCase()} EXPOSURE

---

## 1. EXECUTIVE SUMMARY & CLIENT BRIEFING
${contract.executiveSummary.clientBriefing}

## 2. INVENTORY OF HIGH-RISK & TOXIC CLAUSES
${contract.clauses
  .map(
    (c) =>
      `### ${c.clauseNumber}: ${c.title} [SEVERITY: ${c.severity.toUpperCase()}]
- **Original Text:** "${c.originalText}"
- **Statutory Authority:** ${c.statutoryReference}
- **Controlling Precedent:** ${c.precedentCitation || 'Standard Commercial Doctrine'}
- **Partner Redline Draft:** "${c.recommendedRedline}"
- **Strategic Stance:** ${c.negotiationStance}
`
  )
  .join('\n')}

## 3. MISSING MANDATORY PROTECTIONS
${contract.missingProtections
  .map(
    (mp) =>
      `- **${mp.title} (${mp.importance.toUpperCase()}):** ${mp.riskDescription}
  - *Recommended Addition:* "${mp.suggestedLanguage}" [Basis: ${mp.statutoryBasis}]`
  )
  .join('\n')}

## 4. JUNIOR COUNSEL TACTICAL CHECKLIST
${contract.executiveSummary.tacticalChecklist.map((t) => `- [ ] ${t}`).join('\n')}

## 5. NON-NEGOTIABLE WALK-AWAY TERMS
${contract.executiveSummary.suggestedWalkAwayTerms.map((w) => `- ⚠️ ${w}`).join('\n')}
`;
  };

  const handleCopyMarkdown = () => {
    navigator.clipboard.writeText(generateMarkdown());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto no-print">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl">
        {/* Top bar controls */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <Scale className="w-4 h-4 text-amber-500" />
            <span>{isKo ? '법률 검토 의견서 미리보기 (Memorandum)' : 'Executive Legal Memorandum Preview'}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyMarkdown}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span>{isKo ? '마크다운 복사됨' : 'Copied Markdown'}</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>{isKo ? '마크다운 복사' : 'Copy Markdown'}</span>
                </>
              )}
            </button>
            <button
              onClick={handlePrint}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 dark:bg-slate-100 dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{isKo ? '인쇄 / PDF로 저장' : 'Print / Save PDF'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Formal Printable Document Body */}
        <div className="p-8 sm:p-12 overflow-y-auto space-y-8 font-serif text-slate-900 dark:text-slate-100 print:text-black print:p-0">
          {/* Institutional Letterhead */}
          <div className="text-center pb-6 border-b-2 border-slate-900 dark:border-slate-300 space-y-1">
            <div className="text-xs uppercase tracking-widest text-slate-500 dark:text-slate-400 font-sans font-semibold">
              {isKo ? 'Lawbot AI 법률분석 리포트' : 'Lawbot AI Legal Analysis'}
            </div>
            <div className="text-xl sm:text-2xl font-bold tracking-tight">
              {isKo ? '법 률 검 토 의 견 서 (LEGAL OPINION)' : 'LEGAL COUNSEL MEMORANDUM'}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-sans">
              {isKo
                ? '개인회생·파산 소명 · 계약분석 · 판례 기반 리스크 진단'
                : 'Statutory Advisory, Precedent Analysis & Risk Triage'}
            </div>
          </div>

          {/* Memo Header Grid */}
          <div className="grid grid-cols-2 gap-4 text-xs font-sans border-b border-slate-200 dark:border-slate-800 pb-6">
            <div>
              <span className="font-bold text-slate-500 dark:text-slate-400">{isKo ? '수신:' : 'TO:'}</span>{' '}
              <span>{isKo ? '의뢰인 및 담당 실무자' : 'Client & Legal Operations'}</span>
            </div>
            <div>
              <span className="font-bold text-slate-500 dark:text-slate-400">{isKo ? '작성일자:' : 'DATE:'}</span>{' '}
              <span>{new Date().toLocaleDateString(isKo ? 'ko-KR' : 'en-US')}</span>
            </div>
            <div>
              <span className="font-bold text-slate-500 dark:text-slate-400">{isKo ? '발신:' : 'FROM:'}</span>{' '}
              <span>{isKo ? 'Lawbot AI 법률자문 시스템' : 'Lawbot AI Legal Advisory'}</span>
            </div>
            <div>
              <span className="font-bold text-slate-500 dark:text-slate-400">{isKo ? '위험도 상태:' : 'STATUS:'}</span>{' '}
              <span className="font-bold uppercase text-rose-600 dark:text-rose-400">
                {contract.overallRiskLevel.toUpperCase()} {isKo ? '위험 노출' : 'Risk Exposure'}
              </span>
            </div>
            <div className="col-span-2 pt-1">
              <span className="font-bold text-slate-500 dark:text-slate-400">{isKo ? '검토안건:' : 'RE:'}</span>{' '}
              <span className="font-bold">
                {isKo
                  ? `「${contract.title}」(${contract.counterparty}) 계약상 독소조항 분석 및 수정안 제안의 건`
                  : `Statutory Assessment & Redline Strategy for "${contract.title}" (${contract.counterparty})`}
              </span>
            </div>
          </div>

          {/* 1. Executive Summary */}
          <div className="space-y-2">
            <h3 className="font-sans font-bold text-sm tracking-tight text-slate-900 dark:text-slate-100 uppercase text-xs">
              {isKo ? '1. 대표변호사 총괄 검토 소견' : '1. Executive Summary & Legal Briefing'}
            </h3>
            <p className="text-xs sm:text-sm leading-relaxed text-slate-800 dark:text-slate-200">
              {contract.executiveSummary.clientBriefing}
            </p>
          </div>

          {/* 2. Clause Analysis Table */}
          <div className="space-y-4">
            <h3 className="font-sans font-bold text-sm tracking-tight text-slate-900 dark:text-slate-100 uppercase text-xs">
              {isKo ? '2. 조항별 독소 위험도 및 대법원 판례·법령 분석' : '2. Clause-by-Clause Risk & Statutory Authority'}
            </h3>
            <div className="space-y-4">
              {contract.clauses.map((clause) => (
                <div
                  key={clause.id}
                  className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between font-sans">
                    <span className="font-bold text-slate-900 dark:text-slate-100">
                      {clause.clauseNumber}: {clause.title}
                    </span>
                    <span className="font-mono text-rose-600 dark:text-rose-400 uppercase font-semibold">
                      {clause.severity}
                    </span>
                  </div>

                  <p className="italic text-slate-700 dark:text-slate-300">
                    &ldquo;{clause.originalText}&rdquo;
                  </p>

                  <div className="font-sans text-[11px] text-slate-600 dark:text-slate-400 space-y-0.5 pt-1">
                    <div>
                      <strong>{isKo ? '적용 법률:' : 'Legal Basis:'}</strong> {clause.statutoryReference}
                    </div>
                    {clause.precedentCitation && (
                      <div>
                        <strong>{isKo ? '관련 판례:' : 'Controlling Precedent:'}</strong> {clause.precedentCitation}
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700">
                    <div className="font-sans font-semibold text-emerald-700 dark:text-emerald-400 text-[11px] mb-1">
                      {isKo ? '파트너 권고 수정 조항 (Redline):' : 'Partner Redline Revision:'}
                    </div>
                    <div className="text-slate-800 dark:text-slate-200 leading-relaxed">
                      {clause.recommendedRedline}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 3. Missing Protections */}
          <div className="space-y-3">
            <h3 className="font-sans font-bold text-sm tracking-tight text-slate-900 dark:text-slate-100 uppercase text-xs">
              {isKo ? '3. 누락된 필수 보호조항 (보완 권고)' : '3. Omitted Mandatory Protective Covenants'}
            </h3>
            <div className="space-y-2 text-xs">
              {contract.missingProtections.map((mp) => (
                <div
                  key={mp.id}
                  className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded border border-slate-200 dark:border-slate-800 space-y-1"
                >
                  <div className="font-sans font-bold text-slate-900 dark:text-slate-100">
                    {mp.title} ({mp.importance.toUpperCase()} {isKo ? '누락' : 'Omission'})
                  </div>
                  <div className="text-slate-700 dark:text-slate-300">
                    {mp.riskDescription}
                  </div>
                  <div className="font-serif italic text-emerald-800 dark:text-emerald-300 pt-1">
                    {isKo ? '추가 권고안: ' : 'Insert: '}&ldquo;{mp.suggestedLanguage}&rdquo;
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 4. Junior Counsel Checklist */}
          <div className="space-y-2">
            <h3 className="font-sans font-bold text-sm tracking-tight text-slate-900 dark:text-slate-100 uppercase text-xs">
              {isKo ? '4. 실무 협상 및 수정 체크리스트' : '4. Junior Counsel Negotiation Action Plan'}
            </h3>
            <ul className="list-disc list-inside text-xs space-y-1 text-slate-800 dark:text-slate-200 font-sans">
              {contract.executiveSummary.tacticalChecklist.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </div>

          {/* 5. Non-Negotiables */}
          <div className="space-y-2">
            <h3 className="font-sans font-bold text-sm tracking-tight text-rose-700 dark:text-rose-400 uppercase text-xs">
              {isKo ? '5. 절대 수용 불가 협상 한계선 (Walk-Away Terms)' : '5. Non-Negotiable Walk-Away Boundaries'}
            </h3>
            <ul className="list-disc list-inside text-xs space-y-1 text-rose-800 dark:text-rose-300 font-sans">
              {contract.executiveSummary.suggestedWalkAwayTerms.map((term, idx) => (
                <li key={idx}>{term}</li>
              ))}
            </ul>
          </div>

          {/* Signature block */}
          <div className="pt-8 border-t border-slate-200 dark:border-slate-800 flex items-end justify-between font-sans text-xs">
            <div>
              <div className="font-serif italic text-base">
                {isKo ? 'Lawbot AI 법률분석 리포트' : 'Lawbot AI Legal Analysis'}
              </div>
              <div className="text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
                {isKo ? '대법원 판례 및 실정법 기반 자동 검토 의견서' : 'Automated Statutory & Precedent Opinion'}
              </div>
            </div>
            <div className="text-slate-400 text-right text-[11px]">
              {isKo ? '대외비 · 의뢰인 검토 전용 문서' : 'CONFIDENTIAL · CLIENT REVIEW DOCUMENT'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
