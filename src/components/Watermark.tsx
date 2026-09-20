import React from "react";

export function Watermark() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none select-none z-10 overflow-hidden"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='360' height='240' viewBox='0 0 360 240'%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dominant-baseline='middle' fill='%23000000' fill-opacity='0.05' font-family='Space Grotesk, Inter, Arial, sans-serif' font-weight='700' font-size='26' transform='rotate(-25 180 120)' letter-spacing='4'%3EDEVNEST%3C/text%3E%3C/svg%3E")`,
        backgroundRepeat: "repeat",
      }}
    />
  );
}

export default Watermark;
