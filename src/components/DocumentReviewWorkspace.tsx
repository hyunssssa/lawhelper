import React, { useState } from 'react';
import {
  ContractReviewResult,
  ClauseAnalysis,
  RiskSeverity,
} from '../types/legal';
import {
  AlertTriangle,
  Copy,
  Check,
  ChevronRight,
} from 'lucide-react';

interface DocumentReviewWorkspaceProps {
  contract: ContractReviewResult;
  onOpenUploadModal: () => void;
  onExportMemo: () => void;
  onAskAboutClause: (clauseText: string, clauseTitle: string) => void;
  language: 'ko' | 'en';
}

export const DocumentReviewWorkspace: React.FC<DocumentReviewWorkspaceProps> = ({
  contract,
  onOpenUploadModal,
  onExportMemo,
  onAskAboutClause,
  language,
}) => {
  const isKo = language === 'ko';
  const [selectedClauseId, setSelectedClauseId] = useState<string>(
    contract.clauses[0]?.id || ''
  );
  const [severityFilter, setSeverityFilter] = useState<'all' | RiskSeverity>('all');
  const [rightPanelTab, setRightPanelTab] = useState<'clause-deep-dive' | 'missing-protections' | 'redline-diff'>('clause-deep-dive');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const selectedClause: ClauseAnalysis | undefined =
    contract.clauses.find((c) => c.id === selectedClauseId) || contract.clauses[0];

  const filteredClauses = contract.clauses.filter((clause) => {
    if (severityFilter === 'all') return true;
    return clause.severity === severityFilter;
  });

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getSeverityBadgeClass = (severity: RiskSeverity) => {
    switch (severity) {
      case 'critical':
        return 'text-rose-600 dark:text-rose-400 font-semibold';
      case 'medium':
        return 'text-amber-600 dark:text-amber-400 font-medium';
      case 'low':
        return 'text-blue-600 dark:text-blue-400 font-medium';
      case 'standard':
      default:
        return 'text-emerald-600 dark:text-emerald-400 font-medium';
    }
  };

  const getSeverityLabel = (severity: RiskSeverity) => {
    if (isKo) {
      switch (severity) {
        case 'critical':
          return '치명적 독소조항';
        case 'medium':
          return '불균형 주의조항';
        case 'low':
          return '경미한 절차조항';
        case 'standard':
        default:
          return '표준/적합 조항';
      }
    }
    switch (severity) {
      case 'critical':
        return 'Critical Toxic Risk';
      case 'medium':
        return 'Medium Asymmetry';
      case 'low':
        return 'Low / Procedural';
      case 'standard':
      default:
        return 'Compliant / Standard';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Document Metadata Bar (No pills, clean unboxed text) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>{contract.documentType}</span>
              <span aria-hidden="true">&middot;</span>
              <span>{isKo ? '관할법원:' : 'Governing Law:'} {contract.jurisdiction}</span>
              <span aria-hidden="true">&middot;</span>
              <span>{isKo ? '상대방:' : 'Counterparty:'} {contract.counterparty}</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
              {contract.title}
            </h2>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={onOpenUploadModal}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
            >
              {isKo ? '내 계약서 직접 분석' : 'Analyze Custom Text'}
            </button>
            <button
              onClick={onExportMemo}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 dark:bg-slate-100 dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-white rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              {isKo ? '법률 의견서 생성' : 'Generate Executive Memo'}
            </button>
          </div>
        </div>

        {/* Risk Metrics Strip */}
        <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <div className="text-slate-500 dark:text-slate-400">
              {isKo ? '전체 계약 위험도 상태' : 'Overall Document Status'}
            </div>
            <div className="text-sm font-semibold capitalize mt-0.5 text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              <span>{contract.overallRiskLevel.toUpperCase()} {isKo ? '고위험군' : 'Exposure'}</span>
            </div>
          </div>
          <div>
            <div className="text-slate-500 dark:text-slate-400">
              {isKo ? '발굴된 독소조항' : 'Critical Toxic Clauses'}
            </div>
            <div className="text-sm font-bold font-mono tabular-nums text-rose-600 dark:text-rose-400 mt-0.5">
              {contract.criticalClauseCount} {isKo ? '개 발굴' : 'Flagged'}
            </div>
          </div>
          <div>
            <div className="text-slate-500 dark:text-slate-400">
              {isKo ? '불균형 주의조항' : 'Medium Asymmetric Terms'}
            </div>
            <div className="text-sm font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400 mt-0.5">
              {contract.mediumClauseCount} {isKo ? '개 발굴' : 'Flagged'}
            </div>
          </div>
          <div>
            <div className="text-slate-500 dark:text-slate-400">
              {isKo ? '누락된 필수 보호조항' : 'Missing Key Protections'}
            </div>
            <div className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
              {contract.missingProtections.length} {isKo ? '개 필요' : 'Required'}
            </div>
          </div>
        </div>
      </div>

      {/* Main Split Screen Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Document Clause Breakdown (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {isKo ? '조항별 정밀 분해 & 검토' : 'Section Breakdown & Clause Review'}
            </h3>

            {/* Filter buttons */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs">
              <button
                onClick={() => setSeverityFilter('all')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  severityFilter === 'all'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-medium shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                {isKo ? '전체' : 'All'} ({contract.clauses.length})
              </button>
              <button
                onClick={() => setSeverityFilter('critical')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  severityFilter === 'critical'
                    ? 'bg-white dark:bg-slate-700 text-rose-600 dark:text-rose-400 font-medium shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                {isKo ? '독소조항' : 'Critical'} ({contract.criticalClauseCount})
              </button>
              <button
                onClick={() => setSeverityFilter('medium')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  severityFilter === 'medium'
                    ? 'bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-400 font-medium shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                {isKo ? '주의조항' : 'Medium'} ({contract.mediumClauseCount})
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {filteredClauses.map((clause) => {
              const isSelected = selectedClause?.id === clause.id;
              return (
                <div
                  key={clause.id}
                  onClick={() => setSelectedClauseId(clause.id)}
                  className={`border rounded-xl p-4 transition-all cursor-pointer ${
                    isSelected
                      ? 'border-slate-900 dark:border-slate-200 bg-white dark:bg-slate-800/90 shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono text-slate-500 dark:text-slate-400">
                          {clause.clauseNumber}
                        </span>
                        <span aria-hidden="true">&middot;</span>
                        <span className={getSeverityBadgeClass(clause.severity)}>
                          {getSeverityLabel(clause.severity)}
                        </span>
                      </div>
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-1">
                        {clause.title}
                      </h4>
                    </div>

                    <ChevronRight
                      className={`w-4 h-4 mt-1 transition-transform ${
                        isSelected
                          ? 'rotate-90 text-slate-900 dark:text-white'
                          : 'text-slate-400'
                      }`}
                    />
                  </div>

                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 line-clamp-2 font-serif leading-relaxed">
                    “{clause.originalText}”
                  </p>

                  <div className="mt-2.5 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <span className="truncate max-w-[320px]">
                      {clause.riskSummary}
                    </span>
                    <span className="shrink-0 text-slate-400 text-[11px] font-mono">
                      {isKo ? '클릭하여 정밀 분석' : 'Click to inspect'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Real-Time Risk Assessment & Deep Dive (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Sub-tab switcher */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs">
            <button
              onClick={() => setRightPanelTab('clause-deep-dive')}
              className={`flex-1 py-1.5 rounded-md text-center transition-colors font-medium cursor-pointer ${
                rightPanelTab === 'clause-deep-dive'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              {isKo ? '조항 정밀 검토' : 'Clause Deep Dive'}
            </button>
            <button
              onClick={() => setRightPanelTab('missing-protections')}
              className={`flex-1 py-1.5 rounded-md text-center transition-colors font-medium cursor-pointer ${
                rightPanelTab === 'missing-protections'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              {isKo ? `누락 보호조항 (${contract.missingProtections.length})` : `Missing (${contract.missingProtections.length})`}
            </button>
            <button
              onClick={() => setRightPanelTab('redline-diff')}
              className={`flex-1 py-1.5 rounded-md text-center transition-colors font-medium cursor-pointer ${
                rightPanelTab === 'redline-diff'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              {isKo ? '수정안 대조 (Diff)' : 'Side-by-Side Diff'}
            </button>
          </div>

          {/* TAB 1: Selected Clause Deep Dive */}
          {rightPanelTab === 'clause-deep-dive' && selectedClause && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                    {selectedClause.clauseNumber}
                  </div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                    {selectedClause.title}
                  </h3>
                </div>
                <div className={`text-xs ${getSeverityBadgeClass(selectedClause.severity)}`}>
                  {getSeverityLabel(selectedClause.severity)}
                </div>
              </div>

              {/* Original Clause Text */}
              <div>
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                  {isKo ? '계약서 원문 조항:' : 'Original Contract Language:'}
                </div>
                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg text-xs font-serif text-slate-800 dark:text-slate-200 leading-relaxed border border-slate-200/60 dark:border-slate-700/60">
                  “{selectedClause.originalText}”
                </div>
              </div>

              {/* Flagged Toxic Terms */}
              {selectedClause.toxicKeywords && selectedClause.toxicKeywords.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                    {isKo ? '포착된 독소 키워드:' : 'Identified Toxic Phrasing:'}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedClause.toxicKeywords.map((kw, i) => (
                      <span
                        key={i}
                        className="text-xs font-mono px-2 py-0.5 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 rounded border border-rose-200 dark:border-rose-800"
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Statutory Basis & Rationale */}
              <div className="space-y-2 text-xs">
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {isKo ? '대표변호사 실무 검토 의견 & 법리:' : 'Senior Partner Statutory Rationale:'}
                </div>
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                  {selectedClause.legalRationale}
                </p>

                <div className="p-2.5 bg-slate-50 dark:bg-slate-800/40 rounded border border-slate-200/80 dark:border-slate-800 space-y-1">
                  <div className="text-slate-500 dark:text-slate-400">
                    <strong className="text-slate-700 dark:text-slate-300">
                      {isKo ? '관련 법령 근거:' : 'Statutory Authority:'}
                    </strong>{' '}
                    {selectedClause.statutoryReference}
                  </div>
                  {selectedClause.precedentCitation && (
                    <div className="text-slate-500 dark:text-slate-400">
                      <strong className="text-slate-700 dark:text-slate-300">
                        {isKo ? '대법원 판례 / 법원 판시:' : 'Controlling Precedent:'}
                      </strong>{' '}
                      {selectedClause.precedentCitation}
                    </div>
                  )}
                </div>
              </div>

              {/* Recommended Redline */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    {isKo ? '파트너 권고 수정 조항 (Redline):' : 'Recommended Partner Redline Revision:'}
                  </div>
                  <button
                    onClick={() => handleCopy(selectedClause.recommendedRedline, selectedClause.id)}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                  >
                    {copiedId === selectedClause.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                        <span>{isKo ? '수정안 복사됨' : 'Copied'}</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>{isKo ? '수정문구 복사' : 'Copy Redline'}</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 rounded-lg text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-serif">
                  {selectedClause.recommendedRedline}
                </div>
              </div>

              {/* Negotiation Stance & Chat Action */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  <strong className="text-slate-800 dark:text-slate-200">
                    {isKo ? '협상 스탠스:' : 'Stance:'}
                  </strong>{' '}
                  {selectedClause.negotiationStance}
                </div>
                <button
                  onClick={() => onAskAboutClause(selectedClause.originalText, selectedClause.title)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors shrink-0 cursor-pointer"
                >
                  {isKo ? '이 조항 질의하기' : 'Consult AI Partner'}
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: Missing Protections */}
          {rightPanelTab === 'missing-protections' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 shadow-xs">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {isKo ? '누락된 필수 보호조항' : 'Missing Mandatory Protections'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {isKo
                    ? '본 계약서에 누락되어 있어 향후 분쟁 시 일방적 법적·재정적 위험을 초래하는 핵심 안전장치입니다.'
                    : 'Essential protective covenants omitted from this document that expose your enterprise to unilateral risk.'}
                </p>
              </div>

              <div className="space-y-4">
                {contract.missingProtections.map((mp) => (
                  <div
                    key={mp.id}
                    className="p-4 border border-slate-200 dark:border-slate-800 rounded-lg space-y-2.5 bg-slate-50/50 dark:bg-slate-800/30"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        {mp.title}
                      </div>
                      <span className="text-[11px] font-mono text-rose-600 dark:text-rose-400 uppercase">
                        {mp.importance} {isKo ? '누락' : 'Omission'}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      {mp.riskDescription}
                    </p>

                    <div className="p-2.5 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-xs font-serif text-slate-800 dark:text-slate-200">
                      {mp.suggestedLanguage}
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        {isKo ? '법적 근거:' : 'Basis:'} {mp.statutoryBasis}
                      </span>
                      <button
                        onClick={() => handleCopy(mp.suggestedLanguage, mp.id)}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                      >
                        {copiedId === mp.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                            <span>{isKo ? '복사됨' : 'Copied'}</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>{isKo ? '조항 복사' : 'Copy Clause'}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: Side-by-Side Diff Comparison */}
          {rightPanelTab === 'redline-diff' && selectedClause && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 shadow-xs">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {isKo ? `수정안 대조: ${selectedClause.title}` : `Redline Comparison: ${selectedClause.title}`}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {isKo
                    ? '상대방의 기존 초안과 파트너 권고 수정안(Redline)의 명확한 문구 대비입니다.'
                    : 'Side-by-side contrast of counterparty proposal versus Partner-amended protective language.'}
                </p>
              </div>

              <div className="space-y-4 text-xs font-serif">
                <div className="p-3.5 bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/60 rounded-lg">
                  <div className="font-sans font-semibold text-rose-700 dark:text-rose-400 mb-1">
                    {isKo ? '상대방 현재 초안 (독소조항):' : 'Current Counterparty Draft:'}
                  </div>
                  <div className="text-slate-800 dark:text-slate-200 leading-relaxed">
                    {selectedClause.originalText}
                  </div>
                </div>

                <div className="p-3.5 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 rounded-lg">
                  <div className="font-sans font-semibold text-emerald-700 dark:text-emerald-400 mb-1">
                    {isKo ? '대표변호사 권고 수정안 (Redline):' : 'Partner Redline Draft:'}
                  </div>
                  <div className="text-slate-800 dark:text-slate-200 leading-relaxed">
                    {selectedClause.recommendedRedline}
                  </div>
                </div>
              </div>

              <button
                onClick={() => handleCopy(selectedClause.recommendedRedline, 'diff-copy')}
                className="w-full py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-slate-100 dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {copiedId === 'diff-copy' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{isKo ? '클립보드에 수정안 복사 완료' : 'Redline Copied'}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>{isKo ? '워드/한글 문서용 수정안 복사' : 'Copy Redline to Clipboard'}</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
