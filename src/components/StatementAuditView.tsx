import * as XLSX from 'xlsx';
import React, { useState } from 'react';
import {
  AlertTriangle,
  Download,
  FileSpreadsheet,
  Printer,
  Search,
  CheckCircle2,
  HelpCircle,
  TrendingDown,
  TrendingUp,
  ShieldAlert,
  Edit3,
  Check,
  RefreshCw,
  ExternalLink,
  Sparkles
} from 'lucide-react';
import { StatementAuditResult, TransactionItem } from '../types/legal';

interface StatementAuditViewProps {
  auditData: StatementAuditResult;
  threshold: number;
  onUpdateExplanation: (txId: string, note: string) => void;
  onOpenAssistant: (query: string) => void;
}

export const StatementAuditView: React.FC<StatementAuditViewProps> = ({
  auditData,
  threshold,
  onUpdateExplanation,
  onOpenAssistant,
}) => {
  const [filterTab, setFilterTab] = useState<'over500k' | 'flagged' | 'all' | 'loan' | 'preference' | 'crypto' | 'self'>('over500k');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempNote, setTempNote] = useState('');

  // 기준금액(은행 입출금 50만원 이상 / 카드 사용금액 50만원 이상) 거래 통계 산출
  const effectiveThreshold = threshold > 0 ? threshold : 500000;
  const getTxThreshold = (tx: TransactionItem) =>
    tx.appliedThreshold && tx.appliedThreshold > 0 ? tx.appliedThreshold : effectiveThreshold;
  const isOverThreshold = (tx: TransactionItem) => tx.amount >= getTxThreshold(tx);
  const over500kTxs = auditData.transactions.filter(isOverThreshold);
  const over500kCount = over500kTxs.length;
  const over500kTotalAmount = over500kTxs.reduce((sum, t) => sum + t.amount, 0);
  const over500kDepositAmount = over500kTxs
    .filter((t) => t.type === 'deposit')
    .reduce((sum, t) => sum + t.amount, 0);
  const over500kWithdrawalAmount = over500kTxs
    .filter((t) => t.type === 'withdrawal')
    .reduce((sum, t) => sum + t.amount, 0);

  // Filter transactions based on tab and search query
  // 'over500k' (default): 은행 입출금 50만원(기준금액) 이상, 카드 사용금액 50만원(기준금액) 이상만 표시
  const filteredTransactions = auditData.transactions.filter((tx) => {
    if (filterTab === 'over500k' && !isOverThreshold(tx)) return false;

    // Tab filter
    if (filterTab === 'flagged' && !tx.isFlagged) return false;
    if (filterTab === 'loan' && tx.category !== 'loan_disbursement') return false;
    if (filterTab === 'preference' && tx.category !== 'preference_payment') return false;
    if (filterTab === 'crypto' && tx.category !== 'gambling_crypto') return false;
    if (filterTab === 'self' && tx.category !== 'self_transfer') return false;

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchCounterpart = tx.counterpart.toLowerCase().includes(q);
      const matchBank = tx.bankName.toLowerCase().includes(q);
      const matchCat = tx.categoryLabel.toLowerCase().includes(q);
      const matchNote = (tx.explanationNote || '').toLowerCase().includes(q);
      if (!matchCounterpart && !matchBank && !matchCat && !matchNote) {
        return false;
      }
    }

    return true;
  });

  const handleStartEdit = (tx: TransactionItem) => {
    setEditingId(tx.id);
    setTempNote(tx.explanationNote || '');
  };

  const handleSaveEdit = (txId: string) => {
    onUpdateExplanation(txId, tempNote);
    setEditingId(null);
  };

  // Helper to measure visual character width in Excel (Korean/CJK = 2.2 width units, ASCII = 1.15 width units)
  const getExcelVisualWidth = (val: unknown): number => {
    if (val === null || val === undefined) return 0;
    const str = typeof val === 'number' ? val.toLocaleString('ko-KR') : String(val);
    let width = 0;
    for (const ch of str) {
      width += /[가-힣ㄱ-ㅎㅏ-ㅣ[^\x00-\x7F]]/.test(ch) ? 2.2 : 1.15;
    }
    return Math.ceil(width);
  };

  // Export native Microsoft Excel .xlsx file (SheetJS) — strictly ONLY 50만원(기준금액) 이상 transactions!
  const handleExportExcel = () => {
    const targetTxs = auditData.transactions.filter(isOverThreshold);

    const headers = [
      '연번',
      '거래일자',
      '구분(입출금/카드사용)',
      '거래/사용금액(원)',
      '거래 후 잔액',
      '거래처 및 적요',
      '금융기관 / 카드사',
      '소명 분류',
      '기준금액 충족',
      '법원 리스크 등급',
      '소명 상태',
      '대출금 소명 사유 및 법원 제출 메모'
    ];

    const dataRows = targetTxs.map((tx, idx) => {
      const txThreshMan = Math.round(getTxThreshold(tx) / 10000);
      return {
        '연번': idx + 1,
        '거래일자': tx.date,
        '구분(입출금/카드사용)':
          tx.sourceCategory === 'card'
            ? '카드 사용 (-)'
            : tx.type === 'deposit'
            ? '입금 (+)'
            : '출금 (-)',
        '거래/사용금액(원)': tx.amount,
        '거래 후 잔액': tx.accountNumber.replace(/^잔액\s*/, ''),
        '거래처 및 적요': tx.counterpart,
        '금융기관 / 카드사': tx.bankName,
        '소명 분류': tx.categoryLabel,
        '기준금액 충족': `${txThreshMan.toLocaleString()}만원 이상 (소명대상)`,
        '법원 리스크 등급':
          tx.courtRiskLevel === 'high'
            ? '고위험 (소명필수)'
            : tx.courtRiskLevel === 'medium'
            ? '중위험 (확인요망)'
            : '일반 정상',
        '소명 상태':
          tx.explanationStatus === 'needed'
            ? '소명 요망'
            : tx.explanationStatus === 'completed'
            ? '소명 작성완료'
            : '차감/제외',
        '대출금 소명 사유 및 법원 제출 메모': tx.explanationNote || tx.flagReason || ''
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataRows, { header: headers });

    // Apply currency number format (#,##0) to the '거래/사용금액(원)' column (Column D, index 3) so Excel never shows ### or raw unformatted digits
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:L1');
    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
      const amountCellRef = XLSX.utils.encode_cell({ r: R, c: 3 });
      if (worksheet[amountCellRef] && typeof worksheet[amountCellRef].v === 'number') {
        worksheet[amountCellRef].z = '#,##0';
      }
    }

    // Minimum column widths (in wch) + dynamic auto-fit across header and all rows (Korean-aware)
    const minWidths = [8, 15, 22, 20, 20, 34, 32, 18, 24, 20, 16, 52];
    worksheet['!cols'] = headers.map((h, colIdx) => {
      let maxW = Math.max(minWidths[colIdx] || 16, getExcelVisualWidth(h) + 5);
      for (const row of dataRows) {
        const cellVal = (row as Record<string, unknown>)[h];
        const w = getExcelVisualWidth(cellVal) + 6;
        if (w > maxW) maxW = w;
      }
      const finalWch = Math.min(Math.max(maxW, minWidths[colIdx] || 16), 80);
      return { wch: finalWch, wpx: Math.round(finalWch * 8.5) };
    });

    // Set comfortable row heights for header and data rows
    worksheet['!rows'] = [
      { hpt: 26 },
      ...dataRows.map(() => ({ hpt: 22 }))
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '입출금_카드_50만원이상_소명표');

    const safeClient = (auditData.clientName || '의뢰인').replace(/[\\/:*?"<>|]/g, '_');
    const fileName = `대출금소명표_50만원이상_${safeClient}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    XLSX.writeFile(workbook, fileName);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-5">
      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Stat 1: 50만원 이상 (소명 대상) */}
        <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/20">
          <div className="text-[11px] font-semibold text-blue-800">
            입출금·카드사용 {(effectiveThreshold / 10000).toLocaleString()}만원 이상
          </div>
          <div className="text-xl font-bold text-slate-900 mt-1">
            {over500kCount.toLocaleString()}건
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between gap-1">
            <span className="text-blue-600 font-medium">입금: ₩{Math.round(over500kDepositAmount / 10000).toLocaleString()}만</span>
            <span className="text-rose-600 font-medium">출금·카드: ₩{Math.round(over500kWithdrawalAmount / 10000).toLocaleString()}만</span>
          </div>
        </div>

        {/* Stat 2: Total extracted across all pages */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white">
          <div className="text-[11px] font-semibold text-slate-500">
            전체 원장 거래 건수 (전수)
          </div>
          <div className="text-xl font-bold text-slate-900 mt-1">
            {auditData.totalTransactionsCount.toLocaleString()}건
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            의뢰인 자가계좌 {auditData.selfTransferCount}건 자동 차감
          </div>
        </div>

        {/* Stat 3: Preference Payment */}
        <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/30">
          <div className="text-[11px] font-semibold text-amber-800 flex items-center justify-between">
            <span>편파변제 의심 (가족/친족)</span>
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <div className="text-xl font-bold text-amber-900 mt-1">
            {auditData.preferenceCount}건
          </div>
          <div className="text-[11px] text-amber-700 mt-1">
            합계 ₩{Math.round(auditData.preferenceAmount / 10000).toLocaleString()}만원 (소명 필수)
          </div>
        </div>

        {/* Stat 4: Crypto/Gambling */}
        <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/30">
          <div className="text-[11px] font-semibold text-rose-800 flex items-center justify-between">
            <span>사행성·가상화폐 지출</span>
            <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
          </div>
          <div className="text-xl font-bold text-rose-900 mt-1">
            {auditData.cryptoGamblingCount}건
          </div>
          <div className="text-[11px] text-rose-700 mt-1">
            합계 ₩{Math.round(auditData.cryptoGamblingAmount / 10000).toLocaleString()}만원 (법원 지적 1위)
          </div>
        </div>
      </div>

      {/* Dedicated 50만원 이상 엑셀 추출 배너 */}
      <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
            .XLSX
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-emerald-950 flex flex-wrap items-center gap-1.5">
              <span>은행 입출금 50만원 이상 · 카드 사용금액 50만원 이상 추출 완료</span>
              <span className="bg-emerald-200 text-emerald-800 text-[10px] font-bold px-1.5 py-0.2 rounded whitespace-nowrap">
                총 {over500kCount}건 추출됨
              </span>
            </div>
            <div className="text-[11px] text-emerald-800 mt-0.5">
              50만원 이상 거래금액 합계 ₩{Math.round(over500kTotalAmount / 10000).toLocaleString()}만원 (잔액 제외 순수 입출금·카드사용 50만원 이상만 엑셀에 저장됩니다)
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full lg:w-auto shrink-0">
          <button
            onClick={handleExportExcel}
            className="flex-1 lg:flex-none px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="w-4 h-4 shrink-0" />
            <span>📥 50만원 이상 엑셀 추출 (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* Action Bar: Filter tabs, search, excel download */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 pt-1">
        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            onClick={() => setFilterTab('over500k')}
            className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
              filterTab === 'over500k'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
            }`}
          >
            🎯 입출금·카드 50만원 이상만 보기 ({over500kCount}건)
          </button>
          <button
            onClick={() => setFilterTab('flagged')}
            className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
              filterTab === 'flagged'
                ? 'bg-rose-600 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            ⚠️ 법원 소명 대상만 ({auditData.transactions.filter(t => t.isFlagged).length}건)
          </button>
          <button
            onClick={() => setFilterTab('all')}
            className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
              filterTab === 'all'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            전체 내역 ({auditData.transactions.length}건)
          </button>
          <button
            onClick={() => setFilterTab('preference')}
            className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
              filterTab === 'preference'
                ? 'bg-amber-600 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            편파변제 ({auditData.preferenceCount}건)
          </button>
          <button
            onClick={() => setFilterTab('loan')}
            className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
              filterTab === 'loan'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            최근 대출금 ({auditData.recentLoanCount}건)
          </button>
          <button
            onClick={() => setFilterTab('crypto')}
            className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
              filterTab === 'crypto'
                ? 'bg-rose-600 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            사행성·코인 ({auditData.cryptoGamblingCount}건)
          </button>
          <button
            onClick={() => setFilterTab('self')}
            className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
              filterTab === 'self'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            자가이체 차감
          </button>
        </div>

        {/* Search & Export Buttons */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 shrink-0">
          <div className="relative flex-1 sm:flex-none">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="거래처/적요 검색 (예: 업비트, 어머니)"
              className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-blue-600 w-full sm:w-52"
            />
          </div>

          <button
            onClick={handleExportExcel}
            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs whitespace-nowrap shrink-0"
            title="입출금/카드사용 50만원 이상 거래만 엑셀(.xlsx)로 다운로드"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
            <span>50만원↑ 엑셀 저장</span>
          </button>

          <button
            onClick={handlePrint}
            className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            title="소명서 인쇄 및 PDF 저장"
          >
            <Printer className="w-3.5 h-3.5 shrink-0" />
            <span>인쇄 / PDF</span>
          </button>
        </div>
      </div>

      {/* Transaction Table */}
      <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <tr>
                <th className="py-2.5 px-3">일자</th>
                <th className="py-2.5 px-3">구분</th>
                <th className="py-2.5 px-3 text-right">거래/사용금액</th>
                <th className="py-2.5 px-3">거래처 / 적요</th>
                <th className="py-2.5 px-3">금융기관 / 거래 후 잔액</th>
                <th className="py-2.5 px-3">분류 태그</th>
                <th className="py-2.5 px-3">소명 상태</th>
                <th className="py-2.5 px-4 min-w-[240px]">대출금 소명 사유 / 법원 제출 메모</th>
                <th className="py-2.5 px-3 text-center">AI 자문</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    조건에 해당하는 거래내역이 없습니다. (50만원 미만 거래까지 모두 보시려면 위의 [전체 내역] 탭을 클릭하세요)
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => (
                  <tr
                    key={tx.id}
                    className={`hover:bg-slate-50/70 transition-colors ${
                      tx.isFlagged ? 'bg-rose-50/15' : ''
                    }`}
                  >
                    <td className="py-3 px-3 font-mono text-slate-600 text-[11px] whitespace-nowrap">
                      {tx.date}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      {tx.sourceCategory === 'card' ? (
                        <span className="inline-flex items-center gap-0.5 text-amber-700 font-bold text-[11px] bg-amber-50 px-1.5 py-0.5 rounded">
                          <TrendingDown className="w-3 h-3" />
                          <span>카드사용</span>
                        </span>
                      ) : tx.type === 'deposit' ? (
                        <span className="inline-flex items-center gap-0.5 text-blue-600 font-bold text-[11px] bg-blue-50 px-1.5 py-0.5 rounded">
                          <TrendingUp className="w-3 h-3" />
                          <span>입금</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-rose-600 font-bold text-[11px] bg-rose-50 px-1.5 py-0.5 rounded">
                          <TrendingDown className="w-3 h-3" />
                          <span>출금</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold whitespace-nowrap">
                      <span className={tx.type === 'deposit' ? 'text-blue-700' : 'text-slate-900'}>
                        {tx.type === 'deposit' ? '+' : '-'}₩{tx.amount.toLocaleString()}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-medium text-slate-900">
                      <div>{tx.counterpart}</div>
                      {tx.flagReason && (
                        <div className="text-[10px] text-rose-600 font-normal mt-0.5 line-clamp-1">
                          ⚠️ {tx.flagReason}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 text-slate-500 text-[11px] whitespace-nowrap">
                      <div>{tx.bankName}</div>
                      <div className="font-mono text-slate-400">{tx.accountNumber}</div>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          tx.category === 'preference_payment'
                            ? 'bg-amber-100 text-amber-800'
                            : tx.category === 'gambling_crypto'
                            ? 'bg-rose-100 text-rose-700'
                            : tx.category === 'loan_disbursement'
                            ? 'bg-indigo-100 text-indigo-800'
                            : tx.category === 'self_transfer'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {tx.categoryLabel}
                      </span>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      {tx.explanationStatus === 'needed' ? (
                        <span className="text-[11px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded">
                          소명 요망
                        </span>
                      ) : tx.explanationStatus === 'completed' ? (
                        <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded flex items-center gap-1 w-fit">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>작성완료</span>
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">자가차감</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {editingId === tx.id ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={tempNote}
                            onChange={(e) => setTempNote(e.target.value)}
                            placeholder="소명 사유 입력 (예: 부모님 수술비 대납, 물품대금 결제)"
                            className="flex-1 px-2.5 py-1 text-xs border border-blue-400 rounded-lg focus:outline-hidden"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit(tx.id);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                          />
                          <button
                            onClick={() => handleSaveEdit(tx.id)}
                            className="p-1 bg-blue-600 hover:bg-blue-700 text-white rounded cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div
                          onClick={() => handleStartEdit(tx)}
                          className="group flex items-center justify-between gap-2 p-1.5 rounded-lg hover:bg-slate-100/70 cursor-pointer text-xs"
                          title="클릭하여 소명 사유 수정/작성"
                        >
                          <span
                            className={
                              tx.explanationNote
                                ? 'text-slate-800'
                                : 'text-slate-400 italic text-[11px]'
                            }
                          >
                            {tx.explanationNote || '클릭하여 법원 제출용 소명 사유 작성...'}
                          </span>
                          <Edit3 className="w-3 h-3 text-slate-300 group-hover:text-blue-600 shrink-0" />
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      <button
                        onClick={() =>
                          onOpenAssistant(
                            `의뢰인 김은진의 ${tx.date} 거래내역: "${tx.counterpart} (금액: ₩${tx.amount.toLocaleString()}원, 분류: ${tx.categoryLabel})"에 대해 개인회생 법원 소명서 작성 요령과 부인권/청산가치 산입 방어 판례를 알려주세요.`
                          )
                        }
                        className="px-2 py-1 text-[11px] font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg cursor-pointer transition-colors"
                      >
                        판례조회
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
