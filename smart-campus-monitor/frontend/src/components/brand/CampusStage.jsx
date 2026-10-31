import { Component, Suspense, lazy, useMemo } from 'react';
import { useInView, useIsCompact, useReducedMotion } from '../../hooks/useMotion';
import ArchitectureFlow from './ArchitectureFlow';

const CampusScene3D = lazy(() => import('./CampusScene3D'));

const webglAvailable = () => {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch (_error) {
    return false;
  }
};

class SceneBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * 3D campus on capable desktops; the 2D architecture diagram on phones, without WebGL,
 * or if the scene fails. The render loop stops while the stage is off-screen.
 */
export default function CampusStage({ focus = 'overview', status, className = '', allowCompact = false }) {
  const [ref, inView] = useInView({ threshold: 0.05 });
  const reduced = useReducedMotion();
  const compact = useIsCompact();
  const canRender = useMemo(() => (typeof window !== 'undefined' ? webglAvailable() : false), []);
  const fallback = (
    <div className="flex h-full items-center justify-center p-4">
      <ArchitectureFlow status={status} className="w-full max-w-3xl" />
    </div>
  );
  const use3D = canRender && (!compact || allowCompact);
  return (
    <div ref={ref} className={`relative ${className}`}>
      {use3D ? (
        <SceneBoundary fallback={fallback}>
          <Suspense fallback={<div className="h-full w-full animate-pulse bg-ink-900" />}>
            <CampusScene3D focus={focus} status={status} active={inView} reduced={reduced} className="h-full w-full" />
          </Suspense>
        </SceneBoundary>
      ) : (
        fallback
      )}
    </div>
  );
}
