/**
 * FileStatusBadge — renders a file's CurrentStatus as a labelled, colour-coded
 * badge (Epic 2, Story 1; project-brief §11 status colour mapping).
 *
 * Colour is always paired with the status text label (NFR1 / §11 — colour is
 * never used alone). The colour family comes from fileStatusBadge()'s semantic
 * variant, mapped here to the status-* design tokens (globals.css) via Tailwind
 * utilities — no hex literals live in this component (styling-centralisation).
 */

import { Badge } from '@/components/ui/badge';
import {
  fileStatusBadge,
  type StatusBadgeVariant,
} from '@/lib/file-logs/mapping';
import { cn } from '@/lib/utils';

/** Maps a semantic status variant to its token-backed badge surface classes. */
const VARIANT_CLASSES: Record<StatusBadgeVariant, string> = {
  success: 'bg-status-success text-status-success-foreground',
  error: 'bg-status-error text-status-error-foreground',
  info: 'bg-status-info text-status-info-foreground',
  neutral: 'bg-status-neutral text-status-neutral-foreground',
};

export function FileStatusBadge({ status }: { status: string }) {
  const { label, variant } = fileStatusBadge(status);
  return (
    <Badge className={cn('border-transparent', VARIANT_CLASSES[variant])}>
      {label}
    </Badge>
  );
}
