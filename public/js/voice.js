// Voice chat: WebRTC audio mesh between the room members who joined voice.
// The game server only relays signaling messages ({t:'rtc'}); audio flows browser to browser.

export class VoiceChat {
  constructor(send, onChange) {
    this.send = send;
    this.onChange = onChange; // UI refresh callback
    this.on = false;
    this.muted = false;
    this.stream = null;
    this.peers = new Map(); // id -> { pc, audio, analyser, level }
    this.myId = null;
    this.iceServers = null;
    this.ctx = null;
    this.localLevel = 0;
    this.meter = setInterval(() => this.measure(), 120);
  }

  get supported() {
    return !!(window.isSecureContext && navigator.mediaDevices?.getUserMedia && window.RTCPeerConnection);
  }

  async join() {
    if (this.on) return;
    if (!this.supported) throw new Error('O chat de voz exige HTTPS (ou acessar por localhost).');
    if (!this.iceServers) {
      try {
        this.iceServers = (await (await fetch('/config')).json()).iceServers;
      } catch {
        this.iceServers = [];
      }
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    this.ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    this.localAnalyser = this.analyse(this.stream);
    this.on = true;
    this.applyMute();
    this.send({ t: 'voice', on: true, muted: this.muted });
    this.onChange();
  }

  leave() {
    if (!this.on) return;
    this.on = false;
    for (const id of [...this.peers.keys()]) this.closePeer(id);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.send({ t: 'voice', on: false });
    this.onChange();
  }

  toggleMute() {
    this.muted = !this.muted;
    this.applyMute();
    if (this.on) this.send({ t: 'voice', on: true, muted: this.muted });
    this.onChange();
  }

  applyMute() {
    this.stream?.getAudioTracks().forEach((t) => (t.enabled = !this.muted));
  }

  // Called on every room update: connect to new voice members, drop the ones who left.
  sync(myId, members) {
    this.myId = myId;
    if (!this.on) return;
    const voiceIds = new Set(members.filter((m) => m.voice && m.id !== myId).map((m) => m.id));
    for (const id of [...this.peers.keys()]) if (!voiceIds.has(id)) this.closePeer(id);
    // The peer with the smaller id makes the offer, so two peers never offer at the same time.
    for (const id of voiceIds) if (!this.peers.has(id) && myId < id) this.call(id);
  }

  makePeer(id) {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers || [] });
    const peer = { pc, audio: new Audio(), analyser: null, level: 0 };
    peer.audio.autoplay = true;
    this.stream.getTracks().forEach((t) => pc.addTrack(t, this.stream));
    pc.onicecandidate = (e) => e.candidate && this.send({ t: 'rtc', to: id, data: { ice: e.candidate.toJSON() } });
    pc.ontrack = (e) => {
      const s = e.streams[0] || new MediaStream([e.track]);
      // Chrome only feeds a remote WebRTC stream into WebAudio while a media element
      // is playing it, so the element plays muted and WebAudio does the real output.
      peer.audio.muted = true;
      peer.audio.srcObject = s;
      peer.audio.play().catch(() => {});
      try {
        const src = this.ctx.createMediaStreamSource(s);
        peer.gain = this.ctx.createGain();
        peer.pan = this.ctx.createStereoPanner();
        src.connect(peer.gain).connect(peer.pan).connect(this.ctx.destination);
        peer.analyser = this.ctx.createAnalyser();
        peer.analyser.fftSize = 256;
        src.connect(peer.analyser);
      } catch {
        peer.audio.muted = false; // no WebAudio: plain playback, no proximity
      }
      this.onChange();
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        this.closePeer(id);
        this.onChange();
      }
    };
    this.peers.set(id, peer);
    return peer;
  }

  async call(id) {
    const peer = this.makePeer(id);
    const offer = await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offer);
    this.send({ t: 'rtc', to: id, data: { sdp: peer.pc.localDescription.toJSON() } });
  }

  async signal(from, data) {
    if (!this.on) return;
    try {
      if (data.sdp) {
        let peer = this.peers.get(from);
        if (data.sdp.type === 'offer') {
          if (peer) this.closePeer(from);
          peer = this.makePeer(from);
          await peer.pc.setRemoteDescription(data.sdp);
          const answer = await peer.pc.createAnswer();
          await peer.pc.setLocalDescription(answer);
          this.send({ t: 'rtc', to: from, data: { sdp: peer.pc.localDescription.toJSON() } });
          for (const c of peer.pendingIce || []) await peer.pc.addIceCandidate(c);
        } else if (peer) {
          await peer.pc.setRemoteDescription(data.sdp);
          for (const c of peer.pendingIce || []) await peer.pc.addIceCandidate(c);
        }
      } else if (data.ice) {
        const peer = this.peers.get(from);
        if (!peer) return;
        if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(data.ice);
        else (peer.pendingIce ||= []).push(data.ice);
      }
    } catch (err) {
      console.warn('voz: falha na negociação', err);
    }
  }

  // Proximity voice: the farther the speaker's avatar, the lower the volume; the stereo
  // pan follows the direction relative to where my camera is looking.
  // listener = {x, z, yaw} or null (lobby / spectator / proximity off: full volume).
  updateSpatial(listener, positions) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime;
    for (const [id, p] of this.peers) {
      if (!p.gain) continue;
      let g = 1;
      let pan = 0;
      const pos = positions.get(id);
      if (listener && pos) {
        const dx = pos.x - listener.x;
        const dz = pos.z - listener.z;
        const d = Math.hypot(dx, dz);
        g = d <= 4 ? 1 : Math.max(0, 1 - (d - 4) / 30) ** 1.4;
        if (d > 0.5) {
          // Right of the listener is (-cos yaw, sin yaw).
          const rx = -Math.cos(listener.yaw);
          const rz = Math.sin(listener.yaw);
          pan = Math.max(-1, Math.min(1, ((dx * rx + dz * rz) / d) * 0.8));
        }
      }
      p.distGain = g;
      p.gain.gain.setTargetAtTime(g, t, 0.1);
      p.pan.pan.setTargetAtTime(pan, t, 0.1);
    }
  }

  closePeer(id) {
    const p = this.peers.get(id);
    if (!p) return;
    p.pc.close();
    p.audio.srcObject = null;
    this.peers.delete(id);
  }

  analyse(stream) {
    try {
      const src = this.ctx.createMediaStreamSource(stream);
      const an = this.ctx.createAnalyser();
      an.fftSize = 256;
      src.connect(an);
      return an;
    } catch {
      return null;
    }
  }

  level(an) {
    if (!an) return 0;
    const buf = new Uint8Array(an.fftSize);
    an.getByteTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += (v - 128) * (v - 128);
    return Math.sqrt(sum / buf.length) / 128;
  }

  measure() {
    if (!this.on) return;
    if (this.ctx?.state === 'suspended') this.ctx.resume();
    let changed = false;
    const me = this.muted ? 0 : this.level(this.localAnalyser);
    if (me > 0.04 !== this.localLevel > 0.04) changed = true;
    this.localLevel = me;
    for (const p of this.peers.values()) {
      const l = this.level(p.analyser);
      if (l > 0.04 !== p.level > 0.04) changed = true;
      p.level = l;
    }
    if (changed) this.onChange();
  }

  speaking(id) {
    if (id === this.myId) return this.localLevel > 0.04;
    return (this.peers.get(id)?.level || 0) > 0.04;
  }

  connected(id) {
    const s = this.peers.get(id)?.pc.connectionState;
    return s === 'connected';
  }
}
