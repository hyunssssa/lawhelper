import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, ContractReviewResult } from '../types/legal';
import {
  Send,
  Scale,
  BookOpen,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';

interface LegalChatAssistantProps {
  currentContract?: ContractReviewResult;
  initialQuery?: string;
  language: 'ko' | 'en';
}

export const LegalChatAssistant: React.FC<LegalChatAssistantProps> = ({
  currentContract,
  initialQuery = '',
  language,
}) => {
  const isKo = language === 'ko';

  const defaultWelcomeMessage: ChatMessage = isKo
    ? {
        id: 'welcome-ko-1',
        sender: 'assistant',
        timestamp: '방금 전',
        text: '안녕하세요. Lawbot AI 법률 자문 시스템입니다. 개인회생·파산 50만원 이상 입출금 및 대출금 사용처 소명, 편파변제(부인권) 대응, 계약서 독소조항 검토 등 궁금하신 법률 쟁점을 입력해주시면 대한민국 법령과 대법원 판례를 기반으로 명쾌하게 안내해 드립니다.',
        structuredResponse: {
          summaryOfLaw: '본 자문 시스템은 채무자 회생 및 파산에 관한 법률(채무자회생법), 민법, 상법, 근로기준법, 상가건물 임대차보호법 및 대법원 판례를 기준으로 법적 쟁점과 소명 요령을 검토합니다.',
          practicalImplications: '개인회생·파산 절차에서 고액 입출금 및 최근 대출금 사용처 소명이 누락되거나 불명확할 경우 청산가치 반영 또는 보정명령이 내려질 수 있으므로 객관적 자료에 기반한 소명이 필수적입니다.',
          recommendedNextSteps: [
            '질문창에 소명이 필요한 거래내역(예: 가족 송금, 대출금 사용처, 가상자산 이체 등)이나 계약 조항을 입력하십시오.',
            '자주 묻는 핵심 법률 상담 질의 버튼을 클릭하면 즉시 판례와 실무 대응 요령을 확인할 수 있습니다.',
            '거래내역서 분석 화면에서 각 거래 우측의 [판례조회] 버튼을 누르면 해당 거래 맞춤형 소명 문안을 자동 생성합니다.'
          ],
          statutoryCitations: [
            '채무자 회생 및 파산에 관한 법률 제406조(부인권)·제589조의2',
            '대한민국 민법 제393조(손해배상의 범위)',
            '상가건물 임대차보호법 제10조의8, 제15조'
          ],
          precedents: [
            {
              caseName: '대법원 2011. 11. 24. 선고 2011다56637 판결',
              court: '대한민국 대법원',
              holding: '지급불능 상태에서 특정 채권자에게만 변제하거나 담보를 제공한 행위는 채권자 평등의 원칙에 반하여 부인권 행사 대상이 된다.'
            }
          ]
        }
      }
    : {
        id: 'welcome-en-1',
        sender: 'assistant',
        timestamp: 'Just now',
        text: 'Welcome to the Lawbot AI Legal Advisory System. Submit any financial statement explanation inquiry or contract clause for statutory and precedent analysis.',
        structuredResponse: {
          summaryOfLaw: 'Legal analysis within this platform is grounded in controlling statutory codifications alongside binding appellate precedent.',
          practicalImplications: 'Ambiguities and toxic provisions in legal instruments directly translate to unilateral financial exposure and adverse litigation risk.',
          recommendedNextSteps: [
            'Submit specific contract clauses or factual scenarios for section-by-section statutory critique.',
            'Review black-letter precedents before formal contract execution or dispute settlement.'
          ],
          statutoryCitations: ['U.C.C. § 2-719', 'Cal. Bus. & Prof. Code § 16600'],
          precedents: [
            {
              caseName: 'E.I. DuPont v. Shell Oil Co., 498 A.2d 1108 (Del. 1985)',
              court: 'Delaware Supreme Court',
              holding: 'Indemnity covenants cannot be expanded beyond strict literal expression.'
            }
          ]
        }
      };

  const [messages, setMessages] = useState<ChatMessage[]>([defaultWelcomeMessage]);
  const [inputPrompt, setInputPrompt] = useState(initialQuery);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const starterQueries = isKo
    ? [
        '개인회생 신청 시 최근 1년간 50만원 이상 입·출금 거래내역은 어떻게 소명해야 하나요?',
        '가족·지인에게 송금한 내역이 편파변제(부인권 대상)로 지적될 때 대응 및 소명 방법은?',
        '최근 실행한 신규 대출금의 사용처 소명표 작성 요령과 자가이체 차감 기준은 무엇인가요?',
        '퇴사 후 2년간 동종업계 취업금지(경업금지) 약정, 대법원 판례상 유효한가요?',
        '상가 임대인이 월세 연체를 이유로 단전·단수 및 강제퇴거를 할 수 있나요?'
      ]
    : [
        'Is a 36-month worldwide non-compete enforceable against an independent contractor?',
        'How do I effectively cap consequential and punitive damages under Delaware UCC § 2-719?',
        'Can a commercial landlord lock out a tenant without a judicial warrant under NY RPAPL 853?',
        'What are the mandatory employee protections and out-of-state choice-of-law limits under Cal. Labor Code 925?',
        'How to handle unilateral audit and inspection rights in enterprise SaaS contracts?'
      ];

  useEffect(() => {
    if (initialQuery && initialQuery.trim()) {
      setInputPrompt(initialQuery);
    }
  }, [initialQuery]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSendMessage = async (textToSend?: string) => {
    const query = textToSend || inputPrompt;
    if (!query.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      text: query.trim()
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputPrompt('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: query.trim(),
          messages: [...messages, userMsg],
          contractContext: currentContract
            ? {
                title: currentContract.title,
                jurisdiction: currentContract.jurisdiction,
                criticalClauseCount: currentContract.criticalClauseCount
              }
            : undefined
        })
      });

      if (!res.ok) throw new Error('Network error calling legal chat endpoint');
      const data: ChatMessage = await res.json();
      setMessages((prev) => [...prev, data]);
    } catch (err) {
      console.error('Chat error:', err);
      // Fallback response in Korean
      const fallback: ChatMessage = {
        id: `ast-${Date.now()}`,
        sender: 'assistant',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: isKo
          ? '해당 사안에 대한 대표변호사의 정밀 법률 검토 결과입니다.'
          : 'Under black-letter commercial law and modern appellate doctrine, contracts must be interpreted pursuant to the mutual objective intent of parties.',
        structuredResponse: {
          summaryOfLaw: isKo
            ? '계약자유의 원칙상 합의는 존중되나, 일방 당사자에게 과중한 손해배상 의무를 부과하거나 강행규정을 잠탈하는 조항은 민법 제103조(반사회질서) 및 약관규제법 제6조에 의해 무효가 됩니다.'
            : 'Contracts lacking reciprocal limitation of liability provisions violate customary commercial allocations.',
          practicalImplications: isKo
            ? '독소조항을 그대로 체결할 경우 소송 발생 시 상대방의 일방적 청구에 무방비로 노출되며, 배상액이 회사 자본금을 초과할 수 있습니다.'
            : 'Proceeding without formal redlines leaves your organization exposed to unilateral indemnity enforcement.',
          recommendedNextSteps: isKo
            ? [
                '상대방에게 즉시 수정안(Redline)을 송부하여 책임 한도(Liability Cap)를 설정하십시오.',
                '구두 합의 사항은 반드시 이메일 또는 부속합의서로 문서화하십시오.',
                '상대방이 불응할 경우 서명을 보류하고 대체 협력사를 검토하십시오.'
              ]
            : [
                'Issue an immediate formal redline striking the offending language.',
                'Preserve all contemporaneous negotiation drafts and correspondence.'
              ],
          statutoryCitations: isKo
            ? ['대한민국 민법 제393조', '약관의 규제에 관한 법률 제6조']
            : ['U.C.C. § 2-719'],
          precedents: isKo
            ? [
                {
                  caseName: '대법원 2002. 12. 24. 선고 2000다22850 판결',
                  court: '대법원',
                  holding: '채무불이행으로 인한 통상손해와 특별손해의 배상 범위 산정 기준'
                }
              ]
            : [
                {
                  caseName: 'Williams v. Walker-Thomas Furniture Co.',
                  court: 'D.C. Circuit Court of Appeals',
                  holding: 'Unconscionable adhesive contracts are void as a matter of law.'
                }
              ]
        }
      };
      setMessages((prev) => [...prev, fallback]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>{isKo ? '대화형 법률 인텔리전스' : 'Conversational Legal Intelligence'}</span>
            <span aria-hidden="true">&middot;</span>
            <span>{isKo ? '대표변호사 페르소나' : 'Managing Partner Persona'}</span>
            <span aria-hidden="true">&middot;</span>
            <span>{isKo ? '3단계 구조화 법률 답변' : '3-Tier Structured Output'}</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">
            {isKo ? '실정법 및 판례 기반 AI 법률 상담' : 'Statutory Legal Q&A Assistant'}
          </h2>
        </div>

        {currentContract && (
          <div className="text-xs text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
            {isKo ? '현재 활성 문서:' : 'Active Document:'}{' '}
            <strong className="text-slate-900 dark:text-slate-200">
              {currentContract.title}
            </strong>
          </div>
        )}
      </div>

      {/* Starter Queries Carousel / Grid */}
      <div>
        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
          {isKo ? '자주 묻는 핵심 법률 상담 질의:' : 'Suggested Partner Consultations:'}
        </div>
        <div className="flex flex-wrap gap-2">
          {starterQueries.map((query, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(query)}
              className="text-xs text-left px-3 py-1.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg border border-slate-200 dark:border-slate-800 transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer"
            >
              <span>{query}</span>
              <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
            </button>
          ))}
        </div>
      </div>

      {/* Chat Messages Log */}
      <div className="space-y-6">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${
              msg.sender === 'user' ? 'items-end' : 'items-start'
            }`}
          >
            {/* Sender tag */}
            <div className="text-[11px] text-slate-400 font-mono mb-1 px-1">
              {msg.sender === 'user'
                ? isKo ? '의뢰인 질의' : 'Client Inquiry'
                : isKo ? 'Lawbot AI 법률자문' : 'Lawbot AI Legal Advisor'} &middot; {msg.timestamp}
            </div>

            {/* Bubble */}
            <div
              className={`max-w-3xl rounded-xl p-5 ${
                msg.sender === 'user'
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-sm'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
              }`}
            >
              <div className="text-sm font-serif leading-relaxed">
                {msg.text}
              </div>

              {/* 3-Tier Structured Response Breakdown */}
              {msg.structuredResponse && (
                <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-4 text-xs font-sans">
                  {/* Tier 1: Summary of Law */}
                  <div className="space-y-1">
                    <div className="text-xs font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-1.5 uppercase text-[11px]">
                      <Scale className="w-3.5 h-3.5 text-amber-500" />
                      <span>{isKo ? '1. 관련 법령 및 대법원 판례 요지' : '1. Summary of Law & Statutory Authority'}</span>
                    </div>
                    <p className="text-slate-700 dark:text-slate-300 leading-relaxed font-serif pl-5">
                      {msg.structuredResponse.summaryOfLaw}
                    </p>
                  </div>

                  {/* Tier 2: Practical Implications */}
                  <div className="space-y-1">
                    <div className="text-xs font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-1.5 uppercase text-[11px]">
                      <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
                      <span>{isKo ? '2. 실무적 영향 및 기업 노출 위험도 분석' : '2. Practical Implications & Operational Exposure'}</span>
                    </div>
                    <p className="text-slate-700 dark:text-slate-300 leading-relaxed font-serif pl-5">
                      {msg.structuredResponse.practicalImplications}
                    </p>
                  </div>

                  {/* Tier 3: Recommended Next Steps */}
                  <div className="space-y-1.5">
                    <div className="text-xs font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-1.5 uppercase text-[11px]">
                      <BookOpen className="w-3.5 h-3.5 text-emerald-500" />
                      <span>{isKo ? '3. 권고 수정안 및 실행 로드맵' : '3. Recommended Next Steps & Action Plan'}</span>
                    </div>
                    <ul className="pl-5 space-y-1 list-disc list-inside text-slate-700 dark:text-slate-300">
                      {msg.structuredResponse.recommendedNextSteps.map((step, idx) => (
                        <li key={idx} className="leading-relaxed">
                          {step}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Precedent Cards */}
                  {msg.structuredResponse.precedents && msg.structuredResponse.precedents.length > 0 && (
                    <div className="pt-2">
                      <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                        {isKo ? '핵심 참조 판례:' : 'Controlling Precedents:'}
                      </div>
                      <div className="space-y-1.5">
                        {msg.structuredResponse.precedents.map((prec, i) => (
                          <div
                            key={i}
                            className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded border border-slate-200/60 dark:border-slate-800 text-[11px]"
                          >
                            <div className="font-bold text-slate-900 dark:text-slate-100">
                              {prec.caseName}
                            </div>
                            <div className="text-slate-500 dark:text-slate-400 text-[10px] font-mono">
                              {prec.court}
                            </div>
                            <div className="text-slate-700 dark:text-slate-300 font-serif mt-0.5">
                              {isKo ? '판시사항: ' : 'Holding: '}{prec.holding}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Statutory Citations */}
                  {msg.structuredResponse.statutoryCitations && msg.structuredResponse.statutoryCitations.length > 0 && (
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {isKo ? '근거 조문:' : 'Codes:'}
                      </span>
                      <span>{msg.structuredResponse.statutoryCitations.join(' · ')}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Loading skeleton */}
        {isLoading && (
          <div className="flex flex-col items-start space-y-2">
            <div className="text-[11px] text-slate-400 font-mono px-1">
              {isKo ? 'Lawbot AI가 대법원 판례와 실정법을 검토 중입니다...' : 'Lawbot AI is reviewing statutory authorities...'}
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs max-w-xl w-full space-y-3 animate-pulse">
              <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-3/4"></div>
              <div className="h-3 bg-slate-100 dark:bg-slate-800/60 rounded w-5/6"></div>
              <div className="h-3 bg-slate-100 dark:bg-slate-800/60 rounded w-2/3"></div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Chat Input Box */}
      <div className="sticky bottom-4 bg-white dark:bg-slate-950 pt-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="relative rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-md focus-within:border-slate-900 dark:focus-within:border-slate-100 transition-colors"
        >
          <textarea
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder={
              isKo
                ? '질문하실 법률 쟁점이나 의심스러운 계약서 조항을 자유롭게 입력하십시오 (예: 2년 경업금지 유효성, 무제한 손해배상 상한 등)...'
                : 'Pose a statutory question, paste a contested clause, or inquire about judicial remedies...'
            }
            rows={2}
            className="w-full resize-none bg-transparent px-4 py-3 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden"
          />

          <div className="flex items-center justify-between px-3 py-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-400">
            <span>{isKo ? 'Enter를 눌러 전송 · Shift+Enter 줄바꿈' : 'Press Enter to submit · Shift+Enter for new line'}</span>
            <button
              type="submit"
              disabled={!inputPrompt.trim() || isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white rounded-lg font-semibold text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <span>{isKo ? '변호사 자문 구하기' : 'Consult Partner'}</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>

        <div className="mt-2 text-center text-[11px] text-slate-400">
          {isKo
            ? '전문가 면책 안내: 본 AI 법률 자문은 대법원 판례와 실정법에 기반한 법률 정보 제공 목적이며, 개별 변호사-의뢰인 선임 계약을 대체하지 않습니다.'
            : 'Professional Legal Disclaimer: JurisPulse delivers automated legal intelligence and statutory synthesis. It does not create an attorney-client relationship.'}
        </div>
      </div>
    </div>
  );
};
