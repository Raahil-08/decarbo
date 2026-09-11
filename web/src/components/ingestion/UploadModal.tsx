import React, { useState, useRef } from "react";
import { Upload as UploadIcon, X, FileSpreadsheet, FileText, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { apiClient } from "../../lib/api";

interface UploadModalProps {
  factoryId: string;
  isOpen: boolean;
  onClose: () => void;
  onUploadReadyForReview: (uploadData: any) => void;
}

export function UploadModal({ factoryId, isOpen, onClose, onUploadReadyForReview }: UploadModalProps) {
  const [selectedKind, setSelectedKind] = useState<string>("template_xlsx");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [statusText, setStatusText] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelected = (selectedFile: File) => {
    setFile(selectedFile);
    setErrorMsg(null);
    const fn = selectedFile.name.toLowerCase();
    if (fn.endsWith(".pdf") || fn.endsWith(".jpg") || fn.endsWith(".png")) {
      setSelectedKind(fn.endsWith(".pdf") ? "bill_pdf" : "bill_image");
    } else if (fn.includes("template")) {
      setSelectedKind("template_xlsx");
    } else {
      setSelectedKind("generic_table");
    }
  };

  const handleSubmit = async () => {
    if (!file) return;

    setLoading(true);
    setErrorMsg(null);
    setStatusText("Uploading file...");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("kind", selectedKind);

      // 1. Register & upload
      const upload = await apiClient<any>(`/factories/${factoryId}/uploads`, {
        method: "POST",
        body: formData,
      });

      // 2. Trigger parse
      setStatusText("Parsing and extracting activities...");
      const parsed = await apiClient<any>(`/uploads/${upload.id}/parse`, {
        method: "POST",
      });

      if (parsed.status === "failed") {
        setErrorMsg(parsed.error || "Parsing failed. Please check file format.");
      } else {
        onUploadReadyForReview(parsed);
        onClose();
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.error?.message_key || "Failed to process upload.");
    } finally {
      setLoading(false);
      setStatusText("");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-lg border border-rule shadow-xl max-w-lg w-full overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-rule flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <UploadIcon className="w-5 h-5 text-ink" />
            <h2 className="text-lg font-bold text-ink tracking-tight">Upload Activity Data</h2>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-muted hover:text-ink p-1 rounded-md transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Format Selector */}
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">
              Select Document Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setSelectedKind("template_xlsx")}
                className={`p-3 text-left rounded-md border text-xs transition-all ${
                  selectedKind === "template_xlsx"
                    ? "border-ink bg-paper font-semibold text-ink shadow-sm"
                    : "border-rule text-muted hover:border-rule/80"
                }`}
              >
                <FileSpreadsheet className="w-4 h-4 mb-1 text-leaf" />
                <div>Standard Template</div>
                <span className="text-[10px] text-muted font-normal">Excel or CSV</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedKind("generic_table")}
                className={`p-3 text-left rounded-md border text-xs transition-all ${
                  selectedKind === "generic_table"
                    ? "border-ink bg-paper font-semibold text-ink shadow-sm"
                    : "border-rule text-muted hover:border-rule/80"
                }`}
              >
                <FileSpreadsheet className="w-4 h-4 mb-1 text-brass" />
                <div>Tally / Register</div>
                <span className="text-[10px] text-muted font-normal">Purchase register</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedKind("bill_pdf")}
                className={`p-3 text-left rounded-md border text-xs transition-all ${
                  selectedKind === "bill_pdf" || selectedKind === "bill_image"
                    ? "border-ink bg-paper font-semibold text-ink shadow-sm"
                    : "border-rule text-muted hover:border-rule/80"
                }`}
              >
                <FileText className="w-4 h-4 mb-1 text-ember" />
                <div>Electricity Bill</div>
                <span className="text-[10px] text-muted font-normal">PDF or Photo</span>
              </button>
            </div>
          </div>

          {/* Dropzone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragging ? "border-leaf bg-leaf/5" : "border-rule hover:border-ink/40 bg-paper"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFileSelected(e.target.files[0]);
                }
              }}
            />

            {file ? (
              <div className="flex flex-col items-center">
                <CheckCircle2 className="w-8 h-8 text-leaf mb-2" />
                <span className="text-sm font-semibold text-ink">{file.name}</span>
                <span className="text-xs text-muted mt-0.5">
                  {(file.size / 1024).toFixed(1)} KB • Click or drop to replace
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <UploadIcon className="w-8 h-8 text-muted mb-2" />
                <span className="text-sm font-medium text-ink">
                  Click to select file or drag and drop
                </span>
                <span className="text-xs text-muted mt-1">
                  Supported: Excel (.xlsx), CSV, Electricity Bill (.pdf, .jpg)
                </span>
              </div>
            )}
          </div>

          {/* Status & Error */}
          {loading && (
            <div className="flex items-center justify-center space-x-2 text-sm text-ink py-1">
              <Loader2 className="w-4 h-4 animate-spin text-ink" />
              <span>{statusText}</span>
            </div>
          )}

          {errorMsg && (
            <div className="flex items-start space-x-2 p-3 bg-ember/10 border border-ember/20 rounded-md text-xs text-ember">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-paper border-t border-rule flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-md text-xs font-medium text-muted hover:text-ink hover:bg-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!file || loading}
            className="px-4 py-2 rounded-md text-xs font-semibold text-white bg-ink hover:bg-ink-light disabled:opacity-50 transition-colors shadow-sm"
          >
            {loading ? "Processing..." : "Continue to Review"}
          </button>
        </div>
      </div>
    </div>
  );
}
