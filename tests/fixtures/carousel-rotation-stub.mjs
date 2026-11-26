// Static-render harnesses never run effects, so the shared rotation hook is reported as stopped
// and reduced motion as on (its server snapshot), which also hides the pause toggle.
export const rotationStub = { reducedMotionQuery: '(prefers-reduced-motion: reduce)', useCarouselRotation: () => false};
