import type { ReactNode } from "react";
import { AlertTriangle, PackageOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/i18n";

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full border text-muted-foreground">
        {icon ?? <PackageOpen className="h-8 w-8" />}
      </div>
      <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
      {hint && <p className="max-w-xs text-sm text-muted-foreground">{hint}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ onRetry, message }: { onRetry?: () => void; message?: string }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <h3 className="font-bold">{t("error_title")}</h3>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          {t("retry")}
        </Button>
      )}
    </div>
  );
}

export function ProductCardSkeleton() {
  return (
    <div>
      <Skeleton className="aspect-[4/5] w-full rounded-md" />
      <Skeleton className="mt-2 h-4 w-3/4" />
      <Skeleton className="mt-2 h-4 w-1/3" />
    </div>
  );
}

export function ProductGridSkeleton({ n = 8 }: { n?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: n }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function RowSkeleton({ n = 3 }: { n?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: n }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-md" />
      ))}
    </div>
  );
}
