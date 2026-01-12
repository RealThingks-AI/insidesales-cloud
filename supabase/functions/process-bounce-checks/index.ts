import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getAccessToken(): Promise<string> {
  const tenantId = Deno.env.get("AZURE_EMAIL_TENANT_ID") || Deno.env.get("AZURE_TENANT_ID");
  const clientId = Deno.env.get("AZURE_EMAIL_CLIENT_ID") || Deno.env.get("AZURE_CLIENT_ID");
  const clientSecret = Deno.env.get("AZURE_EMAIL_CLIENT_SECRET") || Deno.env.get("AZURE_CLIENT_SECRET");

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Azure credentials not configured");
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get access token: ${error}`);
  }

  const data = await response.json();
  return data.access_token;
}

// Improved NDR parsing for Office 365 format
function parseNDRContent(subject: string, body: string): { recipientEmail: string | null; reason: string | null; originalSubject: string | null } {
  let recipientEmail: string | null = null;
  let reason: string | null = null;
  let originalSubject: string | null = null;

  console.log("Parsing NDR - Subject:", subject);
  console.log("Parsing NDR - Body preview:", body.substring(0, 500));

  // Extract original subject from NDR subject line
  const subjectMatch = subject.match(/Undeliverable:\s*(.+)/i) || subject.match(/Delivery Status Notification.*?:\s*(.+)/i);
  if (subjectMatch) {
    originalSubject = subjectMatch[1].trim();
  }

  // Improved email extraction patterns for Office 365 NDRs
  const emailPatterns = [
    // Office 365: "Your message to xxx@domain.com couldn't be delivered"
    /Your message to\s+<?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>?\s+couldn['']t be delivered/i,
    // Office 365: "message to xxx@domain.com couldn't be delivered"
    /message to\s+<?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>?\s+couldn['']t be delivered/i,
    // "couldn't deliver to xxx@domain.com"
    /couldn['']t deliver to\s+<?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>?/i,
    // Standard: "To: xxx@domain.com"
    /(?:To|Recipient|Address):\s*<?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>?/i,
    // "delivery to xxx@domain.com failed"
    /delivery to\s+<?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>?\s+(?:failed|unsuccessful)/i,
    // Fallback: any email in angle brackets
    /<([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>/,
    // Fallback: any email pattern
    /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/,
  ];

  for (const pattern of emailPatterns) {
    const match = body.match(pattern);
    if (match) {
      recipientEmail = match[1].toLowerCase();
      console.log(`Found recipient email using pattern: ${pattern} -> ${recipientEmail}`);
      break;
    }
  }

  // Extract bounce reason - Office 365 specific patterns
  const reasonPatterns = [
    // Office 365: "xxx wasn't found at domain.com"
    /([a-zA-Z0-9._%+-]+)\s+wasn['']t found at\s+([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    // "The email address couldn't be found"
    /(The email address couldn['']t be found[^.]*)/i,
    // "mailbox unavailable"
    /(mailbox\s+(?:unavailable|not found|full|disabled)[^.]*)/i,
    // "user unknown"
    /(user\s+(?:unknown|doesn['']t exist|not found)[^.]*)/i,
    // Error codes
    /(?:Remote Server returned|Diagnostic information).*?['"]?(\d{3}\s+\d\.\d\.\d+[^'"]*?)['"]?(?:\s|$)/i,
    /(550\s+\d\.\d\.\d+[^\n]*)/i,
    // General failure
    /(address rejected[^.]*)/i,
    /(permanent failure[^.]*)/i,
    /(Unknown To address[^.]*)/i,
  ];

  for (const pattern of reasonPatterns) {
    const match = body.match(pattern);
    if (match) {
      reason = match[0].trim().substring(0, 500);
      console.log(`Found bounce reason: ${reason}`);
      break;
    }
  }

  if (!reason && (subject.toLowerCase().includes('undeliverable') || subject.toLowerCase().includes('failure') || subject.toLowerCase().includes('delivery status'))) {
    reason = 'Email could not be delivered';
  }

  return { recipientEmail, reason, originalSubject };
}

async function checkBounceForEmail(
  supabase: any,
  accessToken: string,
  senderEmail: string,
  recipientEmail: string,
  emailHistoryId: string,
  sentAt: string
): Promise<boolean> {
  try {
    // Search for NDR messages in the sender's mailbox
    // Use a simpler filter to avoid OData syntax issues
    const searchDate = new Date(new Date(sentAt).getTime() - 60000).toISOString(); // 1 min before send
    
    // Simplified filter - just get recent messages and filter in code
    const searchUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderEmail)}/messages?$filter=receivedDateTime ge ${searchDate}&$select=id,subject,body,from,receivedDateTime&$top=100&$orderby=receivedDateTime desc`;

    console.log(`Checking bounces for ${recipientEmail} from ${senderEmail}...`);

    const messagesResponse = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!messagesResponse.ok) {
      const errorText = await messagesResponse.text();
      console.error(`Failed to fetch messages for ${senderEmail}: ${messagesResponse.status} - ${errorText}`);
      
      // If 403, log that we need Mail.Read application permission
      if (messagesResponse.status === 403) {
        console.error("PERMISSION ERROR: The Azure app needs 'Mail.Read' APPLICATION permission (not delegated) in Azure AD > App registrations > API permissions. Also ensure admin consent is granted.");
      }
      
      return false;
    }

    const messagesData = await messagesResponse.json();
    const allMessages = messagesData.value || [];
    
    // Filter for NDR messages in code (since OData filter was causing issues)
    const ndrKeywords = ['undeliverable', 'delivery status', 'delivery failed', 'delivery failure', 'non-delivery', 'returned mail', 'mail delivery'];
    const ndrSenders = ['postmaster', 'mailer-daemon', 'microsoft outlook'];
    
    const ndrMessages = allMessages.filter((msg: any) => {
      const subject = (msg.subject || '').toLowerCase();
      const fromAddress = (msg.from?.emailAddress?.address || '').toLowerCase();
      const fromName = (msg.from?.emailAddress?.name || '').toLowerCase();
      
      const isNDRSubject = ndrKeywords.some(keyword => subject.includes(keyword));
      const isNDRSender = ndrSenders.some(sender => fromAddress.includes(sender) || fromName.includes(sender));
      
      return isNDRSubject || isNDRSender;
    });

    console.log(`Found ${allMessages.length} messages, ${ndrMessages.length} are NDRs for ${senderEmail}`);

    for (const ndr of ndrMessages) {
      const fromInfo = ndr.from?.emailAddress?.address || 'unknown';
      console.log(`Checking NDR: "${ndr.subject}" from ${fromInfo}`);
      
      const bodyContent = ndr.body?.content || '';
      const { recipientEmail: ndrRecipient, reason } = parseNDRContent(
        ndr.subject || '',
        bodyContent
      );

      console.log(`Parsed NDR - recipient: ${ndrRecipient}, looking for: ${recipientEmail}`);

      // Check if this NDR is for our target recipient
      if (ndrRecipient && ndrRecipient.toLowerCase() === recipientEmail.toLowerCase()) {
        console.log(`✅ MATCH! Found bounce for ${recipientEmail}: ${reason}`);
        
        // Update the email history record
        const { error } = await supabase
          .from('email_history')
          .update({
            status: 'bounced',
            bounce_type: 'hard',
            bounce_reason: reason || 'Email delivery failed',
            bounced_at: ndr.receivedDateTime || new Date().toISOString(),
            open_count: 0,
            unique_opens: 0,
            opened_at: null,
            is_valid_open: false,
          })
          .eq('id', emailHistoryId);

        if (error) {
          console.error(`Failed to update email ${emailHistoryId}:`, error);
        } else {
          console.log(`Successfully marked email ${emailHistoryId} as bounced`);
        }
        
        return true;
      }
    }

    console.log(`No bounce found for ${recipientEmail}`);
    return false;
  } catch (error) {
    console.error(`Error checking bounce for ${recipientEmail}:`, error);
    return false;
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log("=".repeat(50));
  console.log("Starting bounce check process...");
  console.log("=".repeat(50));

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let accessToken: string;
    try {
      accessToken = await getAccessToken();
      console.log("Successfully obtained Azure access token");
    } catch (tokenError) {
      console.error("Failed to get access token:", tokenError);
      return new Response(JSON.stringify({ 
        success: false, 
        error: "Azure authentication failed",
        details: tokenError instanceof Error ? tokenError.message : "Unknown error",
        hint: "Ensure AZURE_EMAIL_TENANT_ID, AZURE_EMAIL_CLIENT_ID, and AZURE_EMAIL_CLIENT_SECRET are set correctly"
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Process pending bounce checks (queued after email sends)
    const { data: pendingChecks, error: pendingError } = await supabase
      .from('pending_bounce_checks')
      .select(`
        id,
        email_history_id,
        sender_email,
        recipient_email,
        check_after,
        email_history:email_history_id (
          id,
          sent_at,
          status
        )
      `)
      .eq('checked', false)
      .lte('check_after', new Date().toISOString())
      .limit(50);

    if (pendingError) {
      console.error("Error fetching pending checks:", pendingError);
    }

    let pendingBouncesFound = 0;
    const processedIds: string[] = [];

    if (pendingChecks && pendingChecks.length > 0) {
      console.log(`Processing ${pendingChecks.length} pending bounce checks...`);

      for (const check of pendingChecks) {
        // Skip if email is already bounced
        const emailHistory = check.email_history as any;
        if (!emailHistory || emailHistory.status === 'bounced') {
          console.log(`Skipping ${check.recipient_email} - already processed or not found`);
          processedIds.push(check.id);
          continue;
        }

        console.log(`Checking pending bounce for: ${check.recipient_email}`);
        
        const bounced = await checkBounceForEmail(
          supabase,
          accessToken,
          check.sender_email,
          check.recipient_email,
          check.email_history_id,
          emailHistory.sent_at
        );

        if (bounced) {
          pendingBouncesFound++;
        }

        processedIds.push(check.id);
      }

      // Mark all processed checks as complete
      if (processedIds.length > 0) {
        await supabase
          .from('pending_bounce_checks')
          .update({ 
            checked: true,
            check_result: pendingBouncesFound > 0 ? 'bounced' : 'ok'
          })
          .in('id', processedIds);
      }
    } else {
      console.log("No pending bounce checks to process");
    }

    // 2. Also run general sync for recent emails (last 24 hours to catch delayed bounces)
    console.log("-".repeat(50));
    console.log("Running general bounce sync for recent emails...");
    
    const sinceHours = 24; // Extended to 24 hours
    const sinceDate = new Date(Date.now() - sinceHours * 60 * 60 * 1000).toISOString();
    
    // Get unique sender emails from recent, non-bounced emails
    const { data: recentEmails } = await supabase
      .from('email_history')
      .select('sender_email, recipient_email, id, sent_at')
      .gte('sent_at', sinceDate)
      .not('status', 'eq', 'bounced')
      .order('sent_at', { ascending: false })
      .limit(100);

    let generalBouncesFound = 0;

    if (recentEmails && recentEmails.length > 0) {
      console.log(`Found ${recentEmails.length} recent emails to check for bounces`);
      
      const senderEmails = [...new Set(recentEmails.map(e => e.sender_email))];
      console.log(`Unique senders to check: ${senderEmails.join(', ')}`);
      
      for (const senderEmail of senderEmails) {
        const senderRecentEmails = recentEmails.filter(e => e.sender_email === senderEmail);
        console.log(`Checking ${senderRecentEmails.length} emails for sender ${senderEmail}`);
        
        for (const email of senderRecentEmails) {
          const bounced = await checkBounceForEmail(
            supabase,
            accessToken,
            senderEmail,
            email.recipient_email,
            email.id,
            email.sent_at
          );

          if (bounced) {
            generalBouncesFound++;
          }
        }
      }
    } else {
      console.log("No recent emails to check");
    }

    // 3. Clean up old pending checks (older than 7 days)
    await supabase
      .from('pending_bounce_checks')
      .delete()
      .lt('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    const totalBouncesFound = pendingBouncesFound + generalBouncesFound;
    const processingTime = Date.now() - startTime;

    console.log("=".repeat(50));
    console.log(`Bounce check complete in ${processingTime}ms. Found ${totalBouncesFound} bounce(s).`);
    console.log("=".repeat(50));

    return new Response(JSON.stringify({
      success: true,
      pendingChecksProcessed: processedIds.length,
      pendingBouncesFound,
      generalBouncesFound,
      totalBouncesFound,
      processingTimeMs: processingTime,
      message: totalBouncesFound > 0 
        ? `Found and marked ${totalBouncesFound} bounced email(s)` 
        : 'No new bounces detected',
      hint: totalBouncesFound === 0 
        ? "If bounces exist but weren't detected, ensure the Azure app has 'Mail.Read' APPLICATION permission with admin consent"
        : undefined
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("Error processing bounces:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      error: errorMessage,
      success: false
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
