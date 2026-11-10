import React from "react";

interface SkeletonCardProps {
  rows?: number;
  className?: string;
}

export const SkeletonCard: React.FC<SkeletonCardProps> = ({ rows = 3, className = "" }) => {
  return (
    <div className={`card animate-pulse space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="h-5 w-1/3 rounded-lg bg-orange-100/70 dark:bg-gray-800"></div>
        <div className="h-4 w-12 rounded bg-orange-50 dark:bg-gray-800"></div>
      </div>
      <div className="space-y-2.5">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="h-3.5 rounded bg-gray-100 dark:bg-gray-800"
            style={{ width: `${Math.max(45, 100 - i * 18)}%` }}
          ></div>
        ))}
      </div>
    </div>
  );
};

export default SkeletonCard;
