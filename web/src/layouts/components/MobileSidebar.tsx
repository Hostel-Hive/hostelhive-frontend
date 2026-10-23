import { useEffect, useRef, useState } from 'react';
import AppSidebar from './AppSidebar';
import Button from '../../shared/components/ui/Button';
import useAuth from '../../features/auth/hooks/useAuth';

export default function MobileSidebar() {
  const { signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  function closeMenu() {
    setIsOpen(false);
    toggleRef.current?.focus();
  }

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsOpen(false);
        toggleRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <div className="mobile-navigation">
      <Button
        variant="secondary"
        ref={toggleRef}
        type="button"
        className="menu-toggle"
        aria-expanded={isOpen}
        aria-controls="mobile-sidebar"
        aria-label={isOpen ? 'Close navigation' : 'Open navigation'}
        title={isOpen ? 'Close navigation' : 'Open navigation'}
        onClick={() => setIsOpen(!isOpen)}
      >
        <svg
          aria-hidden="true"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        >
          <path
            d={isOpen ? 'm6 6 12 12 M6 18 18 6' : 'M4 6h16 M4 12h16 M4 18h16'}
          />
        </svg>
      </Button>
      <div id="mobile-sidebar" className="mobile-sidebar" hidden={!isOpen}>
        <AppSidebar label="Mobile navigation" onNavigate={closeMenu} />
        <div className="mobile-sidebar-footer">
          <Button variant="secondary" onClick={() => void signOut()}>
            Sign out
          </Button>
          <Button
            variant="secondary"
            type="button"
            className="menu-close"
            onClick={closeMenu}
          >
            Close menu
          </Button>
        </div>
      </div>
    </div>
  );
}
