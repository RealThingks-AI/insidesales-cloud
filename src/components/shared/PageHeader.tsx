import React from "react";
import { cn } from "@/lib/utils";
import { Breadcrumbs } from "./Breadcrumbs";

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
  showBreadcrumbs?: boolean;
  badge?: React.ReactNode;
}

export const PageHeader = ({ 
  title, 
  description, 
  children, 
  className,
  showBreadcrumbs = false,
  badge
}: PageHeaderProps) => {
  return (
    <div className={cn("flex-shrink-0 bg-background border-b", className)}>
      {showBreadcrumbs && (
        <div className="px-6 pt-3 pb-1">
          <Breadcrumbs />
        </div>
      )}
      <div className="px-6 h-16 flex items-center w-full">
        <div className="flex items-center justify-between w-full gap-4">
          <div className="min-w-0 flex-1 flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl text-foreground font-semibold truncate">
              {title}
            </h1>
            {badge}
          </div>
          {children && (
            <div className="flex items-center gap-2 flex-shrink-0">
              {children}
            </div>
          )}
        </div>
      </div>
      {description && (
        <div className="px-6 pb-3">
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      )}
    </div>
  );
};

export default PageHeader;
