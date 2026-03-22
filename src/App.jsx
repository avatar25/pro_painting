import { useRef, useState } from 'react';
import UkiyoLandscape, { PAINTING_LABELS } from './components/UkiyoLandscape';

function App() {
  const landscapeRef = useRef(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [overlayIntensity, setOverlayIntensity] = useState(0.65);

  return (
    <main className="app-shell">
      <section className="page-header">
        <div className="title-block">
          <p className="eyebrow">Ukiyo-e Gallery</p>
          <h1>浮世絵 — Paintings of the Floating World</h1>
          <p className="description">
            Three hand-painted ukiyo-e landscapes, gently panned and layered with
            subtle woodblock-print textures and floating dust motes.
          </p>
        </div>

        <button
          className="regenerate-button"
          type="button"
          onClick={() => landscapeRef.current?.next()}
        >
          Next Painting →
        </button>
      </section>

      <section className="control-panel">
        <div className="field painting-info">
          <span>Current painting</span>
          <strong className="painting-title">{PAINTING_LABELS[currentIndex]}</strong>
        </div>

        <label className="field">
          <span>Overlay intensity</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={overlayIntensity}
            onChange={(e) => setOverlayIntensity(Number(e.target.value))}
          />
          <strong>{Math.round(overlayIntensity * 100)}%</strong>
        </label>

        <div className="field painting-nav">
          <span>Gallery</span>
          <div className="dot-nav">
            {PAINTING_LABELS.map((label, i) => (
              <button
                key={i}
                className={`dot ${i === currentIndex ? 'dot-active' : ''}`}
                title={label}
                onClick={() => landscapeRef.current?.goTo(i)}
                aria-label={`Go to ${label}`}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="canvas-card">
        <UkiyoLandscape
          ref={landscapeRef}
          height={620}
          scrollSpeed={22}
          panoramaScale={2.2}
          overlayIntensity={overlayIntensity}
          onIndexChange={setCurrentIndex}
        />
      </section>
    </main>
  );
}

export default App;
