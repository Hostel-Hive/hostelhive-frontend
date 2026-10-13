import { useEffect, useRef, useState } from 'react';
import AppSidebar from './AppSidebar';
import Button from '../../shared/components/ui/Button';

export default function MobileSidebar() {
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
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? 'Close navigation' : 'Open navigation'}
      </Button>
      <div id="mobile-sidebar" className="mobile-sidebar" hidden={!isOpen}>
        <AppSidebar label="Mobile navigation" onNavigate={closeMenu} />
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
  );
}
