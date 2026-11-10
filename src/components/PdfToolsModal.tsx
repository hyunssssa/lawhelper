import React, { useState, useEffect } from 'react';
import {
  X,
  RotateCw,
  RotateCcw,
  Layers,
  Scissors,
  Trash2,
  Upload,
  Check,
  FileText,
  Download,
  Sparkles,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  Eye,
  CheckCircle2
} from 'lucide-react';
import { PDFDocument, degrees, StandardFonts, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';

// Configure pdfjs worker using same-origin /pdfjs endpoint served by Express
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdfjs/build/pdf.worker.min.mjs';

export type PdfToolMode = 'tools_rotate' | 'tools_merge' | 'tools_split' | 'tools_delete' | null;

export interface InitialPdfBufferItem {
  name: string;
  base64: string;
}

interface PdfPagePreviewItem {
  id: string;
  fileIndex: number;
  fileName: string;
  originalPageIndex: number; // 0-based index in source file
  pageNumberInFile: number;  // 1-based
  rotation: number;          // 0, 90, 180, 270
  selectedForSplit: boolean;
  markedForDelete: boolean;
  thumbnailDataUrl: string;
}

interface LoadedPdfFile {
  id: string;
  name: string;
  bytes: Uint8Array;
  pageCount: number;
}

interface PdfToolsModalProps {
  toolType: PdfToolMode;
  onClose: () => void;
  initialFiles?: InitialPdfBufferItem[];
  onApplyToAnalysis?: (files: File[]) => void;
}

export const PdfToolsModal: React.FC<PdfToolsModalProps> = ({
  toolType,
  onClose,
  initialFiles = [],
  onApplyToAnalysis,
}) => {
  const [activeMode, setActiveMode] = useState<Exclude<PdfToolMode, null>>(
    toolType || 'tools_rotate'
  );
  const [loadedFiles, setLoadedFiles] = useState<LoadedPdfFile[]>([]);
  const [pages, setPages] = useState<PdfPagePreviewItem[]>([]);
  const [isRenderingPreviews, setIsRenderingPreviews] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [rangeInput, setRangeInput] = useState('1-2');
  const [deleteInput, setDeleteInput] = useState('2');
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [zoomedPage, setZoomedPage] = useState<PdfPagePreviewItem | null>(null);

  useEffect(() => {
    if (toolType) {
      setActiveMode(toolType);
      setStatusBanner(null);
    }
  }, [toolType]);

  // Helper: Render page thumbnails from a Uint8Array PDF using pdfjs-dist
  const renderPdfPagesToThumbnails = async (
    pdfBytes: Uint8Array,
    fileIndex: number,
    fileName: string
  ): Promise<{ pageCount: number; items: PdfPagePreviewItem[] }> => {
    try {
      const loadingTask = pdfjsLib.getDocument({
        data: pdfBytes.slice(0),
        cMapUrl: '/pdfjs/cmaps/',
        cMapPacked: true,
        standardFontDataUrl: '/pdfjs/standard_fonts/'
      });
      const pdfDoc = await loadingTask.promise;
      const numPages = pdfDoc.numPages;
      const items: PdfPagePreviewItem[] = [];

      for (let p = 1; p <= numPages; p++) {
        const page = await pdfDoc.getPage(p);
        const viewport = page.getViewport({ scale: 0.65 });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        }

        const dataUrl = canvas.toDataURL('image/png');
        items.push({
          id: `p-${fileIndex}-${p}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          fileIndex,
          fileName,
          originalPageIndex: p - 1,
          pageNumberInFile: p,
          rotation: 0,
          selectedForSplit: true,
          markedForDelete: false,
          thumbnailDataUrl: dataUrl
        });
        page.cleanup();
      }
      await (pdfDoc as any).destroy?.();
      return { pageCount: numPages, items };
    } catch (err) {
      // Fallback visual card if worker fails in restricted iframe
      const pdfDocLib = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      const count = pdfDocLib.getPageCount();
      const items: PdfPagePreviewItem[] = [];
      for (let p = 1; p <= count; p++) {
        const canvas = document.createElement('canvas');
        canvas.width = 240;
        canvas.height = 320;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, 240, 320);
          ctx.strokeStyle = '#cbd5e1';
          ctx.strokeRect(12, 12, 216, 296);
          ctx.fillStyle = '#1e293b';
          ctx.font = 'bold 14px sans-serif';
          ctx.fillText(fileName.slice(0, 18), 24, 48);
          ctx.fillStyle = '#2563eb';
          ctx.font = 'bold 20px sans-serif';
          ctx.fillText(`PAGE ${p} / ${count}`, 24, 90);
          ctx.fillStyle = '#64748b';
          ctx.font = '11px monospace';
          for (let row = 0; row < 7; row++) {
            ctx.fillText(`2025.10.${10 + row}   출금   ${(row + 1) * 550000}원`, 24, 130 + row * 22);
          }
        }
        items.push({
          id: `p-${fileIndex}-${p}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          fileIndex,
          fileName,
          originalPageIndex: p - 1,
          pageNumberInFile: p,
          rotation: 0,
          selectedForSplit: true,
          markedForDelete: false,
          thumbnailDataUrl: canvas.toDataURL('image/png')
        });
      }
      return { pageCount: count, items };
    }
  };

  // Load initial files if provided when modal opens
  useEffect(() => {
    if (!toolType) return;
    if (loadedFiles.length === 0 && initialFiles.length > 0) {
      (async () => {
        setIsRenderingPreviews(true);
        const newFiles: LoadedPdfFile[] = [];
        const newPages: PdfPagePreviewItem[] = [];
        for (let i = 0; i < initialFiles.length; i++) {
          const item = initialFiles[i];
          if (!item.base64) continue;
          try {
            const binaryStr = atob(item.base64);
            const bytes = new Uint8Array(binaryStr.length);
            for (let j = 0; j < binaryStr.length; j++) {
              bytes[j] = binaryStr.charCodeAt(j);
            }
            const rendered = await renderPdfPagesToThumbnails(bytes, i, item.name);
            newFiles.push({
              id: `f-${i}-${Date.now()}`,
              name: item.name,
              bytes,
              pageCount: rendered.pageCount
            });
            newPages.push(...rendered.items);
          } catch (_) {
            // ignore non-pdf
          }
        }
        if (newFiles.length > 0) {
          setLoadedFiles(newFiles);
          setPages(newPages);
        }
        setIsRenderingPreviews(false);
      })();
    }
  }, [toolType]);

  if (!toolType) return null;

  // Generate a real 4-page sample bank statement PDF so the user can test Rotate / Merge / Split / Delete immediately
  const handleLoadSamplePdf = async () => {
    setIsRenderingPreviews(true);
    setStatusBanner(null);
    try {
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      const pageConfigs = [
        {
          title: 'PAGE 1 - KB Bank Statement (2025.10)',
          rows: [
            '2025.10.03   15,000,000   0   18,420,000   LOAN_DISBURSEMENT',
            '2025.10.05   3,500,000    0   14,920,000   TRANSFER_PARK',
            '2025.10.09   0   3,200,000    18,120,000   SALARY_DEPOSIT',
            '2025.10.12   2,500,000    0   15,620,000   UPBIT_CRYPTO'
          ]
        },
        {
          title: 'PAGE 2 - KB Bank Statement (2025.11)',
          rows: [
            '2025.11.02   1,800,000    0   13,820,000   CARD_SETTLEMENT',
            '2025.11.10   5,000,000    0   8,820,000    FAMILY_TRANSFER',
            '2025.11.15   850,000      0   7,970,000    RENT_PAYMENT',
            '2025.11.21   1,200,000    0   6,770,000    MEDICAL_EXPENSE'
          ]
        },
        {
          title: 'PAGE 3 - Shinhan Bank Statement (2025.12)',
          rows: [
            '2025.12.01   0   4,500,000    11,270,000   BONUS_DEPOSIT',
            '2025.12.08   2,200,000    0   9,070,000    LOAN_REPAYMENT',
            '2025.12.14   950,000      0   8,120,000    INSURANCE_FEE',
            '2025.12.22   3,000,000    0   5,120,000    PREFERENCE_PAY'
          ]
        },
        {
          title: 'PAGE 4 - Appendix / Terms Notice (Deletable Page)',
          rows: [
            'Notice: General Banking Terms and Conditions',
            'This page contains no transaction records.',
            'You can test deleting or splitting this page.'
          ]
        }
      ];

      for (let i = 0; i < pageConfigs.length; i++) {
        const p = pdfDoc.addPage([595, 842]);
        p.drawRectangle({
          x: 30,
          y: 30,
          width: 535,
          height: 782,
          borderColor: rgb(0.75, 0.8, 0.88),
          borderWidth: 1.5
        });
        p.drawText(pageConfigs[i].title, {
          x: 50,
          y: 765,
          size: 16,
          font: boldFont,
          color: rgb(0.1, 0.25, 0.65)
        });
        p.drawText('Date         Withdrawal   Deposit      Balance      Description', {
          x: 50,
          y: 725,
          size: 11,
          font: boldFont,
          color: rgb(0.2, 0.2, 0.2)
        });
        let y = 695;
        for (const r of pageConfigs[i].rows) {
          p.drawText(r, {
            x: 50,
            y,
            size: 11,
            font,
            color: rgb(0.15, 0.15, 0.15)
          });
          y -= 28;
        }
      }

      const pdfBytes = await pdfDoc.save();
      const fileIndex = loadedFiles.length;
      const sampleName = `샘플_거래내역서_${fileIndex + 1}.pdf`;
      const rendered = await renderPdfPagesToThumbnails(pdfBytes, fileIndex, sampleName);

      setLoadedFiles((prev) => [
        ...prev,
        {
          id: `sample-${Date.now()}`,
          name: sampleName,
          bytes: pdfBytes,
          pageCount: rendered.pageCount
        }
      ]);
      setPages((prev) => [...prev, ...rendered.items]);
      setStatusBanner(`샘플 PDF (${rendered.pageCount}페이지)가 로드되어 미리보기 화면에 표시되었습니다.`);
    } finally {
      setIsRenderingPreviews(false);
    }
  };

  // Upload user PDF files and render every page onto preview thumbnails
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    setIsRenderingPreviews(true);
    setStatusBanner(null);

    try {
      const startIdx = loadedFiles.length;
      const newLoadedFiles: LoadedPdfFile[] = [];
      const newPreviewPages: PdfPagePreviewItem[] = [];

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const buf = await f.arrayBuffer();
        const bytes = new Uint8Array(buf);
        const fileIdx = startIdx + i;
        const rendered = await renderPdfPagesToThumbnails(bytes, fileIdx, f.name);
        newLoadedFiles.push({
          id: `upload-${Date.now()}-${i}`,
          name: f.name,
          bytes,
          pageCount: rendered.pageCount
        });
        newPreviewPages.push(...rendered.items);
      }

      setLoadedFiles((prev) => [...prev, ...newLoadedFiles]);
      setPages((prev) => [...prev, ...newPreviewPages]);
      setStatusBanner(
        `${newLoadedFiles.length}개 PDF 파일 (총 ${newPreviewPages.length}페이지) 미리보기가 생성되었습니다.`
      );
    } catch (err) {
      setStatusBanner('PDF 파일을 읽는 중 오류가 발생했습니다. 암호가 해제된 PDF인지 확인해주세요.');
    } finally {
      setIsRenderingPreviews(false);
    }
  };

  // Rotate specific page
  const handleRotateSinglePage = (pageId: string, delta: number) => {
    setPages((prev) =>
      prev.map((p) =>
        p.id === pageId ? { ...p, rotation: (p.rotation + delta + 360) % 360 } : p
      )
    );
    setStatusBanner(`선택한 페이지 회전이 미리보기에 즉시 반영되었습니다.`);
  };

  // Rotate all pages
  const handleRotateAllPages = (delta: number) => {
    setPages((prev) =>
      prev.map((p) => ({
        ...p,
        rotation: delta === 0 ? 0 : (p.rotation + delta + 360) % 360
      }))
    );
    setStatusBanner(
      delta === 0
        ? '모든 페이지 회전이 원본(0°)으로 초기화되었습니다.'
        : `전체 ${pages.length}페이지가 ${delta > 0 ? `시계방향 ${delta}°` : `반시계방향 ${Math.abs(delta)}°`} 회전되었습니다.`
    );
  };

  // Reorder page in merge/general view
  const handleMovePage = (idx: number, direction: -1 | 1) => {
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= pages.length) return;
    const copy = [...pages];
    const [moved] = copy.splice(idx, 1);
    copy.splice(targetIdx, 0, moved);
    setPages(copy);
    setStatusBanner(`페이지 순서가 ${idx + 1}번 → ${targetIdx + 1}번으로 변경되었습니다.`);
  };

  // Reorder entire file in merge mode
  const handleMoveFile = (fileIdx: number, direction: -1 | 1) => {
    const targetIdx = fileIdx + direction;
    if (targetIdx < 0 || targetIdx >= loadedFiles.length) return;
    const filesCopy = [...loadedFiles];
    const [movedFile] = filesCopy.splice(fileIdx, 1);
    filesCopy.splice(targetIdx, 0, movedFile);

    // Reorder pages to match new file order
    const fileOrderMap = new Map<string, number>();
    filesCopy.forEach((f, i) => fileOrderMap.set(f.name, i));
    const reorderedPages = [...pages].sort((a, b) => {
      const fa = fileOrderMap.get(a.fileName) ?? a.fileIndex;
      const fb = fileOrderMap.get(b.fileName) ?? b.fileIndex;
      if (fa !== fb) return fa - fb;
      return a.originalPageIndex - b.originalPageIndex;
    });

    setLoadedFiles(filesCopy);
    setPages(reorderedPages);
    setStatusBanner(`"${movedFile.name}" 문서의 병합 순서가 변경되었습니다.`);
  };

  // Remove a file and its pages
  const handleRemoveFile = (fileIndex: number, fileName: string) => {
    setLoadedFiles((prev) => prev.filter((_, i) => i !== fileIndex));
    setPages((prev) => prev.filter((p) => p.fileName !== fileName));
    setStatusBanner(`"${fileName}" 파일이 목록에서 제외되었습니다.`);
  };

  // Parse 1-based page numbers string like "1-3, 5"
  const parsePageNumberString = (str: string, maxPages: number): Set<number> => {
    const set = new Set<number>();
    const parts = str.split(',').map((s) => s.trim()).filter(Boolean);
    for (const part of parts) {
      if (part.includes('-')) {
        const [startStr, endStr] = part.split('-').map((s) => s.trim());
        const s = parseInt(startStr, 10);
        const e = parseInt(endStr, 10);
        if (!isNaN(s) && !isNaN(e)) {
          for (let k = Math.min(s, e); k <= Math.max(s, e); k++) {
            if (k >= 1 && k <= maxPages) set.add(k);
          }
        }
      } else {
        const n = parseInt(part, 10);
        if (!isNaN(n) && n >= 1 && n <= maxPages) set.add(n);
      }
    }
    return set;
  };

  // Apply range input to Split selection
  const handleApplySplitRangeInput = () => {
    const selectedSet = parsePageNumberString(rangeInput, pages.length);
    if (selectedSet.size === 0) {
      setStatusBanner(`유효한 페이지 번호(1 ~ ${pages.length})를 입력해주세요.`);
      return;
    }
    setPages((prev) =>
      prev.map((p, idx) => ({
        ...p,
        selectedForSplit: selectedSet.has(idx + 1)
      }))
    );
    setStatusBanner(`지정 구간(${rangeInput}페이지, 총 ${selectedSet.size}장)이 분할 추출 대상으로 선택되었습니다.`);
  };

  // Apply delete input to Delete selection
  const handleApplyDeleteRangeInput = () => {
    const deleteSet = parsePageNumberString(deleteInput, pages.length);
    if (deleteSet.size === 0) {
      setStatusBanner(`삭제할 유효한 페이지 번호(1 ~ ${pages.length})를 입력해주세요.`);
      return;
    }
    setPages((prev) =>
      prev.map((p, idx) => ({
        ...p,
        markedForDelete: deleteSet.has(idx + 1)
      }))
    );
    setStatusBanner(`지정 페이지(${deleteInput}페이지, 총 ${deleteSet.size}장)가 삭제 예정으로 표시되었습니다.`);
  };

  // Build actual modified PDF binary using pdf-lib from current preview state
  const buildModifiedPdfDocument = async (): Promise<{
    bytes: Uint8Array;
    fileName: string;
    keptPageCount: number;
  } | null> => {
    if (pages.length === 0 || loadedFiles.length === 0) return null;

    // Filter pages based on active tool mode
    const activePages = pages.filter((p) => {
      if (activeMode === 'tools_split') return p.selectedForSplit;
      if (activeMode === 'tools_delete') return !p.markedForDelete;
      return true;
    });

    if (activePages.length === 0) {
      setStatusBanner('최소 1페이지 이상 남겨두어야 PDF를 생성할 수 있습니다.');
      return null;
    }

    const outDoc = await PDFDocument.create();
    // Cache loaded source PDFDocuments by fileName
    const sourceDocsMap = new Map<string, PDFDocument>();
    for (const lf of loadedFiles) {
      const srcDoc = await PDFDocument.load(lf.bytes, { ignoreEncryption: true });
      sourceDocsMap.set(lf.name, srcDoc);
    }

    for (const pageItem of activePages) {
      const srcDoc =
        sourceDocsMap.get(pageItem.fileName) ||
        (loadedFiles[pageItem.fileIndex]
          ? await PDFDocument.load(loadedFiles[pageItem.fileIndex].bytes, { ignoreEncryption: true })
          : null);
      if (!srcDoc) continue;

      const [copiedPage] = await outDoc.copyPages(srcDoc, [pageItem.originalPageIndex]);
      const currentRot = copiedPage.getRotation().angle || 0;
      copiedPage.setRotation(degrees((currentRot + pageItem.rotation) % 360));
      outDoc.addPage(copiedPage);
    }

    const outBytes = await outDoc.save();
    const baseName = loadedFiles[0].name.replace(/\.[^/.]+$/, '');
    const suffix =
      activeMode === 'tools_rotate'
        ? '회전보정'
        : activeMode === 'tools_merge'
        ? `통합병합_${loadedFiles.length}건`
        : activeMode === 'tools_split'
        ? `분할추출_${activePages.length}p`
        : `페이지삭제완료_${activePages.length}p`;

    return {
      bytes: outBytes,
      fileName: `${baseName}_${suffix}.pdf`,
      keptPageCount: activePages.length
    };
  };

  // Action 1: Apply changes directly to the preview state inside the modal ("미리보기에 즉시 반영")
  const handleCommitToPreview = async () => {
    if (pages.length === 0) return;
    setIsApplying(true);
    try {
      const result = await buildModifiedPdfDocument();
      if (!result) return;
      const rendered = await renderPdfPagesToThumbnails(result.bytes, 0, result.fileName);
      setLoadedFiles([
        {
          id: `committed-${Date.now()}`,
          name: result.fileName,
          bytes: result.bytes,
          pageCount: rendered.pageCount
        }
      ]);
      setPages(rendered.items);
      setStatusBanner(
        `✅ 변경 사항이 문서에 실제 반영되었습니다! (현재 총 ${rendered.pageCount}페이지 · ${result.fileName})`
      );
    } finally {
      setIsApplying(false);
    }
  };

  // Action 2: Download the modified PDF file to the user's computer
  const handleDownloadPdf = async () => {
    if (pages.length === 0) return;
    setIsApplying(true);
    try {
      const result = await buildModifiedPdfDocument();
      if (!result) return;
      const blob = new Blob([result.bytes as unknown as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatusBanner(`✅ "${result.fileName}" (${result.keptPageCount}페이지) 다운로드가 완료되었습니다.`);
    } finally {
      setIsApplying(false);
    }
  };

  // Action 3: Send the modified PDF directly into the main Bank/Contract Analyzer ("거래내역 분석에 바로 반영")
  const handleSendToMainAnalyzer = async () => {
    if (pages.length === 0) return;
    setIsApplying(true);
    try {
      const result = await buildModifiedPdfDocument();
      if (!result) return;
      const modifiedFile = new File([result.bytes as unknown as BlobPart], result.fileName, {
        type: 'application/pdf'
      });
      if (onApplyToAnalysis) {
        onApplyToAnalysis([modifiedFile]);
      }
      onClose();
    } finally {
      setIsApplying(false);
    }
  };

  const activeKeptCount = pages.filter((p) => {
    if (activeMode === 'tools_split') return p.selectedForSplit;
    if (activeMode === 'tools_delete') return !p.markedForDelete;
    return true;
  }).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-3 sm:p-6">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-6xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Top Modal Header & Mode Switcher Tabs */}
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-bold text-slate-900">PDF 문서 전처리 & 실시간 미리보기</span>
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setActiveMode('tools_rotate')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                  activeMode === 'tools_rotate'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>문서 회전</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveMode('tools_merge')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                  activeMode === 'tools_merge'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>PDF 병합</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveMode('tools_split')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                  activeMode === 'tools_split'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Scissors className="w-3.5 h-3.5" />
                <span>PDF 분할</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveMode('tools_delete')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                  activeMode === 'tools_delete'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>페이지 삭제</span>
              </button>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main Body: Left Controls + Right Visual Page Preview Grid */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
          {/* Left Control Column (4 cols) */}
          <div className="lg:col-span-4 p-5 space-y-4 bg-white overflow-y-auto">
            {/* Upload or Sample Trigger */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800">1. 작업할 PDF 문서 불러오기</label>
                <button
                  type="button"
                  onClick={handleLoadSamplePdf}
                  className="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  <span>4페이지 샘플 PDF 불러오기</span>
                </button>
              </div>

              <input
                type="file"
                id="pdf-workspace-upload"
                multiple
                accept=".pdf"
                onChange={handleFileUpload}
                className="hidden"
              />
              <label
                htmlFor="pdf-workspace-upload"
                className="border-2 border-dashed border-blue-300 hover:border-blue-500 rounded-xl p-4 flex flex-col items-center justify-center text-center bg-blue-50/30 hover:bg-blue-50/60 transition-colors cursor-pointer"
              >
                <Upload className="w-6 h-6 text-blue-600 mb-1.5" />
                <div className="text-xs font-bold text-slate-800">
                  PDF 파일 선택 또는 추가 (다중 선택 가능)
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  업로드 즉시 우측에 페이지별 실시간 미리보기가 표시됩니다
                </div>
              </label>
            </div>

            {/* Loaded Files List */}
            {loadedFiles.length > 0 && (
              <div className="space-y-1.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                  <span>불러온 문서 ({loadedFiles.length}개 · 총 {pages.length}페이지)</span>
                  <button
                    type="button"
                    onClick={() => {
                      setLoadedFiles([]);
                      setPages([]);
                      setStatusBanner(null);
                    }}
                    className="text-rose-600 hover:underline cursor-pointer"
                  >
                    전체 초기화
                  </button>
                </div>
                <div className="max-h-36 overflow-y-auto space-y-1.5">
                  {loadedFiles.map((f, idx) => (
                    <div
                      key={f.id}
                      className="flex items-center justify-between gap-2 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span className="truncate font-semibold text-slate-800">{f.name}</span>
                        <span className="text-[10px] text-slate-400 shrink-0">({f.pageCount}p)</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {loadedFiles.length > 1 && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleMoveFile(idx, -1)}
                              disabled={idx === 0}
                              className="p-1 text-slate-500 hover:text-blue-600 disabled:opacity-30 cursor-pointer"
                              title="위로 이동"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveFile(idx, 1)}
                              disabled={idx === loadedFiles.length - 1}
                              className="p-1 text-slate-500 hover:text-blue-600 disabled:opacity-30 cursor-pointer"
                              title="아래로 이동"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveFile(idx, f.name)}
                          className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                          title="파일 제거"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Mode-Specific Controls */}
            {activeMode === 'tools_rotate' && (
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3">
                <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <RotateCw className="w-4 h-4 text-blue-600" />
                  <span>2. 문서 회전 컨트롤</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  전체 페이지를 일괄 회전하거나, 우측 미리보기 화면에서 <strong>개별 페이지 하단의 좌·우 회전 버튼</strong>을 눌러 원하는 페이지만 정방향으로 맞출 수 있습니다.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={pages.length === 0}
                    onClick={() => handleRotateAllPages(-90)}
                    className="py-2 px-3 bg-white hover:bg-blue-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-blue-600" />
                    <span>전체 좌회전 (-90°)</span>
                  </button>
                  <button
                    type="button"
                    disabled={pages.length === 0}
                    onClick={() => handleRotateAllPages(90)}
                    className="py-2 px-3 bg-white hover:bg-blue-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer"
                  >
                    <RotateCw className="w-3.5 h-3.5 text-blue-600" />
                    <span>전체 우회전 (+90°)</span>
                  </button>
                  <button
                    type="button"
                    disabled={pages.length === 0}
                    onClick={() => handleRotateAllPages(180)}
                    className="py-2 px-3 bg-white hover:bg-blue-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
                    <span>전체 180° 상하반전</span>
                  </button>
                  <button
                    type="button"
                    disabled={pages.length === 0}
                    onClick={() => handleRotateAllPages(0)}
                    className="py-2 px-3 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer"
                  >
                    <span>원본 각도(0°) 초기화</span>
                  </button>
                </div>
              </div>
            )}

            {activeMode === 'tools_merge' && (
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3">
                <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-blue-600" />
                  <span>2. PDF 병합 및 순서 조정</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  여러 개의 은행·카드 PDF를 추가한 뒤 파일 순서(↑/↓) 또는 우측 미리보기 카드의 <strong>페이지 이동 버튼(←/→)</strong>으로 순서를 맞추고 <strong>[반영하기]</strong>를 누르면 1개의 PDF로 통합됩니다.
                </p>
              </div>
            )}

            {activeMode === 'tools_split' && (
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3">
                <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Scissors className="w-4 h-4 text-blue-600" />
                  <span>2. 분할 추출할 페이지 선택</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  우측 미리보기에서 <strong>추출할 페이지를 직접 클릭</strong>하거나, 아래에 페이지 구간을 입력하고 <strong>[구간 선택 반영]</strong>을 누르세요.
                </p>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={rangeInput}
                    onChange={(e) => setRangeInput(e.target.value)}
                    placeholder="예: 1-2, 4"
                    className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-hidden focus:border-blue-600"
                  />
                  <button
                    type="button"
                    disabled={pages.length === 0}
                    onClick={handleApplySplitRangeInput}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold disabled:opacity-40 cursor-pointer shrink-0"
                  >
                    구간 선택 반영
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    disabled={pages.length === 0}
                    onClick={() =>
                      setPages((prev) => prev.map((p) => ({ ...p, selectedForSplit: true })))
                    }
                    className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    전체 선택
                  </button>
                  <button
                    type="button"
                    disabled={pages.length === 0}
                    onClick={() =>
                      setPages((prev) => prev.map((p) => ({ ...p, selectedForSplit: false })))
                    }
                    className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    전체 해제
                  </button>
                  <button
                    type="button"
                    disabled={pages.length === 0}
                    onClick={() =>
                      setPages((prev) =>
                        prev.map((p, i) => ({
                          ...p,
                          selectedForSplit: i < Math.ceil(prev.length / 2)
                        }))
                      )
                    }
                    className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    앞 절반만 선택
                  </button>
                </div>
              </div>
            )}

            {activeMode === 'tools_delete' && (
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3">
                <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Trash2 className="w-4 h-4 text-rose-600" />
                  <span>2. 삭제할 페이지 선택</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  우측 미리보기에서 <strong>삭제할 페이지를 직접 클릭</strong>(빨간색 표시)하거나, 아래에 삭제할 페이지 번호를 입력하고 <strong>[삭제 번호 반영]</strong>을 누르세요.
                </p>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={deleteInput}
                    onChange={(e) => setDeleteInput(e.target.value)}
                    placeholder="예: 2, 4"
                    className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-hidden focus:border-rose-500"
                  />
                  <button
                    type="button"
                    disabled={pages.length === 0}
                    onClick={handleApplyDeleteRangeInput}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold disabled:opacity-40 cursor-pointer shrink-0"
                  >
                    삭제 번호 반영
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    disabled={pages.length === 0}
                    onClick={() =>
                      setPages((prev) => prev.map((p) => ({ ...p, markedForDelete: false })))
                    }
                    className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    삭제 표시 전체 해제
                  </button>
                </div>
              </div>
            )}

            {/* Status Notification Banner */}
            {statusBanner && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{statusBanner}</span>
              </div>
            )}

            {/* Primary Apply / Commit Buttons */}
            <div className="space-y-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                disabled={pages.length === 0 || isApplying}
                onClick={handleCommitToPreview}
                className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-40 cursor-pointer transition-colors"
              >
                <Check className="w-4 h-4 text-amber-400" />
                <span>
                  {isApplying
                    ? 'PDF 변환 처리 중...'
                    : `현재 편집 내용 문서에 즉시 반영 (${activeKeptCount}페이지 확정)`}
                </span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={pages.length === 0 || isApplying}
                  onClick={handleDownloadPdf}
                  className="py-2.5 px-3 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-blue-600" />
                  <span>변환 PDF 다운로드</span>
                </button>

                <button
                  type="button"
                  disabled={pages.length === 0 || isApplying}
                  onClick={handleSendToMainAnalyzer}
                  className="py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer shadow-xs"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>거래내역 분석에 바로 반영</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Visual Page Preview Area (8 cols) */}
          <div className="lg:col-span-8 p-5 bg-slate-100/80 flex flex-col min-h-[420px] overflow-y-auto">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-800">
                  실시간 페이지 미리보기 ({pages.length}페이지 중 결과 {activeKeptCount}페이지)
                </span>
                {activeMode === 'tools_split' && (
                  <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-[11px] font-bold">
                    카드를 클릭해 분할 추출할 페이지를 선택/해제하세요
                  </span>
                )}
                {activeMode === 'tools_delete' && (
                  <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-700 text-[11px] font-bold">
                    카드를 클릭해 삭제할 페이지를 지정/해제하세요
                  </span>
                )}
              </div>
            </div>

            {isRenderingPreviews ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-12 space-y-3">
                <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
                <div className="text-sm font-bold text-slate-800">
                  PDF 페이지 고해상도 미리보기를 생성하고 있습니다...
                </div>
              </div>
            ) : pages.length === 0 ? (
              <div className="flex-1 border-2 border-dashed border-slate-300 rounded-2xl bg-white/70 flex flex-col items-center justify-center text-center p-10 space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <FileText className="w-6 h-6" />
                </div>
                <div className="space-y-1 max-w-md">
                  <div className="text-sm font-bold text-slate-900">
                    미리보기할 PDF 문서를 선택해주세요
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    좌측에서 PDF 파일을 업로드하거나 아래 <strong>[4페이지 샘플 PDF 불러오기]</strong> 버튼을 누르면 회전·병합·분할·페이지삭제를 실시간 미리보기로 즉시 테스트할 수 있습니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleLoadSamplePdf}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>4페이지 샘플 PDF 불러와서 바로 테스트하기</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {pages.map((page, idx) => {
                  const isExcluded =
                    (activeMode === 'tools_split' && !page.selectedForSplit) ||
                    (activeMode === 'tools_delete' && page.markedForDelete);

                  return (
                    <div
                      key={page.id}
                      onClick={() => {
                        if (activeMode === 'tools_split') {
                          setPages((prev) =>
                            prev.map((p) =>
                              p.id === page.id
                                ? { ...p, selectedForSplit: !p.selectedForSplit }
                                : p
                            )
                          );
                        } else if (activeMode === 'tools_delete') {
                          setPages((prev) =>
                            prev.map((p) =>
                              p.id === page.id
                                ? { ...p, markedForDelete: !p.markedForDelete }
                                : p
                            )
                          );
                        }
                      }}
                      className={`group relative rounded-2xl border-2 p-3 transition-all flex flex-col bg-white shadow-xs ${
                        activeMode === 'tools_split' || activeMode === 'tools_delete'
                          ? 'cursor-pointer'
                          : ''
                      } ${
                        activeMode === 'tools_delete' && page.markedForDelete
                          ? 'border-rose-500 bg-rose-50/40 opacity-75'
                          : activeMode === 'tools_split' && page.selectedForSplit
                          ? 'border-blue-600 ring-2 ring-blue-500/20'
                          : isExcluded
                          ? 'border-slate-200 opacity-45'
                          : 'border-slate-200 hover:border-blue-400'
                      }`}
                    >
                      {/* Top Badge Row */}
                      <div className="flex items-center justify-between gap-1 mb-2">
                        <span className="px-2 py-0.5 rounded-md bg-slate-900 text-white font-mono font-bold text-[11px]">
                          P.{idx + 1}
                        </span>
                        <div className="flex items-center gap-1">
                          {page.rotation !== 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[10px]">
                              {page.rotation}° 회전
                            </span>
                          )}
                          {activeMode === 'tools_split' && (
                            <span
                              className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${
                                page.selectedForSplit
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-slate-200 text-slate-600'
                              }`}
                            >
                              {page.selectedForSplit ? '추출 포함' : '제외됨'}
                            </span>
                          )}
                          {activeMode === 'tools_delete' && page.markedForDelete && (
                            <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white font-bold text-[10px]">
                              삭제 예정
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setZoomedPage(page);
                            }}
                            className="p-1 text-slate-400 hover:text-blue-600 rounded cursor-pointer"
                            title="크게 보기"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Thumbnail Preview Container */}
                      <div className="relative h-44 bg-slate-100 rounded-xl overflow-hidden flex items-center justify-center border border-slate-200/80">
                        <img
                          src={page.thumbnailDataUrl}
                          alt={`Page ${idx + 1}`}
                          style={{
                            transform: `rotate(${page.rotation}deg)`,
                            transition: 'transform 0.25s ease'
                          }}
                          className="max-h-40 max-w-full object-contain shadow-xs"
                        />
                        {activeMode === 'tools_delete' && page.markedForDelete && (
                          <div className="absolute inset-0 bg-rose-950/35 flex items-center justify-center">
                            <span className="px-3 py-1 rounded-full bg-rose-600 text-white text-xs font-bold shadow">
                              삭제 대상
                            </span>
                          </div>
                        )}
                      </div>

                      {/* File Name Caption */}
                      <div className="mt-2 text-[10px] text-slate-500 truncate" title={page.fileName}>
                        {page.fileName} (원본 {page.pageNumberInFile}p)
                      </div>

                      {/* Per-Page Action Buttons */}
                      <div
                        className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleRotateSinglePage(page.id, -90)}
                            className="px-2 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-700 rounded-lg text-[10px] font-bold flex items-center gap-0.5 cursor-pointer"
                            title="이 페이지 좌회전 (-90°)"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>좌회전</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRotateSinglePage(page.id, 90)}
                            className="px-2 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-700 rounded-lg text-[10px] font-bold flex items-center gap-0.5 cursor-pointer"
                            title="이 페이지 우회전 (+90°)"
                          >
                            <RotateCw className="w-3 h-3" />
                            <span>우회전</span>
                          </button>
                        </div>

                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMovePage(idx, -1)}
                            className="p-1 text-slate-400 hover:text-slate-800 disabled:opacity-25 cursor-pointer"
                            title="앞 순서로 이동"
                          >
                            <ArrowLeft className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === pages.length - 1}
                            onClick={() => handleMovePage(idx, 1)}
                            className="p-1 text-slate-400 hover:text-slate-800 disabled:opacity-25 cursor-pointer"
                            title="뒤 순서로 이동"
                          >
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setPages((prev) =>
                                prev.map((p) =>
                                  p.id === page.id
                                    ? { ...p, markedForDelete: !p.markedForDelete }
                                    : p
                                )
                              )
                            }
                            className={`p-1 rounded cursor-pointer ${
                              page.markedForDelete
                                ? 'text-rose-600 bg-rose-50'
                                : 'text-slate-400 hover:text-rose-600'
                            }`}
                            title="이 페이지 삭제 토글"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Zoomed Single Page Preview Modal */}
        {zoomedPage && (
          <div
            className="fixed inset-0 z-60 bg-slate-950/80 flex items-center justify-center p-4"
            onClick={() => setZoomedPage(null)}
          >
            <div
              className="bg-white rounded-2xl max-w-2xl w-full p-5 space-y-4 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="text-sm font-bold text-slate-900">
                  {zoomedPage.fileName} — {zoomedPage.pageNumberInFile}페이지 확대 미리보기 (회전: {zoomedPage.rotation}°)
                </div>
                <button
                  type="button"
                  onClick={() => setZoomedPage(null)}
                  className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="bg-slate-100 rounded-xl p-6 flex items-center justify-center min-h-[420px] overflow-hidden">
                <img
                  src={zoomedPage.thumbnailDataUrl}
                  alt="Zoomed page"
                  style={{ transform: `rotate(${zoomedPage.rotation}deg)` }}
                  className="max-h-[460px] object-contain shadow-md"
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    handleRotateSinglePage(zoomedPage.id, -90);
                    setZoomedPage((prev) =>
                      prev ? { ...prev, rotation: (prev.rotation - 90 + 360) % 360 } : null
                    );
                  }}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold text-slate-700 cursor-pointer"
                >
                  ↺ 좌회전 (-90°)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleRotateSinglePage(zoomedPage.id, 90);
                    setZoomedPage((prev) =>
                      prev ? { ...prev, rotation: (prev.rotation + 90) % 360 } : null
                    );
                  }}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold text-slate-700 cursor-pointer"
                >
                  ↻ 우회전 (+90°)
                </button>
                <button
                  type="button"
                  onClick={() => setZoomedPage(null)}
                  className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold cursor-pointer"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
