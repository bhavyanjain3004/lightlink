import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUpRight, Camera, Check, ChevronRight, CircleOff, Github, Menu, Play, ScanLine, Sparkles, Upload, WifiOff, X } from "lucide-react";
import "./App.css";
import { VisualSender } from "./engine/visual/sender";
import { VisualReceiver } from "./engine/visual/receiver";

const modes = ["send", "receive", "metrics"];
const steps = [
  { number: "01", title: "Encode", copy: "Your file becomes a resilient stream of tiny chunks.", stat: "fountain codes", icon: <Sparkles /> },
  { number: "02", title: "Display", copy: "Chunks flash across your screen as visual codes.", stat: "~30 fps", icon: <ScanLine /> },
  { number: "03", title: "Capture", copy: "A nearby camera reads every flicker, even off-angle.", stat: "camera only", icon: <Camera /> },
  { number: "04", title: "ML Decode", copy: "On-device intelligence clears blur, glare and noise.", stat: "on-device", icon: <Sparkles /> },
];

function Pattern({ compact = false }) {
  const cells = useMemo(() => Array.from({ length: compact ? 64 : 144 }, (_, i) => i), [compact]);
  return <div className={`light-pattern ${compact ? "pattern-compact" : ""}`} aria-label="Animated visual data pattern" data-testid="light-pattern">
    {cells.map((cell) => <i key={cell} className={cell % 7 === 0 || cell % 11 === 0 ? "lit" : ""} />)}
    <span className="pattern-scan" />
  </div>;
}

function Phone({ receiver = false }) {
  return <div className={`phone ${receiver ? "phone-receiver" : ""}`}>
    <div className="phone-speaker" />
    <div className="phone-screen">
      {receiver ? <><div className="viewfinder"><span /><span /><span /><span /><Camera size={27} /></div><div className="camera-readout"><span className="pulse-dot" /> scanning light…</div></> : <><div className="screen-label">SENDING FILE</div><Pattern compact /><div className="screen-file"><span>◌</span> sunset-notes.pdf</div></>}
    </div>
  </div>;
}

function App() {
  const [mode, setMode] = useState("send");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [fileName, setFileName] = useState("sunset-notes.pdf");
  const [realFile, setRealFile] = useState(null);
  const [progress, setProgress] = useState(68);
  const [devMode, setDevMode] = useState(false);
  const demoRef = useRef(null);

  // Engine Refs and State
  const senderCanvasRef = useRef(null);
  const receiverVideoRef = useRef(null);

  useEffect(() => {
    // Override console to show on screen
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    
    const logToScreen = (msg) => {
      const debugDiv = document.getElementById("debug-console");
      if (debugDiv) {
        if (debugDiv.innerText === "Waiting for logs...") debugDiv.innerText = "";
        debugDiv.innerText += msg + "\n";
        debugDiv.scrollTop = debugDiv.scrollHeight;
      }
    };

    console.log = (...args) => {
      originalLog(...args);
      if (args[0] && typeof args[0] === 'string' && args[0].includes('[LightLink]')) {
         logToScreen(args.join(' '));
      }
    };
    console.warn = (...args) => {
      originalWarn(...args);
      if (args[0] && typeof args[0] === 'string' && args[0].includes('[LightLink]')) {
         logToScreen("⚠️ " + args.join(' '));
      }
    };
    console.error = (...args) => {
      originalError(...args);
      if (args[0] && typeof args[0] === 'string' && args[0].includes('[LightLink]')) {
         logToScreen("❌ " + args.join(' '));
      }
    };

    return () => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    };
  }, []);

  const [senderStats, setSenderStats] = useState({ symbolsSent: 0, bytesSent: 0 });
  const [receiverStats, setReceiverStats] = useState({ progress: 0, received: 0, redundant: 0 });
  const [receiveSuccess, setReceiveSuccess] = useState(false);
  const [receivedFile, setReceivedFile] = useState(null);

  // Simulation timer
  useEffect(() => {
    if (!devMode) return;
    const timer = setInterval(() => setProgress((value) => value >= 96 ? 42 : value + 1), 1800);
    return () => clearInterval(timer);
  }, [devMode]);

  // Real Sender Engine
  useEffect(() => {
    if (devMode || mode !== "send" || !realFile || !senderCanvasRef.current) return;
    
    const sender = new VisualSender(senderCanvasRef.current, realFile);
    sender.onStatsUpdate = setSenderStats;
    sender.start();
    
    return () => sender.stop();
  }, [mode, realFile, devMode]);

  // Real Receiver Engine
  useEffect(() => {
    if (devMode || mode !== "receive" || !receiverVideoRef.current) return;
    
    setReceiveSuccess(false);
    setReceivedFile(null);
    const receiver = new VisualReceiver(receiverVideoRef.current);
    receiver.onStatsUpdate = setReceiverStats;
    receiver.onComplete = (file) => {
      setReceiveSuccess(true);
      setReceivedFile(file);
    };
    receiver.start();
    
    return () => receiver.stop();
  }, [mode, devMode]);

  const selectMode = (nextMode) => { setMode(nextMode); setTimeout(() => demoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 40); };
  const scrollTo = (id) => { setMobileOpen(false); document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }); };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      setFileName(file.name);
      setRealFile(file);
    }
  };

  const handleSaveFile = () => {
    if (!receivedFile) return;
    const url = URL.createObjectURL(receivedFile);
    const a = document.createElement("a");
    a.href = url;
    a.download = receivedFile.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  return <main className="site-shell" data-testid="lightlink-app">
    <section className="hero" id="top">
      <nav className="nav container" data-testid="main-navigation">
        <button className="brand" onClick={() => scrollTo("top")} data-testid="brand-home-button"><span className="brand-mark" onDoubleClick={() => setDevMode(!devMode)}>✦</span> LightLink<span className="brand-dot">.</span></button>
        <div className={`nav-links ${mobileOpen ? "nav-open" : ""}`}>
          <button onClick={() => scrollTo("demo")} data-testid="nav-demo-link">Demo</button>
          <button onClick={() => scrollTo("how-it-works")} data-testid="nav-how-it-works-link">How it works</button>
          <button onClick={() => scrollTo("tech")} data-testid="nav-tech-link">Tech</button>
          <a href="https://github.com" target="_blank" rel="noreferrer" data-testid="nav-github-link">GitHub <ArrowUpRight size={13} /></a>
        </div>
        <button className="menu-button" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle menu" data-testid="mobile-menu-button">{mobileOpen ? <X /> : <Menu />}</button>
      </nav>
      <div className="hero-content container">
        <div className="hero-copy">
          <p className="eyebrow"><span className="eyebrow-star">✳</span> A NEW KIND OF CONNECTION {devMode && "(DEV MODE)"}</p>
          <h1>Send files with <em>nothing</em> but light.</h1>
          <p className="hero-subhead">No WiFi. No Bluetooth. No pairing. Just point a camera at a screen.</p>
          <div className="hero-actions"><button className="pill pill-dark" onClick={() => selectMode("send")} data-testid="hero-live-demo-button"><Play size={15} fill="currentColor" /> Try live demo</button><button className="pill pill-outline" onClick={() => scrollTo("how-it-works")} data-testid="hero-how-it-works-button">How it works <ChevronRight size={15} /></button></div>
          <div className="hero-proof"><span className="proof-icons"><WifiOff size={15} /><CircleOff size={15} /></span><span>offline by design</span><span className="proof-divider" /><span>100% client-side</span></div>
        </div>
        <div className="hero-visual" data-testid="hero-visual">
          <span className="doodle ray ray-one">✳</span><span className="doodle ray ray-two">✦</span><span className="doodle arc">◌</span>
          <div className="hero-phones"><Phone /><div className="light-beam" /><Phone receiver /></div>
          <div className="hero-bubble"><span>signal found</span><strong>98.6%</strong><small>confidence</small></div>
          <div className="visual-caption"><span className="pulse-dot" /> two phones, one bright idea</div>
        </div>
      </div>
      <div className="wave wave-light" />
    </section>

    <div className="marquee" data-testid="offline-marquee"><div className="marquee-track">OFFLINE <b>✦</b> RADIO-FREE <b>✦</b> NO PAIRING <b>✦</b> ON-DEVICE ML <b>✦</b> WORKS IOS ↔ ANDROID <b>✦</b> OFFLINE <b>✦</b> RADIO-FREE <b>✦</b> NO PAIRING <b>✦</b> ON-DEVICE ML <b>✦</b></div></div>

    <section className="section how-section" id="how-it-works" data-testid="how-it-works-section">
      <div className="container"><div className="section-heading"><p className="eyebrow"><span className="eyebrow-star">✳</span> HOW IT WORKS</p><h2>Four tiny steps.<br /><em>One big shortcut.</em></h2><p>A clever little dance between a screen and a camera — no radio waves invited.</p></div>
        <div className="steps-grid">{steps.map((step, index) => <article className="step-card" key={step.title} data-testid={`step-card-${step.title.toLowerCase().replace(" ", "-")}`}><div className={`step-blob blob-${index + 1}`}><span className="step-number">{step.number}</span><div className="step-icon">{step.icon}</div><span className="orbit-dot" /></div><h3>{step.title}</h3><p>{step.copy}</p><span className="step-stat">{step.stat}</span></article>)}</div>
        <button className="pill pill-coral architecture-button" onClick={() => scrollTo("tech")} data-testid="architecture-button">See the architecture <ArrowUpRight size={15} /></button>
      </div>
    </section>

    <section className="demo-section" id="demo" ref={demoRef} data-testid="demo-section"><div className="wave wave-dark" /><div className="container demo-inner"><div className="section-heading demo-heading"><p className="eyebrow"><span className="eyebrow-star">✳</span> LIVE DEMO</p><h2>Watch the light<br /><em>do the talking.</em></h2><p>Pick a mode and peek behind the magic. It’s all happening right here in your browser.</p></div>
      <div className="mode-tabs" role="tablist" data-testid="mode-tabs">{modes.map((item) => <button key={item} role="tab" aria-selected={mode === item} className={mode === item ? "active" : ""} onClick={() => setMode(item)} data-testid={`${item}-mode-tab`}><span>{item === "send" ? "↑" : item === "receive" ? "↓" : "⌁"}</span>{item}</button>)}</div>
      <div className="demo-card" data-testid={`${mode}-demo-panel`}>
        {mode === "send" && <div className="demo-panel send-panel">
          <div className="drop-zone">
            <div className="drop-icon"><Upload size={22} /></div>
            <h3>Drop a file to send</h3>
            <p>Small files work best today — up to 10 MB.</p>
            <label className="file-label" htmlFor="file-upload" data-testid="file-upload-label">Choose a file<input id="file-upload" type="file" onChange={handleFileChange} data-testid="file-upload-input" /></label>
            <span className="selected-file" data-testid="selected-file-name"><Check size={13} /> {fileName}</span>
          </div>
          <div className="pattern-stage">
            <div className="stage-top"><span>EMITTING CHUNKS</span><strong>{devMode ? progress : Math.floor(senderStats.bytesSent / 1024)} KB</strong></div>
            {(!devMode && realFile) ? <canvas ref={senderCanvasRef} width={400} height={400} style={{ margin: "14px auto", display: "block", borderRadius: "12px", maxWidth: "100%" }} /> : <Pattern />}
            <div className="stage-meta"><span><b>{realFile ? (realFile.size/1024).toFixed(1) : "1.8"} KB</b> file size</span><span><b>~10 fps</b> frame rate</span></div>
          </div>
        </div>}
        
        {mode === "receive" && <div className="demo-panel receive-panel">
          <div className="receive-visual">
            <div className="camera-frame">
              {devMode ? (
                <div className="viewfinder large"><span /><span /><span /><span /><ScanLine size={32} /></div>
              ) : (
                <div className="viewfinder large" style={{ overflow: "hidden" }}>
                  <span /><span /><span /><span />
                  <video ref={receiverVideoRef} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
              )}
              <div className="confidence-badge"><span className="pulse-dot" /> 94.2% <small>high confidence</small></div>
            </div>
            
            {/* ON-SCREEN DEBUG CONSOLE */}
            <div style={{
              background: '#111', 
              color: '#0f0', 
              fontFamily: 'monospace', 
              fontSize: '10px', 
              padding: '8px', 
              margin: '10px', 
              borderRadius: '8px',
              height: '120px',
              overflowY: 'auto',
              textAlign: 'left'
            }} id="debug-console">
              Waiting for logs...
            </div>

            <p className="camera-note"><Camera size={15} /> camera viewfinder {devMode && "· simulated"}</p>
          </div>
          <div className="receive-status">
            <span className="status-kicker">RECONSTRUCTING FILE</span>
            <h3>Reading the flicker<span className="loading-dots">...</span></h3>
            <p>ML is weighing each frame and filling in the gaps.</p>
            <div className="progress-label"><span>checksum progress</span><b>{devMode ? "82" : Math.floor(receiverStats.progress * 100)}%</b></div>
            <div className="progress-bar"><span style={{ width: `${devMode ? 82 : receiverStats.progress * 100}%` }} /></div>
            {(receiveSuccess || devMode) && <div className="success-state">
              <span><Check size={17} /></span>
              <div><strong>Decoded ✓</strong><small>checksum verified · ready to save</small></div>
              {!devMode && receivedFile && <button onClick={handleSaveFile} style={{ marginLeft: "auto", padding: "6px 12px", background: "#fff", color: "#000", border: "none", borderRadius: "16px", fontWeight: "bold", cursor: "pointer", fontSize: "12px" }}>Save File</button>}
            </div>}
          </div>
        </div>}
        
        {mode === "metrics" && <div className="demo-panel metrics-panel"><div className="metrics-intro"><span className="status-kicker">FIELD NOTES / 004</span><h3>When the world<br /><em>isn’t perfect.</em></h3><p>ML-assisted decoding keeps a clear head when light, angle and shaky hands get in the way.</p></div><div className="chart" data-testid="metrics-chart">{[["Good light", 96, 98], ["Low light", 96, 96], ["Blur", 34, 51], ["Angle", 97, 99]].map(([label, plain, ml]) => <div className="chart-row" key={label}><span>{label}</span><div className="bars"><i style={{ height: `${plain}%` }} /><i style={{ height: `${ml}%` }} /></div><b>{ml}%</b></div>)}<div className="chart-legend"><span><i /> plain QR</span><span><i /> ML-assisted</span></div></div></div>}
      </div>
      <p className="demo-footnote">✦ {devMode ? "This is a friendly simulation — real camera + ML wiring is next." : "Real engine active! Double-click the logo to enter Simulation Mode."}</p>
    </div></section>

    <section className="section tech-section" id="tech" data-testid="tech-section"><div className="container tech-inner"><div className="tech-copy"><p className="eyebrow"><span className="eyebrow-star">✳</span> UNDER THE HOOD</p><h2>Built for the<br /><em>quiet moments.</em></h2><p>No accounts. No servers. No mysterious cloud in the middle. LightLink keeps your file on your devices, where it belongs.</p></div><div className="tech-tags" data-testid="tech-tags"><span>React PWA</span><span>TensorFlow.js / ONNX</span><span>Fountain codes</span><span>WebRTC-free</span><span>100% client-side</span><span>iOS ↔ Android</span><span className="tag-doodle">✳</span></div></div></section>
    <footer className="footer"><div className="wave wave-footer" /><div className="container footer-content"><button className="brand footer-brand" onClick={() => scrollTo("top")} data-testid="footer-brand-button"><span className="brand-mark" onDoubleClick={() => setDevMode(!devMode)}>✦</span> LightLink<span className="brand-dot">.</span></button><p>Light as a data channel.<br /><span>Best for small files today — bigger transfers are on the roadmap.</span></p><a className="footer-github" href="https://github.com" target="_blank" rel="noreferrer" data-testid="footer-github-link"><Github size={17} /> GitHub <ArrowUpRight size={14} /></a></div></footer>
    <div className="mobile-mode-bar">{modes.map((item) => <button key={item} className={mode === item ? "active" : ""} onClick={() => selectMode(item)} data-testid={`mobile-${item}-mode-button`}>{item}</button>)}</div>
  </main>;
}

export default App;
