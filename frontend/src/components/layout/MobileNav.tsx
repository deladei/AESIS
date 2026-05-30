import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Menu, X, LogOut, GraduationCap } from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

interface MobileNavProps {
  items: NavItem[];
  /** Per-shell active predicate so shared-href items don't all light up. */
  isActive: (item: NavItem) => boolean;
  user: { name: string; email: string; initials: string };
  /** Shown under the user's name; falls back to their email. */
  roleLabel?: string;
  /** Tagline under the AESIS brand in the drawer header. */
  brandSubtitle?: string;
  unreadCount?: number;
  onLogout: () => void;
}

/**
 * Mobile navigation drawer. The desktop sidebars are `hidden md:flex`, so on
 * phones this is the only way to move between screens. Rendered via a portal to
 * document.body: the topbars use `backdrop-blur`, which creates a containing
 * block that would otherwise trap a `fixed` overlay inside the header.
 */
export function MobileNav({
  items,
  isActive,
  user,
  roleLabel,
  brandSubtitle = 'AI-Powered Supervision',
  unreadCount = 0,
  onLogout,
}: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  // Close when the route changes (e.g. tapping a nav item).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // While open: Escape closes, and the body scroll is locked.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full p-2 text-[#464652] transition-colors hover:bg-[#dce9ff] md:hidden"
        aria-label="Open navigation menu"
        aria-expanded={open}
        aria-controls="mobile-nav-drawer"
      >
        <Menu className="h-6 w-6" />
      </button>

      {createPortal(
        <div
          className={cn('fixed inset-0 z-[60] md:hidden', !open && 'pointer-events-none')}
          aria-hidden={!open}
        >
          {/* Backdrop */}
          <div
            onClick={() => setOpen(false)}
            className={cn(
              'absolute inset-0 bg-[#0b1c30]/40 backdrop-blur-sm transition-opacity duration-300',
              open ? 'opacity-100' : 'opacity-0',
            )}
          />

          {/* Panel */}
          <div
            id="mobile-nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className={cn(
              'absolute inset-y-0 left-0 flex w-[280px] max-w-[85%] flex-col bg-[#eff4ff] shadow-2xl transition-transform duration-300 ease-out',
              open ? 'translate-x-0' : '-translate-x-full',
            )}
          >
            {/* Brand + close */}
            <div className="flex items-center justify-between px-5 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#15157d]">
                  <GraduationCap className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold leading-tight text-[#15157d]">AESIS</h2>
                  <p className="text-[11px] font-semibold text-[#464652]">{brandSubtitle}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full p-2 text-[#464652] transition-colors hover:bg-[#dce9ff]"
                aria-label="Close navigation menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Nav */}
            <nav className="flex-1 overflow-y-auto px-2">
              {items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item);
                const showBadge = item.href.includes('notification') && unreadCount > 0;
                return (
                  <Link
                    key={item.label}
                    to={item.href}
                    className={cn(
                      'mx-2 my-1 flex items-center gap-3 rounded-lg px-4 py-3 transition-colors duration-200',
                      active
                        ? 'bg-[#8a4cfc] font-semibold text-white shadow-sm shadow-[#8a4cfc]/30'
                        : 'text-[#464652] hover:bg-[#dce9ff] hover:text-[#15157d]',
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="text-sm">{item.label}</span>
                    {showBadge && (
                      <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-[#15157d] px-1.5 text-[11px] font-semibold text-white">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* User + sign out */}
            <div className="border-t border-[#c7c5d4]/30 p-3">
              <div className="flex items-center gap-3 px-2 py-2">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e1e0ff] text-xs font-semibold text-[#15157d]">
                  {user.initials}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[#0b1c30]">{user.name}</p>
                  <p className="truncate text-xs text-[#464652]">{roleLabel ?? user.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onLogout()}
                className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#464652] transition-colors hover:bg-[#ffdad6] hover:text-[#ba1a1a]"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
