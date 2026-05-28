"use client";

import { useEffect, useState } from "react";

import styles from "./install-prompt.module.css";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12" />
      <path d="M7 11l5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16V4" />
      <path d="M8 8l4-4 4 4" />
      <path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" />
    </svg>
  );
}

function PlusSquareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M12 9v6M9 12h6" />
    </svg>
  );
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Register the service worker (required for installability).
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    if (standalone) {
      return; // already installed — nothing to show
    }

    const ua = window.navigator.userAgent.toLowerCase();
    const ios = /iphone|ipad|ipod/.test(ua);
    // iPadOS reports as Mac — detect touch Macs too.
    const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;

    if (ios || iPadOS) {
      setIsIos(true);
      setVisible(true);
    }

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      setVisible(true);
    };

    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!visible) {
    return null;
  }

  const handleClick = async () => {
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") {
        setVisible(false);
      }
      setDeferred(null);
      return;
    }
    if (isIos) {
      setShowIosHint(true);
    }
  };

  return (
    <>
      <button type="button" className={styles.button} onClick={handleClick} aria-label="Додати на головний екран">
        <DownloadIcon />
        Додати на екран
      </button>

      {showIosHint ? (
        <div className={styles.overlay} onClick={() => setShowIosHint(false)}>
          <div className={styles.sheet} onClick={(event) => event.stopPropagation()}>
            <p className={styles.sheetTitle}>Додати на головний екран</p>
            <div className={styles.sheetStep}>
              <ShareIcon />
              <span>Натисніть кнопку «Поділитися» у панелі браузера.</span>
            </div>
            <div className={styles.sheetStep}>
              <PlusSquareIcon />
              <span>Оберіть «На початковий екран» (Add to Home Screen).</span>
            </div>
            <button type="button" className={styles.sheetClose} onClick={() => setShowIosHint(false)}>
              Зрозуміло
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
