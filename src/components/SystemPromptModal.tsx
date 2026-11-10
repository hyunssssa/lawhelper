import React, { useState } from 'react';
import { BENCHMARK_SYSTEM_PROMPT_KO, BENCHMARK_SYSTEM_PROMPT } from '../data/contracts';
import { Copy, Check, X, Terminal } from 'lucide-react';

interface SystemPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: 'ko' | 'en';
}

export const SystemPromptModal: React.FC<SystemPromptModalProps> = ({
  isOpen,
  onClose,
  language,
}) => {
  const isKo = language === 'ko';
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const currentPrompt = isKo ? BENCHMARK_SYSTEM_PROMPT_KO : BENCHMARK_SYSTEM_PROMPT;

  const handleCopy = () => {
    navigator.clipboard.writeText(currentPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-3xl w-full p-6 sm:p-8 space-y-5 shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide font-semibold text-slate-500 dark:text-slate-400">
                {isKo ? '프롬프트 엔지니어링 명세 · 프로덕션 아키텍처' : 'System Prompt Engineering · Production Specification'}
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {isKo ? '50년 경력 대표변호사 AI 페르소나 시스템 프롬프트' : '50-Year Senior Managing Partner AI Persona'}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 text-xs">
          <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
            {isKo
              ? 'JurisPulse의 Gemini 3.8 Flash 엔진에 실제로 주입되는 프로덕션 시스템 프롬프트입니다. 철저한 대법원 판례 및 강행규정 근거, 3단계 구조화 답변(관련 법령/실무 영향/권고 수정안), 독소조항 엄격 분류 기준이 엔지니어링되어 있습니다.'
              : 'This exact system prompt powers the underlying Gemini 3.8 Flash engine across contract parsing, contextual Q&A, and guided triage.'}
          </p>

          <div className="relative">
            <pre className="p-4 bg-slate-950 text-slate-200 rounded-xl overflow-x-auto text-[11px] font-mono leading-relaxed max-h-[380px] border border-slate-800 whitespace-pre-wrap">
              {currentPrompt}
            </pre>
            <button
              onClick={handleCopy}
              className="absolute top-3 right-3 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-md text-[11px] font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{isKo ? '복사됨' : 'Copied'}</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>{isKo ? '프롬프트 복사' : 'Copy Prompt'}</span>
                </>
              )}
            </button>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
            <div className="font-bold text-slate-900 dark:text-slate-100">
              {isKo ? '핵심 프롬프트 아키텍처 보증 사항:' : 'Prompt Architecture Key Guarantees:'}
            </div>
            <ul className="list-disc list-inside space-y-1 text-slate-700 dark:text-slate-300">
              <li>
                {isKo
                  ? '3단계 필수 분리: § 1. 관련 법령 및 판례 요지, § 2. 실무적 영향 및 위험도, § 3. 권고 수정안 및 실행 로드맵'
                  : '3-tier mandatory structure: § 1 Law, § 2 Impact, § 3 Next Steps'}
              </li>
              <li>
                {isKo
                  ? '법원 판례 강제: 대법원 2009다82244(경업금지), 2000다22850(특별손해) 등 실제 리딩 판례 인용'
                  : 'Controlling precedents citation required'}
              </li>
              <li>
                {isKo
                  ? '독소조항 3등급 엄격 분류: 치명적(Critical), 불균형(Medium), 경미(Low)'
                  : 'Rigid severity classification: Critical, Medium, Low'}
              </li>
              <li>
                {isKo
                  ? '전문직 윤리 및 면책 고지 준수: 변호사법 및 법률 서비스 한계 명확화'
                  : 'Compliance with professional legal representation boundaries'}
              </li>
            </ul>
          </div>
        </div>

        <div className="flex justify-end pt-3 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            {isKo ? '닫기' : 'Dismiss'}
          </button>
        </div>
      </div>
    </div>
  );
};
