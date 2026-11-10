import React, { useState } from 'react';
import { Clock, FileText, CheckCircle2, FileSpreadsheet, Trash2, Search } from 'lucide-react';
import * as XLSX from 'xlsx';
import { StatementAuditResult } from '../types/legal';

export interface HistoryRecordItem {
  id: string;
  title: string;
  client: string;
  date: string;
  docType: 'statement' | 'contract';
  risk: 'critical' | 'high' | 'low';
  riskLabel: string;
  status: string;
  auditData?: StatementAuditResult;
}

export interface HistoryViewProps {
  onSelectDocument: (docId: string) => void;
  customRecords?: HistoryRecordItem[];
  onDeleteRecord?: (id: string) => void;
  onClearAllRecords?: () => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  onSelectDocument,
  customRecords = [],
  onDeleteRecord,
  onClearAllRecords,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [downloadedId, setDownloadedId] = useState<string | null>(null);

  const allRecords = customRecords.filter(
    (item) =>
      item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.client.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getExcelVisualWidth = (val: unknown): number => {
    if (val === null || val === undefined) return 0;
    const str = typeof val === 'number' ? val.toLocaleString('ko-KR') : String(val);
    let width = 0;
    for (const ch of str) {
      width += /[가-힣ㄱ-ㅎㅏ-ㅣ[^\x00-\x7F]]/.test(ch) ? 2.2 : 1.15;
    }
    return Math.ceil(width);
  };

  const handleDownloadExcel = (item: HistoryRecordItem) => {
    const wb = XLSX.utils.book_new();
    if (item.auditData && item.auditData.transactions.length > 0) {
      const baseThreshold = item.auditData.thresholdAmount || 500000;
      const over500kTxs = item.auditData.transactions.filter(
        (t) => t.amount >= (t.appliedThreshold && t.appliedThreshold > 0 ? t.appliedThreshold : baseThreshold)
      );

      const headers = [
        '연번',
        '거래일자',
        '구분(입출금/카드사용)',
        '거래/사용금액(원)',
        '거래 후 잔액',
        '거래처 및 적요',
        '금융기관 / 카드사',
        '소명 분류',
        '대출금 소명 사유 및 법원 제출 메모'
      ];

      const rows = [
        headers,
        ...over500kTxs.map((t, idx) => [
          idx + 1,
          t.date,
          t.sourceCategory === 'card'
            ? '카드 사용 (-)'
            : t.type === 'deposit'
            ? '입금 (+)'
            : '출금 (-)',
          t.amount,
          t.accountNumber.replace(/^잔액\s*/, ''),
          t.counterpart,
          t.bankName,
          t.categoryLabel,
          t.explanationNote || t.flagReason || ''
        ])
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);

      // Apply currency format (#,##0) to column D (index 3)
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:I1');
      for (let R = range.s.r + 1; R <= range.e.r; ++R) {
        const cellRef = XLSX.utils.encode_cell({ r: R, c: 3 });
        if (ws[cellRef] && typeof ws[cellRef].v === 'number') {
          ws[cellRef].z = '#,##0';
        }
      }

      const minWidths = [8, 15, 22, 20, 20, 34, 32, 18, 52];
      ws['!cols'] = headers.map((h, colIdx) => {
        let maxW = Math.max(minWidths[colIdx] || 16, getExcelVisualWidth(h) + 5);
        for (let rIdx = 1; rIdx < rows.length; rIdx++) {
          const w = getExcelVisualWidth(rows[rIdx][colIdx]) + 6;
          if (w > maxW) maxW = w;
        }
        const finalWch = Math.min(Math.max(maxW, minWidths[colIdx] || 16), 80);
        return { wch: finalWch, wpx: Math.round(finalWch * 8.5) };
      });

      ws['!rows'] = rows.map((_, rIdx) => ({ hpt: rIdx === 0 ? 26 : 22 }));
      XLSX.utils.book_append_sheet(wb, ws, '50만원이상_소명표');
    } else {
      const headers = ['문서명', '의뢰인', '분석일시', '진단결과', '상태'];
      const rows = [
        headers,
        [item.title, item.client, item.date, item.riskLabel, item.status]
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = headers.map((h, colIdx) => {
        const w = Math.max(getExcelVisualWidth(h) + 6, getExcelVisualWidth(rows[1][colIdx]) + 8, 18);
        return { wch: w, wpx: Math.round(w * 8.5) };
      });
      XLSX.utils.book_append_sheet(wb, ws, '분석요약보고서');
    }
    const safeClient = (item.client || '의뢰인').replace(/[\\/:*?"<>|]/g, '_');
    XLSX.writeFile(wb, `Lawbot_50만원이상_소명표_${safeClient}_${item.id.slice(0, 8)}.xlsx`);
    setDownloadedId(item.id);
    setTimeout(() => setDownloadedId(null), 2000);
  };

  return (
    <div className="flex-1 bg-white p-6 sm:p-8 max-w-6xl mx-auto space-y-6 overflow-y-auto w-full">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <Clock className="w-5 h-5 text-blue-600" />
          <h1 className="text-xl font-bold text-slate-900">분석 기록 보관함</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="문서명 또는 의뢰인 검색..."
              className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:border-blue-600"
            />
          </div>
          <div className="text-xs text-slate-500">
            총 <strong>{allRecords.length}건</strong> 보관 중
          </div>
          {customRecords.length > 0 && onClearAllRecords && (
            <button
              onClick={onClearAllRecords}
              className="px-2.5 py-1.5 text-xs text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl font-semibold flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>기록 전체 초기화</span>
            </button>
          )}
        </div>
      </div>

      <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
            <tr>
              <th className="py-3 px-4">문서명 / 다중 PDF 내역</th>
              <th className="py-3 px-4">의뢰인</th>
              <th className="py-3 px-4">분석 일시</th>
              <th className="py-3 px-4">추출 / 위험도 진단</th>
              <th className="py-3 px-4">상태</th>
              <th className="py-3 px-4 text-right">다운로드 / 관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {allRecords.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-16 text-center text-slate-400 space-y-1">
                  <div className="font-semibold text-slate-500">저장된 분석 기록이 없습니다.</div>
                  <div className="text-[11px]">거래내역서 또는 계약서를 업로드하여 분석하면 이곳에 기록이 자동 저장됩니다.</div>
                </td>
              </tr>
            ) : (
              allRecords.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3.5 px-4 font-medium text-slate-900 flex items-center gap-2">
                    {item.docType === 'statement' ? (
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                    )}
                    <span className="truncate max-w-sm">{item.title}</span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-600">{item.client}</td>
                  <td className="py-3.5 px-4 text-slate-500 font-mono">{item.date}</td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        item.risk === 'critical'
                          ? 'bg-rose-100 text-rose-700'
                          : item.risk === 'high'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {item.riskLabel}
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{item.status}</span>
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right space-x-1.5">
                    <button
                      onClick={() => onSelectDocument(item.id)}
                      className="px-2.5 py-1 text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg font-medium cursor-pointer"
                    >
                      열기
                    </button>
                    <button
                      onClick={() => handleDownloadExcel(item)}
                      className="px-2.5 py-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg font-semibold cursor-pointer"
                    >
                      {downloadedId === item.id ? '저장됨 ✓' : '엑셀(.xlsx)'}
                    </button>
                    {onDeleteRecord && (
                      <button
                        onClick={() => onDeleteRecord(item.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer align-middle"
                        title="기록 삭제"
                      >
                        <Trash2 className="w-3.5 h-3.5 inline" />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
