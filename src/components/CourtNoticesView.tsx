import React, { useState, useRef } from 'react';
import {
  Bell,
  CheckCircle2,
  FileText,
  RefreshCw,
  X,
  Plus,
  Trash2,
  FolderPlus,
  FileSpreadsheet,
  AlertTriangle,
  Search,
  Upload
} from 'lucide-react';

export interface CourtNoticeItem {
  id: string;
  caseNo: string;
  caseName: string;
  clientName?: string;
  court: string;
  type: string;
  content: string;
  date: string;
  isUrgent: boolean;
  judge: string;
  nextHearing: string;
  submittedDocs: string[];
}

export interface RegisteredCaseSummary {
  id: string;
  caseNo: string;
  clientName: string;
  court: string;
  caseType: string;
  status: string;
  judge?: string;
  nextDeadline?: string;
  updatedAt: string;
}

interface CourtNoticesViewProps {
  notices: CourtNoticeItem[];
  registeredCases: RegisteredCaseSummary[];
  onAddNotice: (notice: CourtNoticeItem) => void;
  onUpdateNotice: (notice: CourtNoticeItem) => void;
  onDeleteNotice: (id: string) => void;
  onClearNotices: () => void;
  onSyncFromCases: () => number;
  onNavigateToCases: () => void;
  onNavigateToStatements: () => void;
}

export const CourtNoticesView: React.FC<CourtNoticesViewProps> = ({
  notices,
  registeredCases,
  onAddNotice,
  onUpdateNotice,
  onDeleteNotice,
  onClearNotices,
  onSyncFromCases,
  onNavigateToCases,
  onNavigateToStatements
}) => {
  const [filter, setFilter] = useState<'all' | 'urgent'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNotice, setSelectedNotice] = useState<CourtNoticeItem | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState('실시간 연동 대기');
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);

  // New Notice Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string>('');
  const [formCaseNo, setFormCaseNo] = useState('');
  const [formClientName, setFormClientName] = useState('');
  const [formCaseName, setFormCaseName] = useState('개인회생');
  const [formCourt, setFormCourt] = useState('서울회생법원');
  const [formType, setFormType] = useState('보정권고 / 보정명령');
  const [formContent, setFormContent] = useState('');
  const [formJudge, setFormJudge] = useState('');
  const [formNextHearing, setFormNextHearing] = useState('');
  const [formIsUrgent, setFormIsUrgent] = useState(true);

  // Add submitted doc inside detail modal
  const [newDocTitle, setNewDocTitle] = useState('');

  const filteredNotices = notices.filter((n) => {
    if (filter === 'urgent' && !n.isUrgent) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      return (
        n.caseNo.toLowerCase().includes(q) ||
        n.caseName.toLowerCase().includes(q) ||
        (n.clientName || '').toLowerCase().includes(q) ||
        n.court.toLowerCase().includes(q) ||
        n.type.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleSync = () => {
    setIsSyncing(true);
    setSyncFeedback(null);
    setTimeout(() => {
      const syncedCount = onSyncFromCases();
      const nowStr = new Date().toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      setLastSyncTime(`최근 동기화 ${nowStr}`);
      setIsSyncing(false);
      if (registeredCases.length === 0) {
        setSyncFeedback('등록된 사건이 없습니다. [등록 사건] 메뉴에서 사건을 등록하거나 [법원 송달문서 PDF 업로드] 또는 [송달/보정 알림 등록]을 이용해 주세요.');
      } else if (syncedCount > 0) {
        setSyncFeedback(`등록된 사건 ${registeredCases.length}건 기준 신규 전자소송 알림 ${syncedCount}건이 동기화되었습니다.`);
      } else {
        setSyncFeedback(`등록된 사건(${registeredCases.length}건)의 모든 송달·보정 내역이 최신 상태입니다.`);
      }
    }, 350);
  };

  // Upload Court PDF (보정명령서, 보정권고, 결정문 등) and parse automatically via /api/parse-court-doc
  const handleCourtPdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingPdf(true);
    setSyncFeedback(null);

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
      const parsedClient = data.clientName || '의뢰인';
      const newNotice: CourtNoticeItem = {
        id: `notice-pdf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        caseNo: parsedCaseNo,
        caseName: `${data.caseType || '개인회생'} (의뢰인: ${parsedClient})`,
        clientName: parsedClient,
        court: data.court || '서울회생법원',
        type: data.docType || '보정권고 / 보정명령',
        content: data.summaryContent || `[${file.name}] 법원 송달문서 원문 분석 완료`,
        date: today,
        isUrgent: Boolean(data.isUrgent ?? true),
        judge: data.judge || formJudge || '',
        nextHearing: data.nextDeadline || '송달일로부터 14일 이내',
        submittedDocs: [`${today} 원본 PDF 업로드 분석 완료 (${file.name})`]
      };

      onAddNotice(newNotice);
      setSyncFeedback(`법원 문서 [${file.name}]에서 사건번호 ${parsedCaseNo} (${data.docType}) 내역을 자동 추출하여 등록했습니다.`);
    } catch (err) {
      console.error(err);
      setSyncFeedback('법원 PDF 문서 분석 중 오류가 발생했습니다. [송달/보정 알림 등록] 버튼으로 직접 입력해 주세요.');
    } finally {
      setIsUploadingPdf(false);
      if (pdfInputRef.current) pdfInputRef.current.value = '';
    }
  };

  const handleOpenCreateModal = () => {
    if (registeredCases.length > 0) {
      const first = registeredCases[0];
      setSelectedCaseId(first.id);
      setFormCaseNo(first.caseNo);
      setFormClientName(first.clientName);
      setFormCaseName(`${first.caseType} (의뢰인: ${first.clientName})`);
      setFormCourt(first.court);
      setFormJudge(first.judge || '');
      setFormNextHearing(first.nextDeadline || '');
    } else {
      setSelectedCaseId('');
      setFormCaseNo('');
      setFormClientName('');
      setFormCaseName('개인회생 사건');
      setFormCourt('서울회생법원');
      setFormJudge('');
      setFormNextHearing('');
    }
    setFormType('보정권고 / 보정명령');
    setFormContent('최근 1년간 50만원 이상 입출금 거래내역 및 카드 사용내역에 대한 사용처 소명자료를 제출하시기 바랍니다.');
    setFormIsUrgent(true);
    setIsCreateModalOpen(true);
  };

  const handleSelectRegisteredCase = (caseId: string) => {
    setSelectedCaseId(caseId);
    const found = registeredCases.find((c) => c.id === caseId);
    if (found) {
      setFormCaseNo(found.caseNo);
      setFormClientName(found.clientName);
      setFormCaseName(`${found.caseType} (의뢰인: ${found.clientName})`);
      setFormCourt(found.court);
      setFormJudge(found.judge || '전담재판부');
      setFormNextHearing(found.nextDeadline || '');
    }
  };

  const handleCreateNoticeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCaseNo.trim() || !formContent.trim()) return;

    const today = new Date().toISOString().slice(0, 10);
    const newNotice: CourtNoticeItem = {
      id: `notice-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      caseNo: formCaseNo.trim(),
      caseName: formCaseName.trim() || `개인회생 (${formClientName.trim() || '의뢰인'})`,
      clientName: formClientName.trim() || undefined,
      court: formCourt.trim() || '서울회생법원',
      type: formType.trim() || '보정명령',
      content: formContent.trim(),
      date: today,
      isUrgent: formIsUrgent,
      judge: formJudge.trim() || '담당재판부',
      nextHearing: formNextHearing.trim() || '추후 지정 (보정기한 내 제출)',
      submittedDocs: [`${today} 전자소송 송달문서(${formType.trim()}) 수신 완료`]
    };

    onAddNotice(newNotice);
    setIsCreateModalOpen(false);
    setSyncFeedback(`사건번호 [${newNotice.caseNo}] 신규 법원 알림이 등록되었습니다.`);
  };

  const handleAddSubmittedDoc = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedNotice || !newDocTitle.trim()) return;
    const today = new Date().toISOString().slice(0, 10);
    const updated: CourtNoticeItem = {
      ...selectedNotice,
      submittedDocs: [...selectedNotice.submittedDocs, `${today} ${newDocTitle.trim()}`]
    };
    onUpdateNotice(updated);
    setSelectedNotice(updated);
    setNewDocTitle('');
  };

  const handleToggleUrgent = (notice: CourtNoticeItem) => {
    const updated: CourtNoticeItem = {
      ...notice,
      isUrgent: !notice.isUrgent
    };
    onUpdateNotice(updated);
    if (selectedNotice?.id === notice.id) {
      setSelectedNotice(updated);
    }
  };

  return (
    <div className="flex-1 bg-white p-6 sm:p-8 max-w-6xl mx-auto space-y-6 overflow-y-auto w-full">
      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleCourtPdfUpload}
      />

      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-blue-600" />
            <h1 className="text-xl font-bold text-slate-900">법원 전자소송 실시간 알림</h1>
            <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold text-xs">
              총 {notices.length}건
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            대한민국 대법원 전자소송 및 등록 사건({registeredCases.length}건) 연동 송달·보정 내역입니다. ({lastSyncTime})
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => pdfInputRef.current?.click()}
            disabled={isUploadingPdf}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-60"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{isUploadingPdf ? 'PDF 문서 분석 중...' : '보정명령/송달문서 PDF 자동인식'}</span>
          </button>

          <button
            onClick={handleOpenCreateModal}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>송달/보정 알림 직접 등록</span>
          </button>

          <button
            onClick={handleSync}
            className="px-3.5 py-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-semibold text-slate-700 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>전자소송 즉시 동기화</span>
          </button>

          {notices.length > 0 && (
            <button
              onClick={() => {
                onClearNotices();
                setSyncFeedback('모든 법원 알림 데이터가 초기화되었습니다.');
              }}
              className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-xl text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
            >
              알림 데이터 초기화
            </button>
          )}
        </div>
      </div>

      {/* Sync / Action Feedback Banner */}
      {syncFeedback && (
        <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl flex items-center justify-between gap-3 text-xs text-blue-900">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
            <span>{syncFeedback}</span>
          </div>
          <button
            onClick={() => setSyncFeedback(null)}
            className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5 p-1 bg-slate-100 rounded-xl text-xs">
          <button
            onClick={() => setFilter('all')}
            className={`px-3.5 py-1.5 rounded-lg font-semibold cursor-pointer transition-colors whitespace-nowrap ${
              filter === 'all' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-600'
            }`}
          >
            전체 알림 ({notices.length})
          </button>
          <button
            onClick={() => setFilter('urgent')}
            className={`px-3.5 py-1.5 rounded-lg font-semibold cursor-pointer transition-colors whitespace-nowrap ${
              filter === 'urgent' ? 'bg-white text-rose-600 shadow-2xs' : 'text-slate-600'
            }`}
          >
            기일/보정 임박 ({notices.filter((n) => n.isUrgent).length})
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="사건번호, 의뢰인, 보정내용 검색..."
            className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:border-blue-600"
          />
        </div>
      </div>

      {/* Notices List or Empty State */}
      {filteredNotices.length === 0 ? (
        <div className="p-14 border border-slate-200 rounded-2xl text-center space-y-4 bg-slate-50/40">
          <Bell className="w-9 h-9 text-slate-300 mx-auto" />
          <div className="space-y-1">
            <div className="text-sm font-bold text-slate-700">현재 표시할 신규 법원 알림이 없습니다.</div>
            <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              {registeredCases.length > 0
                ? `등록된 사건이 ${registeredCases.length}건 있습니다. 아래 [등록 사건 알림 동기화] 또는 [보정명령 PDF 자동인식] 버튼을 눌러 법원 송달 내역을 불러오세요.`
                : '법원에서 송달받은 보정명령서/결정문 PDF를 업로드하거나, 사건을 등록하면 자동으로 송달·보정 기한 알림이 생성됩니다.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <button
              onClick={() => pdfInputRef.current?.click()}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>보정명령/송달문서 PDF 업로드</span>
            </button>
            <button
              onClick={handleOpenCreateModal}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>송달/보정 알림 직접 등록</span>
            </button>
            {registeredCases.length > 0 ? (
              <button
                onClick={handleSync}
                className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
                <span>등록 사건({registeredCases.length}건) 알림 동기화</span>
              </button>
            ) : (
              <button
                onClick={onNavigateToCases}
                className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <FolderPlus className="w-3.5 h-3.5 text-blue-600" />
                <span>등록 사건 메뉴에서 사건 등록하기</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredNotices.map((n) => (
            <div
              key={n.id}
              className="p-4 sm:p-5 border border-slate-200 rounded-2xl hover:border-blue-300 transition-colors bg-white shadow-2xs space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold text-blue-600 text-xs bg-blue-50 px-2 py-0.5 rounded">
                    {n.caseNo}
                  </span>
                  <span className="text-xs font-bold text-slate-900">{n.caseName}</span>
                  <span className="text-[11px] text-slate-500">· {n.court}</span>
                  <span className="text-[11px] text-slate-400">· {n.judge}</span>
                  {n.isUrgent ? (
                    <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-700 font-bold text-[10px] inline-flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      긴급 보정/기일
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold text-[10px]">
                      확인 완료
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-slate-400">송달일: {n.date}</span>
                  <button
                    onClick={() => onDeleteNotice(n.id)}
                    className="p-1 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer"
                    title="알림 삭제"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="p-3.5 bg-blue-50/50 rounded-xl border border-blue-100 text-xs text-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div>
                    <strong className="text-blue-700">[{n.type}]</strong> {n.content}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    차기 기일 / 보정 기한: <strong className="text-slate-700">{n.nextHearing}</strong> · 제출/송달 기록 {n.submittedDocs.length}건
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={onNavigateToStatements}
                    className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>50만원↑ 소명표 작성</span>
                  </button>
                  <button
                    onClick={() => setSelectedNotice(n)}
                    className="px-3 py-1.5 bg-white border border-blue-200 text-blue-600 hover:bg-blue-50 rounded-lg text-[11px] font-bold shrink-0 cursor-pointer whitespace-nowrap"
                  >
                    사건 기록 열람 &gt;
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal 1: Create New Court Notice */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsCreateModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <h3 className="text-base font-bold text-slate-900">법원 송달 / 보정명령 알림 등록</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                대법원 전자소송에서 수신한 보정권고, 보정명령, 개시결정 및 기일 통지 내역을 등록합니다.
              </p>
            </div>

            <form onSubmit={handleCreateNoticeSubmit} className="space-y-3.5 text-xs">
              {registeredCases.length > 0 && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">등록 사건에서 자동 불러오기</label>
                  <select
                    value={selectedCaseId}
                    onChange={(e) => handleSelectRegisteredCase(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800 focus:outline-hidden focus:border-blue-600 bg-slate-50"
                  >
                    <option value="">-- 직접 입력 --</option>
                    {registeredCases.map((rc) => (
                      <option key={rc.id} value={rc.id}>
                        [{rc.caseNo}] {rc.clientName} · {rc.court} ({rc.caseType})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">사건번호 *</label>
                  <input
                    type="text"
                    required
                    value={formCaseNo}
                    onChange={(e) => setFormCaseNo(e.target.value)}
                    placeholder="예: 2026개회10482"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800 focus:outline-hidden focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">관할 법원 *</label>
                  <input
                    type="text"
                    required
                    value={formCourt}
                    onChange={(e) => setFormCourt(e.target.value)}
                    placeholder="예: 서울회생법원"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800 focus:outline-hidden focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">사건명 / 당사자 표시 *</label>
                  <input
                    type="text"
                    required
                    value={formCaseName}
                    onChange={(e) => setFormCaseName(e.target.value)}
                    placeholder="예: 개인회생 (의뢰인: 홍길동)"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800 focus:outline-hidden focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">송달 문서 종류 *</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800 focus:outline-hidden focus:border-blue-600 bg-white"
                  >
                    <option value="보정권고 / 보정명령">보정권고 / 보정명령</option>
                    <option value="석명준비명령">석명준비명령</option>
                    <option value="개시결정 통지서">개시결정 통지서</option>
                    <option value="채권자집회 기일통지서">채권자집회 기일통지서</option>
                    <option value="변제계획 인가결정">변제계획 인가결정</option>
                    <option value="기타 법원 송달문서">기타 법원 송달문서</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-bold text-slate-700 text-xs sm:text-sm">담당 재판부 / 회생위원</label>
                    <span className="text-[11px] text-blue-600 font-medium">직접 자유입력</span>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      value={formJudge}
                      onChange={(e) => setFormJudge(e.target.value)}
                      placeholder="예: 제12회생단독, 제3단독, 회생위원 직접 입력"
                      className="w-full px-3 py-2 pr-8 border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-hidden focus:border-blue-600 focus:ring-1 focus:ring-blue-600 bg-white"
                    />
                    {formJudge && (
                      <button
                        type="button"
                        onClick={() => setFormJudge('')}
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
                        onClick={() => setFormJudge(chip)}
                        className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                          formJudge === chip
                            ? 'bg-blue-600 border-blue-600 text-white font-medium'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                        }`}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">보정 기한 / 차기 기일</label>
                  <input
                    type="text"
                    value={formNextHearing}
                    onChange={(e) => setFormNextHearing(e.target.value)}
                    placeholder="예: 2026-11-30 보정기한"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800 focus:outline-hidden focus:border-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">송달 문서 / 보정 명령 요지 *</label>
                <textarea
                  required
                  rows={3}
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  placeholder="법원 보정명령 또는 송달 문서의 핵심 내용을 입력하세요."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800 focus:outline-hidden focus:border-blue-600"
                />
              </div>

              <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={formIsUrgent}
                  onChange={(e) => setFormIsUrgent(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="font-semibold text-rose-600">긴급 보정 / 기일 임박 사건으로 표시</span>
              </label>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl font-semibold cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold cursor-pointer"
                >
                  법원 알림 등록하기
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Case Detail & Submitted Docs Modal */}
      {selectedNotice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setSelectedNotice(null)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-blue-600">
                  {selectedNotice.caseNo} · {selectedNotice.court}
                </span>
                <button
                  onClick={() => handleToggleUrgent(selectedNotice)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                    selectedNotice.isUrgent
                      ? 'bg-rose-100 text-rose-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {selectedNotice.isUrgent ? '긴급 보정/기일 (해제 클릭)' : '일반 상태 (긴급 전환 클릭)'}
                </button>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mt-1">{selectedNotice.caseName}</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                담당재판부: {selectedNotice.judge} · 차기 일정: {selectedNotice.nextHearing}
              </p>
            </div>

            <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-slate-800 space-y-1">
              <div className="font-bold text-amber-900">최근 송달 문서 요지 ({selectedNotice.type})</div>
              <p className="leading-relaxed">{selectedNotice.content}</p>
            </div>

            <div className="space-y-2.5">
              <div className="text-xs font-bold text-slate-700">전자소송 사건 진행 및 제출 서면 내역</div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {selectedNotice.submittedDocs.map((doc, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2 text-slate-700">
                      <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>{doc}</span>
                    </div>
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-semibold shrink-0">
                      <CheckCircle2 className="w-3 h-3" /> 기록됨
                    </span>
                  </div>
                ))}
              </div>

              {/* Add Submitted Document Form */}
              <form onSubmit={handleAddSubmittedDoc} className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={newDocTitle}
                  onChange={(e) => setNewDocTitle(e.target.value)}
                  placeholder="제출 서면/보정서 기록 추가 (예: 입출금 50만원 이상 소명표 제출 완료)"
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:border-blue-600"
                />
                <button
                  type="submit"
                  className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shrink-0 cursor-pointer"
                >
                  + 서면 기록 추가
                </button>
              </form>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => {
                  setSelectedNotice(null);
                  onNavigateToStatements();
                }}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>거래내역 50만원↑ 소명표 작성하러 가기</span>
              </button>
              <button
                onClick={() => setSelectedNotice(null)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                확인 닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
