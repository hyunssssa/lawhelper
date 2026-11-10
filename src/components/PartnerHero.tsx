import React from 'react';
import { ShieldCheck, FileText, BookOpen, Sparkles, ArrowRight, Zap, CheckCircle2 } from 'lucide-react';

interface PartnerHeroProps {
  onSelectBenchmark: (contractId: string) => void;
  onExploreAssistant: () => void;
  onOpenUpload: () => void;
  onOpenLogin: () => void;
  language: 'ko' | 'en';
  user: { name: string; email: string; role: string } | null;
}

export const PartnerHero: React.FC<PartnerHeroProps> = ({
  onSelectBenchmark,
  onExploreAssistant,
  onOpenUpload,
  onOpenLogin,
  language,
  user,
}) => {
  const isKo = language === 'ko';

  return (
    <div className="bg-gradient-to-b from-blue-50/60 via-slate-50/30 to-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-14">
        <div className="max-w-3xl mx-auto text-center space-y-4">
          {/* Light modern pill badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100/80 border border-blue-200 text-blue-700 text-xs font-semibold shadow-2xs">
            <Zap className="w-3.5 h-3.5 text-blue-600" />
            <span>{isKo ? '실무자를 위한 차세대 AI 법률 자동화 플랫폼' : 'Next-Gen AI Legal Automation Platform'}</span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 leading-tight">
            {isKo ? (
              <>
                복잡한 계약서 검토와 법률 상담, <br className="hidden sm:inline" />
                <span className="text-blue-600">LawBot</span>으로 10초 만에 가볍게.
              </>
            ) : (
              <>
                Complex legal document review, <br className="hidden sm:inline" />
                done in seconds with <span className="text-blue-600">LawBot</span>.
              </>
            )}
          </h1>

          <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-2xl mx-auto">
            {isKo
              ? '계약서 파일(PDF/텍스트)만 올리면 숨어 있는 독소조항, 불공정 면책, 누락된 보호장치를 즉시 찾아내고 대법원 판례 기준의 명쾌한 수정안을 제안합니다.'
              : 'Upload any contract file to instantly detect toxic terms, uncapped liabilities, and missing protections with precedent-backed redlines.'}
          </p>

          {/* Action Button Strip */}
          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={onOpenUpload}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs sm:text-sm rounded-xl shadow-md shadow-blue-500/20 transition-all flex items-center gap-2 cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              <span>{isKo ? '내 계약서 무료 검토하기' : 'Upload Contract'}</span>
            </button>

            <button
              onClick={onExploreAssistant}
              className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs sm:text-sm rounded-xl border border-slate-200 transition-colors flex items-center gap-2 shadow-2xs cursor-pointer"
            >
              <BookOpen className="w-4 h-4 text-blue-600" />
              <span>{isKo ? 'AI에게 법률 질문하기' : 'Ask Legal AI'}</span>
            </button>

            {!user && (
              <button
                onClick={onOpenLogin}
                className="px-4 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold text-xs sm:text-sm rounded-xl border border-amber-200 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <span>💬</span>
                <span>{isKo ? '3초 만에 시작하기' : 'Sign in'}</span>
              </button>
            )}
          </div>

          {/* Quick Benchmark Contracts Bar */}
          <div className="pt-4 border-t border-slate-200/60 max-w-2xl mx-auto">
            <div className="text-[11px] font-semibold text-slate-500 mb-2">
              {isKo ? '🔥 실무 필수 샘플 계약서 바로 체험:' : 'Instant Sample Contracts:'}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={() => onSelectBenchmark(isKo ? 'contract-msa-ko' : 'contract-msa-01')}
                className="px-3 py-1.5 text-xs bg-white hover:bg-blue-50 hover:text-blue-700 text-slate-700 rounded-lg border border-slate-200 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <span>📄</span>
                <span>{isKo ? '용역 개발계약서 (MSA)' : 'Master Services Agreement'}</span>
              </button>
              <button
                onClick={() => onSelectBenchmark(isKo ? 'contract-lease-ko' : 'contract-lease-02')}
                className="px-3 py-1.5 text-xs bg-white hover:bg-blue-50 hover:text-blue-700 text-slate-700 rounded-lg border border-slate-200 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <span>🏬</span>
                <span>{isKo ? '상가건물 임대차계약서' : 'Commercial Lease'}</span>
              </button>
              <button
                onClick={() => onSelectBenchmark(isKo ? 'contract-emp-ko' : 'contract-employment-03')}
                className="px-3 py-1.5 text-xs bg-white hover:bg-blue-50 hover:text-blue-700 text-slate-700 rounded-lg border border-slate-200 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <span>👔</span>
                <span>{isKo ? '임원 고용·경업금지계약서' : 'Executive Employment'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* 4 Feature Value Props Strip (Clean, Light Cards) */}
        <div className="mt-8 pt-6 border-t border-slate-200/80 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-5xl mx-auto">
          <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
            <div className="text-blue-600 font-bold text-sm flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              <span>{isKo ? '10초 자동 분석' : '10s Analysis'}</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {isKo ? '수십 장 계약서 조항별 즉시 분해' : 'Instant section breakdown'}
            </p>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
            <div className="text-rose-600 font-bold text-sm flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" />
              <span>{isKo ? '독소조항 3등급 탐지' : 'Toxic Clause Alert'}</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {isKo ? '무제한 배상·위헌적 약정 사전 차단' : 'Severity indicators'}
            </p>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
            <div className="text-amber-600 font-bold text-sm flex items-center gap-1.5">
              <BookOpen className="w-4 h-4" />
              <span>{isKo ? '대법원 판례 매칭' : 'Court Precedents'}</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {isKo ? '실제 판결문 근거의 수정 조항 제시' : 'Controlling legal holding'}
            </p>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
            <div className="text-emerald-600 font-bold text-sm flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" />
              <span>{isKo ? '원클릭 요약 리포트' : '1-Click Report'}</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {isKo ? '의뢰인·경영진 보고용 PDF 출력' : 'Export executive memo'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
