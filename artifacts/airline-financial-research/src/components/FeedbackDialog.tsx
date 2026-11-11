import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLocation } from 'wouter';
import { CheckCircle2, Loader2, AlertTriangle, Lock } from 'lucide-react';
import { useSubmitFeedback } from '@workspace/api-client-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

export const OPEN_FEEDBACK_EVENT = 'ae:open-feedback';
const MAX = 5000;

const SECTIONS = [
  { value: 'financials', label: 'Airline Financials', path: '/' },
  { value: 'statements', label: 'Financial Statements', path: '/statements' },
  { value: 'ratios', label: 'Financial Ratios & KPIs', path: '/ratios' },
  { value: 'analytics', label: 'Airline Financial Analytics', path: '/analytics' },
  { value: 'aviation-finance', label: 'Aviation Finance', path: '/aviation-finance' },
] as const;
type Section = (typeof SECTIONS)[number]['value'];

const schema = z.object({
  section: z.enum(['financials', 'statements', 'ratios', 'analytics', 'aviation-finance']),
  message: z
    .string()
    .refine((v) => v.trim().length > 0, 'Write a message before sending.')
    .refine((v) => v.length <= MAX, `Keep the message within ${MAX} characters.`),
});
type Values = z.infer<typeof schema>;

function sectionForPath(path: string): Section {
  return SECTIONS.find((s) => s.path === path)?.value ?? 'financials';
}

export function openFeedback() {
  window.dispatchEvent(new Event(OPEN_FEEDBACK_EVENT));
}

export default function FeedbackDialog() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [receipt, setReceipt] = useState<{ id: string; createdAt: string } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const submit = useSubmitFeedback({ mutation: { retry: false } });
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { section: sectionForPath(location), message: '' },
  });

  useEffect(() => {
    const handler = () => {
      setReceipt(null);
      setFailure(null);
      // Default to current page unless a draft is already in progress.
      if (!form.getValues('message').trim()) form.setValue('section', sectionForPath(location));
      setOpen(true);
    };
    window.addEventListener(OPEN_FEEDBACK_EVENT, handler);
    return () => window.removeEventListener(OPEN_FEEDBACK_EVENT, handler);
  }, [form, location]);

  const onSubmit = async (values: Values) => {
    setFailure(null);
    try {
      const r = await submit.mutateAsync({ data: { section: values.section, message: values.message.trim() } });
      setReceipt(r);
      form.reset({ section: values.section, message: '' });
    } catch (err) {
      const data = (err as { data?: { error?: string } })?.data;
      setFailure(data?.error ?? 'Your feedback was not saved. Your draft is kept; please try again.');
    }
  };

  const message = form.watch('message');
  const pending = submit.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!pending) setOpen(o); }}>
      <DialogContent className="feedback-dialog" data-testid="dialog-feedback"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          document.querySelector<HTMLButtonElement>('[data-testid="button-open-feedback"]')?.focus();
        }}>
        <DialogHeader>
          <span className="eyebrow">Private feedback</span>
          <DialogTitle className="feedback-title">Tell us what to fix or improve</DialogTitle>
          <DialogDescription className="feedback-desc">
            Stored privately for the AE+ Finance team. No contact details are collected.
          </DialogDescription>
        </DialogHeader>

        {receipt ? (
          <div className="feedback-success" role="status" data-testid="status-feedback-saved">
            <CheckCircle2 size={22} />
            <div>
              <strong>Feedback saved</strong>
              <p>Reference <code>{receipt.id.slice(0, 8)}</code> · {new Date(receipt.createdAt).toLocaleString()}</p>
            </div>
            <button type="button" className="feedback-secondary" onClick={() => setOpen(false)} data-testid="button-feedback-done">Done</button>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="feedback-form" noValidate>
              <FormField control={form.control} name="section" render={({ field }) => (
                <FormItem className="feedback-field">
                  <FormLabel>Section</FormLabel>
                  <FormControl>
                    <select {...field} disabled={pending} className="feedback-select" data-testid="select-feedback-section">
                      {SECTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="message" render={({ field }) => (
                <FormItem className="feedback-field">
                  <div className="feedback-label-row">
                    <FormLabel>Message</FormLabel>
                    <span className={`feedback-count ${message.length > MAX ? 'over' : ''}`} aria-live="polite" data-testid="text-feedback-count">
                      {message.length.toLocaleString()} / {MAX.toLocaleString()}
                    </span>
                  </div>
                  <FormControl>
                    <textarea {...field} rows={7} maxLength={MAX} disabled={pending} className="feedback-textarea"
                      placeholder="A figure that looks off, a missing source link, a ratio you need..." data-testid="input-feedback-message" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              {failure && (
                <div className="feedback-error" role="alert" data-testid="status-feedback-error">
                  <AlertTriangle size={15} /><span>{failure}</span>
                </div>
              )}
              <div className="feedback-actions">
                <span className="feedback-private"><Lock size={12} /> Not publicly visible</span>
                <button type="button" className="feedback-secondary" onClick={() => setOpen(false)} disabled={pending} data-testid="button-feedback-cancel">Cancel</button>
                <button type="submit" className="feedback-primary" disabled={pending} data-testid="button-feedback-submit">
                  {pending ? <><Loader2 size={14} className="spin" /> Saving</> : failure ? 'Try again' : 'Send feedback'}
                </button>
              </div>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
