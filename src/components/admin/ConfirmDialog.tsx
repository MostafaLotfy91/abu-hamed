import { useCallback, useRef, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useBi } from "@/lib/bilingual";

type Opts = { title: string; description?: string; confirmLabel?: string; destructive?: boolean };

/**
 * In-app confirmation for destructive admin actions (replaces window.confirm).
 * const [confirm, dialog] = useConfirm(); ... if (!(await confirm({ title: "..." }))) return; ... render {dialog}
 */
export function useConfirm(): [(o: Opts) => Promise<boolean>, ReactNode] {
  const bi = useBi();
  const [opts, setOpts] = useState<Opts | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const confirm = useCallback(
    (o: Opts) =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setOpts(o);
      }),
    [],
  );
  const close = (v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setOpts(null);
  };
  const dialog = (
    <AlertDialog
      open={!!opts}
      onOpenChange={(o) => {
        if (!o) close(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{bi(opts?.title ?? "")}</AlertDialogTitle>
          {opts?.description && (
            <AlertDialogDescription>{bi(opts.description)}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => close(false)}>{bi("إلغاء / Cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => close(true)}
            className={
              opts?.destructive
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : undefined
            }
          >
            {bi(opts?.confirmLabel ?? "تأكيد / Confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  return [confirm, dialog];
}
