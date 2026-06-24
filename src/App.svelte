<script lang="ts">
  import FourTrack from "$lib/components/FourTrack.svelte"
  import { onMount } from "svelte"

  let saveFn: (() => Promise<Blob>) | undefined = $state()
  let loadFn: ((source: File | string) => Promise<void>) | undefined = $state()
  let status = $state("idle")
  let meta = $state({ artist: "", title: "", comment: "" })
  let engine = $state<any>(null)
  
  let isEmbedded = $state(false)
  let fileInput: HTMLInputElement | null = $state(null)
  let isExporting = $state(false)

  onMount(() => {
    isEmbedded = window.self !== window.top;
    
    if (isEmbedded) {
      // Query host for user info to auto-fill artist
      window.parent.postMessage({ type: 'tunecamp:request', action: 'getUser' }, '*');
    }

    const handleResponse = (event: MessageEvent) => {
      if (event.data?.type === 'tunecamp:response') {
        const { action, payload } = event.data;
        if (action === 'getUser' && payload) {
          meta.artist = payload.username || "";
        } else if (action === 'exportAudio') {
          isExporting = false;
          if (payload?.success) {
            alert('Stereo mix exported to your TuneCamp library!');
          } else {
            alert('Failed to export to TuneCamp: ' + (payload?.error || 'Unknown error'));
          }
        }
      }
    };

    window.addEventListener('message', handleResponse);
    return () => window.removeEventListener('message', handleResponse);
  })

  // Triggers downloading the project (.4trk) file
  async function handleSaveProject() {
    if (!saveFn) return;
    try {
      const blob = await saveFn();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${meta.title || "project"}.4trk`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert("Error saving project: " + err.message);
    }
  }

  // Triggers file selector to load project
  function triggerLoadProject() {
    fileInput?.click();
  }

  // Handles loading the selected file
  async function handleFileChange(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file && loadFn) {
      try {
        await loadFn(file);
      } catch (err: any) {
        alert("Error loading project: " + err.message);
      }
    }
  }

  // Exports the master mix to WAV, downloading it and/or sending to TuneCamp
  async function handleExportMix() {
    if (!engine) return;
    isExporting = true;
    try {
      const wavBlob = await engine.exportMixdown();
      
      // 1. Download locally
      const url = URL.createObjectURL(wavBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${meta.artist || "Artist"} - ${meta.title || "Mix"}.wav`;
      a.click();
      URL.revokeObjectURL(url);

      // 2. If embedded in TuneCamp, also export to the library!
      if (isEmbedded) {
        window.parent.postMessage({
          type: 'tunecamp:request',
          action: 'exportAudio',
          payload: {
            blob: wavBlob,
            filename: `${meta.artist || "Artist"} - ${meta.title || "Mix"}.wav`,
            mimeType: 'audio/wav'
          }
        }, '*');
      } else {
        isExporting = false;
      }
    } catch (err: any) {
      isExporting = false;
      alert("Error exporting mix: " + err.message);
    }
  }
</script>

<div class="app-container">
  <!-- Toolbar -->
  <header class="toolbar">
    <div class="toolbar-brand">
      <span class="retro-tag">4-TRACK RECORDER</span>
      {#if isEmbedded}
        <span class="badge embedded">TUNECAMP MODE</span>
      {/if}
    </div>
    
    <div class="toolbar-fields">
      <input 
        type="text" 
        placeholder="Song Title" 
        bind:value={meta.title} 
        class="toolbar-input"
      />
      <input 
        type="text" 
        placeholder="Artist Name" 
        bind:value={meta.artist} 
        class="toolbar-input"
        disabled={isEmbedded} 
      />
    </div>

    <div class="toolbar-actions">
      <input 
        type="file" 
        accept=".4trk" 
        bind:this={fileInput} 
        onchange={handleFileChange} 
        style="display: none;" 
      />
      
      <button class="toolbar-btn secondary" onclick={triggerLoadProject}>
        Open Project
      </button>
      
      <button class="toolbar-btn secondary" onclick={handleSaveProject} disabled={status === "loading"}>
        Save Project
      </button>

      <button class="toolbar-btn primary" onclick={handleExportMix} disabled={isExporting}>
        {isExporting ? "Exporting..." : "Export Mix"}
      </button>
    </div>
  </header>

  <div class="align">
    <FourTrack 
      bind:save={saveFn} 
      bind:load={loadFn} 
      bind:status={status} 
      bind:meta={meta}
      onready={(detail) => engine = detail.engine}
    />
  </div>
</div>

<style>
  :global(*) {
    box-sizing: border-box;
    outline: none;
    -webkit-user-select: none;
    user-select: none;
  }

  :global(html) {
    overflow: hidden;
    position: fixed;
    width: 100%;
    height: 100%;
    overscroll-behavior: none;
  }

  :global(body) {
    font-family: system-ui, sans-serif;
    margin: 0;
    min-height: 100dvh;
    background: radial-gradient(ellipse at top left, #f2f5f7, #b2b6bc);
    overflow: hidden;
    overscroll-behavior: none;
    touch-action: none;
    height: 100%;
    padding: env(safe-area-inset-top) env(safe-area-inset-right)
      env(safe-area-inset-bottom) env(safe-area-inset-left);
    &:before {
      content: " ";
      position: absolute;
      display: block;
      width: 100%;
      height: 100%;
      background: url("/noise_50.jpg");
      background-size: 125px;
      mix-blend-mode: multiply;
      opacity: 0.5;
      z-index: -1;
    }
  }

  .app-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 16px;
    background-color: #1e1e24;
    color: #fff;
    border-bottom: 2px solid #2a2a35;
    z-index: 100;
  }

  .toolbar-brand {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .retro-tag {
    font-size: 0.85rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    color: #ffd859;
    font-family: monospace;
  }

  .badge {
    font-size: 0.65rem;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    letter-spacing: 0.05em;
  }

  .badge.embedded {
    background-color: #ff3e00;
    color: #fff;
  }

  .toolbar-fields {
    display: flex;
    gap: 8px;
    flex: 1;
    max-width: 400px;
  }

  .toolbar-input {
    flex: 1;
    background-color: #2a2a35;
    border: 1px solid #3b3b4d;
    color: #fff;
    padding: 6px 10px;
    border-radius: 4px;
    font-size: 0.85rem;
    &:focus {
      border-color: #ffd859;
    }
    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }

  .toolbar-actions {
    display: flex;
    gap: 8px;
  }

  .toolbar-btn {
    background-color: #2a2a35;
    border: 1px solid #3b3b4d;
    color: #ccc;
    padding: 6px 12px;
    border-radius: 4px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover:not(:disabled) {
      background-color: #3b3b4d;
      color: #fff;
      border-color: #ffd859;
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  .toolbar-btn.primary {
    background-color: #ffd859;
    border-color: #ffd859;
    color: #1e1e24;

    &:hover:not(:disabled) {
      background-color: #ffe48a;
    }
  }

  .align {
    display: flex;
    justify-content: center;
    align-items: center;
    flex: 1;
    overflow: hidden;
  }
</style>
