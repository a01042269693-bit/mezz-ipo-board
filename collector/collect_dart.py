#!/usr/bin/env python3
"""
DART OpenAPI 공시 수집기
- 주요사항보고서: 전환사채(CB)·신주인수권부사채(BW)·교환사채(EB) 발행결정, 유상·무상증자 결정
- 발행공시: 증권신고서(지분증권) → 비상장사는 IPO, 상장사는 유상증자 일정으로 분류
결과: data/dart-data.json, data/dart-data.js (사이트가 읽는 파일)

환경변수
  DART_API_KEY        (필수) OpenDART 인증키 40자리
  LOOKBACK_DAYS       최근 며칠치 공시를 확인할지 (기본 10)
  KEEP_DAYS           며칠 지난 공시까지 파일에 남길지 (기본 400)
  TELEGRAM_BOT_TOKEN  (선택) 신규 공시 텔레그램 알림
  TELEGRAM_CHAT_ID    (선택)
"""
import datetime as dt
import json
import os
import re
import ssl
import sys
import time
from collections import defaultdict
from pathlib import Path

import requests
from requests.adapters import HTTPAdapter

API = "https://opendart.fss.or.kr/api"
KEY = os.environ.get("DART_API_KEY", "").strip()
ROOT = Path(__file__).resolve().parent.parent
OUT_JSON = ROOT / "data" / "dart-data.json"
OUT_JS = ROOT / "data" / "dart-data.js"
LOOKBACK_DAYS = int(os.environ.get("LOOKBACK_DAYS", "10"))
KEEP_DAYS = int(os.environ.get("KEEP_DAYS", "400"))
KST = dt.timezone(dt.timedelta(hours=9))
TODAY = dt.datetime.now(KST).date()
MARKET = {"Y": "코스피", "K": "코스닥", "N": "코넥스", "E": "비상장"}


# ───────── HTTP ─────────
class DartAdapter(HTTPAdapter):
    """OpenDART 서버는 구형 TLS 설정이라 최신 OpenSSL에서 접속이 거부될 수 있어 보안레벨을 낮춰 접속"""

    def init_poolmanager(self, *args, **kwargs):
        ctx = ssl.create_default_context()
        try:
            ctx.set_ciphers("DEFAULT:@SECLEVEL=1")
        except ssl.SSLError:
            pass
        ctx.options |= getattr(ssl, "OP_LEGACY_SERVER_CONNECT", 0x4)
        kwargs["ssl_context"] = ctx
        return super().init_poolmanager(*args, **kwargs)


SESSION = requests.Session()
SESSION.mount("https://opendart.fss.or.kr", DartAdapter())
SESSION.headers["User-Agent"] = "mezz-ipo-board/1.0"
CALLS = 0


def call(endpoint, **params):
    global CALLS
    params["crtfc_key"] = KEY
    for attempt in range(3):
        try:
            CALLS += 1
            r = SESSION.get(f"{API}/{endpoint}", params=params, timeout=30)
            r.raise_for_status()
            j = r.json()
        except Exception as e:  # 네트워크 오류는 3회까지 재시도
            if attempt == 2:
                print(f"  ! {endpoint} 요청 실패: {e}")
                return None
            time.sleep(2 * (attempt + 1))
            continue
        status = j.get("status")
        time.sleep(0.12)
        if status == "000":
            return j
        if status == "013":  # 조회된 데이터 없음
            return None
        if status in ("010", "011", "012", "901"):
            print(f"  ! 인증키 문제({status}): {j.get('message')}  → OpenDART 인증키와 GitHub Secret 값을 확인하세요.")
            sys.exit(1)
        if status == "020":
            print("  ! 일일 요청 한도 초과(020). 내일 다시 실행됩니다.")
            sys.exit(1)
        print(f"  ! {endpoint} status={status} {j.get('message')}")
        return None
    return None


# ───────── 값 정리 ─────────
DATE_RE = re.compile(r"(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})")


def dates(s):
    return [f"{y}-{int(m):02d}-{int(d):02d}" for y, m, d in DATE_RE.findall(str(s or ""))]


def first_date(s):
    x = dates(s)
    return x[0] if x else ""


def to_num(s):
    t = re.sub(r"[^\d.\-]", "", str(s or ""))
    if t in ("", "-", ".", "-."):
        return None
    try:
        return float(t)
    except ValueError:
        return None


def num_str(s):
    n = to_num(s)
    if n is None:
        return ""
    return str(int(n)) if float(n).is_integer() else f"{n:g}"


def eok(s):
    n = to_num(s)
    if not n:
        return ""
    v = n / 1e8
    return str(int(round(v))) if v >= 10 else f"{v:.1f}"


def clean(s):
    s = str(s or "").strip()
    return "" if s in ("-", "해당사항없음", "해당사항 없음") else s


def rcept_date(rcept_no):
    r = str(rcept_no or "")
    return f"{r[0:4]}-{r[4:6]}-{r[6:8]}" if len(r) >= 8 else ""


def dart_url(rcept_no):
    return f"https://dart.fss.or.kr/dsaf001/main.do?rcpNo={rcept_no}"


def ymd(d):
    return d.strftime("%Y%m%d")


# ───────── 공시 목록 ─────────
def disclosures(ty, bgn, end):
    out, page = [], 1
    while True:
        j = call("list.json", bgn_de=bgn, end_de=end, pblntf_ty=ty, page_no=page, page_count=100)
        if not j:
            break
        out += j.get("list", [])
        if page >= int(j.get("total_page", 1) or 1):
            break
        page += 1
    return out


def classify(report_nm):
    nm = str(report_nm).replace(" ", "")
    if "철회" in nm:
        return []
    kinds = []
    if "전환사채권발행결정" in nm:
        kinds.append("CB")
    if "신주인수권부사채권발행결정" in nm:
        kinds.append("BW")
    if "교환사채권발행결정" in nm:
        kinds.append("EB")
    if "유무상증자결정" in nm:
        kinds += ["PAID", "FREE"]
    elif "유상증자결정" in nm:
        kinds.append("PAID")
    elif "무상증자결정" in nm:
        kinds.append("FREE")
    if "증권신고서(지분증권)" in nm:
        kinds.append("EQ")
    return kinds


# ───────── 상세 조회 & 변환 ─────────
BOND_API = {"CB": "cvbdIsDecsn.json", "BW": "bdwtIsDecsn.json", "EB": "exbdIsDecsn.json"}


def fetch_bonds(kind, corp_code, bgn, end, report_names):
    j = call(BOND_API[kind], corp_code=corp_code, bgn_de=bgn, end_de=end)
    if not j:
        return []
    latest = {}
    for it in j.get("list", []):
        key = clean(it.get("bd_tm")) or it.get("rcept_no")
        if key not in latest or it.get("rcept_no", "") > latest[key].get("rcept_no", ""):
            latest[key] = it
    recs = []
    for key, it in latest.items():
        rno = it.get("rcept_no", "")
        if kind == "CB":
            price, start, end_d = it.get("cv_prc"), it.get("cvrqpd_bgd"), it.get("cvrqpd_edd")
        elif kind == "BW":
            price, start, end_d = it.get("ex_prc"), it.get("expd_bgd"), it.get("expd_edd")
        else:
            price, start, end_d = it.get("ex_prc"), it.get("exrqpd_bgd"), it.get("exrqpd_edd")
        floor = to_num(it.get("act_mktprcfl_cvprc_lwtrsprc"))
        recs.append({
            "id": f"dart-{kind}-{corp_code}-{key}",
            "issuer": clean(it.get("corp_name")),
            "market": MARKET.get(it.get("corp_cls"), ""),
            "kind": kind,
            "series": clean(it.get("bd_tm")),
            "method": "공모" if "공모" in str(it.get("bdis_mthn")) else ("사모" if "사모" in str(it.get("bdis_mthn")) else clean(it.get("bdis_mthn"))),
            "size": eok(it.get("bd_fta")),
            "coupon": num_str(it.get("bd_intr_ex")),
            "ytm": num_str(it.get("bd_intr_sf")),
            "convPrice": num_str(price),
            "refix": "있음" if floor else "미확인",
            "refixFloor": f"최저 {int(floor):,}원" if floor else "",
            "boardDate": first_date(it.get("bddd")),
            "issueDate": first_date(it.get("pymd")),
            "convStart": first_date(start),
            "convEnd": first_date(end_d),
            "maturity": first_date(it.get("bd_mtd")),
            "exchangeTarget": clean(it.get("extg")) if kind == "EB" else "",
            "rceptNo": rno,
            "rceptDt": rcept_date(rno),
            "report": report_names.get(rno, ""),
            "dartUrl": dart_url(rno),
            "src": "DART",
        })
    return recs


def fetch_free(corp_code, bgn, end, report_names):
    j = call("fricDecsn.json", corp_code=corp_code, bgn_de=bgn, end_de=end)
    recs = []
    for it in (j or {}).get("list", []):
        rno = it.get("rcept_no", "")
        rd = first_date(it.get("nstk_asstd"))
        recs.append({
            "id": f"dart-FREE-{corp_code}-{rd or rno}",
            "name": clean(it.get("corp_name")),
            "market": MARKET.get(it.get("corp_cls"), ""),
            "kind": "무상증자",
            "method": "",
            "ratio": num_str(it.get("nstk_ascnt_ps_ostk")),
            "newShares": num_str(it.get("nstk_ostk_cnt")),
            "recordDate": rd,
            "listingDate": first_date(it.get("nstk_lstprd")),
            "boardDate": first_date(it.get("bddd")),
            "rceptNo": rno, "rceptDt": rcept_date(rno), "report": report_names.get(rno, ""),
            "dartUrl": dart_url(rno), "src": "DART",
        })
    # 정정공시가 여러 건이면 기준일별 최신만
    best = {}
    for r in recs:
        if r["id"] not in best or r["rceptNo"] > best[r["id"]]["rceptNo"]:
            best[r["id"]] = r
    return list(best.values())


def fetch_paid(corp_code, bgn, end, report_names):
    j = call("piicDecsn.json", corp_code=corp_code, bgn_de=bgn, end_de=end)
    items = sorted((j or {}).get("list", []), key=lambda x: x.get("rcept_no", ""))
    recs = []
    for it in items:
        rno = it.get("rcept_no", "")
        recs.append({
            "id": f"dart-PAID-{corp_code}-{rno[:8]}",
            "name": clean(it.get("corp_name")),
            "market": MARKET.get(it.get("corp_cls"), ""),
            "kind": "유상증자",
            "method": clean(it.get("ic_mthn")),
            "newShares": num_str(it.get("nstk_ostk_cnt")),
            "rceptNo": rno, "rceptDt": rcept_date(rno), "report": report_names.get(rno, ""),
            "dartUrl": dart_url(rno), "src": "DART",
        })
    return recs


def fetch_equity(corp_code, bgn, end, report_names):
    """증권신고서(지분증권) 요약. 그룹(일반사항/증권의종류/인수인정보) 별로 옴"""
    j = call("estkRs.json", corp_code=corp_code, bgn_de=bgn, end_de=end)
    if not j:
        return []
    groups = {g.get("title", ""): g.get("list", []) for g in j.get("group", [])}
    general = sorted(groups.get("일반사항", []), key=lambda x: x.get("rcept_no", ""))
    if not general:
        return []
    # 60일 이상 떨어진 신고서는 별개 건으로 묶음
    clusters, cur = [], []
    for g in general:
        if cur and (dt.date.fromisoformat(rcept_date(g["rcept_no"])) - dt.date.fromisoformat(rcept_date(cur[-1]["rcept_no"]))).days > 60:
            clusters.append(cur)
            cur = []
        cur.append(g)
    if cur:
        clusters.append(cur)

    out = []
    for cl in clusters:
        last = cl[-1]
        rno = last["rcept_no"]
        sec = [s for s in groups.get("증권의종류", []) if s.get("rcept_no") == rno] or groups.get("증권의종류", [])[-1:]
        und = [u for u in groups.get("인수인정보", []) if u.get("rcept_no") == rno]
        s0 = sec[0] if sec else {}
        lead = [clean(u.get("actnmn")) for u in und if "대표" in str(u.get("actsen"))] or [clean(u.get("actnmn")) for u in und]
        sub = dates(last.get("sbd"))
        out.append({
            "first_rcept": cl[0]["rcept_no"],
            "corp_cls": last.get("corp_cls"),
            "name": clean(last.get("corp_name")),
            "subStart": sub[0] if sub else "",
            "subEnd": sub[-1] if sub else "",
            "payDate": first_date(last.get("pymd")),
            "recordDate": first_date(last.get("asstd")),
            "price": num_str(s0.get("slprc")),
            "amount": eok(s0.get("slta")),
            "shares": num_str(s0.get("stkcnt")),
            "slmth": clean(s0.get("slmthn")),
            "underwriter": ", ".join(dict.fromkeys([x for x in lead if x])),
            "rceptNo": rno,
            "report": report_names.get(rno, ""),
        })
    return out


# ───────── 메인 ─────────
def main():
    if len(KEY) != 40:
        print("DART_API_KEY 환경변수가 없거나 40자리가 아닙니다. GitHub Secret 설정을 확인하세요.")
        sys.exit(1)

    prev = {"ipos": [], "mezz": [], "rights": []}
    if OUT_JSON.exists():
        try:
            prev = json.loads(OUT_JSON.read_text(encoding="utf-8"))
        except Exception:
            pass
    prev_ids = {x["id"] for k in ("ipos", "mezz", "rights") for x in prev.get(k, [])}

    bgn = ymd(TODAY - dt.timedelta(days=LOOKBACK_DAYS))
    end = ymd(TODAY)
    detail_bgn = ymd(TODAY - dt.timedelta(days=LOOKBACK_DAYS + 180))  # 상세 API는 '최초접수일' 기준 → 정정공시 대비 넉넉히
    print(f"[1/3] 공시 목록 조회 {bgn}~{end}")

    listing = disclosures("B", bgn, end) + disclosures("C", bgn, end)
    report_names = {x["rcept_no"]: x.get("report_nm", "") for x in listing}
    targets = defaultdict(set)  # kind -> corp_codes
    corp_cls = {}
    for x in listing:
        for k in classify(x.get("report_nm", "")):
            targets[k].add(x["corp_code"])
            corp_cls[x["corp_code"]] = x.get("corp_cls")
    print("      대상:", {k: len(v) for k, v in targets.items()})

    print("[2/3] 상세 조회")
    mezz, ipos, rights = [], [], []
    for kind in ("CB", "BW", "EB"):
        for cc in sorted(targets.get(kind, [])):
            mezz += fetch_bonds(kind, cc, detail_bgn, end, report_names)

    for cc in sorted(targets.get("FREE", [])):
        rights += fetch_free(cc, detail_bgn, end, report_names)

    paid_by_corp = defaultdict(list)
    for cc in sorted(targets.get("PAID", [])):
        for r in fetch_paid(cc, detail_bgn, end, report_names):
            paid_by_corp[cc].append(r)

    for cc in sorted(targets.get("EQ", [])):
        for eq in fetch_equity(cc, detail_bgn, end, report_names):
            name = eq["name"]
            if eq["corp_cls"] in ("E", "N"):
                if re.search(r"스팩|기업인수목적|리츠|부동산투자회사", name):
                    continue
                confirmed = "발행조건확정" in eq["report"].replace(" ", "")
                ipos.append({
                    "id": f"dart-IPO-{cc}-{eq['first_rcept'][:8]}",
                    "name": name,
                    "market": "코스닥(이전)" if eq["corp_cls"] == "N" else "",
                    "subStart": eq["subStart"], "subEnd": eq["subEnd"], "refund": eq["payDate"],
                    "finalPrice": eq["price"] if confirmed else "",
                    "bandLow": "" if confirmed else eq["price"],
                    "amount": eq["amount"], "shares": eq["shares"],
                    "underwriter": eq["underwriter"],
                    "memo": "" if confirmed else "신고서상 모집가액(밴드 하단일 수 있음)",
                    "rceptNo": eq["rceptNo"], "rceptDt": rcept_date(eq["first_rcept"]),
                    "report": eq["report"], "dartUrl": dart_url(eq["rceptNo"]), "src": "DART",
                })
            else:
                # 상장사 유상증자: 같은 회사의 결정공시(60일 이내)에 일정을 붙임
                eq_d = dt.date.fromisoformat(rcept_date(eq["first_rcept"]))
                match = None
                for r in paid_by_corp.get(cc, []):
                    if abs((dt.date.fromisoformat(r["rceptDt"]) - eq_d).days) <= 60:
                        match = r
                if match is None:
                    match = {"id": f"dart-PAID-{cc}-{eq['first_rcept'][:8]}", "name": name, "market": MARKET.get(eq["corp_cls"], ""),
                             "kind": "유상증자", "method": eq["slmth"], "rceptNo": eq["rceptNo"], "rceptDt": rcept_date(eq["first_rcept"]),
                             "report": eq["report"], "dartUrl": dart_url(eq["rceptNo"]), "src": "DART"}
                    paid_by_corp[cc].append(match)
                match.update({
                    "recordDate": eq["recordDate"], "subStart": eq["subStart"], "subEnd": eq["subEnd"],
                    "payDate": eq["payDate"], "price": eq["price"], "size": eq["amount"],
                    "method": match.get("method") or eq["slmth"],
                    "offerRcept": eq["rceptNo"],
                })

    for lst in paid_by_corp.values():
        rights += lst

    # 이전 파일과 병합 (이번에 조회 안 된 과거 건 유지)
    def merge(old, new):
        m = {x["id"]: x for x in old}
        for x in new:
            m[x["id"]] = x
        cutoff = (TODAY - dt.timedelta(days=KEEP_DAYS)).isoformat()
        return sorted([x for x in m.values() if (x.get("rceptDt") or "9999") >= cutoff],
                      key=lambda x: x.get("rceptDt", ""), reverse=True)

    data = {
        "generatedAt": dt.datetime.now(KST).isoformat(timespec="seconds"),
        "lookbackDays": LOOKBACK_DAYS,
        "ipos": merge(prev.get("ipos", []), ipos),
        "mezz": merge(prev.get("mezz", []), mezz),
        "rights": merge(prev.get("rights", []), rights),
    }

    print("[3/3] 저장")
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(data, ensure_ascii=False, indent=1)
    OUT_JSON.write_text(text, encoding="utf-8")
    OUT_JS.write_text("window.DART_DATA = " + text + ";\n", encoding="utf-8")

    new_items = [x for k in ("ipos", "mezz", "rights") for x in data[k] if x["id"] not in prev_ids]
    print(f"      IPO {len(data['ipos'])}건, 메자닌 {len(data['mezz'])}건, 증자 {len(data['rights'])}건 (신규 {len(new_items)}건), API 호출 {CALLS}회")
    notify_telegram(new_items)


def notify_telegram(items):
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    chat = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
    if not token or not chat or not items:
        return
    lines = [f"[DART 신규 공시 {len(items)}건] {TODAY.isoformat()}"]
    for x in items[:40]:
        if "issuer" in x:
            lines.append(f"• {x['issuer']} {x['kind']}{(' ' + x['series'] + '회') if x.get('series') else ''} {x.get('size', '')}억, 표면 {x.get('coupon', '-')}%/만기 {x.get('ytm', '-')}%, 전환가 {x.get('convPrice', '-')}")
        elif x.get("kind") in ("유상증자", "무상증자"):
            lines.append(f"• {x['name']} {x['kind']} {x.get('method', '')} 기준일 {x.get('recordDate', '-')}")
        else:
            lines.append(f"• [IPO] {x['name']} 청약 {x.get('subStart', '-')}~{x.get('subEnd', '')} {x.get('amount', '')}억")
    if len(items) > 40:
        lines.append(f"외 {len(items) - 40}건")
    try:
        requests.post(f"https://api.telegram.org/bot{token}/sendMessage",
                      data={"chat_id": chat, "text": "\n".join(lines), "disable_web_page_preview": "true"}, timeout=20)
    except Exception as e:
        print("  ! 텔레그램 발송 실패:", e)


if __name__ == "__main__":
    main()
