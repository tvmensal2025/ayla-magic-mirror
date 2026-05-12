import React, { createContext, useContext, useState, useCallback } from "react";

interface PrivacyModeContextType {
  privacyMode: boolean;
  togglePrivacy: () => void;
}

const PrivacyModeContext = createContext<PrivacyModeContextType>({
  privacyMode: false,
  togglePrivacy: () => {},
});

export const usePrivacyMode = () => useContext(PrivacyModeContext);

export function PrivacyModeProvider({ children }: { children: React.ReactNode }) {
  const [privacyMode, setPrivacyMode] = useState(false);
  const togglePrivacy = useCallback(() => setPrivacyMode((p) => !p), []);

  return (
    <PrivacyModeContext.Provider value={{ privacyMode, togglePrivacy }}>
      <div className={privacyMode ? "privacy-mode" : ""}>
        {children}
      </div>
    </PrivacyModeContext.Provider>
  );
}
