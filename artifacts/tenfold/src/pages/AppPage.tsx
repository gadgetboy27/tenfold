import React, { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'wouter';
import TopBar from '@/components/layout/TopBar';
import LeftRail from '@/components/layout/LeftRail';
import RightPanel from '@/components/layout/RightPanel';
import FloatingPromptBar from '@/components/layout/FloatingPromptBar';
import Step1Create from '@/components/steps/Step1Create';
import Step2Select from '@/components/steps/Step2Select';
import Step3Expand from '@/components/steps/Step3Expand';
import Step4Compose from '@/components/steps/Step4Compose';
import Step5Publish from '@/components/steps/Step5Publish';
import { useAppStore } from '@/store/useAppStore';
import { AnimatePresence, motion } from 'framer-motion';

export default function AppPage() {
  const { session, isDevBypass, loading } = useAuth();
  const [, setLocation] = useLocation();
  const { currentStep } = useAppStore();

  useEffect(() => {
    if (!loading && !session && !isDevBypass) {
      setLocation('/login');
    }
  }, [session, isDevBypass, loading, setLocation]);

  if (loading) {
    return <div className="min-h-screen bg-[#0A0A0A]" />;
  }

  if (!session && !isDevBypass) return null;

  const renderStep = () => {
    switch (currentStep) {
      case 1: return <Step1Create />;
      case 2: return <Step2Select />;
      case 3: return <Step3Expand />;
      case 4: return <Step4Compose />;
      case 5: return <Step5Publish />;
      default: return <Step1Create />;
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#0A0A0A] text-[#F0F0F0]">
      <TopBar />

      <div className="flex flex-1 overflow-hidden">
        <LeftRail />

        <main className="flex-1 relative overflow-hidden" style={{ background: '#0A0A0A' }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 overflow-y-auto overflow-x-hidden p-6"
            >
              {renderStep()}
            </motion.div>
          </AnimatePresence>

          {/* Floating prompt bar — only on step 1 */}
          {currentStep === 1 && <FloatingPromptBar />}
        </main>

        <RightPanel />
      </div>
    </div>
  );
}
