import React, { useState, useEffect } from 'react';
import { CreditCard, Check, Zap, Ticket, Receipt, Plus, Copy } from 'lucide-react';

interface PricingViewProps {
  initialSection?: 'pricing' | 'tickets' | 'payments';
}

export const PricingView: React.FC<PricingViewProps> = ({ initialSection = 'pricing' }) => {
  const [section, setSection] = useState<'pricing' | 'tickets' | 'payments'>(initialSection);
  const [activePlanName, setActivePlanName] = useState('실무자 베이직');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [newClientTicketName, setNewClientTicketName] = useState('');
  const [tickets, setTickets] = useState([
    {
      code: 'LAWBOT-2026-8841',
      clientName: '김은진 의뢰인',
      issuedDate: '2026-03-08',
      status: '사용 중 (PDF 3건 등록됨)',
      limit: '다중 PDF 무제한 업로드'
    },
    {
      code: 'LAWBOT-2026-5190',
      clientName: '박성훈 의뢰인',
      issuedDate: '2026-03-04',
      status: '소명표 제출 완료',
      limit: '다중 PDF 무제한 업로드'
    }
  ]);

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);

  const handleIssueTicket = () => {
    const targetName = newClientTicketName.trim() || `신규 의뢰인 #${tickets.length + 1}`;
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    setTickets([
      {
        code: `LAWBOT-2026-${randomNum}`,
        clientName: targetName,
        issuedDate: new Date().toISOString().slice(0, 10),
        status: '발급 완료 (대기 중)',
        limit: '다중 PDF 무제한 업로드'
      },
      ...tickets
    ]);
    setNewClientTicketName('');
  };

  const plans = [
    {
      name: '무료 체험 플랜',
      price: '0원',
      period: '첫 가입 시 3건 무료',
      description: 'Lawbot의 다중 PDF 거래내역서 50만원 이상 추출 및 계약서 검토를 경험해보세요.',
      features: [
        '다중 PDF 거래내역서 소명표 추출 3건',
        '계약서 독소조항 분석 3건',
        'AI 실무 질의응답 기본 제공',
        'Excel (.xlsx) 즉시 다운로드 지원'
      ],
      isPopular: false
    },
    {
      name: '실무자 베이직',
      price: '월 49,000원',
      period: '월 결제 / 부가세 별도',
      description: '개인회생·파산 실무자 및 변호사를 위한 다중 PDF 무제한 소명표 패키지.',
      features: [
        '다중 PDF 거래내역서 엑셀 소명표 무제한',
        '월 계약서 정밀 분석 50건',
        '의뢰인 직접 업로드용 이용권 10매/월',
        '법원 전자소송 알림 실시간 연동',
        '법률 의견서 워터마크 제거'
      ],
      isPopular: true
    },
    {
      name: '로펌 프로페셔널',
      price: '월 190,000원',
      period: '팀 단위 / 5계정 포함',
      description: '회생·파산 전문 법무법인 및 기업 법무팀을 위한 고성능 무제한 솔루션.',
      features: [
        '전 기능 & 다중 PDF 통합분석 무제한',
        '동시 다중 사용자 계정 (5인)',
        '의뢰인 이용권 무제한 발급',
        '전용 카카오톡 1:1 기술지원 핫라인',
        '사건등록 및 72시간 소송 전략 시뮬레이터'
      ],
      isPopular: false
    }
  ];

  const paymentHistory = [
    {
      id: 'PAY-20260301',
      date: '2026-03-01 09:15',
      item: 'Lawbot 실무자 베이직 (월 정기구독)',
      method: '신한법인카드 (****-4821)',
      amount: '53,900원 (VAT 포함)',
      status: '결제 완료'
    },
    {
      id: 'PAY-20260201',
      date: '2026-02-01 09:15',
      item: 'Lawbot 실무자 베이직 (월 정기구독)',
      method: '신한법인카드 (****-4821)',
      amount: '53,900원 (VAT 포함)',
      status: '결제 완료'
    }
  ];

  return (
    <div className="flex-1 bg-white p-6 sm:p-8 max-w-6xl mx-auto space-y-6 overflow-y-auto">
      {/* Sub-navigation tabs matching Sidebar items */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSection('tickets')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
              section === 'tickets'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Ticket className="w-3.5 h-3.5" />
            <span>의뢰인 이용권 관리</span>
          </button>
          <button
            onClick={() => setSection('pricing')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
              section === 'pricing'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>요금제 플랜</span>
          </button>
          <button
            onClick={() => setSection('payments')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
              section === 'payments'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>결제 내역 및 영수증</span>
          </button>
        </div>

        <div className="text-xs text-slate-500">
          현재 구독 플랜: <strong className="text-blue-600">{activePlanName}</strong>
        </div>
      </div>

      {/* SECTION 1: 의뢰인 이용권 (tickets) */}
      {section === 'tickets' && (
        <div className="space-y-5">
          <div className="p-5 bg-blue-50/50 border border-blue-100 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-base font-bold text-slate-900">의뢰인 전용 거래내역서 업로드 이용권</h2>
              <p className="text-xs text-slate-600">
                의뢰인에게 이용권 코드를 전달하면 의뢰인이 직접 본인의 다중 은행·카드 PDF를 업로드하고 소명 메모를 작성할 수 있습니다.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <input
                type="text"
                value={newClientTicketName}
                onChange={(e) => setNewClientTicketName(e.target.value)}
                placeholder="의뢰인 성명 입력"
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:border-blue-600"
              />
              <button
                onClick={handleIssueTicket}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>신규 이용권 발급</span>
              </button>
            </div>
          </div>

          <div className="border border-slate-200 rounded-2xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                <tr>
                  <th className="py-3 px-4">이용권 코드</th>
                  <th className="py-3 px-4">대상 의뢰인</th>
                  <th className="py-3 px-4">발급일</th>
                  <th className="py-3 px-4">권한 범위</th>
                  <th className="py-3 px-4">진행 상태</th>
                  <th className="py-3 px-4 text-right">코드 복사</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tickets.map((t) => (
                  <tr key={t.code} className="hover:bg-slate-50/60">
                    <td className="py-3.5 px-4 font-mono font-bold text-blue-600">{t.code}</td>
                    <td className="py-3.5 px-4 font-semibold text-slate-900">{t.clientName}</td>
                    <td className="py-3.5 px-4 text-slate-500 font-mono">{t.issuedDate}</td>
                    <td className="py-3.5 px-4 text-slate-600">{t.limit}</td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold text-[11px]">
                        {t.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(t.code);
                          setCopiedCode(t.code);
                          setTimeout(() => setCopiedCode(null), 1500);
                        }}
                        className="px-2.5 py-1 border border-slate-200 hover:bg-slate-100 rounded-lg text-slate-700 font-medium inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Copy className="w-3 h-3" />
                        <span>{copiedCode === t.code ? '복사됨!' : '코드 복사'}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION 2: 요금제 (pricing) */}
      {section === 'pricing' && (
        <div className="space-y-6">
          <div className="text-center max-w-xl mx-auto space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold">
              <Zap className="w-3.5 h-3.5 text-blue-600" />
              <span>합리적인 실무자 요금제</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              실무 부담을 덜어주는 Lawbot 요금제
            </h1>
            <p className="text-xs text-slate-500">
              개인 실무자부터 대형 로펌까지, 필요한 만큼만 유연하게 이용하세요.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((p) => {
              const isCurrent = activePlanName === p.name;
              return (
                <div
                  key={p.name}
                  className={`rounded-2xl p-6 border flex flex-col justify-between transition-all ${
                    p.isPopular
                      ? 'border-blue-600 shadow-md ring-1 ring-blue-600/20 bg-blue-50/20'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-900">{p.name}</span>
                      {p.isPopular && (
                        <span className="px-2 py-0.5 rounded-full bg-blue-600 text-white font-bold text-[10px]">
                          가장 인기
                        </span>
                      )}
                    </div>

                    <div>
                      <div className="text-2xl font-extrabold text-slate-900">{p.price}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{p.period}</div>
                    </div>

                    <p className="text-xs text-slate-600 leading-relaxed">{p.description}</p>

                    <div className="pt-2 border-t border-slate-100 space-y-2 text-xs">
                      {p.features.map((feat, i) => (
                        <div key={i} className="flex items-center gap-2 text-slate-700">
                          <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span>{feat}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => setActivePlanName(p.name)}
                    className={`w-full mt-6 py-2.5 px-4 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                      isCurrent
                        ? 'bg-emerald-600 text-white'
                        : p.isPopular
                        ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                    }`}
                  >
                    {isCurrent ? '✓ 현재 이용 중인 플랜' : '이 플랜으로 변경하기'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 3: 결제 내역 (payments) */}
      {section === 'payments' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">정기구독 및 이용권 결제 내역</h2>
              <p className="text-xs text-slate-500">세금계산서 및 법인카드 매출전표 증빙 내역입니다.</p>
            </div>
          </div>

          <div className="border border-slate-200 rounded-2xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                <tr>
                  <th className="py-3 px-4">결제번호</th>
                  <th className="py-3 px-4">결제일시</th>
                  <th className="py-3 px-4">상품명</th>
                  <th className="py-3 px-4">결제수단</th>
                  <th className="py-3 px-4">결제금액</th>
                  <th className="py-3 px-4">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paymentHistory.map((pay) => (
                  <tr key={pay.id} className="hover:bg-slate-50/60">
                    <td className="py-3.5 px-4 font-mono text-slate-600">{pay.id}</td>
                    <td className="py-3.5 px-4 font-mono text-slate-500">{pay.date}</td>
                    <td className="py-3.5 px-4 font-semibold text-slate-900">{pay.item}</td>
                    <td className="py-3.5 px-4 text-slate-600">{pay.method}</td>
                    <td className="py-3.5 px-4 font-bold text-slate-900">{pay.amount}</td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[11px]">
                        {pay.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
