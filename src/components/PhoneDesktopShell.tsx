/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';

const MIN_PHONE_WIDTH = 300;
const MAX_PHONE_WIDTH = 520;
const DESKTOP_MODE_RATIO = 1.35;

interface PhoneFrameMetrics {
  width: number;
  height: number;
  scale: number;
}

function estimatePhoneWidth(): number | null {
  const candidates = [window.screen?.width ?? 0, window.outerWidth ?? 0].filter(
    (value) => value >= MIN_PHONE_WIDTH && value <= MAX_PHONE_WIDTH
  );

  if (candidates.length > 0) {
    return Math.round(Math.min(...candidates));
  }

  const visualScale = window.visualViewport?.scale ?? 1;
  if (visualScale > 0.1 && visualScale < 0.8) {
    const estimate = Math.round(window.innerWidth * visualScale);
    if (estimate >= MIN_PHONE_WIDTH && estimate <= MAX_PHONE_WIDTH) return estimate;
  }

  return null;
}

function isDesktopSiteOnPhone(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.self !== window.top) return false;

  const hasTouch =
    navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;
  if (!hasTouch) return false;

  const phoneWidth = estimatePhoneWidth();
  if (!phoneWidth) return false;

  return window.innerWidth >= phoneWidth * DESKTOP_MODE_RATIO;
}

function readFrameMetrics(): PhoneFrameMetrics {
  const width = estimatePhoneWidth() ?? 390;
  const scale = Math.max(1, window.innerWidth / width);
  const height = Math.max(480, Math.round(window.innerHeight / scale));
  return { width, height, scale };
}

export const PhoneDesktopShell: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [desktopModePhone, setDesktopModePhone] = useState<boolean>(isDesktopSiteOnPhone);

  useEffect(() => {
    const update = () => setDesktopModePhone(isDesktopSiteOnPhone());
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  if (!desktopModePhone) return <>{children}</>;

  return <PhoneFrame />;
};

const PhoneFrame: React.FC = () => {
  const [metrics, setMetrics] = useState<PhoneFrameMetrics>(readFrameMetrics);

  useEffect(() => {
    const update = () => setMetrics(readFrameMetrics());
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  const iframeSrc = useMemo(() => window.location.href, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        backgroundColor: '#f5fafd',
        overscrollBehavior: 'none',
      }}
    >
      <div
        style={{
          width: `${metrics.width}px`,
          height: `${metrics.height}px`,
          transform: `scale(${metrics.scale})`,
          transformOrigin: 'top left',
        }}
      >
        <iframe
          title="TanAW AccessMap"
          src={iframeSrc}
          allow="geolocation; clipboard-write"
          style={{ display: 'block', width: '100%', height: '100%', border: 0 }}
        />
      </div>
    </div>
  );
};
