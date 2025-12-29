import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Users, FileText, Briefcase, TrendingUp, Clock, CheckCircle2, ArrowRight, Plus, Settings2, Calendar, Activity, Bell, AlertCircle, Info, 
  Target, PieChart, LineChart, DollarSign, Mail, MessageSquare, CheckCircle, AlertTriangle, 
  Globe, Building2, Star, Trophy, Gauge, ListTodo, PhoneCall, MapPin, Percent, ArrowUpRight, Filter, Move, Check, X, RotateCcw
} from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { WidgetKey, WidgetLayoutConfig, WidgetLayout, DEFAULT_WIDGETS } from "./DashboardCustomizeModal";
import { ResizableDashboard } from "./ResizableDashboard";
import { toast } from "sonner";
import { format, isAfter, isBefore, addDays } from "date-fns";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TaskModal } from "@/components/tasks/TaskModal";
import { MeetingModal } from "@/components/MeetingModal";
import { useTasks } from "@/hooks/useTasks";
import { Task } from "@/types/task";

const GRID_COLS = 12;

// Utility: Compact layouts to remove all gaps (both vertical and horizontal)
const compactLayoutsUtil = (layouts: WidgetLayoutConfig, visibleKeys: WidgetKey[]): WidgetLayoutConfig => {
  // Convert to array and filter only visible widgets, sort by y then x
  const items = visibleKeys
    .filter(key => layouts[key])
    .map(key => ({ key, ...layouts[key] }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  
  const compacted: WidgetLayoutConfig = {};
  const grid: boolean[][] = [];
  
  // Helper to check if position is free
  const canPlace = (x: number, y: number, w: number, h: number): boolean => {
    if (x < 0 || x + w > GRID_COLS) return false;
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        if (grid[y + dy]?.[x + dx]) return false;
      }
    }
    return true;
  };
  
  // Helper to mark grid cells as occupied
  const occupy = (x: number, y: number, w: number, h: number) => {
    for (let dy = 0; dy < h; dy++) {
      if (!grid[y + dy]) grid[y + dy] = new Array(GRID_COLS).fill(false);
      for (let dx = 0; dx < w; dx++) {
        grid[y + dy][x + dx] = true;
      }
    }
  };
  
  // Place each item in the first available position (top-left priority)
  items.forEach(item => {
    let placed = false;
    
    // Scan from top-left to find first available position
    for (let y = 0; y < 100 && !placed; y++) {
      for (let x = 0; x <= GRID_COLS - item.w && !placed; x++) {
        if (canPlace(x, y, item.w, item.h)) {
          occupy(x, y, item.w, item.h);
          compacted[item.key] = { x, y, w: item.w, h: item.h };
          placed = true;
        }
      }
    }
    
    // Fallback if somehow not placed
    if (!placed) {
      const fallbackY = Object.keys(compacted).length * 2;
      occupy(0, fallbackY, item.w, item.h);
      compacted[item.key] = { x: 0, y: fallbackY, w: item.w, h: item.h };
    }
  });
  
  return compacted;
};

const UserDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isResizeMode, setIsResizeMode] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200);
  
  // Pending widget changes for batch add/remove
  const [pendingWidgetChanges, setPendingWidgetChanges] = useState<Set<WidgetKey>>(new Set());
  
  // Store original state when entering customize mode (for cancel functionality)
  const [originalState, setOriginalState] = useState<{
    visible: WidgetKey[];
    order: WidgetKey[];
    layouts: WidgetLayoutConfig;
  } | null>(null);
  
  // Modal states for viewing records
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<any>(null);
  const [meetingModalOpen, setMeetingModalOpen] = useState(false);
  
  // Task operations
  const { createTask, updateTask, fetchTasks } = useTasks();

  // Measure container width for grid layout
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth - 48); // subtract padding
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);
  
  // Fetch display name directly from profiles table
  const { data: userName } = useQuery({
    queryKey: ['user-profile-name', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle();
      if (error) throw error;
      const name = data?.full_name;
      if (!name || name.includes('@')) {
        return user.email?.split('@')[0] || null;
      }
      return name;
    },
    enabled: !!user?.id,
  });

  // Fetch dashboard preferences
  const { data: dashboardPrefs } = useQuery({
    queryKey: ['dashboard-prefs', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('dashboard_preferences')
        .select('visible_widgets, card_order, layout_view')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Defaults (used before prefs load and when a user has no saved prefs yet)
  const defaultWidgetKeys = DEFAULT_WIDGETS.map((w) => w.key);
  const defaultVisibleWidgets = defaultWidgetKeys.filter(
    (k) => DEFAULT_WIDGETS.find((w) => w.key === k)?.visible
  );

  // Local state so add/remove/drag/resize feels instant (not waiting on refetch)
  const [visibleWidgets, setVisibleWidgets] = useState<WidgetKey[]>(defaultVisibleWidgets);
  const [widgetOrder, setWidgetOrder] = useState<WidgetKey[]>(defaultWidgetKeys);

  // Safely parse widget layouts - handle legacy string values gracefully
  const parseWidgetLayouts = (): WidgetLayoutConfig => {
    if (!dashboardPrefs?.layout_view) return {};
    if (typeof dashboardPrefs.layout_view === "object") {
      return dashboardPrefs.layout_view as WidgetLayoutConfig;
    }
    if (typeof dashboardPrefs.layout_view === "string") {
      try {
        const parsed = JSON.parse(dashboardPrefs.layout_view);
        if (typeof parsed === "object" && parsed !== null) {
          return parsed as WidgetLayoutConfig;
        }
      } catch {
        // Legacy string value like "grid" - ignore and use defaults
      }
    }
    return {};
  };

  const [widgetLayouts, setWidgetLayouts] = useState<WidgetLayoutConfig>(parseWidgetLayouts());

  // When the logged-in user or saved prefs change, sync local state (user-specific)
  useEffect(() => {
    setIsResizeMode(false);

    if (!user?.id) return;

    const sanitizeKeys = (keys: WidgetKey[]) => {
      const allowed = new Set(defaultWidgetKeys);
      const uniq: WidgetKey[] = [];
      const seen = new Set<string>();
      keys.forEach((k) => {
        if (!allowed.has(k)) return;
        if (seen.has(k)) return;
        seen.add(k);
        uniq.push(k);
      });
      return uniq;
    };

    const nextVisibleRaw: WidgetKey[] = dashboardPrefs?.visible_widgets
      ? (dashboardPrefs.visible_widgets as WidgetKey[])
      : defaultVisibleWidgets;

    const nextOrderRaw: WidgetKey[] = dashboardPrefs?.card_order
      ? (dashboardPrefs.card_order as WidgetKey[])
      : defaultWidgetKeys;

    const nextVisible = sanitizeKeys(nextVisibleRaw);

    // Order should be unique, valid, and contain all visible widgets
    const nextOrderBase = sanitizeKeys(nextOrderRaw);
    const missingVisible = nextVisible.filter((k) => !nextOrderBase.includes(k));
    const nextOrder = [...nextOrderBase, ...missingVisible];

    // Compact layouts on load to remove any gaps
    const loadedLayouts = parseWidgetLayouts();
    const compactedLayouts = compactLayoutsUtil(loadedLayouts, nextVisible);

    setVisibleWidgets(nextVisible);
    setWidgetOrder(nextOrder);
    setWidgetLayouts(compactedLayouts);
  }, [
    user?.id,
    dashboardPrefs?.visible_widgets,
    dashboardPrefs?.card_order,
    dashboardPrefs?.layout_view,
  ]);

  // Save dashboard preferences
  const savePreferencesMutation = useMutation({
    mutationFn: async ({ widgets, order, layouts }: { widgets: WidgetKey[], order: WidgetKey[], layouts: WidgetLayoutConfig }) => {
      if (!user?.id) {
        throw new Error("User not authenticated");
      }
      
      const { data, error } = await supabase
        .from('dashboard_preferences')
        .upsert({
          user_id: user.id,
          visible_widgets: widgets,
          card_order: order,
          layout_view: JSON.stringify(layouts),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
        .select();
      
      if (error) {
        console.error("Error saving preferences:", error);
        throw error;
      }
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-prefs', user?.id] });
      toast.success("Dashboard layout saved");
    },
    onError: (error) => {
      console.error("Mutation error:", error);
      toast.error("Failed to save layout");
    },
  });

  // Handle layout changes from ResizableDashboard - auto-compact after each change
  const handleLayoutChange = useCallback((newLayouts: WidgetLayoutConfig) => {
    // Apply compaction after every drag/resize to remove gaps
    const compacted = compactLayoutsUtil(newLayouts, visibleWidgets);
    setWidgetLayouts(compacted);
  }, [visibleWidgets]);

  // Handle widget removal - stage the change, and only persist on "Done"
  const handleWidgetRemove = useCallback(
    (key: WidgetKey) => {
      const isCurrentlyVisible = visibleWidgets.includes(key);

      setPendingWidgetChanges((prev) => {
        const next = new Set(prev);
        const wasPending = next.has(key);

        if (wasPending) {
          next.delete(key);
        } else {
          next.add(key);
        }

        const isNowPending = !wasPending;
        if (isCurrentlyVisible) {
          toast(isNowPending ? "Marked for removal (will apply on Save)" : "Removal undone");
        } else {
          toast(isNowPending ? "Marked to add (will apply on Save)" : "Add undone");
        }

        return next;
      });
    },
    [visibleWidgets]
  );

  // Toggle widget in pending changes (for batch add/remove)
  const togglePendingWidget = useCallback((key: WidgetKey) => {
    setPendingWidgetChanges(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  // Check if a widget will be visible (current state + pending changes)
  const willWidgetBeVisible = useCallback((key: WidgetKey) => {
    const isCurrentlyVisible = visibleWidgets.includes(key);
    const isPending = pendingWidgetChanges.has(key);
    // If pending, toggle the current state
    return isPending ? !isCurrentlyVisible : isCurrentlyVisible;
  }, [visibleWidgets, pendingWidgetChanges]);


  // Find next available grid position for a widget
  const findNextGridPosition = useCallback((existingLayouts: WidgetLayoutConfig, widgetWidth: number, widgetHeight: number) => {
    const COLS = 12;
    const grid: boolean[][] = [];
    
    // Build occupancy grid from existing layouts
    Object.values(existingLayouts).forEach(layout => {
      if (!layout) return;
      for (let row = layout.y; row < layout.y + layout.h; row++) {
        if (!grid[row]) grid[row] = new Array(COLS).fill(false);
        for (let col = layout.x; col < Math.min(layout.x + layout.w, COLS); col++) {
          grid[row][col] = true;
        }
      }
    });
    
    // Find first position where widget fits
    for (let y = 0; y < 100; y++) {
      if (!grid[y]) grid[y] = new Array(COLS).fill(false);
      for (let x = 0; x <= COLS - widgetWidth; x++) {
        let fits = true;
        for (let dy = 0; dy < widgetHeight && fits; dy++) {
          if (!grid[y + dy]) grid[y + dy] = new Array(COLS).fill(false);
          for (let dx = 0; dx < widgetWidth && fits; dx++) {
            if (grid[y + dy][x + dx]) fits = false;
          }
        }
        if (fits) return { x, y };
      }
    }
    return { x: 0, y: Object.keys(existingLayouts).length * 2 };
  }, []);

  // Apply pending widget changes
  const applyPendingChanges = useCallback(() => {
    if (pendingWidgetChanges.size === 0) return;

    let nextVisible = [...visibleWidgets];
    let nextOrder = [...widgetOrder];
    let nextLayouts = { ...widgetLayouts };

    pendingWidgetChanges.forEach(key => {
      const isCurrentlyVisible = visibleWidgets.includes(key);
      
      if (isCurrentlyVisible) {
        // Remove widget
        nextVisible = nextVisible.filter(w => w !== key);
        nextOrder = nextOrder.filter(w => w !== key);
        delete nextLayouts[key];
      } else {
        // Add widget - use consistent 3x2 size and find next available slot
        nextVisible.push(key);
        if (!nextOrder.includes(key)) {
          nextOrder.push(key);
        }
        
        const widgetW = 3;
        const widgetH = 2;
        const position = findNextGridPosition(nextLayouts, widgetW, widgetH);

        nextLayouts[key] = {
          x: position.x,
          y: position.y,
          w: widgetW,
          h: widgetH,
        };
      }
    });

    // Compact layouts to remove empty spaces
    const compactedLayouts = compactLayoutsUtil(nextLayouts, nextVisible);

    setVisibleWidgets(nextVisible);
    setWidgetOrder(nextOrder);
    setWidgetLayouts(compactedLayouts);
    setPendingWidgetChanges(new Set());
  }, [pendingWidgetChanges, visibleWidgets, widgetOrder, widgetLayouts, findNextGridPosition]);

  // Save layout and exit resize mode
  const handleSaveLayout = () => {
    // Get final state after applying changes
    let finalVisible = [...visibleWidgets];
    let finalOrder = [...widgetOrder];
    let finalLayouts = { ...widgetLayouts };
    
    // Apply pending changes to final state
    pendingWidgetChanges.forEach(key => {
      const isCurrentlyVisible = visibleWidgets.includes(key);
      
      if (isCurrentlyVisible) {
        finalVisible = finalVisible.filter(w => w !== key);
        finalOrder = finalOrder.filter(w => w !== key);
        delete finalLayouts[key];
      } else {
        finalVisible.push(key);
        if (!finalOrder.includes(key)) {
          finalOrder.push(key);
        }
        
        const widgetW = 3;
        const widgetH = 2;
        const position = findNextGridPosition(finalLayouts, widgetW, widgetH);

        finalLayouts[key] = {
          x: position.x,
          y: position.y,
          w: widgetW,
          h: widgetH,
        };
      }
    });
    
    // Compact layouts to remove empty spaces
    const compactedLayouts = compactLayoutsUtil(finalLayouts, finalVisible);
    
    // Update local state
    setVisibleWidgets(finalVisible);
    setWidgetOrder(finalOrder);
    setWidgetLayouts(compactedLayouts);
    
    savePreferencesMutation.mutate({
      widgets: finalVisible,
      order: finalOrder,
      layouts: compactedLayouts
    });
    setPendingWidgetChanges(new Set());
    setOriginalState(null);
    setIsResizeMode(false);
  };

  // Enter customize mode - store original state for cancel
  const handleEnterCustomizeMode = useCallback(() => {
    setOriginalState({
      visible: [...visibleWidgets],
      order: [...widgetOrder],
      layouts: { ...widgetLayouts }
    });
    setIsResizeMode(true);
  }, [visibleWidgets, widgetOrder, widgetLayouts]);

  // Cancel customize mode - restore original state
  const handleCancelCustomize = useCallback(() => {
    if (originalState) {
      setVisibleWidgets(originalState.visible);
      setWidgetOrder(originalState.order);
      setWidgetLayouts(originalState.layouts);
    }
    setPendingWidgetChanges(new Set());
    setOriginalState(null);
    setIsResizeMode(false);
    toast.info("Changes discarded");
  }, [originalState]);

  // Reset to default layout
  const handleResetToDefault = useCallback(() => {
    const defaultVisible = DEFAULT_WIDGETS.filter(w => w.visible).map(w => w.key);
    const defaultOrder = DEFAULT_WIDGETS.map(w => w.key);
    const defaultLayouts: WidgetLayoutConfig = {};
    
    // Create default grid layout
    let x = 0, y = 0;
    defaultVisible.forEach(key => {
      if (x + 3 > GRID_COLS) {
        x = 0;
        y += 2;
      }
      defaultLayouts[key] = { x, y, w: 3, h: 2 };
      x += 3;
    });
    
    const compacted = compactLayoutsUtil(defaultLayouts, defaultVisible);
    setVisibleWidgets(defaultVisible);
    setWidgetOrder(defaultOrder);
    setWidgetLayouts(compacted);
    setPendingWidgetChanges(new Set());
    toast.info("Layout reset to default");
  }, []);

  // Keyboard shortcuts for customize mode
  useEffect(() => {
    if (!isResizeMode) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleCancelCustomize();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isResizeMode, handleCancelCustomize]);

  // Fetch user's leads count
  const { data: leadsData, isLoading: leadsLoading } = useQuery({
    queryKey: ['user-leads-count', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('leads').select('id, lead_status').eq('created_by', user?.id);
      if (error) throw error;
      return {
        total: data?.length || 0,
        new: data?.filter(l => l.lead_status === 'New').length || 0,
        contacted: data?.filter(l => l.lead_status === 'Contacted').length || 0,
        qualified: data?.filter(l => l.lead_status === 'Qualified').length || 0
      };
    },
    enabled: !!user?.id
  });

  // Fetch user's contacts count
  const { data: contactsData, isLoading: contactsLoading } = useQuery({
    queryKey: ['user-contacts-count', user?.id],
    queryFn: async () => {
      const { count, error } = await supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('created_by', user?.id);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!user?.id
  });

  // Fetch user's deals count and value
  const { data: dealsData, isLoading: dealsLoading } = useQuery({
    queryKey: ['user-deals-count', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('deals').select('id, stage, total_contract_value, lead_owner, created_by');
      if (error) throw error;
      
      const userDeals = (data || []).filter(d => 
        d.created_by === user?.id || d.lead_owner === user?.id
      );
      
      const totalValue = userDeals.reduce((sum, d) => sum + (d.total_contract_value || 0), 0);
      const wonDeals = userDeals.filter(d => d.stage === 'Won');
      const lostDeals = userDeals.filter(d => d.stage === 'Lost');
      const wonValue = wonDeals.reduce((sum, d) => sum + (d.total_contract_value || 0), 0);
      return {
        total: userDeals.length,
        won: wonDeals.length,
        lost: lostDeals.length,
        totalValue,
        wonValue,
        active: userDeals.filter(d => !['Won', 'Lost', 'Dropped'].includes(d.stage)).length
      };
    },
    enabled: !!user?.id
  });

  // Fetch user's pending action items
  const { data: actionItemsData, isLoading: actionItemsLoading } = useQuery({
    queryKey: ['user-action-items', user?.id],
    queryFn: async () => {
      const { data: dealItems, error: dealError } = await supabase.from('deal_action_items').select('id, status, due_date').eq('assigned_to', user?.id).eq('status', 'Open');
      if (dealError) throw dealError;
      const { data: leadItems, error: leadError } = await supabase.from('lead_action_items').select('id, status, due_date').eq('assigned_to', user?.id).eq('status', 'Open');
      if (leadError) throw leadError;
      const allItems = [...(dealItems || []), ...(leadItems || [])];
      const overdue = allItems.filter(item => item.due_date && new Date(item.due_date) < new Date()).length;
      return { total: allItems.length, overdue };
    },
    enabled: !!user?.id
  });

  // Fetch upcoming meetings
  const { data: upcomingMeetings } = useQuery({
    queryKey: ['user-upcoming-meetings', user?.id],
    queryFn: async () => {
      const now = new Date().toISOString();
      const weekFromNow = addDays(new Date(), 7).toISOString();
      const { data, error } = await supabase
        .from('meetings')
        .select('id, subject, start_time, status')
        .eq('created_by', user?.id)
        .gte('start_time', now)
        .lte('start_time', weekFromNow)
        .order('start_time', { ascending: true })
        .limit(5);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id
  });

  // Fetch task reminders
  const { data: taskReminders } = useQuery({
    queryKey: ['user-task-reminders', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const weekFromNow = format(addDays(new Date(), 7), 'yyyy-MM-dd');
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, due_date, priority, status')
        .or(`assigned_to.eq.${user.id},created_by.eq.${user.id}`)
        .in('status', ['open', 'in_progress'])
        .lte('due_date', weekFromNow)
        .order('due_date', { ascending: true })
        .limit(5);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id
  });

  // Fetch completed tasks count
  const { data: completedTasksCount } = useQuery({
    queryKey: ['user-completed-tasks', user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;
      const { count, error } = await supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .or(`assigned_to.eq.${user.id},created_by.eq.${user.id}`)
        .eq('status', 'completed');
      if (error) throw error;
      return count || 0;
    },
    enabled: !!user?.id
  });

  // Fetch overdue items
  const { data: overdueItemsCount } = useQuery({
    queryKey: ['user-overdue-items', user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;
      const today = format(new Date(), 'yyyy-MM-dd');
      const { count, error } = await supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .or(`assigned_to.eq.${user.id},created_by.eq.${user.id}`)
        .in('status', ['open', 'in_progress'])
        .lt('due_date', today);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!user?.id
  });

  // Fetch email stats
  const { data: emailStats } = useQuery({
    queryKey: ['user-email-stats', user?.id],
    queryFn: async () => {
      if (!user?.id) return { sent: 0, opened: 0, clicked: 0 };
      const { data, error } = await supabase
        .from('email_history')
        .select('id, status, open_count, click_count')
        .eq('sent_by', user.id);
      if (error) throw error;
      const sent = data?.length || 0;
      const opened = data?.filter(e => (e.open_count || 0) > 0).length || 0;
      const clicked = data?.filter(e => (e.click_count || 0) > 0).length || 0;
      return { sent, opened, clicked };
    },
    enabled: !!user?.id
  });

  // Fetch top deals
  const { data: topDeals } = useQuery({
    queryKey: ['user-top-deals', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('deals')
        .select('id, deal_name, total_contract_value, stage')
        .or(`created_by.eq.${user.id},lead_owner.eq.${user.id}`)
        .not('stage', 'in', '("Lost","Dropped")')
        .order('total_contract_value', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id
  });

  // Fetch accounts data
  const { data: accountsData } = useQuery({
    queryKey: ['user-accounts-summary', user?.id],
    queryFn: async () => {
      if (!user?.id) return { total: 0, healthy: 0, atRisk: 0 };
      const { data, error } = await supabase
        .from('accounts')
        .select('id, score, status')
        .eq('created_by', user.id);
      if (error) throw error;
      const total = data?.length || 0;
      const healthy = data?.filter(a => (a.score || 0) >= 70).length || 0;
      const atRisk = data?.filter(a => (a.score || 0) < 40).length || 0;
      return { total, healthy, atRisk };
    },
    enabled: !!user?.id
  });

  // Fetch recent activities
  const { data: recentActivities } = useQuery({
    queryKey: ['user-recent-activities', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('security_audit_log')
        .select('id, action, resource_type, resource_id, created_at, details, user_id')
        .eq('user_id', user?.id)
        .in('action', ['CREATE', 'UPDATE', 'DELETE'])
        .in('resource_type', ['contacts', 'leads', 'deals', 'accounts', 'meetings', 'tasks'])
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;

      return (data || []).map(log => {
        let detailedSubject = `${log.action} ${log.resource_type}`;
        const details = log.details as any;
        
        if (log.action === 'UPDATE' && details?.field_changes) {
          const changedFields = Object.keys(details.field_changes);
          if (changedFields.length > 0) {
            const fieldSummary = changedFields.slice(0, 2).map(field => {
              const change = details.field_changes[field];
              const oldVal = change?.old ?? 'empty';
              const newVal = change?.new ?? 'empty';
              return `${field}: "${oldVal}" → "${newVal}"`;
            }).join(', ');
            detailedSubject = `Updated ${log.resource_type} - ${fieldSummary}${changedFields.length > 2 ? ` (+${changedFields.length - 2} more)` : ''}`;
          }
        } else if (log.action === 'UPDATE' && details?.updated_fields) {
          const updatedFields = Object.keys(details.updated_fields);
          if (updatedFields.length > 0) {
            detailedSubject = `Updated ${log.resource_type} - Changed: ${updatedFields.slice(0, 3).join(', ')}${updatedFields.length > 3 ? ` (+${updatedFields.length - 3} more)` : ''}`;
          }
        } else if (log.action === 'CREATE' && details?.record_data) {
          const recordName = details.record_data.lead_name || details.record_data.contact_name || 
                            details.record_data.deal_name || details.record_data.company_name || 
                            details.record_data.title || details.record_data.subject || '';
          if (recordName) {
            detailedSubject = `Created ${log.resource_type} - "${recordName}"`;
          }
        } else if (log.action === 'DELETE' && details?.deleted_data) {
          const recordName = details.deleted_data.lead_name || details.deleted_data.contact_name || 
                            details.deleted_data.deal_name || details.deleted_data.company_name || 
                            details.deleted_data.title || details.deleted_data.subject || '';
          if (recordName) {
            detailedSubject = `Deleted ${log.resource_type} - "${recordName}"`;
          }
        }
        
        return {
          id: log.id,
          subject: detailedSubject,
          activity_type: log.action,
          activity_date: log.created_at,
          resource_type: log.resource_type,
        };
      });
    },
    enabled: !!user?.id
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const isLoading = leadsLoading || contactsLoading || dealsLoading || actionItemsLoading;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  // Placeholder widget component
  const PlaceholderWidget = ({ title, icon, description }: { title: string; icon: React.ReactNode; description: string }) => (
    <Card className="h-full animate-fade-in">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-4 text-center">
          <div className="text-muted-foreground/50 mb-2">{icon}</div>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  );

  const renderWidget = (key: WidgetKey) => {
    switch (key) {
      case "leads":
        return (
          <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer animate-fade-in" onClick={() => !isResizeMode && navigate('/leads')}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">My Leads</CardTitle>
              <FileText className="w-4 h-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{leadsData?.total || 0}</div>
              <p className="text-xs text-muted-foreground">{leadsData?.new || 0} new, {leadsData?.qualified || 0} qualified</p>
            </CardContent>
          </Card>
        );
      case "contacts":
        return (
          <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer animate-fade-in" onClick={() => !isResizeMode && navigate('/contacts')}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">My Contacts</CardTitle>
              <Users className="w-4 h-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{contactsData || 0}</div>
              <p className="text-xs text-muted-foreground">Total contacts created</p>
            </CardContent>
          </Card>
        );
      case "deals":
        return (
          <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer animate-fade-in" onClick={() => !isResizeMode && navigate('/deals')}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">My Deals</CardTitle>
              <Briefcase className="w-4 h-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dealsData?.total || 0}</div>
              <p className="text-xs text-muted-foreground">{dealsData?.active || 0} active, {dealsData?.won || 0} won</p>
            </CardContent>
          </Card>
        );
      case "actionItems":
        return (
          <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer animate-fade-in" onClick={() => !isResizeMode && navigate('/tasks')}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                Action Items
                <span className="text-xs font-normal text-muted-foreground">(click to view)</span>
              </CardTitle>
              <Clock className="w-4 h-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{actionItemsData?.total || 0}</div>
              <p className={`text-xs ${(actionItemsData?.overdue || 0) > 0 ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                {(actionItemsData?.overdue || 0) > 0 ? `⚠️ ${actionItemsData?.overdue} overdue` : 'No overdue items'}
              </p>
            </CardContent>
          </Card>
        );
      case "upcomingMeetings":
        return (
          <Card className="h-full animate-fade-in">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" />
                Upcoming Meetings
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => !isResizeMode && navigate('/meetings')}>
                View All
              </Button>
            </CardHeader>
            <CardContent>
              {upcomingMeetings && upcomingMeetings.length > 0 ? (
                <div className="space-y-3">
                  {upcomingMeetings.map((meeting) => (
                    <div 
                      key={meeting.id} 
                      className="flex items-center justify-between p-2 rounded-lg bg-muted/50 cursor-pointer hover:bg-muted/80 transition-colors"
                      onClick={() => { if (!isResizeMode) { setSelectedMeeting(meeting); setMeetingModalOpen(true); }}}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{meeting.subject}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(meeting.start_time), 'dd/MM/yyyy HH:mm')}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full flex-shrink-0 ${
                        meeting.status === 'scheduled' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                      }`}>
                        {meeting.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <Calendar className="w-8 h-8 text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">No upcoming meetings scheduled</p>
                  <Button variant="link" size="sm" className="mt-1" onClick={() => !isResizeMode && navigate('/meetings')}>
                    Schedule a meeting
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      case "taskReminders":
        return (
          <Card className="h-full animate-fade-in">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-primary" />
                Task Reminders
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => !isResizeMode && navigate('/tasks')}>
                View All
              </Button>
            </CardHeader>
            <CardContent>
              {taskReminders && taskReminders.length > 0 ? (
                <div className="space-y-3">
                  {taskReminders.map((task) => {
                    const taskDueDate = task.due_date ? new Date(task.due_date) : null;
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const isOverdue = taskDueDate && isBefore(taskDueDate, today);
                    const isDueToday = taskDueDate && taskDueDate.toDateString() === new Date().toDateString();
                    
                    return (
                      <div 
                        key={task.id} 
                        className={`flex items-center justify-between p-2 rounded-lg cursor-pointer hover:ring-2 hover:ring-primary/20 transition-all ${
                          isOverdue 
                            ? 'bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700' 
                            : isDueToday 
                              ? 'bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800'
                              : 'bg-muted/50'
                        }`}
                        onClick={() => { if (!isResizeMode) { setSelectedTask(task as Task); setTaskModalOpen(true); }}}
                        title="Click to view task details"
                      >
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-medium truncate ${isOverdue ? 'text-red-800 dark:text-red-200' : ''}`}>
                            {task.title}
                          </p>
                          <p className={`text-xs ${isOverdue ? 'text-red-600 dark:text-red-400 font-medium' : isDueToday ? 'text-orange-600 dark:text-orange-400' : 'text-muted-foreground'}`}>
                            <AlertCircle className={`w-3 h-3 inline mr-1 ${isOverdue || isDueToday ? '' : 'hidden'}`} />
                            {isOverdue ? 'OVERDUE - ' : isDueToday ? 'Due Today - ' : ''}
                            Due: {task.due_date ? format(new Date(task.due_date), 'dd/MM/yyyy') : 'No date'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {isOverdue && (
                            <span className="text-xs px-2 py-1 rounded-full bg-red-500 text-white font-semibold">
                              OVERDUE
                            </span>
                          )}
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                            task.priority === 'high' ? 'bg-red-500 text-white' :
                            task.priority === 'medium' ? 'bg-amber-500 text-white' :
                            'bg-slate-500 text-white'
                          }`}>
                            {task.priority}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <Bell className="w-8 h-8 text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">No pending tasks</p>
                  <Button variant="link" size="sm" className="mt-1" onClick={() => !isResizeMode && navigate('/tasks')}>
                    Create a task
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      case "recentActivities":
        return (
          <Card className="h-full animate-fade-in">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                Recent Activities
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => !isResizeMode && navigate('/notifications')}>
                View All
              </Button>
            </CardHeader>
            <CardContent className="relative">
              {recentActivities && recentActivities.length > 0 ? (
                <div className="space-y-3 max-h-[300px] overflow-y-auto scrollbar-thin pr-1">
                  {recentActivities.slice(0, 5).map((activity) => (
                    <div key={activity.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50 group" title={activity.subject}>
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Activity className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium line-clamp-2 group-hover:line-clamp-none transition-all" title={activity.subject}>
                          {activity.subject}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {activity.activity_type} • {format(new Date(activity.activity_date), 'dd/MM/yyyy HH:mm')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Activity className="w-10 h-10 text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">No recent activities</p>
                  <p className="text-xs text-muted-foreground mt-1">Activities will appear here as you work</p>
                </div>
              )}
            </CardContent>
          </Card>
        );
      case "performance":
        const hasWonRevenue = (dealsData?.wonValue || 0) > 0;
        return (
          <Card className="h-full animate-fade-in">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                My Performance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Total Pipeline Value</p>
                  <p className="text-xl font-bold">{formatCurrency(dealsData?.totalValue || 0)}</p>
                </div>
                <Briefcase className="w-8 h-8 text-muted-foreground/50" />
              </div>
              <div className={`flex justify-between items-center p-3 rounded-lg ${
                hasWonRevenue 
                  ? 'bg-green-50 dark:bg-green-950/20' 
                  : 'bg-muted/50'
              }`}>
                <div>
                  <p className="text-sm text-muted-foreground">Won Revenue</p>
                  <p className={`text-xl font-bold ${hasWonRevenue ? 'text-green-600' : 'text-muted-foreground'}`}>
                    {formatCurrency(dealsData?.wonValue || 0)}
                  </p>
                </div>
                {hasWonRevenue ? (
                  <CheckCircle2 className="w-8 h-8 text-green-600/50" />
                ) : (
                  <TrendingUp className="w-8 h-8 text-muted-foreground/30" />
                )}
              </div>
            </CardContent>
          </Card>
        );
      case "quickActions":
        return (
          <Card className="h-full animate-fade-in">
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button 
                variant="outline" 
                className="w-full justify-between group hover:bg-primary hover:text-primary-foreground transition-colors" 
                onClick={() => !isResizeMode && navigate('/leads')}
              >
                <span className="flex items-center gap-2"><Plus className="w-4 h-4" />Add New Lead</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-between group hover:bg-primary hover:text-primary-foreground transition-colors" 
                onClick={() => !isResizeMode && navigate('/contacts')}
              >
                <span className="flex items-center gap-2"><Plus className="w-4 h-4" />Add New Contact</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-between group hover:bg-primary hover:text-primary-foreground transition-colors" 
                onClick={() => !isResizeMode && navigate('/deals')}
              >
                <span className="flex items-center gap-2"><Plus className="w-4 h-4" />Create New Deal</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </CardContent>
          </Card>
        );
      case "leadStatus":
        return (
          <Card className="h-full animate-fade-in">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Lead Status Overview
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Shows your leads categorized by current status</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                  <p className="text-2xl font-bold text-blue-600">{leadsData?.new || 0}</p>
                  <p className="text-sm text-muted-foreground">New</p>
                </div>
                <div className="text-center p-4 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg">
                  <p className="text-2xl font-bold text-yellow-600">{leadsData?.contacted || 0}</p>
                  <p className="text-sm text-muted-foreground">Contacted</p>
                </div>
                <div className="text-center p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
                  <p className="text-2xl font-bold text-green-600">{leadsData?.qualified || 0}</p>
                  <p className="text-sm text-muted-foreground">Qualified</p>
                </div>
                <div className="text-center p-4 bg-purple-50 dark:bg-purple-950/20 rounded-lg">
                  <p className="text-2xl font-bold text-purple-600">{leadsData?.total || 0}</p>
                  <p className="text-sm text-muted-foreground">Total Leads</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      
      // Additional widgets with real data
      case "salesTarget":
        return (
          <Card className="h-full animate-fade-in">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Sales Target</CardTitle>
              <Target className="w-4 h-4 text-amber-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(dealsData?.wonValue || 0)}</div>
              <p className="text-xs text-muted-foreground">Won this period</p>
              <div className="mt-3 h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(((dealsData?.wonValue || 0) / 100000) * 100, 100)}%` }} />
              </div>
            </CardContent>
          </Card>
        );
      case "pipelineValue":
        return (
          <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer animate-fade-in" onClick={() => !isResizeMode && navigate('/deals')}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Pipeline Value</CardTitle>
              <DollarSign className="w-4 h-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(dealsData?.totalValue || 0)}</div>
              <p className="text-xs text-muted-foreground">{dealsData?.active || 0} active deals</p>
            </CardContent>
          </Card>
        );
      case "conversionRate":
        const totalDeals = (dealsData?.won || 0) + (dealsData?.lost || 0);
        const convRate = totalDeals > 0 ? Math.round((dealsData?.won || 0) / totalDeals * 100) : 0;
        return (
          <Card className="h-full animate-fade-in">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
              <Percent className="w-4 h-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{convRate}%</div>
              <p className="text-xs text-muted-foreground">{dealsData?.won || 0} won / {totalDeals} closed</p>
            </CardContent>
          </Card>
        );
      case "completedTasks":
        return (
          <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer animate-fade-in" onClick={() => !isResizeMode && navigate('/tasks')}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Completed Tasks</CardTitle>
              <CheckCircle className="w-4 h-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{completedTasksCount || 0}</div>
              <p className="text-xs text-muted-foreground">Tasks completed</p>
            </CardContent>
          </Card>
        );
      case "overdueItems":
        return (
          <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer animate-fade-in" onClick={() => !isResizeMode && navigate('/tasks')}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Overdue Items</CardTitle>
              <AlertTriangle className="w-4 h-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${(overdueItemsCount || 0) > 0 ? 'text-red-600' : ''}`}>{overdueItemsCount || 0}</div>
              <p className="text-xs text-muted-foreground">{(overdueItemsCount || 0) > 0 ? 'Needs attention' : 'All caught up!'}</p>
            </CardContent>
          </Card>
        );
      case "emailStats":
        return (
          <Card className="h-full animate-fade-in">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Email Statistics</CardTitle>
              <Mail className="w-4 h-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-xl font-bold">{emailStats?.sent || 0}</p>
                  <p className="text-xs text-muted-foreground">Sent</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-green-600">{emailStats?.opened || 0}</p>
                  <p className="text-xs text-muted-foreground">Opened</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-blue-600">{emailStats?.clicked || 0}</p>
                  <p className="text-xs text-muted-foreground">Clicked</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      case "topDeals":
        return (
          <Card className="h-full animate-fade-in">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-500" />
                Top Deals
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => !isResizeMode && navigate('/deals')}>
                View All
              </Button>
            </CardHeader>
            <CardContent>
              {topDeals && topDeals.length > 0 ? (
                <div className="space-y-2">
                  {topDeals.slice(0, 5).map((deal, idx) => (
                    <div key={deal.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-xs font-bold text-muted-foreground">#{idx + 1}</span>
                        <p className="text-sm font-medium truncate">{deal.deal_name}</p>
                      </div>
                      <span className="text-sm font-semibold text-green-600">{formatCurrency(deal.total_contract_value || 0)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <Trophy className="w-8 h-8 text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">No deals yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        );
      case "accountHealth":
        return (
          <Card className="h-full animate-fade-in" onClick={() => !isResizeMode && navigate('/accounts')}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Account Health</CardTitle>
              <Building2 className="w-4 h-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-xl font-bold">{accountsData?.total || 0}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-green-600">{accountsData?.healthy || 0}</p>
                  <p className="text-xs text-muted-foreground">Healthy</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-red-600">{accountsData?.atRisk || 0}</p>
                  <p className="text-xs text-muted-foreground">At Risk</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      case "winLossRatio":
        const winLossTotal = (dealsData?.won || 0) + (dealsData?.lost || 0);
        const winRate = winLossTotal > 0 ? Math.round((dealsData?.won || 0) / winLossTotal * 100) : 0;
        return (
          <Card className="h-full animate-fade-in">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Win/Loss Ratio</CardTitle>
              <PieChart className="w-4 h-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dealsData?.won || 0}:{dealsData?.lost || 0}</div>
              <p className="text-xs text-muted-foreground">{winRate}% win rate</p>
            </CardContent>
          </Card>
        );
      case "customerRetention":
        return (
          <Card className="h-full animate-fade-in">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Customer Retention</CardTitle>
              <Star className="w-4 h-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{accountsData?.healthy || 0}</div>
              <p className="text-xs text-muted-foreground">Healthy accounts</p>
            </CardContent>
          </Card>
        );
      
      // Placeholder widgets
      case "revenueChart":
        return <PlaceholderWidget title="Revenue Chart" icon={<LineChart className="w-4 h-4 text-green-600" />} description="Revenue trends over time" />;
      case "dealForecast":
        return <PlaceholderWidget title="Deal Forecast" icon={<ArrowUpRight className="w-4 h-4 text-blue-600" />} description="Predicted deal outcomes" />;
      case "callLog":
        return <PlaceholderWidget title="Call Log" icon={<PhoneCall className="w-4 h-4 text-purple-600" />} description="Recent call activities" />;
      case "teamActivity":
        return <PlaceholderWidget title="Team Activity" icon={<MessageSquare className="w-4 h-4 text-blue-600" />} description="Team collaboration updates" />;
      case "taskProgress":
        return <PlaceholderWidget title="Task Progress" icon={<ListTodo className="w-4 h-4 text-amber-600" />} description="Task completion progress" />;
      case "regionStats":
        return <PlaceholderWidget title="Region Statistics" icon={<Globe className="w-4 h-4 text-teal-600" />} description="Performance by region" />;
      case "geoDistribution":
        return <PlaceholderWidget title="Geo Distribution" icon={<MapPin className="w-4 h-4 text-red-600" />} description="Geographic data distribution" />;
      case "leadSources":
        return <PlaceholderWidget title="Lead Sources" icon={<Filter className="w-4 h-4 text-indigo-600" />} description="Where leads come from" />;
      case "salesVelocity":
        return <PlaceholderWidget title="Sales Velocity" icon={<Gauge className="w-4 h-4 text-orange-600" />} description="Speed of sales cycle" />;
      case "growthTrend":
        return <PlaceholderWidget title="Growth Trend" icon={<TrendingUp className="w-4 h-4 text-green-600" />} description="Business growth over time" />;
      default:
        return null;
    }
  };

  return (
    <div className="p-6 space-y-8" ref={containerRef}>
      {/* Welcome Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground truncate">
            Welcome back{userName ? `, ${userName}` : ''}!
          </h1>
        </div>
        <div className="flex gap-2 flex-shrink-0 items-center">
          {isResizeMode ? (
            <>
              {/* Compact customize mode indicator */}
              <div className="bg-primary/10 border border-primary/20 rounded-lg px-3 py-1.5 hidden sm:flex items-center">
                <p className="text-xs text-primary font-medium flex items-center gap-1.5">
                  <Settings2 className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Drag to move, resize edges, or press Escape to cancel</span>
                  <span className="md:hidden">Edit mode</span>
                </p>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={handleResetToDefault} className="gap-2">
                      <RotateCcw className="w-4 h-4" />
                      <span className="hidden sm:inline">Reset</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Reset to default layout</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <Plus className="w-4 h-4" />
                    Add Widget
                    {pendingWidgetChanges.size > 0 && (
                      <span className="bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full">
                        {pendingWidgetChanges.size}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0" align="end">
                  <div className="p-3 border-b">
                    <p className="text-sm font-medium">Toggle Widgets</p>
                    <p className="text-xs text-muted-foreground">Click to add/remove. Changes apply when you click Save.</p>
                  </div>
                  <ScrollArea className="h-64">
                    <div className="p-2 space-y-1">
                      {DEFAULT_WIDGETS.map(widget => {
                        const willBeVisible = willWidgetBeVisible(widget.key);
                        const isPending = pendingWidgetChanges.has(widget.key);
                        
                        return (
                          <Button
                            key={widget.key}
                            variant="ghost"
                            className={`w-full justify-between gap-2 ${isPending ? 'bg-primary/10' : ''}`}
                            onClick={() => togglePendingWidget(widget.key)}
                          >
                            <span className="flex items-center gap-2">
                              {widget.icon}
                              {widget.label}
                            </span>
                            {willBeVisible && (
                              <Check className="w-4 h-4 text-primary" />
                            )}
                          </Button>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>
              <Button variant="outline" onClick={handleCancelCustomize} className="gap-2">
                <X className="w-4 h-4" />
                Cancel
              </Button>
              <Button onClick={handleSaveLayout} className="gap-2" disabled={savePreferencesMutation.isPending}>
                <Check className="w-4 h-4" />
                {savePreferencesMutation.isPending ? 'Saving...' : 'Save'}
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={handleEnterCustomizeMode} className="gap-2">
              <Settings2 className="w-4 h-4" />
              Customize
            </Button>
          )}
        </div>
      </div>

      {/* Resizable Grid Layout */}
      <ResizableDashboard
        isResizeMode={isResizeMode}
        visibleWidgets={visibleWidgets}
        widgetLayouts={widgetLayouts}
        pendingWidgetChanges={pendingWidgetChanges}
        onLayoutChange={handleLayoutChange}
        onWidgetRemove={handleWidgetRemove}
        renderWidget={renderWidget}
        containerWidth={containerWidth}
      />

      
      {/* Task Modal */}
      <TaskModal
        open={taskModalOpen}
        onOpenChange={(open) => {
          setTaskModalOpen(open);
          if (!open) setSelectedTask(null);
        }}
        task={selectedTask}
        onSubmit={createTask}
        onUpdate={async (taskId, updates, original) => {
          const result = await updateTask(taskId, updates, original);
          if (result) {
            queryClient.invalidateQueries({ queryKey: ['user-task-reminders', user?.id] });
          }
          return result;
        }}
      />
      
      {/* Meeting Modal */}
      <MeetingModal
        open={meetingModalOpen}
        onOpenChange={(open) => {
          setMeetingModalOpen(open);
          if (!open) setSelectedMeeting(null);
        }}
        meeting={selectedMeeting}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['user-upcoming-meetings', user?.id] });
          setMeetingModalOpen(false);
          setSelectedMeeting(null);
        }}
      />
    </div>
  );
};

export default UserDashboard;
