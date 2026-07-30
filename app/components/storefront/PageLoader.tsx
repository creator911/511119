"use client";

import { useEffect } from "react";
import styles from "./PageLoader.module.css";

export function PageLoader() {
  useEffect(() => {
    const root = document.documentElement;
    const finish = () => root.classList.add("kiel-page-loaded");
    if (document.readyState === "complete") {
      window.requestAnimationFrame(finish);
      return;
    }
    window.addEventListener("load", finish, { once: true });
    return () => window.removeEventListener("load", finish);
  }, []);

  return (
    <div className={styles.loaderWrap} aria-hidden="true">
      <div className={styles.loader} />
      <div className={styles.loaderSectionLeft} />
      <div className={styles.loaderSectionRight} />
    </div>
  );
}
