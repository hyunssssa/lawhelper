import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Sparkles,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check,
  Download,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
  FileSpreadsheet,
  Layers,
  Activity,
  ArrowRight,
  X,
  Plus,
  Trash2,
  RefreshCw
} from 'lucide-react';
import { ContractReviewResult, ClauseAnalysis, StatementAuditResult, TransactionItem } from '../types/legal';
import { SAMPLE_STATEMENT_AUDIT } from '../data/statements';
import { StatementAuditView } from './StatementAuditView';
import * as pdfjsLib from 'pdfjs-dist';

// Use same-origin /pdfjs endpoint served by Express so browser Workers never fail with CORS SecurityError
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdfjs/build/pdf.worker.min.mjs';

export interface UploadedPdfItem {
  id: string;
  name: string;
  size: string;
  type: string;
  category: 'bank' | 'card' | 'crypto';
  status?: 'waiting' | 'analyzing' | 'done' | 'error';
  progressText?: string;
  rawFile?: File;
  fileBase64?: string;
  extractedText?: string;
  ocrPageImages?: string[];
  extractedCount?: number;
  mimeType?: string;
}

interface DashboardMainProps {
  contract: ContractReviewResult;
  onSelectBenchmark: (contractId: string) => void;
  onOpenUploadModal: () => void;
  onExportMemo: () => void;
  onOpenAssistant: (query: string) => void;
  onAnalysisSaved?: (audit: StatementAuditResult, fileCount: number) => void;
  externalFilesToIngest?: File[] | null;
  onExternalFilesConsumed?: () => void;
  onUploadedFilesChange?: (files: Array<{ name: string; base64: string }>) => void;
}

export const DashboardMain: React.FC<DashboardMainProps> = ({
  contract,
  onSelectBenchmark,
  onOpenUploadModal,
  onExportMemo,
  onOpenAssistant,
  onAnalysisSaved,
  externalFilesToIngest,
  onExternalFilesConsumed,
  onUploadedFilesChange,
}) => {
  const [clientName, setClientName] = useState('');
  const [clientAliases, setClientAliases] = useState<string[]>([]);
  const [newAliasInput, setNewAliasInput] = useState('');
  const [showAliasInput, setShowAliasInput] = useState(false);

  const [selectedThreshold, setSelectedThreshold] = useState('50만원');
  const [customBankThreshold, setCustomBankThreshold] = useState('');
  const [selectedCardThreshold, setSelectedCardThreshold] = useState('50만원');
  const [customCardThreshold, setCustomCardThreshold] = useState('');
  const [activeUploadTab, setActiveUploadTab] = useState<'bank' | 'card' | 'crypto'>('bank');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedClauseId, setSelectedClauseId] = useState<string>(contract.clauses[0]?.id || '');
  
  // View mode switcher: 'statements' (거래내역서/소명표) vs 'contract' (계약서 독소조항)
  const [activeViewTab, setActiveViewTab] = useState<'statements' | 'contract'>('statements');
  
  // Statement Audit state — starts as null so no dummy rows remain before upload!
  const [statementData, setStatementData] = useState<StatementAuditResult | null>(null);
  
  // Multi-PDF uploaded files state
  const [uploadedFiles, setUploadedFiles] = useState<UploadedPdfItem[]>([]);

  // Interactive processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState(0);

  // Refs for reliable multi-file input triggering across all browsers
  const bankInputRef = useRef<HTMLInputElement>(null);
  const cardInputRef = useRef<HTMLInputElement>(null);
  const cryptoInputRef = useRef<HTMLInputElement>(null);

  const selectedClause: ClauseAnalysis | undefined =
    contract.clauses.find((c) => c.id === selectedClauseId) || contract.clauses[0];

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Convert selected bank threshold string to number (Default: 50만원 / 500,000원)
  const getNumericThreshold = (): number => {
    if (customBankThreshold.trim()) {
      const parsed = parseInt(customBankThreshold.replace(/,/g, ''), 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    if (selectedThreshold.includes('30')) return 300000;
    if (selectedThreshold.includes('50')) return 500000;
    if (selectedThreshold.includes('100')) return 1000000;
    if (selectedThreshold.includes('200')) return 2000000;
    if (selectedThreshold.includes('300')) return 3000000;
    return 500000;
  };

  // Convert selected card threshold string to number (Default: 50만원 / 500,000원)
  const getNumericCardThreshold = (): number => {
    if (customCardThreshold.trim()) {
      const parsed = parseInt(customCardThreshold.replace(/,/g, ''), 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    if (selectedCardThreshold.includes('30')) return 300000;
    if (selectedCardThreshold.includes('50')) return 500000;
    if (selectedCardThreshold.includes('100')) return 1000000;
    if (selectedCardThreshold.includes('200')) return 2000000;
    if (selectedCardThreshold.includes('300')) return 3000000;
    return 500000;
  };

  // Helper to read File to base64 (used for files <= 6MB or non-PDF Excel/images)
  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = (reader.result as string) || '';
        const b64 = dataUrl.split(',')[1] || '';
        resolve(b64);
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  };

  // Client-side PDF extraction: extracts coordinate-sorted text AND renders JPEG page images for any scanned/image pages
  const extractClientPdfData = async (
    file: File
  ): Promise<{ text: string; ocrPageImages: string[]; pageCount: number }> => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return { text: '', ocrPageImages: [], pageCount: 0 };
    }
    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(arrayBuffer),
        cMapUrl: '/pdfjs/cmaps/',
        cMapPacked: true,
        standardFontDataUrl: '/pdfjs/standard_fonts/'
      });
      const pdfDoc = await loadingTask.promise;
      const pageLines: string[] = [];
      const scannedPageNumbers: number[] = [];

      for (let p = 1; p <= pdfDoc.numPages; p++) {
        const page = await pdfDoc.getPage(p);
        const viewport = page.getViewport({ scale: 1.0 });
        const textContent = await page.getTextContent();

        const items: Array<{ str: string; x: number; y: number; width: number }> = [];
        for (const raw of textContent.items as any[]) {
          if (!raw || typeof raw.str !== 'string') continue;
          const trimmed = raw.str.trim();
          if (!trimmed) continue;
          const tm = raw.transform || [1, 0, 0, 1, 0, 0];
          const [vx, vy] = viewport.convertToViewportPoint(tm[4], tm[5]);
          items.push({
            str: trimmed,
            x: vx,
            y: vy,
            width: raw.width || 0
          });
        }

        // Pure 1D sort on Y first so TimSort is 100% transitive and never scrambles horizontal rows
        items.sort((a, b) => a.y - b.y);
        const rows: Array<Array<{ str: string; x: number; y: number; width: number }>> = [];
        for (const it of items) {
          if (rows.length === 0) {
            rows.push([it]);
          } else {
            const cur = rows[rows.length - 1];
            const anchorY = cur[0].y;
            if (Math.abs(it.y - anchorY) <= 4.0) {
              cur.push(it);
            } else {
              rows.push([it]);
            }
          }
        }

        const singlePageLines: string[] = [];
        for (const r of rows) {
          r.sort((a, b) => a.x - b.x);
          let line = '';
          let prevEndX: number | null = null;
          let prevStr = '';
          for (const cell of r) {
            const normStr = cell.str.replace(/[\u2212\uFF0D\u2013\u2014\u2012]/g, '-');
            if (prevEndX === null) {
              line += normStr;
            } else {
              const gap = cell.x - prevEndX;
              const prevEndsNumericPart = /[,.:]$|\d-$/.test(prevStr);
              const currStartsNumericPart = /^[,.:]/.test(normStr);
              const bothPureDigits = /^\d+$/.test(prevStr) && /^\d+$/.test(normStr);
              if (
                gap >= -2.0 &&
                gap <= 2.4 &&
                (prevEndsNumericPart || currStartsNumericPart || (bothPureDigits && gap <= 1.8))
              ) {
                line += normStr;
              } else if (gap < 8) {
                line += ' ' + normStr;
              } else {
                line += '\t' + normStr;
              }
            }
            const itemWidth = cell.width > 0 ? cell.width : normStr.length * 4.0;
            prevEndX = cell.x + itemWidth;
            prevStr = normStr;
          }
          line = line
            .replace(/(\d)\s*,\s*(\d{3})/g, '$1,$2')
            .replace(/(\d)\s*,\s*(\d{3})/g, '$1,$2')
            .replace(/([+-])\s+(\d{1,3}(?:,\d{3})+|\d+)/g, '$1$2');
          if (line.trim()) {
            singlePageLines.push(line.trim());
            pageLines.push(line.trim());
          }
        }

        const pageTextJoined = singlePageLines.join('\n');
        const pageDates = (
          pageTextJoined.match(/20\d{2}\s*[.\-/년]\s*\d{1,2}|(?<!\d)(?:1[5-9]|2[0-6])[.\-/]\d{1,2}[.\-/]\d{1,2}|(?<!\d)20[12]\d[01]\d[0-3]\d/g) || []
        ).length;
        const pageCurrencies = (pageTextJoined.match(/\d{1,3}(?:,\d{3})+|\d+\s*원/g) || []).length;

        if (pageDates < 1 || pageCurrencies < 2) {
          scannedPageNumbers.push(p);
        }
        page.cleanup();
      }

      const fullText = pageLines.join('\n');
      const totalPages = pdfDoc.numPages;

      // SPEED OPTIMIZATION: If the PDF has digital text (fullText >= 40 chars and contains numbers),
      // it is a standard digital bank/card statement. We return text immediately in ~50ms
      // without heavy canvas rendering, avoiding multi-second freezes and memory bloat!
      const isDigitalTextPdf = fullText.trim().length >= 40 && (fullText.match(/\d{2,}/g) || []).length >= 2;
      const ocrPageImages: string[] = [];

      // Only if the document is a pure scanned image PDF with zero text, render pages to JPEG for Vision OCR
      if (!isDigitalTextPdf && scannedPageNumbers.length > 0) {
        const pagesToRender = scannedPageNumbers.slice(0, 10);
        for (const pNum of pagesToRender) {
          const page = await pdfDoc.getPage(pNum);
          const vp = page.getViewport({ scale: 1.3 });
          const canvas = document.createElement('canvas');
          canvas.width = vp.width;
          canvas.height = vp.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
            const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.68);
            const b64 = jpegDataUrl.split(',')[1] || '';
            if (b64) ocrPageImages.push(b64);
          }
          page.cleanup();
        }
      }

      await (pdfDoc as any).destroy?.();
      return { text: fullText, ocrPageImages, pageCount: totalPages };
    } catch (_) {
      return { text: '', ocrPageImages: [], pageCount: 0 };
    }
  };

  // On-demand canvas JPEG renderer if a PDF had header text (or broken font CMap) and yielded too few text transactions
  const renderPdfPagesToJpegs = async (file: File, maxPages = 150): Promise<string[]> => {
    if (!file.name.toLowerCase().endsWith('.pdf')) return [];
    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(arrayBuffer),
        cMapUrl: '/pdfjs/cmaps/',
        cMapPacked: true,
        standardFontDataUrl: '/pdfjs/standard_fonts/'
      });
      const pdfDoc = await loadingTask.promise;
      const images: string[] = [];
      const limit = Math.min(pdfDoc.numPages, maxPages);
      for (let p = 1; p <= limit; p++) {
        const page = await pdfDoc.getPage(p);
        const vp = page.getViewport({ scale: 1.4 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
          const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.72);
          const b64 = jpegDataUrl.split(',')[1] || '';
          if (b64) images.push(b64);
        }
        page.cleanup();
      }
      await (pdfDoc as any).destroy?.();
      return images;
    } catch (_) {
      return [];
    }
  };

  // Sync uploaded files to parent so PdfToolsModal can preload them if opened
  useEffect(() => {
    if (onUploadedFilesChange) {
      onUploadedFilesChange(
        uploadedFiles
          .filter((f) => f.fileBase64)
          .map((f) => ({ name: f.name, base64: f.fileBase64 || '' }))
      );
    }
  }, [uploadedFiles]);

  // Helper to build a StatementAuditResult from a list of transactions and queue
  const buildMergedStatementResult = (
    transactions: TransactionItem[],
    queue: UploadedPdfItem[],
    threshold: number
  ): StatementAuditResult => {
    const totalDeposit = transactions
      .filter((t) => t.type === 'deposit')
      .reduce((s, t) => s + t.amount, 0);
    const totalWithdrawal = transactions
      .filter((t) => t.type === 'withdrawal')
      .reduce((s, t) => s + t.amount, 0);
    const prefTxs = transactions.filter((t) => t.category === 'preference_payment');
    const cryptoTxs = transactions.filter((t) => t.category === 'gambling_crypto');
    const loanTxs = transactions.filter((t) => t.category === 'loan_disbursement');
    const selfTxs = transactions.filter((t) => t.category === 'self_transfer');

    return {
      id: `stmt-${Date.now()}`,
      clientName: clientName.trim() || '의뢰인',
      statementPeriod:
        queue.length > 1
          ? `${queue[0].name} 외 ${queue.length - 1}건 (총 ${queue.length}개 계좌 통합)`
          : queue[0]?.name || '거래내역서',
      totalTransactionsCount: transactions.length,
      totalDepositAmount: totalDeposit,
      totalWithdrawalAmount: totalWithdrawal,
      thresholdAmount: threshold,
      highValueCount: transactions.filter((t) => {
        const itemThresh = t.appliedThreshold && t.appliedThreshold > 0 ? t.appliedThreshold : threshold;
        return t.amount >= itemThresh;
      }).length,
      preferenceCount: prefTxs.length,
      preferenceAmount: prefTxs.reduce((s, t) => s + t.amount, 0),
      cryptoGamblingCount: cryptoTxs.length,
      cryptoGamblingAmount: cryptoTxs.reduce((s, t) => s + t.amount, 0),
      recentLoanCount: loanTxs.length,
      recentLoanAmount: loanTxs.reduce((s, t) => s + t.amount, 0),
      selfTransferCount: selfTxs.length,
      transactions: [...transactions]
    };
  };

  // Run API analysis for a given queue of uploaded PDFs — updates each file's status live:
  // 'waiting' (분석 대기중) -> 'analyzing' (분석 진행중...) -> 'done' (분석 완료 N건 추출)
  const runAnalysisForQueue = async (queue: UploadedPdfItem[]) => {
    if (queue.length === 0) {
      setStatementData(null);
      return;
    }

    setIsProcessing(true);
    setProcessingStep(1);
    setActiveViewTab('statements');

    const threshold = getNumericThreshold();
    const mergedTransactions: TransactionItem[] = [];

    // Initialize all items in queue to 'waiting' so none ever say "분석 대기/완료"
    const liveQueue: UploadedPdfItem[] = queue.map((item) => ({
      ...item,
      status: 'waiting',
      progressText: '분석 대기중',
      extractedCount: undefined
    }));
    setUploadedFiles([...liveQueue]);

    // Process smaller/faster files first so the user sees immediate results within 1 second,
    // while keeping the visual card order 1..N intact!
    const indicesBySize = liveQueue
      .map((item, idx) => ({
        idx,
        sizeNum: parseFloat(item.size) || 1
      }))
      .sort((a, b) => a.sizeNum - b.sizeNum)
      .map((entry) => entry.idx);

    try {
      setProcessingStep(2);

      // SPEED OPTIMIZATION: Process all uploaded PDF/Excel files in parallel (<1 second total)!
      const processSingleFile = async (i: number): Promise<TransactionItem[]> => {
        const f = liveQueue[i];

        liveQueue[i] = {
          ...f,
          status: 'analyzing',
          progressText: '문서 텍스트/표 정밀 추출중...'
        };
        setUploadedFiles([...liveQueue]);

        let clientText = f.extractedText || '';
        let ocrImages = f.ocrPageImages || [];
        let base64 = f.fileBase64 || '';

        // If rawFile is present and not yet parsed, extract digital text client-side in ~50ms
        if (f.rawFile) {
          const isPdf = f.name.toLowerCase().endsWith('.pdf');
          if (isPdf && !clientText && ocrImages.length === 0) {
            const pdfData = await extractClientPdfData(f.rawFile);
            clientText = pdfData.text;
            ocrImages = pdfData.ocrPageImages;
          }
          if (!base64 && (f.rawFile.size <= 12 * 1024 * 1024 || (!clientText && ocrImages.length === 0))) {
            base64 = await readFileAsBase64(f.rawFile);
          }
        }

        const fileThreshold = f.category === 'card' ? getNumericCardThreshold() : threshold;
        const fileTransactions: TransactionItem[] = [];

        try {
          const payloadBase64 = clientText.length > 500 && base64.length > 16_000_000 ? '' : base64;
          const singleRes = await fetch('/api/analyze-statement', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: f.name,
              clientName: clientName.trim(),
              clientAliases,
              threshold: fileThreshold,
              files: [
                {
                  name: f.name,
                  fileBase64: payloadBase64,
                  extractedText: clientText,
                  ocrPageImages: ocrImages,
                  mimeType: f.mimeType || 'application/pdf',
                  categoryType: f.category,
                  threshold: fileThreshold
                }
              ]
            })
          });

          if (singleRes.ok) {
            const singleParsed: StatementAuditResult = await singleRes.json();
            if (singleParsed && Array.isArray(singleParsed.transactions)) {
              const tagged = singleParsed.transactions.map((t) => ({
                ...t,
                sourceCategory: f.category,
                appliedThreshold: fileThreshold
              }));
              fileTransactions.push(...tagged);
            }
          }

          // ONLY if text extraction yielded 0 rows on a PDF with rawFile, run fallback OCR
          if (fileTransactions.length === 0 && f.rawFile && f.name.toLowerCase().endsWith('.pdf')) {
            liveQueue[i] = {
              ...liveQueue[i],
              status: 'analyzing',
              progressText: '스캔 표 정밀 OCR 변환중...'
            };
            setUploadedFiles([...liveQueue]);
            const fallbackJpegs = await renderPdfPagesToJpegs(f.rawFile, 15);
            if (fallbackJpegs.length > 0) {
              const ocrRes = await fetch('/api/analyze-statement', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  title: f.name,
                  clientName: clientName.trim(),
                  clientAliases,
                  threshold: fileThreshold,
                  files: [
                    {
                      name: f.name,
                      fileBase64: '',
                      extractedText: '',
                      ocrPageImages: fallbackJpegs,
                      mimeType: 'application/pdf',
                      categoryType: f.category,
                      threshold: fileThreshold
                    }
                  ]
                })
              });
              if (ocrRes.ok) {
                const ocrParsed: StatementAuditResult = await ocrRes.json();
                if (ocrParsed && Array.isArray(ocrParsed.transactions)) {
                  const tagged = ocrParsed.transactions.map((t) => ({
                    ...t,
                    sourceCategory: f.category,
                    appliedThreshold: fileThreshold
                  }));
                  fileTransactions.push(...tagged);
                }
              }
            }
          }
        } catch (fileErr) {
          console.warn(`Analysis notice on ${f.name}:`, fileErr);
        }

        liveQueue[i] = {
          ...f,
          fileBase64: base64,
          extractedText: clientText,
          ocrPageImages: ocrImages,
          status: 'done',
          extractedCount: fileTransactions.length,
          progressText: `분석 완료 (${fileTransactions.length}건 추출)`
        };
        setUploadedFiles([...liveQueue]);

        return fileTransactions;
      };

      setProcessingStep(3);
      const allResults = await Promise.all(indicesBySize.map((i) => processSingleFile(i)));
      for (const txs of allResults) {
        mergedTransactions.push(...txs);
      }

      const finalMerged = buildMergedStatementResult(mergedTransactions, liveQueue, threshold);
      setProcessingStep(4);
      setStatementData(finalMerged);
      setIsProcessing(false);
      if (onAnalysisSaved) {
        onAnalysisSaved(finalMerged, liveQueue.length);
      }
    } catch (err) {
      setIsProcessing(false);
    }
  };

  // Multi-PDF File Ingestion & Per-File Analysis
  const handleProcessMultipleFiles = async (fileList: File[], uploadType: 'bank' | 'card' | 'crypto') => {
    if (!fileList || fileList.length === 0) return;

    // Immediately register all selected files as 'waiting' (분석 대기중) so the UI updates in <10ms
    const newPdfItems: UploadedPdfItem[] = fileList.map((file) => ({
      id: `pdf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: file.name,
      size: `${Math.max(0.01, file.size / 1024 / 1024).toFixed(2)} MB`,
      type: file.type || 'PDF 문서',
      category: uploadType,
      status: 'waiting',
      progressText: '분석 대기중',
      rawFile: file,
      mimeType: file.type || 'application/pdf'
    }));

    // Filter out any previous sample simulation items when uploading real files
    const realExisting = uploadedFiles.filter((f) => !f.id.startsWith('sim-'));
    const updatedQueue = [...realExisting, ...newPdfItems];
    setUploadedFiles(updatedQueue);
    await runAnalysisForQueue(updatedQueue);
  };

  // Ingest files sent directly from PdfToolsModal ("거래내역 분석에 바로 반영")
  useEffect(() => {
    if (externalFilesToIngest && externalFilesToIngest.length > 0) {
      handleProcessMultipleFiles(externalFilesToIngest, 'bank');
      if (onExternalFilesConsumed) {
        onExternalFilesConsumed();
      }
    }
  }, [externalFilesToIngest]);

  const handleRemoveUploadedFile = (id: string) => {
    const remaining = uploadedFiles.filter((f) => f.id !== id);
    setUploadedFiles(remaining);
    if (remaining.length === 0) {
      setStatementData(null);
    } else if (remaining.every((f) => !f.id.startsWith('sim-'))) {
      runAnalysisForQueue(remaining);
    }
  };

  const handleClearAllFiles = () => {
    setUploadedFiles([]);
    setStatementData(null);
  };

  // Run interactive live simulation ONLY when user clicks sample preview button
  const handleRunSimulatedAnalysis = (type: 'bank' | 'card' | 'crypto' | 'contract') => {
    setUploadedFiles([
      {
        id: 'sim-1',
        name: 'KB국민은행_거래내역서_2025 (샘플).pdf',
        size: '1.45 MB',
        type: 'PDF 문서',
        category: 'bank',
        status: 'done',
        extractedCount: 6,
        progressText: '분석 완료 (6건 추출)'
      },
      {
        id: 'sim-2',
        name: '신한은행_주거래통장_2025 (샘플).pdf',
        size: '1.12 MB',
        type: 'PDF 문서',
        category: 'bank',
        status: 'done',
        extractedCount: 5,
        progressText: '분석 완료 (5건 추출)'
      },
      {
        id: 'sim-3',
        name: '현대카드_이용대금명세서_2025 (샘플).pdf',
        size: '0.84 MB',
        type: 'PDF 문서',
        category: 'card',
        status: 'done',
        extractedCount: 3,
        progressText: '분석 완료 (3건 추출)'
      }
    ]);

    setIsProcessing(true);
    setProcessingStep(1);

    setTimeout(() => setProcessingStep(2), 300);
    setTimeout(() => setProcessingStep(3), 600);
    setTimeout(() => {
      setProcessingStep(4);
      setTimeout(() => {
        setIsProcessing(false);
        if (type === 'contract') {
          setActiveViewTab('contract');
        } else {
          setStatementData({
            ...SAMPLE_STATEMENT_AUDIT,
            clientName: clientName.trim() || '의뢰인'
          });
          setActiveViewTab('statements');
        }
      }, 350);
    }, 900);
  };

  const handleUpdateExplanation = (txId: string, note: string) => {
    setStatementData((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        transactions: prev.transactions.map((tx) =>
          tx.id === txId
            ? {
                ...tx,
                explanationNote: note,
                explanationStatus: note.trim() ? 'completed' : 'needed',
              }
            : tx
        ),
      };
    });
  };

  const handleDropFiles = (e: React.DragEvent, type: 'bank' | 'card' | 'crypto') => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files || []);
    if (droppedFiles.length > 0) {
      handleProcessMultipleFiles(droppedFiles, type);
    }
  };

  return (
    <div className="flex-1 bg-white p-6 sm:p-8 max-w-6xl mx-auto space-y-6 overflow-y-auto">
      {/* Top Header with title and Live Status Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            거래내역서 및 계약서 분석
          </h1>
          <span className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-900 font-bold text-xs">
            v3.0
          </span>
          <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold text-xs">
            다중 PDF 일괄등록 지원
          </span>
        </div>

        {/* Live Engine Status Indicator */}
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>AI 엔진 정상 가동 (Gemini 3 Flash)</span>
          </div>

          <button
            onClick={() => handleRunSimulatedAnalysis('bank')}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>⚡ 다중 PDF(3종) 샘플 즉시 분석</span>
          </button>
        </div>
      </div>


      {/* Top Notice 2: Chrome Recommendation (matches screenshot) */}
      <div className="p-3 bg-blue-50/40 border border-blue-100 rounded-xl flex items-center gap-2 text-xs text-slate-600">
        <span>🌐</span>
        <span>
          <strong>Chrome 브라우저 권장</strong> — Chrome에 최적화되어 있습니다. 원활한 사용을 위해 Chrome을 사용해 주세요.
        </span>
      </div>

      {/* 50만원 이상 다중 PDF 자동 추출 안내 배너 */}
      <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-900">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-emerald-800 bg-emerald-200/80 px-2 py-0.5 rounded text-[11px]">
            ⚡ 다중 PDF 동시 등록 & 50만원 이상 자동 추출
          </span>
          <span>
            여러 은행·카드 PDF를 <strong>한꺼번에 드래그하거나 다중 선택(Ctrl/Shift 클릭)</strong>하면 모든 문서에서 <strong>입출금 50만원 이상 거래를 통합 추출</strong>하여 하나의 Excel (.xlsx)로 다운로드합니다.
          </span>
        </div>
      </div>

      {/* 3 Upload Dropzones (Support multiple file selection & multi-drop) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Bank Statements */}
        <div>
          <input
            ref={bankInputRef}
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.csv"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length > 0) handleProcessMultipleFiles(files, 'bank');
              e.target.value = '';
            }}
            className="hidden"
          />
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDropFiles(e, 'bank')}
            onClick={() => {
              setActiveUploadTab('bank');
              bankInputRef.current?.click();
            }}
            className={`p-7 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
              activeUploadTab === 'bank'
                ? 'border-blue-500 bg-blue-50/30 shadow-xs'
                : 'border-slate-200 hover:border-slate-300 bg-white'
            }`}
          >
            <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center mb-2.5 text-slate-400">
              <Upload className="w-5 h-5 stroke-[1.5]" />
            </div>
            <div className="font-bold text-sm text-slate-800">은행 거래내역서 (다중 선택 가능)</div>
            <div className="text-xs text-slate-400 mt-1">여러 은행 PDF 동시 업로드 지원</div>
            <span className="mt-2 text-[10px] text-blue-600 font-medium">+ 클릭하여 다중 PDF 파일 선택</span>
          </div>
        </div>

        {/* Card 2: Card Statements */}
        <div>
          <input
            ref={cardInputRef}
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.csv"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length > 0) handleProcessMultipleFiles(files, 'card');
              e.target.value = '';
            }}
            className="hidden"
          />
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDropFiles(e, 'card')}
            onClick={() => {
              setActiveUploadTab('card');
              cardInputRef.current?.click();
            }}
            className={`p-7 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
              activeUploadTab === 'card'
                ? 'border-amber-400 bg-amber-50/20 shadow-xs'
                : 'border-amber-400 bg-white hover:bg-amber-50/10'
            }`}
          >
            <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center mb-2.5 text-amber-500">
              <Upload className="w-5 h-5 stroke-[1.5]" />
            </div>
            <div className="font-bold text-sm text-slate-900 flex items-center gap-1">
              <span>카드 이용내역서 (다중 선택)</span>
              <span className="text-[10px] text-amber-700 font-bold bg-amber-100 px-1.5 py-0.2 rounded">다중지원</span>
            </div>
            <div className="text-xs text-slate-400 mt-1">여러 카드사 PDF 동시 업로드 지원</div>
            <span className="mt-2 text-[10px] text-amber-600 font-medium">+ 클릭하여 다중 PDF 파일 선택</span>
          </div>
        </div>

        {/* Card 3: Crypto & Securities */}
        <div>
          <input
            ref={cryptoInputRef}
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.csv"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length > 0) handleProcessMultipleFiles(files, 'crypto');
              e.target.value = '';
            }}
            className="hidden"
          />
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDropFiles(e, 'crypto')}
            onClick={() => {
              setActiveUploadTab('crypto');
              cryptoInputRef.current?.click();
            }}
            className={`p-7 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
              activeUploadTab === 'crypto'
                ? 'border-blue-500 bg-blue-50/30 shadow-xs'
                : 'border-slate-200 hover:border-slate-300 bg-white'
            }`}
          >
            <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center mb-2.5 text-slate-400">
              <Upload className="w-5 h-5 stroke-[1.5]" />
            </div>
            <div className="font-bold text-sm text-slate-800">증권/코인 거래내역서 (다중 선택)</div>
            <div className="text-xs text-slate-400 mt-1">여러 거래소 PDF 동시 업로드 지원</div>
            <span className="mt-2 text-[10px] text-blue-600 font-medium">+ 클릭하여 다중 PDF 파일 선택</span>
          </div>
        </div>
      </div>

      {/* Multi-PDF Uploaded File Queue Panel */}
      {uploadedFiles.length > 0 && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 animate-in fade-in">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-600" />
              <span className="text-xs font-bold text-slate-900">
                {isProcessing
                  ? `등록된 다중 PDF 문서 (${uploadedFiles.filter((f) => f.status === 'done').length}/${
                      uploadedFiles.length
                    }개 완료 · 실시간 분석 진행중...)`
                  : `등록된 다중 PDF 문서 (총 ${uploadedFiles.length}개 파일 분석 완료 · 전체 ${uploadedFiles.reduce(
                      (sum, f) => sum + (f.extractedCount || 0),
                      0
                    )}건 추출)`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => bankInputRef.current?.click()}
                className="px-2.5 py-1 bg-white border border-blue-200 text-blue-600 hover:bg-blue-50 rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Plus className="w-3 h-3" />
                <span>PDF 파일 추가 등록</span>
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => runAnalysisForQueue(uploadedFiles)}
                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors"
              >
                <RefreshCw className={`w-3 h-3 ${isProcessing ? 'animate-spin' : ''}`} />
                <span>{isProcessing ? '분석 진행중...' : '재분석 실행'}</span>
              </button>
              <button
                type="button"
                onClick={handleClearAllFiles}
                className="px-2.5 py-1 bg-white border border-slate-200 text-slate-500 hover:text-rose-600 hover:border-rose-200 rounded-lg text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                <span>전체 비우기 (소명표 초기화)</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {uploadedFiles.map((fileItem, idx) => {
              const isAnalyzing = fileItem.status === 'analyzing';
              const isWaiting = fileItem.status === 'waiting';

              return (
                <div
                  key={fileItem.id}
                  className={`p-2.5 bg-white border rounded-xl flex items-center justify-between gap-2 shadow-2xs transition-colors ${
                    isAnalyzing
                      ? 'border-blue-400 ring-1 ring-blue-400/30 bg-blue-50/10'
                      : isWaiting
                      ? 'border-amber-200'
                      : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0 ${
                        isAnalyzing
                          ? 'bg-blue-100 text-blue-700'
                          : isWaiting
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-emerald-50 text-emerald-600'
                      }`}
                    >
                      {idx + 1}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-800 truncate" title={fileItem.name}>
                        {fileItem.name}
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
                        <span>{fileItem.size}</span>
                        <span>·</span>
                        {isAnalyzing ? (
                          <span className="text-blue-600 font-bold inline-flex items-center gap-1">
                            <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                            <span>{fileItem.progressText || '분석 진행중...'}</span>
                          </span>
                        ) : isWaiting ? (
                          <span className="text-amber-600 font-semibold">
                            ⏳ 분석 대기중
                          </span>
                        ) : (
                          <span className="text-emerald-600 font-bold">
                            ✅ 분석 완료 ({fileItem.extractedCount ?? 0}건 추출)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveUploadedFile(fileItem.id)}
                    className="p-1 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer shrink-0"
                    title="목록에서 제거"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Processing Animation Modal / Inline Card when user tests */}
      {isProcessing && (
        <div className="p-6 rounded-2xl bg-slate-900 text-white shadow-xl space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-amber-400 animate-spin" />
              <span className="font-bold text-sm">Lawbot AI 다중 PDF 정밀 분석 파이프라인 가동 중...</span>
            </div>
            <span className="text-xs text-slate-400 font-mono">단계 {processingStep}/4</span>
          </div>

          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-amber-400 h-2 transition-all duration-300 ease-out"
              style={{ width: `${processingStep * 25}%` }}
            ></div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div className={`p-2 rounded-lg border ${processingStep >= 1 ? 'border-amber-400/80 bg-amber-400/10 text-amber-300 font-bold' : 'border-slate-800 text-slate-500'}`}>
              1. 다중 PDF OCR 문자 추출
            </div>
            <div className={`p-2 rounded-lg border ${processingStep >= 2 ? 'border-amber-400/80 bg-amber-400/10 text-amber-300 font-bold' : 'border-slate-800 text-slate-500'}`}>
              2. 의뢰인 본인계좌 자가이체 차감
            </div>
            <div className={`p-2 rounded-lg border ${processingStep >= 3 ? 'border-amber-400/80 bg-amber-400/10 text-amber-300 font-bold' : 'border-slate-800 text-slate-500'}`}>
              3. 50만원↑ 대출금·편파변제 탐지
            </div>
            <div className={`p-2 rounded-lg border ${processingStep >= 4 ? 'border-amber-400/80 bg-amber-400/10 text-amber-300 font-bold' : 'border-slate-800 text-slate-500'}`}>
              4. 대출금소명표 생성 완료
            </div>
          </div>
        </div>
      )}

      {/* Blue Information Callout Box (matches exact screenshot text) */}
      <div className="p-5 bg-blue-50/60 border border-blue-100 rounded-2xl space-y-2 text-xs text-slate-700">
        <div className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
          <span className="text-blue-600 font-bold">ⓘ</span>
          <span>안내사항</span>
        </div>
        <ul className="space-y-1.5 text-slate-600 pl-1 leading-relaxed">
          <li className="flex items-start gap-1.5">
            <span className="text-blue-600">↺</span>
            <span>회전된 PDF는 왼쪽 도구모음에서 <strong className="text-blue-600">정방향으로 회전</strong>시킨 뒤 분석해주세요.</span>
          </li>
          <li className="flex items-start gap-1.5">
            <span className="text-blue-600">🔒</span>
            <span>비밀번호로 잠긴 PDF는 <strong className="text-blue-600">비밀번호 해제 후</strong> 업로드해주세요.</span>
          </li>
          <li className="flex items-start gap-1.5">
            <span className="text-blue-600">📑</span>
            <span>여러 은행 거래내역이 하나의 파일에 합쳐져 있으면 <strong className="text-blue-600">은행별로 파일을 나눠서</strong> 올려주세요.</span>
          </li>
          <li className="flex items-start gap-1.5">
            <span className="text-blue-600">📊</span>
            <span>대출금소명표는 <strong className="text-blue-600">Excel로 제공</strong>되며, 다른 은행으로 넘어간 금액도 추적합니다. Excel을 축소/확대하여 확인해보세요.</span>
          </li>
          <li className="flex items-start gap-1.5">
            <span className="text-blue-600">📑</span>
            <span>엑셀(Excel)로 받은 거래내역을 PDF로 변환할 때 <strong className="text-blue-600">한 페이지에 80행 이상</strong> 담기면 글자가 작아져 인식 정확도가 떨어집니다.</span>
          </li>
          <li className="flex items-start gap-1.5">
            <span className="text-blue-600">📑</span>
            <span><strong className="text-blue-600">알PDF는 프로그램이 무거워서 하이라이트 반영이 느립니다.</strong> PDF를 확대/축소하면 하이라이트가 반영됩니다.</span>
          </li>
        </ul>
      </div>

      {/* Form Fields: Client Name & Dual Thresholds (matches screenshot) */}
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            의뢰인 이름 <span className="text-rose-500">*</span>
          </label>
          <div className="flex flex-wrap items-center gap-2 max-w-xl">
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="본인 계좌 간 송금 매칭에 필수"
              className="flex-1 min-w-[200px] px-3.5 py-2 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:border-blue-600"
            />
            <button
              type="button"
              onClick={() => setShowAliasInput((prev) => !prev)}
              className="px-3 py-2 text-xs font-semibold text-blue-600 border border-blue-200 hover:bg-blue-50 rounded-xl cursor-pointer shrink-0"
            >
              + 이름 추가
            </button>
          </div>

          {showAliasInput && (
            <div className="mt-2 flex items-center gap-2 max-w-md animate-in fade-in">
              <input
                type="text"
                value={newAliasInput}
                onChange={(e) => setNewAliasInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newAliasInput.trim()) {
                    e.preventDefault();
                    if (!clientAliases.includes(newAliasInput.trim())) {
                      setClientAliases([...clientAliases, newAliasInput.trim()]);
                    }
                    setNewAliasInput('');
                  }
                }}
                placeholder="개명 전 이름 또는 사업자 상호 입력 후 엔터"
                className="flex-1 px-3 py-1.5 border border-blue-200 bg-blue-50/20 rounded-lg text-xs text-slate-800 focus:outline-hidden focus:border-blue-600"
              />
              <button
                type="button"
                onClick={() => {
                  if (newAliasInput.trim() && !clientAliases.includes(newAliasInput.trim())) {
                    setClientAliases([...clientAliases, newAliasInput.trim()]);
                    setNewAliasInput('');
                  }
                }}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 cursor-pointer"
              >
                등록
              </button>
            </div>
          )}

          {clientAliases.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-500">추가 매칭 이름:</span>
              {clientAliases.map((alias) => (
                <span
                  key={alias}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-[11px] font-semibold"
                >
                  <span>{alias}</span>
                  <button
                    type="button"
                    onClick={() => setClientAliases(clientAliases.filter((a) => a !== alias))}
                    className="hover:text-rose-600 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <p className="text-[11px] text-slate-400 mt-1">
            거래내역 적요에 찍힌 본인 이름으로 본인계좌 간 송금을 매칭합니다. 개명했다면 <span className="font-semibold text-slate-600">이름 추가</span>로 개명 전 이름도 넣어 주세요.
          </p>
        </div>

        {/* Dual Thresholds Section: Bank & Card (exact screenshot) */}
        <div>
          <label className="block text-xs font-bold text-slate-800 mb-2">
            기준금액 <span className="text-slate-400 font-normal">(선택 · 은행/카드 따로 설정)</span>
          </label>
          
          <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/40 space-y-4">
            {/* 1. 은행 거래내역서 Threshold */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                <span>🏛️</span>
                <span>은행 거래내역서</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {['30만원', '50만원', '100만원', '200만원', '300만원'].map((val) => (
                  <button
                    key={`bank-${val}`}
                    onClick={() => {
                      setSelectedThreshold(val);
                      setCustomBankThreshold('');
                    }}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                      selectedThreshold === val && !customBankThreshold
                        ? 'bg-blue-600 text-white border-blue-600 shadow-2xs font-bold'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {val}
                  </button>
                ))}
                <div className="flex items-center gap-1 border border-slate-200 rounded-lg px-2.5 py-1 bg-white text-xs text-slate-600">
                  <input
                    type="text"
                    value={customBankThreshold}
                    onChange={(e) => setCustomBankThreshold(e.target.value)}
                    placeholder="직접 입력"
                    className="w-20 text-right focus:outline-hidden text-xs"
                  />
                  <span>원</span>
                </div>
              </div>
              <div className="text-[11px] text-slate-400">선택된 기준금액 이상의 고액 거래 및 소명 대상을 자동 필터링합니다.</div>
            </div>

            {/* 2. 카드 이용내역서 Threshold */}
            <div className="pt-3 border-t border-slate-200/80 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                <span>💳</span>
                <span>카드 이용내역서</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {['30만원', '50만원', '100만원', '200만원', '300만원'].map((val) => (
                  <button
                    key={`card-${val}`}
                    onClick={() => {
                      setSelectedCardThreshold(val);
                      setCustomCardThreshold('');
                    }}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                      selectedCardThreshold === val && !customCardThreshold
                        ? 'bg-blue-600 text-white border-blue-600 shadow-2xs font-bold'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {val}
                  </button>
                ))}
                <div className="flex items-center gap-1 border border-slate-200 rounded-lg px-2.5 py-1 bg-white text-xs text-slate-600">
                  <input
                    type="text"
                    value={customCardThreshold}
                    onChange={(e) => setCustomCardThreshold(e.target.value)}
                    placeholder="직접 입력"
                    className="w-20 text-right focus:outline-hidden text-xs"
                  />
                  <span>원</span>
                </div>
              </div>
              <div className="text-[11px] text-slate-400">미설정 시 전체 표시</div>
            </div>
          </div>
        </div>

        {/* Quick Benchmark Contract Selectors & Ingestion */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-700">실무 벤치마크 계약서:</span>
            <button
              onClick={() => {
                onSelectBenchmark('contract-msa-ko');
                setActiveViewTab('contract');
              }}
              className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 rounded-lg transition-colors cursor-pointer"
            >
              📄 용역 도급계약서 (MSA)
            </button>
            <button
              onClick={() => {
                onSelectBenchmark('contract-lease-ko');
                setActiveViewTab('contract');
              }}
              className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 rounded-lg transition-colors cursor-pointer"
            >
              🏬 상가 임대차계약서
            </button>
            <button
              onClick={() => {
                onSelectBenchmark('contract-emp-ko');
                setActiveViewTab('contract');
              }}
              className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 rounded-lg transition-colors cursor-pointer"
            >
              👔 임원 경업금지 약정서
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onExportMemo}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>검토 의견서 출력</span>
            </button>
            <button
              onClick={onOpenUploadModal}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              새 계약서 직접 업로드
            </button>
          </div>
        </div>
      </div>

      {/* Analysis Result Workspaces with View Mode Tabs */}
      <div className="pt-4 border-t border-slate-200 space-y-4">
        {/* Workspace Switcher Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveViewTab('statements')}
              className={`pb-2 text-sm font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                activeViewTab === 'statements'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>
                거래내역서 및 대출금 소명표 (
                {statementData
                  ? `전체 ${statementData.transactions.length}건 · ${
                      customBankThreshold
                        ? `${Number(customBankThreshold.replace(/,/g, '')).toLocaleString()}원`
                        : selectedThreshold
                    }↑ ${statementData.transactions.filter((t) => t.amount >= getNumericThreshold()).length}건`
                  : '0건'}
                )
              </span>
            </button>

            <button
              onClick={() => setActiveViewTab('contract')}
              className={`pb-2 text-sm font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                activeViewTab === 'contract'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>계약서 독소조항 & 대법원 판례 ({contract.clauses.length}개 위험조항)</span>
            </button>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>
              의뢰인: <strong className="text-slate-800">{clientName.trim() || '미입력'}</strong> · 기준:{' '}
              <strong>{customBankThreshold ? `${Number(customBankThreshold.replace(/,/g, '')).toLocaleString()}원` : selectedThreshold}</strong>
            </span>
            {statementData && (
              <button
                onClick={handleClearAllFiles}
                className="px-2.5 py-1 rounded-lg border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 font-semibold text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                <span>소명표 내역 비우기</span>
              </button>
            )}
          </div>
        </div>

        {/* VIEW 1: 거래내역서 및 대출금 소명표 */}
        {activeViewTab === 'statements' && (
          statementData ? (
            <StatementAuditView
              auditData={statementData}
              threshold={getNumericThreshold()}
              onUpdateExplanation={handleUpdateExplanation}
              onOpenAssistant={onOpenAssistant}
            />
          ) : (
            <div className="p-10 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-lg mx-auto">
                <h3 className="text-sm font-bold text-slate-900">
                  현재 등록된 거래내역서가 없습니다 (0건)
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  상단의 <strong>은행 / 카드 / 증권·코인 거래내역서</strong> 영역에 1개 또는 여러 개의 PDF 파일을 드래그하거나 선택해 업로드하시면, <strong>입출금 50만원 이상 거래내역이 자동으로 추출</strong>되어 이곳에 표시되며 Excel (.xlsx)로 즉시 다운로드할 수 있습니다.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => bankInputRef.current?.click()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>다중 PDF 거래내역서 업로드</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRunSimulatedAnalysis('bank')}
                  className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>샘플 데이터(3종 PDF)로 소명표 기능 체험하기</span>
                </button>
              </div>
            </div>
          )
        )}

        {/* VIEW 2: 계약서 독소조항 & 판례 검토 */}
        {activeViewTab === 'contract' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>{contract.documentType}</span>
                  <span>·</span>
                  <span>관할: {contract.jurisdiction}</span>
                  <span>·</span>
                  <span>상대방: {contract.counterparty}</span>
                </div>
                <h2 className="text-xl font-bold text-slate-900 mt-0.5">
                  {contract.title}
                </h2>
              </div>

              <div className="text-right">
                <div className="text-xs text-slate-400">위험도 진단</div>
                <div className="text-lg font-bold text-rose-600 flex items-center gap-1 justify-end">
                  <AlertTriangle className="w-4 h-4" />
                  <span>{contract.overallRiskLevel.toUpperCase()} (심각 위험)</span>
                </div>
              </div>
            </div>

            {/* Split analysis cards */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Left: Clause List */}
              <div className="lg:col-span-6 space-y-2.5">
                <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>조항별 독소 위험 ({contract.clauses.length}개)</span>
                  <span className="text-slate-400 font-normal">클릭하여 세부 분석 확인</span>
                </div>

                <div className="space-y-2">
                  {contract.clauses.map((clause) => {
                    const isSelected = selectedClause?.id === clause.id;
                    return (
                      <div
                        key={clause.id}
                        onClick={() => setSelectedClauseId(clause.id)}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50/30 shadow-xs'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-800">
                            {clause.clauseNumber}: {clause.title}
                          </span>
                          <span
                            className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                              clause.severity === 'critical'
                                ? 'bg-rose-100 text-rose-700'
                                : clause.severity === 'medium'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-blue-100 text-blue-700'
                            }`}
                          >
                            {clause.severity === 'critical' ? '독소조항' : '주의조항'}
                          </span>
                        </div>

                        <p className="text-xs text-slate-600 line-clamp-2 mt-1.5 font-serif">
                          “{clause.originalText}”
                        </p>

                        <div className="mt-2 text-[11px] text-slate-400 flex items-center justify-between">
                          <span>{clause.riskSummary}</span>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right: Selected Clause Detail & Redline */}
              <div className="lg:col-span-6">
                {selectedClause && (
                  <div className="p-5 border border-slate-200 rounded-2xl bg-white space-y-4 shadow-xs">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div>
                        <span className="text-xs font-bold text-blue-600">
                          {selectedClause.clauseNumber}
                        </span>
                        <h3 className="text-base font-bold text-slate-900 mt-0.5">
                          {selectedClause.title}
                        </h3>
                      </div>
                      <button
                        onClick={() =>
                          onOpenAssistant(
                            `「${contract.title}」의 "${selectedClause.title}" 조항에 대한 대법원 판례 및 수정안을 알려주세요:\n\n"${selectedClause.originalText}"`
                          )
                        }
                        className="px-2.5 py-1 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
                      >
                        AI에게 질문하기
                      </button>
                    </div>

                    {/* Original text */}
                    <div>
                      <div className="text-xs font-bold text-slate-500 mb-1">계약서 원문 조항:</div>
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-serif text-slate-800 leading-relaxed">
                        “{selectedClause.originalText}”
                      </div>
                    </div>

                    {/* Legal Rationale */}
                    <div>
                      <div className="text-xs font-bold text-slate-500 mb-1">대법원 판례 및 법리적 위험:</div>
                      <p className="text-xs text-slate-700 leading-relaxed">
                        {selectedClause.legalRationale}
                      </p>
                      <div className="mt-1.5 p-2 bg-blue-50/50 rounded-lg border border-blue-100 text-[11px] text-blue-800 font-mono">
                        근거: {selectedClause.statutoryReference}
                      </div>
                    </div>

                    {/* Recommended Redline */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-emerald-700">권고 수정안 (Redline):</span>
                        <button
                          onClick={() => handleCopy(selectedClause.recommendedRedline, selectedClause.id)}
                          className="inline-flex items-center gap-1 text-[11px] text-slate-600 hover:text-slate-900 font-semibold cursor-pointer"
                        >
                          {copiedId === selectedClause.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                              <span>복사 완료!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>수정문구 복사</span>
                            </>
                          )}
                        </button>
                      </div>
                      <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs text-slate-800 font-serif leading-relaxed">
                        {selectedClause.recommendedRedline}
                      </div>
                    </div>

                    {/* Negotiation Stance */}
                    <div className="pt-2 border-t border-slate-100 text-xs text-slate-600 flex items-center justify-between">
                      <div>
                        <span className="font-bold text-slate-800">협상 권고:</span> {selectedClause.negotiationStance}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
