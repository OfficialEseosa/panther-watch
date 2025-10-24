import { useState, useEffect, useRef } from 'react';
import Icon from '../Icon';
import './Tutorial.css';

function Tutorial({ steps, onComplete, onSkip }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const [spotlightPosition, setSpotlightPosition] = useState({ top: 0, left: 0, width: 0, height: 0 });
  const [isVisible, setIsVisible] = useState(false);
  const tooltipRef = useRef(null);

  // Delay showing tutorial to let page render first
  useEffect(() => {
    const showTimer = setTimeout(() => {
      setIsVisible(true);
    }, 300);
    return () => clearTimeout(showTimer);
  }, []);

  useEffect(() => {
    if (steps.length === 0) return;

    const updatePositions = () => {
      const step = steps[currentStep];
      const targetElement = document.querySelector(step.target);

      if (targetElement) {
        const rect = targetElement.getBoundingClientRect();
        
        // Set spotlight position
        setSpotlightPosition({
          top: rect.top - 8,
          left: rect.left - 8,
          width: rect.width + 16,
          height: rect.height + 16,
        });

        // Calculate tooltip position
        const tooltipRect = tooltipRef.current?.getBoundingClientRect();
        if (tooltipRect) {
          let top, left;
          const spacing = 20;

          switch (step.position || 'bottom') {
            case 'top':
              top = rect.top - tooltipRect.height - spacing;
              left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
              break;
            case 'bottom':
              top = rect.bottom + spacing;
              left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
              break;
            case 'left':
              top = rect.top + (rect.height / 2) - (tooltipRect.height / 2);
              left = rect.left - tooltipRect.width - spacing;
              break;
            case 'right':
              top = rect.top + (rect.height / 2) - (tooltipRect.height / 2);
              left = rect.right + spacing;
              break;
            default:
              top = rect.bottom + spacing;
              left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
          }

          // Keep tooltip within viewport
          const padding = 20;
          top = Math.max(padding, Math.min(top, window.innerHeight - tooltipRect.height - padding));
          left = Math.max(padding, Math.min(left, window.innerWidth - tooltipRect.width - padding));

          setTooltipPosition({ top, left });
        }
      }
    };

    // Initial position update with a delay to ensure DOM is ready
    const timer = setTimeout(updatePositions, 100);

    // Update on resize and scroll
    window.addEventListener('resize', updatePositions);
    window.addEventListener('scroll', updatePositions, true);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updatePositions);
      window.removeEventListener('scroll', updatePositions, true);
    };
  }, [currentStep, steps]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    onSkip();
  };

  if (steps.length === 0 || currentStep >= steps.length) return null;
  if (!isVisible) return null;

  const step = steps[currentStep];

  return (
    <>
      <div className="tutorial-overlay tutorial-fade-in" />
      
      <div
        className="tutorial-spotlight tutorial-fade-in"
        style={{
          top: `${spotlightPosition.top}px`,
          left: `${spotlightPosition.left}px`,
          width: `${spotlightPosition.width}px`,
          height: `${spotlightPosition.height}px`,
        }}
      />

      <div
        ref={tooltipRef}
        className="tutorial-tooltip"
        data-position={step.position || 'bottom'}
        style={{
          top: `${tooltipPosition.top}px`,
          left: `${tooltipPosition.left}px`,
        }}
      >
        <div className="tutorial-tooltip-header">
          <span className="tutorial-step-counter">
            Step {currentStep + 1} of {steps.length}
          </span>
          <button
            className="tutorial-close-btn"
            onClick={handleSkip}
            aria-label="Close tutorial"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        <h3 className="tutorial-tooltip-title">{step.title}</h3>
        <p className="tutorial-tooltip-description">{step.description}</p>

        <div className="tutorial-tooltip-footer">
          <div className="tutorial-progress">
            {steps.map((_, index) => (
              <div
                key={index}
                className={`tutorial-progress-dot ${index === currentStep ? 'active' : ''}`}
              />
            ))}
          </div>

          <div className="tutorial-actions">
            {currentStep === 0 ? (
              <button className="tutorial-btn tutorial-btn-skip" onClick={handleSkip}>
                Skip tutorial
              </button>
            ) : (
              <button className="tutorial-btn tutorial-btn-prev" onClick={handlePrev}>
                <Icon name="chevron-back" size={16} />
                Back
              </button>
            )}

            {currentStep === steps.length - 1 ? (
              <button className="tutorial-btn tutorial-btn-finish" onClick={handleNext}>
                Get started
                <Icon name="checkmark" size={16} />
              </button>
            ) : (
              <button className="tutorial-btn tutorial-btn-next" onClick={handleNext}>
                Next
                <Icon name="chevron-forward" size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default Tutorial;
