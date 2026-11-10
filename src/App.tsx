import React, { useState, useEffect, useRef } from 'react';
import { SAMPLE_CONTRACTS_KO } from './data/contracts';
import { ContractReviewResult, StatementAuditResult } from './types/legal';
import { Sidebar, SidebarTab } from './components/Sidebar';
import { DashboardMain } from './components/DashboardMain';
import { LegalChatAssistant } from './components/LegalChatAssistant';
import { ExecutiveMemoModal } from './components/ExecutiveMemoModal';
import { UploadModal } from './components/UploadModal';
import { SystemPromptModal } from './components/SystemPromptModal';
import { LoginModal } from './components/LoginModal';
import { HistoryView, HistoryRecordItem } from './components/HistoryView';
import { CourtNoticesView, CourtNoticeItem, RegisteredCaseSummary } from './components/CourtNoticesView';
import { PdfToolsModal, PdfToolMode, InitialPdfBufferItem } from './components/PdfToolsModal';
import {
  Folder,
  FileSpreadsheet,
  CheckCircle2,
  Plus,
  Search,
  Edit3,
  Trash2,
  X,
  Bell,
  Calendar,
  Scale,
  Upload
} from 'lucide-react';

interface RegisteredCaseItem extends RegisteredCaseSummary {
  memo?: string;
}

const CASES_STORAGE_KEY = 'lawbot_registered_cases_v1';
const NOTICES_STORAGE_KEY = 'lawbot_court_notices_v1';

export default function App() {
  const [activeTab, setActiveTab] = useState<SidebarTab>('statements');
  const [currentContract, setCurrentContract] = useState<ContractReviewResult>(SAMPLE_CONTRACTS_KO[0]);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isMemoModalOpen, setIsMemoModalOpen] = useState(false);
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [activePdfTool, setActivePdfTool] = useState<PdfToolMode>(null);
  const [chatInitialQuery, setChatInitialQuery] = useState<string>('');
  const [customHistoryRecords, setCustomHistoryRecords] = useState<HistoryRecordItem[]>([]);
  const [externalFilesToIngest, setExternalFilesToIngest] = useState<File[] | null>(null);
  const [currentUploadedPdfBuffers, setCurrentUploadedPdfBuffers] = useState<InitialPdfBufferItem[]>([]);

  // Registered court cases list for '등록 사건' ('cases') menu — initialized empty (no tester data), persisted in localStorage
  const [registeredCases, setRegisteredCases] = useState<RegisteredCaseItem[]>(() => {
    try {
      const saved = localStorage.getItem(CASES_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Court notices list for '신규 법원 알림' ('court_notices') menu — initialized empty (no tester data), persisted in localStorage
  const [courtNotices, setCourtNotices] = useState<CourtNoticeItem[]>(() => {
    try {
      const saved = localStorage.getItem(NOTICES_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(CASES_STORAGE_KEY, JSON.stringify(registeredCases));
    } catch {
      // ignore storage errors
    }
  }, [registeredCases]);

  useEffect(() => {
    try {
      localStorage.setItem(NOTICES_STORAGE_KEY, JSON.stringify(courtNotices));
    } catch {
      // ignore storage errors
    }
  }, [courtNotices]);

  // Case registration / edit modal state
  const [isCaseModalOpen, setIsCaseModalOpen] = useState(false);
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);
  const [caseNoInput, setCaseNoInput] = useState('');
  const [clientNameInput, setClientNameInput] = useState('');
  const [courtInput, setCourtInput] = useState('서울회생법원');
  const [caseTypeInput, setCaseTypeInput] = useState('개인회생');
  const [statusInput, setStatusInput] = useState('보정명령 대응중');
  const [judgeInput, setJudgeInput] = useState('');
  const [nextDeadlineInput, setNextDeadlineInput] = useState('');
  const [memoInput, setMemoInput] = useState('');
  const [autoCreateNotice, setAutoCreateNotice] = useState(true);
  const [caseSearchQuery, setCaseSearchQuery] = useState('');
  const [caseFeedback, setCaseFeedback] = useState<string | null>(null);
  const [isParsingCasePdf, setIsParsingCasePdf] = useState(false);
  const casePdfInputRef = useRef<HTMLInputElement | null>(null);

  // Default logged in user profile matching user screenshot (김은진 uu4546@naver.com)
  const [user, setUser] = useState<{ name: string; email: string; role: string } | null>({
    name: '김은진',
    email: 'uu4546@naver.com',
    role: '정회원 실무자'
  });

  const handleSelectBenchmark = (contractId: string) => {
    const found = SAMPLE_CONTRACTS_KO.find((c) => c.id === contractId);
    if (found) {
      setCurrentContract(found);
      setActiveTab('statements');
    } else {
      setActiveTab('statements');
    }
  };

  const handleOpenAssistant = (query: string) => {
    setChatInitialQuery(query);
    setActiveTab('chat_assistant');
  };

  const handleCustomAnalysisComplete = (newContract: ContractReviewResult) => {
    setCurrentContract(newContract);
    setActiveTab('statements');
  };

  const handleStatementSavedToHistory = (audit: StatementAuditResult, fileCount: number) => {
    const baseThreshold = audit.thresholdAmount || 500000;
    const highCount = audit.transactions.filter(
      (t) => t.amount >= (t.appliedThreshold && t.appliedThreshold > 0 ? t.appliedThreshold : baseThreshold)
    ).length;
    const newRecord: HistoryRecordItem = {
      id: audit.id || `stmt-${Date.now()}`,
      title: `${audit.statementPeriod} (${fileCount}개 PDF 통합)`,
      client: audit.clientName,
      date: new Date().toISOString().slice(0, 16).replace('T', ' '),
      docType: 'statement',
      risk: highCount > 0 ? 'high' : 'low',
      riskLabel: `50만원↑ ${highCount}건 (전체 ${audit.transactions.length}건)`,
      status: '엑셀 추출 가능',
      auditData: audit
    };
    setCustomHistoryRecords((prev) => [newRecord, ...prev]);
  };

  const handleSidebarTabChange = (tab: SidebarTab) => {
    if (
      tab === 'tools_rotate' ||
      tab === 'tools_merge' ||
      tab === 'tools_split' ||
      tab === 'tools_delete'
    ) {
      setActivePdfTool(tab);
    } else {
      setActiveTab(tab);
    }
  };

  // Auto-detect Korean court case type when typing caseNo (e.g. 2026개회10482, 2026하단3021, 2026가단50192)
  const handleCaseNoChange = (val: string) => {
    setCaseNoInput(val);
    if (val.includes('개회')) {
      setCaseTypeInput('개인회생');
    } else if (val.includes('하단') || val.includes('하면')) {
      setCaseTypeInput('개인파산·면책');
    } else if (val.includes('회단') || val.includes('회합') || val.includes('간회단')) {
      setCaseTypeInput('법인회생 (간이회생)');
    } else if (val.includes('가단') || val.includes('가합') || val.includes('가소')) {
      setCaseTypeInput('민사 본안 / 소송');
    } else if (val.includes('카단') || val.includes('카합') || val.includes('타채')) {
      setCaseTypeInput('채권가압류 / 보전처분');
    }
  };

  // Upload Court PDF (보정명령서, 결정문 등) directly in Registered Cases view to auto-register case + notice
  const handleCasePdfAutoRegister = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsParsingCasePdf(true);
    setCaseFeedback(null);

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
      });

      const res = await fetch('/api/parse-court-doc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          pdfBase64: base64
        })
      });

      if (!res.ok) throw new Error('Failed to parse court PDF');
      const data = await res.json();

      const today = new Date().toISOString().slice(0, 10);
      const parsedCaseNo = data.caseNo || `2026개회${Math.floor(10000 + Math.random() * 89999)}`;
      const parsedClient = data.clientName || '의뢰인 (성명 확인요망)';

      if (isCaseModalOpen) {
        // Fill modal fields if modal is open
        setCaseNoInput(parsedCaseNo);
        if (data.clientName) setClientNameInput(data.clientName);
        if (data.court) setCourtInput(data.court);
        if (data.caseType) setCaseTypeInput(data.caseType);
        if (data.status) setStatusInput(data.status);
        if (data.judge) setJudgeInput(data.judge);
        if (data.nextDeadline) setNextDeadlineInput(data.nextDeadline);
        if (data.summaryContent) setMemoInput(data.summaryContent);
      } else {
        // Immediately register case and linked court notice
        const newCase: RegisteredCaseItem = {
          id: `case-pdf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          caseNo: parsedCaseNo,
          clientName: parsedClient,
          court: data.court || '서울회생법원',
          caseType: data.caseType || '개인회생',
          status: data.status || '보정명령 대응중',
          judge: data.judge || '',
          nextDeadline: data.nextDeadline || '송달일로부터 14일 이내',
          memo: data.summaryContent || `[${file.name}] 법원 문서 원문 자동 분석 등록`,
          updatedAt: today
        };

        setRegisteredCases((prev) => [newCase, ...prev]);

        const linkedNotice: CourtNoticeItem = {
          id: `notice-pdf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          caseNo: newCase.caseNo,
          caseName: `${newCase.caseType} (의뢰인: ${newCase.clientName})`,
          clientName: newCase.clientName,
          court: newCase.court,
          type: data.docType || '보정권고 / 보정명령',
          content: newCase.memo || '',
          date: today,
          isUrgent: Boolean(data.isUrgent ?? true),
          judge: newCase.judge || '',
          nextHearing: newCase.nextDeadline || '송달일로부터 14일 이내',
          submittedDocs: [`${today} 법원 문서 PDF(${file.name}) 자동 분석 및 사건·알림 동시 등록`]
        };

        setCourtNotices((prev) => [linkedNotice, ...prev]);
        setCaseFeedback(
          `법원 문서 [${file.name}]에서 사건번호 ${newCase.caseNo} (${newCase.court}) 정보를 추출하여 등록 사건 및 신규 법원 알림에 동시 등록했습니다.`
        );
      }
    } catch (err) {
      console.error(err);
      setCaseFeedback('법원 PDF 분석 중 오류가 발생했습니다. [신규 사건 등록] 버튼으로 직접 입력해 주세요.');
    } finally {
      setIsParsingCasePdf(false);
      if (casePdfInputRef.current) casePdfInputRef.current.value = '';
    }
  };

  // Open modal to register a new case
  const handleOpenNewCaseModal = () => {
    setEditingCaseId(null);
    setCaseNoInput('');
    setClientNameInput('');
    setCourtInput('서울회생법원');
    setCaseTypeInput('개인회생');
    setStatusInput('보정명령 대응중');
    setJudgeInput('');
    setNextDeadlineInput('');
    setMemoInput('최근 1년 은행 입출금 50만원 이상 및 카드 사용금액 50만원 이상 소명자료 준비');
    setAutoCreateNotice(true);
    setIsCaseModalOpen(true);
  };

  // Open modal to edit an existing case
  const handleOpenEditCaseModal = (item: RegisteredCaseItem) => {
    setEditingCaseId(item.id);
    setCaseNoInput(item.caseNo);
    setClientNameInput(item.clientName);
    setCourtInput(item.court);
    setCaseTypeInput(item.caseType);
    setStatusInput(item.status);
    setJudgeInput(item.judge || '');
    setNextDeadlineInput(item.nextDeadline || '');
    setMemoInput(item.memo || '');
    setAutoCreateNotice(false);
    setIsCaseModalOpen(true);
  };

  // Inline status update on a registered case card (also updates linked court notice urgency)
  const handleInlineCaseStatusChange = (caseId: string, newStatus: string) => {
    const today = new Date().toISOString().slice(0, 10);
    let targetCaseNo = '';
    setRegisteredCases((prev) =>
      prev.map((c) => {
        if (c.id === caseId) {
          targetCaseNo = c.caseNo;
          return { ...c, status: newStatus, updatedAt: today };
        }
        return c;
      })
    );
    if (targetCaseNo) {
      setCourtNotices((prev) =>
        prev.map((n) =>
          n.caseNo === targetCaseNo
            ? {
                ...n,
                isUrgent: newStatus.includes('보정') || newStatus.includes('대기'),
                submittedDocs: [...n.submittedDocs, `${today} 사건 진행 상태 변경 (${newStatus})`]
              }
            : n
        )
      );
      setCaseFeedback(`사건번호 [${targetCaseNo}] 진행 상태가 '${newStatus}'(으)로 변경되었으며 법원 알림에 동기화되었습니다.`);
    }
  };

  const handleSaveCase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseNoInput.trim() || !clientNameInput.trim()) return;

    const today = new Date().toISOString().slice(0, 10);

    if (editingCaseId) {
      setRegisteredCases((prev) =>
        prev.map((c) =>
          c.id === editingCaseId
            ? {
                ...c,
                caseNo: caseNoInput.trim(),
                clientName: clientNameInput.trim(),
                court: courtInput.trim() || '서울회생법원',
                caseType: caseTypeInput.trim() || '개인회생',
                status: statusInput,
                judge: judgeInput.trim() || '전담재판부',
                nextDeadline: nextDeadlineInput.trim() || undefined,
                memo: memoInput.trim() || undefined,
                updatedAt: today
              }
            : c
        )
      );
      setCaseFeedback(`사건번호 [${caseNoInput.trim()}] 사건 정보가 수정되었습니다.`);
    } else {
      const newCase: RegisteredCaseItem = {
        id: `case-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        caseNo: caseNoInput.trim(),
        clientName: clientNameInput.trim(),
        court: courtInput.trim() || '서울회생법원',
        caseType: caseTypeInput.trim() || '개인회생',
        status: statusInput,
        judge: judgeInput.trim() || '전담재판부',
        nextDeadline: nextDeadlineInput.trim() || '보정기한 내 제출',
        memo: memoInput.trim() || undefined,
        updatedAt: today
      };

      setRegisteredCases((prev) => [newCase, ...prev]);

      if (autoCreateNotice) {
        const linkedNotice: CourtNoticeItem = {
          id: `notice-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          caseNo: newCase.caseNo,
          caseName: `${newCase.caseType} (의뢰인: ${newCase.clientName})`,
          clientName: newCase.clientName,
          court: newCase.court,
          type: newCase.status.includes('보정') ? '보정권고 / 보정명령' : '사건 진행 통지',
          content:
            newCase.memo ||
            `[${newCase.caseNo}] ${newCase.clientName} 의뢰인 사건의 입출금·카드 50만원 이상 거래내역 소명자료 및 보정서류 점검이 필요합니다.`,
          date: today,
          isUrgent: newCase.status.includes('보정') || newCase.status.includes('대기'),
          judge: newCase.judge || '전담재판부',
          nextHearing: newCase.nextDeadline || '보정기한 내 제출',
          submittedDocs: [`${today} 사건 등록 및 전자소송 송달 알림 연동 완료`]
        };
        setCourtNotices((prev) => [linkedNotice, ...prev]);
      }
      setCaseFeedback(
        `사건번호 [${newCase.caseNo}] (${newCase.clientName}) 사건이 등록되었으며 신규 법원 알림과 연동되었습니다.`
      );
    }

    setIsCaseModalOpen(false);
  };

  // Sync registered cases into court notices when user clicks '전자소송 즉시 동기화'
  const handleSyncNoticesFromCases = (): number => {
    if (registeredCases.length === 0) return 0;
    const today = new Date().toISOString().slice(0, 10);
    let addedCount = 0;
    const existingCaseNos = new Set(courtNotices.map((n) => n.caseNo));
    const newNotices: CourtNoticeItem[] = [];

    for (const rc of registeredCases) {
      if (!existingCaseNos.has(rc.caseNo)) {
        addedCount++;
        newNotices.push({
          id: `notice-sync-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          caseNo: rc.caseNo,
          caseName: `${rc.caseType} (의뢰인: ${rc.clientName})`,
          clientName: rc.clientName,
          court: rc.court,
          type: rc.status.includes('보정') ? '보정권고 / 보정명령' : '전자소송 송달문서',
          content:
            rc.memo ||
            `[${rc.caseNo}] ${rc.clientName} 의뢰인의 최근 1년 입출금 50만원 이상 및 카드 사용금액 50만원 이상 내역 소명표 제출 건`,
          date: today,
          isUrgent: rc.status.includes('보정') || rc.status.includes('대기'),
          judge: rc.judge || '전담재판부',
          nextHearing: rc.nextDeadline || '추후 지정 (보정기한 내 제출)',
          submittedDocs: [`${today} 대법원 나의사건검색 전자소송 자동 동기화 완료`]
        });
      }
    }

    if (newNotices.length > 0) {
      setCourtNotices((prev) => [...newNotices, ...prev]);
    }
    return addedCount;
  };

  const filteredRegisteredCases = registeredCases.filter((c) => {
    if (!caseSearchQuery.trim()) return true;
    const q = caseSearchQuery.trim().toLowerCase();
    return (
      c.caseNo.toLowerCase().includes(q) ||
      c.clientName.toLowerCase().includes(q) ||
      c.court.toLowerCase().includes(q) ||
      c.caseType.toLowerCase().includes(q) ||
      c.status.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex h-screen bg-white text-slate-900 font-sans overflow-hidden">
      <input
        ref={casePdfInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleCasePdfAutoRegister}
      />

      {/* Left Sidebar Matching law-bot.kr Screenshot */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={handleSidebarTabChange}
        user={user}
        onLogout={() => setUser(null)}
        onOpenLogin={() => setIsLoginModalOpen(true)}
        noticesCount={courtNotices.length}
        casesCount={registeredCases.length}
        onQuickAddCase={() => {
          setActiveTab('cases');
          handleOpenNewCaseModal();
        }}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-y-auto bg-white">
        {/* TAB 1: 거래내역서 / 계약서 분석 */}
        {activeTab === 'statements' && (
          <DashboardMain
            contract={currentContract}
            onSelectBenchmark={handleSelectBenchmark}
            onOpenUploadModal={() => setIsUploadModalOpen(true)}
            onExportMemo={() => setIsMemoModalOpen(true)}
            onOpenAssistant={handleOpenAssistant}
            onAnalysisSaved={handleStatementSavedToHistory}
            externalFilesToIngest={externalFilesToIngest}
            onExternalFilesConsumed={() => setExternalFilesToIngest(null)}
            onUploadedFilesChange={setCurrentUploadedPdfBuffers}
          />
        )}

        {/* TAB 2: AI 법률 자문 Q&A */}
        {activeTab === 'chat_assistant' && (
          <div className="flex-1 overflow-y-auto">
            <LegalChatAssistant
              currentContract={currentContract}
              initialQuery={chatInitialQuery}
              language="ko"
            />
          </div>
        )}

        {/* TAB 3: 분석 기록 */}
        {activeTab === 'history' && (
          <HistoryView
            customRecords={customHistoryRecords}
            onDeleteRecord={(id) =>
              setCustomHistoryRecords((prev) => prev.filter((item) => item.id !== id))
            }
            onClearAllRecords={() => setCustomHistoryRecords([])}
            onSelectDocument={(id) => {
              handleSelectBenchmark(id);
            }}
          />
        )}

        {/* TAB 4: 등록 사건 목록 (cases) */}
        {activeTab === 'cases' && (
          <div className="flex-1 p-6 sm:p-8 max-w-6xl mx-auto space-y-6 overflow-y-auto w-full">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2.5">
                  <Folder className="w-5 h-5 text-blue-600" />
                  <h1 className="text-xl font-bold text-slate-900">등록 사건 관리</h1>
                  <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold text-xs">
                    총 {registeredCases.length}건
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  개인회생·파산 및 본안 사건을 등록하거나 법원 보정명령서 PDF를 업로드하면 신규 법원 알림 및 거래내역 소명표와 연동됩니다.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => casePdfInputRef.current?.click()}
                  disabled={isParsingCasePdf}
                  className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-60"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{isParsingCasePdf ? '법원 PDF 분석 중...' : '보정명령/사건문서 PDF 자동등록'}</span>
                </button>

                <button
                  onClick={handleOpenNewCaseModal}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>신규 사건 직접 등록</span>
                </button>

                {registeredCases.length > 0 && (
                  <button
                    onClick={() => {
                      setRegisteredCases([]);
                      setCaseFeedback('등록된 모든 사건 데이터가 초기화되었습니다.');
                    }}
                    className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-xl text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                  >
                    등록사건 데이터 초기화
                  </button>
                )}
              </div>
            </div>

            {caseFeedback && (
              <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl flex items-center justify-between gap-3 text-xs text-blue-900">
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>{caseFeedback}</span>
                </div>
                <button
                  onClick={() => setCaseFeedback(null)}
                  className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {registeredCases.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-slate-500">
                  각 사건의 진행 상태를 즉시 변경할 수 있으며, <strong>거래내역 소명표</strong> 및 <strong>신규 법원 알림</strong>과 실시간 연동됩니다.
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={caseSearchQuery}
                    onChange={(e) => setCaseSearchQuery(e.target.value)}
                    placeholder="사건번호, 의뢰인명, 법원 검색..."
                    className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:border-blue-600"
                  />
                </div>
              </div>
            )}

            {filteredRegisteredCases.length === 0 ? (
              <div className="p-14 border border-slate-200 rounded-2xl text-center space-y-4 bg-slate-50/40">
                <Folder className="w-9 h-9 text-slate-300 mx-auto" />
                <div className="space-y-1">
                  <div className="text-sm font-bold text-slate-700">
                    {registeredCases.length === 0
                      ? '현재 등록된 사건이 없습니다.'
                      : '검색 조건에 일치하는 사건이 없습니다.'}
                  </div>
                  <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                    법원 보정명령서·결정문 PDF를 업로드하여 자동 등록하거나, [신규 사건 직접 등록] 버튼으로 사건번호(예: 2026개회10482)와 의뢰인을 등록해 주세요.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                  <button
                    onClick={() => casePdfInputRef.current?.click()}
                    className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <Upload className="w-4 h-4" />
                    <span>법원 보정명령/결정문 PDF 업로드 자동등록</span>
                  </button>
                  <button
                    onClick={handleOpenNewCaseModal}
                    className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <Plus className="w-4 h-4" />
                    <span>신규 사건 직접 등록하기</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {filteredRegisteredCases.map((c) => (
                  <div
                    key={c.id}
                    className="p-5 border border-slate-200 rounded-2xl hover:border-blue-300 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white shadow-2xs"
                  >
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                          {c.caseNo}
                        </span>
                        <span className="text-xs font-semibold text-slate-600">· {c.court}</span>
                        {c.judge && <span className="text-xs text-slate-400">· {c.judge}</span>}
                        <select
                          value={c.status}
                          onChange={(e) => handleInlineCaseStatusChange(c.id, e.target.value)}
                          className={`px-2 py-0.5 rounded font-bold text-[11px] border cursor-pointer focus:outline-hidden ${
                            c.status.includes('보정')
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : c.status.includes('완료') || c.status.includes('인가')
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-blue-50 text-blue-700 border-blue-200'
                          }`}
                        >
                          <option value="보정명령 대응중">보정명령 대응중</option>
                          <option value="보정권고 소명서 작성중">보정권고 소명서 작성중</option>
                          <option value="사건 접수완료">사건 접수완료</option>
                          <option value="개시결정 대기">개시결정 대기</option>
                          <option value="개시결정 완료">개시결정 완료</option>
                          <option value="채권자집회 대기">채권자집회 대기</option>
                          <option value="변제계획 인가완료">변제계획 인가완료</option>
                        </select>
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <Scale className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>
                          {c.caseType} — 의뢰인: <span className="text-blue-700">{c.clientName}</span>
                        </span>
                      </h3>
                      {c.memo && <p className="text-xs text-slate-600 leading-relaxed">{c.memo}</p>}
                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 pt-0.5">
                        {c.nextDeadline && (
                          <span className="inline-flex items-center gap-1 text-slate-600 font-medium">
                            <Calendar className="w-3 h-3 text-blue-600" />
                            차기 기일/기한: {c.nextDeadline}
                          </span>
                        )}
                        <span>최근 업데이트: {c.updatedAt}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        onClick={() => setActiveTab('statements')}
                        className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        <span>거래내역 소명표 이동</span>
                      </button>
                      <button
                        onClick={() => setActiveTab('court_notices')}
                        className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                      >
                        <Bell className="w-3.5 h-3.5 text-blue-600" />
                        <span>송달 알림 확인</span>
                      </button>
                      <button
                        onClick={() => handleOpenEditCaseModal(c)}
                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>수정</span>
                      </button>
                      <button
                        onClick={() =>
                          setRegisteredCases((prev) => prev.filter((item) => item.id !== c.id))
                        }
                        className="px-2.5 py-1.5 text-xs text-rose-600 hover:bg-rose-50 rounded-xl font-medium flex items-center gap-1 cursor-pointer whitespace-nowrap"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>삭제</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: 신규 법원 알림 */}
        {activeTab === 'court_notices' && (
          <CourtNoticesView
            notices={courtNotices}
            registeredCases={registeredCases}
            onAddNotice={(notice) => setCourtNotices((prev) => [notice, ...prev])}
            onUpdateNotice={(updated) =>
              setCourtNotices((prev) => prev.map((n) => (n.id === updated.id ? updated : n)))
            }
            onDeleteNotice={(id) => setCourtNotices((prev) => prev.filter((n) => n.id !== id))}
            onClearNotices={() => setCourtNotices([])}
            onSyncFromCases={handleSyncNoticesFromCases}
            onNavigateToCases={() => setActiveTab('cases')}
            onNavigateToStatements={() => setActiveTab('statements')}
          />
        )}

        {/* TAB 7: 공지사항 */}
        {activeTab === 'notices' && (
          <div className="flex-1 p-8 max-w-4xl mx-auto space-y-6 w-full">
            <h1 className="text-2xl font-bold text-slate-900">공지사항</h1>
            <div className="space-y-4">
              <div className="p-5 border border-emerald-200 rounded-2xl space-y-2 bg-emerald-50/40">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-bold text-emerald-700">신규 기능 안내</span>
                  <span>2026-03-10</span>
                </div>
                <h3 className="font-bold text-sm text-slate-900">
                  [신규] 다중 PDF 거래내역서 동시 업로드 및 입출금·카드 50만원 이상 전용 엑셀(.xlsx) 자동 맞춤 추출 지원
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  여러 은행 및 카드사 PDF 파일을 한 번에 업로드하면 거래 후 잔액이 아닌 실제 입출금·카드 사용금액 50만원 이상 내역만 정밀 필터링하여 한글 열 너비가 자동 맞춤된 엑셀 파일로 저장합니다.
                </p>
              </div>

              <div className="p-5 border border-slate-200 rounded-2xl space-y-2 bg-blue-50/30">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-bold text-blue-600">서비스 업데이트</span>
                  <span>2026-03-08</span>
                </div>
                <h3 className="font-bold text-sm text-slate-900">
                  [업데이트] Lawbot v3.0 정식 릴리즈 안내
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  거래내역서 자동 소명표 기능과 계약서 독소조항 자동 탐지 엔진, 등록 사건 및 법원 전자소송 알림 관리가 통합되었습니다.
                </p>
              </div>

              <div className="p-5 border border-slate-200 rounded-2xl space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>이용 안내</span>
                  <span>2026-03-01</span>
                </div>
                <h3 className="font-bold text-sm text-slate-900">
                  고객지원 및 기능 건의 안내
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  거래내역 분석 관련 추가 지원이나 개선 요청사항이 있으신 경우 실무자 고객지원 채널을 통해 언제든 문의해 주시기 바랍니다.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 8: 설정 */}
        {activeTab === 'settings' && (
          <div className="flex-1 p-8 max-w-2xl mx-auto space-y-6 w-full">
            <h1 className="text-2xl font-bold text-slate-900">환경 설정</h1>
            <div className="border border-slate-200 rounded-2xl p-6 space-y-4 text-xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <div className="font-bold text-slate-800">의뢰인 기본 계정</div>
                  <div className="text-slate-400">{user?.name} ({user?.email})</div>
                </div>
                <button
                  onClick={() => setIsLoginModalOpen(true)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  계정 변경
                </button>
              </div>

              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <div className="font-bold text-slate-800">다중 PDF 기본 소명 기준금액</div>
                  <div className="text-slate-400">은행 입출금 50만원 이상 · 카드 사용금액 50만원 이상만 엑셀(.xlsx) 저장</div>
                </div>
                <span className="text-blue-600 font-bold">50만원 이상 전용 저장</span>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-800">AI 엔진 프롬프트 명세</div>
                  <div className="text-slate-400">대한민국 법원 회생·파산 및 계약 검토 전문 엔진</div>
                </div>
                <button
                  onClick={() => setIsPromptModalOpen(true)}
                  className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg font-semibold hover:bg-blue-100 cursor-pointer"
                >
                  프롬프트 확인
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Registered Case Create / Edit Modal */}
      {isCaseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsCaseModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-start justify-between gap-2 pr-6">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {editingCaseId ? '등록 사건 정보 수정' : '신규 사건 등록'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  법원 사건번호와 의뢰인 정보를 입력하거나 법원 문서 PDF를 업로드해 자동 입력할 수 있습니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => casePdfInputRef.current?.click()}
                disabled={isParsingCasePdf}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[11px] font-bold flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <Upload className="w-3 h-3" />
                <span>{isParsingCasePdf ? '분석 중...' : 'PDF로 자동입력'}</span>
              </button>
            </div>

            <form onSubmit={handleSaveCase} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">사건번호 *</label>
                  <input
                    type="text"
                    required
                    value={caseNoInput}
                    onChange={(e) => handleCaseNoChange(e.target.value)}
                    placeholder="예: 2026개회10482"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800 focus:outline-hidden focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">의뢰인(당사자) 성명 *</label>
                  <input
                    type="text"
                    required
                    value={clientNameInput}
                    onChange={(e) => setClientNameInput(e.target.value)}
                    placeholder="예: 홍길동"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800 focus:outline-hidden focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">관할 법원 *</label>
                  <select
                    value={courtInput}
                    onChange={(e) => setCourtInput(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800 focus:outline-hidden focus:border-blue-600 bg-white"
                  >
                    <option value="서울회생법원">서울회생법원</option>
                    <option value="수원회생법원">수원회생법원</option>
                    <option value="부산회생법원">부산회생법원</option>
                    <option value="서울중앙지방법원">서울중앙지방법원</option>
                    <option value="인천지방법원">인천지방법원</option>
                    <option value="의정부지방법원">의정부지방법원</option>
                    <option value="대구지방법원">대구지방법원</option>
                    <option value="대전지방법원">대전지방법원</option>
                    <option value="광주지방법원">광주지방법원</option>
                    <option value="전주지방법원">전주지방법원</option>
                    <option value="창원지방법원">창원지방법원</option>
                    <option value="청주지방법원">청주지방법원</option>
                    <option value="춘천지방법원">춘천지방법원</option>
                    <option value="제주지방법원">제주지방법원</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">사건 종류 *</label>
                  <select
                    value={caseTypeInput}
                    onChange={(e) => setCaseTypeInput(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800 focus:outline-hidden focus:border-blue-600 bg-white"
                  >
                    <option value="개인회생">개인회생</option>
                    <option value="개인파산·면책">개인파산·면책</option>
                    <option value="법인회생 (간이회생)">법인회생 (간이회생)</option>
                    <option value="민사 본안 / 소송">민사 본안 / 소송</option>
                    <option value="채권가압류 / 보전처분">채권가압류 / 보전처분</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">현재 진행 상태 *</label>
                  <select
                    value={statusInput}
                    onChange={(e) => setStatusInput(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800 focus:outline-hidden focus:border-blue-600 bg-white"
                  >
                    <option value="보정명령 대응중">보정명령 대응중</option>
                    <option value="보정권고 소명서 작성중">보정권고 소명서 작성중</option>
                    <option value="사건 접수완료">사건 접수완료</option>
                    <option value="개시결정 대기">개시결정 대기</option>
                    <option value="개시결정 완료">개시결정 완료</option>
                    <option value="채권자집회 대기">채권자집회 대기</option>
                    <option value="변제계획 인가완료">변제계획 인가완료</option>
                  </select>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-bold text-slate-700 text-xs sm:text-sm">담당 재판부 / 회생위원</label>
                    <span className="text-[11px] text-blue-600 font-medium">직접 자유입력 가능</span>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      value={judgeInput}
                      onChange={(e) => setJudgeInput(e.target.value)}
                      placeholder="예: 제12회생단독, 제3단독, 회생위원 등 직접 입력"
                      className="w-full px-3 py-2 pr-8 border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-hidden focus:border-blue-600 focus:ring-1 focus:ring-blue-600 bg-white"
                    />
                    {judgeInput && (
                      <button
                        type="button"
                        onClick={() => setJudgeInput('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs w-4 h-4 flex items-center justify-center rounded-full hover:bg-slate-100"
                        title="입력 지우기"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1 mt-1.5">
                    <span className="text-[10px] text-slate-400 mr-0.5">빠른선택:</span>
                    {['제12회생단독', '제3단독', '제5단독', '제20단독', '파산3단독', '회생위원'].map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => setJudgeInput(chip)}
                        className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                          judgeInput === chip
                            ? 'bg-blue-600 border-blue-600 text-white font-medium'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                        }`}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">차기 기일 / 보정 기한</label>
                <input
                  type="text"
                  value={nextDeadlineInput}
                  onChange={(e) => setNextDeadlineInput(e.target.value)}
                  placeholder="예: 2026-11-30 보정서 제출기한"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800 focus:outline-hidden focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">사건 메모 / 보정 명령 요지</label>
                <textarea
                  rows={2}
                  value={memoInput}
                  onChange={(e) => setMemoInput(e.target.value)}
                  placeholder="예: 최근 1년 은행 입출금 50만원 이상 및 카드 사용 50만원 이상 소명표 제출 필요"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800 focus:outline-hidden focus:border-blue-600"
                />
              </div>

              {!editingCaseId && (
                <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoCreateNotice}
                    onChange={(e) => setAutoCreateNotice(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="font-semibold text-blue-700">
                    [신규 법원 알림] 메뉴에도 이 사건의 송달·보정 알림을 함께 연동 등록
                  </span>
                </label>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCaseModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl font-semibold cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{editingCaseId ? '수정 내용 저장' : '사건 등록 완료'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Login & Signup Modal (law-bot.kr/login Style) */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onLoginSuccess={(loggedUser) => setUser(loggedUser)}
      />

      {/* Executive Printable Memorandum Modal */}
      <ExecutiveMemoModal
        contract={currentContract}
        isOpen={isMemoModalOpen}
        onClose={() => setIsMemoModalOpen(false)}
        language="ko"
      />

      {/* Custom Contract Upload & Text Analysis Modal */}
      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onAnalysisComplete={handleCustomAnalysisComplete}
        language="ko"
      />

      {/* PDF Tool Utilities Modal (Rotate / Merge / Split / Delete Pages with Live Preview) */}
      <PdfToolsModal
        toolType={activePdfTool}
        onClose={() => setActivePdfTool(null)}
        initialFiles={currentUploadedPdfBuffers}
        onApplyToAnalysis={(modifiedFiles) => {
          setActiveTab('statements');
          setExternalFilesToIngest(modifiedFiles);
        }}
      />

      {/* System Prompt & AI Persona Specification Modal */}
      <SystemPromptModal
        isOpen={isPromptModalOpen}
        onClose={() => setIsPromptModalOpen(false)}
        language="ko"
      />
    </div>
  );
}
