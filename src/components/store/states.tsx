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
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full border border-gold/60 text-muted-foreground [&_svg]:stroke-[1.25]">
        {icon ?? <PackageOpen className="h-7 w-7" />}
      </div>
      <h3 className="font-display text-2xl">{title}</h3>
      <div className="ornament" aria-hidden="true">
        <i />
      </div>
      {hint && <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">{hint}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ onRetry, message }: { onRetry?: () => void; message?: string }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-destructive/40 text-destructive">
        <AlertTriangle className="h-6 w-6" strokeWidth={1.25} />
      </div>
      <h3 className="font-display text-2xl">{t("error_title")}</h3>
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
      <Skeleton className="aspect-[4/5] w-full rounded-none" />
      <Skeleton className="mt-3 h-3 w-3/4 rounded-none" />
      <Skeleton className="mt-2 h-3 w-1/3 rounded-none" />
    </div>
  );
}

export function ProductGridSkeleton({ n = 8 }: { n?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 md:gap-x-6 md:gap-y-14 lg:grid-cols-4">
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
        <Skeleton key={i} className="h-16 w-full rounded-none" />
      ))}
    </div>
  );
}
