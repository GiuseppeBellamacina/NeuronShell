<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	let terminalEl: HTMLDivElement;
	let ws: WebSocket | null = null;
	let term: any = null;

	onMount(() => {
		initTerminal();
	});

	async function initTerminal() {
		const { Terminal } = await import('@xterm/xterm');
		const { FitAddon } = await import('@xterm/addon-fit');

		// Import xterm CSS
		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = 'https://cdn.jsdelivr.net/npm/@xterm/xterm@6.0.0/css/xterm.min.css';
		document.head.appendChild(link);

		term = new Terminal({
			cursorBlink: true,
			cursorStyle: 'bar',
			fontSize: 13,
			fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
			theme: {
				background: '#0a0a12',
				foreground: '#e0e0f0',
				cursor: '#00f0ff',
				cursorAccent: '#0a0a12',
				selectionBackground: '#00f0ff33',
				selectionForeground: '#ffffff',
				black: '#0a0a12',
				red: '#ff003c',
				green: '#39ff14',
				yellow: '#ffe600',
				blue: '#00f0ff',
				magenta: '#ff00aa',
				cyan: '#00f0ff',
				white: '#e0e0f0',
				brightBlack: '#55556a',
				brightRed: '#ff4466',
				brightGreen: '#66ff44',
				brightYellow: '#ffee44',
				brightBlue: '#44ffff',
				brightMagenta: '#ff44cc',
				brightCyan: '#44ffff',
				brightWhite: '#ffffff'
			},
			allowProposedApi: true,
			scrollback: 5000
		});

		const fitAddon = new FitAddon();
		term.loadAddon(fitAddon);

		// Try loading WebGL addon
		try {
			const { WebglAddon } = await import('@xterm/addon-webgl');
			const webgl = new WebglAddon();
			term.loadAddon(webgl);
		} catch {
			// WebGL not available, software renderer is fine
		}

		term.open(terminalEl);
		fitAddon.fit();

		// WebSocket connection
		const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		ws = new WebSocket(`${proto}//${window.location.host}/ws/terminal`);

		ws.binaryType = 'arraybuffer';

		ws.onopen = () => {
			// Send initial resize
			ws?.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
		};

		ws.onmessage = (event) => {
			if (typeof event.data === 'string') {
				try {
					const msg = JSON.parse(event.data);
					if (msg.type === 'error') {
						term.writeln(`\r\n\x1b[31m[ERROR] ${msg.message}\x1b[0m`);
						return;
					}
					if (msg.type === 'shell-closed') {
						term.writeln('\r\n\x1b[33m[Session ended]\x1b[0m');
						return;
					}
				} catch {
					// Not JSON, treat as terminal data
				}
				term.write(event.data);
			} else {
				term.write(new Uint8Array(event.data));
			}
		};

		ws.onclose = () => {
			term.writeln('\r\n\x1b[33m[Connection closed]\x1b[0m');
		};

		// Terminal → WebSocket
		term.onData((data: string) => {
			if (ws?.readyState === WebSocket.OPEN) {
				ws.send(data);
			}
		});

		// Handle resize
		const resizeObserver = new ResizeObserver(() => {
			fitAddon.fit();
			if (ws?.readyState === WebSocket.OPEN) {
				ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
			}
		});
		resizeObserver.observe(terminalEl);
	}

	onDestroy(() => {
		ws?.close();
		term?.dispose();
	});
</script>

<div class="flex-1 bg-bg-deep" bind:this={terminalEl}></div>
