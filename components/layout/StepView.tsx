'use client';

import { useAppStore } from '@/store/useAppStore';
import Step1Create from '@/components/steps/Step1Create';
import Step2Select from '@/components/steps/Step2Select';
import Step3Expand from '@/components/steps/Step3Expand';
import Step4Compose from '@/components/steps/Step4Compose';
import Step5Publish from '@/components/steps/Step5Publish';

export default function StepView() {
  const { currentStep } = useAppStore();

  return (
    <div className="h-full w-full overflow-y-auto">
      {currentStep === 1 && <Step1Create />}
      {currentStep === 2 && <Step2Select />}
      {currentStep === 3 && <Step3Expand />}
      {currentStep === 4 && <Step4Compose />}
      {currentStep === 5 && <Step5Publish />}
    </div>
  );
}
