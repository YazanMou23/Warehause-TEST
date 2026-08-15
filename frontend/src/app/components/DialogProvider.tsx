"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import CustomAlertModal, { CustomAlertOptions } from "./CustomAlertModal";

export interface DialogAlertOptions {
  title?: string;
  message: string;
  type?: "success" | "error" | "warning" | "info";
  confirmText?: string;
}

export interface DialogConfirmOptions {
  title?: string;
  message: string;
  type?: "warning" | "error" | "info" | "success";
  confirmText?: string;
  cancelText?: string;
}

export interface DialogPromptOptions {
  title?: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
  inputType?: "text" | "password" | "number" | "email";
  confirmText?: string;
  cancelText?: string;
}

export interface DialogContextType {
  alert: (options: string | DialogAlertOptions) => Promise<void>;
  confirm: (options: string | DialogConfirmOptions) => Promise<boolean>;
  prompt: (options: string | DialogPromptOptions) => Promise<string | null>;
  close: () => void;
}

const DialogContext = createContext<DialogContextType | null>(null);

interface ActiveDialogState extends CustomAlertOptions {
  isOpen: boolean;
  resolve?: (value: any) => void;
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [dialogState, setDialogState] = useState<ActiveDialogState>({
    isOpen: false,
    message: "",
  });

  const resolverRef = useRef<((val: any) => void) | null>(null);

  const closeDialog = useCallback(() => {
    setDialogState((prev) => ({ ...prev, isOpen: false }));
    if (resolverRef.current) {
      resolverRef.current(null);
      resolverRef.current = null;
    }
  }, []);

  const showAlert = useCallback(
    (options: string | DialogAlertOptions): Promise<void> => {
      const opts: DialogAlertOptions =
        typeof options === "string" ? { message: options } : options;

      return new Promise<void>((resolve) => {
        resolverRef.current = () => resolve();
        setDialogState({
          isOpen: true,
          title: opts.title || (opts.type === "error" ? "Fehler" : opts.type === "success" ? "Erfolg" : opts.type === "warning" ? "Hinweis" : "Information"),
          message: opts.message,
          type: opts.type || "info",
          confirmText: opts.confirmText || "OK",
          cancelText: undefined,
          onConfirm: () => {
            resolve();
            resolverRef.current = null;
          },
          onCancel: () => {
            resolve();
            resolverRef.current = null;
          },
        });
      });
    },
    []
  );

  const showConfirm = useCallback(
    (options: string | DialogConfirmOptions): Promise<boolean> => {
      const opts: DialogConfirmOptions =
        typeof options === "string" ? { message: options } : options;

      return new Promise<boolean>((resolve) => {
        resolverRef.current = (result: boolean) => resolve(Boolean(result));
        setDialogState({
          isOpen: true,
          title: opts.title || "Bestätigung erforderlich",
          message: opts.message,
          type: opts.type || "warning",
          confirmText: opts.confirmText || "Bestätigen",
          cancelText: opts.cancelText || "Abbrechen",
          onConfirm: () => {
            resolve(true);
            resolverRef.current = null;
          },
          onCancel: () => {
            resolve(false);
            resolverRef.current = null;
          },
        });
      });
    },
    []
  );

  const showPrompt = useCallback(
    (options: string | DialogPromptOptions): Promise<string | null> => {
      const opts: DialogPromptOptions =
        typeof options === "string" ? { message: options } : options;

      return new Promise<string | null>((resolve) => {
        resolverRef.current = (result: string | null) => resolve(result);
        setDialogState({
          isOpen: true,
          title: opts.title || "Eingabe erforderlich",
          message: opts.message,
          type: "prompt",
          inputPlaceholder: opts.placeholder || "Bitte Text eingeben...",
          defaultValue: opts.defaultValue || "",
          inputType: opts.inputType || "text",
          confirmText: opts.confirmText || "Übernehmen",
          cancelText: opts.cancelText || "Abbrechen",
          onConfirm: (inputValue?: string) => {
            resolve(inputValue !== undefined ? inputValue : "");
            resolverRef.current = null;
          },
          onCancel: () => {
            resolve(null);
            resolverRef.current = null;
          },
        });
      });
    },
    []
  );

  // Safety layer: Intercept browser-native dialogs and route to custom dialogs
  useEffect(() => {
    if (typeof window === "undefined") return;

    const originalAlert = window.alert;
    const originalConfirm = window.confirm;
    const originalPrompt = window.prompt;

    window.alert = (msg?: any) => {
      showAlert({
        title: "Hinweis",
        message: String(msg ?? ""),
        type: "info",
      });
    };

    window.confirm = (msg?: any) => {
      showAlert({
        title: "Bestätigung",
        message: String(msg ?? ""),
        type: "warning",
      });
      // Synchronous return fallback for any legacy unawaited call
      return true;
    };

    window.prompt = (msg?: any, defaultVal?: string) => {
      showPrompt({
        title: "Eingabe",
        message: String(msg ?? ""),
        defaultValue: defaultVal || "",
      });
      return defaultVal || "";
    };

    return () => {
      window.alert = originalAlert;
      window.confirm = originalConfirm;
      window.prompt = originalPrompt;
    };
  }, [showAlert, showPrompt]);

  const value: DialogContextType = {
    alert: showAlert,
    confirm: showConfirm,
    prompt: showPrompt,
    close: closeDialog,
  };

  return (
    <DialogContext.Provider value={value}>
      {children}
      <CustomAlertModal
        isOpen={dialogState.isOpen}
        title={dialogState.title}
        message={dialogState.message}
        type={dialogState.type}
        confirmText={dialogState.confirmText}
        cancelText={dialogState.cancelText}
        inputPlaceholder={dialogState.inputPlaceholder}
        defaultValue={dialogState.defaultValue}
        inputType={dialogState.inputType}
        onConfirm={dialogState.onConfirm}
        onCancel={dialogState.onCancel}
        onClose={closeDialog}
      />
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogContextType {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error("useDialog must be used within a DialogProvider");
  }
  return context;
}

export function useAlert() {
  const dialog = useDialog();
  return dialog.alert;
}

export function useConfirm() {
  const dialog = useDialog();
  return dialog.confirm;
}

export function usePrompt() {
  const dialog = useDialog();
  return dialog.prompt;
}
