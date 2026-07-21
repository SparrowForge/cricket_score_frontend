'use client';

import { useState } from 'react';

/**
 * Icons for the three fielding-error commentary tags.
 *
 * Each icon first tries to load a file from `public/icons/`. Drop your own
 * artwork in at the filename below and it is picked up automatically — no code
 * change needed. If the file is absent, an inline placeholder SVG renders
 * instead so the badge is never empty.
 *
 *   public/icons/dropped-catch.png
 *   public/icons/run-out-missed.png
 *   public/icons/misfield.png
 *
 * SVG or PNG both work — change ICON_EXT below to match what you dropped in.
 * Dropped-in files are rendered through a CSS mask by default, so a plain
 * black glyph (on a transparent background) takes the badge's colour instead
 * of staying black on gold. Pass `tint={false}` for a multi-colour icon shown
 * as-authored.
 *
 * Third-party icon sets (Flaticon, Noun Project, Icons8, …) are licensed
 * artwork: download them through your own account and follow the attribution
 * terms of your plan. Nothing here bundles their files.
 */

// File extension for the drop-in icons in public/icons/. Change to 'svg' if
// you swap the PNGs for SVGs.
const ICON_EXT = 'png';

type IconProps = { size?: number; className?: string; tint?: boolean };

const svgAttrs = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
});

/**
 * Renders `/icons/{name}.svg` when present, else the supplied fallback.
 *
 * A hidden <img> probes for the file — it is the only reliable "does this
 * exist" signal in the browser (a CSS mask fails silently). Once it loads we
 * swap to a masked span painted with currentColor; the mask resolves straight
 * from cache, so there is no second request and no flash.
 */
function FileIcon(
  { name, size, className, tint = true, fallback }:
  Required<Pick<IconProps, 'size'>> & IconProps & { name: string; fallback: React.ReactNode },
) {
  const [status, setStatus] = useState<'probing' | 'ok' | 'missing'>('probing');
  const url = `/icons/${name}.${ICON_EXT}`;

  if (status === 'missing') return <>{fallback}</>;

  const probe = (
    <img
      src={url}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      onLoad={() => setStatus('ok')}
      onError={() => setStatus('missing')}
      className={status === 'ok' && tint ? undefined : className}
      style={
        status === 'ok' && tint
          ? { display: 'none' }
          : { width: size, height: size, objectFit: 'contain' }
      }
    />
  );

  if (status !== 'ok' || !tint) return probe;

  return (
    <>
      {probe}
      <span
        aria-hidden="true"
        className={className}
        style={{
          display: 'inline-block',
          width: size,
          height: size,
          backgroundColor: 'currentColor',
          WebkitMaskImage: `url(${url})`,
          maskImage: `url(${url})`,
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
          maskPosition: 'center',
          WebkitMaskSize: 'contain',
          maskSize: 'contain',
        }}
      />
    </>
  );
}

/** Ball falling away from two cupped hands that failed to hold it. */
export function DroppedCatchIcon({ size = 14, className, tint }: IconProps) {
  return (
    <FileIcon
      name="dropped-catch"
      size={size}
      className={className}
      tint={tint}
      fallback={
        <svg {...svgAttrs(size)} className={className}>
          <circle cx="12" cy="5" r="2.5" fill="currentColor" stroke="none" />
          <path d="M12 9.5v2.5" opacity="0.55" />
          <path d="M4 15c0 4 3.6 6.5 8 6.5s8-2.5 8-6.5" />
          <path d="M4 15l1.5-3M20 15l-1.5-3" />
        </svg>
      }
    />
  );
}

/** Ball beating the stumps — the run-out chance that went begging. */
export function RunOutMissedIcon({ size = 14, className, tint }: IconProps) {
  return (
    <FileIcon
      name="run-out-missed"
      size={size}
      className={className}
      tint={tint}
      fallback={
        <svg {...svgAttrs(size)} className={className}>
          <path d="M8 7v13M12 7v13M16 7v13" />
          <path d="M7 6.5h10" />
          <circle cx="20" cy="12" r="2.2" fill="currentColor" stroke="none" />
          <path d="M3.5 12h2.5" opacity="0.55" />
        </svg>
      }
    />
  );
}

/** Ball squirming past a fielder's hands. */
export function MisfieldIcon({ size = 14, className, tint }: IconProps) {
  return (
    <FileIcon
      name="misfield"
      size={size}
      className={className}
      tint={tint}
      fallback={
        <svg {...svgAttrs(size)} className={className}>
          <path d="M6 20c0-3.5 2.2-6 5-6" />
          <path d="M6 20h6" />
          <circle cx="17" cy="8" r="2.5" fill="currentColor" stroke="none" />
          <path d="M11.5 13.5l3.5-3.5" opacity="0.55" />
          <path d="M19.5 4.5l1.5-1.5M21 8h1.5" opacity="0.55" />
        </svg>
      }
    />
  );
}
