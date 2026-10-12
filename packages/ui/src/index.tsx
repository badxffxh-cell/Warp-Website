import type { ButtonHTMLAttributes, SVGProps } from 'react';
export function WarpMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" {...props}>
      <path d="M3 11h7l4 16 5-13h6l-7 19h-8L3 11Z" fill="currentColor" />
      <path d="m22 7 5 17 5-13h7L30 33h-7L16 7h6Z" fill="currentColor" />
    </svg>
  );
}
export function Button({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`button ${className}`} {...props} />;
}
