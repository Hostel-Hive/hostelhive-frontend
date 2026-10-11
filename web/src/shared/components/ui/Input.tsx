import type { ComponentPropsWithRef } from 'react';

export default function Input({
  className = '',
  type = 'text',
  ...props
}: ComponentPropsWithRef<'input'>) {
  return (
    <input {...props} type={type} className={`ui-input ${className}`.trim()} />
  );
}
