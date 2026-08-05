import React, { createContext, useContext, useState, useEffect } from 'react';
import { isPremiumUnlocked, purchasePremium, restorePurchases } from '../utils/nativeServices';

const PREMIUM_CACHE_KEY = 'retrofoot_2026_premium_cache';

interface PremiumContextValue {
  isPremium: boolean;
  loading: boolean;
  purchase: () => Promise<boolean>;
  restore: () => Promise<boolean>;
}

const PremiumContext = createContext<PremiumContextValue | null>(null);

export const PremiumProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isPremium, setIsPremium] = useState(() => localStorage.getItem(PREMIUM_CACHE_KEY) === 'true');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    isPremiumUnlocked().then(unlocked => {
      setIsPremium(unlocked);
      localStorage.setItem(PREMIUM_CACHE_KEY, String(unlocked));
      setLoading(false);
    });
  }, []);

  const purchase = async () => {
    const purchased = await purchasePremium();
    if (purchased) {
      setIsPremium(true);
      localStorage.setItem(PREMIUM_CACHE_KEY, 'true');
    }
    return purchased;
  };

  const restore = async () => {
    const restored = await restorePurchases();
    if (restored) {
      setIsPremium(true);
      localStorage.setItem(PREMIUM_CACHE_KEY, 'true');
    }
    return restored;
  };

  return (
    <PremiumContext.Provider value={{ isPremium, loading, purchase, restore }}>
      {children}
    </PremiumContext.Provider>
  );
};

export const usePremium = (): PremiumContextValue => {
  const ctx = useContext(PremiumContext);
  if (!ctx) throw new Error('usePremium must be used within a PremiumProvider');
  return ctx;
};
