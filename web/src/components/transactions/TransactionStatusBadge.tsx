/**
 * TransactionStatusBadge — renders a transaction's Status as a labelled,
 * colour-coded badge (Epic 3, Story 1; project-brief §11 status colour mapping).
 *
 * A thin wrapper over the shared §11 mapping: it derives the label + semantic
 * variant via transactionStatusBadge (which delegates to the same fileStatusBadge
 * core the File Logs surface uses) and maps the variant to the status-* design
 * tokens (globals.css) via Tailwind utilities — no hex literals live here
 * (styling-centralisation). Colour is always paired with the status text label
 * (NFR1 / §11 — colour is never used alone).
 */

import { Badge } from '@/components/ui/badge';
import {
  transactionStatusBadge,
  type StatusBadgeVariant,
} from '@/lib/transactions/mapping';
import { cn } from '@/lib/utils';

/** Maps a semantic status variant to its token-backed badge surface classes. */
const VARIANT_CLASSES: Record<StatusBadgeVariant, string> = {
  success: 'bg-status-success text-status-success-foreground',
  error: 'bg-status-error text-status-error-foreground',
  info: 'bg-status-info text-status-info-foreground',
  neutral: 'bg-status-neutral text-status-neutral-foreground',
};

export function TransactionStatusBadge({ status }: { status: string }) {
  const { label, variant } = transactionStatusBadge(status);
  return (
    <Badge className={cn('border-transparent', VARIANT_CLASSES[variant])}>
      {label}
    </Badge>
  );
}
