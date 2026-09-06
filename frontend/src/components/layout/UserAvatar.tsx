import { cn } from '@/lib/utils';

// Shared user avatar used across every role shell + the account menus. Renders
// the uploaded profile picture when present, else the initials fallback circle.
// Defaults (size + colours) match the original initials chips so it's a drop-in.
export function UserAvatar({
  avatarUrl,
  initials,
  name,
  sizeClass = 'h-9 w-9',
  shrink = false,
  className,
}: {
  avatarUrl?: string | null;
  initials: string;
  name?: string;
  sizeClass?: string;
  shrink?: boolean;
  className?: string;
}) {
  const base = cn(sizeClass, shrink && 'shrink-0', 'rounded-full', className);

  if (avatarUrl) {
    return <img src={avatarUrl} alt={name ?? initials} className={cn(base, 'object-cover')} />;
  }

  return (
    <span
      className={cn(
        base,
        'flex items-center justify-center bg-brand-soft text-xs font-semibold text-brand-ink',
      )}
    >
      {initials}
    </span>
  );
}
