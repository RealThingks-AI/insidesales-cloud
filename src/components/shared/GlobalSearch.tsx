import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { 
  Building2, 
  Users, 
  UserPlus, 
  Briefcase, 
  Calendar, 
  CheckSquare,
  Search,
  LayoutDashboard,
  Settings,
  Bell
} from "lucide-react";

interface SearchResult {
  id: string;
  name: string;
  type: 'account' | 'contact' | 'lead' | 'deal' | 'meeting' | 'task';
  subtitle?: string;
}

const typeConfig = {
  account: { icon: Building2, route: '/accounts', color: 'text-blue-500' },
  contact: { icon: Users, route: '/contacts', color: 'text-green-500' },
  lead: { icon: UserPlus, route: '/leads', color: 'text-purple-500' },
  deal: { icon: Briefcase, route: '/deals', color: 'text-orange-500' },
  meeting: { icon: Calendar, route: '/meetings', color: 'text-pink-500' },
  task: { icon: CheckSquare, route: '/tasks', color: 'text-cyan-500' },
};

const quickLinks = [
  { name: 'Dashboard', icon: LayoutDashboard, route: '/dashboard' },
  { name: 'Accounts', icon: Building2, route: '/accounts' },
  { name: 'Contacts', icon: Users, route: '/contacts' },
  { name: 'Leads', icon: UserPlus, route: '/leads' },
  { name: 'Deals', icon: Briefcase, route: '/deals' },
  { name: 'Meetings', icon: Calendar, route: '/meetings' },
  { name: 'Tasks', icon: CheckSquare, route: '/tasks' },
  { name: 'Notifications', icon: Bell, route: '/notifications' },
  { name: 'Settings', icon: Settings, route: '/settings' },
];

export const GlobalSearch = () => {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const navigate = useNavigate();

  // Handle keyboard shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // Search query
  const { data: results = [], isLoading } = useQuery({
    queryKey: ['global-search', searchTerm],
    queryFn: async () => {
      if (searchTerm.length < 2) return [];

      const searchResults: SearchResult[] = [];
      const term = `%${searchTerm}%`;

      // Search accounts
      const { data: accounts } = await supabase
        .from('accounts')
        .select('id, company_name, industry')
        .ilike('company_name', term)
        .limit(5);
      
      accounts?.forEach(a => searchResults.push({
        id: a.id,
        name: a.company_name,
        type: 'account',
        subtitle: a.industry || undefined
      }));

      // Search contacts
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, contact_name, company_name')
        .ilike('contact_name', term)
        .limit(5);
      
      contacts?.forEach(c => searchResults.push({
        id: c.id,
        name: c.contact_name,
        type: 'contact',
        subtitle: c.company_name || undefined
      }));

      // Search leads
      const { data: leads } = await supabase
        .from('leads')
        .select('id, lead_name, company_name')
        .ilike('lead_name', term)
        .limit(5);
      
      leads?.forEach(l => searchResults.push({
        id: l.id,
        name: l.lead_name,
        type: 'lead',
        subtitle: l.company_name || undefined
      }));

      // Search deals
      const { data: deals } = await supabase
        .from('deals')
        .select('id, deal_name, customer_name')
        .or(`deal_name.ilike.${term},project_name.ilike.${term}`)
        .limit(5);
      
      deals?.forEach(d => searchResults.push({
        id: d.id,
        name: d.deal_name,
        type: 'deal',
        subtitle: d.customer_name || undefined
      }));

      // Search meetings
      const { data: meetings } = await supabase
        .from('meetings')
        .select('id, subject')
        .ilike('subject', term)
        .limit(5);
      
      meetings?.forEach(m => searchResults.push({
        id: m.id,
        name: m.subject,
        type: 'meeting'
      }));

      // Search tasks
      const { data: tasks } = await supabase
        .from('tasks')
        .select('id, title')
        .ilike('title', term)
        .limit(5);
      
      tasks?.forEach(t => searchResults.push({
        id: t.id,
        name: t.title,
        type: 'task'
      }));

      return searchResults;
    },
    enabled: searchTerm.length >= 2,
  });

  const handleSelect = useCallback((result: SearchResult) => {
    const config = typeConfig[result.type];
    navigate(config.route);
    setOpen(false);
    setSearchTerm("");
  }, [navigate]);

  const handleQuickLink = useCallback((route: string) => {
    navigate(route);
    setOpen(false);
    setSearchTerm("");
  }, [navigate]);

  // Group results by type
  const groupedResults = results.reduce((acc, result) => {
    if (!acc[result.type]) acc[result.type] = [];
    acc[result.type].push(result);
    return acc;
  }, {} as Record<string, SearchResult[]>);

  return (
    <>
      {/* Search trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground bg-muted/50 hover:bg-muted rounded-md border border-border transition-colors"
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">Search...</span>
        <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput 
          placeholder="Search across accounts, contacts, leads, deals..." 
          value={searchTerm}
          onValueChange={setSearchTerm}
        />
        <CommandList>
          <CommandEmpty>
            {searchTerm.length < 2 
              ? "Type at least 2 characters to search..."
              : isLoading 
                ? "Searching..." 
                : "No results found."}
          </CommandEmpty>

          {/* Quick Links when no search term */}
          {searchTerm.length < 2 && (
            <CommandGroup heading="Quick Links">
              {quickLinks.map(link => (
                <CommandItem
                  key={link.route}
                  onSelect={() => handleQuickLink(link.route)}
                  className="cursor-pointer"
                >
                  <link.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>{link.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {/* Search Results */}
          {Object.entries(groupedResults).map(([type, items], index) => {
            const config = typeConfig[type as keyof typeof typeConfig];
            const Icon = config.icon;
            const typeName = type.charAt(0).toUpperCase() + type.slice(1) + 's';
            
            return (
              <CommandGroup key={type} heading={typeName}>
                {items.map(item => (
                  <CommandItem
                    key={item.id}
                    onSelect={() => handleSelect(item)}
                    className="cursor-pointer"
                  >
                    <Icon className={`mr-2 h-4 w-4 ${config.color}`} />
                    <div className="flex flex-col">
                      <span>{item.name}</span>
                      {item.subtitle && (
                        <span className="text-xs text-muted-foreground">{item.subtitle}</span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            );
          })}
        </CommandList>
      </CommandDialog>
    </>
  );
};
