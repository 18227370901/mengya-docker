import React from "react";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionText?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  actionText,
  onAction,
  className = "",
}) => {
  return (
    <div className={`flex flex-col items-center justify-center p-8 text-center ${className}`}>
      {Icon && (
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-500 shadow-sm dark:bg-brand-950/50 dark:text-brand-400">
          <Icon className="h-7 w-7" />
        </div>
      )}
      <h3 className="text-base font-medium text-gray-800 dark:text-gray-200">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-gray-500 dark:text-gray-400">{description}</p>
      )}
      {actionText && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="btn-primary mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-sm shadow-sm"
        >
          {actionText}
        </button>
      )}
    </div>
  );
};

export default EmptyState;
