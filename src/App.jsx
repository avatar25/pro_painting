import { useRef, useState } from 'react';
import UkiyoLandscape from './components/UkiyoLandscape';

function App() {
  const landscapeRef = useRef(null);
  const [mountainLayers, setMountainLayers] = useState(5);
  const [fogDensity, setFogDensity] = useState(0.58);
  const [baseColor, setBaseColor] = useState('#6b7a5f');

  return (
    <main className="app-shell">
      <section className="page-header">
        <div className="title-block">
          <p className="eyebrow">Procedural Ukiyo-e Canvas</p>
          <h1>Scrolling Landscape Generator</h1>
          <p className="description">
            The scene now renders as a wider hidden panorama and gently pans across it, so each seed feels more like a
            drifting painted screen than a still postcard.
          </p>
        </div>

        <button className="regenerate-button" type="button" onClick={() => landscapeRef.current?.regenerate()}>
          Regenerate
        </button>
      </section>

      <section className="control-panel">
        <label className="field">
          <span>Mountain layers</span>
          <input
            type="range"
            min="4"
            max="5"
            step="1"
            value={mountainLayers}
            onChange={(event) => setMountainLayers(Number(event.target.value))}
          />
          <strong>{mountainLayers}</strong>
        </label>

        <label className="field">
          <span>Fog density</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={fogDensity}
            onChange={(event) => setFogDensity(Number(event.target.value))}
          />
          <strong>{fogDensity.toFixed(2)}</strong>
        </label>

        <label className="field field-color">
          <span>Base color</span>
          <input type="color" value={baseColor} onChange={(event) => setBaseColor(event.target.value)} />
          <strong>{baseColor}</strong>
        </label>
      </section>

      <section className="canvas-card">
        <UkiyoLandscape
          ref={landscapeRef}
          mountainLayers={mountainLayers}
          baseColor={baseColor}
          fogDensity={fogDensity}
          height={620}
          scrollSpeed={26}
          panoramaScale={2.35}
        />
      </section>
    </main>
  );
}

export default App;
