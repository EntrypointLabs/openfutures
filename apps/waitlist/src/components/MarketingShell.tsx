import { useEffect, useState } from "react";
import { Link } from "react-router";
import { LogoMark } from "@openfutures/ui";
import { MarketingFooter } from "./MarketingFooter";
import type { ReactNode } from "react";

export const websiteUrl = (
  import.meta.env.VITE_WEBSITE_URL ||
  (import.meta.env.DEV ? "http://127.0.0.1:5174" : "https://openfutures.xyz")
).replace(/\/$/, "");

export function MarketingShell({ children, toast }: { children: ReactNode; toast: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, []);
  return (
    <>
      <a href="#waitlist-main" className="wl-skip">
        Skip to content
      </a>
      {menuOpen && (
        <button
          className="wl-menu-backdrop"
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <div className="wl-marketing-menu">
        <button
          className="wl-menu-toggle"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="wl-menu"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <span aria-hidden="true">{menuOpen ? "×" : "☰"}</span> Menu
        </button>
        <nav id="wl-menu" aria-label="Main navigation" hidden={!menuOpen}>
          {[
            ["Home", websiteUrl + "/"],
            ["Contact", websiteUrl + "/contact"],
            ["Terms", websiteUrl + "/terms-and-conditions"],
            ["Privacy", websiteUrl + "/privacy-policy"],
          ].map(([label, url], i) => (
            <a key={label} href={url}>
              <span>-- 00{i + 1}.</span>
              {label}
            </a>
          ))}
          <Link to="/" aria-current="page" onClick={() => setMenuOpen(false)}>
            <span>-- 005.</span>Waitlist
          </Link>
        </nav>
      </div>
      <header className="wl-header">
        <a className="wl-home" href={websiteUrl} aria-label="OpenFutures home">
          <span className="wl-brand-mark">
            <LogoMark />
          </span>
          <span>OpenFutures</span>
        </a>
        <span className="wl-preview">
          <i className="wl-dot" />
          Early access
        </span>
      </header>
      {children}
      <MarketingFooter />
      <div className="wl-toast" role="status" hidden={!toast}>
        {toast}
      </div>
    </>
  );
}
