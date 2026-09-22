import * as React from "react";

/**
 * Detects if the user is on a mobile or tablet device based on user agent.
 * This is used to block access to the exam on non-desktop devices.
 */
export function useUserAgent() {
  const [isMobile, setIsMobile] = React.useState(false);
  const [isTablet, setIsTablet] = React.useState(false);
  const [isDesktop, setIsDesktop] = React.useState(true);

  React.useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();

    // Mobile detection
    const mobileRegex =
      /android|webos|iphone|ipod|blackberry|iemobile|opera mini|mobile|mobiles|phone/i;
    const isMobileDevice =
      mobileRegex.test(ua) || (ua.includes("android") && !ua.includes("mobile"));

    // Tablet detection
    const tabletRegex = /ipad|tablet|playbook|silk|kindle|android(?!.*mobile)/i;
    const isTabletDevice =
      tabletRegex.test(ua) || (ua.includes("android") && !ua.includes("mobile"));

    // Consider both mobile and tablet as non-desktop
    const isNonDesktop = isMobileDevice || isTabletDevice;

    setIsMobile(isMobileDevice);
    setIsTablet(isTabletDevice);
    setIsDesktop(!isNonDesktop);
  }, []);

  return { isMobile, isTablet, isDesktop };
}
