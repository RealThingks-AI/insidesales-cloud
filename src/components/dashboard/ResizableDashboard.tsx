import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { X, GripVertical } from "lucide-react";
import {
  GridLayout,
  type Layout,
  type LayoutItem,
  verticalCompactor,
} from "react-grid-layout";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

import {
  WidgetKey,
  DEFAULT_WIDGETS,
  WidgetLayoutConfig,
  WidgetLayout,
} from "./DashboardCustomizeModal";

interface ResizableDashboardProps {
  isResizeMode: boolean;
  visibleWidgets: WidgetKey[];
  widgetLayouts: WidgetLayoutConfig;
  pendingWidgetChanges?: Set<WidgetKey>;
  onLayoutChange: (layouts: WidgetLayoutConfig) => void;
  onWidgetRemove: (key: WidgetKey) => void;
  renderWidget: (key: WidgetKey) => React.ReactNode;
  containerWidth: number;
}

const COLS = 12;
const ROW_HEIGHT = 80;

export const ResizableDashboard = ({
  isResizeMode,
  visibleWidgets,
  widgetLayouts,
  pendingWidgetChanges,
  onLayoutChange,
  onWidgetRemove,
  renderWidget,
  containerWidth,
}: ResizableDashboardProps) => {
  const layout: Layout = useMemo(() => {
    const defaults = new Map<WidgetKey, WidgetLayout>();
    DEFAULT_WIDGETS.forEach((w) => defaults.set(w.key, w.defaultLayout));

    const baseLayout: LayoutItem[] = visibleWidgets.map((key, index): LayoutItem => {
      const saved = widgetLayouts[key];
      const d = defaults.get(key) ?? { x: 0, y: 0, w: 3, h: 2 };

      const w = Math.max(2, Math.min(COLS, saved?.w ?? d.w ?? 3));
      const h = Math.max(2, saved?.h ?? d.h ?? 2);

      // Default packing: 4 widgets per row when w≈3 and COLS=12
      const fallbackX = (index % 4) * 3;
      const fallbackY = Math.floor(index / 4) * 2;

      // Normalize x to never overflow the grid (prevents overlap/stacking)
      const rawX = saved?.x ?? fallbackX;
      const x = Math.max(0, Math.min(COLS - w, rawX));

      return {
        i: key,
        x,
        y: saved?.y ?? fallbackY,
        w,
        h,
        minW: 2,
        minH: 2,
      };
    });

    // Compact to avoid gaps/overlaps from previously saved large y-values
    return verticalCompactor.compact(baseLayout as unknown as Layout, COLS);
  }, [visibleWidgets, widgetLayouts]);

  const handleLayoutChange = useCallback(
    (newLayout: Layout) => {
      const next: WidgetLayoutConfig = { ...widgetLayouts };

      newLayout.forEach((l) => {
        const key = l.i as WidgetKey;
        if (visibleWidgets.includes(key)) {
          next[key] = { x: l.x, y: l.y, w: l.w, h: l.h };
        }
      });

      onLayoutChange(next);
    },
    [visibleWidgets, widgetLayouts, onLayoutChange]
  );

  return (
    <div className="dashboard-grid">
      <GridLayout
        className="layout"
        layout={layout}
        width={Math.max(320, containerWidth)}
        gridConfig={{
          cols: COLS,
          rowHeight: ROW_HEIGHT,
          margin: [16, 16] as const,
          containerPadding: [0, 0] as const,
          maxRows: Infinity,
        }}
        dragConfig={{
          enabled: isResizeMode,
          handle: ".dash-drag-handle",
          threshold: 3,
          bounded: false,
        }}
        resizeConfig={{
          enabled: isResizeMode,
          handles: ["se", "s", "e"],
        }}
        compactor={verticalCompactor}
        onLayoutChange={handleLayoutChange}
        autoSize
      >
        {visibleWidgets.map((key) => {
          const isPendingRemoval = !!pendingWidgetChanges?.has(key);
          const itemClassName = [
            "dash-item",
            isResizeMode ? "dash-item--edit" : "",
            isResizeMode && isPendingRemoval ? "dash-item--pending-remove" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <div key={key} className={itemClassName}>
              {isResizeMode && isPendingRemoval && (
                <div className="dash-pending-badge" aria-hidden="true">
                  Pending removal
                </div>
              )}

              {isResizeMode && (
                <Button
                  variant="destructive"
                  size="icon"
                  className="dash-remove pointer-events-auto absolute -top-2 -right-2 z-30 h-6 w-6 rounded-full shadow-lg border-2 border-background"
                  onClick={(e) => {
                    e.stopPropagation();
                    onWidgetRemove(key);
                  }}
                  aria-label={`Remove ${key} widget`}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}

              {isResizeMode && (
                <div
                  className="dash-drag-handle"
                  role="button"
                  aria-label="Drag widget"
                  tabIndex={0}
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                </div>
              )}

              <div
                className={
                  isResizeMode ? "dash-content dash-content--locked" : "dash-content"
                }
              >
                {renderWidget(key)}
              </div>
            </div>
          );
        })}
      </GridLayout>

      <style>{`
        .dashboard-grid .react-grid-layout {
          min-height: 200px;
        }

        .dash-item {
          height: 100%;
          position: relative;
          overflow: visible;
          border-radius: 0.75rem;
          background: hsl(var(--card));
          border: 1px solid hsl(var(--border));
          box-shadow: 0 1px 3px hsl(var(--foreground) / 0.05);
        }

        .dash-content {
          height: 100%;
          width: 100%;
          overflow: auto;
          border-radius: 0.75rem;
        }

        /* Ensure each widget fills its own grid cell (prevents "everything looks merged") */
        .dash-content > * {
          width: 100%;
          max-width: 100%;
          height: 100%;
        }

        .dash-content--locked {
          pointer-events: none;
          user-select: none;
        }

        .dash-item--pending-remove {
          opacity: 0.55;
          filter: grayscale(0.15);
        }
        .dash-item--pending-remove::before {
          content: "";
          position: absolute;
          inset: 0;
          background: hsl(var(--destructive) / 0.06);
          pointer-events: none;
        }

        .dash-pending-badge {
          position: absolute;
          bottom: 8px;
          left: 8px;
          z-index: 25;
          pointer-events: none;

          font-size: 12px;
          line-height: 1;
          padding: 4px 8px;
          border-radius: 9999px;
          border: 1px solid hsl(var(--destructive) / 0.3);
          background: hsl(var(--background) / 0.85);
          color: hsl(var(--destructive));
          backdrop-filter: blur(8px);
        }

        .dash-item--edit {
          box-shadow: 0 0 0 2px hsl(var(--primary) / 0.35), 0 6px 18px hsl(var(--foreground) / 0.10);
          border: 2px solid hsl(var(--primary) / 0.45);
        }


        .dash-drag-handle {
          position: absolute;
          top: 8px;
          left: 8px;
          z-index: 20;
          cursor: grab;
          border-radius: 6px;
          padding: 4px;
          border: 1px solid hsl(var(--border));
          background: hsl(var(--background) / 0.95);
          backdrop-filter: blur(8px);
          box-shadow: 0 2px 8px hsl(var(--foreground) / 0.08);
        }
        .dash-drag-handle:active {
          cursor: grabbing;
        }

        /* Resize handles */
        .dashboard-grid .react-resizable-handle {
          background-image: none;
          opacity: 0;
          transition: opacity 0.15s ease;
        }
        .dash-item--edit .react-resizable-handle {
          opacity: 1;
        }
        .dashboard-grid .react-resizable-handle::after {
          content: "";
          position: absolute;
          width: 10px;
          height: 10px;
          border-right: 2px solid hsl(var(--primary));
          border-bottom: 2px solid hsl(var(--primary));
          right: 4px;
          bottom: 4px;
          border-radius: 2px;
        }

        .dashboard-grid .react-grid-item.react-grid-placeholder {
          background: hsl(var(--primary) / 0.15);
          border: 2px dashed hsl(var(--primary) / 0.4);
          border-radius: 0.5rem;
        }

        .dashboard-grid .react-grid-item > .react-resizable-handle {
          z-index: 15;
        }
      `}</style>
    </div>
  );
};
