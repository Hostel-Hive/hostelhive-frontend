import type { ComponentPropsWithRef } from 'react';

type ButtonProps = ComponentPropsWithRef<'button'> & {
  variant?: 'primary' | 'accent' | 'secondary' | 'ghost' | 'warm' | 'danger';
  size?: 'sm' | 'md' | 'lg';
};

export default function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={`ui-button ui-button--${variant} ui-button--${size} ${className}`.trim()}
    />
  );
}
