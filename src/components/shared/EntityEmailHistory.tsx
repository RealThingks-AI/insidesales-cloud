import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Mail,
  Eye,
  Clock,
  AlertTriangle,
  XCircle,
  CheckCircle,
  Send,
  Users,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

interface EmailHistoryItem {
  id: string;
  subject: string;
  recipient_email: string;
  recipient_name: string | null;
  sender_email: string;
  body: string | null;
  status: string;
  sent_at: string;
  opened_at: string | null;
  open_count: number | null;
  unique_opens: number | null;
  bounce_type: string | null;
  bounce_reason: string | null;
  bounced_at: string | null;
  is_valid_open: boolean | null;
}

interface EntityEmailHistoryProps {
  entityType: 'contact' | 'lead' | 'account';
  entityId: string;
}

export const EntityEmailHistory = ({ entityType, entityId }: EntityEmailHistoryProps) => {
  const [emails, setEmails] = useState<EmailHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState<EmailHistoryItem | null>(null);
  const [markingBounced, setMarkingBounced] = useState<string | null>(null);
  const [confirmBounceEmail, setConfirmBounceEmail] = useState<EmailHistoryItem | null>(null);

  const fetchEmails = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('email_history')
        .select('id, subject, recipient_email, recipient_name, sender_email, body, status, sent_at, opened_at, open_count, unique_opens, bounce_type, bounce_reason, bounced_at, is_valid_open')
        .order('sent_at', { ascending: false });

      if (entityType === 'contact') {
        query = query.eq('contact_id', entityId);
      } else if (entityType === 'lead') {
        query = query.eq('lead_id', entityId);
      } else if (entityType === 'account') {
        query = query.eq('account_id', entityId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setEmails((data as EmailHistoryItem[]) || []);
    } catch (error) {
      console.error('Error fetching email history:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (entityId) {
      fetchEmails();
    }
  }, [entityType, entityId]);

  const handleMarkAsBounced = async (email: EmailHistoryItem) => {
    setMarkingBounced(email.id);
    try {
      const { data, error } = await supabase.functions.invoke('mark-email-bounced', {
        body: {
          emailId: email.id,
          bounceType: 'hard',
          bounceReason: 'Manually marked as bounced - email delivery failed',
        },
      });

      if (error) throw error;

      toast.success('Email marked as bounced');
      setConfirmBounceEmail(null);
      fetchEmails(); // Refresh the list
    } catch (error: any) {
      console.error('Error marking email as bounced:', error);
      toast.error('Failed to mark email as bounced');
    } finally {
      setMarkingBounced(null);
    }
  };

  const getStatusBadge = (email: EmailHistoryItem) => {
    const { status, bounce_type, bounce_reason, is_valid_open, open_count } = email;

    if (status === 'bounced' || bounce_type) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Badge className="bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20">
                <XCircle className="h-3 w-3 mr-1" />
                Bounced
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-semibold">Bounce type: {bounce_type || 'unknown'}</p>
              {bounce_reason && <p className="text-xs mt-1">{bounce_reason}</p>}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    if (status === 'opened') {
      if (is_valid_open === false) {
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 border-yellow-300">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Suspicious
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>Opens may be from email scanners, not real users</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      }
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
          <Eye className="h-3 w-3 mr-1" />
          Opened
        </Badge>
      );
    }

    if (status === 'delivered') {
      return (
        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
          <CheckCircle className="h-3 w-3 mr-1" />
          Delivered
        </Badge>
      );
    }

    return (
      <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200">
        <Send className="h-3 w-3 mr-1" />
        Sent
      </Badge>
    );
  };

  const getOpenCountDisplay = (email: EmailHistoryItem) => {
    if (email.status === 'bounced' || email.bounce_type) {
      return (
        <span className="flex items-center gap-1 text-destructive">
          <XCircle className="h-3 w-3" />
          Bounced
        </span>
      );
    }

    const uniqueOpens = email.unique_opens || 0;
    const totalOpens = email.open_count || 0;

    if (totalOpens === 0) {
      return (
        <span className="flex items-center gap-1">
          <Eye className="h-3 w-3" />
          0 opens
        </span>
      );
    }

    if (email.is_valid_open === false) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <span className="flex items-center gap-1 text-yellow-600">
                <AlertTriangle className="h-3 w-3" />
                {totalOpens} (suspicious)
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>These opens may be from automated email scanners</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <span className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              {uniqueOpens > 0 ? `${uniqueOpens} unique` : `${totalOpens} opens`}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>Total opens: {totalOpens}</p>
            <p>Unique opens: {uniqueOpens}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Mail className="h-10 w-10 mb-2 opacity-50" />
        <p className="text-sm">No emails sent to this {entityType} yet</p>
      </div>
    );
  }

  return (
    <>
      <ScrollArea className="h-[300px] pr-4">
        <div className="space-y-3">
          {emails.map((email) => (
            <Card 
              key={email.id} 
              className={`cursor-pointer hover:bg-accent/50 transition-colors ${
                email.status === 'bounced' || email.bounce_type ? 'border-destructive/30' : ''
              }`}
              onClick={() => setSelectedEmail(email)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="font-medium truncate">{email.subject}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {format(new Date(email.sent_at), 'dd/MM/yyyy HH:mm')}
                      </span>
                      {getOpenCountDisplay(email)}
                    </div>
                  </div>
                  {getStatusBadge(email)}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>

      <Dialog open={!!selectedEmail} onOpenChange={() => setSelectedEmail(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Email Details
            </DialogTitle>
          </DialogHeader>
          
          {selectedEmail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Subject</p>
                  <p className="text-sm">{selectedEmail.subject}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Status</p>
                  <div className="mt-1">{getStatusBadge(selectedEmail)}</div>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">To</p>
                  <p className="text-sm">{selectedEmail.recipient_name || selectedEmail.recipient_email}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">From</p>
                  <p className="text-sm">{selectedEmail.sender_email}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Sent At</p>
                  <p className="text-sm">{format(new Date(selectedEmail.sent_at), 'dd/MM/yyyy HH:mm')}</p>
                </div>
                {selectedEmail.opened_at && !selectedEmail.bounce_type && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">First Opened</p>
                    <p className="text-sm">{format(new Date(selectedEmail.opened_at), 'dd/MM/yyyy HH:mm')}</p>
                  </div>
                )}
                {selectedEmail.bounced_at && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Bounced At</p>
                    <p className="text-sm text-destructive">{format(new Date(selectedEmail.bounced_at), 'dd/MM/yyyy HH:mm')}</p>
                  </div>
                )}
              </div>

              {selectedEmail.bounce_type && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3">
                  <div className="flex items-center gap-2 text-destructive font-medium">
                    <XCircle className="h-4 w-4" />
                    Email Bounced ({selectedEmail.bounce_type})
                  </div>
                  {selectedEmail.bounce_reason && (
                    <p className="text-sm text-destructive/80 mt-1">{selectedEmail.bounce_reason}</p>
                  )}
                </div>
              )}

              {!selectedEmail.bounce_type && (
                <div className="flex justify-center gap-4">
                  <Card>
                    <CardContent className="p-4 flex items-center gap-3">
                      <Eye className="h-8 w-8 text-blue-500" />
                      <div>
                        <p className="text-2xl font-bold">{selectedEmail.open_count || 0}</p>
                        <p className="text-xs text-muted-foreground">Total Opens</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 flex items-center gap-3">
                      <Users className="h-8 w-8 text-green-500" />
                      <div>
                        <p className="text-2xl font-bold">{selectedEmail.unique_opens || 0}</p>
                        <p className="text-xs text-muted-foreground">Unique Opens</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {selectedEmail.is_valid_open === false && !selectedEmail.bounce_type && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-3">
                  <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-300 font-medium">
                    <AlertTriangle className="h-4 w-4" />
                    Suspicious Activity Detected
                  </div>
                  <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-1">
                    The opens for this email may be from automated email security scanners, not actual recipients.
                  </p>
                </div>
              )}

              {selectedEmail.body && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">Email Body</p>
                  <div 
                    className="border rounded-md p-4 bg-muted/30 text-sm max-h-[200px] overflow-y-auto"
                    dangerouslySetInnerHTML={{ __html: selectedEmail.body }}
                  />
                </div>
              )}

              {/* Mark as Bounced button - only show for non-bounced emails */}
              {!selectedEmail.bounce_type && selectedEmail.status !== 'bounced' && (
                <div className="pt-4 border-t">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmBounceEmail(selectedEmail);
                    }}
                    className="w-full"
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Mark as Bounced
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    Use this if you received a bounce notification for this email
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm bounce dialog */}
      <AlertDialog open={!!confirmBounceEmail} onOpenChange={() => setConfirmBounceEmail(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark Email as Bounced?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the email as bounced and reset any open tracking data. 
              If the contact's engagement score was increased by false opens, it will be corrected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmBounceEmail && handleMarkAsBounced(confirmBounceEmail)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!!markingBounced}
            >
              {markingBounced ? 'Marking...' : 'Mark as Bounced'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
