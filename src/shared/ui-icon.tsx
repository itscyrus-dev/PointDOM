import type { SVGProps } from 'react';
import names from './icon-names.json' with { type: 'json' };

type UiIconProps = Omit<SVGProps<SVGSVGElement>, 'children' | 'dangerouslySetInnerHTML'> & {
  name: keyof typeof names;
};

/** Offline sprite: pinned Gravity UI icons and the Lucide Languages icon. */
export function UiIcon({ name, className = '', ...props }: UiIconProps) {
  return (
    <svg
      {...props}
      className={`ui-icon ${className}`}
      width="20"
      height="20"
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
    >
      <use href={`gravity.svg#${name}`} width="20" height="20" />
    </svg>
  );
}
