"use client";

import { useCallback, useRef, useState } from "react";
import { Printer, Loader2, Download, RefreshCw, AlertTriangle } from "lucide-react";
import { useTranslation } from "../i18n/LanguageContext";
import {
  CONNECTOR_DOWNLOAD_URL,
  ConnectorError,
  getLastScannerId,
  listScanners,
  pagesToImageFiles,
  pagesToPdfFile,
  pickScanner,
  probeConnector,
  rememberScannerId,
  scanPages,
  type ConnectorScanner,
} from "../utils/connector";

type Phase = "idle" | "checking" | "scanning" | "not_running" | "blocked" | "no_scanner" | "choose" | "error";

interface Props {
  /** "images": one JPEG per page (Stundenzettel). "pdf": a single PDF (Containerliste). */
  output: "images" | "pdf";
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  /** "card": full-width button inside a card (matches sibling cards). "inline": small secondary button. */
  variant?: "card" | "inline";
}

export default function PrinterScanButton({ output, onFiles, disabled, variant = "card" }: Props) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>("idle");
  const [scanners, setScanners] = useState<ConnectorScanner[]>([]);
  const [detail, setDetail] = useState("");
  const cancelled = useRef(false);

  const runScan = useCallback(
    async (scanner: ConnectorScanner) => {
      setPhase("scanning");
      setDetail("");
      cancelled.current = false;
      try {
        rememberScannerId(scanner.id);
        const pages = await scanPages(scanner.id, setDetail, () => cancelled.current);
        if (!pages.length) throw new ConnectorError("scan_failed", t("printerScanNoPages"));
        const files = output === "pdf" ? [await pagesToPdfFile(pages)] : await pagesToImageFiles(pages);
        setPhase("idle");
        setDetail("");
        onFiles(files);
      } catch (e) {
        if (e instanceof ConnectorError && e.code === "cancelled") {
          setPhase("idle");
          return;
        }
        if (e instanceof ConnectorError && e.code === "not_running") setPhase("not_running");
        else if (e instanceof ConnectorError && e.code === "blocked") setPhase("blocked");
        else {
          setDetail(e instanceof Error ? e.message : "");
          setPhase("error");
        }
      }
    },
    [onFiles, output, t],
  );

  const start = useCallback(
    async (forceDiscover = false) => {
      setPhase("checking");
      setDetail("");
      const probe = await probeConnector();
      if (probe.state === "not_running") return setPhase("not_running");
      if (probe.state === "blocked") return setPhase("blocked");
      try {
        const list = await listScanners(forceDiscover);
        setScanners(list);
        if (!list.length) return setPhase("no_scanner");
        const chosen = pickScanner(list, getLastScannerId());
        if (!chosen) return setPhase("choose");
        await runScan(chosen);
      } catch (e) {
        if (e instanceof ConnectorError && e.code === "blocked") setPhase("blocked");
        else setPhase("not_running");
      }
    },
    [runScan],
  );

  const busy = phase === "checking" || phase === "scanning";
  const message =
    phase === "not_running" ? t("printerScanNotRunning")
    : phase === "blocked" ? t("printerScanBlocked")
    : phase === "no_scanner" ? t("printerScanNoScanner")
    : phase === "error" ? `${t("printerScanFailed")}${detail ? ` (${detail})` : ""}`
    : "";

  return (
    <div className={variant === "card" ? "w-full flex flex-col gap-2 text-start" : "flex flex-col gap-2 items-start"} data-testid="printer-scan">
      <button
        type="button"
        onClick={() => start(false)}
        disabled={disabled || busy}
        className={
          variant === "card"
            ? "btn-primary w-full justify-center gap-2 px-4 py-2.5 rounded-xl text-sm disabled:opacity-60"
            : "btn-secondary gap-2 px-3 py-2 rounded-lg text-sm disabled:opacity-60"
        }
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />}
        <span>{phase === "checking" ? t("printerScanChecking") : phase === "scanning" ? t("printerScanScanning") : t("printerScanButton")}</span>
      </button>

      {phase === "idle" && variant === "inline" && <p className="text-[11px] text-slate-600 font-medium">{t("printerScanHint")}</p>}
      {phase === "scanning" && detail && <p className="text-xs text-slate-600 font-medium" dir="auto">{detail}</p>}

      {phase === "scanning" && (
        <button type="button" onClick={() => { cancelled.current = true; }} className="btn-secondary px-3 py-1.5 rounded-xl text-xs font-bold self-start">
          {t("printerScanCancel")}
        </button>
      )}

      {message && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-900">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <div className="flex flex-col gap-2">
            <span dir="auto">{message}</span>
            {phase === "not_running" &&
              (CONNECTOR_DOWNLOAD_URL ? (
                <a href={CONNECTOR_DOWNLOAD_URL} className="inline-flex items-center gap-1 underline" target="_blank" rel="noreferrer">
                  <Download size={12} /> {t("printerScanDownload")}
                </a>
              ) : (
                <span>{t("printerScanInstallerSoon")}</span>
              ))}
            <button type="button" onClick={() => start(true)} className="inline-flex items-center gap-1 underline self-start">
              <RefreshCw size={12} /> {t("printerScanRetry")}
            </button>
          </div>
        </div>
      )}

      {phase === "choose" && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-bold text-slate-800">{t("printerScanChoose")}</p>
          {scanners.map((s) => (
            <button key={s.id} type="button" onClick={() => runScan(s)} className="btn-secondary px-3 py-2 rounded-xl text-sm font-bold text-start" dir="auto">
              {s.displayName || s.name}
              {s.ip ? ` (${s.ip})` : ""}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
