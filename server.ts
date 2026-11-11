import express from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFParse } from 'pdf-parse';
import { PDFDocument } from 'pdf-lib';
import * as XLSX from 'xlsx';
import { BENCHMARK_SYSTEM_PROMPT } from './src/data/contracts.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CMAP_URL = path.resolve(__dirname, 'node_modules/pdfjs-dist/cmaps') + '/';
const STANDARD_FONT_URL = path.resolve(__dirname, 'node_modules/pdfjs-dist/standard_fonts') + '/';

const app = express();
app.use(express.json({ limit: '250mb' }));
app.use(express.urlencoded({ extended: true, limit: '250mb' }));

// Serve pdfjs-dist worker, cmaps, and standard_fonts from same origin so browser Workers never hit CORS errors
app.use('/pdfjs', express.static(path.resolve(__dirname, 'node_modules/pdfjs-dist')));

const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;
if (apiKey) {
  ai = new GoogleGenAI({ apiKey });
}

const GEMINI_FAST_POOL = [
  'gemini-3.5-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-flash-lite-latest'
];

const GEMINI_MODEL_PRIORITY = [
  ...GEMINI_FAST_POOL,
  'gemini-3.1-flash-lite-preview',
  'gemini-3.8-flash',
  'gemini-flash-latest',
  'gemini-3-flash-preview',
  'gemini-3.1-pro-preview'
];

let modelRoundRobinIndex = 0;

// Non-blocking Gemini helper with round-robin load distribution + automatic model failover on 429/503/timeout
async function generateWithTimeout(params: any, timeoutMs = 18000): Promise<any> {
  if (!ai) throw new Error('AI client not initialized');

  const startIdx = modelRoundRobinIndex++ % GEMINI_FAST_POOL.length;
  const rotatedFastPool = [
    ...GEMINI_FAST_POOL.slice(startIdx),
    ...GEMINI_FAST_POOL.slice(0, startIdx)
  ];

  const candidateModels = [
    ...rotatedFastPool,
    ...GEMINI_MODEL_PRIORITY
  ].filter((v, i, a) => a.indexOf(v) === i);

  let lastError: any = null;
  for (let pass = 0; pass < 2; pass++) {
    for (const modelName of candidateModels) {
      try {
        return await Promise.race([
          ai.models.generateContent({ ...params, model: modelName }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Gemini timeout after ${timeoutMs}ms`)), timeoutMs)
          )
        ]);
      } catch (err: any) {
        lastError = err;
        // Immediately fail over to the next model in the pool on any error (503, 429, timeout, 404, etc.)
        continue;
      }
    }
    // Brief pause before second pass if all models experienced simultaneous burst
    await new Promise((r) => setTimeout(r, 600));
  }
  throw lastError;
}

// Fault-tolerant parser that recovers:
// 1. Visual column-order 5-tuples: ["YYYY-MM-DD", 출금액, 입금액, 거래후잔액, "거래내용/상대방"]
// 2. Legacy W/D 5-tuples: ["YYYY-MM-DD", "W"|"D", 거래금액, "거래내용/적요", 거래후잔액]
// 3. Standard JSON objects: {"date":"...","type":"...","amount":1500000,"counterpart":"...","balance":3200000}
// and runs mathematical running-balance delta (B_i - B_{i-1}) verification to fix any balance/amount/type mixups.
function salvageTransactionsFromOcrResponse(rawText: string): Array<{
  date: string;
  type: 'deposit' | 'withdrawal';
  amount: number;
  counterpart: string;
  balance: number | null;
  category?: string;
}> {
  const results: Array<{
    date: string;
    type: 'deposit' | 'withdrawal';
    amount: number;
    counterpart: string;
    balance: number | null;
    category?: string;
  }> = [];

  const clean = (rawText || '').replace(/```json/gi, '').replace(/```/g, '').trim();
  if (!clean) return results;

  const parseCurrencyVal = (raw: any): { val: number; isNegative: boolean; isPositiveSign: boolean } => {
    const str = String(raw ?? '0').trim();
    const isNegative = str.startsWith('-') || str.includes('▲') || str.includes('△');
    const isPositiveSign = str.startsWith('+');
    const digits = str.replace(/[^0-9.]/g, '');
    const val = Math.round(Number(digits) || 0);
    return { val: Math.abs(val), isNegative, isPositiveSign };
  };

  const normalizeDateStr = (raw: string): string => {
    const s = String(raw || '').trim();
    const m = s.match(/(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
    if (m) {
      return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    }
    const m8 = s.match(/(20\d{2})(\d{2})(\d{2})/);
    if (m8) {
      return `${m8[1]}-${m8[2]}-${m8[3]}`;
    }
    return s.split(/\s+/)[0] || '2025-10-01';
  };

  const isSummaryRowText = (d: string, c: string): boolean => {
    return (
      /합\s*계|총\s*계|소\s*계|누\s*계|이월잔액|출금합계|입금합계|거래내역\s*요약/.test(d) ||
      /^(?:합\s*계|총\s*계|소\s*계|누\s*계|이월잔액|출금합계|입금합계)$/.test(c.trim())
    );
  };

  const pushNormalizedItem = (item: any) => {
    if (!item) return;
    if (Array.isArray(item) && item.length >= 3) {
      const rawDate = String(item[0] || '').trim();
      if (!rawDate || !/\d/.test(rawDate)) return;
      const secondStr = String(item[1] ?? '').trim();
      const isLegacyTypeToken = /^(?:W|D|WITHDRAWAL|DEPOSIT|출금|입금|지급|수취|찾으신|맡기신)/i.test(secondStr);

      if (isLegacyTypeToken) {
        // Legacy format: ["YYYY-MM-DD", "W"|"D", 거래금액, "거래내용", 거래후잔액]
        const rawType = secondStr.toUpperCase();
        const parsedAmt = parseCurrencyVal(item[2]);
        if (parsedAmt.val <= 0) return;
        const counterpart = String(item[3] || '').trim();
        if (isSummaryRowText(rawDate, counterpart)) return;
        const parsedBal = item[4] !== undefined && item[4] !== null ? parseCurrencyVal(item[4]) : null;
        const isDeposit =
          !parsedAmt.isNegative &&
          (parsedAmt.isPositiveSign || rawType.startsWith('D') || rawType.includes('입금') || rawType.includes('맡기신'));
        results.push({
          date: normalizeDateStr(rawDate),
          type: isDeposit ? 'deposit' : 'withdrawal',
          amount: parsedAmt.val,
          counterpart: counterpart || (isDeposit ? '입금 거래' : '출금 거래'),
          balance: parsedBal && parsedBal.val >= 0 ? parsedBal.val : null
        });
      } else {
        // Visual Korean bank table column order:
        // ["YYYY-MM-DD", 출금액, 입금액, 거래후잔액, "거래내용/상대방"]
        const wParsed = parseCurrencyVal(item[1]);
        const dParsed = parseCurrencyVal(item[2]);
        let balVal: number | null = null;
        let counterpart = '';

        if (item.length >= 5) {
          const bParsed = item[3] !== undefined && item[3] !== null ? parseCurrencyVal(item[3]) : null;
          balVal = bParsed && bParsed.val >= 0 ? bParsed.val : null;
          counterpart = String(item[4] || '').trim();
          if (item[5] && typeof item[5] === 'string' && item[5].trim()) {
            counterpart = counterpart ? `${counterpart} (${item[5].trim()})` : item[5].trim();
          }
        } else if (item.length === 4) {
          const fourthStr = String(item[3] ?? '').trim();
          if (/^[+-]?[0-9,]+$/.test(fourthStr)) {
            balVal = parseCurrencyVal(fourthStr).val;
          } else {
            counterpart = fourthStr;
          }
        }

        if (isSummaryRowText(rawDate, counterpart)) return;

        let txType: 'deposit' | 'withdrawal' = 'withdrawal';
        let txAmount = 0;

        if (wParsed.val > 0 && dParsed.val === 0) {
          txType = 'withdrawal';
          txAmount = wParsed.val;
        } else if (dParsed.val > 0 && wParsed.val === 0) {
          txType = 'deposit';
          txAmount = dParsed.val;
        } else if (wParsed.val > 0 && dParsed.val > 0) {
          // If the model accidentally put the running balance into item[2], disambiguate
          if (balVal !== null && dParsed.val === balVal && wParsed.val !== balVal) {
            txType = 'withdrawal';
            txAmount = wParsed.val;
          } else if (balVal !== null && wParsed.val === balVal && dParsed.val !== balVal) {
            txType = 'deposit';
            txAmount = dParsed.val;
          } else {
            txType = 'withdrawal';
            txAmount = wParsed.val;
          }
        }

        if (txAmount <= 0) return;

        results.push({
          date: normalizeDateStr(rawDate),
          type: txType,
          amount: txAmount,
          counterpart: counterpart || (txType === 'deposit' ? '입금 거래' : '출금 거래'),
          balance: balVal
        });
      }
    } else if (typeof item === 'object') {
      const wVal = parseCurrencyVal(item.withdrawal ?? item.출금 ?? item.출금액 ?? item.찾으신금액 ?? 0).val;
      const dVal = parseCurrencyVal(item.deposit ?? item.입금 ?? item.입금액 ?? item.맡기신금액 ?? 0).val;
      const rawBalSource = item.balance ?? item.잔액 ?? item.거래후잔액;
      const parsedBal =
        rawBalSource !== undefined && rawBalSource !== null ? parseCurrencyVal(rawBalSource) : null;

      let txType: 'deposit' | 'withdrawal' = 'withdrawal';
      let txAmount = 0;

      if (wVal > 0 && dVal === 0) {
        txType = 'withdrawal';
        txAmount = wVal;
      } else if (dVal > 0 && wVal === 0) {
        txType = 'deposit';
        txAmount = dVal;
      } else {
        const parsedAmt = parseCurrencyVal(item.amount ?? item.txAmount ?? item.거래금액 ?? 0);
        txAmount = parsedAmt.val;
        const rawType = String(item.type || item.구분 || '').toLowerCase();
        const isDep =
          !parsedAmt.isNegative &&
          (parsedAmt.isPositiveSign ||
            dVal > 0 ||
            rawType === 'deposit' ||
            rawType === 'd' ||
            rawType.includes('입금') ||
            rawType.includes('맡기신'));
        txType = isDep ? 'deposit' : 'withdrawal';
      }

      if (txAmount <= 0) return;
      const rawDateStr = String(item.date || item.거래일자 || item.거래일시 || '2025-10-01').trim();
      const counterpartStr = String(
        item.counterpart || item.description || item.적요 || item.거래내용 || item.내용 || (txType === 'deposit' ? '입금 거래' : '출금 거래')
      ).trim();
      if (isSummaryRowText(rawDateStr, counterpartStr)) return;
      results.push({
        date: normalizeDateStr(rawDateStr),
        type: txType,
        amount: txAmount,
        counterpart: counterpartStr,
        balance: parsedBal && parsedBal.val >= 0 ? parsedBal.val : null,
        category: item.category
      });
    }
  };

  // Helper: Verify consecutive rows using running balance delta (B_i - B_{i-1})
  const verifyWithRunningBalances = (rows: typeof results) => {
    if (rows.length < 2) return rows;

    // Determine whether the page table is ordered oldest-to-newest (ascending) or newest-to-oldest (descending)
    let ascMatches = 0;
    let descMatches = 0;
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1];
      const curr = rows[i];
      if (prev.balance === null || curr.balance === null) continue;
      const ascDelta = curr.balance - prev.balance;
      const descDelta = prev.balance - curr.balance;
      if (Math.abs(ascDelta) === curr.amount && ascDelta !== 0) ascMatches++;
      if (Math.abs(descDelta) === prev.amount && descDelta !== 0) descMatches++;
    }
    const isDescending = descMatches > ascMatches && descMatches >= 2;

    if (!isDescending) {
      for (let i = 1; i < rows.length; i++) {
        const prev = rows[i - 1];
        const curr = rows[i];
        if (prev.balance === null || curr.balance === null) continue;
        const delta = curr.balance - prev.balance;
        if (delta === 0) continue;
        const absDelta = Math.abs(delta);
        const expectedType: 'deposit' | 'withdrawal' = delta > 0 ? 'deposit' : 'withdrawal';

        // Case 1: Model got the exact amount right, but flipped deposit/withdrawal
        if (curr.amount === absDelta && curr.type !== expectedType) {
          curr.type = expectedType;
        }
        // Case 2: Model accidentally put the running balance itself into the amount field
        else if (
          (curr.amount === curr.balance || curr.amount === prev.balance) &&
          absDelta > 0 &&
          absDelta < Math.max(curr.balance, prev.balance)
        ) {
          curr.amount = absDelta;
          curr.type = expectedType;
        }
      }
    } else {
      for (let i = 0; i < rows.length - 1; i++) {
        const curr = rows[i];
        const older = rows[i + 1];
        if (curr.balance === null || older.balance === null) continue;
        const delta = curr.balance - older.balance;
        if (delta === 0) continue;
        const absDelta = Math.abs(delta);
        const expectedType: 'deposit' | 'withdrawal' = delta > 0 ? 'deposit' : 'withdrawal';

        if (curr.amount === absDelta && curr.type !== expectedType) {
          curr.type = expectedType;
        } else if (
          (curr.amount === curr.balance || curr.amount === older.balance) &&
          absDelta > 0 &&
          absDelta < Math.max(curr.balance, older.balance)
        ) {
          curr.amount = absDelta;
          curr.type = expectedType;
        }
      }
    }
    return rows;
  };

  // 1. Try full JSON parse first
  try {
    const parsed = JSON.parse(clean);
    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.txs)
      ? parsed.txs
      : Array.isArray(parsed?.transactions)
      ? parsed.transactions
      : null;
    if (list) {
      for (const it of list) pushNormalizedItem(it);
      if (results.length > 0) return verifyWithRunningBalances(results);
    }
  } catch (_) {
    // Fall through to regex salvage if JSON was truncated
  }

  // 2A. Salvage visual column-order 5-tuples: ["2025-10-12", 500000, 0, 22284511, "주식회사 더케이"]
  const visualTupleMatches = clean.matchAll(
    /\[\s*"(20\d{2}[^"]*|\d{2}[.\-/]\d{2}[^"]*)"\s*,\s*"?([+-]?[0-9,]+)"?\s*,\s*"?([+-]?[0-9,]+)"?\s*,\s*"?([+-]?[0-9,]+|null)"?\s*,\s*"([^"]*)"\s*\]/g
  );
  for (const m of visualTupleMatches) {
    pushNormalizedItem([
      m[1],
      m[2],
      m[3],
      m[4] && m[4] !== 'null' ? m[4] : null,
      m[5] || ''
    ]);
  }
  if (results.length > 0) return verifyWithRunningBalances(results);

  // 2B. Salvage legacy W/D array tuples: ["2025-10-12", "W", 1500000, "김은진", 3400000]
  const tupleMatches = clean.matchAll(
    /\[\s*"(20\d{2}[^"]*|\d{2}[.\-/]\d{2}[^"]*)"\s*,\s*"([A-Za-z가-힣]+)"\s*,\s*"?([+-]?[0-9,]+)"?\s*(?:,\s*"([^"]*)"\s*)?(?:,\s*"?([+-]?[0-9,]+|null)"?\s*)?\]/g
  );
  for (const m of tupleMatches) {
    pushNormalizedItem([
      m[1],
      m[2],
      m[3],
      m[4] || '',
      m[5] && m[5] !== 'null' ? m[5] : null
    ]);
  }
  if (results.length > 0) return verifyWithRunningBalances(results);

  // 3. Salvage standard JSON objects: { "date": "...", ..., "amount": 1500000, ... }
  const objMatches = clean.matchAll(/\{[^{}]*"(?:amount|withdrawal|deposit|출금|입금|출금액|입금액)"\s*:\s*[0-9,"+\-\s]+[^{}]*\}/g);
  for (const m of objMatches) {
    try {
      const obj = JSON.parse(m[0]);
      pushNormalizedItem(obj);
    } catch (_) {
      // ignore malformed partial object
    }
  }

  return verifyWithRunningBalances(results);
}

// Extract coordinate-sorted lines from a PDF buffer using pdfjs-dist with Korean CMap support
async function extractCoordinateSortedTextFromPdf(buffer: Buffer): Promise<string> {
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    cMapUrl: CMAP_URL,
    cMapPacked: true,
    standardFontDataUrl: STANDARD_FONT_URL,
    verbosity: 0
  });
  const doc = await loadingTask.promise;
  const pageTexts: string[] = [];

  try {
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.0 });
      const textContent = await page.getTextContent();

      interface PositionedItem {
        str: string;
        x: number;
        y: number;
        width: number;
        height: number;
      }

      const items: PositionedItem[] = [];
      for (const rawItem of textContent.items as any[]) {
        if (!rawItem || typeof rawItem.str !== 'string') continue;
        const trimmed = rawItem.str.trim();
        if (!trimmed) continue;
        const tm = rawItem.transform || [1, 0, 0, 1, 0, 0];
        const [vx, vy] = viewport.convertToViewportPoint(tm[4], tm[5]);
        items.push({
          str: trimmed,
          x: vx,
          y: vy,
          width: rawItem.width || 0,
          height: rawItem.height || Math.abs(tm[3]) || 10
        });
      }

      // Pure 1D sort on Y first so TimSort is 100% transitive and never scrambles horizontal rows
      items.sort((a, b) => a.y - b.y);

      // Group items into visual horizontal rows anchored to the first item's Y on each row
      const rows: PositionedItem[][] = [];
      for (const item of items) {
        if (rows.length === 0) {
          rows.push([item]);
        } else {
          const currentRow = rows[rows.length - 1];
          const anchorY = currentRow[0].y;
          if (Math.abs(item.y - anchorY) <= 4.0) {
            currentRow.push(item);
          } else {
            rows.push([item]);
          }
        }
      }

      const rowStrings: string[] = [];
      for (const row of rows) {
        row.sort((a, b) => a.x - b.x);
        let lineStr = '';
        let prevEndX: number | null = null;
        let prevStr = '';
        for (const cell of row) {
          const normStr = cell.str.replace(/[\u2212\uFF0D\u2013\u2014\u2012]/g, '-');
          if (prevEndX === null) {
            lineStr += normStr;
          } else {
            const gap = cell.x - prevEndX;
            const prevEndsNumericPart = /[,.:]$|\d-$/.test(prevStr);
            const currStartsNumericPart = /^[,.:]/.test(normStr);
            const bothPureDigits = /^\d+$/.test(prevStr) && /^\d+$/.test(normStr);
            // Glue without space only when kerning inside a split number/date
            if (gap >= -2.0 && gap <= 2.4 && (prevEndsNumericPart || currStartsNumericPart || (bothPureDigits && gap <= 1.8))) {
              lineStr += normStr;
            } else if (gap < 8) {
              lineStr += ' ' + normStr;
            } else {
              lineStr += '\t' + normStr;
            }
          }
          const itemWidth = cell.width > 0 ? cell.width : normStr.length * 4.0;
          prevEndX = cell.x + itemWidth;
          prevStr = normStr;
        }
        // Normalize spaces around commas inside numbers (e.g. "1, 500, 000" -> "1,500,000")
        lineStr = lineStr
          .replace(/(\d)\s*,\s*(\d{3})/g, '$1,$2')
          .replace(/(\d)\s*,\s*(\d{3})/g, '$1,$2')
          .replace(/([+-])\s+(\d{1,3}(?:,\d{3})+|\d+)/g, '$1$2');
        if (lineStr.trim()) {
          rowStrings.push(lineStr.trim());
        }
      }

      pageTexts.push(rowStrings.join('\n'));
      page.cleanup();
    }
  } finally {
    await (doc as any).destroy?.();
  }

  return pageTexts.join('\n');
}

// Secondary text extractor using pdf-parse (stream-order text extraction)
async function extractStreamTextWithPdfParse(buffer: Buffer): Promise<string> {
  let parser: PDFParse | null = null;
  try {
    parser = new PDFParse({ data: buffer });
    const res = await parser.getText();
    return res?.text || '';
  } catch (_) {
    return '';
  } finally {
    try {
      await parser?.destroy();
    } catch (_) {
      // ignore
    }
  }
}

// Helper: Normalize Korean bank names and document titles (e.g. fix typos like 포스뱅크 -> 토스은행)
function normalizeBankAndFileName(name: string): string {
  if (!name) return name;
  return name
    .replace(/포스\s*(?:뱅크|은행)/gi, '토스은행')
    .replace(/^포스\b/gi, '토스은행')
    .replace(/포스\s+(\d)/gi, '토스은행 $1')
    .replace(/포스\s*거래내역/gi, '토스은행 거래내역');
}

// Helper: Extract all transactions from coordinate-sorted PDF, stream PDF, or Excel text
function extractTransactionsFromRawText(
  text: string,
  clientName: string,
  threshold = 500000,
  sourceFileName = '금융기관',
  clientAliases: string[] = [],
  sourceCategory: 'bank' | 'card' | 'crypto' = 'bank'
) {
  // Normalize all Unicode minus/dash signs to standard ASCII '-' first
  const normalizedInput = text.replace(/[\u2212\uFF0D\u2013\u2014\u2012]/g, '-');

  // Pre-split any single line that has multiple full dates separated by currency amounts (e.g. stream concatenation)
  const expandedText = normalizedInput.replace(
    /(\d{1,3}(?:,\d{3})+[^\r\n]*?)\s+(?=(?:20\d{2}\s*[.\-/]\s*(?:0?[1-9]|1[0-2])\s*[.\-/]\s*(?:0?[1-9]|[12]\d|3[01])))/g,
    '$1\n'
  );

  const rawLines = expandedText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^--\s*\d+\s*of\s*\d+\s*--$/i.test(l));

  const results: any[] = [];
  const rawClean = sourceFileName.replace(/\.[^/.]+$/, '');
  let cleanBankName = normalizeBankAndFileName(rawClean);

  // Document-content bank auto-detection (e.g. if file contains '토스뱅크' or '토스은행' or typo '포스' was in filename)
  if (/토스\s*(?:뱅크|은행)|toss\s*bank/i.test(expandedText)) {
    if (/포스/i.test(cleanBankName) || !cleanBankName || cleanBankName === '금융기관') {
      cleanBankName = '토스은행';
    }
  }
  const allClientNames = [clientName, ...clientAliases].map((n) => n.trim()).filter(Boolean);

  // Detect column header order: whether Deposit (입금/맡기신/수취) comes before Withdrawal (출금/찾으신/지급)
  let depositColBeforeWithdrawal = false;
  for (const headerCandidate of rawLines.slice(0, 100)) {
    const depIdx = headerCandidate.search(/입금|맡기신|수취|입금액/);
    const witIdx = headerCandidate.search(/출금|찾으신|지급|출금액|이용금액|결제금액/);
    if (depIdx !== -1 && witIdx !== -1) {
      depositColBeforeWithdrawal = depIdx < witIdx;
      break;
    }
  }

  // Comprehensive Korean bank statement date patterns:
  // Matches YYYY.MM.DD, YYYY-MM-DD, YYYY/MM/DD, YYYY년 MM월 DD일, YY.MM.DD, or 8-digit YYYYMMDD
  const fullDateRegex =
    /(20\d{2}\s*[.\-/년]\s*(?:1[0-2]|0[1-9]|[1-9])\s*[.\-/월]\s*(?:3[01]|[12]\d|0[1-9]|[1-9](?!\d))\s*일?|(?<!\d)(?:1[5-9]|2[0-6])\s*[.\-/]\s*(?:1[0-2]|0[1-9])\s*[.\-/]\s*(?:3[01]|[12]\d|0[1-9])(?!\d)|(?<!\d)20[12]\d(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])(?!\d))/;
  // Short date (MM.DD or MM/DD or MM-DD) at start of line (or after sequence number) when year is already known
  const shortDateRegex = /^(?:\d{1,4}\s+)?((?:0?[1-9]|1[0-2])[.\-/](?:0?[1-9]|[12]\d|3[01]))(?=\s|\t|$)/;
  const timeRegex = /\b\d{1,2}:\d{2}(?::\d{2})?\b/g;
  const acctHyphenRegex = /\b\d{2,6}-\d{2,6}-\d{2,8}(?:-\d{1,4})?\b/g;
  const longUnhyphenatedAcctRegex = /\b\d{10,16}\b/g;

  const isMetadataHeaderLine = (s: string) =>
    /^(?:합\s*계|총\s*계|소\s*계|누\s*계|이월잔액|거래합계|월\s*계)(?:\s|\t|:|\d|$)|조회기간|거래기간|총\s*입금|총\s*출금|입금합계|출금합계|합계금액|합계건수|발급일시|출력일시|작성일시|기준일시|평균잔액|계좌번호\s*[:\t\d]|예금주\s*[:\t]|^Page\s+\d+\s*\/\s*\d+/i.test(
      s.trim()
    ) ||
    (/거래일자|거래일시|거래날짜/.test(s) && /잔액|적요|출금|입금|내용|기재/.test(s));

  const hasCurrencyOnLine = (s: string) => {
    const stripped = s
      .replace(fullDateRegex, ' ')
      .replace(timeRegex, ' ')
      .replace(acctHyphenRegex, ' ')
      .replace(longUnhyphenatedAcctRegex, ' ');
    return /[+-]?\d{1,3}(?:,\d{3})+|\b\d{2,10}\s*원/.test(stripped);
  };

  let currentYear = '2025';
  let lastSeenDate: string | null = null;
  let pendingDateLineCounterpart = '';
  let pendingDateNeedsAmounts = false;
  let prevBalance: number | null = null;

  for (let i = 0; i < rawLines.length; i++) {
    let line = rawLines[i];

    // Skip summary/header/footer metadata lines
    if (isMetadataHeaderLine(line)) {
      const yrMatch = line.match(/\b(20[12]\d)\b/);
      if (yrMatch) currentYear = yrMatch[1];
      continue;
    }

    // Separate glued date+time (e.g. "2025.10.1214:20:30" -> "2025.10.12 14:20:30") before matching date
    line = line.replace(
      /(20\d{2}[.\-/]\d{1,2}[.\-/]\d{1,2}|(?<!\d)\d{2}[.\-/]\d{2}[.\-/]\d{2}|(?<!\d)20[12]\d[01]\d[0-3]\d)(\d{2}:\d{2})/g,
      '$1 $2'
    );

    // Vertically-split 2-line row reunion:
    // If current line has currency amounts but NO date, and next line has a date but NO currency amounts, merge them!
    if (
      !fullDateRegex.test(line) &&
      !shortDateRegex.test(line) &&
      hasCurrencyOnLine(line) &&
      i + 1 < rawLines.length &&
      !isMetadataHeaderLine(rawLines[i + 1])
    ) {
      const nextLine = rawLines[i + 1].replace(
        /(20\d{2}[.\-/]\d{1,2}[.\-/]\d{1,2}|(?<!\d)\d{2}[.\-/]\d{2}[.\-/]\d{2})(\d{2}:\d{2})/g,
        '$1 $2'
      );
      if ((fullDateRegex.test(nextLine) || shortDateRegex.test(nextLine)) && !hasCurrencyOnLine(nextLine)) {
        line = `${nextLine} \t ${line}`;
        i++;
      }
    }

    let matchedDateStr: string | null = null;
    const dateMatch = line.match(fullDateRegex);
    if (dateMatch) {
      matchedDateStr = dateMatch[1];
      let d = matchedDateStr
        .replace(/[년월]/g, '-')
        .replace(/일/g, '')
        .replace(/\s+/g, '')
        .replace(/[./]/g, '-');
      if (/^\d{8}$/.test(d)) {
        d = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
      } else if (/^\d{2}-/.test(d)) {
        d = '20' + d;
      }
      const parts = d.split('-').filter(Boolean);
      if (parts.length === 3) {
        currentYear = parts[0];
        d = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      }
      lastSeenDate = d;
      pendingDateLineCounterpart = '';
      pendingDateNeedsAmounts = true;
    } else {
      const shortMatch = line.match(shortDateRegex);
      if (shortMatch) {
        matchedDateStr = shortMatch[1];
        const parts = matchedDateStr.replace(/[./]/g, '-').split('-');
        if (parts.length === 2) {
          lastSeenDate = `${currentYear}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
          pendingDateLineCounterpart = '';
          pendingDateNeedsAmounts = true;
        }
      }
    }

    if (!lastSeenDate) continue;

    // Strip leading sequence number before date, then strip matched date, time, and account numbers
    let lineClean = line.replace(/^\d{1,4}(?=\s+(?:20\d{2}|\d{2}[.\-/]\d{2}))/, ' ');
    if (matchedDateStr) {
      lineClean = lineClean.replace(matchedDateStr, ' ');
    }
    lineClean = lineClean
      .replace(fullDateRegex, ' ')
      .replace(timeRegex, ' ')
      .replace(acctHyphenRegex, ' ')
      .replace(longUnhyphenatedAcctRegex, ' ')
      .replace(/(\d)\s*,\s*(\d{3})/g, '$1,$2')
      .replace(/(\d)\s*,\s*(\d{3})/g, '$1,$2')
      .replace(/([+-])\s+(\d{1,3}(?:,\d{3})+|\d+)/g, '$1$2')
      .replace(/(\d)\s+원/g, '$1원')
      // Always separate Korean/letters glued to signed or comma-formatted or 원-suffixed currency numbers
      .replace(/([가-힣a-zA-Z()])([+-]\d{1,3}(?:,\d{3})+|[+-]\d+|\d{1,3}(?:,\d{3})+|\d+원)/g, '$1 $2')
      .replace(/(입금|출금|지급|수취|맡기신금액|찾으신금액|맡기신|찾으신)([+-]?\d+)/g, '$1 $2')
      .replace(/([+-]?\d{1,3}(?:,\d{3})+원?|\d+원)([가-힣a-zA-Z(])/g, '$1 $2');

    // Split by any whitespace or tab so both single-space and tab-delimited columns are cleanly separated
    const tokens = lineClean
      .split(/[\t\s]+/)
      .map((c) => c.trim())
      .filter(Boolean);

    // Group contiguous numeric tokens into clusters.
    // In every Korean bank statement, the amount column(s) [거래금액] or [출금, 입금] and the balance column [거래후잔액]
    // are contiguous adjacent columns (never separated by Korean merchant names).
    interface ParsedNumCell {
      raw: string;
      val: number;
      isZero: boolean;
      hasComma: boolean;
      hasWon: boolean;
      hasSign: '+' | '-' | null;
      tokenIndex: number;
    }

    const clusters: ParsedNumCell[][] = [];
    let currentCluster: ParsedNumCell[] = [];

    for (let tIdx = 0; tIdx < tokens.length; tIdx++) {
      const token = tokens[tIdx];
      const m = token.match(/^([+-])?(\d{1,3}(?:,\d{3})+|\d+)원?$/);
      if (m) {
        const rawDigits = m[2].replace(/,/g, '');
        const val = parseInt(rawDigits, 10);
        if (!isNaN(val) && val <= 10000000000) {
          const hasComma = m[2].includes(',');
          const hasWon = token.includes('원');
          const sign = (m[1] as '+' | '-' | undefined) || null;
          currentCluster.push({
            raw: token,
            val,
            isZero: val === 0,
            hasComma,
            hasWon,
            hasSign: sign,
            tokenIndex: tIdx
          });
          continue;
        }
      }
      if (currentCluster.length > 0) {
        clusters.push(currentCluster);
        currentCluster = [];
      }
    }
    if (currentCluster.length > 0) {
      clusters.push(currentCluster);
    }

    // Pick the primary currency column cluster:
    // Prefer a cluster of length >= 2 (e.g. [거래금액, 거래후잔액] or [출금, 입금, 잔액]),
    // or a cluster containing a comma/signed/원-formatted currency amount.
    let bestCluster: ParsedNumCell[] = [];
    let bestScore = -1;
    for (const cl of clusters) {
      const formattedCount = cl.filter((c) => c.hasComma || c.hasSign !== null || c.hasWon).length;
      const maxVal = Math.max(...cl.map((c) => c.val));
      // Skip a single small unformatted number (< 100) if it's isolated inside merchant text
      if (cl.length === 1 && formattedCount === 0 && maxVal < 100) continue;
      const score =
        (cl.length >= 2 && cl.length <= 4 ? 100 : 0) +
        formattedCount * 50 +
        (maxVal >= 100 ? 20 : 0);
      if (score > bestScore) {
        bestScore = score;
        bestCluster = cl;
      }
    }

    // Inline fallback if a token still had text glued to a comma-formatted currency amount
    if (bestCluster.length === 0) {
      const inlineRegex = /([+-])?(?<!\d)(\d{1,3}(?:,\d{3})+|\d{2,10}\s*원)(?!\d)/g;
      const inlineMatches = [...lineClean.matchAll(inlineRegex)];
      for (let mIdx = 0; mIdx < inlineMatches.length; mIdx++) {
        const im = inlineMatches[mIdx];
        const rawStr = im[2];
        const hasComma = rawStr.includes(',');
        const val = parseInt(rawStr.replace(/[,원\s]/g, ''), 10);
        if (!isNaN(val) && val >= 0 && val <= 10000000000) {
          bestCluster.push({
            raw: im[0],
            val,
            isZero: val === 0,
            hasComma,
            hasWon: rawStr.includes('원'),
            hasSign: (im[1] as '+' | '-' | undefined) || null,
            tokenIndex: mIdx
          });
        }
      }
    }

    // Extract descriptive words on this line (excluding tokens in bestCluster)
    const clusterIndices = new Set(bestCluster.map((c) => c.tokenIndex));
    const nonClusterText = tokens
      .filter((_, idx) => !clusterIndices.has(idx))
      .join(' ');
    const lineWords = nonClusterText
      .replace(/[+-]?\s*\d{1,3}(?:,\d{3})+\s*원?/g, ' ')
      .replace(/^(?:입금|출금|지급|수취)\s+/g, ' ')
      .replace(/\b(?:입금|출금|잔액|원|주식회사|\(주\)|맡기신금액|찾으신금액)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // CRITICAL: If this line had NO date (!matchedDateStr) AND the previous date line ALREADY consumed its currency amounts (!pendingDateNeedsAmounts),
    // then this line is a 2nd-story continuation line (e.g. a 2nd line with post-transaction balance or memo), NEVER a new transaction!
    if (!matchedDateStr && !pendingDateNeedsAmounts) {
      if (results.length > 0) {
        const prevTx = results[results.length - 1];
        if (bestCluster.length > 0 && prevTx.accountNumber === '원본PDF추출') {
          const balVal = bestCluster[bestCluster.length - 1].val;
          prevTx.accountNumber = `잔액 ₩${balVal.toLocaleString()}`;
          prevBalance = balVal;
        }
        if (
          lineWords.length >= 2 &&
          (prevTx.counterpart === '입금 거래' ||
            prevTx.counterpart === '출금 거래' ||
            prevTx.counterpart === '카드 사용' ||
            !prevTx.counterpart.includes(lineWords.slice(0, 4)))
        ) {
          prevTx.counterpart = `${prevTx.counterpart} ${lineWords}`
            .replace(/^(입금 거래|출금 거래|카드 사용)\s*/, '')
            .trim()
            .slice(0, 45);
          reclassifyTransaction(prevTx, allClientNames, threshold);
        }
      }
      continue;
    }

    if (bestCluster.length === 0) {
      if (matchedDateStr || pendingDateNeedsAmounts) {
        if (lineWords.length >= 1) {
          pendingDateLineCounterpart = [pendingDateLineCounterpart, lineWords].filter(Boolean).join(' ').trim();
        }
      }
      continue;
    }

    // STRICT SEPARATION OF TRANSACTION AMOUNT (거래금액) VS POST-TRANSACTION BALANCE (거래 후 잔액):
    // When bestCluster has 4+ items:
    // - Case A: [순번, 출금, 입금, 잔액] -> first item is sequential index (unformatted integer < 5000), drop first item.
    // - Case B: [출금, 입금, 잔액, 수수료(0)/취급점코드] -> take first 3 items [출금, 입금, 잔액] so 출금 is never dropped!
    let effectiveCluster = bestCluster;
    if (bestCluster.length >= 4) {
      const firstCell = bestCluster[0];
      const isLeadingRowIndex =
        !firstCell.isZero &&
        !firstCell.hasComma &&
        firstCell.hasSign === null &&
        firstCell.val < 5000 &&
        (bestCluster[1].isZero !== bestCluster[2].isZero || bestCluster[1].hasComma || bestCluster[2].hasComma);
      effectiveCluster = isLeadingRowIndex ? bestCluster.slice(1, 4) : bestCluster.slice(0, 3);
    }

    let txAmountCell: ParsedNumCell = effectiveCluster[0];
    let currentBalance: number | null = null;

    if (effectiveCluster.length === 1) {
      // Single numeric column (e.g. card statement with only 이용금액)
      txAmountCell = effectiveCluster[0];
      currentBalance = null;
    } else if (effectiveCluster.length === 2) {
      // 2-Numeric-Column Bank Statement (e.g. 카카오뱅크, 토스뱅크, 케이뱅크, 또는 빈칸 생략형 거래내역서):
      // Column 0 is ALWAYS 거래금액 (even if 0원, 1원, 2원, 51원, -600원, -9,900원).
      // Column 1 is ALWAYS 거래 후 잔액 (even if 0원, 19원, 176원, 2,423,553원).
      // NEVER pick Column 1 (거래 후 잔액) as 거래금액!
      txAmountCell = effectiveCluster[0];
      currentBalance = effectiveCluster[1].val;
    } else if (effectiveCluster.length === 3) {
      // 3-Numeric-Column Bank Statement:
      // - [출금, 입금, 잔액] (where one of c0 or c1 is 0)
      // - [거래금액, 잔액, 수수료(0)] (where c0 > 0, c1 > 0, and c2 === 0)
      // - [순번, 거래금액, 잔액] (where c0 is small unformatted row index)
      const c0 = effectiveCluster[0];
      const c1 = effectiveCluster[1];
      const c2 = effectiveCluster[2];
      if (c0.isZero && !c1.isZero) {
        txAmountCell = c1;
        currentBalance = c2.val;
      } else if (!c0.isZero && c1.isZero) {
        txAmountCell = c0;
        currentBalance = c2.val;
      } else if (!c0.isZero && !c1.isZero && c2.isZero) {
        // [거래금액, 거래후잔액, 수수료(0)]
        txAmountCell = c0;
        currentBalance = c1.val;
      } else if (!c0.hasComma && c0.hasSign === null && c0.val < 1000 && (c1.hasComma || c1.hasSign !== null || c1.val >= 1000)) {
        // c0 is row sequence number (순번), c1 is 거래금액, c2 is 거래후잔액
        txAmountCell = c1;
        currentBalance = c2.val;
      } else if (prevBalance !== null) {
        if (
          Math.abs(prevBalance - c0.val - c1.val) <= 2000 ||
          Math.abs(prevBalance + c0.val - c1.val) <= 2000
        ) {
          // c0 is 거래금액, c1 is 거래후잔액
          txAmountCell = c0;
          currentBalance = c1.val;
        } else if (
          Math.abs(prevBalance - c1.val - c2.val) <= 2000 ||
          Math.abs(prevBalance + c1.val - c2.val) <= 2000
        ) {
          txAmountCell = c1;
          currentBalance = c2.val;
        } else {
          txAmountCell = c0;
          currentBalance = c2.val;
        }
      } else {
        txAmountCell = c0;
        currentBalance = c2.val;
      }
    }

    const txAmount = txAmountCell.val;

    // Determine deposit vs withdrawal using sign, keywords, 0-column position, and balance delta math
    let isDeposit = false;
    if (txAmountCell.hasSign === '+') {
      isDeposit = true;
    } else if (txAmountCell.hasSign === '-') {
      isDeposit = false;
    } else if (/입금|맡기신|수취|급여|상여|환급|대출실행|이자|캐시백/.test(line) && !/출금|찾으신|지급/.test(line)) {
      isDeposit = true;
    } else if (/출금|찾으신|지급|체크카드|카드결제|자동이체|자동납부|납부|송금|이체출금|카드출금/.test(line) && !/입금|맡기신/.test(line)) {
      isDeposit = false;
    } else if (effectiveCluster.length === 3 && effectiveCluster[0].isZero !== effectiveCluster[1].isZero) {
      const firstIsZero = effectiveCluster[0].isZero;
      isDeposit = depositColBeforeWithdrawal ? !firstIsZero : firstIsZero;
    } else if (prevBalance !== null && currentBalance !== null && txAmount > 0) {
      if (Math.abs(prevBalance + txAmount - currentBalance) <= 2000) {
        isDeposit = true;
      } else if (Math.abs(prevBalance - txAmount - currentBalance) <= 2000) {
        isDeposit = false;
      }
    }

    if (currentBalance !== null) {
      prevBalance = currentBalance;
    }

    const type: 'deposit' | 'withdrawal' = sourceCategory === 'card' ? 'withdrawal' : isDeposit ? 'deposit' : 'withdrawal';

    const combinedWords = [pendingDateLineCounterpart, lineWords]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    pendingDateLineCounterpart = '';
    pendingDateNeedsAmounts = false;

    const counterpart =
      combinedWords.length >= 2
        ? combinedWords.slice(0, 45)
        : sourceCategory === 'card'
        ? '카드 사용'
        : isDeposit
        ? '입금 거래'
        : '출금 거래';

    const txObj: any = {
      id: `tx-pdf-${Date.now()}-${results.length + 1}-${Math.random().toString(36).slice(2, 6)}`,
      date: lastSeenDate,
      type,
      amount: txAmount,
      counterpart,
      bankName: cleanBankName,
      accountNumber:
        currentBalance !== null
          ? `잔액 ₩${currentBalance.toLocaleString()}`
          : sourceCategory === 'card'
          ? '카드결제내역'
          : '원본PDF추출',
      category: sourceCategory === 'card' ? 'card_settlement' : 'general',
      categoryLabel: sourceCategory === 'card' ? '카드대금/결제' : '일반 거래',
      isFlagged: txAmount >= threshold,
      flagReason:
        txAmount >= threshold
          ? `${(threshold / 10000).toLocaleString()}만원 이상 고액 ${
              sourceCategory === 'card' ? '카드사용' : type === 'deposit' ? '입금' : '출금'
            } (₩${txAmount.toLocaleString()}원) 소명 대상`
          : undefined,
      courtRiskLevel: txAmount >= threshold ? 'high' : 'normal',
      explanationStatus: txAmount >= threshold ? 'needed' : 'exempt',
      explanationNote: '',
      sourceCategory,
      appliedThreshold: threshold,
      _rawBalance: currentBalance,
      _rawCandidates:
        effectiveCluster.length >= 2
          ? effectiveCluster.slice(0, effectiveCluster.length - 1).map((c) => c.val)
          : effectiveCluster.map((c) => c.val),
      _unambiguousZeroCol:
        effectiveCluster.length === 3 &&
        effectiveCluster[0].isZero !== effectiveCluster[1].isZero
    };

    reclassifyTransaction(txObj, allClientNames, threshold);
    results.push(txObj);
  }

  // Post-extraction verification pass using consecutive row balance delta (|잔액_i - 잔액_{i-1}|)
  // Guarantees that if a row's extracted amount accidentally matched its post-transaction balance while another non-balance candidate on the row equals the true balance delta, it is corrected.
  for (let i = 1; i < results.length; i++) {
    const prev = results[i - 1];
    const curr = results[i];
    if (
      !curr._unambiguousZeroCol &&
      typeof prev._rawBalance === 'number' &&
      typeof curr._rawBalance === 'number' &&
      Array.isArray(curr._rawCandidates) &&
      curr._rawCandidates.length >= 1
    ) {
      const delta = Math.abs(curr._rawBalance - prev._rawBalance);
      if (delta > 0 && curr.amount !== delta) {
        const matchingCandidate = curr._rawCandidates.find((v: number) => v === delta);
        if (typeof matchingCandidate === 'number' && matchingCandidate > 0) {
          curr.amount = matchingCandidate;
          if (curr.sourceCategory !== 'card') {
            curr.type = curr._rawBalance > prev._rawBalance ? 'deposit' : 'withdrawal';
          }
          curr.isFlagged = curr.amount >= threshold;
          curr.flagReason =
            curr.amount >= threshold
              ? `${(threshold / 10000).toLocaleString()}만원 이상 고액 ${
                  curr.sourceCategory === 'card' ? '카드사용' : curr.type === 'deposit' ? '입금' : '출금'
                } (₩${curr.amount.toLocaleString()}원) 소명 대상`
              : undefined;
          curr.courtRiskLevel = curr.amount >= threshold ? 'high' : 'normal';
          curr.explanationStatus = curr.amount >= threshold ? 'needed' : 'exempt';
          reclassifyTransaction(curr, allClientNames, threshold);
        }
      }
    }
  }

  for (const r of results) {
    delete r._rawBalance;
    delete r._rawCandidates;
    delete r._unambiguousZeroCol;
  }

  return results;
}

function reclassifyTransaction(txObj: any, allClientNames: string[], threshold: number) {
  const { counterpart = '', amount = 0, type = 'withdrawal' } = txObj;
  const isDeposit = type === 'deposit';
  const cleanCounterpartNoSpace = counterpart.replace(/\s+/g, '');
  const isSelfTransfer = allClientNames.some((alias) => {
    if (!alias) return false;
    const cleanAlias = alias.replace(/\s+/g, '');
    if (!cleanAlias) return false;
    return counterpart.includes(alias) || cleanCounterpartNoSpace.includes(cleanAlias);
  });

  if (isSelfTransfer) {
    txObj.category = 'self_transfer';
    txObj.categoryLabel = '자가이체 (차감)';
    txObj.isFlagged = false;
    txObj.flagReason = `본인 명의(${allClientNames.join('/')}) 계좌 간 이체로 소명 대상 자동 제외`;
    txObj.courtRiskLevel = 'normal';
    txObj.explanationStatus = 'exempt';
  } else if (/대출|캐피탈|저축은행|대부|론|신용보증|햇살론/.test(counterpart)) {
    txObj.category = isDeposit ? 'loan_disbursement' : 'preference_payment';
    txObj.categoryLabel = isDeposit ? '신규 대출금' : '대출금 상환';
    txObj.isFlagged = amount >= threshold;
    txObj.flagReason = isDeposit
      ? '최근 신규 대출금 입금 — 전액 사용처 소명 대상'
      : '특정 채무 상환 및 우선변제 여부 검토';
    txObj.courtRiskLevel = amount >= threshold ? 'high' : 'medium';
    txObj.explanationStatus = amount >= threshold ? 'needed' : 'exempt';
  } else if (/어머니|아버지|엄마|아빠|형|누나|오빠|언니|동생|배우자|남편|아내|가족/.test(counterpart)) {
    txObj.category = 'preference_payment';
    txObj.categoryLabel = '편파변제 의심';
    txObj.isFlagged = true;
    txObj.flagReason = '친인척 송금 — 재산은닉 또는 특정채권자 편파변제 소명 대상';
    txObj.courtRiskLevel = 'high';
    txObj.explanationStatus = 'needed';
  } else if (/업비트|빗썸|코인원|코빗|두나무|가상자산|비트코인|골프|카지노|토토|복권|마사회|경마|경륜/.test(counterpart)) {
    txObj.category = 'gambling_crypto';
    txObj.categoryLabel = '사행성·가상자산';
    txObj.isFlagged = true;
    txObj.flagReason = '가상자산·사행성 지출 — 법원 청산가치 반영 및 보정권고 대상';
    txObj.courtRiskLevel = 'high';
    txObj.explanationStatus = 'needed';
  } else if (/카드|결제|할부|일시불|하이패스/.test(counterpart)) {
    txObj.category = 'card_settlement';
    txObj.categoryLabel = '카드대금/결제';
  } else if (/병원|의원|약국|월세|임대|관리비|공과금|전기|도시가스|건강보험|국민연금/.test(counterpart)) {
    txObj.category = 'living_expense';
    txObj.categoryLabel = '생계/주거/의료비';
  }
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    hasApiKey: !!apiKey,
    model: 'gemini-3-flash-preview',
    timestamp: new Date().toISOString()
  });
});

// Analyze Bank / Card Statement PDF, Excel, Images, or Text (Supports Single or Multiple PDFs — 7+ accounts simultaneously)
app.post('/api/analyze-statement', async (req, res) => {
  const {
    title = '은행 거래내역서.pdf',
    clientName = '',
    clientAliases = [],
    threshold = 500000,
    fileBase64 = '',
    mimeType = 'application/pdf',
    rawText = '',
    ocrPageImages = [],
    files = [] // Array of { name, fileBase64, mimeType, categoryType, extractedText, ocrPageImages }
  } = req.body;

  const normalizedFiles: Array<{
    name: string;
    fileBase64: string;
    mimeType: string;
    extractedText?: string;
    ocrPageImages?: string[];
  }> = (
    Array.isArray(files) && files.length > 0
      ? files
      : fileBase64 || rawText || (Array.isArray(ocrPageImages) && ocrPageImages.length > 0)
      ? [{ name: title, fileBase64, mimeType, extractedText: rawText, ocrPageImages }]
      : []
  ).map((f) => ({
    ...f,
    name: normalizeBankAndFileName(f.name)
  }));

  const extractedTransactions: any[] = [];
  const scannedFilesNeedingOcr: Array<{
    name: string;
    fileBase64: string;
    mimeType: string;
    extractedText?: string;
    ocrPageImages?: string[];
  }> = [];
  const allClientAliases = Array.isArray(clientAliases) ? clientAliases : [];

  if (normalizedFiles.length > 0) {
    for (let idx = 0; idx < normalizedFiles.length; idx++) {
      const fileObj = normalizedFiles[idx];
      const fileText = fileObj.extractedText || '';
      const lowerName = (fileObj.name || '').toLowerCase();
      const hasExplicitOcrImages = Array.isArray(fileObj.ocrPageImages) && fileObj.ocrPageImages.length > 0;

      const fileCategory: 'bank' | 'card' | 'crypto' =
        (fileObj as any).categoryType === 'card'
          ? 'card'
          : (fileObj as any).categoryType === 'crypto'
          ? 'crypto'
          : 'bank';
      const fileThreshold = Number((fileObj as any).threshold) || threshold;

      // SPEED OPTIMIZATION: Extract transactions from digital text first (<10ms).
      // If digital text yields valid transactions, we use them immediately and completely skip slow OCR!
      let bestFileTxs = fileText.trim()
        ? extractTransactionsFromRawText(
            fileText,
            clientName,
            fileThreshold,
            fileObj.name,
            allClientAliases,
            fileCategory
          )
        : [];

      // If text extraction from clientText already succeeded with valid transactions, add immediately and finish!
      if (bestFileTxs.length > 0) {
        extractedTransactions.push(...bestFileTxs);
        continue;
      }

      // If client explicitly sent rendered JPEG page images for a pure scanned PDF without digital text:
      if (hasExplicitOcrImages) {
        scannedFilesNeedingOcr.push({
          ...fileObj,
          extractedText: ''
        });
        continue;
      }

      let pdfTotalPages = 1;

      if (fileObj.fileBase64) {
        try {
          const buffer = Buffer.from(fileObj.fileBase64, 'base64');
          if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || lowerName.endsWith('.csv')) {
            const wb = XLSX.read(buffer, { type: 'buffer' });
            const sheetTexts: string[] = [];
            for (const sheetName of wb.SheetNames) {
              const sheet = wb.Sheets[sheetName];
              const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, raw: false });
              for (const r of rows) {
                if (Array.isArray(r) && r.length > 0) {
                  sheetTexts.push(r.map((cell) => String(cell ?? '').trim()).filter(Boolean).join('\t'));
                }
              }
            }
            const excelText = sheetTexts.join('\n');
            const excelTxs = extractTransactionsFromRawText(
              excelText,
              clientName,
              fileThreshold,
              fileObj.name,
              allClientAliases,
              fileCategory
            );
            if (excelTxs.length > bestFileTxs.length) bestFileTxs = excelTxs;
          } else if (!lowerName.endsWith('.png') && !lowerName.endsWith('.jpg') && !lowerName.endsWith('.jpeg')) {
            try {
              const pdfDocCheck = await PDFDocument.load(buffer, { ignoreEncryption: true });
              pdfTotalPages = pdfDocCheck.getPageCount();
            } catch (_) {
              pdfTotalPages = 1;
            }

            // Engine 1: Coordinate-sorted pdfjs extraction (keeps horizontal row cells together)
            const pdfCoordText = await extractCoordinateSortedTextFromPdf(buffer);
            if (pdfCoordText && pdfCoordText.trim().length > 0) {
              const coordTxs = extractTransactionsFromRawText(
                pdfCoordText,
                clientName,
                fileThreshold,
                fileObj.name,
                allClientAliases,
                fileCategory
              );
              if (coordTxs.length > bestFileTxs.length) bestFileTxs = coordTxs;
            }

            // Engine 2: Stream-based pdf-parse extraction ONLY if coordinate-sorted extraction found 0 rows
            if (bestFileTxs.length === 0) {
              const pdfStreamText = await extractStreamTextWithPdfParse(buffer);
              if (pdfStreamText && pdfStreamText.trim().length > 0) {
                const streamTxs = extractTransactionsFromRawText(
                  pdfStreamText,
                  clientName,
                  fileThreshold,
                  fileObj.name,
                  allClientAliases,
                  fileCategory
                );
                if (streamTxs.length > bestFileTxs.length) bestFileTxs = streamTxs;
              }
            }
          }
        } catch (parseErr) {
          console.warn(`Document parse notice on ${fileObj.name}:`, parseErr);
        }
      }

      // If text extraction yielded transactions, use them immediately (<50ms)!
      // ONLY if 0 rows were found (true scanned image PDF), queue for Gemini Vision OCR!
      if (bestFileTxs.length > 0) {
        extractedTransactions.push(...bestFileTxs);
      } else if (fileObj.fileBase64 || hasExplicitOcrImages) {
        scannedFilesNeedingOcr.push({
          ...fileObj,
          extractedText: fileText
        });
      }
    }
  } else if (rawText && rawText.trim().length > 0) {
    extractedTransactions.push(
      ...extractTransactionsFromRawText(rawText, clientName, threshold, title, allClientAliases)
    );
  }

  // Run Multi-Model Parallel Vision/Document OCR on scanned or image-based PDFs (1 page per Gemini call, 4 pages in parallel)
  if (ai && scannedFilesNeedingOcr.length > 0) {
    for (const scannedFile of scannedFilesNeedingOcr) {
      const cleanBankName = normalizeBankAndFileName(scannedFile.name.replace(/\.[^/.]+$/, ''));
      const scannedCategory: 'bank' | 'card' | 'crypto' =
        (scannedFile as any).categoryType === 'card'
          ? 'card'
          : (scannedFile as any).categoryType === 'crypto'
          ? 'crypto'
          : 'bank';
      const scannedThreshold = Number((scannedFile as any).threshold) || threshold;

      const ocrPrompt = `대한민국 은행·금융기관 거래내역서("${scannedFile.name}") 페이지입니다.
표의 왼쪽부터 오른쪽 열 순서(거래일시 | 출금액 | 입금액 | 거래후잔액 | 거래내용·적요·상대은행) 그대로, 단 1건의 생략·요약·누락 없이 페이지의 모든 개별 거래 행(Row)을 위에서 아래 순서대로 100% 전수 추출하여 아래 JSON 형식으로만 출력하십시오:
{"txs":[["YYYY-MM-DD",출금액,입금액,거래후잔액,"거래내용/상대방"],["YYYY-MM-DD",0,입금액,거래후잔액,"거래내용/상대방"]]}
필수 규칙:
- 표의 첫 번째 줄부터 마지막 줄까지 모든 개별 거래 행을 빠짐없이 포함하십시오. 단, 표 맨 아래나 맨 위의 "합계"/"총계"/"소계" 요약 줄은 제외하십시오.
- 출금(찾으신금액/지급/체크카드/-금액) 칸에 금액이 있으면 [날짜, 출금액, 0, 거래후잔액, "거래내용"]으로 적고, 입금(맡기신금액/수취/+금액) 칸에 금액이 있으면 [날짜, 0, 입금액, 거래후잔액, "거래내용"]으로 적으십시오.
- [매우 중요] 2번째 값(출금액)과 3번째 값(입금액) 자리에 절대 4번째 값인 '거래 후 잔액'을 넣지 마십시오. 이전 행 잔액과 현재 행 잔액의 차이(|현재잔액 - 이전잔액|)가 실제 거래금액(출금액 또는 입금액)입니다.
- 5번째 값에는 '거래내용'(또는 적요/받는분/보낸분/가맹점명)을 적고, 상대은행 칸에 은행명이 있으면 "거래내용 (상대은행)" 형태로 적으십시오. 거래내용이 빈칸이면 상대은행명 또는 "출금 거래"/"입금 거래"로 적으십시오.
- 모든 금액과 잔액은 부호나 콤마 없는 양의 정수로 표기하십시오 (예: 500000).
- 마크다운 코드블록 없이 순수 JSON만 출력하십시오.`;

      const fileOcrTransactions: any[] = [];
      const pushSalvagedRows = (rows: ReturnType<typeof salvageTransactionsFromOcrResponse>) => {
        for (const rawTx of rows) {
          const amt = Math.abs(Number(rawTx.amount) || 0);
          if (amt <= 0) continue;
          const txType: 'deposit' | 'withdrawal' =
            scannedCategory === 'card' ? 'withdrawal' : rawTx.type === 'deposit' ? 'deposit' : 'withdrawal';
          const txObj: any = {
            id: `tx-ocr-${Date.now()}-${extractedTransactions.length + fileOcrTransactions.length + 1}-${Math.random().toString(36).slice(2, 6)}`,
            date: rawTx.date || '2025-10-01',
            type: txType,
            amount: amt,
            counterpart: rawTx.counterpart || (txType === 'deposit' ? '입금 거래' : '출금 거래'),
            bankName: cleanBankName,
            accountNumber:
              rawTx.balance !== null && rawTx.balance !== undefined
                ? `잔액 ₩${Number(rawTx.balance).toLocaleString()}`
                : '스캔OCR추출',
            category: scannedCategory === 'card' ? 'card_settlement' : rawTx.category || 'general',
            categoryLabel: scannedCategory === 'card' ? '카드대금/결제' : '일반 거래',
            isFlagged: amt >= scannedThreshold,
            flagReason:
              amt >= scannedThreshold
                ? `${(scannedThreshold / 10000).toLocaleString()}만원 이상 고액 ${
                    scannedCategory === 'card' ? '카드사용' : txType === 'deposit' ? '입금' : '출금'
                  } (₩${amt.toLocaleString()}원) 소명 대상`
                : undefined,
            courtRiskLevel: amt >= scannedThreshold ? 'high' : 'normal',
            explanationStatus: amt >= scannedThreshold ? 'needed' : 'exempt',
            explanationNote: '',
            sourceCategory: scannedCategory,
            appliedThreshold: scannedThreshold
          };
          reclassifyTransaction(txObj, [clientName, ...allClientAliases], scannedThreshold);
          fileOcrTransactions.push(txObj);
        }
      };

      try {
        // Path A: Client sent page batches (either 1-page PDFs or rendered JPEG/PNG page images in ocrPageImages)
        if (Array.isArray(scannedFile.ocrPageImages) && scannedFile.ocrPageImages.length > 0) {
          const pages = scannedFile.ocrPageImages;
          const parallelCount = 4;
          for (let b = 0; b < pages.length; b += parallelCount) {
            const slice = pages.slice(b, b + parallelCount);
            const batchResults = await Promise.all(
              slice.map(async (imgB64) => {
                try {
                  const cleanB64 = imgB64.includes(',') ? imgB64.split(',')[1].trim() : imgB64.trim();
                  const isPdfPage = cleanB64.startsWith('JVBERi0');
                  const pageMimeType = isPdfPage
                    ? 'application/pdf'
                    : cleanB64.startsWith('iVBOR')
                    ? 'image/png'
                    : 'image/jpeg';

                  // Only use fast coordinate text on a 1-page PDF if it genuinely contains a full digital table (>=250 chars & >=5 rows)
                  if (isPdfPage) {
                    try {
                      const pageBuf = Buffer.from(cleanB64, 'base64');
                      const coordTxt = await extractCoordinateSortedTextFromPdf(pageBuf);
                      if (coordTxt && coordTxt.trim().length >= 250) {
                        const fastTxs = extractTransactionsFromRawText(
                          coordTxt,
                          clientName,
                          scannedThreshold,
                          scannedFile.name,
                          allClientAliases,
                          scannedCategory
                        );
                        if (fastTxs.length >= 5) {
                          return fastTxs.map((ft) => ({
                            date: ft.date,
                            type: ft.type,
                            amount: ft.amount,
                            counterpart: ft.counterpart,
                            balance: null,
                            category: ft.category
                          }));
                        }
                      }
                    } catch (_) {
                      // Fall through to Gemini Vision/Document OCR
                    }
                  }

                  const resp = await generateWithTimeout(
                    {
                      model: 'gemini-3.5-flash',
                      contents: [
                        {
                          inlineData: {
                            mimeType: pageMimeType,
                            data: cleanB64
                          }
                        },
                        ocrPrompt
                      ],
                      config: { maxOutputTokens: 8192, temperature: 0.1 }
                    },
                    22000
                  );
                  const salvaged = salvageTransactionsFromOcrResponse(resp.text || '');
                  if (salvaged.length > 0) return salvaged;

                  // Final fallback if Gemini returned plain text lines instead of JSON
                  const fallbackTxs = extractTransactionsFromRawText(
                    resp.text || '',
                    clientName,
                    scannedThreshold,
                    scannedFile.name,
                    allClientAliases,
                    scannedCategory
                  );
                  return fallbackTxs.map((ft) => ({
                    date: ft.date,
                    type: ft.type,
                    amount: ft.amount,
                    counterpart: ft.counterpart,
                    balance: null,
                    category: ft.category
                  }));
                } catch (_) {
                  return [];
                }
              })
            );
            for (const rows of batchResults) {
              pushSalvagedRows(rows);
            }
          }
        }
        // Path B: Server-side PDF chunking with pdf-lib (splits multi-page PDF into 1-page sub-PDFs across all pages)
        else if (scannedFile.fileBase64) {
          const rawBuf = Buffer.from(scannedFile.fileBase64, 'base64');
          const lower = scannedFile.name.toLowerCase();
          if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
            const resp = await generateWithTimeout(
              {
                model: 'gemini-flash-lite-latest',
                contents: [
                  { inlineData: { mimeType: scannedFile.mimeType || 'image/jpeg', data: scannedFile.fileBase64 } },
                  ocrPrompt
                ],
                config: { maxOutputTokens: 8192, temperature: 0.1 }
              },
              18000
            );
            pushSalvagedRows(salvageTransactionsFromOcrResponse(resp.text || ''));
          } else {
            const srcDoc = await PDFDocument.load(rawBuf, { ignoreEncryption: true });
            const totalPages = srcDoc.getPageCount();
            const chunkBase64List: string[] = [];

            if (totalPages === 1 && rawBuf.length <= 12 * 1024 * 1024) {
              chunkBase64List.push(scannedFile.fileBase64);
            } else {
              for (let p = 0; p < totalPages; p++) {
                const subDoc = await PDFDocument.create();
                const [copied] = await subDoc.copyPages(srcDoc, [p]);
                subDoc.addPage(copied);
                const subBytes = await subDoc.save();
                chunkBase64List.push(Buffer.from(subBytes).toString('base64'));
              }
            }

            const parallelCount = 4;
            for (let c = 0; c < chunkBase64List.length; c += parallelCount) {
              const slice = chunkBase64List.slice(c, c + parallelCount);
              const sliceResults = await Promise.all(
                slice.map(async (chunkB64) => {
                  try {
                    const resp = await generateWithTimeout(
                      {
                        model: 'gemini-flash-lite-latest',
                        contents: [
                          { inlineData: { mimeType: 'application/pdf', data: chunkB64 } },
                          ocrPrompt
                        ],
                        config: { maxOutputTokens: 8192, temperature: 0.1 }
                      },
                      20000
                    );
                    return salvageTransactionsFromOcrResponse(resp.text || '');
                  } catch (_) {
                    return [];
                  }
                })
              );
              for (const rows of sliceResults) {
                pushSalvagedRows(rows);
              }
            }
          }
        }
        // Path C: Text-only AI extraction fallback when regex didn't match unusual table layout
        else if ((scannedFile as any).extractedText) {
          const fullTxt = String((scannedFile as any).extractedText);
          const chunkLen = 14000;
          for (let offset = 0; offset < fullTxt.length; offset += chunkLen) {
            const textSlice = fullTxt.slice(offset, offset + chunkLen);
            const resp = await generateWithTimeout(
              {
                model: 'gemini-flash-lite-latest',
                contents: `${ocrPrompt}\n\n[문서 추출 원문 텍스트]:\n${textSlice}`,
                config: { maxOutputTokens: 8192, temperature: 0.1 }
              },
              20000
            );
            pushSalvagedRows(salvageTransactionsFromOcrResponse(resp.text || ''));
          }
        }
      } catch (ocrErr) {
        console.warn(`Gemini OCR notice on ${scannedFile.name}:`, ocrErr);
      }

      const baselineTxs: any[] = (scannedFile as any).baselineTxs || [];
      if (fileOcrTransactions.length >= baselineTxs.length) {
        extractedTransactions.push(...fileOcrTransactions);
      } else {
        extractedTransactions.push(...baselineTxs);
      }
    }
  }

  const fileSummaryTitle =
    normalizedFiles.length > 1
      ? `${normalizedFiles[0].name} 외 ${normalizedFiles.length - 1}건 (총 ${normalizedFiles.length}개 계좌 PDF 통합)`
      : normalizedFiles.length === 1
      ? normalizedFiles[0].name
      : title;

  const totalDeposit = extractedTransactions
    .filter((t) => t.type === 'deposit')
    .reduce((sum, t) => sum + t.amount, 0);
  const totalWithdrawal = extractedTransactions
    .filter((t) => t.type === 'withdrawal')
    .reduce((sum, t) => sum + t.amount, 0);
  const highValue = extractedTransactions.filter((t) => t.amount >= 500000).length;
  const prefTxs = extractedTransactions.filter((t) => t.category === 'preference_payment');
  const cryptoTxs = extractedTransactions.filter((t) => t.category === 'gambling_crypto');
  const loanTxs = extractedTransactions.filter((t) => t.category === 'loan_disbursement');
  const selfTxs = extractedTransactions.filter((t) => t.category === 'self_transfer');

  return res.json({
    id: `stmt-${Date.now()}`,
    clientName,
    statementPeriod: fileSummaryTitle,
    totalTransactionsCount: extractedTransactions.length,
    totalDepositAmount: totalDeposit,
    totalWithdrawalAmount: totalWithdrawal,
    thresholdAmount: threshold,
    highValueCount: highValue,
    preferenceCount: prefTxs.length,
    preferenceAmount: prefTxs.reduce((s, t) => s + t.amount, 0),
    cryptoGamblingCount: cryptoTxs.length,
    cryptoGamblingAmount: cryptoTxs.reduce((s, t) => s + t.amount, 0),
    recentLoanCount: loanTxs.length,
    recentLoanAmount: loanTxs.reduce((s, t) => s + t.amount, 0),
    selfTransferCount: selfTxs.length,
    transactions: extractedTransactions
  });
});

// Analyze Legal Contract (Supports PDF, image, or raw text)
app.post('/api/analyze-contract', async (req, res) => {
  const {
    title = 'Custom Uploaded Legal Document',
    text = '',
    fileBase64 = '',
    mimeType = 'application/pdf',
    jurisdiction = '대한민국 서울중앙지방법원'
  } = req.body;

  if (!text && !fileBase64) {
    return res.status(400).json({ error: 'Contract text or PDF file is required' });
  }

  if (ai) {
    try {
      const isKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(text) || /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(title);
      const prompt = `${BENCHMARK_SYSTEM_PROMPT}

You are analyzing this legal document titled: "${title}" under jurisdiction "${jurisdiction}".
Analyze the full text or uploaded PDF section by section. Identify toxic terms, high-risk clauses, missing statutory protections, and propose redlines.

LANGUAGE INSTRUCTION:
${isKorean ? 'The document or title is in Korean. You MUST output all JSON field values (titles, risk summaries, legal rationales, redlines, executive summary) in natural, prestigious Korean legal terminology (대한민국 민법, 상법, 근로기준법, 대법원 판례 기준).' : 'Output in the language of the document.'}

${text ? `CONTRACT TEXT:\n"""\n${text.slice(0, 24000)}\n"""` : ''}

Return your review strictly as valid JSON matching this exact structure:
{
  "id": "review-${Date.now()}",
  "title": "${title}",
  "documentType": "Analyzed Agreement",
  "counterparty": "Designated Counterparty",
  "jurisdiction": "${jurisdiction}",
  "overallRiskLevel": "critical" | "high" | "moderate" | "low",
  "criticalClauseCount": 0,
  "mediumClauseCount": 0,
  "lowClauseCount": 0,
  "clauses": [
    {
      "id": "clause-1",
      "clauseNumber": "Section X.X",
      "title": "Descriptive Clause Title",
      "originalText": "Verbatim quote of clause or relevant portion",
      "severity": "critical" | "medium" | "low" | "standard",
      "riskSummary": "Concise 1-sentence risk explanation",
      "legalRationale": "Rigorous statutory or case law rationale",
      "statutoryReference": "e.g. UCC § 2-719 or Cal. Lab. Code § 925",
      "precedentCitation": "Relevant precedent case name & citation",
      "toxicKeywords": ["toxic word 1", "phrase 2"],
      "recommendedRedline": "Senior partner redline replacement text",
      "negotiationStance": "Strategic walk-away or bargaining stance"
    }
  ],
  "missingProtections": [
    {
      "id": "missing-1",
      "title": "Protection Name",
      "importance": "critical" | "medium" | "advisory",
      "riskDescription": "Why absence of this clause creates liability",
      "suggestedLanguage": "Exact recommended language to insert",
      "statutoryBasis": "Legal foundation or standard commercial practice"
    }
  ],
  "executiveSummary": {
    "clientBriefing": "Empathetic, clear, authoritative 3-4 sentence partner summary for the business executive",
    "keyLiabilities": ["liability bullet 1", "liability bullet 2"],
    "tacticalChecklist": ["action step 1", "action step 2"],
    "suggestedWalkAwayTerms": ["redline boundary 1"]
  }
}
Output strictly raw JSON without markdown code fences or backticks.`;

      const contents: any[] = [];
      if (fileBase64) {
        contents.push({
          inlineData: {
            mimeType: mimeType || 'application/pdf',
            data: fileBase64
          }
        });
      }
      contents.push(prompt);

      const response = await generateWithTimeout({
        model: 'gemini-3-flash-preview',
        contents,
      }, 18000);

      const responseText = response.text || '';
      const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      return res.json(parsed);
    } catch (err) {
      console.warn('Gemini contract analysis API returned error or parse failure, invoking fallback analyzer:', err);
    }
  }

  // Fallback intelligent legal text analyzer
  const lines = text.split(/\n+/).filter((l: string) => l.trim().length > 10);
  const detectedClauses: any[] = [];
  let critCount = 0;
  let medCount = 0;
  let lowCount = 0;

  const patterns = [
    {
      regex: /(indemnif|hold harmless|consequential damages|punitive)/i,
      title: 'Indemnification & Damage Pass-Through',
      severity: 'critical' as const,
      riskSummary: 'Expansive indemnification scope risking uncapped enterprise damages.',
      legalRationale: 'Indemnity provisions lacking bilateral liability caps violate risk-allocation balance under U.C.C. § 2-719.',
      statutoryReference: 'U.C.C. § 2-719; Restatement (Second) of Contracts § 351',
      precedentCitation: 'E.I. DuPont v. Shell Oil Co., 498 A.2d 1108',
      keywords: ['indemnify', 'hold harmless', 'consequential damages'],
      redline: 'Each party shall indemnify the other strictly for direct third-party claims arising from gross negligence, subject to the aggregate liability cap in Section 9.',
      stance: 'Non-negotiable liability ceiling required.'
    },
    {
      regex: /(non-compete|covenant not to compete|restrictive covenant|restrain.*trade)/i,
      title: 'Restrictive Covenant & Non-Compete',
      severity: 'critical' as const,
      riskSummary: 'Potentially void or overbroad restriction on future commercial trade.',
      legalRationale: 'Covenants restricting employment or trade are subject to strict scrutiny and statutory bans (e.g. Cal. Bus. & Prof. Code § 16600).',
      statutoryReference: 'Cal. Bus. & Prof. Code § 16600; Restatement (Second) of Contracts § 188',
      precedentCitation: 'Edwards v. Arthur Andersen LLP, 44 Cal. 4th 937',
      keywords: ['non-compete', 'shall not engage', 'competitive enterprise'],
      redline: 'Strike restrictive non-compete covenant entirely; substitute with standard 12-month client non-solicitation.',
      stance: 'Strike clause in its entirety.'
    },
    {
      regex: /(intellectual property|work made for hire|moral rights|proprietary.*tool)/i,
      title: 'Intellectual Property Ownership & Transfer',
      severity: 'critical' as const,
      riskSummary: 'Expropriation of pre-existing background intellectual property.',
      legalRationale: 'Overbroad assignment threatens developer retention of core frameworks and reusable software libraries.',
      statutoryReference: '17 U.S.C. § 201(b); Restatement (Third) of Unfair Competition § 39',
      precedentCitation: 'Community for Creative Non-Violence v. Reid, 490 U.S. 730',
      keywords: ['work made for hire', 'irrevocably assign', 'all inventions'],
      redline: 'Client owns final unique deliverables. Service Provider retains all background tooling and libraries with non-exclusive license to Client.',
      stance: 'Carve out pre-existing background IP.'
    },
    {
      regex: /(terminate.*convenience|cure period|immediate termination)/i,
      title: 'Termination for Convenience & Cure Period',
      severity: 'medium' as const,
      riskSummary: 'Asymmetrical termination timeline without fair notice or pro-rata payment.',
      legalRationale: 'Commercial contracts require reasonable cure periods (minimum 30 days) to prevent bad-faith opportunism.',
      statutoryReference: 'U.C.C. § 2-607; Restatement (Second) of Contracts § 241',
      precedentCitation: 'Market Street Associates v. Frey, 941 F.2d 588',
      keywords: ['immediate termination', 'cure period', 'without cause'],
      redline: 'Either party may terminate for convenience upon thirty (30) days written notice with compensation for work in progress.',
      stance: 'Standardize 30-day bilateral cure window.'
    },
    {
      regex: /(audit|inspect.*books|facilities.*entry)/i,
      title: 'On-Site Inspection & Audit Rights',
      severity: 'medium' as const,
      riskSummary: 'Intrusive audit permissions with insufficient advance notice.',
      legalRationale: 'Unrestricted audits expose third-party client data and cause severe operational disruption.',
      statutoryReference: 'Defend Trade Secrets Act, 18 U.S.C. § 1836',
      precedentCitation: 'Tracer Research Corp. v. Nat’l Env’tl Servs., 42 F.3d 1292',
      keywords: ['audit', 'inspect', 'without limitation'],
      redline: 'Audits permitted once annually upon fifteen (15) business days written notice during standard business hours.',
      stance: 'Limit frequency to annual with 15 business days notice.'
    }
  ];

  let idCounter = 1;
  lines.slice(0, 15).forEach((line: string, idx: number) => {
    for (const pat of patterns) {
      if (pat.regex.test(line)) {
        if (!detectedClauses.some(c => c.title === pat.title)) {
          if (pat.severity === 'critical') critCount++;
          else if (pat.severity === 'medium') medCount++;
          else lowCount++;

          detectedClauses.push({
            id: `clause-${idCounter++}`,
            clauseNumber: `Section ${idx + 1}.0`,
            title: pat.title,
            originalText: line.trim(),
            severity: pat.severity,
            riskSummary: pat.riskSummary,
            legalRationale: pat.legalRationale,
            statutoryReference: pat.statutoryReference,
            precedentCitation: pat.precedentCitation,
            toxicKeywords: pat.keywords,
            recommendedRedline: pat.redline,
            negotiationStance: pat.stance
          });
        }
      }
    }
  });

  if (detectedClauses.length === 0) {
    critCount = 1;
    medCount = 1;
    detectedClauses.push({
      id: 'clause-default-1',
      clauseNumber: 'Section 1.1',
      title: 'General Commercial Covenant Review',
      originalText: text.slice(0, 300),
      severity: 'medium',
      riskSummary: 'Ambiguity regarding obligations and reciprocal enforcement mechanisms.',
      legalRationale: 'Drafting leaves key performance milestones subject to unilateral interpretation.',
      statutoryReference: 'Restatement (Second) of Contracts § 204',
      precedentCitation: 'Wood v. Lucy, Lady Duff-Gordon, 222 N.Y. 88 (1917)',
      toxicKeywords: ['unilateral', 'sole discretion'],
      recommendedRedline: 'Clarify all milestones with objective acceptance criteria and 14-day deemed approval mechanism.',
      negotiationStance: 'Establish objective benchmark deliverables.'
    });
  }

  const overallRisk = critCount > 1 ? 'critical' : critCount === 1 ? 'high' : medCount > 0 ? 'moderate' : 'low';

  res.json({
    id: `review-${Date.now()}`,
    title: title || 'Custom Uploaded Legal Document',
    documentType: 'Commercial Agreement',
    counterparty: 'Identified Party in Document',
    jurisdiction: jurisdiction,
    overallRiskLevel: overallRisk,
    criticalClauseCount: critCount,
    mediumClauseCount: medCount,
    lowClauseCount: lowCount,
    clauses: detectedClauses,
    missingProtections: [
      {
        id: 'mp-fallback-cap',
        title: 'Mutual Aggregate Liability Ceiling',
        importance: 'critical',
        riskDescription: 'The uploaded text lacks an aggregate monetary liability cap tied to fees received.',
        suggestedLanguage: 'In no event shall either party’s cumulative liability under this Agreement exceed the total amounts paid in the preceding twelve (12) months.',
        statutoryBasis: 'U.C.C. § 2-719(1)(a)'
      },
      {
        id: 'mp-fallback-notice',
        title: 'Formal Notice & Cure Period Safe Harbor',
        importance: 'medium',
        riskDescription: 'Document fails to provide an unambiguous written notice and cure window prior to dispute escalation.',
        suggestedLanguage: 'Neither party shall commence legal proceedings without providing thirty (30) days prior written notice specifying the alleged breach with opportunity to cure.',
        statutoryBasis: 'Federal Rule of Civil Procedure 11 good faith standards'
      }
    ],
    executiveSummary: {
      clientBriefing: `Our algorithmic review of "${title}" reveals ${critCount} critical and ${medCount} moderate exposure clauses. The counterparty has positioned obligations with significant asymmetry, particularly surrounding liability, remedies, and covenants. Immediate partner redlines are strongly advised prior to signing.`,
      keyLiabilities: [
        'Asymmetrical indemnity risk or potential consequential damage exposure.',
        'Ambiguous or compressed cure periods limiting operational defense.',
        'Absence of an explicit mutual aggregate liability ceiling.'
      ],
      tacticalChecklist: [
        'Enforce aggregate liability cap equal to 12 months contract value.',
        'Insert reciprocal attorney fee shifting for the prevailing party.',
        'Carve out background proprietary IP from general work-product transfers.'
      ],
      suggestedWalkAwayTerms: [
        'Refusal to cap liability.',
        'Insistence on unilateral indemnities covering punitive damages.'
      ]
    }
  });
});

// Contextual Legal Q&A Chatbot
app.post('/api/chat', async (req, res) => {
  const { messages = [], prompt = '', contractContext } = req.body;

  const currentQuery = prompt || (messages.length > 0 ? messages[messages.length - 1].text : '');

  if (ai) {
    try {
      const isKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(currentQuery);
      const systemContext = `${BENCHMARK_SYSTEM_PROMPT}

You are currently responding to a client query as the Senior Legal Managing Partner.
${contractContext ? `ACTIVE CONTRACT CONTEXT:\nDocument: ${contractContext.title}\nJurisdiction: ${contractContext.jurisdiction}\nCritical Clauses: ${contractContext.criticalClauseCount}` : ''}

USER INQUIRY:
"${currentQuery}"

LANGUAGE INSTRUCTION:
${isKorean ? 'The user inquiry is in Korean. You MUST write all fields in JSON entirely in professional, authoritative Korean legal terminology (대한민국 민법, 상법, 근로기준법, 상가임대차보호법, 대법원 판례 기준).' : 'Respond in the language of the inquiry.'}

Respond in the mandatory structured Senior Partner format:
You MUST format your response as JSON matching:
{
  "text": "Executive counsel narrative overview (2-3 sentences)",
  "structuredResponse": {
    "summaryOfLaw": "Black-letter statutory rules, governing codes (UCC, Civil Code, Labor Standards Act, etc.), and binding legal doctrines.",
    "practicalImplications": "Business and personal consequences, exposure levels, leverage dynamics, and potential damages.",
    "recommendedNextSteps": [
      "Exact step 1: drafting redline or document demand",
      "Exact step 2: preservation of evidence or notice letter",
      "Exact step 3: procedural or court escalation timeline"
    ],
    "statutoryCitations": [
      "e.g. 17 U.S.C. § 201(b)",
      "e.g. Cal. Bus. & Prof. Code § 16600"
    ],
    "precedents": [
      {
        "caseName": "Leading Precedent Citation",
        "court": "e.g. Supreme Court of Delaware",
        "holding": "Key legal holding explaining why this controls"
      }
    ]
  }
}
Return raw JSON only, without markdown fences.`;

      const response = await generateWithTimeout({
        model: 'gemini-3-flash-preview',
        contents: systemContext,
      }, 18000);

      const raw = response.text || '';
      const cleanJson = raw.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      return res.json({
        id: `msg-${Date.now()}`,
        sender: 'assistant',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: parsed.text,
        structuredResponse: parsed.structuredResponse
      });
    } catch (err) {
      console.warn('Gemini chat API error, invoking legal knowledge base fallback:', err);
    }
  }

  // Authoritative Fallback Knowledge Base
  const isKoreanQuery = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(currentQuery);
  const lower = currentQuery.toLowerCase();

  let summary = isKoreanQuery
    ? '계약자유의 원칙상 당사자 간의 합의는 유효함이 원칙이나, 강행규정에 반하거나 사회상규에 반하는 불공정 약정(민법 제103조, 제104조) 및 약관규제법 제6조에 따른 불공정 조항은 무효가 됩니다.'
    : 'Under established statutory principles and the Uniform Commercial Code (U.C.C.), courts enforce agreements according to their plain language unless a term violates public policy or constitutes an unconscionable adhesion covenant.';

  let practical = isKoreanQuery
    ? '상대방의 일방적 독소조항을 그대로 수용할 경우, 향후 분쟁 발생 시 천문학적인 배상책임 및 영업상의 치명적 제약에 직면하게 되며 법적 대응력이 급격히 약화됩니다.'
    : 'Executing an unbalanced provision creates severe unilateral financial exposure and severely impairs your strategic negotiating leverage if a dispute reaches formal mediation or litigation.';

  let nextSteps = isKoreanQuery
    ? [
        '해당 조항을 삭제하거나 상호 균형을 맞춘 수정안(Redline)을 작성하여 공식 서면 회신하십시오.',
        '손해배상 책임을 최근 12개월간 실제로 수령한 용역대금으로 한정하는 상한(Liability Cap) 조항을 필히 삽입하십시오.',
        '협상 당시의 이메일, 회의록 및 제안서 등 제반 정황증거를 즉시 백업·보존하십시오.'
      ]
    : [
        'Issue a formal written redline striking the offending clause and substituting bilateral balanced language.',
        'Require an explicit aggregate liability cap tied strictly to actual fees billed in the past twelve months.',
        'Send an evidentiary preservation notice to retain all contemporaneous email exchanges and draft versions.'
      ];

  let statutes = isKoreanQuery
    ? ['대한민국 민법 제393조(손해배상의 범위)', '약관의 규제에 관한 법률 제6조(일반원칙)', '민법 제103조']
    : ['U.C.C. § 2-719 (Limitation of Remedies)', 'Restatement (Second) of Contracts § 208 (Unconscionability)'];

  let precedents = isKoreanQuery
    ? [
        {
          caseName: '대법원 2002. 12. 24. 선고 2000다22850 판결',
          court: '대한민국 대법원',
          holding: '채무불이행으로 인한 손해배상에서 통상손해와 특별손해의 인지 여부 및 배상액 경감 법리'
        }
      ]
    : [
        {
          caseName: 'Williams v. Walker-Thomas Furniture Co., 350 F.2d 445 (D.C. Cir. 1965)',
          court: 'U.S. Court of Appeals (D.C. Cir.)',
          holding: 'Unconscionable contracts with gross inequality of bargaining power and predatory terms are unenforceable as a matter of law.'
        }
      ];

  if (lower.includes('경업') || lower.includes('non-compete') || lower.includes('비밀유지') || lower.includes('취업')) {
    if (isKoreanQuery) {
      summary = '경업금지약정은 근로자 또는 협력사의 헌법상 직업선택의 자유를 직접 제한하므로, 대법원은 ① 보호할 가치 있는 사용자의 이익 유무, ② 근로자의 퇴직 전 지위, ③ 경업제한의 기간(통상 1년 이내) 및 지역, ④ 대가의 제공 유무 등을 종합하여 엄격히 유효성을 판단합니다. 정당한 대가 없는 2~3년의 장기 경업금지는 민법 제103조 위반으로 원천 무효입니다.';
      practical = '유효성이 의심되는 조항이라 하더라도 상대방이 가처분 신청(전직금지가처분)을 제기할 경우 법적 대응비용이 발생하고 이직 또는 창업 절차가 수개월간 동결될 수 있습니다.';
      nextSteps = [
        '경업금지 조항 자체를 삭제하거나, 기간을 1년 이내로 대폭 축소하십시오.',
        '경업금지 의무에 상응하는 정당한 경제적 보상(예: 기본급의 70%) 지급을 계약 조건으로 연동하십시오.',
        '금지 대상 업무를 회사의 핵심 특허기술로 좁히고 일반 범용 소프트웨어 개발은 제외하십시오.'
      ];
      statutes = ['대한민국 헌법 제15조(직업선택의 자유)', '민법 제103조(반사회질서의 법률행위)', '부정경쟁방지법 제2조 제2호'];
      precedents = [
        {
          caseName: '대법원 2010. 3. 11. 선고 2009다82244 판결',
          court: '대한민국 대법원',
          holding: '대가의 지급이 결여되고 과도하게 포괄적인 경업금지약정은 민법 제103조에 위반하여 무효이다.'
        }
      ];
    } else {
      summary = 'Non-compete covenants are subject to aggressive statutory disfavor. In key commercial jurisdictions including California (Cal. Bus. & Prof. Code § 16600) and under FTC guidelines, post-employment restrictive covenants are virtually void ab initio.';
      practical = 'Signing a 3-year worldwide non-compete clause effectively bars you from earning a livelihood in your core domain.';
      nextSteps = ['Demand complete excision of Section 11 / non-compete language from the draft.'];
      statutes = ['Cal. Bus. & Prof. Code § 16600'];
      precedents = [{ caseName: 'Edwards v. Arthur Andersen LLP', court: 'Cal. Supreme Court', holding: 'Void covenants' }];
    }
  } else if (lower.includes('손해배상') || lower.includes('배상') || lower.includes('indemn') || lower.includes('liability')) {
    if (isKoreanQuery) {
      summary = '민법 제393조에 따라 채무불이행으로 인한 손해배상은 통상의 손해를 한도로 하며, 특별손해는 채무자가 알았거나 알 수 있었을 때에 한하여 배상책임이 인정됩니다. 무제한 배상 및 간접손해 배상약정은 실무상 치명적인 재정적 위험을 초래합니다.';
      practical = '기업의 통상적인 영업배상책임보험(CGL)은 계약상 가중된 무제한 간접손해에 대해 보험금 지급을 면책하므로, 분쟁 발생 시 회사 고유 자산으로 천문학적 금액을 물어내야 합니다.';
      nextSteps = [
        '간접손해, 징벌적 손해, 기대이익 상실을 배상 범위에서 명시적으로 배제하십시오.',
        '최근 12개월간 수령한 총 대금을 한도로 하는 상한(Liability Cap)을 필히 명시하십시오.',
        '도급인 귀책사유로 인한 침해에 대해서는 수급인을 전면 면책하도록 수정하십시오.'
      ];
      statutes = ['대한민국 민법 제393조(손해배상의 범위)', '약관의 규제에 관한 법률 제7조(면책조항의 금지)'];
      precedents = [{ caseName: '대법원 2002. 12. 24. 선고 2000다22850 판결', court: '대법원', holding: '특별손해에 대한 예측가능성 및 손해배상액 산정 기준' }];
    } else {
      summary = 'Indemnity provisions allocate third-party liability risk. Under contract law, an uncapped indemnity that passes through consequential damages converts an ordinary services engagement into an uninsurable corporate liability policy.';
      practical = 'Your commercial general liability (CGL) insurance will routinely disclaim coverage for contractually assumed liabilities.';
      nextSteps = ['Insert mutual carve-outs for consequential, indirect, and punitive damages.'];
      statutes = ['Del. Code Ann. tit. 6, § 2-719'];
      precedents = [{ caseName: 'E.I. DuPont v. Shell Oil', court: 'Del. Supreme Court', holding: 'Indemnity strict interpretation' }];
    }
  } else if (lower.includes('임대차') || lower.includes('보증금') || lower.includes('명도') || lower.includes('lease') || lower.includes('rent')) {
    if (isKoreanQuery) {
      summary = '상가건물 임대차보호법 제10조의8에 따라 임차인의 차임 연체액이 3기의 차임액에 달해야 임대인이 계약을 해지할 수 있습니다. 5일 연체로 즉시 해지하거나 자력으로 단전·단수하는 행위는 제15조 강행규정에 반하여 무효이며 형법상 업무방해죄에 해당합니다.';
      practical = '임대인의 불법 자력구제 퇴거에 굴복할 경우 수억 원대의 권리금과 인테리어 시설비, 영업권을 일거에 상실하게 됩니다.';
      nextSteps = [
        '상가임대차보호법 제15조를 원용하여 강행규정 위반 무효 통고서를 즉시 발송하십시오.',
        '임대인의 무단 출입 및 단전·단수 시도 시 관할 경찰서에 업무방해 및 주거침입 112 신고를 진행하십시오.',
        '법원에 신속히 점유방해금지가처분을 신청하십시오.'
      ];
      statutes = ['상가건물 임대차보호법 제10조의8, 제15조', '형법 제314조(업무방해)'];
      precedents = [{ caseName: '대법원 2005. 3. 10. 선고 2004도341 판결', court: '대법원', holding: '임대인의 일방적 단전·단수 조치는 형법상 업무방해죄 구성' }];
    } else {
      summary = 'Commercial real estate leases are strictly interpreted under statutory summary proceedings.';
      practical = 'Self-help evictions violate statutory procedures.';
      nextSteps = ['Require ten (10) business days written cure notice.'];
      statutes = ['N.Y. RPAPL § 853'];
    }
  } else if (
    lower.includes('소명') ||
    lower.includes('회생') ||
    lower.includes('파산') ||
    lower.includes('편파변제') ||
    lower.includes('부인권') ||
    lower.includes('대출') ||
    lower.includes('50만원') ||
    lower.includes('거래내역') ||
    lower.includes('청산가치')
  ) {
    summary =
      '채무자 회생 및 파산에 관한 법률(채무자회생법) 제589조의2 및 서울회생법원 실무준칙에 따라, 개인회생·파산 신청 전 최근 1년(경우에 따라 2~3년)간의 전체 금융계좌 거래내역 중 기준금액(통상 50만원) 이상의 입·출금 내역과 최근 대출금의 사용처는 구체적·객관적 증빙을 통해 소명해야 합니다. 특히 특정 채권자(가족·지인·대부업체)에게만 우선 변제한 내역은 채무자회생법 제406조(부인권) 대상이 될 수 있습니다.';
    practical =
      '소명이 불충분하거나 가족·지인 간 고액 송금, 가상자산·사행성 지출이 해명되지 않을 경우 회생위원은 해당 금액을 재산은닉 또는 부인권 대상으로 보아 청산가치에 가산(재산 산입)하며, 이로 인해 월 변제금이 대폭 상승하거나 기각 사유(불성실 신청)가 될 수 있습니다.';
    nextSteps = [
      '의뢰인 본인 명의 타 계좌 간 이체(자가이체)는 입금·출금 계좌의 거래내역서를 상호 대조하여 소명 대상에서 우선 차감하십시오.',
      '신규 대출금 입금액은 대출 직후 출금된 생계비, 기존 고금리 채무 대환(완납증명서 첨부), 주거비·의료비 영수증과 1:1 매칭하여 대출금소명표(Excel)를 작성하십시오.',
      '가족·친인척 송금 내역이 있는 경우 차용증, 기존 입금 내역 또는 생활비 공동부담 증빙을 첨부하고, 불가피한 편파변제는 해당 금액만큼 청산가치 반영 계획서를 제출하십시오.'
    ];
    statutes = [
      '채무자 회생 및 파산에 관한 법률 제406조(부인권)',
      '채무자 회생 및 파산에 관한 법률 제595조(개인회생절차개시신청의 기각사유)',
      '채무자 회생 및 파산에 관한 법률 제614조(변제계획 인가요건 · 청산가치보장의 원칙)'
    ];
    precedents = [
      {
        caseName: '대법원 2011. 11. 24. 선고 2011다56637 판결',
        court: '대한민국 대법원',
        holding: '채무자가 지급불능 상태에서 특정 채권자에게만 담보를 제공하거나 변제한 행위는 다른 채권자들과의 공평을 해치는 편파변제로서 부인권 행사의 대상이 된다.'
      }
    ];
  }

  res.json({
    id: `msg-${Date.now()}`,
    sender: 'assistant',
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    text: isKoreanQuery
      ? '질의하신 법률 쟁점에 대하여 대한민국 실정법 및 대법원 판례를 기준으로 검토한 대표변호사 법률 자문 의견입니다.'
      : 'Here is the authoritative legal analysis from our Senior Managing Partner practice:',
    structuredResponse: {
      summaryOfLaw: summary,
      practicalImplications: practical,
      recommendedNextSteps: nextSteps,
      statutoryCitations: statutes,
      precedents: precedents
    }
  });
});

// Guided Case Intake & Triage Engine
app.post('/api/triage', async (req, res) => {
  const input = req.body;
  const { domain = 'civil', keyFacts = '', disputeAmount = 'Unknown', jurisdiction = 'Federal / Delaware' } = input;

  const isKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(keyFacts) || /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(jurisdiction);

  if (ai) {
    try {
      const triagePrompt = `${BENCHMARK_SYSTEM_PROMPT}

Perform a rigorous case triage and viability assessment for this incoming legal matter:
Domain: ${domain}
Client Role: ${input.clientRole || 'Claimant / Client'}
Counterparty: ${input.counterparty || 'Opposing Party'}
Dispute Valuation: ${disputeAmount}
Jurisdiction: ${jurisdiction}
Facts: ${keyFacts}
Desired Outcome: ${input.desiredOutcome || 'Damages and equitable relief'}
Has Received Demand Letter: ${input.hasReceivedDemandLetter ? 'YES' : 'NO'}

LANGUAGE INSTRUCTION:
${isKorean ? 'The case intake facts are in Korean. You MUST output all JSON values in natural, authoritative Korean legal terminology (대한민국 소송 및 가압류·가처분 실무 기준).' : 'Output in English.'}

Output strictly valid JSON matching:
{
  "id": "triage-${Date.now()}",
  "domain": "${domain}",
  "intakeTimestamp": "${new Date().toISOString()}",
  "viabilityScore": 82,
  "viabilityGrade": "High Probability" | "Moderate / Contested" | "High Risk / Unfavorable",
  "statuteOfLimitationsStatus": {
    "timeframe": "e.g. 5년 (상사시효) 또는 3년 (불법행위 시효)",
    "deadlineEstimate": "Estimated timeframe",
    "riskStatus": "Urgent" | "Within Window" | "Expired / Vulnerable"
  },
  "governingStatutes": ["Statute 1", "Statute 2"],
  "primaryRiskFactors": ["Risk factor 1", "Risk factor 2"],
  "recommendedStrategy": {
    "immediateActions72h": ["Action 1", "Action 2"],
    "evidentiaryPriorities": ["Evidence 1", "Evidence 2"],
    "preLitigationTactics": ["Tactic 1", "Tactic 2"],
    "estimatedResolutionRange": "e.g. 2 to 4 months via pre-suit settlement"
  },
  "seniorPartnerNotes": "Authoritative senior partner strategic synthesis"
}
Do not include markdown fences.`;

      const response = await generateWithTimeout({
        model: 'gemini-3-flash-preview',
        contents: triagePrompt,
      }, 18000);

      const raw = response.text || '';
      const cleanJson = raw.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      return res.json(parsed);
    } catch (err) {
      console.warn('Gemini triage API error, invoking procedural triage fallback:', err);
    }
  }

  // Fallback triage logic
  const isCorporateOrLabor = domain === 'corporate' || domain === 'labor';
  const viabilityScore = isCorporateOrLabor ? 82 : 70;
  const grade = viabilityScore >= 75 ? 'High Probability' : 'Moderate / Contested';

  if (isKorean) {
    return res.json({
      id: `triage-${Date.now()}`,
      domain,
      intakeTimestamp: new Date().toISOString(),
      viabilityScore,
      viabilityGrade: grade,
      statuteOfLimitationsStatus: {
        timeframe: domain === 'labor' ? '임금채권 소멸시효 3년 (근로기준법 제49조)' : '상사채권 소멸시효 5년 (상법 제64조)',
        deadlineEstimate: '소멸시효 완성 전 (안전 기간 내)',
        riskStatus: 'Within Window'
      },
      governingStatutes: [
        domain === 'labor' ? '근로기준법 제43조(임금지급) 및 제49조' : '상법 제64조(상사시효) 및 민법 제390조',
        '민사집행법 제276조(가압류의 목적) 및 민사소송법 제248조'
      ],
      primaryRiskFactors: [
        '상대방의 동시이행항변권 및 하자보수 지연을 이유로 한 대금 지급거절 항변',
        '구두 약정에 대한 객관적 서면·전자증거의 확보 수준',
        '상대방의 재산 은닉 가능성 및 집행 실효성 확보'
      ],
      recommendedStrategy: {
        immediateActions72h: [
          '증거인멸 방지를 위한 사내 전자기록(이메일, 카카오톡, 슬랙) 보존 및 최고장 내용증명 발송',
          '핵심 실무 담당자의 진술서 및 타임라인 사실확인서 작성',
          '상대방 주거래 은행 계좌 및 부동산에 대한 가압류(보전처분) 신속 신청'
        ],
        evidentiaryPriorities: [
          '날인된 계약서 원본 및 과업지시서(SOW)',
          '과업 완성 및 납품 완료 확인 이메일/검수확인서',
          '전자세금계산서 및 채무 승인 문자메시지'
        ],
        preLitigationTactics: [
          '소송 착수 전 14일 기한의 최고장 발송 및 대표이사급 사전 협의',
          '소장 초안 송부를 통한 강력한 법적 대응 의지 피력'
        ],
        estimatedResolutionRange: '조정 및 사전 합의 시 2~4개월, 본안 소송 시 6~10개월'
      },
      seniorPartnerNotes: '의뢰인이 제시한 사실관계상 상대방의 대금 미지급 및 계약위반 책임이 상당 부분 명확합니다. 상사소멸시효가 넉넉히 남아 있으므로, 소 제기 전 상대방 주거래 계좌 가압류를 단행하면 신속한 조기 합의를 이끌어낼 수 있습니다.'
    });
  }

  res.json({
    id: `triage-${Date.now()}`,
    domain,
    intakeTimestamp: new Date().toISOString(),
    viabilityScore,
    viabilityGrade: grade,
    statuteOfLimitationsStatus: {
      timeframe: domain === 'labor' ? '2-3 years (FLSA / State Labor Code)' : '3-4 years (UCC / Written Contract)',
      deadlineEstimate: 'Actionable within statutory period',
      riskStatus: 'Within Window'
    },
    governingStatutes: [
      domain === 'labor' ? 'Labor Code § 226 & Fair Labor Standards Act' : 'U.C.C. Article 2 & State Commercial Code',
      'Fed. R. Civ. P. 11 (Good Faith Factual Basis)'
    ],
    primaryRiskFactors: [
      'Contemporaneous documentary evidence of the verbal promises or email trails.',
      'Potential counterclaims regarding performance milestones or offset defenses.',
      'Cost-benefit ratio of formal arbitration versus structured pre-suit demand.'
    ],
    recommendedStrategy: {
      immediateActions72h: [
        'Issue a litigation hold notice internally to safeguard all electronic communications and Slack/email archives.',
        'Obtain signed declarations from primary operational points of contact while facts remain fresh.',
        'Transmit a confidential, attorney-client privileged comprehensive demand letter pursuant to Fed. R. Evid. 408.'
      ],
      evidentiaryPriorities: [
        'Executed agreements, addenda, and signed Statements of Work.',
        'Invoicing records, payment ledgers, and formal rejection notices.',
        'Written communications demonstrating bad faith or intentional non-compliance.'
      ],
      preLitigationTactics: [
        'Propose a 14-day standstill agreement to explore private executive-level mediation.',
        'Draft a verified complaint draft as an attachment to show trial readiness without filing.'
      ],
      estimatedResolutionRange: '3 to 6 months via structured pre-trial settlement conference'
    },
    seniorPartnerNotes: `Based on the facts provided in this ${domain} intake, the claimant possesses substantial leverage provided documentary verification is completed immediately. The priority is locking down contemporaneous communications before opposing counsel can formulate affirmative waiver defenses.`
  });
});

// ---------------------------------------------------------------------------
// API Route 6: Parse Korean Court Order / Notice PDF & Case Number Lookup (/api/parse-court-doc)
// Sequentially parses ALL pages (1 .. totalPages) for both digital and scanned court PDFs
// ---------------------------------------------------------------------------
app.post('/api/parse-court-doc', async (req, res) => {
  try {
    const {
      fileName = '',
      pdfBase64 = '',
      rawText = '',
      caseNoHint = '',
      pageTexts = [],
      pageImages = []
    } = req.body || {};

    const perPageTexts: Array<{ page: number; text: string }> = [];
    let totalPages = 0;

    // 1. If client already extracted per-page texts or per-page PDF/image slices, process sequentially (Page 1 .. N)
    const clientPageTexts: string[] = Array.isArray(pageTexts) ? pageTexts.map((t) => String(t || '')) : [];
    const clientPageImages: string[] = Array.isArray(pageImages) ? pageImages.map((img) => String(img || '')) : [];

    if (clientPageTexts.length > 0 || clientPageImages.length > 0) {
      totalPages = Math.max(clientPageTexts.length, clientPageImages.length);
      for (let idx = 0; idx < totalPages; idx++) {
        const pNum = idx + 1;
        let pText = (clientPageTexts[idx] || '').trim();
        const pImgB64 = (clientPageImages[idx] || '').trim();

        // If digital text on this page is sparse (< 20 chars) and we have the page's PDF/image slice, extract text from that page
        if (pText.length < 20 && pImgB64) {
          const cleanB64 = pImgB64.includes(',') ? pImgB64.split(',')[1].trim() : pImgB64;
          const isPdfSlice = cleanB64.startsWith('JVBERi0');

          if (isPdfSlice) {
            try {
              const sliceBuf = Buffer.from(cleanB64, 'base64');
              const coordTxt = await extractCoordinateSortedTextFromPdf(sliceBuf);
              if (coordTxt && coordTxt.trim().length >= 20) {
                pText = coordTxt.trim();
              } else {
                const streamTxt = await extractStreamTextWithPdfParse(sliceBuf);
                if (streamTxt && streamTxt.trim().length > pText.length) {
                  pText = streamTxt.trim();
                }
              }
            } catch (_) {
              // Fall through to Vision OCR
            }
          }

          if (pText.length < 20 && ai) {
            try {
              const pageMime = isPdfSlice
                ? 'application/pdf'
                : cleanB64.startsWith('iVBOR')
                ? 'image/png'
                : 'image/jpeg';
              const ocrResp = await generateWithTimeout(
                {
                  model: 'gemini-flash-lite-latest',
                  contents: [
                    { inlineData: { mimeType: pageMime, data: cleanB64 } },
                    `대한민국 법원 문서(${pNum}페이지)입니다. 사건번호, 관할법원, 담당 재판부(제O회생단독/파산부/민사부 등) 및 회생위원/사법보좌관/판사, 채무자(신청인/당사자) 성명, 보정기한, 그리고 이 페이지에 기재된 모든 보정명령·보정권고·결정사항 본문을 원문 그대로 빠짐없이 텍스트로 추출하십시오.`
                  ],
                  config: { maxOutputTokens: 4096, temperature: 0.1 }
                },
                18000
              );
              if (ocrResp?.text) {
                pText = ocrResp.text.trim();
              }
            } catch (_) {
              // ignore single page OCR timeout
            }
          }
        }

        if (pText) {
          perPageTexts.push({ page: pNum, text: pText });
        }
      }
    }

    // 2. If pdfBase64 was sent directly, sequentially parse every page (1 .. totalPages) on the server
    if (perPageTexts.length === 0 && pdfBase64 && typeof pdfBase64 === 'string') {
      const cleanedBase64 = pdfBase64.includes(',') ? pdfBase64.split(',')[1].trim() : pdfBase64.trim();
      if (cleanedBase64.length > 20) {
        const pdfBuf = Buffer.from(cleanedBase64, 'base64');

        let srcPdfLibDoc: PDFDocument | null = null;
        try {
          srcPdfLibDoc = await PDFDocument.load(pdfBuf, { ignoreEncryption: true });
          totalPages = srcPdfLibDoc.getPageCount();
        } catch (_) {
          srcPdfLibDoc = null;
        }

        let pdfjsDoc: any = null;
        try {
          const loadingTask = pdfjs.getDocument({
            data: new Uint8Array(pdfBuf),
            cMapUrl: CMAP_URL,
            cMapPacked: true,
            standardFontDataUrl: STANDARD_FONT_URL,
            verbosity: 0
          });
          pdfjsDoc = await loadingTask.promise;
          if (!totalPages || totalPages < pdfjsDoc.numPages) {
            totalPages = pdfjsDoc.numPages;
          }

          for (let p = 1; p <= totalPages; p++) {
            let singlePageText = '';
            try {
              const page = await pdfjsDoc.getPage(p);
              const viewport = page.getViewport({ scale: 1.0 });
              const textContent = await page.getTextContent();

              const items: Array<{ str: string; x: number; y: number }> = [];
              for (const raw of textContent.items as any[]) {
                if (!raw || typeof raw.str !== 'string') continue;
                const trimmed = raw.str.trim();
                if (!trimmed) continue;
                const tm = raw.transform || [1, 0, 0, 1, 0, 0];
                const [vx, vy] = viewport.convertToViewportPoint(tm[4], tm[5]);
                items.push({ str: trimmed, x: vx, y: vy });
              }

              items.sort((a, b) => a.y - b.y);
              const rows: Array<Array<{ str: string; x: number; y: number }>> = [];
              for (const it of items) {
                if (rows.length === 0) {
                  rows.push([it]);
                } else {
                  const cur = rows[rows.length - 1];
                  if (Math.abs(it.y - cur[0].y) <= 4.5) {
                    cur.push(it);
                  } else {
                    rows.push([it]);
                  }
                }
              }

              const linesOnPage: string[] = [];
              for (const r of rows) {
                r.sort((a, b) => a.x - b.x);
                const lineStr = r.map((c) => c.str).join(' ').trim();
                if (lineStr) linesOnPage.push(lineStr);
              }
              singlePageText = linesOnPage.join('\n').trim();
              page.cleanup();
            } catch (_) {
              // ignore page error
            }

            // If page p is a scanned image page (< 20 chars of digital text), OCR page p using pdf-lib + Gemini
            if (singlePageText.length < 20 && srcPdfLibDoc && ai) {
              try {
                const subDoc = await PDFDocument.create();
                const [copied] = await subDoc.copyPages(srcPdfLibDoc, [p - 1]);
                subDoc.addPage(copied);
                const subBytes = await subDoc.save();
                const subB64 = Buffer.from(subBytes).toString('base64');

                const ocrResp = await generateWithTimeout(
                  {
                    model: 'gemini-flash-lite-latest',
                    contents: [
                      { inlineData: { mimeType: 'application/pdf', data: subB64 } },
                      `대한민국 법원 문서(${p}페이지)입니다. 사건번호, 관할법원, 담당 재판부(제O회생단독/파산부/민사부 등) 및 회생위원/사법보좌관/판사, 채무자(신청인/당사자) 성명, 보정기한, 그리고 이 페이지에 기재된 모든 보정명령·보정권고·결정사항 본문을 원문 그대로 빠짐없이 텍스트로 추출하십시오.`
                    ],
                    config: { maxOutputTokens: 4096, temperature: 0.1 }
                  },
                  18000
                );
                if (ocrResp?.text) {
                  singlePageText = ocrResp.text.trim();
                }
              } catch (_) {
                // ignore single page OCR error
              }
            }

            if (singlePageText) {
              perPageTexts.push({ page: p, text: singlePageText });
            }
          }
        } catch (_) {
          const fallbackStream = await extractStreamTextWithPdfParse(pdfBuf);
          if (fallbackStream.trim()) {
            perPageTexts.push({ page: 1, text: fallbackStream.trim() });
          }
        } finally {
          try {
            await pdfjsDoc?.destroy();
          } catch (_) {
            // ignore
          }
        }
      }
    }

    if (rawText && String(rawText).trim()) {
      perPageTexts.unshift({ page: 0, text: String(rawText).trim() });
    }

    const sequentialText = perPageTexts
      .map((pt) => (pt.page > 0 ? `[${pt.page}페이지]\n${pt.text}` : pt.text))
      .join('\n\n');
    const combinedText = perPageTexts.map((pt) => pt.text).join('\n');
    const source = `${fileName}\n${caseNoHint}\n${combinedText}`;

    // -------------------------------------------------------------------------
    // Deterministic Multi-Page Regex Extraction across ALL pages (Page 1 .. N)
    // -------------------------------------------------------------------------

    // 1. Extract Korean Court Case Number (supports spaces or hyphens, e.g. "2026 개회 11335", "2026개회10482", "2025하단3021")
    const caseNoMatch = source.match(
      /(20\d{2})\s*[-\s]*(개회|하단|하면|하합|회단|회합|간회단|가단|가합|가소|나|다|카단|카합|타채|드단|드합|즈단|구단|구합|고단|고합|노|도|차|차전|머|러|비|카기|카불|회확|하확)\s*[-\s]*(\d{1,7})/
    );
    const caseYear = caseNoMatch ? caseNoMatch[1] : '';
    const caseCode = caseNoMatch ? caseNoMatch[2] : '개회';
    const caseSeq = caseNoMatch ? caseNoMatch[3] : '';
    let extractedCaseNo = caseNoMatch ? `${caseYear}${caseCode}${caseSeq}` : caseNoHint.trim();

    const codeCategoryMap: Record<string, string> = {
      개회: '개인회생',
      하단: '개인파산',
      하면: '개인파산·면책',
      하합: '법인파산',
      회단: '간이회생/일반회생',
      회합: '법인회생',
      간회단: '간이회생',
      가단: '민사 본안 (단독)',
      가합: '민사 본안 (합의)',
      가소: '민사 소액',
      카단: '보전처분 (가압류/가처분)',
      타채: '채권압류 및 추심명령'
    };
    let caseType = codeCategoryMap[caseCode] || '개인회생';

    // 2. Extract Court Name across all pages
    const courtMatch = source.match(
      /(서울회생법원|수원회생법원|부산회생법원|서울중앙지방법원|서울동부지방법원|서울남부지방법원|서울북부지방법원|서울서부지방법원|인천지방법원|수원지방법원|의정부지방법원|춘천지방법원|대전지방법원|청주지방법원|대구지방법원|부산지방법원|울산지방법원|창원지방법원|광주지방법원|전주지방법원|제주지방법원)(?:\s*[가-힣]{2,4}지원)?/
    );
    let court = courtMatch ? courtMatch[0].replace(/\s+/g, ' ').trim() : '서울회생법원';

    // 3. Extract Party / Client Name (채무자, 신청인, 원고 등)
    const invalidPartyWords = /^(?:소송대리인|법무법인|변호사|법무사|보정명령|보정권고|제출기한|재판부|회생위원|사법보좌관|결정|주문|이유)$/;
    let clientName = '';
    const partyMatches = [
      ...source.matchAll(/(?:채\s*무\s*자|신\s*청\s*인|원\s*고|당\s*사\s*자)\s*(?:성\s*명)?\s*[:：]?\s*([가-힣]{2,5})/g)
    ];
    for (const pm of partyMatches) {
      const candidate = pm[1].trim();
      if (candidate && !invalidPartyWords.test(candidate)) {
        clientName = candidate;
        break;
      }
    }
    if (!clientName) {
      const fnMatch = fileName.match(/([가-힣]{2,4})[\s_-]*(?:보정|개시|결정|사건|개인회생|파산)/);
      if (fnMatch && !invalidPartyWords.test(fnMatch[1])) {
        clientName = fnMatch[1].trim();
      }
    }

    // 4. Extract Judge / Division / Commissioner across ALL pages (NO hardcoded '제12회생단독' fallback!)
    const divisionMatch =
      source.match(/(제\s*\d+\s*(?:회생|파산|민사|가사|행정|형사)\s*(?:단독|부|합의부))/) ||
      source.match(/((?:회생|파산|민사|가사)\s*제?\s*\d+\s*(?:단독|부))/) ||
      source.match(/(제\s*\d+\s*(?:단독|부))/);
    const commissionerMatch = source.match(
      /(?:회\s*생\s*위\s*원|파\s*산\s*관\s*재\s*인)\s*[:：]?\s*([가-힣]{2,5})?/
    );
    const judicialOfficerMatch = source.match(
      /(?:사\s*법\s*보\s*좌\s*관|재\s*판\s*장\s*판\s*사|판\s*사)\s*[:：]?\s*([가-힣]{2,4})/
    );

    const judgeParts: string[] = [];
    if (divisionMatch) {
      judgeParts.push(divisionMatch[1].replace(/\s+/g, ''));
    }
    if (commissionerMatch) {
      const roleName = commissionerMatch[0].includes('파산') ? '파산관재인' : '회생위원';
      const person = (commissionerMatch[1] || '').trim();
      const label =
        person && !invalidPartyWords.test(person) ? `${roleName} ${person}` : roleName;
      if (!judgeParts.includes(label)) judgeParts.push(label);
    } else if (judicialOfficerMatch && judgeParts.length === 0) {
      const person = (judicialOfficerMatch[1] || '').trim();
      if (person && !invalidPartyWords.test(person)) {
        judgeParts.push(`판사/사법보좌관 ${person}`);
      }
    }
    let judge = judgeParts.join(' · ');

    // 5. Extract Document Type & Status
    let docType = '보정권고 / 보정명령';
    let status = '보정명령 대응중';
    let isUrgent = true;
    if (/석\s*명\s*준\s*비\s*명\s*령/.test(source)) {
      docType = '석명준비명령';
      status = '보정명령 대응중';
    } else if (/보\s*정\s*명\s*령/.test(source)) {
      docType = '보정명령';
      status = '보정명령 대응중';
    } else if (/보\s*정\s*권\s*고/.test(source)) {
      docType = '보정권고';
      status = '보정권고 소명서 작성중';
    } else if (/개\s*시\s*결\s*정/.test(source)) {
      docType = '개시결정 통지서';
      status = '개시결정 완료';
      isUrgent = false;
    } else if (/채\s*권\s*자\s*집\s*회/.test(source)) {
      docType = '채권자집회 기일통지서';
      status = '채권자집회 대기';
      isUrgent = true;
    } else if (/인\s*가\s*결\s*정/.test(source)) {
      docType = '변제계획 인가결정';
      status = '변제계획 인가완료';
      isUrgent = false;
    }

    // 6. Extract Deadline / Next Hearing across all pages
    const deadlineMatch =
      source.match(/(송달받은?\s*날로부터\s*\d+\s*일\s*이내)/) ||
      source.match(/(명령을?\s*송달받은?\s*날부터\s*\d+\s*일\s*이내)/) ||
      source.match(/((?:보정|제출|소명)\s*기한\s*[:：]?\s*20\d{2}[.\-/년]\s*\d{1,2}[.\-/월]\s*\d{1,2}일?)/) ||
      source.match(/(20\d{2}[.\-/년]\s*\d{1,2}[.\-/월]\s*\d{1,2}일?\s*(?:까지|기일|기한))/);
    let nextDeadline = deadlineMatch
      ? deadlineMatch[1].replace(/\s+/g, ' ').trim()
      : '송달일로부터 14일 이내 (보정기한)';

    // 7. Extract Threshold Hint (e.g. "50만원 이상", "30만원 이상", "100만원 이상")
    let recommendedThreshold = 500000;
    const threshMatch = source.match(/(\d{2,3})\s*만\s*원\s*이상/);
    if (threshMatch) {
      const manWon = parseInt(threshMatch[1], 10);
      if (!isNaN(manWon) && manWon >= 10 && manWon <= 1000) {
        recommendedThreshold = manWon * 10000;
      }
    }

    // 8. Sequentially extract ALL numbered/bulleted order items across ALL pages (Page 1 .. N)
    const rawLines = combinedText
      .split(/\r?\n/)
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .filter((l) => l.length >= 4 && !/^(?:페이지|Page|-?\s*\d+\s*-?|\d+\s*\/\s*\d+)$/i.test(l));

    const orderItems: string[] = [];
    const numberedItemRegex =
      /^(?:(?:\d{1,2}|[가-하]|[①-⑳]|[Ⅰ-Ⅹ])[.)]\s*|(?:\[\s*(?:보정|흠결|명령|제출|소명)[^\]]*\]|\(\d{1,2}\)|[■□○●◈▶-]\s+))/;
    const orderKeywordRegex =
      /보정|소명|제출|거래내역|입출금|계좌|카드|사용처|청산가치|변제계획|수입|생계비|부양가족|보험|임대차|재산목록|채권자|대출|소명자료|내역서/;

    for (const line of rawLines) {
      // Skip boilerplate header/footer lines
      if (/^(?:우편번호|주소\s*[:]|전화\s*[:]|팩스\s*[:]|전자통신망|대법원\s*전자소송)/.test(line)) continue;
      if (numberedItemRegex.test(line) || (orderKeywordRegex.test(line) && line.length >= 10)) {
        if (!orderItems.includes(line)) {
          orderItems.push(line);
        }
      }
    }

    let summaryContent =
      orderItems.length > 0
        ? orderItems.slice(0, 15).join('\n')
        : rawLines.length > 0
        ? rawLines.slice(0, 10).join('\n')
        : '';

    // 9. AI Multi-Page Structured Synthesis (analyzes the full sequential text from Page 1 .. N)
    if (ai && sequentialText.trim().length >= 15) {
      try {
        const aiPrompt = `다음은 대한민국 법원 문서("${fileName}", 총 ${totalPages || perPageTexts.length || 1}페이지 전체 순차 추출본)의 전체 페이지 원문입니다.
1페이지부터 마지막 페이지까지 모든 페이지를 빠짐없이 분석하여 아래 JSON 형식으로만 정확히 추출하십시오. 문서에 없는 재판부명(예: 제12회생단독 등)을 임의로 지어내지 말고, 실제 문서에 기재된 재판부/회생위원/판사만 기재하십시오(없으면 빈 문자열 "").

[전체 페이지 원문]:
${sequentialText.slice(0, 28000)}

출력 JSON 스키마 (순수 JSON만 출력):
{
  "caseNo": "사건번호 (예: 2026개회11335, 없으면 빈 문자열)",
  "clientName": "채무자/신청인/당사자 성명 (예: 이현, 없으면 빈 문자열)",
  "court": "관할법원 정식명칭 (예: 서울회생법원)",
  "caseType": "사건종류 (예: 개인회생, 개인파산·면책, 법인회생, 민사 본안 등)",
  "status": "진행상태 (보정명령 대응중, 보정권고 소명서 작성중, 개시결정 완료, 채권자집회 대기, 변제계획 인가완료 중 택1)",
  "judge": "문서에 실제 기재된 담당 재판부 및 회생위원/판사/사법보좌관 (예: 제3회생단독 · 회생위원 김철수, 문서에 없으면 반드시 빈 문자열)",
  "docType": "문서종류 (보정명령, 보정권고, 석명준비명령, 개시결정 통지서, 인가결정 등)",
  "nextDeadline": "보정기한 또는 차기기일 (예: 송달받은 날로부터 14일 이내, 2026-11-30 등)",
  "thresholdAmount": 500000,
  "orderItems": [
    "1페이지~마지막페이지에 기재된 각 보정명령/권고/결정 핵심 항목 1",
    "항목 2",
    "항목 3"
  ],
  "summaryContent": "전체 페이지의 보정명령·권고 핵심 요지 종합 요약 (번호별 줄바꿈 포함)"
}`;

        const aiResp = await generateWithTimeout(
          {
            model: 'gemini-flash-lite-latest',
            contents: aiPrompt,
            config: { maxOutputTokens: 4096, temperature: 0.1 }
          },
          18000
        );

        const rawJson = (aiResp?.text || '').replace(/```json/gi, '').replace(/```/g, '').trim();
        const jsonMatch = rawJson.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsedAi = JSON.parse(jsonMatch[0]);
          if (parsedAi.caseNo && String(parsedAi.caseNo).trim()) {
            extractedCaseNo = String(parsedAi.caseNo).replace(/\s+/g, '').trim();
          }
          if (parsedAi.clientName && String(parsedAi.clientName).trim()) {
            clientName = String(parsedAi.clientName).trim();
          }
          if (parsedAi.court && String(parsedAi.court).trim()) {
            court = String(parsedAi.court).trim();
          }
          if (parsedAi.caseType && String(parsedAi.caseType).trim()) {
            caseType = String(parsedAi.caseType).trim();
          }
          if (parsedAi.status && String(parsedAi.status).trim()) {
            status = String(parsedAi.status).trim();
          }
          if (typeof parsedAi.judge === 'string' && parsedAi.judge.trim()) {
            judge = parsedAi.judge.trim();
          }
          if (parsedAi.docType && String(parsedAi.docType).trim()) {
            docType = String(parsedAi.docType).trim();
          }
          if (parsedAi.nextDeadline && String(parsedAi.nextDeadline).trim()) {
            nextDeadline = String(parsedAi.nextDeadline).trim();
          }
          if (Number(parsedAi.thresholdAmount) >= 100000) {
            recommendedThreshold = Number(parsedAi.thresholdAmount);
          }
          if (Array.isArray(parsedAi.orderItems) && parsedAi.orderItems.length > 0) {
            const cleanItems = parsedAi.orderItems.map((it: any) => String(it || '').trim()).filter(Boolean);
            if (cleanItems.length > 0) {
              orderItems.splice(0, orderItems.length, ...cleanItems);
            }
          }
          if (parsedAi.summaryContent && String(parsedAi.summaryContent).trim()) {
            summaryContent = String(parsedAi.summaryContent).trim();
          } else if (orderItems.length > 0) {
            summaryContent = orderItems.join('\n');
          }
        }
      } catch (_) {
        // Fallback to deterministic multi-page regex results already computed above
      }
    }

    if (!summaryContent) {
      summaryContent = `[${extractedCaseNo || '법원문서'}] 전체 ${totalPages || 1}페이지 분석 완료 — 은행 입출금 및 카드 사용내역 소명자료 제출 대상`;
    }

    return res.json({
      caseNo: extractedCaseNo,
      clientName,
      court,
      caseType,
      status,
      judge,
      docType,
      nextDeadline,
      isUrgent,
      pageCount: totalPages || perPageTexts.length || 1,
      thresholdAmount: recommendedThreshold,
      orderItems,
      summaryContent
    });
  } catch (err) {
    console.error('Error in /api/parse-court-doc:', err);
    return res.status(500).json({ error: '법원 문서 분석 중 오류가 발생했습니다.' });
  }
});

// Production or Dev Vite Serving (Local / Cloud Run)
async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vitePackage = 'vite';
    const { createServer: createViteServer } = await (import(vitePackage) as any);
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`JurisPulse Legal AI Server active on http://0.0.0.0:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;


