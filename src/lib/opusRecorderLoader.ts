// Loader robusto para opus-recorder.
// Carrega o UMD via <script> tag (garante que `window.Recorder` é o constructor),
// evitando os problemas de interop CJS/ESM do Vite com o pacote npm.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OpusRecorderClass = any;

let loadPromise: Promise<OpusRecorderClass> | null = null;

export function loadOpusRecorder(): Promise<OpusRecorderClass> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    // Já carregado em algum momento?
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = (window as any).Recorder;
    if (typeof existing === "function") {
      resolve(existing);
      return;
    }

    const script = document.createElement("script");
    script.src = "/opus/recorder.min.js";
    script.async = true;
    script.onload = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const R = (window as any).Recorder;
      if (typeof R === "function") {
        resolve(R);
      } else {
        reject(new Error("opus-recorder carregou mas window.Recorder não é função"));
      }
    };
    script.onerror = () => reject(new Error("Falha ao baixar /opus/recorder.min.js"));
    document.head.appendChild(script);
  });

  // Se falhar, permite tentar de novo na próxima chamada
  loadPromise.catch(() => { loadPromise = null; });

  return loadPromise;
}
