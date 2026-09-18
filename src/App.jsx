import { useState, useEffect, useMemo, useRef } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2, Pencil, Star, Copy, ExternalLink, X, AlertTriangle, Download, Upload, Search, Database } from "lucide-react";

/* ───────── 디자인 토큰 ───────── */
const C = {
  ink: "#0F2340", steel: "#3A5373", mute: "#6B7A90", line: "#DCE3EC", paper: "#F3F6F9",
  white: "#FFFFFF", teal: "#0E8C8C", blue: "#2563EB", amber: "#B7791F", red: "#B42318", violet: "#6D28D9",
};
const FONT = "'Malgun Gothic','맑은 고딕','Apple SD Gothic Neo','Noto Sans KR',sans-serif";
const CAT = { ipo: { label: "IPO", color: C.teal }, mezz: { label: "메자닌", color: C.blue }, rights: { label: "증자", color: C.amber } };
const LIST = { ipo: "ipos", mezz: "mezz", rights: "rights" };
const LS_KEY = "mezz-ipo-board-v2";
const WD = ["일", "월", "화", "수", "목", "금", "토"];

const EMPTY_DART = { generatedAt: null, ipos: [], mezz: [], rights: [] };
const DART = (() => {
  const d = (typeof window !== "undefined" && window.DART_DATA) || EMPTY_DART;
  return { generatedAt: d.generatedAt || null, ipos: d.ipos || [], mezz: d.mezz || [], rights: d.rights || [] };
})();
const DMAP = {
  ipo: new Map(DART.ipos.map((x) => [x.id, x])),
  mezz: new Map(DART.mezz.map((x) => [x.id, x])),
  rights: new Map(DART.rights.map((x) => [x.id, x])),
};

/* 휴장일(주말 제외) — 영업일 계산용. 해마다 추가 필요 */
const HOLIDAYS = new Set([
  "2026-09-24", "2026-09-25", "2026-09-26", "2026-10-05", "2026-10-09", "2026-12-25", "2026-12-31",
  "2027-01-01", "2027-02-08", "2027-02-09", "2027-03-01", "2027-05-05", "2027-05-13", "2027-06-06",
  "2027-08-16", "2027-09-14", "2027-09-15", "2027-09-16", "2027-10-04", "2027-10-11", "2027-12-27", "2027-12-31",
]);

/* ───────── 날짜 유틸 ───────── */
const pad = (n) => String(n).padStart(2, "0");
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const parse = (s) => { if (!isDate(s)) return null; const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const TODAY = fmt(new Date());
const isBiz = (d) => d.getDay() !== 0 && d.getDay() !== 6 && !HOLIDAYS.has(fmt(d));
const addDays = (s, n) => { const d = parse(s); if (!d) return ""; d.setDate(d.getDate() + n); return fmt(d); };
const addBiz = (s, n) => {
  const d = parse(s); if (!d) return "";
  const step = n >= 0 ? 1 : -1; let k = Math.abs(n);
  while (k > 0) { d.setDate(d.getDate() + step); if (isBiz(d)) k--; }
  return fmt(d);
};
const addMonths = (s, m) => {
  const d = parse(s); if (!d) return "";
  const day = d.getDate(); const r = new Date(d.getFullYear(), d.getMonth() + m, 1);
  r.setDate(Math.min(day, new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate()));
  return fmt(r);
};
const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
const md = (s) => { const d = parse(s); return d ? `${d.getMonth() + 1}/${d.getDate()}` : ""; };
const mdw = (s) => { const d = parse(s); return d ? `${d.getMonth() + 1}/${d.getDate()} (${WD[d.getDay()]})` : ""; };
const ymd2 = (s) => { const d = parse(s); return d ? `${String(d.getFullYear()).slice(2)}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}` : ""; };
const range = (a, b) => (a && b && a !== b ? `${md(a)}~${md(b)}` : md(a || b));
const num = (v) => (v === "" || v == null || isNaN(Number(v)) ? (v || "") : Number(v).toLocaleString("ko-KR"));
const uid = () => `u-${Math.random().toString(36).slice(2, 10)}`;
const norm = (s) => String(s || "").replace(/\(주\)|㈜|주식회사|\s/g, "").toLowerCase();
const blank = (v) => (v === undefined || v === null || v === false ? "" : v);

/* ───────── 입력 필드 ───────── */
const FIELDS = {
  ipo: [
    ["name", "종목명", "text"], ["market", "시장", "select", ["", "코스피", "코스닥", "코스닥(이전)", "코넥스"]],
    ["fcStart", "수요예측 시작", "date"], ["fcEnd", "수요예측 종료", "date"],
    ["subStart", "청약 시작", "date"], ["subEnd", "청약 종료", "date"],
    ["refund", "환불일(납입일)", "date", "비워두면 청약 종료 +2영업일로 표시"], ["listing", "상장일", "date", "입력하면 확약 해제일(15일, 1·3·6개월) 자동 표시"],
    ["bandLow", "희망밴드 하단(원)", "number"], ["bandHigh", "희망밴드 상단(원)", "number"],
    ["finalPrice", "확정 공모가(원)", "number"], ["amount", "공모금액(억)", "text"],
    ["underwriter", "주관사", "text"], ["instComp", "기관 경쟁률", "text"],
    ["lockup", "의무보유확약 비율", "text"], ["memo", "메모", "textarea"],
  ],
  mezz: [
    ["issuer", "발행사", "text"], ["kind", "종류", "select", ["CB", "BW", "EB", "CPS", "RCPS"]],
    ["series", "회차", "text"], ["method", "발행방식", "select", ["", "사모", "공모"]],
    ["size", "발행규모(억)", "number"], ["convPrice", "전환·행사가(원)", "number"],
    ["coupon", "표면이자(%)", "number"], ["ytm", "만기이자(%)", "number"],
    ["refix", "리픽싱 조항", "select", ["미확인", "있음", "없음"]], ["refixFloor", "리픽싱 한도", "text"],
    ["boardDate", "이사회 결의일", "date"], ["issueDate", "납입일", "date"],
    ["convStart", "전환청구 시작일", "date", "비워두면 납입일 +1년(추정)"], ["convEnd", "전환청구 종료일", "date"],
    ["putStart", "첫 풋옵션일", "date", "공시 원문의 조기상환청구권 조항에서 확인해 입력. 이후 3개월마다 표시"], ["maturity", "만기일", "date"],
    ["callInfo", "콜옵션 조건", "text"], ["investors", "인수자", "text"],
    ["memo", "메모", "textarea"],
  ],
  rights: [
    ["name", "종목명", "text"], ["kind", "구분", "select", ["무상증자", "유상증자", "유무상증자"]],
    ["method", "배정방식", "text"], ["ratio", "1주당 배정주식수", "text"],
    ["price", "발행가·예정가(원)", "number"], ["size", "조달규모(억)", "number"],
    ["recordDate", "신주배정기준일", "date"], ["exDate", "권리락일", "date", "비워두면 기준일 전 1영업일"],
    ["subStart", "구주주 청약 시작", "date"], ["subEnd", "구주주 청약 종료", "date"],
    ["payDate", "납입일", "date"], ["listingDate", "신주 상장일", "date"],
    ["memo", "메모", "textarea"],
  ],
};

/* 처음 열었을 때 예시 (DART 수집 전 화면 확인용, 같은 종목 DART 데이터가 오면 합쳐짐) */
const SEED_USER = {
  ipos: [
    { id: uid(), name: "와이즈플래닛컴퍼니", subStart: "2026-09-14", subEnd: "2026-09-15", bandLow: "10000", bandHigh: "12000", finalPrice: "12000", underwriter: "대신증권", instComp: "1248:1", src: "뉴스" },
    { id: uid(), name: "빅웨이브로보틱스", fcStart: "2026-09-07", fcEnd: "2026-09-11", subStart: "2026-09-15", subEnd: "2026-09-16", bandLow: "20000", bandHigh: "24000", amount: "240", underwriter: "유진투자증권, 미래에셋증권", src: "뉴스" },
    { id: uid(), name: "덕산넵코어스", fcEnd: "2026-09-14", subStart: "2026-09-16", subEnd: "2026-09-17", bandLow: "12400", bandHigh: "14600", amount: "372~438", underwriter: "대신증권", src: "뉴스" },
    { id: uid(), name: "브릴스", fcEnd: "2026-09-15", subStart: "2026-09-17", subEnd: "2026-09-18", bandLow: "16500", bandHigh: "19500", amount: "198", underwriter: "IBK투자증권", src: "뉴스" },
    { id: uid(), name: "진코스텍", market: "코스닥(이전)", fcStart: "2026-09-16", fcEnd: "2026-09-22", subStart: "2026-10-02", subEnd: "2026-10-06", bandLow: "19500", bandHigh: "23500", amount: "166~200", memo: "추석 연휴로 청약 10/2, 10/6 분리", src: "뉴스" },
    { id: uid(), name: "멜콘", fcStart: "2026-09-16", fcEnd: "2026-09-22", subStart: "2026-10-01", subEnd: "2026-10-02", bandLow: "10700", bandHigh: "12300", amount: "268~308", underwriter: "대신증권", src: "뉴스" },
  ],
  mezz: [],
  rights: [],
};

/* ───────── 저장소 ───────── */
function loadLocal() {
  try {
    const s = localStorage.getItem(LS_KEY);
    if (s) {
      const j = JSON.parse(s);
      return { user: { ipos: [], mezz: [], rights: [], ...(j.user || {}) }, over: j.over || {}, hidden: j.hidden || [], prefs: j.prefs || {} };
    }
  } catch (e) { /* 사용 불가 환경 */ }
  return { user: SEED_USER, over: {}, hidden: [], prefs: {} };
}

function combine(local, cat) {
  const key = LIST[cat];
  const hidden = new Set(local.hidden);
  const out = []; const seen = new Set();
  DART[key].forEach((x) => {
    if (hidden.has(x.id)) return;
    const o = local.over[x.id];
    out.push(o ? { ...x, ...o.patch } : x);
    seen.add(x.id);
  });
  Object.entries(local.over).forEach(([id, o]) => {
    if (o.cat === cat && !seen.has(id) && !hidden.has(id) && o.base) out.push({ ...o.base, ...o.patch });
  });
  let users = local.user[key] || [];
  if (cat === "ipo") {
    const idx = new Map(out.map((x, i) => [norm(x.name), i]));
    users = users.filter((u) => {
      const i = idx.get(norm(u.name));
      if (i === undefined) return true;
      const d = { ...out[i] };
      Object.entries(u).forEach(([f, v]) => {
        if (!["id", "src", "star"].includes(f) && v !== "" && v != null && (d[f] === "" || d[f] == null)) d[f] = v;
      });
      if (u.star) d.star = true;
      out[i] = d;
      return false;
    });
  }
  return [...out, ...users];
}

/* ───────── 이벤트 ───────── */
function rangeDays(s, e) {
  if (!isDate(s) && !isDate(e)) return [];
  if (!isDate(s) || !isDate(e)) return [isDate(s) ? s : e];
  const out = []; const d = parse(s); const end = parse(e);
  if (d > end) return [s];
  let guard = 0;
  while (d <= end && guard < 40) {
    const f = fmt(d);
    if (isBiz(d) || f === s || f === e) out.push(f);
    d.setDate(d.getDate() + 1); guard++;
  }
  return out;
}

function deriveEvents(ipos, mezz, rights, mezzAll) {
  const ev = [];
  const add = (date, cat, type, item, extra = {}) => { if (isDate(date)) ev.push({ date, cat, type, item, ...extra }); };

  ipos.forEach((x) => {
    const fc = rangeDays(x.fcStart, x.fcEnd);
    fc.forEach((d, i) => add(d, "ipo", "수요예측", x, { span: fc.length > 1 ? `${i + 1}/${fc.length}` : "" }));
    const sb = rangeDays(x.subStart, x.subEnd);
    sb.forEach((d, i) => add(d, "ipo", "청약", x, { span: sb.length > 1 ? `${i + 1}/${sb.length}` : "" }));
    if (x.refund) add(x.refund, "ipo", "환불", x);
    else if (isDate(x.subEnd)) add(addBiz(x.subEnd, 2), "ipo", "환불", x, { est: true });
    add(x.listing, "ipo", "상장", x);
    if (isDate(x.listing)) {
      add(addDays(x.listing, 15), "ipo", "확약해제 15일", x);
      add(addMonths(x.listing, 1), "ipo", "확약해제 1개월", x);
      add(addMonths(x.listing, 3), "ipo", "확약해제 3개월", x);
      add(addMonths(x.listing, 6), "ipo", "확약해제 6개월", x);
    }
  });

  mezz.forEach((x) => {
    add(x.issueDate, "mezz", "납입", x);
    if (!(x.star || mezzAll)) return;
    if (x.convStart) add(x.convStart, "mezz", "전환청구 시작", x);
    else if (isDate(x.issueDate)) add(addMonths(x.issueDate, 12), "mezz", "전환청구 시작", x, { est: true });
    const end = isDate(x.maturity) ? x.maturity : "9999-12-31";
    if (isDate(x.putStart)) {
      for (let i = 0; i < 20; i++) { const d = addMonths(x.putStart, i * 3); if (d > end) break; add(d, "mezz", i === 0 ? "첫 풋옵션" : "풋옵션", x); }
    }
    if (x.refix === "있음" && isDate(x.issueDate)) {
      for (let i = 1; i <= 20; i++) { const d = addMonths(x.issueDate, i * 3); if (d > end) break; add(d, "mezz", "리픽싱", x); }
    }
    add(x.maturity, "mezz", "만기", x);
  });

  rights.forEach((x) => {
    if (x.exDate) add(x.exDate, "rights", "권리락", x);
    else if (isDate(x.recordDate)) add(addBiz(x.recordDate, -1), "rights", "권리락", x, { est: true });
    add(x.recordDate, "rights", "배정기준일", x);
    const sb = rangeDays(x.subStart, x.subEnd);
    sb.forEach((d, i) => add(d, "rights", "구주주 청약", x, { span: sb.length > 1 ? `${i + 1}/${sb.length}` : "" }));
    add(x.payDate, "rights", "납입", x);
    add(x.listingDate, "rights", "신주상장", x);
  });

  const order = { ipo: 0, mezz: 1, rights: 2 };
  return ev.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : order[a.cat] - order[b.cat]));
}

const evColor = (e) => (/풋|만기/.test(e.type) ? C.red : e.type.startsWith("확약") ? C.violet : CAT[e.cat].color);
const evName = (e) => e.item.name || e.item.issuer || "";
const evDetail = (e) => {
  const x = e.item;
  if (e.cat === "ipo") {
    const band = x.bandLow || x.bandHigh ? `밴드 ${num(x.bandLow)}~${num(x.bandHigh)}` : "";
    return [x.finalPrice ? `확정 ${num(x.finalPrice)}` : band, x.amount ? `${x.amount}억` : "", x.underwriter].filter(Boolean).join(", ");
  }
  if (e.cat === "mezz") {
    return [`${x.kind || ""}${x.series ? ` ${x.series}회` : ""}`, x.size ? `${num(x.size)}억` : "", x.coupon !== undefined && x.coupon !== "" ? `${x.coupon}%/${x.ytm || "-"}%` : ""].filter(Boolean).join(", ");
  }
  return [x.kind, x.method, x.ratio ? `주당 ${x.ratio}주` : "", x.price ? `${num(x.price)}원` : ""].filter(Boolean).join(", ");
};

function ipoStatus(x) {
  const t = TODAY;
  if (isDate(x.listing) && x.listing <= t) return ["상장 완료", C.mute];
  if (isDate(x.subStart) && t >= x.subStart && t <= (x.subEnd || x.subStart)) return ["청약 중", C.teal];
  if (isDate(x.fcStart) && t >= x.fcStart && t <= (x.fcEnd || x.fcStart)) return ["수요예측 중", C.blue];
  if (isDate(x.subEnd) && t > x.subEnd) return ["상장 대기", C.ink];
  if (isDate(x.fcEnd) && t > x.fcEnd) return ["청약 대기", C.steel];
  return ["예정", C.mute];
}
const lastDate = (...ds) => ds.filter(isDate).sort().pop() || "";
const isNew = (x) => isDate(x.rceptDt) && diffDays(x.rceptDt, TODAY) <= 3;

/* ───────── 공용 UI ───────── */
function Btn({ children, onClick, kind = "ghost", disabled, title, small }) {
  const base = `inline-flex items-center gap-1.5 rounded font-medium focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 disabled:opacity-50 whitespace-nowrap ${small ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm"}`;
  const style = kind === "primary" ? { background: C.ink, color: C.white, border: `1px solid ${C.ink}` } : { background: C.white, color: C.ink, border: `1px solid ${C.line}` };
  return <button type="button" className={base} style={style} onClick={onClick} disabled={disabled} title={title}>{children}</button>;
}
function StarBtn({ on, onClick }) {
  return (
    <button type="button" onClick={onClick} className="p-1 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" title={on ? "관심 해제" : "관심·보유로 표시"} aria-pressed={!!on}>
      <Star size={15} fill={on ? "#E3A008" : "none"} color={on ? "#E3A008" : C.mute} />
    </button>
  );
}
function SrcCell({ x }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {isNew(x) && <span className="text-xs font-semibold px-1.5 py-0.5 rounded" style={{ background: "#FDECEA", color: C.red }}>신규</span>}
      {x.dartUrl
        ? <a href={x.dartUrl} target="_blank" rel="noopener noreferrer" className="text-xs inline-flex items-center gap-0.5 hover:underline" style={{ color: C.blue }} title={x.report}>DART<ExternalLink size={11} /></a>
        : x.src ? <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#EEF2F6", color: C.mute }}>{x.src}</span> : null}
    </span>
  );
}
function SearchBox({ value, onChange, placeholder }) {
  return (
    <label className="relative inline-flex items-center">
      <Search size={14} color={C.mute} className="absolute left-2" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="rounded pl-7 pr-2 py-1.5 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-blue-500" style={{ border: `1px solid ${C.line}` }} aria-label={placeholder} />
    </label>
  );
}
function Seg({ value, onChange, options }) {
  return (
    <div className="inline-flex rounded overflow-hidden" style={{ border: `1px solid ${C.line}` }} role="radiogroup">
      {options.map(([v, l]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className="px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
          style={{ background: value === v ? C.ink : C.white, color: value === v ? C.white : C.steel }}>{l}</button>
      ))}
    </div>
  );
}

/* ───────── 편집 모달 ───────── */
function EditModal({ cat, item, onClose, onSave, onDelete }) {
  const [f, setF] = useState(() => ({ ...item }));
  const [confirmDel, setConfirmDel] = useState(false);
  const fields = FIELDS[cat];
  const nameKey = cat === "mezz" ? "issuer" : "name";
  const isNewItem = !item.__exists;
  const isDart = String(item.id).startsWith("dart-");
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const title = { ipo: "IPO 일정", mezz: "메자닌", rights: "유·무상증자" }[cat];

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3" style={{ background: "rgba(15,35,64,0.45)" }} onClick={onClose}>
      <div className="bg-white rounded-lg w-full max-w-2xl overflow-y-auto shadow-xl" style={{ maxHeight: "92vh" }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`${title} 편집`}>
        <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: C.line }}>
          <h3 className="font-bold" style={{ color: C.ink }}>{isNewItem ? `${title} 추가` : `${title} 수정`}</h3>
          <button type="button" onClick={onClose} className="p-1 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" aria-label="닫기"><X size={18} /></button>
        </div>
        {isDart && (
          <div className="mx-5 mt-4 rounded px-3 py-2 text-xs" style={{ background: "#EEF4FE", color: C.steel }}>
            DART에서 수집한 항목입니다. 고친 값은 이 브라우저에만 저장되고, 이후 DART 갱신이 와도 유지됩니다.
            {item.dartUrl && <> <a href={item.dartUrl} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: C.blue }}>{item.report || "공시 원문"} 열기</a></>}
          </div>
        )}
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
          {fields.map(([k, label, type, opt]) => {
            const hint = typeof opt === "string" ? opt : "";
            const inputStyle = { border: `1px solid ${C.line}`, color: C.ink };
            const cls = "rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
            return (
              <label key={k} className={`flex flex-col gap-1 ${type === "textarea" ? "sm:col-span-2" : ""}`}>
                <span className="text-xs font-medium" style={{ color: C.steel }}>{label}{k === nameKey && <span style={{ color: C.red }}> *</span>}</span>
                {type === "select" ? (
                  <select className={cls} style={inputStyle} value={f[k] || ""} onChange={(e) => set(k, e.target.value)}>
                    {[...new Set([...(opt || []), f[k] || ""])].map((o) => <option key={o} value={o}>{o || "선택"}</option>)}
                  </select>
                ) : type === "textarea" ? (
                  <textarea rows={2} className={cls} style={inputStyle} value={f[k] || ""} onChange={(e) => set(k, e.target.value)} />
                ) : (
                  <input type={type} className={cls} style={inputStyle} value={f[k] || ""} onChange={(e) => set(k, e.target.value)} />
                )}
                {hint && <span className="text-xs" style={{ color: C.mute }}>{hint}</span>}
              </label>
            );
          })}
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-t" style={{ borderColor: C.line }}>
          <div>
            {!isNewItem && (confirmDel
              ? <span className="flex items-center gap-2 text-sm"><span style={{ color: C.red }}>{isDart ? "목록에서 숨길까요?" : "삭제할까요?"}</span><Btn small onClick={() => onDelete(cat, f.id)}>{isDart ? "숨기기" : "삭제"}</Btn><Btn small onClick={() => setConfirmDel(false)}>취소</Btn></span>
              : <Btn small onClick={() => setConfirmDel(true)}><Trash2 size={13} />{isDart ? "숨기기" : "삭제"}</Btn>)}
          </div>
          <div className="flex gap-2">
            <Btn onClick={onClose}>취소</Btn>
            <Btn kind="primary" onClick={() => { const c = { ...f }; delete c.__exists; onSave(cat, c); }} disabled={!String(f[nameKey] || "").trim()}>저장</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────── 메인 ───────── */
export default function App() {
  const [local, setLocal] = useState(loadLocal);
  const [tab, setTab] = useState("cal");
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [selDay, setSelDay] = useState(TODAY);
  const [filters, setFilters] = useState({ ipo: true, mezz: true, rights: true, star: false });
  const [mezzAll, setMezzAll] = useState(!!local.prefs.mezzAll);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState("");
  const [resetArm, setResetArm] = useState(false);
  const [q, setQ] = useState({ ipo: "", mezz: "", rights: "" });
  const [mezzScope, setMezzScope] = useState(DART.mezz.length ? "30" : "all");
  const [hidePast, setHidePast] = useState(true);
  const fileRef = useRef(null);

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ ...local, prefs: { ...local.prefs, mezzAll } })); }
    catch (e) { console.error("저장 실패", e); }
  }, [local, mezzAll]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2600); return () => clearTimeout(t); }, [toast]);

  const ipos = useMemo(() => combine(local, "ipo"), [local]);
  const mezz = useMemo(() => combine(local, "mezz"), [local]);
  const rights = useMemo(() => combine(local, "rights"), [local]);

  const events = useMemo(() => deriveEvents(ipos, mezz, rights, mezzAll), [ipos, mezz, rights, mezzAll]);
  const shown = useMemo(() => events.filter((e) => filters[e.cat] && (!filters.star || e.item.star)), [events, filters]);
  const byDate = useMemo(() => { const m = {}; shown.forEach((e) => { (m[e.date] = m[e.date] || []).push(e); }); return m; }, [shown]);
  const railEnd = addDays(TODAY, 14);
  const railDays = useMemo(() => Object.keys(byDate).filter((d) => d >= TODAY && d <= railEnd).sort(), [byDate, railEnd]);
  const newCount = useMemo(() => [...ipos, ...mezz, ...rights].filter(isNew).length, [ipos, mezz, rights]);

  /* 저장·삭제 */
  const saveItem = (cat, item, quiet = false) => {
    const key = LIST[cat];
    if (String(item.id).startsWith("dart-")) {
      setLocal((l) => {
        const base = DMAP[cat].get(item.id) || l.over[item.id]?.base || item;
        const patch = {};
        Object.keys(item).forEach((k) => { if (blank(item[k]) !== blank(base[k])) patch[k] = item[k]; });
        const over = { ...l.over };
        if (Object.keys(patch).length === 0) delete over[item.id];
        else over[item.id] = { cat, patch, base };
        return { ...l, over };
      });
    } else {
      setLocal((l) => {
        const arr = l.user[key] || [];
        const exists = arr.some((x) => x.id === item.id);
        return { ...l, user: { ...l.user, [key]: exists ? arr.map((x) => (x.id === item.id ? item : x)) : [...arr, item] } };
      });
    }
    if (!quiet) { setModal(null); setToast("저장했습니다."); }
  };
  const deleteItem = (cat, id) => {
    const key = LIST[cat];
    if (String(id).startsWith("dart-")) {
      setLocal((l) => { const over = { ...l.over }; delete over[id]; return { ...l, over, hidden: [...new Set([...l.hidden, id])] }; });
      setToast("목록에서 숨겼습니다. 초기화하면 다시 보입니다.");
    } else {
      setLocal((l) => ({ ...l, user: { ...l.user, [key]: (l.user[key] || []).filter((x) => x.id !== id) } }));
      setToast("삭제했습니다.");
    }
    setModal(null);
  };
  const toggleStar = (cat, item) => saveItem(cat, { ...item, star: !item.star }, true);
  const openNew = (cat) => setModal({ cat, item: { id: uid(), src: "직접입력", ...(cat === "mezz" ? { kind: "CB", method: "사모", refix: "미확인" } : cat === "rights" ? { kind: "무상증자" } : {}) } });
  const openEdit = (cat, item) => setModal({ cat, item: { ...item, __exists: true } });

  const copyTSV = (rows) => {
    const text = rows.map((r) => r.map((c) => String(c ?? "").replace(/[\t\n]/g, " ")).join("\t")).join("\n");
    const fallback = () => {
      const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); setToast("복사했습니다. 엑셀에 붙여넣으세요."); } catch (e) { setToast("복사가 차단되었습니다."); }
      document.body.removeChild(ta);
    };
    try { navigator.clipboard.writeText(text).then(() => setToast("복사했습니다. 엑셀에 붙여넣으세요."), fallback); } catch (e) { fallback(); }
  };
  const exportBackup = () => {
    const blob = new Blob([JSON.stringify({ ...local, exportedAt: new Date().toISOString() }, null, 1)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `메자닌IPO보드_백업_${TODAY}.json`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setToast("백업 파일을 내려받았습니다.");
  };
  const importBackup = (file) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const j = JSON.parse(r.result);
        if (!j.user || !j.over) throw new Error("형식");
        setLocal({ user: { ipos: [], mezz: [], rights: [], ...j.user }, over: j.over, hidden: j.hidden || [], prefs: j.prefs || {} });
        setToast("백업을 불러왔습니다.");
      } catch (e) { setToast("이 보드에서 내보낸 백업 파일이 아닙니다."); }
    };
    r.readAsText(file);
  };
  const resetData = () => {
    if (!resetArm) { setResetArm(true); setTimeout(() => setResetArm(false), 4000); return; }
    setLocal({ user: SEED_USER, over: {}, hidden: [], prefs: {} }); setResetArm(false); setToast("내 입력을 모두 지웠습니다.");
  };

  /* 표시 준비 */
  const todayD = parse(TODAY);
  const todayLabel = `${todayD.getFullYear()}년 ${todayD.getMonth() + 1}월 ${todayD.getDate()}일 (${WD[todayD.getDay()]})`;
  const genLabel = DART.generatedAt ? DART.generatedAt.replace("T", " ").slice(0, 16) : "";

  const y = month.getFullYear(); const m = month.getMonth();
  const startOffset = new Date(y, m, 1).getDay();
  const cells = Array.from({ length: 42 }, (_, i) => new Date(y, m, 1 - startOffset + i));
  const gridCells = cells.slice(35).some((d) => d.getMonth() === m) ? cells : cells.slice(0, 35);

  const LINKS = [
    ["DART 공시검색", "https://dart.fss.or.kr/dsab007/main.do"],
    ["KIND 공모일정", "https://kind.krx.co.kr/listinvstg/pubofrschdl.do?method=searchPubofrScholMain"],
    ["38 공모일정", "https://www.38.co.kr/html/fund/?o=k"],
    ["피너츠 IPO", "https://www.finuts.co.kr/html/ipo/"],
    ["막내AI", "https://maknae.ai.kr/"],
  ];

  const match = (x, s) => !s || norm(`${x.name || ""}${x.issuer || ""}${x.underwriter || ""}${x.memo || ""}`).includes(norm(s));

  const ipoRows = ipos
    .filter((x) => match(x, q.ipo))
    .filter((x) => !hidePast || !lastDate(x.listing, x.refund, x.subEnd) || lastDate(x.listing, x.refund, x.subEnd) >= addDays(TODAY, -7))
    .sort((a, b) => (b.star ? 1 : 0) - (a.star ? 1 : 0) || String(a.subStart || a.fcStart || "9999").localeCompare(String(b.subStart || b.fcStart || "9999")));

  const scopeDays = { "3": 3, "30": 30, "90": 90 }[mezzScope];
  const mezzRows = mezz
    .filter((x) => match(x, q.mezz))
    .filter((x) => mezzScope === "star" ? x.star : scopeDays ? (x.star || (isDate(x.boardDate || x.rceptDt) && diffDays(x.boardDate || x.rceptDt, TODAY) <= scopeDays) || (!x.boardDate && !x.rceptDt)) : true)
    .sort((a, b) => (b.star ? 1 : 0) - (a.star ? 1 : 0) || String(b.boardDate || b.rceptDt || "").localeCompare(String(a.boardDate || a.rceptDt || "")));

  const rightsRows = rights
    .filter((x) => match(x, q.rights))
    .filter((x) => { const l = lastDate(x.listingDate, x.payDate, x.recordDate, x.subEnd); return !hidePast || !l || l >= addDays(TODAY, -7); })
    .sort((a, b) => (b.star ? 1 : 0) - (a.star ? 1 : 0) || String(a.recordDate || a.subStart || a.rceptDt || "9999").localeCompare(String(b.recordDate || b.subStart || b.rceptDt || "9999")));

  const mzTotal = mezzRows.reduce((s, x) => s + (Number(x.size) || 0), 0);
  const mzZero = mezzRows.filter((x) => String(x.coupon) === "0" && String(x.ytm) === "0").length;
  const byKind = ["CB", "BW", "EB"].map((k) => [k, mezzRows.filter((x) => x.kind === k).reduce((s, x) => s + (Number(x.size) || 0), 0)]);

  const TABS = [["cal", "통합 캘린더"], ["ipo", "IPO 일정"], ["mezz", "메자닌 발행현황"], ["rights", "유·무상증자"]];
  const th = "px-3 py-2 text-left text-xs font-semibold whitespace-nowrap";
  const td = "px-3 py-2 text-sm whitespace-nowrap";
  const thStyle = { color: C.steel, background: "#EEF2F6", borderBottom: `1px solid ${C.line}`, position: "sticky", top: 0 };
  const rowStyle = { borderBottom: `1px solid ${C.line}` };
  const tableWrap = { border: `1px solid ${C.line}`, maxHeight: "70vh" };
  const dayEvents = byDate[selDay] || [];

  return (
    <div style={{ background: C.paper, minHeight: "100vh", fontFamily: FONT, color: C.ink, fontVariantNumeric: "tabular-nums" }}>
      <header style={{ background: C.ink }}>
        <div className="max-w-screen-2xl mx-auto px-4 pt-4 pb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-white">메자닌·IPO 일정 보드</h1>
            <p className="text-sm mt-0.5" style={{ color: "#AFC0D6" }}>{todayLabel} 기준</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-1.5 rounded px-2.5 py-1.5" style={{ background: "#1B3354", color: genLabel ? C.white : "#F8C9C4", border: "1px solid #2C4A70" }}>
              <Database size={14} />{genLabel ? `DART 수집 ${genLabel}` : "DART 수집 전 (설치가이드 참고)"}
            </span>
            {newCount > 0 && (
              <button type="button" onClick={() => { setTab("mezz"); setMezzScope("3"); }} className="rounded px-2.5 py-1.5 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400" style={{ background: C.teal, color: C.white }}>
                최근 3일 신규 공시 {newCount}건
              </button>
            )}
          </div>
        </div>
        <div className="max-w-screen-2xl mx-auto px-4 pb-3 flex flex-wrap gap-x-4 gap-y-1">
          {LINKS.map(([l, u]) => (
            <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="text-xs inline-flex items-center gap-1 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-400 rounded" style={{ color: "#AFC0D6" }}>{l}<ExternalLink size={11} /></a>
          ))}
        </div>
      </header>

      {/* 앞으로 14일 */}
      <section className="max-w-screen-2xl mx-auto px-4 pt-4" aria-label="앞으로 14일 일정">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-base font-bold">앞으로 14일</h2>
          <span className="text-xs" style={{ color: C.mute }}>{railDays.reduce((s, d) => s + byDate[d].length, 0)}건, 캘린더 필터 적용</span>
        </div>
        {railDays.length === 0 ? (
          <div className="rounded bg-white px-4 py-6 text-sm" style={{ border: `1px solid ${C.line}`, color: C.mute }}>2주 안에 잡힌 일정이 없습니다. 보유 종목에 ★를 누르거나 일정을 직접 추가하세요.</div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {railDays.map((d) => {
              const dd = diffDays(TODAY, d); const list = byDate[d];
              const risk = list.some((e) => /풋|만기|권리락/.test(e.type));
              return (
                <button type="button" key={d} onClick={() => { setSelDay(d); setTab("cal"); const pd = parse(d); setMonth(new Date(pd.getFullYear(), pd.getMonth(), 1)); }}
                  className="flex-shrink-0 w-56 flex flex-col justify-start text-left bg-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500" style={{ border: `1px solid ${selDay === d ? C.ink : C.line}` }}>
                  <div className="flex items-baseline gap-2 px-3 py-2" style={{ borderBottom: `1px solid ${C.line}` }}>
                    <span className="text-lg font-bold" style={{ color: dd === 0 ? C.teal : C.ink }}>{dd === 0 ? "오늘" : `D-${dd}`}</span>
                    <span className="text-sm" style={{ color: C.steel }}>{mdw(d)}</span>
                    {risk && <AlertTriangle size={13} color={C.red} className="ml-auto" aria-label="확인 필요 일정 포함" />}
                  </div>
                  <ul className="px-3 py-2 space-y-1">
                    {list.slice(0, 5).map((e, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        <span className="w-1 h-4 rounded-sm flex-shrink-0" style={{ background: evColor(e) }} />
                        <span className="truncate">{e.item.star && "★ "}{evName(e)}</span>
                        <span className="ml-auto text-xs whitespace-nowrap" style={{ color: evColor(e) }}>{e.type}</span>
                      </li>
                    ))}
                    {list.length > 5 && <li className="text-xs" style={{ color: C.mute }}>외 {list.length - 5}건</li>}
                  </ul>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <nav className="max-w-screen-2xl mx-auto px-4 mt-4 flex gap-1 overflow-x-auto" style={{ borderBottom: `1px solid ${C.line}` }} role="tablist">
        {TABS.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className="px-4 py-2 text-sm whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-t"
            style={{ color: tab === k ? C.ink : C.mute, fontWeight: tab === k ? 700 : 500, borderBottom: `2px solid ${tab === k ? C.ink : "transparent"}`, marginBottom: -1 }}>{l}</button>
        ))}
      </nav>

      <main className="max-w-screen-2xl mx-auto px-4 py-4">
        {tab === "cal" && (
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 bg-white rounded" style={{ border: `1px solid ${C.line}` }}>
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2" style={{ borderBottom: `1px solid ${C.line}` }}>
                <div className="flex items-center gap-1">
                  <button type="button" className="p-1.5 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" onClick={() => setMonth(new Date(y, m - 1, 1))} aria-label="이전 달"><ChevronLeft size={18} /></button>
                  <span className="text-lg font-bold w-28 text-center">{y}.{pad(m + 1)}</span>
                  <button type="button" className="p-1.5 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" onClick={() => setMonth(new Date(y, m + 1, 1))} aria-label="다음 달"><ChevronRight size={18} /></button>
                  <Btn small onClick={() => { const t = parse(TODAY); setMonth(new Date(t.getFullYear(), t.getMonth(), 1)); setSelDay(TODAY); }}>오늘</Btn>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  {Object.entries(CAT).map(([k, v]) => (
                    <label key={k} className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={filters[k]} onChange={() => setFilters((f) => ({ ...f, [k]: !f[k] }))} />
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: v.color }} />{v.label}
                    </label>
                  ))}
                  <label className="inline-flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={filters.star} onChange={() => setFilters((f) => ({ ...f, star: !f.star }))} />★ 관심만</label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer" title="끄면 ★ 표시한 메자닌만 전환청구·풋·리픽싱·만기를 보여줍니다"><input type="checkbox" checked={mezzAll} onChange={() => setMezzAll((v) => !v)} />메자닌 전체 일정</label>
                </div>
              </div>
              <div className="grid grid-cols-7">
                {WD.map((w, i) => <div key={w} className="px-2 py-1.5 text-xs font-semibold text-center" style={{ color: i === 0 ? C.red : i === 6 ? C.blue : C.steel, borderBottom: `1px solid ${C.line}` }}>{w}</div>)}
                {gridCells.map((d) => {
                  const f = fmt(d); const inMonth = d.getMonth() === m; const list = byDate[f] || []; const hol = HOLIDAYS.has(f);
                  const isToday = f === TODAY;
                  return (
                    <button type="button" key={f} onClick={() => setSelDay(f)} className="text-left p-1 sm:p-1.5 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
                      style={{ minHeight: 92, borderRight: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}`, background: f === selDay ? "#EAF1FA" : inMonth ? C.white : "#F8FAFC" }} aria-label={`${mdw(f)} 일정 ${list.length}건`}>
                      <div className="flex items-center gap-1 mb-1">
                        <span className="text-xs font-semibold inline-flex items-center justify-center rounded-full"
                          style={{ width: 22, height: 22, background: isToday ? C.ink : "transparent", color: isToday ? C.white : !inMonth ? "#B8C2CE" : d.getDay() === 0 || hol ? C.red : d.getDay() === 6 ? C.blue : C.ink }}>{d.getDate()}</span>
                        {hol && inMonth && <span className="text-xs hidden sm:inline" style={{ color: C.red }}>휴장</span>}
                      </div>
                      <div className="hidden sm:block space-y-0.5">
                        {list.slice(0, 3).map((e, i) => (
                          <div key={i} className="text-xs truncate rounded px-1" style={{ background: `${evColor(e)}14`, color: evColor(e), borderLeft: `2px solid ${evColor(e)}`, opacity: inMonth ? 1 : 0.55 }}>
                            {e.type.replace("확약해제 ", "확약")} {evName(e)}
                          </div>
                        ))}
                        {list.length > 3 && <div className="text-xs px-1" style={{ color: C.mute }}>+{list.length - 3}</div>}
                      </div>
                      <div className="flex sm:hidden flex-wrap gap-0.5">{list.slice(0, 6).map((e, i) => <span key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: evColor(e) }} />)}</div>
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2 text-xs" style={{ color: C.mute }}>
                <span><span style={{ color: C.teal }}>■</span> IPO 수요예측·청약·환불·상장</span>
                <span><span style={{ color: C.violet }}>■</span> 의무보유확약 해제</span>
                <span><span style={{ color: C.blue }}>■</span> 메자닌 납입·전환청구·리픽싱</span>
                <span><span style={{ color: C.red }}>■</span> 풋옵션·만기</span>
                <span><span style={{ color: C.amber }}>■</span> 권리락·기준일·증자 청약</span>
              </div>
            </div>
            <aside className="w-full lg:w-80 bg-white rounded self-start" style={{ border: `1px solid ${C.line}` }} aria-label="선택한 날짜 일정">
              <div className="px-4 py-3" style={{ borderBottom: `1px solid ${C.line}` }}>
                <div className="text-base font-bold">{mdw(selDay)}</div>
                <div className="text-xs" style={{ color: C.mute }}>
                  {selDay === TODAY ? "오늘" : diffDays(TODAY, selDay) > 0 ? `D-${diffDays(TODAY, selDay)}` : `${-diffDays(TODAY, selDay)}일 전`}{HOLIDAYS.has(selDay) ? ", 휴장일" : ""}, {dayEvents.length}건
                </div>
              </div>
              {dayEvents.length === 0 ? <p className="px-4 py-6 text-sm" style={{ color: C.mute }}>이 날짜에 표시할 일정이 없습니다.</p> : (
                <ul style={{ maxHeight: 560, overflowY: "auto" }}>
                  {dayEvents.map((e, i) => (
                    <li key={i} style={{ borderBottom: `1px solid ${C.line}` }}>
                      <button type="button" onClick={() => openEdit(e.cat, e.item)} className="w-full text-left px-4 py-2.5 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold px-1.5 py-0.5 rounded" style={{ background: `${evColor(e)}18`, color: evColor(e) }}>{e.type}{e.span ? ` ${e.span}` : ""}</span>
                          {e.est && <span className="text-xs" style={{ color: C.mute }}>추정</span>}
                          {e.item.star && <Star size={12} fill="#E3A008" color="#E3A008" />}
                        </div>
                        <div className="text-sm font-semibold mt-1">{evName(e)}</div>
                        <div className="text-xs mt-0.5" style={{ color: C.steel }}>{evDetail(e)}</div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          </div>
        )}

        {tab === "ipo" && (
          <section>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex flex-wrap items-center gap-2">
                <SearchBox value={q.ipo} onChange={(v) => setQ((s) => ({ ...s, ipo: v }))} placeholder="종목·주관사 검색" />
                <label className="inline-flex items-center gap-1.5 text-sm"><input type="checkbox" checked={hidePast} onChange={() => setHidePast((v) => !v)} />지난 공모 숨기기</label>
                <span className="text-xs" style={{ color: C.mute }}>{ipoRows.length}건. DART에는 수요예측일·상장일이 없어 직접 입력합니다.</span>
              </div>
              <div className="flex gap-2">
                <Btn onClick={() => copyTSV([["종목", "시장", "수요예측", "청약", "환불", "상장", "밴드하단", "밴드상단", "확정가", "공모금액(억)", "주관사", "기관경쟁률", "확약비율", "메모", "DART"],
                  ...ipoRows.map((x) => [x.name, x.market, range(x.fcStart, x.fcEnd), range(x.subStart, x.subEnd), x.refund || (x.subEnd ? addBiz(x.subEnd, 2) : ""), x.listing, x.bandLow, x.bandHigh, x.finalPrice, x.amount, x.underwriter, x.instComp, x.lockup, x.memo, x.dartUrl])])}><Copy size={14} />엑셀용 복사</Btn>
                <Btn kind="primary" onClick={() => openNew("ipo")}><Plus size={14} />IPO 추가</Btn>
              </div>
            </div>
            <div className="bg-white rounded overflow-auto" style={tableWrap}>
              <table className="w-full">
                <thead><tr>{["", "종목", "상태", "수요예측", "청약", "환불", "상장", "희망밴드", "확정가", "공모금액", "주관사", "기관경쟁률", "확약 해제(1·3·6M)", "메모", "출처", ""].map((h, i) => <th key={i} className={th} style={thStyle}>{h}</th>)}</tr></thead>
                <tbody>
                  {ipoRows.length === 0 && <tr><td colSpan={16} className="px-4 py-8 text-sm text-center" style={{ color: C.mute }}>표시할 IPO가 없습니다. 검색어나 필터를 바꾸거나 직접 추가하세요.</td></tr>}
                  {ipoRows.map((x) => {
                    const [st, stc] = ipoStatus(x); const refund = x.refund || (x.subEnd ? addBiz(x.subEnd, 2) : "");
                    return (
                      <tr key={x.id} style={rowStyle}>
                        <td className="pl-2"><StarBtn on={x.star} onClick={() => toggleStar("ipo", x)} /></td>
                        <td className={td}><div className="font-semibold">{x.name}</div><div className="text-xs" style={{ color: C.mute }}>{x.market}</div></td>
                        <td className={td}><span className="text-xs font-semibold" style={{ color: stc }}>{st}</span></td>
                        <td className={td}>{range(x.fcStart, x.fcEnd)}</td>
                        <td className={td} style={{ fontWeight: 600 }}>{range(x.subStart, x.subEnd)}</td>
                        <td className={td} style={{ color: x.refund ? C.ink : C.mute }}>{md(refund)}</td>
                        <td className={td}>{md(x.listing)}</td>
                        <td className={td}>{x.bandLow || x.bandHigh ? `${num(x.bandLow)}~${num(x.bandHigh)}` : ""}</td>
                        <td className={td} style={{ fontWeight: 600 }}>{num(x.finalPrice)}</td>
                        <td className={td}>{x.amount ? `${x.amount}억` : ""}</td>
                        <td className={td}>{x.underwriter}</td>
                        <td className={td}>{x.instComp}</td>
                        <td className={td} style={{ color: C.violet }}>{isDate(x.listing) ? `${md(addMonths(x.listing, 1))}, ${md(addMonths(x.listing, 3))}, ${md(addMonths(x.listing, 6))}` : ""}</td>
                        <td className="px-3 py-2 text-xs" style={{ color: C.steel, minWidth: 150 }}>{x.memo}</td>
                        <td className={td}><SrcCell x={x} /></td>
                        <td className="pr-2"><button type="button" onClick={() => openEdit("ipo", x)} className="p-1 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" aria-label={`${x.name} 수정`}><Pencil size={14} color={C.steel} /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === "mezz" && (
          <section>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex flex-wrap items-center gap-2">
                <Seg value={mezzScope} onChange={setMezzScope} options={[["3", "최근 3일"], ["30", "30일"], ["90", "90일"], ["all", "전체"], ["star", "★ 보유·관심"]]} />
                <SearchBox value={q.mezz} onChange={(v) => setQ((s) => ({ ...s, mezz: v }))} placeholder="발행사 검색" />
              </div>
              <div className="flex gap-2">
                <Btn onClick={() => copyTSV([["발행사", "시장", "종류", "회차", "방식", "규모(억)", "표면(%)", "만기(%)", "전환가", "리픽싱", "리픽싱한도", "결의일", "납입일", "전환청구시작", "전환청구종료", "첫 풋", "만기일", "콜옵션", "인수자", "메모", "DART"],
                  ...mezzRows.map((x) => [x.issuer, x.market, x.kind, x.series, x.method, x.size, x.coupon, x.ytm, x.convPrice, x.refix, x.refixFloor, x.boardDate, x.issueDate, x.convStart, x.convEnd, x.putStart, x.maturity, x.callInfo, x.investors, x.memo, x.dartUrl])])}><Copy size={14} />엑셀용 복사</Btn>
                <Btn kind="primary" onClick={() => openNew("mezz")}><Plus size={14} />메자닌 추가</Btn>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px rounded overflow-hidden mb-3" style={{ background: C.line, border: `1px solid ${C.line}` }}>
              <div className="bg-white px-4 py-3"><div className="text-xs" style={{ color: C.mute }}>표시 건수</div><div className="text-xl font-bold">{mezzRows.length}건</div></div>
              <div className="bg-white px-4 py-3"><div className="text-xs" style={{ color: C.mute }}>발행규모 합계</div><div className="text-xl font-bold">{num(Math.round(mzTotal))}억</div><div className="text-xs" style={{ color: C.steel }}>{byKind.filter(([, v]) => v).map(([k, v]) => `${k} ${num(Math.round(v))}`).join(", ")}</div></div>
              <div className="bg-white px-4 py-3"><div className="text-xs" style={{ color: C.mute }}>표면·만기 0% (무이자)</div><div className="text-xl font-bold">{mzZero}건</div><div className="text-xs" style={{ color: C.steel }}>{mezzRows.length ? Math.round((mzZero / mezzRows.length) * 100) : 0}%</div></div>
              <div className="bg-white px-4 py-3"><div className="text-xs" style={{ color: C.mute }}>보유·관심(★)</div><div className="text-xl font-bold">{mezz.filter((x) => x.star).length}건</div><div className="text-xs" style={{ color: C.steel }}>★ 종목만 캘린더에 풋·만기 표시</div></div>
            </div>
            <div className="bg-white rounded overflow-auto" style={tableWrap}>
              <table className="w-full">
                <thead><tr>{["", "발행사", "종류", "방식", "규모(억)", "표면/만기", "전환·행사가", "리픽싱", "결의일", "납입일", "전환청구", "첫 풋", "만기", "메모", "출처", ""].map((h, i) => <th key={i} className={th} style={thStyle}>{h}</th>)}</tr></thead>
                <tbody>
                  {mezzRows.length === 0 && <tr><td colSpan={16} className="px-4 py-8 text-sm text-center" style={{ color: C.mute }}>{DART.mezz.length ? "이 기간에 해당하는 발행결정 공시가 없습니다. 기간을 넓혀 보세요." : "DART 수집 전입니다. 설치가이드대로 수집을 실행하거나 보유 종목을 직접 추가하세요."}</td></tr>}
                  {mezzRows.map((x) => {
                    const putSoon = isDate(x.putStart) && diffDays(TODAY, x.putStart) >= 0 && diffDays(TODAY, x.putStart) <= 60;
                    const zero = String(x.coupon) === "0" && String(x.ytm) === "0";
                    return (
                      <tr key={x.id} style={rowStyle}>
                        <td className="pl-2"><StarBtn on={x.star} onClick={() => toggleStar("mezz", x)} /></td>
                        <td className={td}><div className="font-semibold">{x.issuer}</div><div className="text-xs" style={{ color: C.mute }}>{x.market}</div></td>
                        <td className={td}><span className="text-xs font-semibold px-1.5 py-0.5 rounded" style={{ background: "#E8EFFD", color: C.blue }}>{x.kind}</span>{x.series && <span className="text-xs ml-1" style={{ color: C.mute }}>{x.series}회</span>}</td>
                        <td className={td}>{x.method}</td>
                        <td className={td} style={{ fontWeight: 600, textAlign: "right" }}>{num(x.size)}</td>
                        <td className={td} style={{ color: zero ? C.teal : C.ink }}>{x.coupon !== undefined && x.coupon !== "" ? `${x.coupon}% / ${x.ytm || "-"}%` : ""}</td>
                        <td className={td} style={{ textAlign: "right" }}>{num(x.convPrice)}</td>
                        <td className={td}>{x.refix}{x.refixFloor ? <div className="text-xs" style={{ color: C.mute }}>{x.refixFloor}</div> : null}</td>
                        <td className={td}>{ymd2(x.boardDate)}</td>
                        <td className={td}>{ymd2(x.issueDate)}</td>
                        <td className={td} style={{ color: x.convStart ? C.ink : C.mute }}>{x.convStart ? ymd2(x.convStart) : x.issueDate ? `${ymd2(addMonths(x.issueDate, 12))} 추정` : ""}</td>
                        <td className={td} style={{ color: putSoon ? C.red : C.ink, fontWeight: putSoon ? 700 : 400 }}>{ymd2(x.putStart)}{putSoon ? ` (D-${diffDays(TODAY, x.putStart)})` : ""}</td>
                        <td className={td}>{ymd2(x.maturity)}</td>
                        <td className="px-3 py-2 text-xs" style={{ color: C.steel, minWidth: 140 }}>{x.memo}</td>
                        <td className={td}><SrcCell x={x} /></td>
                        <td className="pr-2"><button type="button" onClick={() => openEdit("mezz", x)} className="p-1 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" aria-label={`${x.issuer} 수정`}><Pencil size={14} color={C.steel} /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs mt-2" style={{ color: C.mute }}>DART 발행결정 API에는 조기상환청구(풋) 일정과 인수자가 없습니다. 보유 종목은 공시 원문에서 확인해 입력하세요.</p>
          </section>
        )}

        {tab === "rights" && (
          <section>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex flex-wrap items-center gap-2">
                <SearchBox value={q.rights} onChange={(v) => setQ((s) => ({ ...s, rights: v }))} placeholder="종목 검색" />
                <label className="inline-flex items-center gap-1.5 text-sm"><input type="checkbox" checked={hidePast} onChange={() => setHidePast((v) => !v)} />지난 일정 숨기기</label>
                <span className="text-xs" style={{ color: C.mute }}>{rightsRows.length}건. 권리락일은 비어 있으면 기준일 전 1영업일로 계산합니다.</span>
              </div>
              <div className="flex gap-2">
                <Btn onClick={() => copyTSV([["종목", "시장", "구분", "배정방식", "주당배정", "발행가", "조달(억)", "기준일", "권리락", "청약", "납입", "신주상장", "메모", "DART"],
                  ...rightsRows.map((x) => [x.name, x.market, x.kind, x.method, x.ratio, x.price, x.size, x.recordDate, x.exDate || (x.recordDate ? addBiz(x.recordDate, -1) : ""), range(x.subStart, x.subEnd), x.payDate, x.listingDate, x.memo, x.dartUrl])])}><Copy size={14} />엑셀용 복사</Btn>
                <Btn kind="primary" onClick={() => openNew("rights")}><Plus size={14} />증자 추가</Btn>
              </div>
            </div>
            <div className="bg-white rounded overflow-auto" style={tableWrap}>
              <table className="w-full">
                <thead><tr>{["", "종목", "구분", "배정방식", "주당 배정", "발행가", "조달(억)", "권리락", "배정기준일", "구주주 청약", "납입", "신주상장", "메모", "출처", ""].map((h, i) => <th key={i} className={th} style={thStyle}>{h}</th>)}</tr></thead>
                <tbody>
                  {rightsRows.length === 0 && <tr><td colSpan={15} className="px-4 py-8 text-sm text-center" style={{ color: C.mute }}>표시할 증자 이벤트가 없습니다. DART 수집을 기다리거나 직접 추가하세요.</td></tr>}
                  {rightsRows.map((x) => {
                    const ex = x.exDate || (x.recordDate ? addBiz(x.recordDate, -1) : "");
                    const exSoon = isDate(ex) && diffDays(TODAY, ex) >= 0 && diffDays(TODAY, ex) <= 7;
                    return (
                      <tr key={x.id} style={rowStyle}>
                        <td className="pl-2"><StarBtn on={x.star} onClick={() => toggleStar("rights", x)} /></td>
                        <td className={td}><div className="font-semibold">{x.name}</div><div className="text-xs" style={{ color: C.mute }}>{x.market}</div></td>
                        <td className={td}><span className="text-xs font-semibold px-1.5 py-0.5 rounded" style={{ background: "#FBF1DF", color: C.amber }}>{x.kind}</span></td>
                        <td className="px-3 py-2 text-sm" style={{ minWidth: 120 }}>{x.method}</td>
                        <td className={td}>{x.ratio}</td>
                        <td className={td} style={{ textAlign: "right" }}>{num(x.price)}</td>
                        <td className={td} style={{ textAlign: "right" }}>{num(x.size)}</td>
                        <td className={td} style={{ color: exSoon ? C.red : x.exDate ? C.ink : C.mute, fontWeight: exSoon ? 700 : 400 }}>{ymd2(ex)}{!x.exDate && ex ? " 추정" : ""}</td>
                        <td className={td}>{ymd2(x.recordDate)}</td>
                        <td className={td}>{range(x.subStart, x.subEnd)}</td>
                        <td className={td}>{ymd2(x.payDate)}</td>
                        <td className={td}>{ymd2(x.listingDate)}</td>
                        <td className="px-3 py-2 text-xs" style={{ color: C.steel, minWidth: 140 }}>{x.memo}</td>
                        <td className={td}><SrcCell x={x} /></td>
                        <td className="pr-2"><button type="button" onClick={() => openEdit("rights", x)} className="p-1 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" aria-label={`${x.name} 수정`}><Pencil size={14} color={C.steel} /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs mt-2" style={{ color: C.mute }}>제3자배정 유상증자는 DART 결정 API에 납입일이 없어 공시 원문 확인이 필요합니다.</p>
          </section>
        )}

        <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 text-xs" style={{ color: C.mute }}>
          <span style={{ maxWidth: 640 }}>★ 표시, 직접 입력, 수정한 값은 이 브라우저에만 저장됩니다. PC를 옮길 때는 백업 파일을 내보내 불러오세요. '추정' 값은 관행 기준 계산이므로 공시 원문으로 확인하세요.</span>
          <div className="flex flex-wrap gap-2">
            <Btn small onClick={exportBackup}><Download size={13} />내 입력 백업</Btn>
            <Btn small onClick={() => fileRef.current && fileRef.current.click()}><Upload size={13} />백업 불러오기</Btn>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { importBackup(e.target.files[0]); e.target.value = ""; }} />
            <Btn small onClick={resetData}>{resetArm ? "한 번 더 누르면 초기화" : "내 입력 초기화"}</Btn>
          </div>
        </footer>
      </main>

      {modal && <EditModal cat={modal.cat} item={modal.item} onClose={() => setModal(null)} onSave={saveItem} onDelete={deleteItem} />}
      {toast && <div className="fixed bottom-4 left-1/2 z-50 px-4 py-2 rounded text-sm text-white shadow-lg" style={{ background: C.ink, transform: "translateX(-50%)" }} role="status">{toast}</div>}
    </div>
  );
}
